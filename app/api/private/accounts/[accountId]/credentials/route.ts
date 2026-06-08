import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import { createWebtraderToken } from "@/lib/server/webtrader-token";
import { updateUserSnapshot } from "@/lib/server/database";
import {
  AccountsBackendError,
  fetchBackendDashboardSnapshot,
  extractMt5LoginFromAccount,
  requestAccountsBackend,
} from "@/lib/server/accounts-backend";
import type { TradingAccount, TradingAccountCredentials } from "@/types/dashboard";

interface RouteContext {
  params: {
    accountId: string;
  };
}

interface CredentialsRequestBody {
  tradingPassword?: string;
}

type TradingAccountWithBrokerId = TradingAccount & {
  brokerId?: string;
  broker_id?: string;
  credentials?: TradingAccountCredentials & {
    brokerId?: string;
    broker_id?: string;
  };
};

const findAccountByIdOrLogin = (
  accounts: TradingAccount[],
  accountId: string,
): TradingAccount | null => {
  const trimmedAccountId = accountId.trim();
  const strippedAccountId = trimmedAccountId.replace(/^mt5-/, "");

  const directMatch =
    accounts.find((account) => account.id === trimmedAccountId) ?? null;
  if (directMatch) {
    return directMatch;
  }

  return (
    accounts.find((account) => {
      const login = extractMt5LoginFromAccount(account);
      return Boolean(login && login === strippedAccountId);
    }) ?? null
  );
};

const resolveAccountForToken = async (
  userId: string,
  accountId: string,
): Promise<{
  localSnapshot: Awaited<ReturnType<typeof getSnapshotForUser>>;
  account: TradingAccount | null;
}> => {
  const localSnapshot = await getSnapshotForUser(userId);
  const localAccount = findAccountByIdOrLogin(localSnapshot.tradingAccounts, accountId);
  if (localAccount) {
    return { localSnapshot, account: localAccount };
  }

  const backendSnapshot = await fetchBackendDashboardSnapshot(userId);
  const backendAccount = backendSnapshot
    ? findAccountByIdOrLogin(backendSnapshot.tradingAccounts, accountId)
    : null;

  if (!backendAccount) {
    return { localSnapshot, account: null };
  }

  const backendLogin = extractMt5LoginFromAccount(backendAccount);
  const localByLogin =
    backendLogin
      ? localSnapshot.tradingAccounts.find((account) => {
          const login = extractMt5LoginFromAccount(account);
          return Boolean(login && login === backendLogin);
        }) ?? null
      : null;

  if (!localByLogin) {
    return { localSnapshot, account: backendAccount };
  }

  return {
    localSnapshot,
    account: {
      ...backendAccount,
      ...localByLogin,
      credentials: localByLogin.credentials ?? backendAccount.credentials,
    },
  };
};

const buildStoredCredentialsAccount = (
  account: TradingAccount,
  login: string,
  server: string,
  tradingPassword: string,
): TradingAccount => {
  const existingCredentials = account.credentials;
  const nextCredentials: TradingAccountCredentials = {
    login,
    server,
    tradingPassword,
    investorPassword: existingCredentials?.investorPassword ?? "",
    generatedAt: new Date().toISOString(),
    source: "broker",
  };

  return {
    ...account,
    id: account.id || `mt5-${login}`,
    accountNumber: account.accountNumber || login,
    platform: "mt5",
    serverIp: account.serverIp?.trim() || server,
    credentials: nextCredentials,
  };
};

const persistAccountCredentials = async (
  userId: string,
  account: TradingAccount,
  login: string,
  server: string,
  tradingPassword: string,
): Promise<void> => {
  await updateUserSnapshot(userId, (current) => {
    const nextAccounts = [...current.tradingAccounts];
    const nextAccount = buildStoredCredentialsAccount(
      account,
      login,
      server,
      tradingPassword,
    );

    const existingIndex = nextAccounts.findIndex((entry) => {
      if (entry.id === nextAccount.id) {
        return true;
      }

      const entryLogin = extractMt5LoginFromAccount(entry);
      return Boolean(entryLogin && entryLogin === login);
    });

    if (existingIndex >= 0) {
      nextAccounts[existingIndex] = {
        ...nextAccounts[existingIndex],
        ...nextAccount,
        credentials: nextAccount.credentials,
      };
    } else {
      nextAccounts.unshift(nextAccount);
    }

    current.tradingAccounts = nextAccounts;
    return current;
  });
};

const resolveTokenFields = (account: TradingAccount) => {
  const login =
    account.credentials?.login?.trim() || account.accountNumber?.trim() || "";
  const server =
    account.credentials?.server?.trim() || account.serverIp?.trim() || "";
  const tradingPassword = account.credentials?.tradingPassword ?? "";

  return { login, server, tradingPassword };
};

const resolveBrokerId = (account: TradingAccount): string | undefined => {
  const accountWithBrokerId = account as TradingAccountWithBrokerId;
  const brokerId =
    accountWithBrokerId.brokerId?.trim() ||
    accountWithBrokerId.broker_id?.trim() ||
    accountWithBrokerId.credentials?.brokerId?.trim() ||
    accountWithBrokerId.credentials?.broker_id?.trim() ||
    "";
  return brokerId || undefined;
};

const assertBrokerAccountExists = async (login: string): Promise<void> => {
  try {
    await requestAccountsBackend(`/accounts/${encodeURIComponent(login)}/balance`, {
      method: "GET",
      timeoutMs: 20_000,
    });
  } catch (error) {
    if (error instanceof AccountsBackendError && error.status === 404) {
      throw new AccountsBackendError(
        404,
        "This MT5 account was not found on the broker server.",
        { code: "MT5_ACCOUNT_NOT_FOUND" },
      );
    }

    throw error;
  }
};

const buildInternalRouteError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  if (/WEBTRADER_TOKEN_SECRET/i.test(message)) {
    return {
      status: 500,
      body: {
        error:
          "Terminal auto-login is not configured. Set WEBTRADER_TOKEN_SECRET in both frontend and backend env files, then restart the servers.",
        code: "WEBTRADER_CONFIG_ERROR",
      },
      logMessage: message,
    };
  }

  return {
    status: 500,
    body: { error: "Internal Server Error" },
    logMessage: message,
  };
};

/**
 * GET /api/private/accounts/:accountId/credentials
 *
 * Returns a short-lived, HMAC-signed webtrader session token for the given
 * MT5 account. The frontend passes this token to the WebSocket server; the
 * backend validates the signature and authenticates MT5 internally — the raw
 * MT5 trading password is never sent over the WebSocket.
 *
 * Security: Protected by crm_session cookie. Only works for accounts owned by
 * the logged-in user. Token expires after 60 seconds.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  try {
    const { account } = await resolveAccountForToken(auth.user.id, accountId);

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (account.platform !== "mt5") {
      return NextResponse.json(
        { error: "Terminal auto-login is only supported for MT5 accounts." },
        { status: 400 },
      );
    }

    if (account.status === "Archived") {
      return NextResponse.json(
        { error: "Cannot open terminal for an archived account." },
        { status: 400 },
      );
    }

    const { login, server } = resolveTokenFields(account);

    if (!login || !/^\d+$/.test(login)) {
      return NextResponse.json(
        { error: "Invalid MT5 login number on account record." },
        { status: 422 },
      );
    }

    await assertBrokerAccountExists(login);

    // Generate a short-lived signed token; Manager SDK validates the broker account.
    const token = createWebtraderToken({
      userId: auth.user.id,
      accountId: account.id || `mt5-${login}`,
      login: Number(login),
      brokerId: resolveBrokerId(account),
      server,
      tradingPassword: "",
    });

    return NextResponse.json({ ok: true, token });
  } catch (error) {
    if (error instanceof AccountsBackendError && error.status === 404) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code ?? "MT5_ACCOUNT_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    const routeError = buildInternalRouteError(error);
    console.error("[api/private/accounts/[accountId]/credentials] GET failed", {
      userId: auth.user.id,
      accountId,
      error: routeError.logMessage,
    });
    return NextResponse.json(routeError.body, { status: routeError.status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  let body: CredentialsRequestBody;
  try {
    body = (await request.json()) as CredentialsRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tradingPassword = body.tradingPassword?.trim() ?? "";
  if (!tradingPassword) {
    return NextResponse.json(
      {
        error: "Trading password is required.",
        code: "PASSWORD_REQUIRED",
      },
      { status: 400 },
    );
  }

  try {
    const { account } = await resolveAccountForToken(auth.user.id, accountId);
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    if (account.platform !== "mt5") {
      return NextResponse.json(
        { error: "Terminal auto-login is only supported for MT5 accounts." },
        { status: 400 },
      );
    }

    if (account.status === "Archived") {
      return NextResponse.json(
        { error: "Cannot open terminal for an archived account." },
        { status: 400 },
      );
    }

    const { login, server } = resolveTokenFields(account);
    if (!login || !/^\d+$/.test(login)) {
      return NextResponse.json(
        { error: "Invalid MT5 login number on account record." },
        { status: 422 },
      );
    }

    const verification = await requestAccountsBackend<{
      login: number;
      server?: string;
      group?: string;
      name?: string;
      currency?: string;
    }>("/accounts/verify-password", {
      method: "POST",
      body: {
        login,
        password: tradingPassword,
        investorPassword: false,
      },
    });

    const resolvedServer =
      verification.server?.trim() || server || account.serverIp?.trim() || "";

    await persistAccountCredentials(
      auth.user.id,
      account,
      login,
      resolvedServer,
      tradingPassword,
    );

    const token = createWebtraderToken({
      userId: auth.user.id,
      accountId: account.id || `mt5-${login}`,
      login: Number(login),
      brokerId: resolveBrokerId(account),
      server: resolvedServer,
      tradingPassword: "",
    });

    return NextResponse.json({ ok: true, token });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof AccountsBackendError && error.status === 401) {
      console.error("[api/private/accounts/[accountId]/credentials] POST failed", {
        userId: auth.user.id,
        accountId,
        error: message,
      });

      return NextResponse.json(
        { error: "Invalid MT5 login or password.", code: "INVALID_TRADING_PASSWORD" },
        { status: 401 },
      );
    }

    if (/invalid mt5 login or password/i.test(message)) {
      console.error("[api/private/accounts/[accountId]/credentials] POST failed", {
        userId: auth.user.id,
        accountId,
        error: message,
      });

      return NextResponse.json(
        { error: message, code: "INVALID_TRADING_PASSWORD" },
        { status: 401 },
      );
    }

    const routeError = buildInternalRouteError(error);

    console.error("[api/private/accounts/[accountId]/credentials] POST failed", {
      userId: auth.user.id,
      accountId,
      error: routeError.logMessage,
    });

    return NextResponse.json(routeError.body, { status: routeError.status });
  }
}
