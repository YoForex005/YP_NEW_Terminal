/**
 * Raw WebSocket client for the MT5 realtime backend.
 */

import { WS_CONFIG } from './constants';
import { getSymbolAliases, normalizeSymbolKey, symbolsMatch } from '@/lib/market-symbols';
import {
  WebSocketStreamDiagnostics,
  WebSocketStreamKey,
  WebSocketStreamListener,
  WebSocketStreamRouter,
  WebSocketStreamWildcard,
} from './websocket-stream-router';
import {
  TradingSession,
  PriceTick,
  Order,
  Position,
  TradingAccountInfo,
  SymbolInfo,
  TerminalBootstrapState,
  TradeRequest,
  TradeResult,
  QuoteStatus,
  OrderUpdatePayload,
  PositionUpdatePayload,
  AccountUpdatePayload,
  TradeResultPayload,
  TickPayload,
  Deal,
} from '@/types/webtrader';

type TimeoutHandle = ReturnType<typeof setTimeout>;
type IntervalHandle = ReturnType<typeof setInterval>;

type EventCallback<T> = (data: T) => void;
type AuthTokenProvider = () => Promise<string>;
type ConnectionStatusPayload = {
  status: string;
  message?: string;
  degraded?: boolean;
  warnings?: unknown;
};
export type MarketStatusPayload = {
  status: string;
  symbol?: string;
  isOpen?: boolean;
  message?: string;
  quoteStatus?: QuoteStatus;
  timestamp?: Date;
  raw: unknown;
};
export type SymbolUpdateRealtimePayload = Partial<SymbolInfo> & Pick<SymbolInfo, 'name'>;

interface WebSocketEventCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
  onAuthenticated?: (session: TradingSession) => void;
  onAuthError?: (error: string) => void;
  onTick?: (tick: PriceTick) => void;
  onOrderUpdate?: (payload: OrderUpdatePayload) => void;
  onPositionUpdate?: (payload: PositionUpdatePayload) => void;
  onOrdersSnapshot?: (orders: Order[]) => void;
  onPositionsSnapshot?: (positions: Position[]) => void;
  onAccountUpdate?: (payload: AccountUpdatePayload) => void;
  onSymbolList?: (symbols: SymbolInfo[]) => void;
  onSymbolUpdate?: (symbol: SymbolUpdateRealtimePayload) => void;
  onMarketStatus?: (status: MarketStatusPayload) => void;
  onTradeResult?: (payload: TradeResultPayload) => void;
  onOhlcHistoryMetadata?: (metadata: OhlcHistoryResponseMetadata) => void;
  onConnectionStatus?: (status: ConnectionStatusPayload) => void;
  // Fired whenever a heartbeat/pong or connection_status message carries a live
  // mt5ServerTimeMs field from the broker. Use this to keep mt5ServerTimeMs in
  // the store up-to-date independently of tick data.
  onMt5TimeUpdate?: (mt5ServerTimeMs: number) => void;
}

interface AuthCredentials {
  login: number;
  password: string;
  server: string;
}

export interface WebSocketClientOptions {
  wsUrl?: string;
  /** Prevent bootstrap state refresh on session restore (use for specialized endpoints that don't support request_bootstrap_state). */
  skipBootstrapRefresh?: boolean;
}

export interface GetPositionsOptions {
  /** Bypass recent-snapshot dedupe and supersede any active positions request. */
  force?: boolean;
  /** Drop cached and in-flight positions state before refreshing. */
  invalidateCache?: boolean;
  /** Join an active positions request before forcing a new one. */
  coalesceInFlight?: boolean;
}

interface ServerEnvelope {
  event?: string;
  type?: string;
  requestId?: string;
  stream?: string;
  streamId?: string;
  priority?: number | string;
  coalesceKey?: string;
  data?: unknown;
  payload?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  timeout: TimeoutHandle;
  action: string;
  data?: unknown;
  clientSentAtMs: number;
}

interface RecentTradeRequestCorrelation {
  action: string;
  data?: unknown;
  expiresAtMs: number;
}

interface AuthWaiter {
  resolve: () => void;
  reject: (reason?: unknown) => void;
  timeout: TimeoutHandle;
}

interface SessionQueryRetry {
  code?: string;
  message: string;
  retryAfterMs: number;
  waitForAuthentication?: boolean;
}

interface OhlcSubscriptionRequest {
  symbol: string;
  timeframeMinutes: number;
}

interface OhlcHistoryRange {
  fromUnixMs?: number;
  toUnixMs?: number;
  beforeUnixMs?: number;
  requestType?: string;
  type?: string;
  cacheFirst?: boolean;
  cacheOnly?: boolean;
}

export interface OhlcSubscriptionAckTiming {
  serverReceivedAtMs?: number;
  serverAckAtMs?: number;
  serverProcessingMs?: number;
  [key: string]: unknown;
}

export interface OhlcSubscriptionAckClientTiming {
  clientSentAtMs: number;
  clientAckReceivedAtMs: number;
  clientAckLatencyMs: number;
  roundTripMs: number;
  [key: string]: unknown;
}

export interface OhlcSubscriptionAckEntry {
  symbol: string;
  timeframeMinutes: number;
  [key: string]: unknown;
}

export interface OhlcSubscriptionAck {
  requestId?: string;
  action?: string;
  ack?: boolean;
  subscribed?: boolean;
  symbol?: string;
  timeframeMinutes?: number;
  timeframeSeconds?: number;
  effectiveIntervalMs?: number;
  effectiveIntervalSeconds?: number;
  serverReceivedAtMs?: number;
  serverAckAtMs?: number;
  serverProcessingMs?: number;
  clientSentAtMs?: number;
  clientAckReceivedAtMs?: number;
  clientAckLatencyMs?: number;
  roundTripMs?: number;
  timing?: OhlcSubscriptionAckTiming;
  clientTiming?: OhlcSubscriptionAckClientTiming;
  ohlcSubscriptions?: OhlcSubscriptionAckEntry[];
  [key: string]: unknown;
}

export interface OhlcPayload {
  symbol: string;
  timeframeMinutes: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTimeMs: number;
  closeTimeMs?: number;
  closed?: boolean;
  source?: string;
  derived?: boolean;
  continuity?: boolean;
  isContinuity?: boolean;
  basis?: string;
  cached?: boolean;
}

export interface OhlcHistoryMetadata {
  symbol?: string;
  brokerSymbol?: string;
  brokerSymbolCandidates?: string[];
  timeframeMinutes?: number;
  requestedLimit?: number;
  returnedBarCount?: number;
  realBarCount?: number;
  historySparse?: boolean;
  historyGapped?: boolean;
  historyStale?: boolean;
  source?: string;
  managerFetchAttempted?: boolean;
  managerFetchSucceeded?: boolean;
  managerFetchBarCount?: number;
  syntheticCandlesGenerated?: boolean;
  firstOpenTimeMs?: number;
  lastOpenTimeMs?: number;
  fromUnixMs?: number;
  toUnixMs?: number;
  [key: string]: unknown;
}

export interface OhlcHistoryResponseMetadata {
  event?: string;
  status?: string;
  symbol?: string;
  brokerSymbol?: string;
  brokerSymbolCandidates?: string[];
  timeframeMinutes?: number;
  limit?: number;
  requestedLimit?: number;
  barCount?: number;
  returnedBarCount?: number;
  realBarCount?: number;
  shouldReload?: boolean;
  message?: string;
  metadata?: OhlcHistoryMetadata;
  warnings?: unknown;
  notes?: unknown;
  historySparse: boolean;
  historyGapped: boolean;
  historyStale?: boolean;
  managerFetchDeferred: boolean;
  managerFetchPending?: boolean;
  managerFetchSucceeded?: boolean;
  source?: string;
  fromUnixMs?: number;
  toUnixMs?: number;
  bars?: OhlcPayload[];
}

export interface OhlcHistoryResponse {
  bars: OhlcPayload[];
  metadata: OhlcHistoryResponseMetadata;
}

export type OhlcHistoryBars = OhlcPayload[] & {
  readonly historyMetadata?: OhlcHistoryResponseMetadata;
  readonly __ohlcHistoryMetadata?: OhlcHistoryResponseMetadata;
};

const SYMBOL_SUBSCRIPTION_BATCH_SIZE = 25;
const BOOTSTRAP_STATE_TIMEOUT_MS = 90_000;
const TRADE_EXECUTION_TIMEOUT_MS = Math.max(WS_CONFIG.TIMEOUT, 45_000);
const TRADE_REQUEST_CORRELATION_TTL_MS = Math.max(TRADE_EXECUTION_TIMEOUT_MS * 3, 120_000);
const OHLC_REPLAY_CACHE_LIMIT = 512;
const REALTIME_EVENT_DEDUP_TTL_MS = 50;
const REALTIME_EVENT_DEDUP_CACHE_LIMIT = 512;
const REALTIME_EVENT_DEDUP_CLEANUP_INTERVAL = 64;
const OHLC_HISTORY_METADATA_PROPERTY = '__ohlcHistoryMetadata';
export const DEFAULT_OHLC_HISTORY_LIMIT = 5_000;
const SLOW_RECONNECT_INITIAL_INTERVAL_MS = 3_000;
const SLOW_RECONNECT_MAX_INTERVAL_MS = 15_000;
const TOKEN_REFRESH_SAFETY_MARGIN_MS = 60_000;
const TOKEN_REFRESH_MIN_DELAY_MS = 5_000;
const TOKEN_REFRESH_RETRY_DELAY_MS = 10_000;
const TOKEN_REFRESH_JITTER_MS = 5_000;
const SESSION_QUERY_RETRY_ATTEMPTS = 8;
const SESSION_QUERY_RETRY_FALLBACK_MS = 250;
const SESSION_QUERY_RETRY_MAX_DELAY_MS = 1_250;
const SESSION_QUERY_RECONNECT_WAIT_MS = 12_000;
const POSITIONS_REFRESH_DEDUPE_MS = 5_000;
export const MAX_PENDING_WEBSOCKET_REQUESTS = 128;
const sessionQueryReconnectRetryResponses = new WeakSet<Record<string, unknown>>();

const normalizeWebSocketUrl = (url: string): string => {
  const trimmedUrl = url.trim();
  if (trimmedUrl.startsWith('ws://') || trimmedUrl.startsWith('wss://')) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith('http://')) {
    return `ws://${trimmedUrl.slice('http://'.length)}`;
  }

  if (trimmedUrl.startsWith('https://')) {
    return `wss://${trimmedUrl.slice('https://'.length)}`;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return new URL(trimmedUrl, `${protocol}//${window.location.host}`).toString();
  }

  return trimmedUrl;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }

  if (isObject(value)) {
    return Object.entries(value)
      .filter(([, entryValue]) => Boolean(entryValue) && entryValue !== false)
      .map(([key]) => key);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const parseNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
};

const parseOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
};

const parseOptionalFiniteNumber = (value: unknown): number | undefined => {
  const parsed = parseNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const parsePositiveSecondsToMs = (value: unknown): number | null => {
  const seconds = parseNumber(value);
  return seconds > 0 ? seconds * 1000 : null;
};

const decodeBase64UrlJson = (value: string): unknown => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );

  if (typeof globalThis.atob !== 'function') {
    throw new Error('Base64url decoding is not available in this runtime');
  }

  return JSON.parse(globalThis.atob(padded)) as unknown;
};

const parseAuthTokenExpiryMs = (token: string): number | null => {
  const segments = token.split('.');
  if (segments.length !== 2 || segments.some((segment) => segment.length === 0)) {
    return null;
  }

  try {
    const payload = decodeBase64UrlJson(segments[0]);
    if (!isObject(payload)) {
      return null;
    }

    const exp = parseNumber(payload.exp, Number.NaN);
    if (!Number.isFinite(exp) || exp <= 0) {
      return null;
    }

    return exp < 10_000_000_000 ? exp * 1000 : exp;
  } catch {
    return null;
  }
};

const createConnectionLostError = (reason: string): Error =>
  new Error(
    `${reason}. Connection lost; reconnecting. Pending trading requests were cancelled.`,
  );

const createWebSocketTransportError = (reason: string): Error =>
  new Error(
    `${reason}. Browser endpoint: ${normalizeWebSocketUrl(WS_CONFIG.URL)}. Check the gateway /health endpoint for upstream C++ realtime or MT5 quote errors; restart the C++ realtime service if needed and verify MT5 quote availability.`,
  );

const createServerError = (error: ServerEnvelope['error']): Error => {
  const code = error?.code?.trim();
  const message =
    error?.message?.trim() || 'Trading server returned an error.';
  const requestError = new Error(code ? `${code}: ${message}` : message);

  if (code) {
    Object.assign(requestError, { code });
  }

  const errorDetails = error?.details;
  if (errorDetails !== undefined) {
    Object.assign(requestError, { details: errorDetails });

    if (isObject(errorDetails)) {
      const retryable = parseOptionalBoolean(errorDetails.retryable);
      const retryAfterMs = parseOptionalFiniteNumber(errorDetails.retryAfterMs);
      Object.assign(requestError, {
        ...(retryable !== undefined ? { retryable } : {}),
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      });
    }
  }

  return requestError;
};

const getErrorPropertyAsString = (error: unknown, property: string): string | null => {
  if (!isObject(error)) {
    return null;
  }

  const value = error[property];
  if (typeof value === 'string') {
    return value;
  }

  return typeof value === 'number' ? String(value) : null;
};

const getErrorDetails = (error: unknown): Record<string, unknown> | undefined => {
  if (!isObject(error) || !isObject(error.details)) {
    return undefined;
  }

  return error.details;
};

const isPermanentTokenRefreshFailure = (error: unknown): boolean => {
  const code = getErrorPropertyAsString(error, 'code')?.toLowerCase() ?? '';
  const status = getErrorPropertyAsString(error, 'status')?.toLowerCase() ?? '';
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const combined = `${code} ${status} ${message}`;

  if (
    code === 'terminal_session_timeout' ||
    error instanceof DOMException ||
    /failed to fetch|networkerror|network error|timed out|timeout|still connecting|not ready yet|not connected|connection lost|websocket|transport|upstream closed|reconnecting/.test(
      combined,
    )
  ) {
    return false;
  }

  return /(^|\b)(401|403|unauthorized|forbidden|locked|password_required|invalid[_ -]?(token|session)|expired[_ -]?(token|session)|token_missing|session_state_missing|terminal_token_missing|terminal_session_failed)(\b|$)/.test(
    combined,
  );
};

const parseInteger = (value: unknown, fallback = 0): number => {
  const parsed = parseNumber(value, fallback);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

type CanonicalRealtimeEvent =
  | 'PRICE_UPDATE'
  | 'POSITION_UPDATE'
  | 'ORDER_UPDATE'
  | 'BALANCE_UPDATE'
  | 'HISTORY_UPDATE'
  | 'SYMBOL_LIST'
  | 'SYMBOL_UPDATE'
  | 'MARKET_STATUS';

const normalizeRealtimeEventName = (
  eventName: string,
): CanonicalRealtimeEvent | null => {
  switch (eventName.trim().toLowerCase()) {
    case 'price_update':
    case 'tick':
    case 'quote':
    case 'quotes':
      return 'PRICE_UPDATE';
    case 'position_update':
      return 'POSITION_UPDATE';
    case 'order_update':
      return 'ORDER_UPDATE';
    case 'balance_update':
    case 'account_update':
      return 'BALANCE_UPDATE';
    case 'history_update':
    case 'trade_history_update':
    case 'deal_update':
    case 'deals_update':
      return 'HISTORY_UPDATE';
    case 'symbol_list':
    case 'symbols_list':
    case 'symbols':
    case 'symbols_update':
    case 'market_symbols':
    case 'symbol_catalog':
      return 'SYMBOL_LIST';
    case 'symbol_update':
      return 'SYMBOL_UPDATE';
    case 'market_status':
      return 'MARKET_STATUS';
    default:
      return null;
  }
};

const parseDate = (value: unknown, fallback = Date.now()): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const unixMs = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(unixMs);
  }

  if (typeof value === 'string') {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      const unixMs = asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber;
      return new Date(unixMs);
    }

    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(fallback);
};

const normalizeOrderState = (value: unknown): Order['state'] => {
  const normalized = String(value ?? 'started').toLowerCase();

  switch (normalized) {
    case 'placed':
    case 'placing':
    case 'partial':
    case 'filled':
    case 'rejected':
    case 'modifying':
    case 'cancelling':
    case 'started':
    case 'expired':
      return normalized as Order['state'];
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    case 'modified':
      return 'modified';
    default:
      return 'started';
  }
};

const normalizeOrderType = (value: unknown): Order['type'] => {
  const normalized = String(value ?? 'buy').toLowerCase();

  switch (normalized) {
    case 'sell':
    case 'buy_limit':
    case 'sell_limit':
    case 'buy_stop':
    case 'sell_stop':
    case 'buy_stop_limit':
    case 'sell_stop_limit':
      return normalized as Order['type'];
    default:
      return 'buy';
  }
};

const normalizePositionType = (value: unknown): Position['type'] => {
  const normalized = String(value ?? 'buy').toLowerCase();
  return normalized === 'sell' ? 'sell' : 'buy';
};

const normalizeFillingMode = (value: unknown): Order['fillingMode'] => {
  const normalized = String(value ?? 'ioc').toLowerCase();

  switch (normalized) {
    case 'fok':
    case 'return':
      return normalized as Order['fillingMode'];
    default:
      return 'ioc';
  }
};

const mapTradeResult = (payload: unknown): TradeResult => {
  const source = isObject(payload) ? payload : {};

  return {
    retcode: parseInteger(source.retcode),
    deal: parseNumber(source.deal || undefined),
    order: parseNumber(source.order || undefined),
    volume: parseNumber(source.volume ?? source.confirmedVolume),
    price: parseNumber(source.price ?? source.confirmedPrice),
    bid: parseNumber(source.bid || undefined),
    ask: parseNumber(source.ask || undefined),
    comment:
      typeof source.comment === 'string' && source.comment.trim()
        ? source.comment
        : undefined,
    requestId:
      source.requestId !== undefined ? parseInteger(source.requestId) : undefined,
    retcodeExternal:
      source.retcodeExternal !== undefined
        ? parseInteger(source.retcodeExternal)
        : undefined,
    pending: source.pending === true ? true : undefined,
    outcomeUnknown: source.outcomeUnknown === true ? true : undefined,
    duplicateRetryBlocked: source.duplicateRetryBlocked === true ? true : undefined,
    retryAfterMs:
      source.retryAfterMs !== undefined
        ? parseNumber(source.retryAfterMs)
        : undefined,
  };
};

const mapAccountInfo = (payload: unknown): TradingAccountInfo | null => {
  if (!isObject(payload)) {
    return null;
  }

  const source =
    isObject(payload.account)
      ? payload.account
      : isObject(payload.accountInfo)
        ? payload.accountInfo
        : isObject(payload.payload)
          ? payload.payload
          : payload;
  const hasAccountFields = [
    'login',
    'balance',
    'equity',
    'margin',
    'marginFree',
    'freeMargin',
    'free_margin',
    'margin_free',
    'availableMargin',
    'available_margin',
  ].some((key) => key in source);
  if (!hasAccountFields) {
    return null;
  }

  const marginFree =
    source.marginFree ??
    source.freeMargin ??
    source.free_margin ??
    source.margin_free;
  const availableMargin =
    source.availableMargin ??
    source.available_margin ??
    source.marginAvailable ??
    source.margin_available ??
    marginFree;

  return {
    login: parseInteger(source.login),
    name: typeof source.name === 'string' ? source.name : '',
    server: typeof source.server === 'string' ? source.server : '',
    currency: typeof source.currency === 'string' ? source.currency : 'USD',
    leverage: parseInteger(source.leverage, 1),
    balance: parseNumber(source.balance),
    equity: parseNumber(source.equity),
    margin: parseNumber(source.margin),
    marginFree: parseNumber(marginFree),
    marginLevel: parseNumber(source.marginLevel ?? source.margin_level),
    marginInitial: parseNumber(source.marginInitial ?? source.margin_initial),
    marginMaintenance: parseNumber(source.marginMaintenance ?? source.margin_maintenance),
    profit: parseNumber(source.profit),
    swap: parseNumber(source.swap),
    commission: parseNumber(source.commission),
    credit: parseNumber(source.credit),
    limitOrders: parseInteger(source.limitOrders ?? source.limit_orders),
    availableMargin: parseNumber(availableMargin),
  };
};

const mapSymbol = (payload: unknown): SymbolInfo | null => {
  if (typeof payload === 'string') {
    const name = payload.trim();
    if (!name) {
      return null;
    }

    return {
      name,
      description: name,
      baseCurrency: '',
      quoteCurrency: '',
      digits: 5,
      point: 0,
      tickSize: 0,
      tickValue: 0,
      tradeContractSize: 0,
      tradeMode: 'disabled',
      calcMode: 'forex',
      volumeMin: 0,
      volumeMax: 0,
      volumeStep: 0,
      marginInitial: 0,
      marginMaintenance: 0,
      swapLong: 0,
      swapShort: 0,
    };
  }

  if (!isObject(payload)) {
    return null;
  }

  const name = parseOptionalString(payload.name) ?? parseOptionalString(payload.symbol) ?? '';

  return {
    name,
    description:
      parseOptionalString(payload.description) ?? name,
    baseCurrency:
      parseOptionalString(payload.baseCurrency ?? payload.base_currency) ?? '',
    quoteCurrency:
      parseOptionalString(payload.quoteCurrency ?? payload.quote_currency) ?? '',
    digits: parseInteger(payload.digits),
    point: parseNumber(payload.point),
    tickSize: parseNumber(payload.tickSize ?? payload.tick_size),
    tickValue: parseNumber(payload.tickValue ?? payload.tick_value),
    tradeContractSize: parseNumber(
      payload.tradeContractSize ?? payload.contractSize ?? payload.contract_size,
    ),
    tradeMode:
      typeof payload.tradeMode === 'string'
        ? (payload.tradeMode as SymbolInfo['tradeMode'])
        : typeof payload.trade_mode === 'string'
          ? (payload.trade_mode as SymbolInfo['tradeMode'])
        : 'disabled',
    calcMode:
      typeof payload.calcMode === 'string'
        ? (payload.calcMode as SymbolInfo['calcMode'])
        : typeof payload.calc_mode === 'string'
          ? (payload.calc_mode as SymbolInfo['calcMode'])
        : 'forex',
    volumeMin: parseNumber(payload.volumeMin ?? payload.volume_min),
    volumeMax: parseNumber(payload.volumeMax ?? payload.volume_max),
    volumeStep: parseNumber(payload.volumeStep ?? payload.volume_step),
    marginInitial: parseNumber(payload.marginInitial ?? payload.margin_initial),
    marginMaintenance: parseNumber(payload.marginMaintenance ?? payload.margin_maintenance),
    swapLong: parseNumber(payload.swapLong ?? payload.swap_long),
    swapShort: parseNumber(payload.swapShort ?? payload.swap_short),
    category:
      typeof payload.category === 'string' ? payload.category : undefined,
  };
};

const mapPosition = (payload: unknown): Position | null => {
  if (!isObject(payload)) {
    return null;
  }

  const accountId = parseOptionalString(
    payload.accountId ??
      payload.account_id ??
      payload.account,
  );
  const accountLogin = parseInteger(
    payload.accountLogin ??
      payload.account_login ??
      payload.mt5Login ??
      payload.mt5_login ??
      payload.login,
    Number.NaN,
  );

  return {
    ...(accountId ? { accountId } : {}),
    ...(Number.isFinite(accountLogin) && accountLogin > 0 ? { accountLogin, login: accountLogin } : {}),
    ticket: parseInteger(payload.ticket),
    symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
    type: normalizePositionType(payload.type ?? payload.side),
    volume: parseNumber(payload.volume),
    openPrice: parseNumber(payload.openPrice),
    priceCurrent: parseNumber(payload.priceCurrent ?? payload.currentPrice),
    sl: parseNumber(payload.sl),
    tp: parseNumber(payload.tp),
    profit: parseNumber(payload.profit),
    swap: parseNumber(payload.swap),
    commission: parseNumber(payload.commission),
    comment:
      typeof payload.comment === 'string' && payload.comment.trim()
        ? payload.comment
        : undefined,
    externalId:
      typeof payload.externalId === 'string' && payload.externalId.trim()
        ? payload.externalId
        : undefined,
    openTime: parseDate(payload.openTime ?? payload.openTimeMsc),
  };
};

const mapOrder = (payload: unknown): Order | null => {
  if (!isObject(payload)) {
    return null;
  }

  const closeTimeValue =
    payload.closeTime ?? payload.closeTimeMsc ?? payload.doneTimeMsc;

  return {
    ticket: parseInteger(payload.ticket),
    symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
    type: normalizeOrderType(payload.type),
    state: normalizeOrderState(payload.state),
    volume: parseNumber(payload.volume ?? payload.volumeInitial),
    volumeCurrent: parseNumber(payload.volumeCurrent),
    openPrice: parseNumber(payload.openPrice ?? payload.orderPrice),
    priceCurrent: parseNumber(payload.priceCurrent ?? payload.currentPrice),
    sl: parseNumber(payload.sl),
    tp: parseNumber(payload.tp),
    profit: parseNumber(payload.profit),
    swap: parseNumber(payload.swap),
    commission: parseNumber(payload.commission),
    comment:
      typeof payload.comment === 'string' && payload.comment.trim()
        ? payload.comment
        : undefined,
    externalId:
      typeof payload.externalId === 'string' && payload.externalId.trim()
        ? payload.externalId
        : undefined,
    openTime: parseDate(payload.openTime ?? payload.openTimeMsc ?? payload.setupTimeMsc),
    closeTime:
      closeTimeValue !== null && closeTimeValue !== undefined
        ? parseDate(closeTimeValue)
        : undefined,
    expiration:
      payload.expiration !== null && payload.expiration !== undefined
        ? parseDate(payload.expiration)
        : undefined,
    fillingMode: normalizeFillingMode(payload.fillingMode),
  };
};

const mapDeal = (payload: unknown): Deal | null => {
  if (!isObject(payload)) {
    return null;
  }

  return {
    ticket: parseInteger(payload.ticket),
    orderTicket: parseInteger(payload.orderTicket),
    symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
    type:
      typeof payload.type === 'string'
        ? (payload.type as Deal['type'])
        : 'buy',
    entry:
      typeof payload.entry === 'string'
        ? (payload.entry as Deal['entry'])
        : 'in',
    volume: parseNumber(payload.volume),
    price: parseNumber(payload.price),
    commission: parseNumber(payload.commission),
    swap: parseNumber(payload.swap),
    profit: parseNumber(payload.profit),
    fee:
      payload.fee !== undefined ? parseNumber(payload.fee) : undefined,
    sl: payload.sl !== undefined ? parseNumber(payload.sl) : undefined,
    tp: payload.tp !== undefined ? parseNumber(payload.tp) : undefined,
    comment:
      typeof payload.comment === 'string' && payload.comment.trim()
        ? payload.comment
        : undefined,
    externalId:
      typeof payload.externalId === 'string' && payload.externalId.trim()
        ? payload.externalId
        : undefined,
    time: parseDate(payload.time ?? payload.timeMsc),
  };
};

const mapTradeHistoryPayload = (payload: unknown): Deal[] => {
  const source = isObject(payload) ? payload : {};
  const rawHistory = Array.isArray(payload)
    ? payload
    : Array.isArray(source.history)
      ? source.history
      : Array.isArray(source.deals)
        ? source.deals
        : source.deal !== undefined
          ? [source.deal]
          : ('ticket' in source || 'orderTicket' in source)
            ? [source]
            : [];

  return rawHistory
    .map((deal) => mapDeal(deal))
    .filter((deal): deal is Deal => Boolean(deal));
};

const normalizeUpdateAction = (
  value: unknown,
): 'added' | 'modified' | 'deleted' => {
  const normalized = String(value ?? '').trim().toLowerCase();

  switch (normalized) {
    case 'add':
    case 'added':
    case 'open':
    case 'opened':
    case 'created':
      return 'added';
    case 'delete':
    case 'deleted':
    case 'remove':
    case 'removed':
    case 'close':
    case 'closed':
      return 'deleted';
    default:
      return 'modified';
  }
};

const mapTick = (payload: unknown): PriceTick => {
  const root = isObject(payload) ? payload : {};
  const source =
    isObject(root.tick)
      ? root.tick
      : isObject(root.quote)
        ? root.quote
        : isObject(root.price)
          ? root.price
          : isObject(root.data)
            ? root.data
            : isObject(root.payload)
              ? root.payload
              : root;
  const timestampSource =
    source.timestampMs ??
    source.timestamp_ms ??
    source.timeMs ??
    source.time_ms ??
    source.timeMsc ??
    source.time_msc;
  const raw: TickPayload = {
    symbol: typeof source.symbol === 'string' ? source.symbol : '',
    bid: parseNumber(source.bid),
    ask: parseNumber(source.ask),
    last:
      source.last !== undefined ? parseNumber(source.last) : undefined,
    volume:
      source.volume !== undefined ? parseNumber(source.volume) : undefined,
    time:
      typeof source.timestamp === 'string'
        ? source.timestamp
        : typeof source.time === 'string'
          ? source.time
          : new Date(
              parseNumber(timestampSource, Date.now()),
            ).toISOString(),
  };

  return {
    symbol: raw.symbol,
    bid: raw.bid,
    ask: raw.ask,
    last: raw.last,
    volume: raw.volume,
    time: parseDate(timestampSource ?? raw.time),
    spread: raw.ask - raw.bid,
  };
};

const extractTickPayloads = (
  eventData: unknown,
  envelope: ServerEnvelope,
): unknown[] => {
  const payload = eventData !== undefined ? eventData : envelope;

  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [payload];
  }

  const nestedBatch = [
    payload.quotes,
    payload.ticks,
    payload.prices,
  ].find(Array.isArray);

  return nestedBatch ?? [payload];
};

const mapOhlcPayload = (payload: unknown): OhlcPayload | null => {
  if (!isObject(payload)) {
    return null;
  }

  const openTimeMs =
    payload.openTimeMs ??
    payload.open_time_ms ??
    payload.timeMs ??
    payload.time_msc ??
    payload.openTime ??
    payload.open_time ??
    payload.time;
  const closeTimeMs =
    payload.closeTimeMs ??
    payload.close_time_ms ??
    payload.closeTime ??
    payload.close_time;
  const timeframe =
    payload.timeframeMinutes ??
    payload.timeframe_minutes ??
    payload.timeframe ??
    payload.periodMinutes ??
    payload.period_minutes;
  const volume =
    payload.volume ??
    payload.tickVolume ??
    payload.tick_volume ??
    payload.realVolume ??
    payload.real_volume;
  const source = parseOptionalString(payload.source);
  // Derived broker/live OHLC is still real market data. Keep explicit continuity
  // markers separate so backend backfill metadata can decide how to render gaps.
  const isKnownRealSource =
    payload.cached === true ||
    isKnownRealOhlcSource(source);
  const continuity =
    payload.isContinuity === true ||
    payload.continuity === true ||
    Boolean(source && /continuity/i.test(source)) ||
    (!isKnownRealSource && payload.derived === true);

  return {
    symbol: typeof payload.symbol === 'string' ? payload.symbol : '',
    timeframeMinutes: parseInteger(
      timeframe,
      1,
    ),
    open: parseNumber(payload.open),
    high: parseNumber(payload.high),
    low: parseNumber(payload.low),
    close: parseNumber(payload.close),
    volume: parseNumber(volume),
    openTimeMs: parseInteger(openTimeMs),
    closeTimeMs:
      closeTimeMs !== undefined
        ? parseInteger(closeTimeMs)
        : undefined,
    closed: payload.closed === true,
    source,
    derived: (!isKnownRealSource && payload.derived === true) ? true : continuity ? true : undefined,
    continuity: continuity ? true : undefined,
    isContinuity: continuity ? true : undefined,
    basis: parseOptionalString(payload.basis),
    cached:
      payload.cached === true ||
      payload.source === 'continuity_cache'
        ? true
        : undefined,
  };
};

const extractOhlcBars = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [];
  }

  const direct =
    payload.bars ??
    payload.history ??
    payload.candles ??
    payload.ohlc ??
    payload.data;

  if (Array.isArray(direct)) {
    return direct;
  }

  if (isObject(direct)) {
    const nested =
      direct.bars ??
      direct.history ??
      direct.candles ??
      direct.ohlc;
    return Array.isArray(nested) ? nested : [];
  }

  const result = payload.result;
  if (Array.isArray(result)) {
    return result;
  }

  if (isObject(result)) {
    const nested =
      result.bars ??
      result.history ??
      result.candles ??
      result.ohlc;
    return Array.isArray(nested) ? nested : [];
  }

  return [];
};

const extractSymbolCatalog = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isObject(payload)) {
    return [];
  }

  const direct =
    payload.symbols ??
    payload.catalog ??
    payload.symbolCatalog ??
    payload.marketWatch ??
    payload.marketSymbols ??
    payload.data;

  if (Array.isArray(direct)) {
    return direct;
  }

  if (isObject(direct)) {
    const nested =
      direct.symbols ??
      direct.catalog ??
      direct.symbolCatalog ??
      direct.marketWatch ??
      direct.marketSymbols;
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  const result = payload.result;
  if (Array.isArray(result)) {
    return result;
  }

  if (isObject(result)) {
    const nested =
      result.symbols ??
      result.catalog ??
      result.symbolCatalog ??
      result.marketWatch ??
      result.marketSymbols;
    return Array.isArray(nested) ? nested : [];
  }

  return [];
};

const mapSymbolList = (payload: unknown): SymbolInfo[] =>
  extractSymbolCatalog(payload)
    .map((symbol) => mapSymbol(symbol))
    .filter(
      (symbol): symbol is SymbolInfo =>
        Boolean(symbol && symbol.name.trim()),
    );

const mapSymbolUpdate = (payload: unknown): SymbolUpdateRealtimePayload | null => {
  if (!isObject(payload)) {
    return null;
  }

  const source =
    isObject(payload.symbolInfo)
      ? payload.symbolInfo
      : isObject(payload.symbol_info)
        ? payload.symbol_info
        : isObject(payload.symbol)
          ? payload.symbol
          : isObject(payload.update)
          ? payload.update
          : payload;

  if (!isObject(source)) {
    return null;
  }

  const hasSymbolMetadata =
    source.description !== undefined ||
    source.baseCurrency !== undefined ||
    source.base_currency !== undefined ||
    source.quoteCurrency !== undefined ||
    source.quote_currency !== undefined ||
    source.digits !== undefined ||
    source.point !== undefined ||
    source.tickSize !== undefined ||
    source.tick_size !== undefined ||
    source.tickValue !== undefined ||
    source.tick_value !== undefined ||
    source.tradeContractSize !== undefined ||
    source.contractSize !== undefined ||
    source.contract_size !== undefined ||
    source.tradeMode !== undefined ||
    source.trade_mode !== undefined ||
    source.calcMode !== undefined ||
    source.calc_mode !== undefined ||
    source.volumeMin !== undefined ||
    source.volume_min !== undefined ||
    source.volumeMax !== undefined ||
    source.volume_max !== undefined ||
    source.volumeStep !== undefined ||
    source.volume_step !== undefined ||
    source.marginInitial !== undefined ||
    source.margin_initial !== undefined ||
    source.marginMaintenance !== undefined ||
    source.margin_maintenance !== undefined ||
    source.swapLong !== undefined ||
    source.swap_long !== undefined ||
    source.swapShort !== undefined ||
    source.swap_short !== undefined ||
    source.category !== undefined;

  if (!hasSymbolMetadata) {
    return null;
  }

  const name = parseOptionalString(source.name) ?? parseOptionalString(source.symbol);
  if (!name) {
    return null;
  }

  return {
    name,
    ...(source.description !== undefined
      ? { description: parseOptionalString(source.description) ?? name }
      : {}),
    ...(source.baseCurrency !== undefined || source.base_currency !== undefined
      ? { baseCurrency: parseOptionalString(source.baseCurrency ?? source.base_currency) ?? '' }
      : {}),
    ...(source.quoteCurrency !== undefined || source.quote_currency !== undefined
      ? { quoteCurrency: parseOptionalString(source.quoteCurrency ?? source.quote_currency) ?? '' }
      : {}),
    ...(source.digits !== undefined ? { digits: parseInteger(source.digits) } : {}),
    ...(source.point !== undefined ? { point: parseNumber(source.point) } : {}),
    ...(source.tickSize !== undefined || source.tick_size !== undefined
      ? { tickSize: parseNumber(source.tickSize ?? source.tick_size) }
      : {}),
    ...(source.tickValue !== undefined || source.tick_value !== undefined
      ? { tickValue: parseNumber(source.tickValue ?? source.tick_value) }
      : {}),
    ...(source.tradeContractSize !== undefined ||
    source.contractSize !== undefined ||
    source.contract_size !== undefined
      ? {
          tradeContractSize: parseNumber(
            source.tradeContractSize ?? source.contractSize ?? source.contract_size,
          ),
        }
      : {}),
    ...(source.tradeMode !== undefined || source.trade_mode !== undefined
      ? { tradeMode: String(source.tradeMode ?? source.trade_mode) as SymbolInfo['tradeMode'] }
      : {}),
    ...(source.calcMode !== undefined || source.calc_mode !== undefined
      ? { calcMode: String(source.calcMode ?? source.calc_mode) as SymbolInfo['calcMode'] }
      : {}),
    ...(source.volumeMin !== undefined || source.volume_min !== undefined
      ? { volumeMin: parseNumber(source.volumeMin ?? source.volume_min) }
      : {}),
    ...(source.volumeMax !== undefined || source.volume_max !== undefined
      ? { volumeMax: parseNumber(source.volumeMax ?? source.volume_max) }
      : {}),
    ...(source.volumeStep !== undefined || source.volume_step !== undefined
      ? { volumeStep: parseNumber(source.volumeStep ?? source.volume_step) }
      : {}),
    ...(source.marginInitial !== undefined || source.margin_initial !== undefined
      ? { marginInitial: parseNumber(source.marginInitial ?? source.margin_initial) }
      : {}),
    ...(source.marginMaintenance !== undefined || source.margin_maintenance !== undefined
      ? { marginMaintenance: parseNumber(source.marginMaintenance ?? source.margin_maintenance) }
      : {}),
    ...(source.swapLong !== undefined || source.swap_long !== undefined
      ? { swapLong: parseNumber(source.swapLong ?? source.swap_long) }
      : {}),
    ...(source.swapShort !== undefined || source.swap_short !== undefined
      ? { swapShort: parseNumber(source.swapShort ?? source.swap_short) }
      : {}),
    ...(typeof source.category === 'string' ? { category: source.category } : {}),
  };
};

const mapMarketStatus = (payload: unknown): MarketStatusPayload => {
  const source = isObject(payload) ? payload : {};
  const booleanStatusSource = [
    payload,
    source.status,
    source.marketStatus,
    source.market_status,
  ].find((value): value is boolean => typeof value === 'boolean');
  const booleanOpenSource = [
    source.isOpen,
    source.open,
  ].find((value): value is boolean => typeof value === 'boolean');
  const booleanSource = booleanStatusSource ?? booleanOpenSource;
  const booleanStatus =
    booleanSource === true
      ? 'open'
      : booleanSource === false
        ? 'closed'
        : 'unknown';
  const rawStatus =
    booleanStatusSource !== undefined
      ? booleanStatus
      : parseOptionalString(source.status) ??
        parseOptionalString(source.marketStatus ?? source.market_status) ??
        booleanStatus;
  const timestampSource =
    source.timestampMs ??
    source.timeMsc ??
    source.timestamp ??
    source.time;

  return {
    status: rawStatus,
    symbol: parseOptionalString(source.symbol),
    isOpen:
      typeof source.isOpen === 'boolean'
        ? source.isOpen
        : typeof source.open === 'boolean'
          ? source.open
          : booleanSource,
    message: parseOptionalString(source.message),
    timestamp:
      timestampSource !== undefined
        ? parseDate(timestampSource)
        : undefined,
    raw: payload,
  };
};

const mapQuoteStatus = (
  payload: unknown,
  symbol?: string,
): QuoteStatus | null => {
  if (!isObject(payload)) {
    return null;
  }

  const state =
    parseOptionalString(payload.state) ??
    parseOptionalString(payload.status) ??
    'unknown';
  const ready =
    typeof payload.ready === 'boolean'
      ? payload.ready
      : typeof payload.quoteReady === 'boolean'
        ? payload.quoteReady
        : false;

  return {
    symbol: parseOptionalString(payload.symbol) ?? symbol,
    state,
    ready,
    message: parseOptionalString(payload.message),
    engineAvailable:
      typeof payload.engineAvailable === 'boolean'
        ? payload.engineAvailable
        : undefined,
    seededCount:
      payload.seededCount !== undefined
        ? parseInteger(payload.seededCount)
        : undefined,
    seedPending:
      typeof payload.seedPending === 'boolean'
        ? payload.seedPending
        : undefined,
    updatedAt: new Date(),
    raw: payload,
  };
};

const mapSubscriptionQuoteStatuses = (
  response: unknown,
  fallbackSymbols: string[],
): QuoteStatus[] => {
  const source = isObject(response) ? response : {};
  const quoteStatus = source.quoteStatus ?? source.quote_status;
  if (!quoteStatus) {
    return [];
  }

  if (Array.isArray(quoteStatus)) {
    return quoteStatus
      .map((entry, index) => mapQuoteStatus(entry, fallbackSymbols[index]))
      .filter((status): status is QuoteStatus => Boolean(status));
  }

  const status = mapQuoteStatus(quoteStatus);
  if (status?.symbol) {
    return [status];
  }

  const targetSymbols = getAcknowledgedSubscriptionSymbols(response, fallbackSymbols);
  if (targetSymbols.length > 0) {
    return targetSymbols
      .map((symbol) => mapQuoteStatus(quoteStatus, symbol))
      .filter((entry): entry is QuoteStatus => Boolean(entry));
  }

  return [];
};

const getAcknowledgedSubscriptionSymbols = (
  response: unknown,
  fallbackSymbols: string[],
): string[] => {
  const source = isObject(response) ? response : {};
  const responseSymbols = Array.isArray(source.symbols)
    ? source.symbols
      .map((symbol) => (typeof symbol === 'string' ? symbol.trim() : ''))
      .filter((symbol) => symbol.length > 0)
    : [];

  if (responseSymbols.length === 0) {
    return fallbackSymbols;
  }

  const responseSymbolSet = new Set(responseSymbols);
  return fallbackSymbols.filter((symbol) => responseSymbolSet.has(symbol));
};

const getTickDedupeKey = (tick: PriceTick): string =>
  [
    'PRICE_UPDATE',
    tick.symbol,
    tick.bid,
    tick.ask,
    tick.last ?? '',
    tick.volume ?? '',
    tick.time instanceof Date ? tick.time.getTime() : '',
  ].join('|');

const getAccountDedupeKey = (account: TradingAccountInfo): string =>
  [
    'BALANCE_UPDATE',
    account.login,
    account.balance,
    account.equity,
    account.margin,
    account.marginFree,
    account.marginLevel,
    account.profit,
    account.credit,
    account.swap,
    account.commission,
    account.availableMargin,
  ].join('|');

const getPositionDedupeKey = (
  action: PositionUpdatePayload['action'],
  position: Position,
): string =>
  [
    'POSITION_UPDATE',
    action,
    position.ticket,
    position.symbol,
    position.type,
    position.volume,
    position.openPrice,
    position.priceCurrent,
    position.profit,
    position.sl,
    position.tp,
    position.swap,
    position.commission,
    position.openTime instanceof Date ? position.openTime.getTime() : '',
  ].join('|');

const getPositionsSnapshotDedupeKey = (positions: Position[]): string =>
  `POSITION_UPDATE|snapshot|${positions
    .map((position) => getPositionDedupeKey('modified', position))
    .sort()
    .join('~')}`;

const getSymbolListDedupeKey = (symbols: SymbolInfo[]): string =>
  `SYMBOL_LIST|${symbols
    .map((symbol) =>
      [
        symbol.name,
        symbol.description,
        symbol.category ?? '',
        symbol.digits,
        symbol.tradeMode,
        symbol.volumeMin,
        symbol.volumeMax,
        symbol.volumeStep,
      ].join(':'),
    )
    .sort()
    .join('|')}`;

const getSymbolUpdateDedupeKey = (symbol: SymbolUpdateRealtimePayload): string =>
  [
    'SYMBOL_UPDATE',
    symbol.name,
    symbol.description,
    symbol.category ?? '',
    symbol.digits,
    symbol.tradeMode,
    symbol.volumeMin,
    symbol.volumeMax,
    symbol.volumeStep,
  ].join('|');

const getMarketStatusDedupeKey = (status: MarketStatusPayload): string =>
  [
    'MARKET_STATUS',
    status.symbol ?? '',
    status.status,
    status.isOpen ?? '',
    status.message ?? '',
    status.timestamp instanceof Date ? status.timestamp.getTime() : '',
  ].join('|');

const getFrameRequestId = (
  envelope: ServerEnvelope,
  source?: Record<string, unknown>,
): string | undefined =>
  envelope.requestId ||
  parseOptionalString(source?.requestId) ||
  parseOptionalString(source?.request_id) ||
  parseOptionalString(source?.id);

const getSessionQuerySnapshotArrayKey = (action: string): string | null => {
  switch (action) {
    case 'request_positions':
      return 'positions';
    case 'request_orders':
      return 'orders';
    case 'request_history':
      return 'history';
    default:
      return null;
  }
};

const hasSessionQuerySnapshotPayload = (
  action: string,
  payload: Record<string, unknown>,
): boolean => {
  const snapshotKey = getSessionQuerySnapshotArrayKey(action);
  if (!snapshotKey) {
    return false;
  }

  const nestedData = isObject(payload.data) ? payload.data : undefined;
  return Array.isArray(payload[snapshotKey]) || Boolean(nestedData && Array.isArray(nestedData[snapshotKey]));
};

const sessionQueryPayloadFlag = (
  payload: Record<string, unknown>,
  nestedData: Record<string, unknown> | undefined,
  errorSource: Record<string, unknown> | undefined,
  details: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined =>
  parseOptionalBoolean(payload[key]) ??
  parseOptionalBoolean(nestedData?.[key]) ??
  parseOptionalBoolean(errorSource?.[key]) ??
  parseOptionalBoolean(details?.[key]);

const getSessionQueryPayloadMetadataSources = (
  payload: Record<string, unknown>,
  nestedData: Record<string, unknown> | undefined,
): Record<string, unknown>[] => {
  const topLevelError = isObject(payload.error) ? payload.error : undefined;
  const nestedDataError = isObject(nestedData?.error) ? nestedData.error : undefined;
  const payloadDetails = isObject(payload.details) ? payload.details : undefined;
  const nestedDataDetails = isObject(nestedData?.details) ? nestedData.details : undefined;
  const topLevelErrorDetails = isObject(topLevelError?.details) ? topLevelError.details : undefined;
  const nestedDataErrorDetails = isObject(nestedDataError?.details) ? nestedDataError.details : undefined;

  return [
    payload,
    nestedData,
    topLevelError,
    nestedDataError,
    topLevelErrorDetails,
    nestedDataErrorDetails,
    nestedDataDetails,
    payloadDetails,
  ].filter((source): source is Record<string, unknown> => Boolean(source));
};

const firstSessionQueryMetadataBoolean = (
  sources: Record<string, unknown>[],
  key: string,
): boolean | undefined => {
  for (const source of sources) {
    const parsed = parseOptionalBoolean(source[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
};

const firstSessionQueryMetadataString = (
  sources: Record<string, unknown>[],
  ...keys: string[]
): string | undefined => {
  for (const source of sources) {
    for (const key of keys) {
      const parsed = parseOptionalString(source[key]);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }

  return undefined;
};

const firstSessionQueryMetadataFiniteNumber = (
  sources: Record<string, unknown>[],
  ...keys: string[]
): number | undefined => {
  for (const source of sources) {
    for (const key of keys) {
      const parsed = parseOptionalFiniteNumber(source[key]);
      if (parsed !== undefined) {
        return parsed;
      }
    }
  }

  return undefined;
};

const hasSessionQueryMetadataTextMatch = (
  sources: Record<string, unknown>[],
  pattern: RegExp,
  ...keys: string[]
): boolean =>
  sources.some((source) =>
    keys.some((key) => pattern.test(String(source[key] ?? ''))),
  );

const getSessionQueryPayloadHardError = (
  action: string,
  payload: Record<string, unknown>,
): Error | null => {
  const nestedData = isObject(payload.data) ? payload.data : undefined;
  const nestedErrorCandidate = nestedData?.error;
  const topLevelError = isObject(payload.error) ? payload.error : undefined;
  const nestedDataError = isObject(nestedErrorCandidate) ? nestedErrorCandidate : undefined;
  const rawError =
    typeof payload.error === 'string'
      ? payload.error
      : typeof nestedErrorCandidate === 'string'
        ? nestedErrorCandidate
        : undefined;
  const errorSource = topLevelError ?? nestedDataError;
  const status = (
    parseOptionalString(payload.status) ??
    parseOptionalString(nestedData?.status) ??
    parseOptionalString(errorSource?.status)
  )?.toLowerCase();
  const success = parseOptionalBoolean(payload.success ?? nestedData?.success);
  const ok = parseOptionalBoolean(payload.ok ?? nestedData?.ok);
  const failed =
    Boolean(errorSource || rawError) ||
    success === false ||
    ok === false ||
    Boolean(status && /error|failed|unauthorized|forbidden|rejected/.test(status));

  if (!failed) {
    return null;
  }

  const details = isObject(errorSource?.details) ? errorSource.details : undefined;
  const retryableFlag = sessionQueryPayloadFlag(
    payload,
    nestedData,
    errorSource,
    details,
    'retryable',
  );
  const retryable = retryableFlag === true;
  const explicitNonRetryable = retryableFlag === false;
  const deferred =
    sessionQueryPayloadFlag(payload, nestedData, errorSource, details, 'deferred') === true ||
    sessionQueryPayloadFlag(payload, nestedData, errorSource, details, 'pending') === true ||
    sessionQueryPayloadFlag(payload, nestedData, errorSource, details, 'refreshScheduled') === true;
  const code = (
    parseOptionalString(errorSource?.code) ??
    parseOptionalString(details?.code) ??
    parseOptionalString(nestedData?.code) ??
    parseOptionalString(payload.code) ??
    parseOptionalString(payload.errorCode)
  )?.toLowerCase();

  if (!explicitNonRetryable && (retryable || deferred || code === 'mt5_manager_lane_busy')) {
    return null;
  }

  const message =
    parseOptionalString(errorSource?.message) ??
    parseOptionalString(details?.message) ??
    parseOptionalString(nestedData?.message) ??
    parseOptionalString(payload.message) ??
    rawError ??
    `${action} failed.`;
  const error = new Error(code ? `${code}: ${message}` : message);
  Object.assign(error, {
    ...(code ? { code } : {}),
    retryable: false,
    ...(details ? { details } : {}),
  });
  return error;
};

const getRetryableSessionQuerySnapshotPlaceholder = (
  action: string,
  payload: Record<string, unknown>,
): SessionQueryRetry | null => {
  if (action !== 'request_positions' || !hasSessionQuerySnapshotPayload(action, payload)) {
    return null;
  }

  const nestedData = isObject(payload.data) ? payload.data : undefined;
  const metadataSources = getSessionQueryPayloadMetadataSources(payload, nestedData);
  const retryableFlag = firstSessionQueryMetadataBoolean(metadataSources, 'retryable');
  const explicitNonRetryable = retryableFlag === false;
  const explicitCode = firstSessionQueryMetadataString(
    metadataSources,
    'code',
    'errorCode',
    'error_code',
  )?.toLowerCase();
  const code = explicitCode ?? 'request_positions_snapshot_pending';
  const cached =
    firstSessionQueryMetadataBoolean(metadataSources, 'cached') === true;
  const pending =
    firstSessionQueryMetadataBoolean(metadataSources, 'pending') === true ||
    firstSessionQueryMetadataBoolean(metadataSources, 'deferred') === true ||
    firstSessionQueryMetadataBoolean(metadataSources, 'refreshScheduled') === true ||
    firstSessionQueryMetadataBoolean(metadataSources, 'refresh_scheduled') === true;
  const nonAuthoritative =
    firstSessionQueryMetadataBoolean(metadataSources, 'authoritative') === false ||
    firstSessionQueryMetadataBoolean(metadataSources, 'isAuthoritative') === false ||
    firstSessionQueryMetadataBoolean(metadataSources, 'nonAuthoritative') === true ||
    firstSessionQueryMetadataBoolean(metadataSources, 'non_authoritative') === true;
  const statusIndicatesPlaceholder = hasSessionQueryMetadataTextMatch(
    metadataSources,
    /pending|deferred|refresh[_ -]?scheduled|non[_ -]?authoritative|placeholder|not[_ -]?ready/i,
    'code',
    'errorCode',
    'error_code',
    'status',
  );
  const retryableStatus = hasSessionQueryMetadataTextMatch(
    metadataSources,
    /busy|deferred|pending|retry|temporar|transport|websocket|reconnect|unavailable/i,
    'code',
    'errorCode',
    'error_code',
    'status',
    'message',
    'reason',
  );
  const retryableEvidence =
    !explicitNonRetryable &&
    (retryableFlag === true ||
      pending ||
      explicitCode === 'mt5_manager_lane_busy' ||
      explicitCode === 'mt5_manager_query_deferred' ||
      explicitCode === 'session_query_deferred' ||
      retryableStatus);

  if (
    explicitNonRetryable ||
    (!retryableEvidence && !nonAuthoritative && !statusIndicatesPlaceholder)
  ) {
    return null;
  }

  const retryAfterMs =
    firstSessionQueryMetadataFiniteNumber(
      metadataSources,
      'retryAfterMs',
      'retry_after_ms',
    ) ??
    SESSION_QUERY_RETRY_FALLBACK_MS;
  const message =
    firstSessionQueryMetadataString(metadataSources, 'message', 'reason') ??
    (cached
      ? 'request_positions returned a cached or pending snapshot; retrying for an authoritative MT5 positions snapshot.'
      : 'request_positions returned a pending snapshot; retrying for an authoritative MT5 positions snapshot.');

  return {
    code,
    message,
    retryAfterMs: Math.min(
      SESSION_QUERY_RETRY_MAX_DELAY_MS,
      Math.max(SESSION_QUERY_RETRY_FALLBACK_MS, retryAfterMs),
    ),
  };
};

const markSessionQueryReconnectRetryResponse = (
  payload: Record<string, unknown>,
): void => {
  sessionQueryReconnectRetryResponses.add(payload);
};

const isSessionQueryReconnectRetryResponse = (
  payload: Record<string, unknown>,
): boolean => sessionQueryReconnectRetryResponses.has(payload);

const getSessionQueryRetry = (
  action: string,
  payload: Record<string, unknown>,
): SessionQueryRetry | null => {
  const snapshotPlaceholderRetry =
    getRetryableSessionQuerySnapshotPlaceholder(action, payload);
  if (snapshotPlaceholderRetry) {
    return snapshotPlaceholderRetry;
  }

  if (hasSessionQuerySnapshotPayload(action, payload)) {
    return null;
  }

  const nestedData = isObject(payload.data) ? payload.data : undefined;
  const metadataSources = getSessionQueryPayloadMetadataSources(payload, nestedData);
  const code = firstSessionQueryMetadataString(
    metadataSources,
    'code',
    'errorCode',
    'error_code',
  )?.toLowerCase();
  const retryableFlag = firstSessionQueryMetadataBoolean(metadataSources, 'retryable');
  const explicitNonRetryable = retryableFlag === false;
  const retryable = retryableFlag === true;
  const deferred =
    firstSessionQueryMetadataBoolean(metadataSources, 'deferred') === true ||
    firstSessionQueryMetadataBoolean(metadataSources, 'pending') === true ||
    firstSessionQueryMetadataBoolean(metadataSources, 'refreshScheduled') === true ||
    firstSessionQueryMetadataBoolean(metadataSources, 'refresh_scheduled') === true;

  if (
    explicitNonRetryable ||
    (!retryable &&
      !deferred &&
      code !== 'mt5_manager_lane_busy' &&
      code !== 'mt5_manager_query_deferred' &&
      code !== 'session_query_deferred')
  ) {
    return null;
  }

  const retryAfterMs =
    firstSessionQueryMetadataFiniteNumber(
      metadataSources,
      'retryAfterMs',
      'retry_after_ms',
    ) ??
    SESSION_QUERY_RETRY_FALLBACK_MS;
  const message =
    firstSessionQueryMetadataString(metadataSources, 'message', 'reason') ??
    'MT5 manager is busy; retrying terminal state shortly.';

  return {
    ...(code ? { code } : {}),
    message,
    retryAfterMs: Math.min(
      SESSION_QUERY_RETRY_MAX_DELAY_MS,
      Math.max(SESSION_QUERY_RETRY_FALLBACK_MS, retryAfterMs),
    ),
  };
};

const getSessionQueryErrorRetry = (
  error: unknown,
): SessionQueryRetry | null => {
  const source = isObject(error) ? error : undefined;
  const details = getErrorDetails(error);
  const code = (
    getErrorPropertyAsString(error, 'code') ??
    parseOptionalString(details?.code)
  )?.toLowerCase();
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  const explicitRetryable =
    parseOptionalBoolean(source?.retryable) === true ||
    parseOptionalBoolean(details?.retryable) === true;

  if (!explicitRetryable && isPermanentTokenRefreshFailure(error)) {
    return null;
  }

  const retryable =
    explicitRetryable ||
    code === 'mt5_manager_lane_busy' ||
    code === 'mt5_positions_sdk_call_stale' ||
    code === 'request_positions_snapshot_pending' ||
    (code === 'mt5_manager_request_failed' && explicitRetryable) ||
    code === 'session_query_deferred' ||
    code === 'session_query_error' ||
    /mt5 manager.*busy|trade command is active|retry request_(positions|orders|history)|terminal state query worker capacity is full|positions call exceeded the watchdog/.test(
      normalizedMessage,
    );

  if (!retryable) {
    return null;
  }

  return {
    ...(code ? { code } : {}),
    message,
    retryAfterMs: Math.min(
      SESSION_QUERY_RETRY_MAX_DELAY_MS,
      Math.max(
        SESSION_QUERY_RETRY_FALLBACK_MS,
        parseOptionalFiniteNumber(source?.retryAfterMs) ??
          parseOptionalFiniteNumber(details?.retryAfterMs) ??
          SESSION_QUERY_RETRY_FALLBACK_MS,
      ),
    ),
  };
};

const getSessionQueryReconnectRetry = (
  error: unknown,
): SessionQueryRetry | null => {
  const code = getErrorPropertyAsString(error, 'code')?.toLowerCase();
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();
  const retryable =
    code === 'terminal_session_timeout' ||
    /not connected|websocket disconnected|websocket transport closed|transport closed|connection lost|reconnecting|websocket connection closed|websocket connection error|timed out waiting for websocket authentication|requires an authenticated websocket session/.test(
      normalizedMessage,
    );

  if (!retryable) {
    return null;
  }

  return {
    ...(code ? { code } : {}),
    message,
    retryAfterMs: SESSION_QUERY_RETRY_FALLBACK_MS,
    waitForAuthentication: true,
  };
};

const getRequestTimeoutMessage = (action: string): string => {
  switch (action) {
    case 'get_symbols':
      return `get_symbols timed out. Browser endpoint: ${normalizeWebSocketUrl(WS_CONFIG.URL)}. Check the gateway /health endpoint for SYMBOL_LIST/ack counts and verify upstream C++ realtime can reach MT5 Manager and MT5 quotes.`;
    case 'subscribe_symbols':
      return 'subscribe_symbols timed out. Symbols loaded, but C++ did not acknowledge quote subscriptions. Check MT5 quote availability and C++ realtime logs.';
    case 'request_bootstrap_state':
      return 'request_bootstrap_state timed out. The terminal websocket opened, but C++ did not return bootstrap state. Check the C++ realtime service and MT5 terminal session.';
    case 'request_positions':
      return 'request_positions timed out. MT5 terminal state did not return open positions in time; the client will keep the previous position state instead of clearing it.';
    case 'request_orders':
      return 'request_orders timed out. MT5 terminal state did not return pending orders in time; the client will keep the previous order state instead of clearing it.';
    default:
      return `${action} timed out`;
  }
};

const getStreamForAction = (action: string): string | undefined => {
  switch (action) {
    case 'auth_with_token':
    case 'ping':
      return 'terminal.connection';
    case 'get_symbols':
      return 'market.symbols';
    case 'subscribe_symbols':
    case 'unsubscribe_symbols':
      return 'market.prices';
    case 'subscribe_ohlc':
    case 'unsubscribe_ohlc':
      return 'market.candles';
    case 'request_ohlc_history':
      return 'market.candleHistory';
    case 'request_bootstrap_state':
      return 'terminal.bootstrap';
    case 'request_account_info':
      return 'account.balance';
    case 'request_positions':
      return 'account.positions';
    case 'request_orders':
      return 'account.orders';
    case 'place_order':
    case 'modify_order':
    case 'cancel_order':
    case 'close_position':
      return 'trade.execution';
    default:
      return undefined;
  }
};

const isTradeExecutionAction = (action: string): boolean =>
  getStreamForAction(action) === 'trade.execution';

const getStreamPublishMetadata = (
  envelope?: ServerEnvelope,
): {
  streamId?: string;
  priority?: number | string;
  coalesceKey?: string;
} => {
  if (!envelope) {
    return {};
  }

  const streamId = parseOptionalString(envelope.streamId);
  const coalesceKey = parseOptionalString(envelope.coalesceKey);
  const priority =
    typeof envelope.priority === 'number' || typeof envelope.priority === 'string'
      ? envelope.priority
      : undefined;

  return {
    ...(streamId ? { streamId } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(coalesceKey ? { coalesceKey } : {}),
  };
};

const withOhlcContext = (
  bar: unknown,
  context: {
    symbol?: string;
    timeframeMinutes?: number;
    source?: string;
  },
): unknown => {
  if (!isObject(bar)) {
    return bar;
  }

  return {
    ...(context.symbol ? { symbol: context.symbol } : {}),
    ...(context.timeframeMinutes ? { timeframeMinutes: context.timeframeMinutes } : {}),
    ...(context.source ? { source: context.source } : {}),
    ...bar,
  };
};

const isValidOhlcPayload = (
  payload: OhlcPayload | null,
): payload is OhlcPayload => {
  if (
    !payload ||
    !payload.symbol.trim() ||
    payload.timeframeMinutes <= 0 ||
    payload.openTimeMs <= 0
  ) {
    return false;
  }

  const prices = [payload.open, payload.high, payload.low, payload.close];
  if (!prices.every((price) => Number.isFinite(price) && price > 0)) {
    return false;
  }

  return (
    Number.isFinite(payload.volume) &&
    payload.volume >= 0 &&
    payload.high >= Math.max(payload.open, payload.close, payload.low) &&
    payload.low <= Math.min(payload.open, payload.close, payload.high)
  );
};

const isKnownRealOhlcSource = (source: string | undefined): boolean => {
  const normalized = source?.trim().toLowerCase() ?? '';
  return (
    normalized === 'rust_realtime' ||
    normalized === 'mt5_tick' ||
    normalized === 'mt5_live_tick' ||
    /chart|history|ohlc|server|manager/.test(normalized)
  );
};

const isRealOhlcPayload = (payload: OhlcPayload): boolean => {
  const source = payload.source?.trim().toLowerCase() ?? '';

  return (
    payload.isContinuity !== true &&
    payload.continuity !== true &&
    (payload.derived !== true || payload.cached === true || isKnownRealOhlcSource(source)) &&
    !/continuity|synthetic|simulation|dummy|local_sim/.test(source)
  );
};

const getOhlcContext = (
  payload: Record<string, unknown>,
): { symbol?: string; timeframeMinutes?: number; source?: string } => {
  const symbol = parseOptionalString(payload.symbol);
  const timeframe = parseInteger(
    payload.timeframeMinutes ??
      payload.timeframe_minutes ??
      payload.timeframe ??
      payload.periodMinutes ??
      payload.period_minutes,
  );

  return {
    symbol,
    timeframeMinutes: timeframe > 0 ? timeframe : undefined,
    source: parseOptionalString(payload.source),
  };
};

const isReadyOhlcHistoryRefresh = (payload: unknown): payload is Record<string, unknown> => {
  if (!isObject(payload)) {
    return false;
  }

  return parseOptionalString(payload.status)?.toLowerCase() === 'ready';
};

const getOhlcHistoryResponseSource = (payload: unknown): Record<string, unknown> => {
  if (!isObject(payload)) {
    return {};
  }

  if (isObject(payload.result)) {
    return payload.result;
  }

  if (isObject(payload.payload)) {
    return payload.payload;
  }

  return payload;
};

const containsOhlcHistoryStage = (value: unknown, stage: string): boolean => {
  const normalizedStage = stage.toLowerCase();

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === normalizedStage;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsOhlcHistoryStage(entry, stage));
  }

  if (!isObject(value)) {
    return false;
  }

  if (parseOptionalString(value.stage)?.toLowerCase() === normalizedStage) {
    return true;
  }

  return Object.values(value).some((entry) =>
    containsOhlcHistoryStage(entry, stage),
  );
};

const parseOptionalIntegerField = (value: unknown): number | undefined => {
  const parsed = parseInteger(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const mapOhlcHistoryMetadata = (
  payload: unknown,
  context: {
    symbol?: string;
    timeframeMinutes?: number;
    source?: string;
  },
  event?: string,
): OhlcHistoryResponseMetadata => {
  const source = getOhlcHistoryResponseSource(payload);
  const rawMetadata = isObject(source.metadata) ? source.metadata : undefined;
  const metadata = rawMetadata
    ? ({
        ...rawMetadata,
        ...(rawMetadata.brokerSymbolCandidates !== undefined
          ? {
              brokerSymbolCandidates: parseStringList(
                rawMetadata.brokerSymbolCandidates,
              ),
            }
          : {}),
      } as OhlcHistoryMetadata)
    : undefined;
  const warnings = source.warnings;
  const notes = source.notes;
  const historySparse =
    parseOptionalBoolean(metadata?.historySparse ?? source.historySparse) ?? false;
  const historyGapped =
    parseOptionalBoolean(metadata?.historyGapped ?? source.historyGapped) ?? false;
  const historyStale =
    parseOptionalBoolean(metadata?.historyStale ?? source.historyStale);
  const timeframeMinutes = parseOptionalIntegerField(
    source.timeframeMinutes ??
      source.timeframe_minutes ??
      source.timeframe ??
      metadata?.timeframeMinutes ??
      context.timeframeMinutes,
  );
  const limit = parseOptionalIntegerField(
    source.limit ?? source.requestedLimit ?? metadata?.requestedLimit,
  );
  const barCount = parseOptionalIntegerField(
    source.barCount ?? source.returnedBarCount ?? metadata?.returnedBarCount,
  );
  const fromUnixMs = parseOptionalIntegerField(
    source.fromUnixMs ?? metadata?.fromUnixMs,
  );
  const toUnixMs = parseOptionalIntegerField(source.toUnixMs ?? metadata?.toUnixMs);
  const symbol =
    parseOptionalString(source.symbol) ??
    parseOptionalString(metadata?.symbol) ??
    context.symbol;
  const brokerSymbol =
    parseOptionalString(source.brokerSymbol) ??
    parseOptionalString(metadata?.brokerSymbol);
  const brokerSymbolCandidates = parseStringList(
    source.brokerSymbolCandidates ?? metadata?.brokerSymbolCandidates,
  );
  const responseSource =
    parseOptionalString(source.source) ??
    parseOptionalString(metadata?.source) ??
    context.source;
  const status = parseOptionalString(source.status);
  const responseEvent = event ?? parseOptionalString(source.event ?? source.type);
  const message = parseOptionalString(source.message);
  const shouldReload = parseOptionalBoolean(source.shouldReload);
  const requestedLimit = parseOptionalIntegerField(
    source.requestedLimit ?? metadata?.requestedLimit ?? limit,
  );
  const returnedBarCount = parseOptionalIntegerField(
    source.returnedBarCount ?? metadata?.returnedBarCount ?? barCount,
  );
  const realBarCount = parseOptionalIntegerField(
    source.realBarCount ?? metadata?.realBarCount,
  );
  const managerFetchDeferred =
    containsOhlcHistoryStage(notes, 'manager_fetch_deferred') ||
    containsOhlcHistoryStage(warnings, 'manager_fetch_deferred') ||
    parseOptionalBoolean(source.managerFetchDeferred) === true ||
    parseOptionalBoolean(metadata?.managerFetchDeferred) === true;
  const managerFetchPending =
    containsOhlcHistoryStage(notes, 'manager_fetch_pending') ||
    containsOhlcHistoryStage(warnings, 'manager_fetch_pending') ||
    parseOptionalBoolean(source.managerFetchPending ?? source.manager_fetch_pending) === true ||
    parseOptionalBoolean(metadata?.managerFetchPending ?? metadata?.manager_fetch_pending) === true;
  const managerFetchSucceeded = parseOptionalBoolean(
    source.managerFetchSucceeded ?? metadata?.managerFetchSucceeded,
  );

  return {
    ...(responseEvent ? { event: responseEvent } : {}),
    ...(status ? { status } : {}),
    ...(symbol ? { symbol } : {}),
    ...(brokerSymbol ? { brokerSymbol } : {}),
    ...(brokerSymbolCandidates.length > 0 ? { brokerSymbolCandidates } : {}),
    ...(timeframeMinutes !== undefined ? { timeframeMinutes } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(requestedLimit !== undefined ? { requestedLimit } : {}),
    ...(barCount !== undefined ? { barCount } : {}),
    ...(returnedBarCount !== undefined ? { returnedBarCount } : {}),
    ...(realBarCount !== undefined ? { realBarCount } : {}),
    ...(shouldReload !== undefined ? { shouldReload } : {}),
    ...(message ? { message } : {}),
    ...(metadata ? { metadata } : {}),
    ...(warnings !== undefined ? { warnings } : {}),
    ...(notes !== undefined ? { notes } : {}),
    historySparse,
    historyGapped,
    ...(historyStale !== undefined ? { historyStale } : {}),
    managerFetchDeferred,
    ...(managerFetchPending ? { managerFetchPending } : {}),
    ...(managerFetchSucceeded !== undefined ? { managerFetchSucceeded } : {}),
    ...(responseSource ? { source: responseSource } : {}),
    ...(fromUnixMs !== undefined ? { fromUnixMs } : {}),
    ...(toUnixMs !== undefined ? { toUnixMs } : {}),
  };
};

const mapOhlcHistoryResponse = (
  payload: unknown,
  context: {
    symbol?: string;
    timeframeMinutes?: number;
    source?: string;
  },
  event?: string,
): OhlcHistoryResponse => {
  const bars = extractOhlcBars(payload)
    .map((bar) => mapOhlcPayload(withOhlcContext(bar, context)))
    .filter(isValidOhlcPayload)
    .sort((left, right) => left.openTimeMs - right.openTimeMs);
  const metadata = mapOhlcHistoryMetadata(payload, context, event);
  const normalizedBarCount =
    metadata.barCount ?? metadata.returnedBarCount ?? bars.length;

  return {
    bars,
    metadata: {
      ...metadata,
      ...(metadata.barCount === undefined ? { barCount: normalizedBarCount } : {}),
      ...(metadata.returnedBarCount === undefined
        ? { returnedBarCount: normalizedBarCount }
        : {}),
    },
  };
};

const isDeferredEmptyOhlcHistoryResponse = (
  response: OhlcHistoryResponse,
): boolean => {
  const returnedBarCount =
    response.metadata.returnedBarCount ??
    response.metadata.barCount ??
    response.bars.length;
  const status = response.metadata.status?.trim().toLowerCase();
  const isPendingStatus =
    status === 'pending' ||
    status === 'deferred' ||
    status === 'queued' ||
    status === 'loading';

  return (
    response.bars.length === 0 &&
    returnedBarCount <= 0 &&
    (
      response.metadata.managerFetchDeferred ||
      response.metadata.managerFetchPending === true ||
      isPendingStatus
    )
  );
};

const collectOhlcHistorySymbolCandidates = (
  source: unknown,
  target: Set<string>,
): void => {
  if (!isObject(source)) {
    return;
  }

  const addSymbol = (value: unknown): void => {
    const symbol = parseOptionalString(value);
    if (!symbol) {
      return;
    }

    target.add(symbol);
    target.add(normalizeSymbolKey(symbol));
    getSymbolAliases(symbol).forEach((alias) => target.add(alias));
  };
  const symbolFields = [
    'symbol',
    'requestSymbol',
    'requestedSymbol',
    'brokerSymbol',
    'resolvedBrokerSymbol',
    'attemptedBrokerSymbol',
    'baseSymbol',
    'normalizedSymbol',
    'normalizedBaseSymbol',
  ];
  const candidateArrayFields = [
    'brokerSymbolCandidates',
    'symbolCandidates',
    'candidateSymbols',
    'brokerSymbols',
    'aliases',
  ];

  symbolFields.forEach((field) => addSymbol(source[field]));
  candidateArrayFields.forEach((field) => {
    parseStringList(source[field]).forEach(addSymbol);
  });

  if (isObject(source.metadata)) {
    collectOhlcHistorySymbolCandidates(source.metadata, target);
  }
};

const ohlcHistorySymbolCandidatesMatch = (
  requestData: unknown,
  refreshMetadata: OhlcHistoryResponseMetadata,
): boolean => {
  const requestSymbols = new Set<string>();
  const refreshSymbols = new Set<string>();
  collectOhlcHistorySymbolCandidates(requestData, requestSymbols);
  collectOhlcHistorySymbolCandidates(refreshMetadata, refreshSymbols);

  if (requestSymbols.size === 0 || refreshSymbols.size === 0) {
    return false;
  }

  for (const requestSymbol of requestSymbols) {
    for (const refreshSymbol of refreshSymbols) {
      if (symbolsMatch(requestSymbol, refreshSymbol)) {
        return true;
      }
    }
  }

  return false;
};

const ohlcHistoryRequestMatchesRefresh = (
  requestData: unknown,
  refreshMetadata: OhlcHistoryResponseMetadata,
): boolean => {
  if (!isObject(requestData)) {
    return false;
  }

  const requestTimeframe = parseOptionalIntegerField(
    requestData.timeframeMinutes ??
      requestData.timeframe_minutes ??
      requestData.timeframe,
  );
  const refreshTimeframe =
    refreshMetadata.timeframeMinutes ?? refreshMetadata.metadata?.timeframeMinutes;

  return (
    ohlcHistorySymbolCandidatesMatch(requestData, refreshMetadata) &&
    requestTimeframe !== undefined &&
    refreshTimeframe !== undefined &&
    requestTimeframe === refreshTimeframe
  );
};

const collectOhlcHistoryRefreshCorrelationText = (
  payload: unknown,
  metadata: OhlcHistoryResponseMetadata,
): string => {
  const source = isObject(payload) ? payload : {};
  const nestedMetadata = isObject(source.metadata) ? source.metadata : {};
  const textValues = [
    source.source,
    source.status,
    source.message,
    source.reason,
    source.managerFetchStatus,
    source.managerLockOwner,
    nestedMetadata.source,
    nestedMetadata.status,
    nestedMetadata.message,
    nestedMetadata.reason,
    nestedMetadata.managerFetchStatus,
    nestedMetadata.managerLockOwner,
    metadata.source,
    metadata.status,
    metadata.message,
  ];

  return textValues
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
    .filter(Boolean)
    .join(' ');
};

const isUncorrelatedOhlcHistoryBroadcast = (
  payload: unknown,
  metadata: OhlcHistoryResponseMetadata,
): boolean => {
  const correlationText = collectOhlcHistoryRefreshCorrelationText(payload, metadata);

  return /\b(warmup|warm-up|pre-warm|pre-warmed|ohlc_warmup|broadcast)\b/.test(
    correlationText,
  );
};

const isOhlcHistoryRefreshFallbackCorrelated = (
  payload: unknown,
  metadata: OhlcHistoryResponseMetadata,
): boolean => {
  if (isUncorrelatedOhlcHistoryBroadcast(payload, metadata)) {
    return false;
  }

  if (metadata.managerFetchSucceeded === true) {
    return true;
  }

  const correlationText = collectOhlcHistoryRefreshCorrelationText(payload, metadata);
  return /\b(backfill|manager_fetch|managerfetch|request_ohlc_history|history request|requested ohlc|response)\b/.test(
    correlationText,
  );
};

const attachOhlcHistoryMetadata = (
  bars: OhlcPayload[],
  metadata: OhlcHistoryResponseMetadata,
): OhlcHistoryBars => {
  const barsWithMetadata = bars as OhlcHistoryBars;

  Object.defineProperties(barsWithMetadata, {
    [OHLC_HISTORY_METADATA_PROPERTY]: {
      value: metadata,
      enumerable: false,
      configurable: true,
    },
    historyMetadata: {
      value: metadata,
      enumerable: false,
      configurable: true,
    },
  });

  return barsWithMetadata;
};

export const getOhlcHistoryMetadata = (
  bars: readonly OhlcPayload[] | null | undefined,
): OhlcHistoryResponseMetadata | undefined => {
  if (!bars) {
    return undefined;
  }

  const historyBars = bars as unknown as OhlcHistoryBars;
  return historyBars.__ohlcHistoryMetadata ?? historyBars.historyMetadata;
};

/**
 * WebSocket Trading Client
 */
export class WebSocketTradingClient {
  private socket: WebSocket | null = null;
  private readonly wsUrl: string;
  private readonly skipBootstrapRefresh: boolean;
  private callbacks: WebSocketEventCallbacks = {};
  private streamRouter = new WebSocketStreamRouter();
  private reconnectAttempts = 0;
  private reconnectTimer: TimeoutHandle | null = null;
  private tokenRefreshTimer: TimeoutHandle | null = null;
  private tokenRefreshGeneration = 0;
  private pingInterval: IntervalHandle | null = null;
  private pongTimeout: TimeoutHandle | null = null;
  private connectionPromise: Promise<boolean> | null = null;
  private connectResolver: ((connected: boolean) => void) | null = null;
  private connectTimeout: TimeoutHandle | null = null;
  private session: TradingSession | null = null;
  private socketAuthenticated = false;
  private authToken: string | null = null;
  private authTokenProvider: AuthTokenProvider | null = null;
  private authInFlightToken: string | null = null;
  private authInFlightPromise: Promise<TradingSession | null> | null = null;
  private desiredSubscriptions: string[] = [];
  private pendingSubscriptions: string[] = [];
  private activeSubscriptions = new Set<string>();
  private inFlightSubscriptions = new Map<string, Promise<boolean>>();
  private desiredOhlcSubscriptions = new Map<string, OhlcSubscriptionRequest>();
  private activeOhlcSubscriptions = new Set<string>();
  private pendingOhlcSubscriptions = new Map<string, Promise<boolean>>();
  private ohlcSubscriptionGeneration = 0;
  private pendingRequests = new Map<string, PendingRequest>();
  private recentTradeRequestCorrelations = new Map<string, RecentTradeRequestCorrelation>();
  private positionsRequestPromise: Promise<Position[]> | null = null;
  private lastPositionsSnapshot: Position[] | null = null;
  private lastPositionsSnapshotReceivedAtMs = 0;
  private positionsSnapshotGeneration = 0;
  private positionsReconnectResetGeneration: number | null = null;
  private authWaiters = new Set<AuthWaiter>();
  private requestCounter = 0;
  private socketGeneration = 0;
  private manualDisconnect = false;
  private isAuthenticatingWithToken = false;
  private isRestoringSession = false;
  private awaitingPong = false;
  private lastPingSentAt = 0;
  private lastPongAt = 0;
  private pingIntervalMs: number = WS_CONFIG.PING_INTERVAL;
  private pongTimeoutMs: number = WS_CONFIG.PONG_TIMEOUT;
  private ohlcListeners = new Set<EventCallback<OhlcPayload>>();
  private ohlcHistoryMetadataListeners = new Set<EventCallback<OhlcHistoryResponseMetadata>>();
  private ohlcReplayCache: OhlcPayload[] = [];
  private recentRealtimeDispatches = new Map<string, number>();
  private recentRealtimeDispatchCount = 0;
  private lastOhlcSubscriptionAck: OhlcSubscriptionAck | null = null;

  constructor(callbacks: WebSocketEventCallbacks = {}, options?: WebSocketClientOptions) {
    this.callbacks = callbacks;
    this.wsUrl = options?.wsUrl ?? WS_CONFIG.URL;
    this.skipBootstrapRefresh = options?.skipBootstrapRefresh ?? false;
  }

  setCallbacks(callbacks: WebSocketEventCallbacks): void {
    this.callbacks = callbacks;
  }

  setAuthTokenProvider(provider: AuthTokenProvider | null): void {
    this.authTokenProvider = provider;
  }

  addStreamListener<TPayload = unknown>(
    stream: WebSocketStreamKey | WebSocketStreamWildcard,
    listener: WebSocketStreamListener<TPayload>,
  ): () => void {
    return this.streamRouter.subscribe(stream, listener);
  }

  getStreamDiagnostics(): WebSocketStreamDiagnostics {
    return this.streamRouter.diagnostics();
  }

  addOhlcListener(listener: EventCallback<OhlcPayload>): () => void {
    let active = true;
    const replay = this.ohlcReplayCache.slice();
    this.ohlcListeners.add(listener);

    Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      for (const payload of replay) {
        if (!active) {
          return;
        }

        listener({ ...payload });
      }
    });

    return () => {
      active = false;
      this.ohlcListeners.delete(listener);
    };
  }

  addOhlcHistoryMetadataListener(
    listener: EventCallback<OhlcHistoryResponseMetadata>,
  ): () => void {
    this.ohlcHistoryMetadataListeners.add(listener);

    return () => {
      this.ohlcHistoryMetadataListeners.delete(listener);
    };
  }

  getLastOhlcSubscriptionAck(): OhlcSubscriptionAck | null {
    if (!this.lastOhlcSubscriptionAck) {
      return null;
    }

    return {
      ...this.lastOhlcSubscriptionAck,
      ...(isObject(this.lastOhlcSubscriptionAck.timing)
        ? { timing: { ...this.lastOhlcSubscriptionAck.timing } }
        : {}),
      ...(isObject(this.lastOhlcSubscriptionAck.clientTiming)
        ? { clientTiming: { ...this.lastOhlcSubscriptionAck.clientTiming } }
        : {}),
      ...(Array.isArray(this.lastOhlcSubscriptionAck.ohlcSubscriptions)
        ? {
            ohlcSubscriptions: this.lastOhlcSubscriptionAck.ohlcSubscriptions.map((entry) => ({
              ...entry,
            })),
          }
        : {}),
    };
  }

  connect(): Promise<boolean> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.clearReconnectTimer();
      return Promise.resolve(true);
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.manualDisconnect = false;
    this.clearReconnectTimer();

    this.connectionPromise = new Promise<boolean>((resolve) => {
      this.connectResolver = resolve;

      try {
        this.resetSocketAuthentication();
        this.destroySocket({ closeTransport: true });
        this.socketGeneration += 1;
        this.socket = new WebSocket(normalizeWebSocketUrl(this.wsUrl));
        this.socket.onopen = this.handleOpen;
        this.socket.onclose = this.handleClose;
        this.socket.onerror = this.handleError;
        this.socket.onmessage = this.handleMessage;

        this.connectTimeout = setTimeout(() => {
          this.callbacks.onError?.(
            createWebSocketTransportError(
              'Timed out connecting to the trading websocket',
            ),
          );
          this.destroySocket({ closeTransport: true });
          this.resolveConnect(false);
        }, WS_CONFIG.CONNECT_TIMEOUT_MS);
      } catch (error) {
        this.callbacks.onError?.(error as Error);
        this.destroySocket({ closeTransport: true });
        this.resolveConnect(false);
      }
    });

    return this.connectionPromise;
  }

  disconnect(): void {
    this.manualDisconnect = true;
    this.stopPingInterval();
    this.clearReconnectTimer();
    this.clearTokenRefreshTimer();
    this.clearConnectTimeout();
    this.rejectPendingRequests(new Error('WebSocket disconnected'));
    this.destroySocket({ closeTransport: true });

    this.connectionPromise = null;
    this.connectResolver = null;
    this.session = null;
    this.socketAuthenticated = false;
    this.authToken = null;
    this.authTokenProvider = null;
    this.desiredSubscriptions = [];
    this.pendingSubscriptions = [];
    this.activeSubscriptions.clear();
    this.inFlightSubscriptions.clear();
    this.desiredOhlcSubscriptions.clear();
    this.activeOhlcSubscriptions.clear();
    this.pendingOhlcSubscriptions.clear();
    this.clearPositionsRequestCache();
    this.isAuthenticatingWithToken = false;
    this.rejectAuthWaiters(new Error('WebSocket disconnected'));
    this.reconnectAttempts = 0;
  }

  async authenticate(_credentials: AuthCredentials): Promise<TradingSession | null> {
    throw new Error(
      'Direct MT5 credential authentication is not supported in this terminal. Use a server-issued terminal session token.',
    );
  }

  async authenticateWithToken(token: string): Promise<TradingSession | null> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      throw Object.assign(
        new Error('Terminal session token is not available'),
        { code: 'TOKEN_MISSING' },
      );
    }

    if (
      this.isAuthenticated &&
      this.authToken === normalizedToken &&
      this.session
    ) {
      this.scheduleTokenRefresh(normalizedToken);
      return this.session;
    }

    if (
      this.authInFlightPromise &&
      this.authInFlightToken === normalizedToken
    ) {
      return this.authInFlightPromise;
    }

    const authenticate = this.authenticateWithTokenUncoalesced(normalizedToken)
      .finally(() => {
        if (this.authInFlightPromise === authenticate) {
          this.authInFlightPromise = null;
          this.authInFlightToken = null;
        }
      });

    this.authInFlightToken = normalizedToken;
    this.authInFlightPromise = authenticate;
    return authenticate;
  }

  private async authenticateWithTokenUncoalesced(token: string): Promise<TradingSession | null> {
    this.isAuthenticatingWithToken = true;
    const wasAuthenticated = this.isAuthenticated;
    const requiresFreshSocket = wasAuthenticated && this.authToken !== token;
    let payload: Record<string, unknown>;
    try {
      if (requiresFreshSocket) {
        this.destroySocket({ closeTransport: true });
      }

      if (!this.isConnected) {
        const connected = await this.connect();
        if (!connected) {
          throw createWebSocketTransportError(
            'Failed to connect to the trading websocket',
          );
        }
      }

      if (!wasAuthenticated) {
        this.resetSocketAuthentication();
      }
      payload = await this.sendRequest<Record<string, unknown>>(
        'auth_with_token',
        { token },
      );
    } catch (error) {
      const authError =
        error instanceof Error
          ? error
          : new Error('Websocket authentication failed');
      this.rejectAuthWaiters(authError);
      if (!wasAuthenticated || requiresFreshSocket) {
        this.destroyUnauthenticatedSocket(authError);
      }
      throw authError;
    } finally {
      this.isAuthenticatingWithToken = false;
    }

    const previousSession = this.session;
    const session = this.mapSessionFromAuthPayload(payload);
    if (
      previousSession &&
      (previousSession.login !== session.login || previousSession.server !== session.server)
    ) {
      this.clearPositionsRequestCache();
    }
    this.session = session;
    this.authToken = token;
    this.socketAuthenticated = true;
    this.applyHeartbeatSettings(payload);
    this.scheduleTokenRefresh(token);
    this.startPingInterval();
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.resolveAuthWaiters();
    this.callbacks.onAuthenticated?.(session);
    this.notifyConnectionStatus({
      status: 'connected',
      message: 'MT5 session authenticated.',
    });
    if (!wasAuthenticated || requiresFreshSocket) {
      this.restoreRealtimeStateInBackground();
    }
    return session;
  }

  async subscribeSymbols(symbols: string[]): Promise<boolean> {
    const normalizedSymbols = this.normalizeSymbols(symbols);

    if (normalizedSymbols.length === 0) {
      return true;
    }

    this.desiredSubscriptions = this.mergeSymbols(
      this.desiredSubscriptions,
      normalizedSymbols,
    );

    const symbolsToSubscribe = normalizedSymbols.filter(
      (symbol) =>
        !this.activeSubscriptions.has(symbol) &&
        !this.inFlightSubscriptions.has(symbol),
    );

    const inFlightRequests = [
      ...new Set(
        normalizedSymbols
          .map((symbol) => this.inFlightSubscriptions.get(symbol))
          .filter((request): request is Promise<boolean> => Boolean(request)),
      ),
    ];

    const inFlightSucceeded = inFlightRequests.length === 0
      ? true
      : (await Promise.all(inFlightRequests)).every(Boolean);

    if (symbolsToSubscribe.length === 0) {
      return inFlightSucceeded;
    }

    if (!this.isAuthenticated) {
      this.pendingSubscriptions = this.mergeSymbols(
        this.pendingSubscriptions,
        symbolsToSubscribe,
      );
      return false;
    }

    const batchPromises: Promise<boolean>[] = [];

    for (
      let index = 0;
      index < symbolsToSubscribe.length;
      index += SYMBOL_SUBSCRIPTION_BATCH_SIZE
    ) {
      const batch = symbolsToSubscribe.slice(
        index,
        index + SYMBOL_SUBSCRIPTION_BATCH_SIZE,
      );

      const subscribeRequest = (async (): Promise<boolean> => {
        try {
          const response = await this.sendRequest('subscribe_symbols', { symbols: batch }, 5000);
          const quoteStatuses = mapSubscriptionQuoteStatuses(response, batch);
          quoteStatuses.forEach((quoteStatus) => {
            const marketStatus = {
              status: quoteStatus.state,
              symbol: quoteStatus.symbol,
              isOpen: quoteStatus.ready,
              message: quoteStatus.message,
              quoteStatus,
              timestamp: quoteStatus.updatedAt,
              raw: quoteStatus.raw ?? response,
            };
            this.callbacks.onMarketStatus?.(marketStatus);
            this.publishStream('market.status', marketStatus);
          });
          const acknowledgedSymbols = getAcknowledgedSubscriptionSymbols(response, batch);
          const acknowledgedSymbolSet = new Set(acknowledgedSymbols);
          acknowledgedSymbols.forEach((symbol) => {
            if (this.desiredSubscriptions.includes(symbol)) {
              this.activeSubscriptions.add(symbol);
            }
          });
          const unacknowledgedDesiredSymbols = batch.filter(
            (symbol) =>
              !acknowledgedSymbolSet.has(symbol) &&
              this.desiredSubscriptions.includes(symbol),
          );
          this.pendingSubscriptions = this.mergeSymbols(
            this.pendingSubscriptions.filter((symbol) => !acknowledgedSymbolSet.has(symbol)),
            unacknowledgedDesiredSymbols,
          );
          return unacknowledgedDesiredSymbols.length === 0;
        } catch {
          const stillDesired = batch.filter((symbol) =>
            this.desiredSubscriptions.includes(symbol),
          );
          this.pendingSubscriptions = this.mergeSymbols(
            this.pendingSubscriptions,
            stillDesired,
          );
          return false;
        } finally {
          batch.forEach((symbol) => {
            if (this.inFlightSubscriptions.get(symbol) === subscribeRequest) {
              this.inFlightSubscriptions.delete(symbol);
            }
          });
        }
      })();

      batch.forEach((symbol) => this.inFlightSubscriptions.set(symbol, subscribeRequest));
      batchPromises.push(subscribeRequest);
    }

    const batchResults = await Promise.all(batchPromises);
    return inFlightSucceeded && batchResults.every(Boolean);
  }

  async unsubscribeSymbols(symbols: string[]): Promise<boolean> {
    const normalizedSymbols = this.normalizeSymbols(symbols);

    if (normalizedSymbols.length === 0) {
      return true;
    }

    this.desiredSubscriptions = this.desiredSubscriptions.filter(
      (symbol) => !normalizedSymbols.includes(symbol),
    );
    this.pendingSubscriptions = this.pendingSubscriptions.filter(
      (symbol) => !normalizedSymbols.includes(symbol),
    );

    if (!this.isAuthenticated) {
      return true;
    }

    for (
      let index = 0;
      index < normalizedSymbols.length;
      index += SYMBOL_SUBSCRIPTION_BATCH_SIZE
    ) {
      const batch = normalizedSymbols.slice(
        index,
        index + SYMBOL_SUBSCRIPTION_BATCH_SIZE,
      );

      try {
        await this.sendRequest('unsubscribe_symbols', { symbols: batch }, 5000);
        batch.forEach((symbol) => this.activeSubscriptions.delete(symbol));
      } catch {
        return false;
      }
    }

    return true;
  }

  async subscribeOhlc(symbol: string, timeframeMinutes: number): Promise<boolean> {
    const request = this.normalizeOhlcSubscription(symbol, timeframeMinutes);
    if (!request) {
      return false;
    }

    const key = this.getOhlcSubscriptionKey(request);
    this.desiredOhlcSubscriptions.set(key, request);

    if (this.isAuthenticated && this.activeOhlcSubscriptions.has(key)) {
      return true;
    }

    const pendingRequest = this.pendingOhlcSubscriptions.get(key);
    if (pendingRequest) {
      return pendingRequest;
    }

    const generation = this.ohlcSubscriptionGeneration;
    const subscribeRequest = this.sendOhlcSubscription(key, request, generation).finally(() => {
      if (this.pendingOhlcSubscriptions.get(key) === subscribeRequest) {
        this.pendingOhlcSubscriptions.delete(key);
      }
    });
    this.pendingOhlcSubscriptions.set(key, subscribeRequest);
    return subscribeRequest;
  }

  async unsubscribeOhlc(symbol: string, timeframeMinutes: number): Promise<boolean> {
    const request = this.normalizeOhlcSubscription(symbol, timeframeMinutes);
    if (!request) {
      return false;
    }

    const key = this.getOhlcSubscriptionKey(request);
    this.desiredOhlcSubscriptions.delete(key);
    this.activeOhlcSubscriptions.delete(key);

    if (!this.isAuthenticated) {
      return true;
    }

    await this.sendAuthenticatedRequest(
      'unsubscribe_ohlc',
      request,
      5000,
    );
    return true;
  }

  async getOhlcHistory(
    symbol: string,
    timeframeMinutes: number,
    limit = DEFAULT_OHLC_HISTORY_LIMIT,
    range: OhlcHistoryRange = {},
  ): Promise<OhlcHistoryBars> {
    const response = await this.getOhlcHistoryWithMetadata(
      symbol,
      timeframeMinutes,
      limit,
      range,
    );

    return attachOhlcHistoryMetadata(response.bars, response.metadata);
  }

  async getOhlcHistoryWithMetadata(
    symbol: string,
    timeframeMinutes: number,
    limit = DEFAULT_OHLC_HISTORY_LIMIT,
    range: OhlcHistoryRange = {},
  ): Promise<OhlcHistoryResponse> {
    const normalizedLimit = Math.min(
      DEFAULT_OHLC_HISTORY_LIMIT,
      Math.max(1, parseInteger(limit, DEFAULT_OHLC_HISTORY_LIMIT)),
    );
    const fromUnixMs = this.normalizeOptionalUnixMs(range.fromUnixMs);
    const toUnixMs = this.normalizeOptionalUnixMs(range.toUnixMs);
    const beforeUnixMs = this.normalizeOptionalUnixMs(range.beforeUnixMs);
    const requestType = parseOptionalString(range.requestType ?? range.type);
    const cacheFirst = parseOptionalBoolean(range.cacheFirst);
    const cacheOnly = parseOptionalBoolean(range.cacheOnly);

    const payload = await this.sendAuthenticatedRequest<unknown>(
      'request_ohlc_history',
      {
        symbol,
        timeframeMinutes,
        limit: normalizedLimit,
        ...(fromUnixMs !== undefined ? { fromUnixMs } : {}),
        ...(toUnixMs !== undefined ? { toUnixMs } : {}),
        ...(beforeUnixMs !== undefined
          ? {
              before: beforeUnixMs,
              beforeUnixMs,
              before_unix_ms: beforeUnixMs,
            }
          : {}),
        ...(requestType ? { requestType, type: requestType } : {}),
        ...(cacheFirst !== undefined ? { cacheFirst } : {}),
        ...(cacheOnly !== undefined ? { cacheOnly } : {}),
      },
      Math.max(WS_CONFIG.TIMEOUT, 45000),
    );

    const response = mapOhlcHistoryResponse(payload, {
      symbol,
      timeframeMinutes,
    });
    if (!isDeferredEmptyOhlcHistoryResponse(response)) {
      this.notifyOhlcHistoryMetadata(response.metadata);
      this.publishStream('market.candleHistory', response);
    }
    return response;
  }

  private async requestSymbolCatalog(
    action: 'get_symbols' | 'request_symbols',
  ): Promise<SymbolInfo[]> {
    const payload = await this.sendAuthenticatedRequest<Record<string, unknown>>(action);
    return mapSymbolList(payload);
  }

  async getSymbols(): Promise<SymbolInfo[]> {
    let symbols = await this.requestSymbolCatalog('get_symbols');

    if (symbols.length === 0) {
      try {
        symbols = await this.requestSymbolCatalog('request_symbols');
      } catch (error) {
        console.warn('[WebSocketTradingClient] request_symbols fallback failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.publishStream('market.symbols', symbols);
    return symbols;
  }

  async getBootstrapState(): Promise<TerminalBootstrapState> {
    const payload = await this.sendAuthenticatedRequest<Record<string, unknown>>(
      'request_bootstrap_state',
      undefined,
      Math.max(WS_CONFIG.TIMEOUT, BOOTSTRAP_STATE_TIMEOUT_MS),
    );
    const status = typeof payload.status === 'string' ? payload.status : '';
    const message =
      typeof payload.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : undefined;
    const error =
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : undefined;

    const bootstrap = {
      accountInfo: mapAccountInfo(payload),
      symbols: mapSymbolList(payload),
      positions: Array.isArray(payload.positions)
        ? payload.positions
            .map((position) => mapPosition(position))
            .filter((position): position is Position => Boolean(position))
        : [],
      orders: Array.isArray(payload.orders)
        ? payload.orders
            .map((order) => mapOrder(order))
            .filter((order): order is Order => Boolean(order))
        : [],
      degraded:
        payload.degraded === true ||
        status.toLowerCase().includes('degraded'),
      ...(message ? { message } : {}),
      ...(error ? { error } : {}),
      warnings: payload.warnings,
      deferred: parseStringList(
        payload.deferred ?? payload.deferredSections ?? payload.deferredResources,
      ),
    };

    // Fire any prices included in the bootstrap response immediately — no
    // subscription round-trip required for these initial snapshots.
    const bootstrapPriceSource =
      Array.isArray(payload.prices)
        ? payload.prices
        : Array.isArray(payload.quotes)
          ? payload.quotes
          : Array.isArray(payload.ticks)
            ? payload.ticks
            : [];
    for (const raw of bootstrapPriceSource) {
      const tick = mapTick(raw);
      if (tick.symbol && (tick.bid > 0 || tick.ask > 0)) {
        this.callbacks.onTick?.(tick);
        this.publishStream('market.prices', tick);
      }
    }

    this.publishStream('terminal.bootstrap', bootstrap);
    return bootstrap;
  }

  async placeOrder(request: TradeRequest): Promise<TradeResult> {
    const serverPricedRequest: TradeRequest & { requestId?: string } = { ...request };
    if (serverPricedRequest.type === 'buy' || serverPricedRequest.type === 'sell') {
      delete serverPricedRequest.price;
    }
    serverPricedRequest.requestId = crypto.randomUUID();

    const payload = await this.sendRequest<Record<string, unknown>>(
      'place_order',
      serverPricedRequest,
      TRADE_EXECUTION_TIMEOUT_MS,
    );
    const result = mapTradeResult(payload.result ?? payload);
    this.clearPositionsRequestCache();
    this.publishStream('trade.execution', {
      action: 'place_order',
      request: serverPricedRequest,
      requestId: result.requestId !== undefined ? String(result.requestId) : '',
      result,
    });
    return result;
  }

  async modifyOrder(
    ticket: number,
    params: { sl?: number; tp?: number; price?: number; isPosition?: boolean },
  ): Promise<TradeResult> {
    const payload = await this.sendRequest<Record<string, unknown>>(
      'modify_order',
      { ticket, ...params },
      TRADE_EXECUTION_TIMEOUT_MS,
    );
    const result = mapTradeResult(payload.result ?? payload);
    this.clearPositionsRequestCache();
    this.publishStream('trade.execution', {
      action: 'modify_order',
      request: { ticket, ...params },
      requestId: result.requestId !== undefined ? String(result.requestId) : '',
      result,
    });
    return result;
  }

  async cancelOrder(ticket: number): Promise<TradeResult> {
    const payload = await this.sendRequest<Record<string, unknown>>(
      'cancel_order',
      { ticket },
      TRADE_EXECUTION_TIMEOUT_MS,
    );
    const result = mapTradeResult(payload.result ?? payload);
    this.clearPositionsRequestCache();
    this.publishStream('trade.execution', {
      action: 'cancel_order',
      request: { ticket },
      requestId: result.requestId !== undefined ? String(result.requestId) : '',
      result,
    });
    return result;
  }

  async closePosition(ticket: number, volume?: number): Promise<TradeResult> {
    const payload = await this.sendRequest<Record<string, unknown>>(
      'close_position',
      { ticket, volume },
      TRADE_EXECUTION_TIMEOUT_MS,
    );
    const result = mapTradeResult(payload.result ?? payload);
    this.clearPositionsRequestCache();
    this.publishStream('trade.execution', {
      action: 'close_position',
      request: { ticket, volume },
      requestId: result.requestId !== undefined ? String(result.requestId) : '',
      result,
    });
    return result;
  }

  async getAccountInfo(): Promise<TradingAccountInfo | null> {
    const payload = await this.sendRequest<Record<string, unknown>>(
      'request_account_info',
    );
    const account = mapAccountInfo(payload);
    if (account) {
      this.publishStream('account.balance', { account });
    }
    return account;
  }

  async getPositions(options: GetPositionsOptions = {}): Promise<Position[]> {
    const bypassCachedSnapshot = options.force === true || options.invalidateCache === true;

    if (!bypassCachedSnapshot && this.positionsRequestPromise) {
      return this.positionsRequestPromise;
    }

    if (
      bypassCachedSnapshot &&
      options.coalesceInFlight === true &&
      this.positionsRequestPromise
    ) {
      return this.positionsRequestPromise;
    }

    if (bypassCachedSnapshot) {
      this.clearPositionsRequestCache();
    }

    const now = Date.now();
    if (
      !bypassCachedSnapshot &&
      this.lastPositionsSnapshot !== null &&
      now - this.lastPositionsSnapshotReceivedAtMs < POSITIONS_REFRESH_DEDUPE_MS
    ) {
      return this.lastPositionsSnapshot;
    }

    let requestGeneration = this.positionsSnapshotGeneration;
    let request: Promise<Position[]> | null = null;
    request = (async (): Promise<Position[]> => {
      const payload = await this.sendSessionQueryRequest(
        'request_positions',
      );
      if (isSessionQueryReconnectRetryResponse(payload)) {
        requestGeneration = this.getReconnectRebasedPositionsGeneration(
          requestGeneration,
          request,
        );
      }
      const nestedData = isObject(payload.data) ? payload.data : undefined;
      const rawPositions = Array.isArray(payload.positions)
        ? payload.positions
        : nestedData && Array.isArray(nestedData.positions)
          ? nestedData.positions
          : [];
      const positions = rawPositions
        .map((position) => mapPosition(position))
        .filter((position): position is Position => Boolean(position));
      if (!this.cachePositionsSnapshot(positions, requestGeneration)) {
        const error = new Error(
          'request_positions was superseded by a newer positions refresh event',
        );
        Object.assign(error, {
          code: 'positions_snapshot_superseded',
          retryable: true,
        });
        throw error;
      }
      this.publishStream('account.positions', positions);
      return positions;
    })();

    // Forced requests supersede older work, then become the shared in-flight
    // refresh so later non-forced callers cannot race with the same generation.
    this.positionsRequestPromise = request;
    try {
      return await request;
    } finally {
      if (this.positionsRequestPromise === request) {
        this.positionsRequestPromise = null;
      }
    }
  }

  async getOrders(): Promise<Order[]> {
    const payload = await this.sendSessionQueryRequest(
      'request_orders',
    );
    const orders = Array.isArray(payload.orders)
      ? payload.orders
          .map((order) => mapOrder(order))
          .filter((order): order is Order => Boolean(order))
      : [];
    this.publishStream('account.orders', orders);
    return orders;
  }

  async getTradeHistory(
    from: Date,
    to: Date,
    options: { limit?: number; maxRows?: number } = {},
  ): Promise<Deal[]> {
    const limit = parseOptionalIntegerField(options.limit ?? options.maxRows);
    const payload = await this.sendSessionQueryRequest(
      'request_history',
      {
        fromUnixMs: from.getTime(),
        toUnixMs: to.getTime(),
        ...(limit !== undefined ? { limit, maxRows: limit } : {}),
      },
    );

    const history = mapTradeHistoryPayload(payload);
    this.publishStream('account.history', history);
    return history;
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get isAuthenticated(): boolean {
    return this.isConnected && this.socketAuthenticated;
  }

  get currentSession(): TradingSession | null {
    return this.session;
  }

  get supportsOhlcActions(): boolean {
    const normalizedUrl = this.wsUrl.toLowerCase();
    return !(
      normalizedUrl.includes('/ws/trade') ||
      normalizedUrl.includes('/ws/market') ||
      normalizedUrl.includes('/ws/account')
    );
  }

  get supportsSymbolCatalogActions(): boolean {
    const normalizedUrl = this.wsUrl.toLowerCase();
    return !(
      normalizedUrl.includes('/ws/trade') ||
      normalizedUrl.includes('/ws/account')
    );
  }

  get connectionState(): 'connected' | 'disconnected' | 'connecting' | 'error' {
    if (this.connectionPromise) return 'connecting';
    if (this.isConnected) return 'connected';
    if (this.reconnectAttempts > 0) return 'error';
    return 'disconnected';
  }

  private handleOpen = (): void => {
    this.resetSocketAuthentication();
    this.recentRealtimeDispatches.clear();
    this.awaitingPong = false;
    this.lastPingSentAt = 0;
    this.lastPongAt = Date.now();
    this.callbacks.onConnect?.();
    this.resolveConnect(true);
  };

  private handleClose = (event: CloseEvent): void => {
    this.resetSocketAuthentication();
    this.stopPingInterval();
    this.rejectPendingRequests(
      createConnectionLostError('WebSocket connection closed'),
    );
    const shouldReconnect =
      !this.manualDisconnect && this.hasReconnectCredentials();
    this.clearPositionsRequestCache({ reconnectRetryEligible: shouldReconnect });
    this.destroySocket({ closeTransport: false });
    this.activeSubscriptions.clear();
    this.resolveConnect(false);

    if (shouldReconnect) {
      this.notifyConnectionStatus({
        status: 'reconnecting',
        message: 'Trading server connection lost. Reconnecting...',
      });
      this.scheduleReconnect();
      return;
    }

    if (!this.manualDisconnect) {
      this.session = null;
    }

    const reason = event.reason || `closed:${event.code}`;
    this.callbacks.onDisconnect?.(reason);
  };

  private handleError = (): void => {
    this.resetSocketAuthentication();
    const shouldReconnect =
      !this.manualDisconnect && this.hasReconnectCredentials();

    this.callbacks.onError?.(
      createWebSocketTransportError('WebSocket connection error'),
    );
    this.stopPingInterval();
    this.rejectPendingRequests(
      createConnectionLostError('WebSocket connection error'),
    );
    this.clearPositionsRequestCache({ reconnectRetryEligible: shouldReconnect });
    this.activeSubscriptions.clear();
    this.destroySocket({ closeTransport: true });
    this.resolveConnect(false);

    if (shouldReconnect) {
      this.notifyConnectionStatus({
        status: 'reconnecting',
        message: 'Trading server connection interrupted. Reconnecting...',
      });
      this.scheduleReconnect();
    }
  };

  private shouldSkipDuplicateRealtimeDispatch(key: string): boolean {
    const now = Date.now();
    const previousDispatchAt = this.recentRealtimeDispatches.get(key);
    if (
      previousDispatchAt !== undefined &&
      now - previousDispatchAt <= REALTIME_EVENT_DEDUP_TTL_MS
    ) {
      return true;
    }

    this.recentRealtimeDispatches.set(key, now);
    this.recentRealtimeDispatchCount += 1;

    if (this.recentRealtimeDispatchCount >= REALTIME_EVENT_DEDUP_CLEANUP_INTERVAL) {
      this.recentRealtimeDispatchCount = 0;
      const cutoff = now - REALTIME_EVENT_DEDUP_TTL_MS;
      for (const [entryKey, dispatchedAt] of this.recentRealtimeDispatches) {
        if (
          dispatchedAt < cutoff ||
          this.recentRealtimeDispatches.size > REALTIME_EVENT_DEDUP_CACHE_LIMIT
        ) {
          this.recentRealtimeDispatches.delete(entryKey);
        }
      }
    }

    return false;
  }

  private publishStream<TPayload>(
    stream: string,
    payload: TPayload,
    envelope?: ServerEnvelope,
  ): void {
    this.streamRouter.publish(stream, payload, getStreamPublishMetadata(envelope));
  }

  private notifyConnectionStatus(
    status: ConnectionStatusPayload,
    envelope?: ServerEnvelope,
  ): void {
    this.callbacks.onConnectionStatus?.(status);
    this.publishStream('terminal.connection', status, envelope);
  }

  private handleMessage = (event: MessageEvent<string>): void => {
    try {
      const envelope = JSON.parse(event.data) as ServerEnvelope;
      const eventName = envelope.event ?? envelope.type;
      const eventData = envelope.data !== undefined ? envelope.data : envelope.payload;

      if (!eventName) {
        const envelopeStream = parseOptionalString(envelope.stream);
        if (envelopeStream) {
          this.publishStream(envelopeStream, eventData, envelope);
        }
        return;
      }

      const normalizedEventName = eventName.trim().toLowerCase();

      if (normalizedEventName === 'ack') {
        this.resolvePendingRequest(envelope.requestId, eventData);
        return;
      }

      if (normalizedEventName === 'error') {
        const error = createServerError(envelope.error);
        if (envelope.requestId) {
          this.rejectPendingRequest(envelope.requestId, error);
        } else {
          this.callbacks.onError?.(error);
        }
        return;
      }

      const canonicalRealtimeEvent = normalizeRealtimeEventName(eventName);

      if (canonicalRealtimeEvent === 'PRICE_UPDATE') {
        const tickPayloads = extractTickPayloads(eventData, envelope);
        for (const tickPayload of tickPayloads) {
          const tick = mapTick(tickPayload);
          if (!tick.symbol || this.shouldSkipDuplicateRealtimeDispatch(getTickDedupeKey(tick))) {
            continue;
          }

          this.callbacks.onTick?.(tick);
          this.publishStream('market.prices', tick, envelope);
        }
        return;
      }

      if (normalizedEventName === 'ohlc_bar') {
        // Rust gateway sends ohlc_bar flat (no "data" wrapper): fall back to the
        // full envelope so mapOhlcPayload can read symbol/timeframeMinutes/OHLC directly.
        const payload = mapOhlcPayload(eventData !== undefined ? eventData : envelope);
        if (!isValidOhlcPayload(payload)) {
          return;
        }

        this.notifyOhlcListeners(payload);
        return;
      }

      if (normalizedEventName === 'ohlc_history_refreshed') {
        if (!isObject(eventData)) {
          return;
        }

        const context = getOhlcContext(eventData);
        const history = mapOhlcHistoryResponse(
          eventData,
          context,
          'ohlc_history_refreshed',
        );
        const isReady = isReadyOhlcHistoryRefresh(eventData);
        const refreshBars = isReady ? history.bars : [];
        // Attach bars to metadata so ohlcWebSocketService can merge them immediately
        // without waiting for the per-bar notifyOhlcListeners loop below.
        const metadataWithBars = refreshBars.length > 0
          ? { ...history.metadata, bars: refreshBars }
          : history.metadata;
        this.notifyOhlcHistoryMetadata(metadataWithBars);
        this.publishStream('market.candleHistory', history, envelope);

        if (!isReady) {
          return;
        }

        if (refreshBars.length > 0) {
          const payload = {
            event: normalizedEventName,
            ...eventData,
          };
          const refreshRequestId = getFrameRequestId(envelope, eventData);
          const canResolvePendingHistory = !isUncorrelatedOhlcHistoryBroadcast(
            payload,
            history.metadata,
          );

          if (refreshRequestId && canResolvePendingHistory) {
            this.resolvePendingRequest(refreshRequestId, payload);
          } else if (!refreshRequestId) {
            this.resolveMatchingPendingOhlcHistoryRefresh(history, payload);
          }
        }

        refreshBars.forEach((payload) => this.notifyOhlcListeners(payload));
        return;
      }

      if (normalizedEventName === 'trade_result') {
        const source = isObject(eventData) ? eventData : {};
        const requestId = getFrameRequestId(envelope, source);
        const tradeRequestCorrelation = this.getTradeRequestCorrelation(requestId);
        if (requestId) {
          this.resolvePendingRequest(requestId, source);
        }

        const tradeResultPayload = {
          result: mapTradeResult(source.result ?? source),
          requestId:
            typeof source.requestId === 'string'
              ? source.requestId
              : requestId ?? '',
          ...(tradeRequestCorrelation?.action ? { action: tradeRequestCorrelation.action } : {}),
          ...(tradeRequestCorrelation ? { request: tradeRequestCorrelation.data } : {}),
        };
        this.clearPositionsRequestCache();
        this.callbacks.onTradeResult?.(tradeResultPayload);
        this.publishStream('trade.execution', tradeResultPayload, envelope);
        if (requestId) {
          this.recentTradeRequestCorrelations.delete(requestId);
        }
        return;
      }

      if (canonicalRealtimeEvent === 'BALANCE_UPDATE') {
        const source = isObject(eventData) ? eventData : {};
        const account = mapAccountInfo(source);
        if (account) {
          if (this.shouldSkipDuplicateRealtimeDispatch(getAccountDedupeKey(account))) {
            return;
          }

          const accountPayload = { account };
          this.callbacks.onAccountUpdate?.(accountPayload);
          this.publishStream('account.balance', accountPayload, envelope);
        }
        return;
      }

      if (canonicalRealtimeEvent === 'HISTORY_UPDATE') {
        const history = mapTradeHistoryPayload(eventData);
        this.publishStream('account.history', history, envelope);
        return;
      }

      if (canonicalRealtimeEvent === 'POSITION_UPDATE') {
        const source = isObject(eventData) ? eventData : {};
        const hasPositionsSnapshot =
          Array.isArray(eventData) || Array.isArray(source.positions);
        const rawPositions = Array.isArray(eventData)
          ? eventData
          : Array.isArray(source.positions)
            ? source.positions
            : [];

        if (hasPositionsSnapshot) {
          const positions = rawPositions
            .map((position) => mapPosition(position))
            .filter((position): position is Position => Boolean(position));
          const snapshotGeneration = this.advancePositionsSnapshotGeneration();
          this.cachePositionsSnapshot(positions, snapshotGeneration);
          if (this.shouldSkipDuplicateRealtimeDispatch(getPositionsSnapshotDedupeKey(positions))) {
            return;
          }

          this.callbacks.onPositionsSnapshot?.(positions);
          this.publishStream('account.positions', positions, envelope);
          return;
        }

        const position = mapPosition(source.position ?? source);
        if (position) {
          const action = normalizeUpdateAction(source.action ?? source.type);
          this.applyPositionUpdateToCachedSnapshot(action, position);
          if (this.shouldSkipDuplicateRealtimeDispatch(getPositionDedupeKey(action, position))) {
            return;
          }

          const positionPayload = { action, position };
          this.callbacks.onPositionUpdate?.(positionPayload);
          this.publishStream('account.positions', positionPayload, envelope);
        }
        return;
      }

      if (canonicalRealtimeEvent === 'SYMBOL_LIST') {
        const symbols = mapSymbolList(eventData);
        this.resolvePendingRequest(envelope.requestId, eventData);
        if (symbols.length > 0) {
          if (this.shouldSkipDuplicateRealtimeDispatch(getSymbolListDedupeKey(symbols))) {
            return;
          }

          this.callbacks.onSymbolList?.(symbols);
          this.publishStream('market.symbols', symbols, envelope);
        }
        return;
      }

      if (canonicalRealtimeEvent === 'SYMBOL_UPDATE') {
        const symbol = mapSymbolUpdate(eventData);
        if (!symbol?.name.trim()) {
          return;
        }

        if (this.shouldSkipDuplicateRealtimeDispatch(getSymbolUpdateDedupeKey(symbol))) {
          return;
        }

        this.callbacks.onSymbolUpdate?.(symbol);
        this.publishStream('market.symbolUpdates', symbol, envelope);
        return;
      }

      if (canonicalRealtimeEvent === 'MARKET_STATUS') {
        const marketStatus = mapMarketStatus(eventData);
        if (this.shouldSkipDuplicateRealtimeDispatch(getMarketStatusDedupeKey(marketStatus))) {
          return;
        }

        this.callbacks.onMarketStatus?.(marketStatus);
        this.publishStream('market.status', marketStatus, envelope);
        return;
      }

      if (canonicalRealtimeEvent === 'ORDER_UPDATE') {
        const source = isObject(eventData) ? eventData : {};
        if (Array.isArray(source.orders)) {
          const orders = source.orders
            .map((order) => mapOrder(order))
            .filter((order): order is Order => Boolean(order));
          this.callbacks.onOrdersSnapshot?.(orders);
          this.publishStream('account.orders', orders, envelope);
          return;
        }

        const order = mapOrder(source.order ?? source);
        if (order) {
          const action = normalizeUpdateAction(source.action ?? source.type);
          const orderPayload = { action, order };
          this.callbacks.onOrderUpdate?.(orderPayload);
          this.publishStream('account.orders', orderPayload, envelope);
        }
        return;
      }

      if (normalizedEventName === 'connection_status') {
        const source = isObject(eventData) ? eventData : {};
        this.applyHeartbeatSettings(source);
        const rawStatus =
          typeof source.status === 'string' ? source.status : 'connected';
        if (rawStatus === 'unauthenticated') {
          this.resetSocketAuthentication();
        }
        const normalizedStatus =
          rawStatus === 'authenticated'
            ? 'connected'
            : rawStatus === 'unauthenticated'
              ? 'disconnected'
              : rawStatus;
        this.notifyConnectionStatus({
          status: normalizedStatus,
          degraded: source.degraded === true,
          warnings: source.warnings,
          message:
            typeof source.message === 'string' ? source.message : undefined,
        }, envelope);
        return;
      }

      if (normalizedEventName === 'pong') {
        this.applyHeartbeatSettings(eventData);
        this.awaitingPong = false;
        this.lastPongAt = Date.now();
        this.clearPongTimeout();
      }

      const envelopeStream = parseOptionalString(envelope.stream);
      if (envelopeStream) {
        this.publishStream(envelopeStream, eventData, envelope);
      }
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error
          ? error
          : new Error('Failed to parse realtime server message'),
      );
    }
  };

  private notifyOhlcListeners(payload: OhlcPayload): void {
    this.ohlcReplayCache.push({ ...payload });
    if (this.ohlcReplayCache.length > OHLC_REPLAY_CACHE_LIMIT) {
      this.ohlcReplayCache.splice(
        0,
        this.ohlcReplayCache.length - OHLC_REPLAY_CACHE_LIMIT,
      );
    }

    this.ohlcListeners.forEach((listener) => listener(payload));
    this.publishStream('market.candles', payload);
  }

  private notifyOhlcHistoryMetadata(metadata: OhlcHistoryResponseMetadata): void {
    this.callbacks.onOhlcHistoryMetadata?.(metadata);
    this.ohlcHistoryMetadataListeners.forEach((listener) => listener(metadata));
  }

  private async sendAuthenticatedRequest<T>(
    action: string,
    data?: unknown,
    timeoutMs: number = WS_CONFIG.TIMEOUT,
  ): Promise<T> {
    if (!this.isAuthenticated) {
      await this.waitForSocketAuthentication(action, timeoutMs);
    }

    return this.sendRequest<T>(action, data, timeoutMs);
  }

  private async sendSessionQueryRequest(
    action: string,
    data?: unknown,
    timeoutMs: number = WS_CONFIG.TIMEOUT,
  ): Promise<Record<string, unknown>> {
    let lastRetry: ReturnType<typeof getSessionQueryRetry> = null;
    let markReconnectRetryResponse = false;

    for (let attempt = 0; attempt < SESSION_QUERY_RETRY_ATTEMPTS; attempt += 1) {
      let payload: Record<string, unknown>;
      try {
        if (!this.isAuthenticated) {
          await this.waitForSessionQueryAuthentication(action);
        }
        payload = await this.sendRequest<Record<string, unknown>>(
          action,
          data,
          timeoutMs,
        );
        if (markReconnectRetryResponse) {
          markSessionQueryReconnectRetryResponse(payload);
        }
      } catch (error) {
        lastRetry =
          getSessionQueryErrorRetry(error) ??
          getSessionQueryReconnectRetry(error);
        if (!lastRetry || attempt >= SESSION_QUERY_RETRY_ATTEMPTS - 1) {
          throw error;
        }

        if (lastRetry.waitForAuthentication) {
          markReconnectRetryResponse = true;
          await this.waitForSessionQueryAuthentication(action).catch((authError) => {
            if (isPermanentTokenRefreshFailure(authError)) {
              throw authError;
            }
          });
        }

        await delay(lastRetry.retryAfterMs);
        continue;
      }

      const hardError = getSessionQueryPayloadHardError(action, payload);
      if (hardError) {
        throw hardError;
      }

      lastRetry = getSessionQueryRetry(action, payload);
      if (!lastRetry) {
        markReconnectRetryResponse = false;
        return payload;
      }

      if (attempt < SESSION_QUERY_RETRY_ATTEMPTS - 1) {
        await delay(lastRetry.retryAfterMs);
      }
    }

    const error = new Error(
      lastRetry?.message ??
        `${action} is still deferred by the MT5 manager after retrying.`,
    );
    Object.assign(error, {
      code: lastRetry?.code ?? 'mt5_manager_query_deferred',
      retryable: true,
    });
    throw error;
  }

  private async waitForSessionQueryAuthentication(action: string): Promise<void> {
    if (this.isAuthenticated) {
      return;
    }

    if (this.manualDisconnect || !this.hasReconnectCredentials()) {
      throw new Error(`${action} requires an authenticated websocket session`);
    }

    if (
      !this.reconnectTimer &&
      !this.connectionPromise &&
      !this.isAuthenticatingWithToken &&
      !this.isRestoringSession
    ) {
      this.notifyConnectionStatus({
        status: 'reconnecting',
        message: 'Restoring MT5 session before refreshing account state...',
      });
      this.scheduleReconnect();
    }

    await this.waitForSocketAuthentication(
      action,
      Math.max(WS_CONFIG.TIMEOUT, SESSION_QUERY_RECONNECT_WAIT_MS),
    );
  }

  private clearExpiredTradeRequestCorrelations(now = Date.now()): void {
    this.recentTradeRequestCorrelations.forEach((correlation, requestId) => {
      if (correlation.expiresAtMs <= now) {
        this.recentTradeRequestCorrelations.delete(requestId);
      }
    });
  }

  private rememberTradeRequestCorrelation(
    requestId: string,
    action: string,
    data: unknown,
  ): void {
    if (!isTradeExecutionAction(action)) {
      return;
    }

    const now = Date.now();
    this.clearExpiredTradeRequestCorrelations(now);
    this.recentTradeRequestCorrelations.set(requestId, {
      action,
      data,
      expiresAtMs: now + TRADE_REQUEST_CORRELATION_TTL_MS,
    });
  }

  private getTradeRequestCorrelation(
    requestId: string | undefined,
  ): RecentTradeRequestCorrelation | undefined {
    if (!requestId) {
      return undefined;
    }

    this.clearExpiredTradeRequestCorrelations();
    return this.recentTradeRequestCorrelations.get(requestId);
  }

  private sendRequest<T>(
    action: string,
    data?: unknown,
    timeoutMs: number = WS_CONFIG.TIMEOUT,
  ): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected'));
    }

    if (this.pendingRequests.size >= MAX_PENDING_WEBSOCKET_REQUESTS) {
      return Promise.reject(
        new Error(
          `WebSocket request backpressure: ${this.pendingRequests.size} requests are already pending.`,
        ),
      );
    }

    const requestId = this.nextRequestId(action);
    const stream = getStreamForAction(action);

    return new Promise<T>((resolve, reject) => {
      const clientSentAtMs = Date.now();
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(getRequestTimeoutMessage(action)));
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        action,
        data,
        clientSentAtMs,
      });
      this.rememberTradeRequestCorrelation(requestId, action, data);
      try {
        this.socket!.send(
          JSON.stringify({
            action,
            requestId,
            ...(stream ? { stream, streamId: stream } : {}),
            data: data ?? {},
          }),
        );
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        this.recentTradeRequestCorrelations.delete(requestId);
        reject(error);
      }
    });
  }

  private nextRequestId(action: string): string {
    this.requestCounter += 1;
    return `${action}:${Date.now()}:${this.requestCounter}`;
  }

  private resolvePendingRequest(requestId: string | undefined, payload: unknown): void {
    if (!requestId) {
      return;
    }

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    if (pending.action === 'request_ohlc_history' && isObject(payload)) {
      const historyResponse = mapOhlcHistoryResponse(payload, {});
      if (isDeferredEmptyOhlcHistoryResponse(historyResponse)) {
        this.notifyOhlcHistoryMetadata(historyResponse.metadata);
        this.publishStream('market.candleHistory', historyResponse);
      }
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    if (pending.action === 'subscribe_ohlc' && isObject(payload)) {
      const clientAckReceivedAtMs = Date.now();
      const rawTiming = isObject(payload.timing) ? payload.timing : undefined;
      const serverReceivedAtMs =
        parseOptionalFiniteNumber(payload.serverReceivedAtMs) ??
        parseOptionalFiniteNumber(rawTiming?.serverReceivedAtMs);
      const serverAckAtMs =
        parseOptionalFiniteNumber(payload.serverAckAtMs) ??
        parseOptionalFiniteNumber(rawTiming?.serverAckAtMs);
      const serverProcessingMs =
        parseOptionalFiniteNumber(payload.serverProcessingMs) ??
        parseOptionalFiniteNumber(rawTiming?.serverProcessingMs);
      const roundTripMs = Math.max(0, clientAckReceivedAtMs - pending.clientSentAtMs);
      const clientTiming: OhlcSubscriptionAckClientTiming = {
        clientSentAtMs: pending.clientSentAtMs,
        clientAckReceivedAtMs,
        clientAckLatencyMs: roundTripMs,
        roundTripMs,
      };
      const ackPayload: OhlcSubscriptionAck = {
        ...payload,
        requestId,
        action: parseOptionalString(payload.action) ?? pending.action,
        ...(typeof payload.ack === 'boolean' ? { ack: payload.ack } : {}),
        ...clientTiming,
        clientTiming,
        ...(serverReceivedAtMs !== undefined ? { serverReceivedAtMs } : {}),
        ...(serverAckAtMs !== undefined ? { serverAckAtMs } : {}),
        ...(serverProcessingMs !== undefined ? { serverProcessingMs } : {}),
        ...(rawTiming ? { timing: { ...rawTiming } } : {}),
      };
      this.lastOhlcSubscriptionAck = ackPayload;
      pending.resolve(ackPayload);
      return;
    }

    pending.resolve(payload);
  }

  private resolveMatchingPendingOhlcHistoryRefresh(
    history: OhlcHistoryResponse,
    payload: unknown,
  ): void {
    if (!isOhlcHistoryRefreshFallbackCorrelated(payload, history.metadata)) {
      return;
    }

    const matchingRequestIds: string[] = [];

    this.pendingRequests.forEach((pending, requestId) => {
      if (
        pending.action === 'request_ohlc_history' &&
        ohlcHistoryRequestMatchesRefresh(pending.data, history.metadata)
      ) {
        matchingRequestIds.push(requestId);
      }
    });

    matchingRequestIds.forEach((requestId) => {
      this.resolvePendingRequest(requestId, payload);
    });
  }

  private rejectPendingRequest(requestId: string, error: Error): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    pending.reject(error);
  }

  private rejectPendingRequests(error: Error): void {
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pendingRequests.clear();
  }

  private waitForSocketAuthentication(action: string, timeoutMs: number): Promise<void> {
    if (this.isAuthenticated) {
      return Promise.resolve();
    }

    if (
      !this.isAuthenticatingWithToken &&
      !this.authToken &&
      !this.authTokenProvider &&
      !this.session
    ) {
      return Promise.reject(new Error(`${action} requires an authenticated websocket session`));
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: AuthWaiter = {
        resolve: () => {
          clearTimeout(waiter.timeout);
          this.authWaiters.delete(waiter);
          resolve();
        },
        reject: (reason?: unknown) => {
          clearTimeout(waiter.timeout);
          this.authWaiters.delete(waiter);
          reject(reason);
        },
        timeout: setTimeout(() => {
          this.authWaiters.delete(waiter);
          reject(new Error(`${action} timed out waiting for websocket authentication`));
        }, timeoutMs),
      };

      this.authWaiters.add(waiter);
    });
  }

  private resolveAuthWaiters(): void {
    const waiters = [...this.authWaiters];
    this.authWaiters.clear();
    waiters.forEach((waiter) => waiter.resolve());
  }

  private rejectAuthWaiters(error: Error): void {
    const waiters = [...this.authWaiters];
    this.authWaiters.clear();
    waiters.forEach((waiter) => waiter.reject(error));
  }

  private clearPositionsRequestCache(options: {
    reconnectRetryEligible?: boolean;
  } = {}): void {
    this.positionsRequestPromise = null;
    const generation = this.invalidatePositionsSnapshotCache();
    if (options.reconnectRetryEligible) {
      this.positionsReconnectResetGeneration = generation;
    }
  }

  private advancePositionsSnapshotGeneration(): number {
    this.positionsRequestPromise = null;
    this.positionsSnapshotGeneration += 1;
    this.positionsReconnectResetGeneration = null;
    return this.positionsSnapshotGeneration;
  }

  private invalidatePositionsSnapshotCache(): number {
    this.lastPositionsSnapshot = null;
    this.lastPositionsSnapshotReceivedAtMs = 0;
    return this.advancePositionsSnapshotGeneration();
  }

  private getReconnectRebasedPositionsGeneration(
    requestGeneration: number,
    request: Promise<Position[]> | null,
  ): number {
    const reconnectGeneration = this.positionsReconnectResetGeneration;
    const hasNewerInFlightRefresh =
      this.positionsRequestPromise !== null &&
      this.positionsRequestPromise !== request;
    if (
      reconnectGeneration !== null &&
      reconnectGeneration > requestGeneration &&
      reconnectGeneration === this.positionsSnapshotGeneration &&
      !hasNewerInFlightRefresh
    ) {
      return reconnectGeneration;
    }

    return requestGeneration;
  }

  private cachePositionsSnapshot(
    positions: Position[],
    requestGeneration = this.positionsSnapshotGeneration,
  ): boolean {
    if (requestGeneration !== this.positionsSnapshotGeneration) {
      return false;
    }

    this.lastPositionsSnapshot = positions;
    this.lastPositionsSnapshotReceivedAtMs = Date.now();
    this.positionsReconnectResetGeneration = null;
    return true;
  }

  private applyPositionUpdateToCachedSnapshot(
    action: PositionUpdatePayload['action'],
    position: Position,
  ): void {
    const updateGeneration = this.advancePositionsSnapshotGeneration();

    if (this.lastPositionsSnapshot === null) {
      return;
    }

    const existingIndex = this.lastPositionsSnapshot.findIndex(
      (cachedPosition) => cachedPosition.ticket === position.ticket,
    );

    if (action === 'deleted') {
      if (existingIndex >= 0) {
        this.cachePositionsSnapshot(
          this.lastPositionsSnapshot.filter(
            (cachedPosition) => cachedPosition.ticket !== position.ticket,
          ),
          updateGeneration,
        );
      }
      return;
    }

    const nextSnapshot = [...this.lastPositionsSnapshot];
    if (existingIndex >= 0) {
      nextSnapshot[existingIndex] = position;
    } else {
      nextSnapshot.push(position);
    }
    this.cachePositionsSnapshot(nextSnapshot, updateGeneration);
  }

  private resetSocketAuthentication(): void {
    this.socketAuthenticated = false;
    this.clearTokenRefreshTimer();
    this.stopPingInterval();
    this.activeSubscriptions.clear();
    this.inFlightSubscriptions.clear();
    this.activeOhlcSubscriptions.clear();
    this.pendingOhlcSubscriptions.clear();
    this.ohlcSubscriptionGeneration += 1;
  }

  private hasReconnectCredentials(): boolean {
    return Boolean(this.authToken || this.authTokenProvider);
  }

  private destroyUnauthenticatedSocket(pendingError: Error): void {
    if (!this.socket || this.socketAuthenticated) {
      return;
    }

    this.destroySocket({
      closeTransport: true,
      pendingError,
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    if (this.manualDisconnect || !this.hasReconnectCredentials()) {
      return;
    }

    this.reconnectAttempts += 1;
    const slowReconnectAttempt =
      this.reconnectAttempts - WS_CONFIG.MAX_RECONNECT_ATTEMPTS;
    const reconnectDelay =
      slowReconnectAttempt > 0
        ? Math.min(
            SLOW_RECONNECT_INITIAL_INTERVAL_MS *
              2 ** Math.min(slowReconnectAttempt - 1, 4),
            SLOW_RECONNECT_MAX_INTERVAL_MS,
          )
        : WS_CONFIG.RECONNECT_INTERVAL;

    if (slowReconnectAttempt > 0) {
      this.notifyConnectionStatus({
        status: 'reconnecting',
        message:
          `Realtime connection is still unavailable after ${WS_CONFIG.MAX_RECONNECT_ATTEMPTS} quick retries. Keeping the MT5 session recoverable and retrying in ${Math.round(reconnectDelay / 1000)}s against ${normalizeWebSocketUrl(this.wsUrl)}. Check the gateway /health endpoint for upstream C++/websocket errors, restart the C++ realtime service if needed, and this page will reconnect automatically.`,
      });
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.manualDisconnect || !this.hasReconnectCredentials()) {
        return;
      }

      this.notifyConnectionStatus({
        status: 'reconnecting',
        message: 'Restoring MT5 session...',
      });

      const restored = await this.restoreSession();
      if (!restored) {
        if (this.manualDisconnect || !this.hasReconnectCredentials()) {
          return;
        }

        this.notifyConnectionStatus({
          status: 'reconnecting',
          message: 'Terminal authorization is not ready yet. Retrying...',
        });
        this.scheduleReconnect();
      }
    }, reconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private scheduleTokenRefresh(token: string): void {
    this.clearTokenRefreshTimer();

    if (!this.authTokenProvider || this.manualDisconnect) {
      return;
    }

    const expiresAtMs = parseAuthTokenExpiryMs(token);
    if (!expiresAtMs) {
      return;
    }

    const jitter = Math.floor(Math.random() * TOKEN_REFRESH_JITTER_MS);
    const refreshDelay = Math.max(
      TOKEN_REFRESH_MIN_DELAY_MS,
      expiresAtMs - Date.now() - TOKEN_REFRESH_SAFETY_MARGIN_MS - jitter,
    );
    const generation = this.tokenRefreshGeneration;

    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshTimer = null;
      void this.refreshTokenBeforeExpiry(generation);
    }, refreshDelay);
  }

  private clearTokenRefreshTimer(): void {
    this.tokenRefreshGeneration += 1;

    if (!this.tokenRefreshTimer) {
      return;
    }

    clearTimeout(this.tokenRefreshTimer);
    this.tokenRefreshTimer = null;
  }

  private async refreshTokenBeforeExpiry(generation: number): Promise<void> {
    if (
      generation !== this.tokenRefreshGeneration ||
      this.manualDisconnect ||
      !this.authTokenProvider
    ) {
      return;
    }

    if (this.isAuthenticatingWithToken || this.isRestoringSession) {
      this.retryTokenRefreshSoon();
      return;
    }

    if (this.isAuthenticated && this.pendingRequests.size > 0) {
      this.retryTokenRefreshSoon();
      return;
    }

    try {
      const token = await this.authTokenProvider();
      if (
        generation !== this.tokenRefreshGeneration ||
        this.manualDisconnect
      ) {
        return;
      }

      if (this.isAuthenticated && this.pendingRequests.size > 0) {
        this.retryTokenRefreshSoon();
        return;
      }

      if (!token) {
        throw Object.assign(
          new Error('Terminal session token is not available'),
          { code: 'TOKEN_MISSING' },
        );
      }

      if (!this.isConnected) {
        this.notifyConnectionStatus({
          status: 'reconnecting',
          message: 'Refreshing terminal authorization...',
        });
      }
      await this.authenticateWithToken(token);
      this.notifyConnectionStatus({
        status: 'connected',
        message: 'Terminal authorization refreshed.',
      });
      if (!this.skipBootstrapRefresh) {
        this.refreshBootstrapStateInBackground();
      }
    } catch (error) {
      if (isPermanentTokenRefreshFailure(error)) {
        this.handlePermanentTokenRefreshFailure(error);
        return;
      }

      this.retryTokenRefreshSoon();
    }
  }

  private handlePermanentTokenRefreshFailure(error: unknown): void {
    const authError =
      error instanceof Error
        ? error
        : new Error('Terminal authorization could not be refreshed');
    const message = authError.message || 'Terminal authorization could not be refreshed';

    this.clearReconnectTimer();
    this.clearTokenRefreshTimer();
    this.authTokenProvider = null;
    this.authToken = null;
    this.session = null;
    this.socketAuthenticated = false;
    this.callbacks.onAuthError?.(message);
    this.notifyConnectionStatus({
      status: 'disconnected',
      message,
    });
    this.rejectAuthWaiters(authError);
    this.destroySocket({
      closeTransport: true,
      pendingError: authError,
    });
  }

  private retryTokenRefreshSoon(): void {
    if (this.manualDisconnect || !this.authTokenProvider) {
      return;
    }

    this.clearTokenRefreshTimer();
    const generation = this.tokenRefreshGeneration;
    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshTimer = null;
      void this.refreshTokenBeforeExpiry(generation);
    }, TOKEN_REFRESH_RETRY_DELAY_MS);
  }

  private clearConnectTimeout(): void {
    if (!this.connectTimeout) {
      return;
    }

    clearTimeout(this.connectTimeout);
    this.connectTimeout = null;
  }

  private resolveConnect(connected: boolean): void {
    this.clearConnectTimeout();
    this.connectResolver?.(connected);
    this.connectResolver = null;
    this.connectionPromise = null;
  }

  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingInterval = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }

      if (
        this.awaitingPong &&
        this.lastPingSentAt > 0 &&
        Date.now() - this.lastPingSentAt >= this.pongTimeoutMs
      ) {
        this.handleHeartbeatTimeout();
        return;
      }

      if (this.awaitingPong) {
        return;
      }

      this.awaitingPong = true;
      this.lastPingSentAt = Date.now();
      try {
        this.socket.send(
          JSON.stringify({
            action: 'ping',
            requestId: this.nextRequestId('ping'),
            stream: 'terminal.connection',
            streamId: 'terminal.connection',
            data: {},
          }),
        );
        this.armPongTimeout();
      } catch {
        this.handleHeartbeatTimeout('WebSocket heartbeat send failed');
      }
    }, this.pingIntervalMs);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    this.clearPongTimeout();
    this.awaitingPong = false;
  }

  private armPongTimeout(): void {
    this.clearPongTimeout();
    this.pongTimeout = setTimeout(() => {
      if (this.awaitingPong) {
        this.handleHeartbeatTimeout();
      }
    }, this.pongTimeoutMs);
  }

  private clearPongTimeout(): void {
    if (!this.pongTimeout) {
      return;
    }

    clearTimeout(this.pongTimeout);
    this.pongTimeout = null;
  }

  private handleHeartbeatTimeout(reason = 'WebSocket heartbeat timed out'): void {
    this.stopPingInterval();
    this.resetSocketAuthentication();
    this.lastPingSentAt = 0;
    this.activeSubscriptions.clear();
    this.notifyConnectionStatus({
      status: 'reconnecting',
      message: `${reason}. Reconnecting...`,
    });
    this.destroySocket({
      closeTransport: true,
      pendingError: createConnectionLostError(reason),
    });
    this.scheduleReconnect();
  }

  private applyHeartbeatSettings(payload: unknown): void {
    if (!isObject(payload)) {
      return;
    }

    // Extract MT5 server time sent by the backend on every pong/connection_status.
    const mt5Ms = typeof payload.mt5ServerTimeMs === 'number' && payload.mt5ServerTimeMs > 0
      ? payload.mt5ServerTimeMs
      : null;
    if (mt5Ms) {
      this.callbacks.onMt5TimeUpdate?.(mt5Ms);
    }

    const intervalMs = parsePositiveSecondsToMs(
      payload.heartbeatIntervalSeconds,
    );
    const timeoutMs = parsePositiveSecondsToMs(payload.heartbeatTimeoutSeconds);
    const nextPingIntervalMs = Math.max(
      WS_CONFIG.PING_INTERVAL,
      intervalMs ?? this.pingIntervalMs,
    );
    const nextPongTimeoutMs = Math.max(
      WS_CONFIG.PONG_TIMEOUT,
      timeoutMs ?? this.pongTimeoutMs,
    );

    if (
      nextPingIntervalMs === this.pingIntervalMs &&
      nextPongTimeoutMs === this.pongTimeoutMs
    ) {
      return;
    }

    this.pingIntervalMs = nextPingIntervalMs;
    this.pongTimeoutMs = nextPongTimeoutMs;
    if (this.isAuthenticated) {
      this.startPingInterval();
    }
  }

  private getBackgroundOperationErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private warnBackgroundOperationFailed(operation: string, error: unknown): void {
    if (this.manualDisconnect) {
      return;
    }

    console.warn(`[WebSocketTradingClient] ${operation} failed`, {
      error: this.getBackgroundOperationErrorMessage(error),
    });
  }

  private debugBackgroundOperationIgnored(
    _operation: string,
    _error: unknown,
    _reason: string,
  ): void {
    // Intentionally silent — stale socket / manual disconnect / unauthenticated
    // are all expected situations. Real failures surface via warnBackgroundOperationFailed.
  }

  private getIgnorableBackgroundBootstrapFailureReason(
    error: unknown,
    scheduledSocket: WebSocket | null,
    scheduledSocketGeneration: number,
  ): string | null {
    if (this.manualDisconnect) {
      return 'manual disconnect';
    }

    if (
      this.socket !== scheduledSocket ||
      this.socketGeneration !== scheduledSocketGeneration
    ) {
      return 'stale websocket';
    }

    if (!this.isAuthenticated) {
      return 'client is no longer authenticated';
    }

    const message = this.getBackgroundOperationErrorMessage(error).toLowerCase();
    const transientMessages = [
      'not connected',
      'websocket disconnected',
      'transport closed',
      'upstream closed',
      'request_bootstrap_state timed out',
      'timed out waiting for websocket authentication',
      'connection lost',
      'reconnecting',
      'ws_route_action_not_allowed',
      'not available on the',
    ];

    return transientMessages.some((transientMessage) =>
      message.includes(transientMessage),
    )
      ? 'transient websocket failure'
      : null;
  }

  private restoreRealtimeStateInBackground(): void {
    void (async () => {
      if (!this.isAuthenticated) {
        return;
      }

      try {
        await this.restoreSubscriptions();
      } catch (error) {
        this.warnBackgroundOperationFailed(
          'Background symbol subscription restore',
          error,
        );
      }

      if (!this.isAuthenticated) {
        return;
      }

      try {
        await this.restoreOhlcSubscriptions();
      } catch (error) {
        this.warnBackgroundOperationFailed(
          'Background OHLC subscription restore',
          error,
        );
      }
    })();
  }

  private refreshBootstrapStateInBackground(): void {
    const scheduledSocket = this.socket;
    const scheduledSocketGeneration = this.socketGeneration;

    void this.refreshBootstrapState().catch((error) => {
      const ignoreReason = this.getIgnorableBackgroundBootstrapFailureReason(
        error,
        scheduledSocket,
        scheduledSocketGeneration,
      );

      if (ignoreReason) {
        this.debugBackgroundOperationIgnored(
          'Background bootstrap refresh',
          error,
          ignoreReason,
        );
        return;
      }

      this.warnBackgroundOperationFailed(
        'Background bootstrap refresh',
        error,
      );
    });
  }

  private async restoreSession(): Promise<boolean> {
    if (this.isRestoringSession) {
      return false;
    }

    this.isRestoringSession = true;
    this.clearPositionsRequestCache({ reconnectRetryEligible: true });
    try {
      const token = this.authTokenProvider
        ? await this.authTokenProvider()
        : this.authToken;

      if (!token) {
        this.destroyUnauthenticatedSocket(
          new Error('Terminal session token is not available'),
        );
        return false;
      }

      await this.authenticateWithToken(token);
      this.notifyConnectionStatus({
        status: 'connected',
        message: 'MT5 session restored.',
      });
      if (!this.skipBootstrapRefresh) {
        this.refreshBootstrapStateInBackground();
      }
      return true;
    } catch (error) {
      if (isPermanentTokenRefreshFailure(error)) {
        this.handlePermanentTokenRefreshFailure(error);
        return false;
      }

      this.destroyUnauthenticatedSocket(
        error instanceof Error
          ? error
          : new Error('Websocket session restore failed'),
      );
      return false;
    } finally {
      this.isRestoringSession = false;
    }
  }

  private async restoreSubscriptions(): Promise<void> {
    const subscriptionsToRestore = this.mergeSymbols(
      this.desiredSubscriptions,
      this.pendingSubscriptions,
    );

    if (subscriptionsToRestore.length === 0) {
      return;
    }

    await this.subscribeSymbols(subscriptionsToRestore);
  }

  private async restoreOhlcSubscriptions(): Promise<void> {
    const subscriptionsToRestore = [...this.desiredOhlcSubscriptions.entries()];
    if (subscriptionsToRestore.length === 0) {
      return;
    }

    await Promise.all(
      subscriptionsToRestore.map(async ([, request]) => {
        try {
          await this.subscribeOhlc(request.symbol, request.timeframeMinutes);
        } catch {
          // Keep desired subscriptions queued for the next authenticated socket.
        }
      }),
    );
  }

  private async sendOhlcSubscription(
    key: string,
    request: OhlcSubscriptionRequest,
    generation: number,
  ): Promise<boolean> {
    if (
      generation !== this.ohlcSubscriptionGeneration ||
      !this.desiredOhlcSubscriptions.has(key)
    ) {
      return true;
    }

    if (!this.isAuthenticated) {
      await this.waitForSocketAuthentication('subscribe_ohlc', 5000);
    }
    if (
      generation !== this.ohlcSubscriptionGeneration ||
      !this.desiredOhlcSubscriptions.has(key)
    ) {
      return true;
    }

    await this.sendRequest<unknown>('subscribe_ohlc', request, 5000);
    if (
      generation === this.ohlcSubscriptionGeneration &&
      this.desiredOhlcSubscriptions.has(key)
    ) {
      this.activeOhlcSubscriptions.add(key);
    }

    return true;
  }

  private normalizeOhlcSubscription(
    symbol: string,
    timeframeMinutes: number,
  ): OhlcSubscriptionRequest | null {
    const normalizedSymbol = symbol.trim();
    const normalizedTimeframe = parseInteger(timeframeMinutes);
    if (!normalizedSymbol || normalizedTimeframe <= 0) {
      return null;
    }

    return {
      symbol: normalizedSymbol,
      timeframeMinutes: normalizedTimeframe,
    };
  }

  private getOhlcSubscriptionKey(request: OhlcSubscriptionRequest): string {
    return `${request.symbol}:${request.timeframeMinutes}`;
  }

  private normalizeOptionalUnixMs(value: unknown): number | undefined {
    const parsed = parseNumber(value, Number.NaN);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }

    return Math.trunc(parsed < 10_000_000_000 ? parsed * 1000 : parsed);
  }

  private normalizeSymbols(symbols: string[]): string[] {
    return [...new Set(
      symbols
        .map((symbol) => symbol?.trim())
        .filter((symbol): symbol is string => Boolean(symbol))
    )];
  }

  private mergeSymbols(current: string[], next: string[]): string[] {
    return [...new Set([...current, ...next])];
  }

  private destroySocket(options: {
    closeTransport: boolean;
    pendingError?: Error;
  }): void {
    this.resetSocketAuthentication();

    if (options.pendingError) {
      this.rejectPendingRequests(options.pendingError);
    } else if (options.closeTransport && this.pendingRequests.size > 0) {
      this.rejectPendingRequests(
        createConnectionLostError('WebSocket transport closed'),
      );
    }

    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;

    if (
      options.closeTransport &&
      (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
    ) {
      socket.close();
    }

    this.socket = null;
    this.socketGeneration += 1;
  }

  private mapSessionFromAuthPayload(payload: Record<string, unknown>): TradingSession {
    const source = isObject(payload.session) ? payload.session : payload;

    return {
      id:
        typeof source.id === 'string'
          ? source.id
          : typeof source.sessionId === 'string'
            ? source.sessionId
            : '',
      login: parseInteger(source.login),
      server: typeof source.server === 'string' ? source.server : '',
      group:
        typeof source.group === 'string'
          ? source.group
          : typeof source.groupName === 'string'
            ? source.groupName
            : typeof source.group_name === 'string'
              ? source.group_name
              : '',
      name: typeof source.name === 'string' ? source.name : '',
      company: typeof source.company === 'string' ? source.company : '',
      currency: typeof source.currency === 'string' ? source.currency : 'USD',
      leverage: parseInteger(source.leverage, 1),
      status: 'connected',
      connectedAt: parseDate(source.connectedAt),
      lastPingAt: parseDate(source.lastHeartbeatAt),
    };
  }

  private async refreshBootstrapState(): Promise<void> {
    const bootstrap = await this.getBootstrapState();
    const deferred = new Set(
      (bootstrap.deferred ?? []).map((entry) => entry.toLowerCase()),
    );
    if (bootstrap.accountInfo) {
      this.callbacks.onAccountUpdate?.({ account: bootstrap.accountInfo });
      this.publishStream('account.balance', { account: bootstrap.accountInfo });
    }
    if (bootstrap.symbols.length > 0) {
      this.callbacks.onSymbolList?.(bootstrap.symbols);
      this.publishStream('market.symbols', bootstrap.symbols);
    }
    if (!deferred.has('positions')) {
      this.callbacks.onPositionsSnapshot?.(bootstrap.positions);
      this.publishStream('account.positions', bootstrap.positions);
    } else {
      void this.getPositions({ force: true })
        .then((positions) => {
          this.callbacks.onPositionsSnapshot?.(positions);
        })
        .catch((error) => {
          this.warnBackgroundOperationFailed(
            'Deferred positions refresh',
            error,
          );
        });
    }
    if (!deferred.has('orders')) {
      this.callbacks.onOrdersSnapshot?.(bootstrap.orders);
      this.publishStream('account.orders', bootstrap.orders);
    } else {
      void this.getOrders()
        .then((orders) => {
          this.callbacks.onOrdersSnapshot?.(orders);
        })
        .catch((error) => {
          this.warnBackgroundOperationFailed(
            'Deferred orders refresh',
            error,
          );
        });
    }
  }

}

export default WebSocketTradingClient;
