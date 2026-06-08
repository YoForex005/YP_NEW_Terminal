import type { Layouts } from "react-grid-layout";

import type { WidgetId } from "@/types/dashboard";

export const DASHBOARD_WIDGET_ORDER: WidgetId[] = [
  "account-overview",
  "market-overview",
  "deposit-withdrawal",
  "trading-sessions",
  "active-positions",
  "recent-trades",
  "entertainment",
];

export const WIDGET_META: Record<
  WidgetId,
  {
    title: string;
    description: string;
    category: "account" | "market" | "trading" | "tools";
    size: "small" | "medium" | "large";
  }
> = {
  "account-overview": {
    title: "Account Overview",
    description: "Balance, equity, margin level, and P&L summary",
    category: "account",
    size: "large",
  },
  "trading-statistics": {
    title: "Trading Statistics",
    description: "Performance metrics and trading insights",
    category: "trading",
    size: "medium",
  },
  "recent-trades": {
    title: "Recent Trades",
    description: "Trade history with performance analysis",
    category: "trading",
    size: "large",
  },
  entertainment: {
    title: "Entertainment",
    description: "Fun games for traders - roulette, card color, crash",
    category: "tools",
    size: "medium",
  },
  "market-overview": {
    title: "Market Overview",
    description: "Currency pair prices and market sentiment",
    category: "market",
    size: "large",
  },
  "deposit-withdrawal": {
    title: "Deposit & Withdrawal",
    description: "Quick funding options and transaction history",
    category: "account",
    size: "medium",
  },
  "trading-sessions": {
    title: "Trading Sessions",
    description: "Global trading sessions and optimal trading times",
    category: "market",
    size: "medium",
  },
  "active-positions": {
    title: "Active Positions",
    description: "Current open positions with real-time P&L",
    category: "trading",
    size: "medium",
  },
};

export const DEFAULT_WIDGET_LAYOUTS: Layouts = {
  lg: [
    { i: "market-overview", x: 0, y: 0, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "deposit-withdrawal", x: 6, y: 0, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "trading-sessions", x: 0, y: 14, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "active-positions", x: 6, y: 14, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "account-overview", x: 0, y: 28, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "recent-trades", x: 6, y: 28, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "entertainment", x: 0, y: 42, w: 6, h: 18, minW: 3, minH: 14 },
    { i: "trading-statistics", x: 6, y: 42, w: 6, h: 14, minW: 3, minH: 8 },
  ],
  md: [
    { i: "market-overview", x: 0, y: 0, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "deposit-withdrawal", x: 6, y: 0, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "trading-sessions", x: 0, y: 14, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "active-positions", x: 6, y: 14, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "account-overview", x: 0, y: 28, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "recent-trades", x: 6, y: 28, w: 6, h: 14, minW: 3, minH: 8 },
    { i: "entertainment", x: 0, y: 42, w: 6, h: 18, minW: 3, minH: 14 },
    { i: "trading-statistics", x: 6, y: 42, w: 6, h: 14, minW: 3, minH: 8 },
  ],
  sm: [
    { i: "market-overview", x: 0, y: 0, w: 1, h: 16, minW: 1, minH: 12 },
    { i: "deposit-withdrawal", x: 0, y: 16, w: 1, h: 16, minW: 1, minH: 12 },
    { i: "trading-sessions", x: 0, y: 32, w: 1, h: 16, minW: 1, minH: 12 },
    { i: "active-positions", x: 0, y: 48, w: 1, h: 18, minW: 1, minH: 14 },
    { i: "account-overview", x: 0, y: 66, w: 1, h: 18, minW: 1, minH: 14 },
    { i: "recent-trades", x: 0, y: 84, w: 1, h: 22, minW: 1, minH: 22 },
    { i: "entertainment", x: 0, y: 106, w: 1, h: 20, minW: 1, minH: 20 },
    { i: "trading-statistics", x: 0, y: 126, w: 1, h: 22, minW: 1, minH: 22 },
  ],
};

