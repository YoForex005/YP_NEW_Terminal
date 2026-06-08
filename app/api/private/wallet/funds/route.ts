import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import { fetchBackendDashboardSnapshot } from "@/lib/server/accounts-backend";
import { normalizeSnapshotTransactions } from "@/lib/server/snapshot-format";
import {
  submitWalletFunds,
  WalletBackendError,
} from "@/lib/server/wallet-backend";
import {
  resolveWalletIdempotency,
  walletIdempotencyResponseHeaders,
} from "@/lib/server/wallet-idempotency";
import type { CurrencyCode, PaymentMethod } from "@/types/dashboard";

interface SubmitFundsBody {
  type?: "deposit" | "withdraw";
  amount?: number;
  currency?: CurrencyCode;
  method?: PaymentMethod;
  cryptoCurrency?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubmitFundsBody;
  try {
    body = (await request.json()) as SubmitFundsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.type !== "deposit" && body.type !== "withdraw") {
    return NextResponse.json(
      { error: "Type must be 'deposit' or 'withdraw'." },
      { status: 400 },
    );
  }

  const amount = Number(body.amount ?? 0);
  const currency: CurrencyCode = body.currency === "EUR" ? "EUR" : "USD";
  const method: PaymentMethod = body.method === "card" ? "card" : "crypto";

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter a valid amount greater than 0." },
      { status: 400 },
    );
  }

  const fundsPayload = {
    ownerId: auth.user.id,
    type: body.type,
    amount,
    currency,
    method,
    cryptoCurrency: body.cryptoCurrency || "BTC",
  };
  const idempotency = resolveWalletIdempotency({
    auth,
    request,
    operation: "funds",
    payload: fundsPayload,
    requestBody: body as Record<string, unknown>,
  });

  try {
    const fundsResponse = await submitWalletFunds(fundsPayload, {
      idempotencyKey: idempotency.key,
    });

    const backendSnapshot = await fetchBackendDashboardSnapshot(auth.user.id);
    const checkout = fundsResponse.data.checkout;
    const responseIdempotency = {
      ...idempotency,
      key: fundsResponse.idempotencyKey ?? idempotency.key,
    };
    const idempotencyReplayed = fundsResponse.idempotencyReplayed ?? false;

    return NextResponse.json(
      {
        ok: true,
        message: `${body.type === "deposit" ? "Deposit" : "Withdrawal"} request submitted successfully.`,
        snapshot: normalizeSnapshotTransactions(backendSnapshot || (await getSnapshotForUser(auth.user.id))),
        idempotencyKey: responseIdempotency.key,
        idempotencyReplayed,
        data: {
          checkout,
        },
      },
      {
        status: 200,
        headers: walletIdempotencyResponseHeaders(
          responseIdempotency,
          idempotencyReplayed,
        ),
      },
    );
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


}

