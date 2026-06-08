export type WidgetId = "market-overview" | "deposit-withdrawal" | "trading-sessions" | "active-positions" | "account-overview" | "trading-statistics" | "recent-trades" | "entertainment";

export type FundsTab = "deposit" | "withdraw" | "history";

export type CurrencyCode = "USD" | "EUR";

export type PaymentMethod = "crypto" | "card";

export type SessionStatus = "Active" | "Opening Soon" | "Closed";

export interface MarketInstrument {
  id: string;
  name: string;
  label: string;
  sentiment: "BUY" | "NEUTRAL" | "SELL";
  short: number;
  medium: number;
  long: number;
  trend: "Bullish" | "Neutral" | "Bearish";
  score: number;
}

export interface TradingSession {
  id: string;
  city: string;
  utcOpenHour: number;
  utcCloseHour: number;
  timezone: string;
  marker: [number, number];
}

export interface Position {
  id: string;
  symbol: string;
  side: "Buy" | "Sell";
  volume: number;
  pnl: number;
  accountLogin?: string;
}

export interface Transaction {
  id: string;
  type: "Deposit" | "Withdrawal" | "Transfer to MT5" | "Transfer from MT5" | "Transfer to cTrader" | "Transfer to cTrader Demo" | "Transfer from cTrader" | "Transfer from cTrader Demo" | "Admin Adjustment";
  amount: number;
  currency: CurrencyCode;
  method: PaymentMethod;
  status: "Completed" | "Rejected" | "Processing" | "Pending";
  createdAt: string;
  /** MT5 login number, e.g. "900847". Only present on MT5 transfer transactions. */
  targetAccount?: string;
}

export type WalletBalances = Record<CurrencyCode, number>;

export interface PnlPoint {
  t: string;
  value: number;
}

export interface TradingAccount {
  id: string;
  accountNumber: string;
  name: string;
  platform: "mt5" | "mt4" | "ctrader";
  type: "Live" | "Demo";
  leverage?: number;
  serverIp?: string;
  currency: string;
  balance: number;
  equity: number;
  freeMargin: number;
  margin: number | string;
  status: "Active" | "Archived";
  createdAt?: string;
  archivedAt?: string;
  credentials?: TradingAccountCredentials;
  transactions?: Transaction[];
  stats?: TradingStats;
}

export interface TradingAccountCredentials {
  login: string;
  server: string;
  tradingPassword: string;
  investorPassword: string;
  generatedAt: string;
  source?: "broker" | "local";
}

export interface TradingStats {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  totalVolume: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  totalCommission?: number;
  totalSwap?: number;
}

export interface DashboardSnapshot {
  marketInstruments: MarketInstrument[];
  tradingSessions: TradingSession[];
  wallets: WalletBalances;
  positions: Position[];
  transactions: Transaction[];
  pnlSeries: PnlPoint[];
  accountPnlSeries?: Record<string, PnlPoint[]>;
  tradingAccounts: TradingAccount[];
}

export interface SocialStrategy {
  id: string;
  name: string;
  description: string;
  avatar: string;
  riskLevel: "Low" | "Medium" | "High";
  totalProfit: number;
  winRate: number;
  maxDrawdown: number;
  followers: number;
  trades: number;
  profitFactor: number; // Added
  sharpeRatio: number;
  avgTradePnl: number;
  bestTrade: number;
  worstTrade: number;
  masterEquity: number;
  minBalance: number;
  recoveryFactor: number;
  expectedPayoff: number;
  monthlyReturns: {
    year: number;
    jan?: number; feb?: number; mar?: number; apr?: number; may?: number; jun?: number;
    jul?: number; aug?: number; sep?: number; oct?: number; nov?: number; dec?: number;
  }[];
  longTradesStats: {
    total: number;
    won: number;
    avgProfit: number;
    avgLoss: number;
  };
  shortTradesStats: {
    total: number;
    won: number;
    avgProfit: number;
    avgLoss: number;
  };
  fee: number; // percentage (management fee?)
  performanceFee: number; // percentage
  joinedAt: string; // ISO date for "Newest"
  chartData: { date: string; value: number }[];
  tags: string[];
}
