/**
 * Trading Constants
 * Configuration and constants for WebTrader
 */

// WebSocket Server Configuration
const DEFAULT_PING_INTERVAL_MS: number = 30_000;
const DEFAULT_PONG_TIMEOUT_MS: number = 90_000;

export const WS_CONFIG = {
  URL: process.env.NEXT_PUBLIC_WS_URL || '/ws',
  RECONNECT_INTERVAL: 1000,
  MAX_RECONNECT_ATTEMPTS: 12,
  PING_INTERVAL: DEFAULT_PING_INTERVAL_MS,
  PONG_TIMEOUT: DEFAULT_PONG_TIMEOUT_MS,
  TIMEOUT: 15000,
  CONNECT_TIMEOUT_MS: 8000,
} as const;

// Dedicated WebSocket route URLs — each serves a focused subset of events/actions.
// Falls back to the base /ws (full mode) if env var is not set.
export const WS_ROUTES = {
  FULL:    process.env.NEXT_PUBLIC_WS_URL || '/ws',
  MARKET:  process.env.NEXT_PUBLIC_WS_MARKET_URL || process.env.NEXT_PUBLIC_WS_URL || '/ws',
  OHLC:    process.env.NEXT_PUBLIC_WS_OHLC_URL || process.env.NEXT_PUBLIC_WS_URL || '/ws',
  ACCOUNT: process.env.NEXT_PUBLIC_WS_ACCOUNT_URL || process.env.NEXT_PUBLIC_WS_URL || '/ws',
  TRADE:   process.env.NEXT_PUBLIC_WS_TRADE_URL || process.env.NEXT_PUBLIC_WS_URL || '/ws',
} as const;

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/trading/auth',
  AUTH_LOGOUT: '/api/trading/logout',

  // Account
  ACCOUNT_INFO: '/api/trading/account',
  ACCOUNT_HISTORY: '/api/trading/history',

  // Trading
  ORDERS: '/api/trading/orders',
  POSITIONS: '/api/trading/positions',

  // Market Data
  SYMBOLS: '/api/trading/symbols',
  SYMBOL_INFO: '/api/trading/symbols',

  // Quotes
  QUOTES: '/api/trading/quotes',
} as const;

// Default MT5 Servers
export const DEFAULT_MT5_SERVERS = [
  { id: 'flexy', name: 'FlexyMarkets-Server', host: '89.21.67.29', port: 443 },
  { id: 'demo', name: 'MetaQuotes-Demo', host: 'demo.metaquotes.net', port: 443 },
] as const;

// Order Types
export const ORDER_TYPES = {
  MARKET_BUY: 'buy',
  MARKET_SELL: 'sell',
  BUY_LIMIT: 'buy_limit',
  SELL_LIMIT: 'sell_limit',
  BUY_STOP: 'buy_stop',
  SELL_STOP: 'sell_stop',
  BUY_STOP_LIMIT: 'buy_stop_limit',
  SELL_STOP_LIMIT: 'sell_stop_limit',
} as const;

// Order Type Labels
export const ORDER_TYPE_LABELS: Record<string, string> = {
  buy: 'Market Buy',
  sell: 'Market Sell',
  buy_limit: 'Buy Limit',
  sell_limit: 'Sell Limit',
  buy_stop: 'Buy Stop',
  sell_stop: 'Sell Stop',
  buy_stop_limit: 'Buy Stop Limit',
  sell_stop_limit: 'Sell Stop Limit',
};

// Timeframes
export const TIMEFRAMES = [
  { value: 'M1', label: '1 minute', seconds: 60 },
  { value: 'M5', label: '5 minutes', seconds: 300 },
  { value: 'M15', label: '15 minutes', seconds: 900 },
  { value: 'M30', label: '30 minutes', seconds: 1800 },
  { value: 'H1', label: '1 hour', seconds: 3600 },
  { value: 'H4', label: '4 hours', seconds: 14400 },
  { value: 'D1', label: 'Daily', seconds: 86400 },
  { value: 'W1', label: 'Weekly', seconds: 604800 },
  { value: 'MN1', label: 'Monthly', seconds: 2592000 },
] as const;

// Default Timeframe
export const DEFAULT_TIMEFRAME = 'M1';

// Chart Types
export const CHART_TYPES = [
  { value: 'candlestick', label: 'Candlestick' },
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
] as const;

// Default Symbol Categories
export const SYMBOL_CATEGORIES = [
  { id: 'forex', label: 'Forex', icon: '💱' },
  { id: 'crypto', label: 'Crypto', icon: '₿' },
  { id: 'indices', label: 'Indices', icon: '📊' },
  { id: 'commodities', label: 'Commodities', icon: '🛢️' },
  { id: 'stocks', label: 'Stocks', icon: '📈' },
] as const;

// Lot Size Configuration
export const LOT_CONFIG = {
  MIN: 0.01,
  MAX: 1000,
  STEP: 0.01,
  DEFAULT: 0.1,
} as const;

// Deviation (Slippage) Configuration
export const DEVIATION_CONFIG = {
  MIN: 0,
  MAX: 1000,
  STEP: 1,
  DEFAULT: 10,
} as const;

// Filling Modes
export const FILLING_MODES = [
  { value: 'ioc', label: 'Immediate or Cancel' },
  { value: 'return', label: 'Return' },
  { value: 'fok', label: 'Fill or Kill' },
] as const;

// Default Filling Mode
export const DEFAULT_FILLING_MODE = 'ioc';

// Price Colors
export const PRICE_COLORS = {
  UP: 'text-emerald-500',
  DOWN: 'text-rose-500',
  NEUTRAL: 'text-foreground',
} as const;

// Position Colors
export const POSITION_COLORS = {
  BUY: 'text-emerald-500',
  SELL: 'text-rose-500',
} as const;

// Profit Colors
export const PROFIT_COLORS = {
  POSITIVE: 'text-emerald-500',
  NEGATIVE: 'text-rose-500',
  NEUTRAL: 'text-muted-foreground',
} as const;

// Connection Status Colors
export const CONNECTION_STATUS_COLORS = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-500',
  disconnected: 'bg-rose-500',
  error: 'bg-rose-500',
  reconnecting: 'bg-amber-500',
} as const;

// Trade Retcode Messages
export const TRADE_RETCODE_MESSAGES: Record<number, string> = {
  10004: 'Requote',
  10006: 'Request rejected',
  10007: 'Request canceled by trader',
  10008: 'Order placed',
  10009: 'Request completed',
  10010: 'Only part of the request was completed',
  10011: 'Request processing error',
  10012: 'Request timed out',
  10013: 'Invalid request',
  10014: 'Invalid volume in request',
  10015: 'Invalid price in request',
  10016: 'Invalid stops in request',
  10017: 'Trade not allowed',
  10018: 'Market closed',
  10019: 'No money to complete the request',
  10020: 'Price changed',
  10021: 'No quotes to process the request',
  10022: 'Invalid order expiration in request',
  10023: 'Order state changed',
  10024: 'Too frequent requests',
  10025: 'No changes in request',
  10026: 'Autotrading disabled by server',
  10027: 'Autotrading disabled by client terminal',
  10028: 'Request locked for processing',
  10029: 'Order or position frozen',
  10030: 'Invalid fill type',
  10031: 'No connection with trade server',
  10032: 'Operation allowed only for live accounts',
  10033: 'The maximum number of pending orders has been reached',
  10034: 'The maximum order volume is reached',
  10035: 'Processing of the request is disabled',
  10036: 'The maximum depth of the symbol market is reached',
};

// Date Format Options
export const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

// Number Format Options
export const PRICE_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 5,
};

// Volume Format Options
export const VOLUME_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

// Currency Format Options
export const CURRENCY_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

// Session Storage Keys
export const STORAGE_KEYS = {
  SESSION: 'webtrader_session',
  SERVERS: 'webtrader_servers',
  FAVORITES: 'webtrader_favorites',
  CHART_SETTINGS: 'webtrader_chart_settings',
} as const;

// Local Storage Keys (non-sensitive)
export const LOCAL_STORAGE_KEYS = {
  SELECTED_SERVER: 'webtrader_selected_server',
  MARKET_WATCH_WIDTH: 'webtrader_market_watch_width',
  CHART_SYMBOL: 'webtrader_chart_symbol',
  CHART_TIMEFRAME: 'webtrader_chart_timeframe',
} as const;
