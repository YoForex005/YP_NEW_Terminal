import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { syncBackendAccountBalance } from "@/lib/server/backend-balance-sync";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import { normalizeSnapshotTransactions } from "@/lib/server/snapshot-format";
import {
  transferWalletFunds,
  WalletBackendError,
} from "@/lib/server/wallet-backend";
import {
  resolveWalletIdempotency,
  walletIdempotencyResponseHeaders,
} from "@/lib/server/wallet-idempotency";
import {
  fetchBackendDashboardSnapshot,
} from "@/lib/server/accounts-backend";

interface TransferBody {
  amount?: number;
  from?: "wallet" | "mt5";
  to?: "wallet" | "mt5";
  accountId?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TransferBody;
  try {
    body = (await request.json()) as TransferBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  if ((body.from !== "wallet" && body.from !== "mt5") || (body.to !== "wallet" && body.to !== "mt5")) {
    return NextResponse.json(
      { error: "Transfer direction is invalid." },
      { status: 400 },
    );
  }

  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }

  if (body.from === body.to) {
    return NextResponse.json(
      { error: "Transfer direction is invalid." },
      { status: 400 },
    );
  }

  const [backendSnapshot, localSnapshot] = await Promise.all([
    fetchBackendDashboardSnapshot(auth.user.id),
    getSnapshotForUser(auth.user.id),
  ]);
  const walletBalances = backendSnapshot?.wallets ?? localSnapshot.wallets;
  const account =
    backendSnapshot?.tradingAccounts.find((entry) => entry.id === body.accountId) ??
    localSnapshot.tradingAccounts.find((entry) => entry.id === body.accountId);

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 400 });
  }

  if (account.type === "Demo" && body.from === "mt5") {
    return NextResponse.json(
      { error: "Demo funds cannot be transferred back to wallet." },
      { status: 400 },
    );
  }

  const currency: "USD" | "EUR" = account.currency === "EUR" ? "EUR" : "USD";

  if (body.from === "wallet" && walletBalances[currency] < amount) {
    return NextResponse.json(
      { error: "Insufficient wallet balance." },
      { status: 400 },
    );
  }

  if (body.from === "mt5" && account.balance < amount) {
    return NextResponse.json(
      { error: "Insufficient account balance." },
      { status: 400 },
    );
  }

  const login = account.credentials?.login?.trim() || account.accountNumber?.trim() || "";
  if (!/^\d+$/.test(login)) {
    return NextResponse.json(
      { error: "Invalid MT5 account login." },
      { status: 400 },
    );
  }

  let transferResult: Awaited<ReturnType<typeof transferWalletFunds>>;
  const transferPayload = {
    ownerId: auth.user.id,
    login,
    amount,
    currency,
    from: body.from,
    to: body.to,
  };
  const idempotency = resolveWalletIdempotency({
    auth,
    request,
    operation: "transfer",
    payload: transferPayload,
    requestBody: body as Record<string, unknown>,
  });
  try {
    transferResult = await transferWalletFunds(transferPayload, {
      idempotencyKey: idempotency.key,
    });
  } catch (error) {
    if (error instanceof WalletBackendError) {
      const responseIdempotency = {
        ...idempotency,
        key: error.idempotencyKey ?? idempotency.key,
      };
      const idempotencyReplayed = error.idempotencyReplayed ?? false;

      return NextResponse.json(
        {
          ok: false,
          message: error.message,
          code: error.code,
          details: error.details,
          idempotencyKey: responseIdempotency.key,
          idempotencyReplayed,
        },
        {
          status: error.status,
          headers: walletIdempotencyResponseHeaders(
            responseIdempotency,
            idempotencyReplayed,
          ),
        },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        message: "Wallet backend request failed.",
        idempotencyKey: idempotency.key,
        idempotencyReplayed: false,
      },
      {
        status: 502,
        headers: walletIdempotencyResponseHeaders(idempotency, false),
      },
    );
  }

  const responseIdempotency = {
    ...idempotency,
    key: transferResult.idempotencyKey ?? idempotency.key,
  };
  const idempotencyReplayed = transferResult.idempotencyReplayed ?? false;

  try {
    const expectedBalance =
      body.to === "mt5"
        ? account.balance + amount
        : Math.max(0, account.balance - amount);
    await syncBackendAccountBalance(login, {
      attempts: 12,
      delayMs: 5000,
      accept: (result) =>
        body.to === "mt5"
          ? result.balance >= expectedBalance
          : result.balance <= expectedBalance,
    });
  } catch (error) {
    console.warn(
      `[api/private/wallet/transfer] balance sync failed for MT5 login ${login}`,
      error instanceof Error ? error.message : error,
    );
  }

  const refreshedBackendSnapshot = await fetchBackendDashboardSnapshot(auth.user.id);
  if (refreshedBackendSnapshot) {
    return NextResponse.json(
      {
        ok: true,
        message:
          transferResult.data.operation.status === "pending"
            ? "Transfer submitted and is pending broker confirmation."
            : "Transfer successful!",
        snapshot: normalizeSnapshotTransactions(refreshedBackendSnapshot),
        idempotencyKey: responseIdempotency.key,
        idempotencyReplayed,
      },
      {
        status: 200,
        headers: walletIdempotencyResponseHeaders(
          responseIdempotency,
          idempotencyReplayed,
        ),
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message:
        transferResult.data.operation.status === "pending"
          ? "Transfer submitted and is pending broker confirmation."
          : "Transfer successful!",
      snapshot: normalizeSnapshotTransactions(localSnapshot),
      idempotencyKey: responseIdempotency.key,
      idempotencyReplayed,
    },
    {
      status: 200,
      headers: walletIdempotencyResponseHeaders(
        responseIdempotency,
        idempotencyReplayed,
      ),
    },
  );
}
