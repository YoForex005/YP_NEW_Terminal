import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import { updateUserSnapshot } from "@/lib/server/database";
import {
  AccountsBackendError,
  extractMt5LoginFromAccount,
  requestAccountsBackend,
} from "@/lib/server/accounts-backend";
import type { TradingAccount } from "@/types/dashboard";

interface RouteContext {
  params: {
    accountId: string;
  };
}

interface ModeRequestBody {
  mode: "live" | "demo";
}

const findAccountByIdOrLogin = (
  accounts: TradingAccount[],
  accountId: string,
): TradingAccount | null => {
  const trimmed = accountId.trim();
  const stripped = trimmed.replace(/^mt5-/, "");
  return (
    accounts.find(
      (a) =>
        a.id === trimmed ||
        a.accountNumber === stripped ||
        extractMt5LoginFromAccount(a) === stripped,
    ) ?? null
  );
};

/**
 * PATCH /api/private/accounts/:accountId/mode
 *
 * Converts an account between demo and live by changing its MT5 group.
 * Requires the C++ backend (MT5 Manager SDK) to be running.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  let body: ModeRequestBody;
  try {
    body = (await request.json()) as ModeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { mode } = body;
  if (mode !== "live" && mode !== "demo") {
    return NextResponse.json(
      { error: "mode must be 'live' or 'demo'.", code: "INVALID_MODE" },
      { status: 400 },
    );
  }

  const localSnapshot = await getSnapshotForUser(auth.user.id);
  const account = findAccountByIdOrLogin(localSnapshot.tradingAccounts, accountId);

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (account.platform !== "mt5") {
    return NextResponse.json(
      { error: "Mode conversion is only supported for MT5 accounts." },
      { status: 400 },
    );
  }

  const login = extractMt5LoginFromAccount(account);
  if (!login) {
    return NextResponse.json(
      { error: "Invalid MT5 login number on account record." },
      { status: 422 },
    );
  }

  try {
    await requestAccountsBackend(`/accounts/${encodeURIComponent(login)}/mode`, {
      method: "PATCH",
      body: {
        mode,
        ownerId: auth.user.id,
        brokerId: auth.user.brokerId,
      },
    });

    // Update local snapshot to reflect the new mode
    await updateUserSnapshot(auth.user.id, (current) => {
      current.tradingAccounts = current.tradingAccounts.map((a) => {
        const aLogin = extractMt5LoginFromAccount(a);
        if (a.id === account.id || (aLogin && aLogin === login)) {
          return { ...a, type: mode === "live" ? "Live" : "Demo" };
        }
        return a;
      });
      return current;
    });

    return NextResponse.json({
      ok: true,
      message: `Account successfully converted to ${mode === "live" ? "Live" : "Demo"}.`,
      mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof AccountsBackendError) {
      return NextResponse.json(
        { error: message, code: error.code ?? "BACKEND_ERROR" },
        { status: error.status >= 400 ? error.status : 502 },
      );
    }

    console.error("[api/private/accounts/[accountId]/mode] PATCH failed", {
      userId: auth.user.id,
      accountId,
      error: message,
    });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
