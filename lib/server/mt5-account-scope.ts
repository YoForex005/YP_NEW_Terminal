import {
  extractMt5LoginFromAccount,
  fetchBackendDashboardSnapshot,
  requestAccountsBackend,
  withBrokerContext,
} from "@/lib/server/accounts-backend";
import { resolveBackendEnvValue } from "@/lib/server/backend-env";
import {
  getFullAccountsFromPg,
  getUserSnapshotWithServerIp,
} from "@/lib/server/database";
import type { TradingAccount, TradingAccountCredentials } from "@/types/dashboard";

type TradingAccountCredentialsWithGroup = TradingAccountCredentials & {
  group?: string;
  groupName?: string;
  group_name?: string;
  mt5Group?: string;
};

type TradingAccountWithGroup = TradingAccount & {
  group?: string;
  groupName?: string;
  group_name?: string;
  mt5Group?: string;
  credentials?: TradingAccountCredentialsWithGroup;
};

export interface OwnedMt5Account {
  account: TradingAccount;
  login: string;
  brokerId?: string;
}

type BrokerScopedUser = string | { id: string; brokerId?: string | null };

const resolveUserScope = (
  user: BrokerScopedUser,
): { userId: string; brokerId?: string } => {
  if (typeof user === "string") {
    return { userId: user };
  }

  return {
    userId: user.id,
    brokerId: user.brokerId?.trim() || undefined,
  };
};

const EXPLICIT_GROUP_ALLOWLIST_ENV_KEYS = [
  "MT5_ALLOWED_GROUPS",
  "MT5_GROUP_ALLOWLIST",
  "NEXT_PRIVATE_MT5_GROUP_ALLOWLIST",
];
const OWNED_ACCOUNT_FALLBACK_TIMEOUT_MS = 900;
const DEFAULT_MISSING_ACCOUNT_SYNC_TIMEOUT_MS = 2_500;

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

const uniqueStrings = (values: Iterable<string>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
};

const parseDelimitedList = (value: string | undefined): string[] =>
  value
    ? value
        .split(/[,\n;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

const resolveEnvValue = (key: string): string | undefined =>
  (resolveBackendEnvValue(key) ?? process.env[key]?.trim()) || undefined;

const resolveMissingAccountSyncTimeoutMs = (): number => {
  const parsed = Number(process.env.MT5_ACCOUNT_RESOLVE_SYNC_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : DEFAULT_MISSING_ACCOUNT_SYNC_TIMEOUT_MS;
};

export const normalizeMt5Login = (
  value: string | number | null | undefined,
): string | null => {
  const raw = typeof value === "number" ? String(value) : value?.trim() ?? "";
  if (!raw) {
    return null;
  }

  const mt5Prefixed = /^mt5-(\d+)$/.exec(raw);
  const login = mt5Prefixed?.[1] ?? raw;
  return /^\d+$/.test(login) ? login : null;
};

export const extractMt5GroupFromAccount = (
  account: TradingAccount | null | undefined,
): string | null => {
  if (!account) {
    return null;
  }

  const accountWithGroup = account as TradingAccountWithGroup;
  const group = firstTrimmed(
    accountWithGroup.group,
    accountWithGroup.groupName,
    accountWithGroup.group_name,
    accountWithGroup.mt5Group,
    accountWithGroup.credentials?.group,
    accountWithGroup.credentials?.groupName,
    accountWithGroup.credentials?.group_name,
    accountWithGroup.credentials?.mt5Group,
  );

  return group || null;
};

const getAccountId = (account: TradingAccount): string =>
  typeof account.id === "string" ? account.id.trim() : "";

const getAccountPlatform = (account: TradingAccount): string => {
  const platform = (account as { platform?: unknown }).platform;
  return typeof platform === "string" ? platform.trim().toLowerCase() : "";
};

const extractOwnedMt5Login = (account: TradingAccount): string | null =>
  extractMt5LoginFromAccount(account) ?? normalizeMt5Login(getAccountId(account));

const hasExplicitMt5Platform = (account: TradingAccount): boolean =>
  getAccountPlatform(account) === "mt5";

const platformsCanMerge = (
  existing: TradingAccount,
  incoming: TradingAccount,
): boolean => {
  const existingPlatform = getAccountPlatform(existing);
  const incomingPlatform = getAccountPlatform(incoming);

  return (
    !existingPlatform ||
    !incomingPlatform ||
    existingPlatform === incomingPlatform
  );
};

const accountsShareIdentity = (
  existing: TradingAccount,
  incoming: TradingAccount,
): boolean => {
  const existingId = getAccountId(existing);
  const incomingId = getAccountId(incoming);
  if (existingId && incomingId && existingId === incomingId) {
    return true;
  }

  const existingLogin = extractOwnedMt5Login(existing);
  const incomingLogin = extractOwnedMt5Login(incoming);
  return Boolean(
    existingLogin &&
      incomingLogin &&
      existingLogin === incomingLogin,
  );
};

const mergeTradingAccountCredentials = (
  existing: TradingAccountCredentialsWithGroup | undefined,
  incoming: TradingAccountCredentialsWithGroup | undefined,
): TradingAccountCredentialsWithGroup | undefined => {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }

  return {
    ...existing,
    ...incoming,
    login: firstTrimmed(incoming.login, existing.login),
    server: firstTrimmed(incoming.server, existing.server),
    tradingPassword: firstTrimmed(
      incoming.tradingPassword,
      existing.tradingPassword,
    ),
    investorPassword: firstTrimmed(
      incoming.investorPassword,
      existing.investorPassword,
    ),
    generatedAt: firstTrimmed(incoming.generatedAt, existing.generatedAt),
    source: incoming.source ?? existing.source,
  };
};

const mergeTradingAccountMetadata = (
  existing: TradingAccount,
  incoming: TradingAccount,
): TradingAccount => {
  const existingId = getAccountId(existing);
  const incomingId = getAccountId(incoming);
  const existingHasPlatform = Boolean(getAccountPlatform(existing));
  const incomingHasPlatform = Boolean(getAccountPlatform(incoming));
  const id =
    existingId && (existingHasPlatform || !incomingHasPlatform)
      ? existingId
      : incomingId || existingId;

  return {
    ...existing,
    ...incoming,
    id,
    credentials: mergeTradingAccountCredentials(
      existing.credentials as TradingAccountCredentialsWithGroup | undefined,
      incoming.credentials as TradingAccountCredentialsWithGroup | undefined,
    ),
    transactions: existing.transactions ?? incoming.transactions,
    stats: existing.stats ?? incoming.stats,
  };
};

const mergeOwnedAccounts = (
  ...accountGroups: TradingAccount[][]
): TradingAccount[] => {
  const merged: TradingAccount[] = [];

  for (const accounts of accountGroups) {
    for (const account of accounts) {
      const existingIndex = merged.findIndex((entry) =>
        accountsShareIdentity(entry, account) && platformsCanMerge(entry, account),
      );
      if (existingIndex >= 0) {
        merged[existingIndex] = mergeTradingAccountMetadata(
          merged[existingIndex],
          account,
        );
        continue;
      }

      merged.push(account);
    }
  }

  return merged;
};

const fetchPgOwnedTradingAccounts = async (
  scope: { userId: string; brokerId?: string },
): Promise<TradingAccount[]> => {
  try {
    return await Promise.race([
      getFullAccountsFromPg(scope.userId, scope.brokerId),
      new Promise<TradingAccount[]>((resolve) =>
        setTimeout(() => resolve([]), OWNED_ACCOUNT_FALLBACK_TIMEOUT_MS),
      ),
    ]);
  } catch (error) {
    console.warn(
      "PostgreSQL trading account lookup failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
};

const fetchBackendOwnedTradingAccounts = async (
  scope: { userId: string; brokerId?: string },
): Promise<TradingAccount[]> => {
  try {
    const backendSnapshot = await fetchBackendDashboardSnapshot(
      scope.userId,
      scope.brokerId,
      { timeoutMs: OWNED_ACCOUNT_FALLBACK_TIMEOUT_MS },
    );
    return backendSnapshot?.tradingAccounts ?? [];
  } catch (error) {
    console.warn(
      "Backend trading account snapshot lookup failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
};

const syncMissingOwnedMt5Account = async (
  scope: { userId: string; brokerId?: string },
  login: string,
): Promise<boolean> => {
  if (!/^\d+$/.test(login)) {
    return false;
  }

  try {
    await requestAccountsBackend("/accounts/sync-broker", {
      method: "POST",
      body: withBrokerContext(
        {
          ownerId: scope.userId,
          owner_id: scope.userId,
          login,
          accountId: `mt5-${login}`,
          account_id: `mt5-${login}`,
        },
        scope.brokerId,
      ),
      timeoutMs: resolveMissingAccountSyncTimeoutMs(),
    });
    return true;
  } catch (error) {
    console.warn(
      "Targeted MT5 account sync failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
};

const loadOwnedTradingAccounts = async (
  scope: { userId: string; brokerId?: string },
): Promise<TradingAccount[]> => {
  const [localSnapshot, backendAccounts, pgAccounts] = await Promise.all([
    getUserSnapshotWithServerIp(scope.userId),
    fetchBackendOwnedTradingAccounts(scope),
    fetchPgOwnedTradingAccounts(scope),
  ]);

  return mergeOwnedAccounts(
    localSnapshot.tradingAccounts,
    backendAccounts,
    pgAccounts,
  );
};

const isMt5CompatibleForRequest = (
  account: TradingAccount,
  requestedLogin: string | null,
): boolean => {
  const platform = getAccountPlatform(account);
  if (platform) {
    return platform === "mt5";
  }

  if (!requestedLogin) {
    return false;
  }

  return (
    extractOwnedMt5Login(account) === requestedLogin ||
    normalizeMt5Login(getAccountId(account)) === requestedLogin
  );
};

const findOwnedMt5Account = (
  accounts: TradingAccount[],
  requestedAccountId: string,
  requestedLogin: string | null,
  brokerId?: string,
): OwnedMt5Account | null => {
  for (const account of accounts) {
    if (!isMt5CompatibleForRequest(account, requestedLogin)) {
      continue;
    }

    const login = extractOwnedMt5Login(account);
    if (!login) {
      continue;
    }

    if (
      getAccountId(account) === requestedAccountId ||
      login === requestedLogin
    ) {
      return { account, login, brokerId };
    }
  }

  return null;
};

export const getOwnedTradingAccounts = async (
  user: BrokerScopedUser,
): Promise<TradingAccount[]> => {
  const scope = resolveUserScope(user);
  return loadOwnedTradingAccounts(scope);
};

export const getOwnedMt5Accounts = async (
  user: BrokerScopedUser,
): Promise<OwnedMt5Account[]> => {
  const scope = resolveUserScope(user);
  const accounts = await getOwnedTradingAccounts({
    id: scope.userId,
    brokerId: scope.brokerId,
  });
  const owned: OwnedMt5Account[] = [];

  for (const account of accounts) {
    if (!hasExplicitMt5Platform(account)) {
      continue;
    }

    const login = extractOwnedMt5Login(account);
    if (!login) {
      continue;
    }

    owned.push({ account, login, brokerId: scope.brokerId });
  }

  return owned;
};

export const getOwnedMt5Logins = async (user: BrokerScopedUser): Promise<string[]> =>
  uniqueStrings((await getOwnedMt5Accounts(user)).map((entry) => entry.login));

export const resolveOwnedMt5Account = async (
  user: BrokerScopedUser,
  accountIdOrLogin: string,
): Promise<OwnedMt5Account | null> => {
  const scope = resolveUserScope(user);
  const requestedAccountId = accountIdOrLogin.trim();
  const requestedLogin = normalizeMt5Login(requestedAccountId);

  if (!requestedAccountId) {
    return null;
  }

  const localSnapshot = await getUserSnapshotWithServerIp(scope.userId);
  const localMatch = findOwnedMt5Account(
    localSnapshot.tradingAccounts,
    requestedAccountId,
    requestedLogin,
    scope.brokerId,
  );
  if (localMatch) {
    return localMatch;
  }

  const [backendAccounts, pgAccounts] = await Promise.all([
    fetchBackendOwnedTradingAccounts(scope),
    fetchPgOwnedTradingAccounts(scope),
  ]);
  const mergedAccounts = mergeOwnedAccounts(
    localSnapshot.tradingAccounts,
    backendAccounts,
    pgAccounts,
  );
  const mergedMatch = findOwnedMt5Account(
    mergedAccounts,
    requestedAccountId,
    requestedLogin,
    scope.brokerId,
  );
  if (mergedMatch || !requestedLogin) {
    return mergedMatch;
  }

  const synced = await syncMissingOwnedMt5Account(scope, requestedLogin);
  if (!synced) {
    return null;
  }

  return findOwnedMt5Account(
    await fetchPgOwnedTradingAccounts(scope),
    requestedAccountId,
    requestedLogin,
    scope.brokerId,
  );
};

export const resolveOwnedMt5Login = async (
  user: BrokerScopedUser,
  accountIdOrLogin: string,
): Promise<string | null> =>
  (await resolveOwnedMt5Account(user, accountIdOrLogin))?.login ?? null;

export const getExplicitMt5GroupAllowlist = (): string[] =>
  uniqueStrings(
    EXPLICIT_GROUP_ALLOWLIST_ENV_KEYS.flatMap((key) =>
      parseDelimitedList(resolveEnvValue(key)),
    ),
  );

export const getAllowedMt5GroupsForUser = async (
  user: BrokerScopedUser,
): Promise<string[]> => {
  const ownedAccounts = await getOwnedMt5Accounts(user);
  const ownedGroups = ownedAccounts
    .map(({ account }) => extractMt5GroupFromAccount(account))
    .filter((group): group is string => Boolean(group));

  return uniqueStrings([
    ...getExplicitMt5GroupAllowlist(),
    ...ownedGroups,
  ]);
};

export const isMt5GroupAllowedForUser = async (
  user: BrokerScopedUser,
  group: string,
): Promise<boolean> => {
  const normalizedGroup = group.trim();
  if (!normalizedGroup) {
    return false;
  }

  const allowedGroups = await getAllowedMt5GroupsForUser(user);
  return allowedGroups.includes(normalizedGroup);
};
