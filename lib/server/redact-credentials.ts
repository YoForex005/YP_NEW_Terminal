import type { DashboardSnapshot, TradingAccount } from "@/types/dashboard";

/**
 * Strip MT5 trading/investor passwords before any browser-facing JSON response.
 * Login/server metadata stay so UI can still show account identity.
 */
export function redactTradingAccountCredentials(account: TradingAccount): TradingAccount {
  if (!account.credentials) {
    return account;
  }

  return {
    ...account,
    credentials: {
      ...account.credentials,
      tradingPassword: "",
      investorPassword: "",
    },
  };
}

export function redactDashboardSnapshotForClient(
  snapshot: DashboardSnapshot,
): DashboardSnapshot {
  return {
    ...snapshot,
    tradingAccounts: (snapshot.tradingAccounts ?? []).map(redactTradingAccountCredentials),
  };
}
