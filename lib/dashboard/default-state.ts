import type { DashboardSnapshot, WalletBalances } from "@/types/dashboard";

export const INITIAL_WALLETS: WalletBalances = {
  USD: 0,
  EUR: 0,
};

export const EMPTY_DASHBOARD_SNAPSHOT: DashboardSnapshot = {
  marketInstruments: [],
  tradingSessions: [],
  wallets: INITIAL_WALLETS,
  positions: [],
  transactions: [],
  pnlSeries: [],
  tradingAccounts: [],
};

