import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import {
  AccountsBackendError,
  extractMt5LoginFromAccount,
  fetchBackendDashboardSnapshot,
  requestAccountsBackend,
  withBrokerContext,
} from "@/lib/server/accounts-backend";
import {
  getUserSnapshotWithServerIp,
  updateUserSnapshot,
  getFullAccountsFromPg,
} from "@/lib/server/database";
import { createWebtraderTokenWithExpiry } from "@/lib/server/webtrader-token";
import { resolveBackendEnvValue } from "@/lib/server/backend-env";
import type { TradingAccount, TradingAccountCredentials } from "@/types/dashboard";

interface RouteContext {
  params: Promise<{
    accountId: string;
  }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface BrokerScopedUser {
  id: string;
  brokerId?: string;
}

interface TerminalSessionRequestBody {
  tradingPassword?: string;
  password?: string;
}

interface VerifiedPasswordResponse {
  login: number;
  server?: string;
  group?: string;
  name?: string;
  currency?: string;
}

interface ResolvedTerminalAccount {
  account: TradingAccount;
  accountId: string;
  login: string;
  brokerId?: string;
  server: string;
  group?: string;
  storedTradingPassword: string;
  metadataSource: TerminalAccountMetadataSource;
}

type TerminalAccountResolution =
  | { ok: true; value: ResolvedTerminalAccount }
  | { ok: false; response: NextResponse };

type TerminalAccountMetadataSource =
  | "local-snapshot"
  | "backend-snapshot"
  | "pg-accounts";

const TERMINAL_SESSION_AUTH_TIMEOUT_MS = 1_500;
const TERMINAL_SESSION_BODY_TIMEOUT_MS = 750;
// Parallel fetch: local DB + backend snapshot run concurrently, not sequentially.
// Worst-case: backend snapshot (2.5s) + PG fallback (1.5s) = 4s total.
const TERMINAL_SESSION_ACCOUNT_RESOLUTION_TIMEOUT_MS = 5_000;
const TERMINAL_SESSION_BACKEND_TIMEOUT_MS = 6_000;
const TERMINAL_SESSION_BACKEND_SNAPSHOT_TIMEOUT_MS = 2_500; // reduced from 4s
const TERMINAL_SESSION_PG_ACCOUNTS_TIMEOUT_MS = 1_500;      // reduced from 2s
const TERMINAL_SESSION_VERIFY_PHASE_TIMEOUT_MS = 6_500;
const TERMINAL_SESSION_PERSIST_TIMEOUT_MS = 1_000;
const TERMINAL_SESSION_TOKEN_SAFETY_WINDOW_MS = 75_000;

const TERMINAL_SESSION_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

class TerminalSessionTimeoutError extends Error {
  public constructor(
    public readonly phase: string,
    public readonly timeoutMs: number,
    public readonly elapsedMs: number,
  ) {
    super(`${phase} timed out after ${timeoutMs}ms.`);
    this.name = "TerminalSessionTimeoutError";
  }
}

const isTerminalSessionTimeoutError = (
  error: unknown,
): error is TerminalSessionTimeoutError => error instanceof TerminalSessionTimeoutError;

const withTerminalSessionPhaseTimeout = async <T,>(
  phase: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new TerminalSessionTimeoutError(phase, timeoutMs, Date.now() - startedAt));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildTerminalSessionTimeoutResponse = (error: TerminalSessionTimeoutError) =>
  NextResponse.json(
    {
      error: "Terminal session request timed out. Please retry.",
      code: "TERMINAL_SESSION_TIMEOUT",
      phase: error.phase,
    },
    { status: 504, headers: TERMINAL_SESSION_NO_STORE_HEADERS },
  );

const terminalSessionJson = (
  body: Record<string, unknown>,
  init?: { status?: number },
) =>
  NextResponse.json(body, {
    ...init,
    headers: TERMINAL_SESSION_NO_STORE_HEADERS,
  });

type TradingAccountWithGroup = TradingAccount & {
  brokerId?: string;
  broker_id?: string;
  group?: string;
  groupName?: string;
  group_name?: string;
  mt5Group?: string;
  credentials?: TradingAccountCredentials & {
    brokerId?: string;
    broker_id?: string;
    group?: string;
    groupName?: string;
    group_name?: string;
    mt5Group?: string;
  };
};

const firstTrimmed = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
};

const resolveAccountGroup = (account: TradingAccount): string => {
  const accountWithGroup = account as TradingAccountWithGroup;
  return firstTrimmed(
    accountWithGroup.group,
    accountWithGroup.groupName,
    accountWithGroup.group_name,
    accountWithGroup.mt5Group,
    accountWithGroup.credentials?.group,
    accountWithGroup.credentials?.groupName,
    accountWithGroup.credentials?.group_name,
    accountWithGroup.credentials?.mt5Group,
  );
};

const resolveConfiguredTerminalFeedGroup = (): string =>
  firstTrimmed(
    resolveBackendEnvValue("MT5_GROUP_LIVE"),
    process.env.MT5_GROUP_LIVE,
    resolveBackendEnvValue("MT5_GROUP"),
    process.env.MT5_GROUP,
  );

const resolveTerminalAccountGroup = (account: TradingAccount): string =>
  firstTrimmed(
    resolveAccountGroup(account),
    resolveConfiguredTerminalFeedGroup(),
  );

const resolveAccountBrokerId = (account: TradingAccount): string => {
  const accountWithBrokerId = account as TradingAccountWithGroup;
  return firstTrimmed(
    accountWithBrokerId.brokerId,
    accountWithBrokerId.broker_id,
    accountWithBrokerId.credentials?.brokerId,
    accountWithBrokerId.credentials?.broker_id,
  );
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

const fetchBackendDashboardSnapshotForTerminalSession = async (
  user: BrokerScopedUser,
  accountId: string,
) => {
  const startedAt = Date.now();
  const backendSnapshot = await fetchBackendDashboardSnapshot(
    user.id,
    user.brokerId,
    { timeoutMs: TERMINAL_SESSION_BACKEND_SNAPSHOT_TIMEOUT_MS },
  );
  const elapsedMs = Date.now() - startedAt;

  if (!backendSnapshot) {
    console.warn(
      "[api/private/accounts/[accountId]/terminal-session] backend snapshot fallback unavailable",
      {
        userId: user.id,
        brokerId: user.brokerId,
        accountId,
        elapsedMs,
        timeoutMs: TERMINAL_SESSION_BACKEND_SNAPSHOT_TIMEOUT_MS,
      },
    );
  } else if (elapsedMs > TERMINAL_SESSION_BACKEND_SNAPSHOT_TIMEOUT_MS * 0.75) {
    console.warn(
      "[api/private/accounts/[accountId]/terminal-session] backend snapshot fallback slow",
      {
        userId: user.id,
        brokerId: user.brokerId,
        accountId,
        elapsedMs,
        timeoutMs: TERMINAL_SESSION_BACKEND_SNAPSHOT_TIMEOUT_MS,
      },
    );
  }

  return backendSnapshot;
};

const resolveAccountForTerminalSession = async (
  user: BrokerScopedUser,
  accountId: string,
): Promise<{
  localSnapshot: Awaited<ReturnType<typeof getUserSnapshotWithServerIp>>;
  account: TradingAccount | null;
  metadataSource: TerminalAccountMetadataSource | null;
}> => {
  // ── Fast path: local DB ────────────────────────────────────────────────────
  // Most requests hit the local snapshot (already-seen accounts). This is fast
  // (in-process cache or single PG query). Check it first before firing the
  // more expensive backend snapshot fetch.
  const localSnapshot = await getUserSnapshotWithServerIp(user.id);
  const localAccount = findAccountByIdOrLogin(localSnapshot.tradingAccounts, accountId);
  if (localAccount) {
    return { localSnapshot, account: localAccount, metadataSource: "local-snapshot" };
  }

  // ── Parallel fetch: backend snapshot + PG ─────────────────────────────────
  // Local DB missed. Fire backend snapshot and PG accounts queries IN PARALLEL
  // so we take max(backend, pg) time instead of backend + pg time.
  // Whichever finds the account first wins. Both resolve within 2.5s budget.
  const [backendSnapshot, pgAccountsResult] = await Promise.allSettled([
    fetchBackendDashboardSnapshotForTerminalSession(user, accountId),
    withTerminalSessionPhaseTimeout(
      "getFullAccountsFromPg",
      getFullAccountsFromPg(user.id, user.brokerId),
      TERMINAL_SESSION_PG_ACCOUNTS_TIMEOUT_MS,
    ).catch((err) => {
      console.warn(
        "[api/private/accounts/[accountId]/terminal-session] pg accounts fallback failed",
        err instanceof Error ? err.message : err,
      );
      return [] as Awaited<ReturnType<typeof getFullAccountsFromPg>>;
    }),
  ]);

  const resolvedBackendSnapshot =
    backendSnapshot.status === "fulfilled" ? backendSnapshot.value : null;
  const resolvedPgAccounts =
    pgAccountsResult.status === "fulfilled" ? pgAccountsResult.value : [];

  // Check backend snapshot first (richer data, includes credentials)
  const backendAccount = resolvedBackendSnapshot
    ? findAccountByIdOrLogin(resolvedBackendSnapshot.tradingAccounts, accountId)
    : null;

  if (backendAccount) {
    const backendLogin = extractMt5LoginFromAccount(backendAccount);
    const localByLogin = backendLogin
      ? localSnapshot.tradingAccounts.find((account) => {
          const login = extractMt5LoginFromAccount(account);
          return Boolean(login && login === backendLogin);
        }) ?? null
      : null;

    if (!localByLogin) {
      return {
        localSnapshot,
        account: backendAccount,
        metadataSource: "backend-snapshot",
      };
    }

    return {
      localSnapshot,
      account: {
        ...backendAccount,
        ...localByLogin,
        credentials: localByLogin.credentials ?? backendAccount.credentials,
      },
      metadataSource: "backend-snapshot",
    };
  }

  // Check PG accounts (parallel result already available)
  const pgAccount = findAccountByIdOrLogin(resolvedPgAccounts, accountId);
  if (pgAccount) {
    return { localSnapshot, account: pgAccount, metadataSource: "pg-accounts" };
  }

  return {
    localSnapshot,
    account: null,
    metadataSource: null,
  };
};

const buildStoredCredentialsAccount = (
  account: TradingAccount,
  login: string,
  server: string,
  tradingPassword: string,
  group?: string,
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
  const resolvedGroup = firstTrimmed(group, resolveAccountGroup(account));

  const nextAccount: TradingAccount = {
    ...account,
    id: account.id || `mt5-${login}`,
    accountNumber: account.accountNumber || login,
    platform: "mt5",
    serverIp: account.serverIp?.trim() || server,
    credentials: nextCredentials,
  };

  if (!resolvedGroup) {
    return nextAccount;
  }

  const accountWithGroup: TradingAccountWithGroup = {
    ...nextAccount,
    group: resolvedGroup,
  };
  return accountWithGroup;
};

const persistAccountCredentials = async (
  userId: string,
  account: TradingAccount,
  login: string,
  server: string,
  tradingPassword: string,
  group?: string,
): Promise<void> => {
  await updateUserSnapshot(userId, (current) => {
    const nextAccounts = [...current.tradingAccounts];
    const nextAccount = buildStoredCredentialsAccount(
      account,
      login,
      server,
      tradingPassword,
      group,
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

const cacheDiscoveredAccount = (userId: string, resolved: ResolvedTerminalAccount): void => {
  // Fire-and-forget — account was found via backend snapshot but is absent from the local DB.
  // Write it back so the next GET terminal-session skips the 3-second backend fallback.
  const { account, login } = resolved;
  void updateUserSnapshot(userId, (current) => {
    const nextAccounts = [...current.tradingAccounts];
    const nextAccount: TradingAccount = {
      ...account,
      id: account.id || `mt5-${login}`,
      accountNumber: account.accountNumber || login,
      platform: "mt5",
    };
    const existingIndex = nextAccounts.findIndex((entry) => {
      if (entry.id === nextAccount.id) return true;
      const entryLogin = extractMt5LoginFromAccount(entry);
      return Boolean(entryLogin && entryLogin === login);
    });
    if (existingIndex >= 0) {
      nextAccounts[existingIndex] = {
        ...nextAccounts[existingIndex],
        ...nextAccount,
        credentials: nextAccounts[existingIndex].credentials ?? nextAccount.credentials,
      };
    } else {
      nextAccounts.unshift(nextAccount);
    }
    current.tradingAccounts = nextAccounts;
    return current;
  }).catch((err) => {
    console.warn(
      "[api/private/accounts/[accountId]/terminal-session] failed to cache backend-discovered account",
      { userId, login, error: err instanceof Error ? err.message : String(err) },
    );
  });
};

const resolveTerminalFields = (account: TradingAccount) => {
  const login =
    account.credentials?.login?.trim() || account.accountNumber?.trim() || "";
  const server =
    account.credentials?.server?.trim() || account.serverIp?.trim() || "";
  const tradingPassword = account.credentials?.tradingPassword ?? "";
  const group = resolveTerminalAccountGroup(account);
  const brokerId = resolveAccountBrokerId(account);

  return { login, brokerId, server, group, tradingPassword };
};

const resolveTerminalAccount = async (
  user: BrokerScopedUser,
  requestedAccountId: string,
): Promise<TerminalAccountResolution> => {
  const { account, metadataSource } = await resolveAccountForTerminalSession(
    user,
    requestedAccountId,
  );

  if (!account) {
    return {
      ok: false,
      response: terminalSessionJson(
        { error: "Account not found.", code: "ACCOUNT_NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  if (account.platform !== "mt5") {
    return {
      ok: false,
      response: terminalSessionJson(
        {
          error: "Terminal auto-login is only supported for MT5 accounts.",
          code: "UNSUPPORTED_PLATFORM",
        },
        { status: 400 },
      ),
    };
  }

  if (account.status === "Archived") {
    return {
      ok: false,
      response: terminalSessionJson(
        {
          error: "Cannot open terminal for an archived account.",
          code: "ACCOUNT_ARCHIVED",
        },
        { status: 400 },
      ),
    };
  }

  const { login, brokerId, server, group, tradingPassword } = resolveTerminalFields(account);

  if (!login || !/^\d+$/.test(login)) {
    return {
      ok: false,
      response: terminalSessionJson(
        {
          error: "Invalid MT5 login number on account record.",
          code: "INVALID_MT5_LOGIN",
        },
        { status: 422 },
      ),
    };
  }

  return {
    ok: true,
    value: {
      account,
      accountId: `mt5-${login}`,
      login,
      brokerId: brokerId || undefined,
      server,
      group: group || undefined,
      storedTradingPassword: tradingPassword,
      metadataSource: metadataSource ?? "backend-snapshot",
    },
  };
};

const createTerminalSessionId = (
  userId: string,
  accountId: string,
  login: string,
): string =>
  createHash("sha256")
    .update(`${userId}:${accountId}/${login}`)
    .digest("hex");

const buildReadyResponse = (
  userId: string,
  resolved: ResolvedTerminalAccount,
) => {
  const server = resolved.server.trim();
  if (!server) {
    return buildMetadataMissingLockedResponse(resolved);
  }

  const terminalSessionId = createTerminalSessionId(
    userId,
    resolved.accountId,
    resolved.login,
  );
  const group = resolved.group?.trim() || "";

  const { token, expiresAt } = createWebtraderTokenWithExpiry({
    userId,
    accountId: resolved.accountId,
    authMode: "manager",
    terminalSessionId,
    login: Number(resolved.login),
    brokerId: resolved.brokerId,
    server,
    group: group || undefined,
  });
  if (expiresAt - Date.now() <= TERMINAL_SESSION_TOKEN_SAFETY_WINDOW_MS) {
    throw new Error(
      `WEBTRADER_TOKEN_TTL_SECONDS must exceed ${
        TERMINAL_SESSION_TOKEN_SAFETY_WINDOW_MS / 1000
      } seconds for terminal-session tokens.`,
    );
  }

  return terminalSessionJson({
    ok: true,
    state: "ready",
    requiresPassword: false,
    accountId: resolved.accountId,
    login: Number(resolved.login),
    brokerId: resolved.brokerId,
    server,
    group: group || undefined,
    terminalSessionId,
    token,
    expiresAt,
  });
};

const buildLockedResponse = (resolved: ResolvedTerminalAccount) =>
  terminalSessionJson({
    ok: true,
    state: "locked",
    requiresPassword: true,
    accountId: resolved.accountId,
    login: Number(resolved.login),
    brokerId: resolved.brokerId,
    server: resolved.server,
    group: resolved.group?.trim() || undefined,
  });

const buildMetadataMissingLockedResponse = (resolved: ResolvedTerminalAccount) =>
  terminalSessionJson({
    ok: true,
    state: "locked",
    requiresPassword: true,
    error:
      "Trading password is required to verify this MT5 account before terminal auto-login.",
    code: "PASSWORD_REQUIRED",
    accountId: resolved.accountId,
    login: Number(resolved.login),
    brokerId: resolved.brokerId,
    server: resolved.server.trim() || undefined,
    group: resolved.group?.trim() || undefined,
    metadataMissing: true,
  });

const parseRequestBody = async (
  request: NextRequest,
): Promise<{ ok: true; body: TerminalSessionRequestBody } | { ok: false; response: NextResponse }> => {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return { ok: true, body: {} };
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        response: terminalSessionJson(
          { error: "JSON body must be an object.", code: "INVALID_JSON_BODY" },
          { status: 400 },
        ),
      };
    }

    const body = parsed as { password?: unknown; tradingPassword?: unknown };
    if (
      body.tradingPassword !== undefined &&
      typeof body.tradingPassword !== "string"
    ) {
      return {
        ok: false,
        response: terminalSessionJson(
          {
            error: "tradingPassword must be a string when provided.",
            code: "INVALID_TRADING_PASSWORD_BODY",
          },
          { status: 400 },
        ),
      };
    }

    if (body.password !== undefined && typeof body.password !== "string") {
      return {
        ok: false,
        response: terminalSessionJson(
          {
            error: "password must be a string when provided.",
            code: "INVALID_PASSWORD_BODY",
          },
          { status: 400 },
        ),
      };
    }

    const tradingPassword =
      body.tradingPassword && body.tradingPassword.trim()
        ? body.tradingPassword
        : body.password;

    return {
      ok: true,
      body: { tradingPassword },
    };
  } catch {
    return {
      ok: false,
      response: terminalSessionJson(
        { error: "Invalid JSON body.", code: "INVALID_JSON_BODY" },
        { status: 400 },
      ),
    };
  }
};

const isInvalidTradingPasswordError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (error instanceof AccountsBackendError && error.status === 401) ||
    /invalid mt5 login or password/i.test(message)
  );
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

  if (error instanceof AccountsBackendError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code ?? "ACCOUNTS_BACKEND_ERROR",
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

export async function GET(request: NextRequest, context: RouteContext) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>;
  try {
    auth = await withTerminalSessionPhaseTimeout(
      "authenticateRequest",
      authenticateRequest(request),
      TERMINAL_SESSION_AUTH_TIMEOUT_MS,
    );
  } catch (error) {
    if (isTerminalSessionTimeoutError(error)) {
      return buildTerminalSessionTimeoutResponse(error);
    }

    throw error;
  }

  if (!auth) {
    return terminalSessionJson({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return terminalSessionJson(
      { error: "accountId is required.", code: "ACCOUNT_ID_REQUIRED" },
      { status: 400 },
    );
  }

  try {
    const resolved = await withTerminalSessionPhaseTimeout(
      "resolveTerminalAccount",
      resolveTerminalAccount(auth.user, accountId),
      TERMINAL_SESSION_ACCOUNT_RESOLUTION_TIMEOUT_MS,
    );
    if (!resolved.ok) {
      return resolved.response;
    }

    // Cache accounts discovered via backend or PG so future requests hit the fast local path.
    if (resolved.value.metadataSource === "backend-snapshot" || resolved.value.metadataSource === "pg-accounts") {
      cacheDiscoveredAccount(auth.user.id, resolved.value);
    }

    return buildReadyResponse(auth.user.id, resolved.value);
  } catch (error) {
    if (isTerminalSessionTimeoutError(error)) {
      return buildTerminalSessionTimeoutResponse(error);
    }

    const routeError = buildInternalRouteError(error);

    console.error("[api/private/accounts/[accountId]/terminal-session] GET failed", {
      userId: auth.user.id,
      accountId,
      error: routeError.logMessage,
    });

    return terminalSessionJson(routeError.body, { status: routeError.status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>;
  try {
    auth = await withTerminalSessionPhaseTimeout(
      "authenticateRequest",
      authenticateRequest(request),
      TERMINAL_SESSION_AUTH_TIMEOUT_MS,
    );
  } catch (error) {
    if (isTerminalSessionTimeoutError(error)) {
      return buildTerminalSessionTimeoutResponse(error);
    }

    throw error;
  }

  if (!auth) {
    return terminalSessionJson({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return terminalSessionJson(
      { error: "accountId is required.", code: "ACCOUNT_ID_REQUIRED" },
      { status: 400 },
    );
  }

  let parsedBody;
  try {
    parsedBody = await withTerminalSessionPhaseTimeout(
      "parseRequestBody",
      parseRequestBody(request),
      TERMINAL_SESSION_BODY_TIMEOUT_MS,
    );
  } catch (error) {
    if (isTerminalSessionTimeoutError(error)) {
      return buildTerminalSessionTimeoutResponse(error);
    }

    throw error;
  }

  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const providedTradingPassword = parsedBody.body.tradingPassword?.trim() ?? "";

  try {
    const resolved = await withTerminalSessionPhaseTimeout(
      "resolveTerminalAccount",
      resolveTerminalAccount(auth.user, accountId),
      TERMINAL_SESSION_ACCOUNT_RESOLUTION_TIMEOUT_MS,
    );
    if (!resolved.ok) {
      return resolved.response;
    }

    if (!providedTradingPassword && resolved.value.storedTradingPassword.trim()) {
      if (resolved.value.metadataSource === "backend-snapshot" || resolved.value.metadataSource === "pg-accounts") {
        cacheDiscoveredAccount(auth.user.id, resolved.value);
      }
      return buildReadyResponse(auth.user.id, resolved.value);
    }

    if (!providedTradingPassword) {
      return terminalSessionJson(
        {
          error: "Trading password is required.",
          code: "PASSWORD_REQUIRED",
        },
        { status: 400 },
      );
    }

    const verification = await withTerminalSessionPhaseTimeout(
      "verifyTradingPassword",
      requestAccountsBackend<VerifiedPasswordResponse>(
        "/accounts/verify-password",
        {
          method: "POST",
          timeoutMs: TERMINAL_SESSION_BACKEND_TIMEOUT_MS,
          body: withBrokerContext(
            {
              login: resolved.value.login,
              password: providedTradingPassword,
              investorPassword: false,
            },
            resolved.value.brokerId ?? auth.user.brokerId,
          ),
        },
      ),
      TERMINAL_SESSION_VERIFY_PHASE_TIMEOUT_MS,
    );

    const resolvedServer =
      verification.server?.trim() ||
      resolved.value.server ||
      resolved.value.account.serverIp?.trim() ||
      "";
    const resolvedGroup =
      resolveTerminalAccountGroup(resolved.value.account) ||
      resolved.value.group?.trim() ||
      verification.group?.trim();

    if (!resolvedServer) {
      return buildMetadataMissingLockedResponse({
        ...resolved.value,
        server: "",
        group: resolvedGroup || undefined,
        storedTradingPassword: providedTradingPassword,
      });
    }

    await withTerminalSessionPhaseTimeout(
      "persistAccountCredentials",
      persistAccountCredentials(
        auth.user.id,
        resolved.value.account,
        resolved.value.login,
        resolvedServer,
        providedTradingPassword,
        resolvedGroup,
      ),
      TERMINAL_SESSION_PERSIST_TIMEOUT_MS,
    );

    return buildReadyResponse(
      auth.user.id,
      {
        ...resolved.value,
        server: resolvedServer,
        group: resolvedGroup || undefined,
        storedTradingPassword: providedTradingPassword,
      },
    );
  } catch (error) {
    if (isTerminalSessionTimeoutError(error)) {
      return buildTerminalSessionTimeoutResponse(error);
    }

    if (isInvalidTradingPasswordError(error)) {
      return terminalSessionJson(
        {
          error: "Invalid MT5 login or password.",
          code: "INVALID_TRADING_PASSWORD",
        },
        { status: 401 },
      );
    }

    const routeError = buildInternalRouteError(error);

    console.error("[api/private/accounts/[accountId]/terminal-session] POST failed", {
      userId: auth.user.id,
      accountId,
      error: routeError.logMessage,
    });

    return terminalSessionJson(routeError.body, { status: routeError.status });
  }
}
