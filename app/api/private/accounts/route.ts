import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { authenticateRequest } from "@/lib/server/auth";
import {
  type BackendBalanceData,
  syncBackendAccountBalance,
} from "@/lib/server/backend-balance-sync";
import { updateUserSnapshot, getAccountsLiveFromPg } from "@/lib/server/database";
import {
  AccountsBackendError,
  extractMt5LoginFromAccount,
  fetchBackendDashboardSnapshot,
  requestAccountsBackend,
  withBrokerContext,
} from "@/lib/server/accounts-backend";
import {
  createTradingAccountForUser,
  getSnapshotForUser,
} from "@/lib/server/dashboard-service";
import { mergeDashboardSnapshots } from "@/lib/server/dashboard-snapshot-merge";
import { isMt5GroupAllowedForUser } from "@/lib/server/mt5-account-scope";
import { resolveBackendEnvValue } from "@/lib/server/backend-env";
import { Mt5ProvisioningError } from "@/lib/server/mt5-manager";
import type { DashboardSnapshot, TradingAccount } from "@/types/dashboard";

interface CreateAccountBody {
  platform?: "mt5" | "mt4" | "ctrader";
  mode?: "demo" | "live";
  currency?: "USD" | "EUR";
  initialBalance?: number;
  leverage?: number;
  group?: string;
  name?: string;
  email?: string;
  tradingPassword?: string;
  investorPassword?: string;
}

type AccountTypeAlias =
  | "demo-std-usd"
  | "demo-std-eur"
  | "demo-pro-usd"
  | "demo-pro-eur"
  | "demo-ecn-usd"
  | "demo-ecn-eur"
  | "demo-usd"
  | "demo-eur"
  | "std-usd"
  | "std-eur"
  | "pro-usd"
  | "pro-eur"
  | "ecn-usd"
  | "ecn-eur";

const GROUP_ALIAS_ENV_PRIORITY: Record<AccountTypeAlias, string[]> = {
  "demo-std-usd": [
    "MT5_GROUP_DEMO_STD_USD",
    "MT5_GROUP_DEMO_STD",
    "MT5_GROUP_DEMO_USD",
    "MT5_GROUP_DEMO",
  ],
  "demo-std-eur": [
    "MT5_GROUP_DEMO_STD_EUR",
    "MT5_GROUP_DEMO_STD",
    "MT5_GROUP_DEMO_EUR",
    "MT5_GROUP_DEMO",
  ],
  "demo-pro-usd": [
    "MT5_GROUP_DEMO_PRO_USD",
    "MT5_GROUP_DEMO_PRO",
    "MT5_GROUP_DEMO_USD",
    "MT5_GROUP_DEMO",
  ],
  "demo-pro-eur": [
    "MT5_GROUP_DEMO_PRO_EUR",
    "MT5_GROUP_DEMO_PRO",
    "MT5_GROUP_DEMO_EUR",
    "MT5_GROUP_DEMO",
  ],
  "demo-ecn-usd": [
    "MT5_GROUP_DEMO_ECN_USD",
    "MT5_GROUP_DEMO_ECN",
    "MT5_GROUP_DEMO_USD",
    "MT5_GROUP_DEMO",
  ],
  "demo-ecn-eur": [
    "MT5_GROUP_DEMO_ECN_EUR",
    "MT5_GROUP_DEMO_ECN",
    "MT5_GROUP_DEMO_EUR",
    "MT5_GROUP_DEMO",
  ],
  "demo-usd": [
    "MT5_GROUP_DEMO_STD_USD",
    "MT5_GROUP_DEMO_STD",
    "MT5_GROUP_DEMO_USD",
    "MT5_GROUP_DEMO",
  ],
  "demo-eur": [
    "MT5_GROUP_DEMO_STD_EUR",
    "MT5_GROUP_DEMO_STD",
    "MT5_GROUP_DEMO_EUR",
    "MT5_GROUP_DEMO",
  ],
  "std-usd": [
    "MT5_GROUP_LIVE_STD_USD",
    "MT5_GROUP_LIVE_STD",
    "MT5_GROUP_LIVE_USD",
    "MT5_GROUP_LIVE",
  ],
  "std-eur": [
    "MT5_GROUP_LIVE_STD_EUR",
    "MT5_GROUP_LIVE_STD",
    "MT5_GROUP_LIVE_EUR",
    "MT5_GROUP_LIVE",
  ],
  "pro-usd": [
    "MT5_GROUP_LIVE_PRO_USD",
    "MT5_GROUP_LIVE_PRO",
    "MT5_GROUP_LIVE_USD",
    "MT5_GROUP_LIVE",
  ],
  "pro-eur": [
    "MT5_GROUP_LIVE_PRO_EUR",
    "MT5_GROUP_LIVE_PRO",
    "MT5_GROUP_LIVE_EUR",
    "MT5_GROUP_LIVE",
  ],
  "ecn-usd": [
    "MT5_GROUP_LIVE_ECN_USD",
    "MT5_GROUP_LIVE_ECN",
    "MT5_GROUP_LIVE_USD",
    "MT5_GROUP_LIVE",
  ],
  "ecn-eur": [
    "MT5_GROUP_LIVE_ECN_EUR",
    "MT5_GROUP_LIVE_ECN",
    "MT5_GROUP_LIVE_EUR",
    "MT5_GROUP_LIVE",
  ],
};

const DEMO_ALIASES: ReadonlySet<AccountTypeAlias> = new Set([
  "demo-std-usd",
  "demo-std-eur",
  "demo-pro-usd",
  "demo-pro-eur",
  "demo-ecn-usd",
  "demo-ecn-eur",
  "demo-usd",
  "demo-eur",
]);

const isAccountTypeAlias = (value: string): value is AccountTypeAlias =>
  Object.prototype.hasOwnProperty.call(GROUP_ALIAS_ENV_PRIORITY, value);

const resolveRepoRoot = (): string => {
  const cwd = process.cwd();
  if (path.basename(cwd).toLowerCase() === "frontend") {
    return path.dirname(cwd);
  }
  return cwd;
};

const loadEnvFileValue = (envPath: string, key: string): string | undefined => {
  if (!existsSync(envPath)) {
    return undefined;
  }

  const raw = readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [entryKey, ...rest] = trimmed.split("=");
    if (entryKey.trim() !== key) {
      continue;
    }

    const value = rest.join("=").trim();
    if (!value) {
      return undefined;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim();
    }

    return value;
  }

  return undefined;
};

const resolveEnvValue = (key: string): string | undefined => {
  // The C++ backend env is the MT5 source of truth. Prefer it so a stale
  // frontend shell env cannot send an old broker group back to the backend.
  const sharedBackendValue = resolveBackendEnvValue(key);
  if (sharedBackendValue) {
    return sharedBackendValue;
  }

  const direct = process.env[key]?.trim();
  if (direct) {
    return direct;
  }

  const repoRoot = resolveRepoRoot();
  const envPaths = [
    path.join(repoRoot, "backend c++", ".env.local"),
    path.join(repoRoot, "backend c++", ".env"),
    path.join(repoRoot, "backend", ".env.local"),
    path.join(repoRoot, "backend", ".env"),
  ];

  for (const envPath of envPaths) {
    const value = loadEnvFileValue(envPath, key);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const resolveGroupFromEnv = (envKeys: string[]): string | undefined => {
  for (const key of envKeys) {
    const value = resolveEnvValue(key);
    if (value) {
      return value;
    }
  }
  return undefined;
};

const resolveRequestedGroup = (rawGroup: string | undefined): string | undefined => {
  const trimmed = rawGroup?.trim();
  if (!trimmed) {
    return undefined;
  }

  const aliasCandidate = trimmed.toLowerCase();
  if (isAccountTypeAlias(aliasCandidate)) {
    const envKeys = GROUP_ALIAS_ENV_PRIORITY[aliasCandidate];
    // UI sends account-type aliases; resolve them to real broker groups via env mapping.
    return resolveGroupFromEnv(envKeys);
  }

  return trimmed;
};

const isSharedGroupModeAllowed = (): boolean =>
  (resolveEnvValue("MT5_ALLOW_SHARED_GROUP_MODES") ?? "").trim().toLowerCase() === "true";

const mapProvisioningErrorMessage = (error: Mt5ProvisioningError): string => {
  if (error.code === "MT_RET_AUTH_MANAGER_IPBLOCK") {
    return "MT5 Manager access is blocked for this server IP. Ask Flexy Markets to whitelist your CRM server public IP for manager login.";
  }

  if (error.code === "MT_RET_ERR_NETWORK") {
    return "Cannot reach MT5 manager endpoint. Verify MT5 server host/port and proxy settings.";
  }

  if (error.code === "MISSING_GROUP") {
    return "MT5 group is not configured for this account mode. For demo accounts set MT5_GROUP_DEMO_STD / MT5_GROUP_DEMO_PRO / MT5_GROUP_DEMO_ECN (or MT5_GROUP_DEMO). For live accounts set MT5_GROUP_LIVE.";
  }

  if (error.code === "DEMO_GROUP_MATCHES_LIVE_GROUP") {
    return "Resolved demo group matches MT5_GROUP_LIVE. Configure a dedicated demo group or set MT5_ALLOW_SHARED_GROUP_MODES=true.";
  }

  if (error.code === "MT_RET_ERR_PERMISSIONS") {
    return "MT5 manager account lacks permission to create users. Either: (1) Request UserCreate permission from your broker, or (2) Use a different admin-level manager account.";
  }

  return (
    error.message ||
    "MT5 account provisioning failed. Verify network, group mapping, and manager permissions."
  );
};

const mapProvisioningErrorStatus = (error: Mt5ProvisioningError): number => {
  if (error.code === "MISSING_GROUP") {
    return 400;
  }

  if (error.code === "DEMO_GROUP_MATCHES_LIVE_GROUP") {
    return 400;
  }

  if (error.code === "MT_RET_AUTH_MANAGER_IPBLOCK") {
    return 503;
  }

  if (error.code === "MT_RET_ERR_NETWORK") {
    return 502;
  }

  return 502;
};

interface BackendProvisioningData {
  login?: string;
  leverage?: number;
  mode?: "demo" | "live";
  currency?: string;
  server?: string;
  serverHost?: string;
  tradingPassword?: string;
  investorPassword?: string;
  initialBalanceAsked?: number;
  initialBalanceApplied?: number;
  depositCode?: string;
  dealTicket?: string;
}

interface BackendCreateAccountData {
  account?: {
    login?: string;
    leverage?: number;
    mode?: "demo" | "live";
    currency?: string;
    name?: string;
  };
  provisioning?: BackendProvisioningData;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

// Fall back to local MT5 manager provisioning only when the C++ backend is
// completely unreachable (network 502, no error code). If the backend
// responded with a real error code, propagate it so the UI shows the cause.
const shouldFallbackToLocal = (error: AccountsBackendError): boolean =>
  error.status === 502 && !error.code;

const toBackendErrorResponse = (error: AccountsBackendError): NextResponse => {
  let friendlyMessage = error.message;

  // Use the same friendly error mappings we use for local fallback errors
  if (error.code === "MT_RET_ERR_PERMISSIONS") {
    friendlyMessage =
      error.message ||
      "MT5 manager account lacks permission to create users. Either: (1) Request UserCreate permission from your broker, or (2) Use a different admin-level manager account.";
  } else if (error.code === "MT_RET_AUTH_MANAGER_IPBLOCK") {
    friendlyMessage = "MT5 Manager access is blocked for this server IP. Ask Flexy Markets to whitelist your CRM server public IP for manager login.";
  } else if (error.code === "MT_RET_ERR_NETWORK") {
    friendlyMessage = "Cannot reach MT5 manager endpoint. Verify MT5 server host/port and proxy settings.";
  }

  return NextResponse.json(
    {
      error: friendlyMessage,
      code: error.code,
      details: error.details,
    },
    { status: error.status },
  );
};

const buildAccountFromBackendSnapshot = (
  snapshot: DashboardSnapshot,
  backendData: BackendCreateAccountData,
  fallback: {
    mode: "demo" | "live";
    currency: "USD" | "EUR";
    leverage: number;
    initialBalance: number;
    name?: string;
  },
  syncedBalance?: BackendBalanceData | null,
): TradingAccount | null => {
  const provisioning = backendData.provisioning;
  const login =
    provisioning?.login?.trim() || backendData.account?.login?.trim() || "";

  if (!/^\d+$/.test(login)) {
    return null;
  }

  const existing = snapshot.tradingAccounts.find(
    (entry) =>
      entry.accountNumber === login ||
      extractMt5LoginFromAccount(entry) === login ||
      entry.id === `mt5-${login}`,
  );
  const existingName = existing?.name?.trim();

  const server =
    provisioning?.serverHost?.trim() ||
    provisioning?.server?.trim() ||
    existing?.serverIp?.trim() ||
    "89.21.67.29";

  const depositCode = provisioning?.depositCode?.trim().toUpperCase() ?? "";
  const canTrustProvisionedBalance =
    depositCode.length === 0 || depositCode === "MT_RET_OK" || depositCode === "SKIPPED";
  const fallbackBalance =
    canTrustProvisionedBalance && isFiniteNumber(provisioning?.initialBalanceApplied)
      ? provisioning.initialBalanceApplied
      : 0;
  const balance =
    isFiniteNumber(syncedBalance?.balance) ? syncedBalance.balance :
    isFiniteNumber(existing?.balance) ? existing.balance :
    fallbackBalance;
  const equity =
    isFiniteNumber(syncedBalance?.equity) ? syncedBalance.equity :
    isFiniteNumber(existing?.equity) ? existing.equity :
    balance;
  const freeMargin =
    isFiniteNumber(syncedBalance?.freeMargin) ? syncedBalance.freeMargin :
    isFiniteNumber(existing?.freeMargin) ? existing.freeMargin :
    balance;

  const baseAccount: TradingAccount = {
    ...(existing ?? {}),
    id: existing?.id ?? `mt5-${login}`,
    accountNumber: existing?.accountNumber ?? login,
    name:
      backendData.account?.name?.trim() ||
      fallback.name?.trim() ||
      existingName ||
      `MT5 ${login}`,
    platform: "mt5",
    type: fallback.mode === "demo" ? "Demo" : "Live",
    leverage: backendData.account?.leverage ?? existing?.leverage ?? fallback.leverage,
    serverIp: server,
    currency: backendData.account?.currency?.toUpperCase() || existing?.currency || fallback.currency,
    balance,
    equity,
    freeMargin,
    margin: existing?.margin ?? 0,
    status: existing?.status ?? "Active",
  };

  if (!provisioning?.tradingPassword && !provisioning?.investorPassword) {
    return {
      ...baseAccount,
      serverIp: baseAccount.serverIp ?? server,
    };
  }

  return {
    ...baseAccount,
    serverIp: baseAccount.serverIp ?? server,
    credentials: {
      login,
      server,
      tradingPassword: provisioning?.tradingPassword ?? "",
      investorPassword: provisioning?.investorPassword ?? "",
      generatedAt: new Date().toISOString(),
      source: "broker",
    },
  };
};

const fetchBackendAccountBalance = async (
  login: string,
  options?: {
    expectedPositiveBalance?: boolean;
    attempts?: number;
    delayMs?: number;
  },
): Promise<BackendBalanceData | null> => {
  if (!/^\d+$/.test(login)) {
    return null;
  }

  const expectedPositiveBalance = options?.expectedPositiveBalance ?? false;
  return syncBackendAccountBalance(login, {
    attempts: Math.max(1, options?.attempts ?? (expectedPositiveBalance ? 12 : 1)),
    delayMs: Math.max(0, options?.delayMs ?? (expectedPositiveBalance ? 5000 : 0)),
    accept: (result) => !expectedPositiveBalance || result.balance > 0,
  });
};

const upsertTradingAccount = (
  snapshot: DashboardSnapshot,
  account: TradingAccount,
): DashboardSnapshot => {
  const accountLogin =
    account.credentials?.login?.trim() || account.accountNumber?.trim() || "";
  const tradingAccounts = [...snapshot.tradingAccounts];
  const existingIndex = tradingAccounts.findIndex((entry) => {
    const entryLogin = extractMt5LoginFromAccount(entry);
    return (
      entry.id === account.id ||
      (entryLogin && accountLogin && entryLogin === accountLogin)
    );
  });

  if (existingIndex >= 0) {
    tradingAccounts[existingIndex] = {
      ...tradingAccounts[existingIndex],
      ...account,
      credentials: account.credentials ?? tradingAccounts[existingIndex].credentials,
    };
  } else {
    tradingAccounts.unshift(account);
  }

  return {
    ...snapshot,
    tradingAccounts,
  };
};

const createAccountUsingLocalFallback = async (
  userId: string,
  input: {
    platform: "mt5" | "mt4" | "ctrader";
    mode: "demo" | "live";
    currency: "USD" | "EUR";
    initialBalance: number;
    leverage: number;
    group?: string;
    name?: string;
    email?: string;
    tradingPassword?: string;
    investorPassword?: string;
  },
): Promise<{ account: TradingAccount; snapshot: DashboardSnapshot }> => {
  const created = await createTradingAccountForUser(userId, {
    platform: input.platform,
    mode: input.mode,
    currency: input.currency,
    initialBalance: input.initialBalance,
    leverage: Math.trunc(input.leverage),
    group: input.group,
    name: input.name,
    email: input.email,
    tradingPassword: input.tradingPassword,
    investorPassword: input.investorPassword,
  });

  return created;
};

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const localSnapshot = await getSnapshotForUser(auth.user.id);
    const backendSnapshot = await fetchBackendDashboardSnapshot(
      auth.user.id,
      auth.user.brokerId,
    );
    const snapshot = backendSnapshot
      ? mergeDashboardSnapshots(localSnapshot, backendSnapshot)
      : localSnapshot;

    // Merge live data from PostgreSQL `accounts` table over the snapshot.
    // This gives real-time balance, equity, status and createdAt on every
    // page load — no extra sync step required.
    const pgRows = await getAccountsLiveFromPg(auth.user.id);
    const pgByLogin = new Map(pgRows.map((r) => [r.login, r]));

    const mergedAccounts = snapshot.tradingAccounts.map((account) => {
      // Match by MT5 login (accountNumber or credentials.login)
      const login =
        account.credentials?.login?.trim() ||
        account.accountNumber?.trim() ||
        "";
      const live = pgByLogin.get(login);
      if (!live) return account;

      return {
        ...account,
        // Use PG value only when it's a valid finite number
        balance: live.balance != null && Number.isFinite(live.balance) ? live.balance : account.balance,
        equity: live.equity != null && Number.isFinite(live.equity) ? live.equity : account.equity,
        freeMargin: live.freeMargin != null && Number.isFinite(live.freeMargin) ? live.freeMargin : account.freeMargin,
        // PG status is authoritative
        status: (live.status === "Active" || live.status === "Archived") ? live.status : account.status,
        // PG created_at is authoritative for timestamp
        createdAt: live.createdAt ?? account.createdAt,
      } as typeof account;
    });

    return NextResponse.json(
      { accounts: mergedAccounts },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[api/private/accounts] GET failed for user ${auth.user.id}`, error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateAccountBody;
  try {
    body = (await request.json()) as CreateAccountBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const platform = body.platform ?? "mt5";
  const mode = body.mode ?? "demo";
  const currency = body.currency === "EUR" ? "EUR" : "USD";
  const initialBalance = Number(body.initialBalance ?? 0);
  const leverage = Number(body.leverage ?? 100);
  const rawGroup = body.group;
  const group = resolveRequestedGroup(rawGroup);
  const normalizedRawGroup = rawGroup?.trim().toLowerCase() ?? "";
  const isRawGroupAlias = isAccountTypeAlias(normalizedRawGroup);
  const requestedName = body.name?.trim() || undefined;
  const requestedEmail = body.email?.trim() || auth.user.email?.trim() || undefined;
  const tradingPassword = body.tradingPassword?.trim() || undefined;
  const investorPassword = body.investorPassword?.trim() || undefined;

  if (!Number.isFinite(initialBalance) || initialBalance < 0) {
    return NextResponse.json(
      { error: "Initial balance must be a valid non-negative number." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(leverage) || leverage <= 0 || leverage > 5000) {
    return NextResponse.json(
      { error: "Leverage must be a valid number between 1 and 5000." },
      { status: 400 },
    );
  }

  if (platform === "mt5") {
    if (isRawGroupAlias) {
      const isDemoAlias = DEMO_ALIASES.has(normalizedRawGroup);
      if (mode === "demo" && !isDemoAlias) {
        return NextResponse.json(
          { error: "Demo mode must use a demo account type mapping." },
          { status: 400 },
        );
      }
      if (mode === "live" && isDemoAlias) {
        return NextResponse.json(
          { error: "Live mode cannot use a demo account type mapping." },
          { status: 400 },
        );
      }
    }

    if (group && !isRawGroupAlias) {
      const isAllowedGroup = await isMt5GroupAllowedForUser(auth.user, group);
      if (!isAllowedGroup) {
        return NextResponse.json(
          {
            error:
              "Requested MT5 group is not available for this account. Use an owned account group or configure MT5_ALLOWED_GROUPS.",
            code: "MT5_GROUP_NOT_ALLOWED",
          },
          { status: 403 },
        );
      }
    }

    if (mode === "demo" && !group) {
      return NextResponse.json(
        {
          error:
            "Demo group is not configured. Set MT5_GROUP_DEMO_STD / MT5_GROUP_DEMO_PRO / MT5_GROUP_DEMO_ECN (or MT5_GROUP_DEMO) before creating demo accounts.",
        },
        { status: 400 },
      );
    }

    const liveDefaultGroup = resolveEnvValue("MT5_GROUP_LIVE");
    if (
      mode === "demo" &&
      group &&
      liveDefaultGroup &&
      group === liveDefaultGroup &&
      !isSharedGroupModeAllowed()
    ) {
      return NextResponse.json(
        {
          error:
            "Resolved demo group matches MT5_GROUP_LIVE. Configure a dedicated demo group or set MT5_ALLOW_SHARED_GROUP_MODES=true if this is intentional.",
        },
        { status: 400 },
      );
    }
  }

  // cTrader provisioning remains local-only until the backend adds cTrader support.
  if (platform !== "mt5") {
    try {
      const created = await createAccountUsingLocalFallback(auth.user.id, {
        platform,
        mode,
        currency,
        initialBalance,
        leverage,
        group,
        name: requestedName,
        email: requestedEmail,
        tradingPassword,
        investorPassword,
      });

      return NextResponse.json(
        {
          ok: true,
          message: "Trading account created successfully.",
          account: created.account,
          snapshot: created.snapshot,
        },
        { status: 201 },
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to create trading account.",
        },
        { status: 500 },
      );
    }
  }

  try {
    const localSnapshotBeforeBackendCreate = await getSnapshotForUser(auth.user.id);
    const backendData = await requestAccountsBackend<BackendCreateAccountData>(
      "/accounts",
      {
        method: "POST",
        body: withBrokerContext({
          group,
          ownerId: auth.user.id,
          leverage: Math.trunc(leverage),
          platform: "mt5",
          mode,
          currency,
          initialDeposit: initialBalance,
          name: requestedName,
          email: requestedEmail,
          tradingPassword,
          investorPassword,
        }, auth.user.brokerId),
      },
    );

    const createdLogin =
      backendData.provisioning?.login?.trim() ||
      backendData.account?.login?.trim() ||
      "";
    const syncedBalance = await fetchBackendAccountBalance(
      createdLogin,
      {
        expectedPositiveBalance: initialBalance > 0,
      },
    );
    const backendSnapshot = await fetchBackendDashboardSnapshot(
      auth.user.id,
      auth.user.brokerId,
    );
    if (!backendSnapshot) {
      throw new AccountsBackendError(
        502,
        "Account created but snapshot refresh failed.",
      );
    }

    const account = buildAccountFromBackendSnapshot(backendSnapshot, backendData, {
      mode,
      currency,
      leverage: Math.trunc(leverage),
      initialBalance,
      name: requestedName,
    }, syncedBalance);
    const fundingPending =
      initialBalance > 0 &&
      (!syncedBalance || !isFiniteNumber(syncedBalance.balance) || syncedBalance.balance < initialBalance);

    const mergedSnapshot = mergeDashboardSnapshots(
      localSnapshotBeforeBackendCreate,
      backendSnapshot,
    );
    const responseSnapshot = account
      ? upsertTradingAccount(mergedSnapshot, account)
      : mergedSnapshot;

    if (account) {
      await updateUserSnapshot(auth.user.id, (current) => {
        current.tradingAccounts = responseSnapshot.tradingAccounts;
        return current;
      });
    }

    return NextResponse.json(
      {
        ok: true,
        message: fundingPending
          ? "Trading account created. Initial funding is still pending broker confirmation."
          : "Trading account created successfully.",
        account: account ?? undefined,
        snapshot: responseSnapshot,
        fundingPending,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AccountsBackendError) {
      if (!shouldFallbackToLocal(error)) {
        return toBackendErrorResponse(error);
      }
    }

    try {
      const created = await createAccountUsingLocalFallback(auth.user.id, {
        platform: "mt5",
        mode,
        currency,
        initialBalance,
        leverage,
        group,
        name: requestedName,
        email: requestedEmail,
        tradingPassword,
        investorPassword,
      });

      return NextResponse.json(
        {
          ok: true,
          message: "Trading account created successfully.",
          account: created.account,
          snapshot: created.snapshot,
        },
        { status: 201 },
      );
    } catch (fallbackError) {
      if (fallbackError instanceof Mt5ProvisioningError) {
        return NextResponse.json(
          {
            error: mapProvisioningErrorMessage(fallbackError),
            stage: fallbackError.stage,
            code: fallbackError.code,
          },
          { status: mapProvisioningErrorStatus(fallbackError) },
        );
      }

      return NextResponse.json(
        {
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : "Failed to create trading account.",
        },
        { status: 500 },
      );
    }
  }
}
