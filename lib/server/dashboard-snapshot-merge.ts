import { extractMt5LoginFromAccount } from "@/lib/server/accounts-backend";
import type { DashboardSnapshot, TradingAccount } from "@/types/dashboard";

/**
 * Merges full backend account rows over local dashboard accounts.
 * Account cards should use backend fields whenever the backend has the account.
 */
export const mergeFullPgAccounts = (
  localAccounts: TradingAccount[],
  pgAccounts: TradingAccount[],
): TradingAccount[] => {
  const normalizeLogin = (value: string | null | undefined) => {
    const trimmed = value?.trim() ?? "";
    return /^\d+$/.test(trimmed) ? trimmed : "";
  };

  const resolveAccountNumber = (account: TradingAccount) =>
    normalizeLogin(account.accountNumber);

  const resolveCredentialsLogin = (account: TradingAccount) =>
    normalizeLogin(account.credentials?.login);

  const platformsCompatible = (
    localAccount: TradingAccount,
    pgAccount: TradingAccount,
  ) => {
    if (localAccount.platform === "ctrader" || pgAccount.platform === "ctrader") {
      return localAccount.platform === pgAccount.platform;
    }

    return localAccount.platform === pgAccount.platform;
  };

  const isSameBackendAccount = (
    localAccount: TradingAccount,
    pgAccount: TradingAccount,
  ) => {
    if (!platformsCompatible(localAccount, pgAccount)) {
      return false;
    }

    const localAccountNumber = resolveAccountNumber(localAccount);
    const pgAccountNumber = resolveAccountNumber(pgAccount);
    if (localAccountNumber && pgAccountNumber) {
      return localAccountNumber === pgAccountNumber;
    }
    if (localAccountNumber || pgAccountNumber) {
      return false;
    }

    const localCredentialsLogin = resolveCredentialsLogin(localAccount);
    const pgCredentialsLogin = resolveCredentialsLogin(pgAccount);
    return Boolean(
      localCredentialsLogin &&
        pgCredentialsLogin &&
        localCredentialsLogin === pgCredentialsLogin,
    );
  };

  const merged = localAccounts.map((localAccount) => {
    const pgAccount = pgAccounts.find((entry) =>
      isSameBackendAccount(localAccount, entry),
    );

    if (!pgAccount) {
      return localAccount;
    }

    return {
      ...localAccount,
      ...pgAccount,
      id: localAccount.id,
      balance: Number.isFinite(pgAccount.balance) ? pgAccount.balance : localAccount.balance,
      equity: Number.isFinite(pgAccount.equity) ? pgAccount.equity : localAccount.equity,
      freeMargin: Number.isFinite(pgAccount.freeMargin) ? pgAccount.freeMargin : localAccount.freeMargin,
      status: pgAccount.status ?? localAccount.status,
      createdAt: pgAccount.createdAt ?? localAccount.createdAt,
      serverIp: pgAccount.serverIp || localAccount.serverIp,
      leverage: pgAccount.leverage ?? localAccount.leverage,
      credentials: pgAccount.credentials ?? localAccount.credentials,
      transactions: localAccount.transactions ?? pgAccount.transactions,
      stats: localAccount.stats ?? pgAccount.stats,
    };
  });

  for (const pgAccount of pgAccounts) {
    const exists = merged.some((entry) => isSameBackendAccount(entry, pgAccount));

    if (!exists) {
      merged.push(pgAccount);
    }
  }

  return merged;
};

export const mergeTradingAccountsFromSnapshots = (
  localSnapshot: DashboardSnapshot,
  backendSnapshot: DashboardSnapshot,
): TradingAccount[] => {
  const mergedAccounts = localSnapshot.tradingAccounts.map((localAccount) => {
    if (localAccount.platform === "ctrader") {
      return localAccount;
    }

    const localLogin = extractMt5LoginFromAccount(localAccount);
    const backendMatch = backendSnapshot.tradingAccounts.find((entry) => {
      const backendLogin = extractMt5LoginFromAccount(entry);
      return backendLogin && localLogin && backendLogin === localLogin;
    });

    if (!backendMatch) {
      return localAccount;
    }

    return {
      ...localAccount,
      balance: Number.isFinite(backendMatch.balance)
        ? backendMatch.balance
        : localAccount.balance,
      equity: Number.isFinite(backendMatch.equity)
        ? backendMatch.equity
        : Number.isFinite(backendMatch.balance)
          ? backendMatch.balance
          : localAccount.equity,
      freeMargin: Number.isFinite(backendMatch.freeMargin)
        ? backendMatch.freeMargin
        : Number.isFinite(backendMatch.balance)
          ? backendMatch.balance
          : localAccount.freeMargin,
    };
  });

  for (const backendAccount of backendSnapshot.tradingAccounts) {
    const backendLogin = extractMt5LoginFromAccount(backendAccount);
    const isDuplicate = mergedAccounts.some((entry) => {
      if (entry.id === backendAccount.id) {
        return true;
      }

      const localLogin = extractMt5LoginFromAccount(entry);
      return backendLogin && localLogin && backendLogin === localLogin;
    });

    if (!isDuplicate) {
      mergedAccounts.push(backendAccount);
    }
  }

  return mergedAccounts;
};

export const mergeDashboardSnapshots = (
  localSnapshot: DashboardSnapshot,
  backendSnapshot: DashboardSnapshot,
): DashboardSnapshot => {
  const tradingAccounts = mergeTradingAccountsFromSnapshots(
    localSnapshot,
    backendSnapshot,
  );

  const positionsById = new Map(
    localSnapshot.positions.map((position) => [position.id, position]),
  );
  for (const backendPosition of backendSnapshot.positions) {
    positionsById.set(backendPosition.id, backendPosition);
  }

  return {
    ...localSnapshot,
    wallets: backendSnapshot.wallets,
    tradingAccounts,
    transactions: backendSnapshot.transactions,
    positions: [...positionsById.values()],
    marketInstruments:
      backendSnapshot.marketInstruments || localSnapshot.marketInstruments,
    tradingSessions:
      backendSnapshot.tradingSessions || localSnapshot.tradingSessions,
    pnlSeries: backendSnapshot.pnlSeries?.length
      ? backendSnapshot.pnlSeries
      : localSnapshot.pnlSeries,
    accountPnlSeries:
      backendSnapshot.accountPnlSeries ?? localSnapshot.accountPnlSeries,
  };
};
