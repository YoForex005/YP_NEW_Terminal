'use client';

import {
  OhlcHistoryResponseMetadata,
  OhlcPayload,
} from '@/lib/trading/websocket-client';
import {
  WebSocketStreamKey,
  WebSocketStreamListener,
  WebSocketStreamRouter,
  WebSocketStreamWildcard,
} from '@/lib/trading/websocket-stream-router';
import type {
  Deal,
  Order,
  Position,
  PriceTick,
  SymbolInfo,
  TradeRequest,
  TradeResult,
  TerminalBootstrapState,
  TradingAccountInfo,
  TradingSession,
} from '@/types/webtrader';

type TicketClientStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

type JsonRecord = Record<string, unknown>;
type PendingRequest<T = unknown> = {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
  expectedTypes?: string[];
  lane: 'feed' | 'trade';
  operation?: string;
  request?: JsonRecord;
  clientSentAtMs: number;
};

export interface TerminalExchangeResponse {
  success?: boolean;
  terminal_token: string;
  expires_in?: number;
  feed_ticket: string;
  trade_ticket: string;
  ws_ticket_expires_in?: number;
  account_context?: JsonRecord;
  initial_state_transport?: string;
}

export interface TerminalLaunchSessionResponse {
  success?: boolean;
  launch_url?: string;
  launch_code?: string;
  expires_in?: number;
  session_expires_in?: number;
}

export interface TerminalWsTicketRefreshResponse {
  success?: boolean;
  feed_ticket: string;
  trade_ticket: string;
  expires_in?: number;
}

export interface TerminalTicketClientOptions {
  terminalToken: string;
  feedTicket: string;
  tradeTicket: string;
  accountContext?: JsonRecord;
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  onStatus?: (status: TicketClientStatus, message?: string) => void;
  onError?: (error: Error) => void;
  onTerminalAuthExpired?: (error: Error) => void;
  onSession?: (session: TradingSession | null) => void;
  onTick?: (tick: PriceTick) => void;
  onAccountSummary?: (summary: {
    account: TradingAccountInfo | null;
    positions: Position[];
    orders: Order[];
  }) => void;
}

const REQUEST_TIMEOUT_MS = 15_000;
const RECONNECT_DELAY_MS = 1_500;
const parseDryRunFlag = (value: string | undefined): boolean => {
  if (value === undefined) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return !['0', 'false', 'no', 'off'].includes(normalized);
};

const parseEnabledFlag = (value: string | undefined): boolean =>
  ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());

const REAL_TRADING_ENABLED = parseEnabledFlag(process.env.NEXT_PUBLIC_ENABLE_REAL_TRADING);
const REQUESTED_DRY_RUN = REAL_TRADING_ENABLED
  ? parseDryRunFlag(process.env.NEXT_PUBLIC_TERMINAL_TRADE_DRY_RUN)
  : true;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const firstPositiveNumber = (...values: unknown[]): number => {
  for (const value of values) {
    const parsed = parseNumber(value, Number.NaN);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
};

const parseInteger = (value: unknown, fallback = 0): number =>
  Math.trunc(parseNumber(value, fallback));

const parseString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const collectContextText = (
  context: JsonRecord | undefined,
  keys: string[],
): string => {
  if (!context) return '';

  return keys
    .map((key) => context[key])
    .map((value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : ''))
    .join(' ')
    .toLowerCase();
};

const isDemoTradingContext = (context: JsonRecord | undefined): boolean => {
  const contextText = collectContextText(context, [
    'mode',
    'type',
    'account_type',
    'accountType',
    'challenge_type',
    'challengeType',
    'product_code',
    'productCode',
    'group',
    'mt5_group',
    'mt5Group',
    'server',
    'name',
  ]);
  if (!contextText) return false;

  return /(^|[^a-z0-9])(demo|sandbox|paper|practice|trial|free[_\s-]?trial)([^a-z0-9]|$)/.test(contextText);
};

const isLiveTradingContext = (context: JsonRecord | undefined): boolean => {
  const contextText = collectContextText(context, [
    'mode',
    'type',
    'account_type',
    'accountType',
    'challenge_type',
    'challengeType',
    'product_code',
    'productCode',
  ]);
  if (!contextText) return false;

  return /(^|[^a-z0-9])(live|funded|real|production)([^a-z0-9]|$)/.test(contextText);
};

const getErrorPayloadMessage = (payload: unknown, fallback: string): string => {
  if (!isRecord(payload)) return fallback;

  const error = isRecord(payload.error) ? payload.error : null;
  return parseString(
    payload.message ??
      payload.detail ??
      payload.code ??
      error?.message ??
      error?.detail ??
      error?.code,
    fallback,
  );
};

const isTerminalAuthError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(^|\b)(401|403|unauthorized|forbidden|invalid[_\s-]?(terminal[_\s-]?token|token|session)|expired[_\s-]?(token|session)|session[_\s-]?(revoked|expired|not[_\s-]?found))(\b|$)/i.test(message);
};

const parseDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 10_000_000_000 ? value : value * 1000);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return new Date();
};

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

const buildHttpUrl = (baseUrl: string | undefined, path: string): string => {
  if (!baseUrl?.trim()) return path;
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
};

const buildWsUrl = (baseUrl: string | undefined, path: string, ticket: string): string => {
  const base = normalizeWebSocketUrl(baseUrl?.trim() || '/');
  const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('ticket', ticket);
  return url.toString();
};

const normalizeTerminalApiBase = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;

  const normalized = value.trim();
  if (!normalized) return '';

  return ['proxy', 'same-origin', 'same_origin'].includes(normalized.toLowerCase())
    ? ''
    : normalized;
};

export const getTerminalApiBaseUrl = (): string => {
  const terminalApiBase = normalizeTerminalApiBase(process.env.NEXT_PUBLIC_TERMINAL_API_BASE);
  if (terminalApiBase !== undefined) return terminalApiBase;

  // Browser must use same-origin Next proxy (`/api/terminal/...`) to avoid CORS.
  // Absolute NEXT_PUBLIC_API_BASE_URL is for server-side only.
  if (typeof window !== 'undefined') {
    return '';
  }

  return process.env.NEXT_PUBLIC_API_BASE_URL || '';
};

export const getTerminalWsBaseUrl = (): string => {
  const explicitWsBase = process.env.NEXT_PUBLIC_TERMINAL_WS_BASE;
  if (explicitWsBase?.trim()) return explicitWsBase;

  const apiBase = getTerminalApiBaseUrl();
  if (apiBase.trim()) return normalizeWebSocketUrl(apiBase);

  return process.env.NEXT_PUBLIC_WS_URL || '';
};

export const exchangeTerminalLaunchCode = async (
  launchCode: string,
  apiBaseUrl = getTerminalApiBaseUrl(),
): Promise<TerminalExchangeResponse> => {
  const response = await fetch(buildHttpUrl(apiBaseUrl, '/api/terminal/sessions/exchange'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ launch_code: launchCode }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload)) {
    throw new Error(
      getErrorPayloadMessage(
        payload,
        `Terminal launch exchange failed with HTTP ${response.status}.`,
      ),
    );
  }

  return payload as unknown as TerminalExchangeResponse;
};

export const createTerminalLaunchSession = async (
  login: number | string,
  apiBaseUrl = '',
): Promise<TerminalLaunchSessionResponse> => {
  const response = await fetch(buildHttpUrl(apiBaseUrl, '/api/terminal/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ login }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload)) {
    throw new Error(
      getErrorPayloadMessage(
        payload,
        `Terminal launch session failed with HTTP ${response.status}.`,
      ),
    );
  }

  return payload as unknown as TerminalLaunchSessionResponse;
};

export const refreshTerminalWsTickets = async (
  terminalToken: string,
  apiBaseUrl = getTerminalApiBaseUrl(),
): Promise<TerminalWsTicketRefreshResponse> => {
  const response = await fetch(
    buildHttpUrl(apiBaseUrl, '/api/terminal/sessions/refresh-ws-tickets'),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${terminalToken}` },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !isRecord(payload)) {
    throw new Error(
      getErrorPayloadMessage(
        payload,
        `WS ticket refresh failed with HTTP ${response.status}.`,
      ),
    );
  }

  const feedTicket = parseString(payload.feed_ticket);
  const tradeTicket = parseString(payload.trade_ticket);
  if (!feedTicket || !tradeTicket) {
    throw new Error('WS ticket refresh did not return feed and trade tickets.');
  }

  return {
    ...(payload as unknown as TerminalWsTicketRefreshResponse),
    feed_ticket: feedTicket,
    trade_ticket: tradeTicket,
  };
};

const mapAccountInfo = (payload: unknown, accountContext?: JsonRecord): TradingAccountInfo | null => {
  if (!isRecord(payload)) return null;
  const source = isRecord(payload.account)
    ? payload.account
    : isRecord(payload.accountInfo)
      ? payload.accountInfo
      : payload;

  const login = parseInteger(source.login ?? accountContext?.login ?? accountContext?.mt5_login);
  if (!login && !('balance' in source) && !('equity' in source)) return null;

  const marginFree =
    source.marginFree ?? source.freeMargin ?? source.free_margin ?? source.margin_free;
  const availableMargin =
    source.availableMargin ?? source.available_margin ?? source.marginAvailable ?? marginFree;
  const equity = parseNumber(source.equity);
  const margin = parseNumber(source.margin);
  const resolvedMarginFree = parseNumber(
    marginFree,
    equity - margin,
  );
  const resolvedMarginLevel = parseNumber(
    source.marginLevel ?? source.margin_level,
    margin > 0 ? (equity / margin) * 100 : 0,
  );

  return {
    login,
    name: parseString(source.name ?? accountContext?.name),
    server: parseString(source.server ?? accountContext?.server),
    currency: parseString(source.currency ?? accountContext?.currency, 'USD'),
    // Unknown leverage must remain unknown (0); displaying 1:1 would fabricate
    // an account setting that MT5 did not send.
    leverage: parseInteger(source.leverage ?? accountContext?.leverage, 0),
    balance: parseNumber(source.balance),
    equity,
    margin,
    marginFree: resolvedMarginFree,
    marginLevel: resolvedMarginLevel,
    marginInitial: parseNumber(source.marginInitial ?? source.margin_initial),
    marginMaintenance: parseNumber(source.marginMaintenance ?? source.margin_maintenance),
    profit: parseNumber(source.profit),
    swap: parseNumber(source.swap),
    commission: parseNumber(source.commission),
    credit: parseNumber(source.credit),
    limitOrders: parseInteger(source.limitOrders ?? source.limit_orders),
    availableMargin: parseNumber(availableMargin, resolvedMarginFree),
  };
};

const findProvidedValue = (source: JsonRecord, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
};

const mergeAccountInfo = (
  current: TradingAccountInfo | null,
  payload: JsonRecord,
  accountContext?: JsonRecord,
): TradingAccountInfo | null => {
  const source = isRecord(payload.account)
    ? payload.account
    : isRecord(payload.accountInfo)
      ? payload.accountInfo
      : payload;
  const totals = isRecord(payload.totals) ? payload.totals : {};
  const mapped = current ? null : mapAccountInfo(payload, accountContext);
  // Account deltas must produce a new reference. Mutating `current` caused
  // Zustand selectors to treat live MT5 updates as unchanged.
  const next = current ? { ...current } : mapped;
  if (!next) return null;

  const findDeltaValue = (...aliases: string[]) =>
    findProvidedValue(source, ...aliases) ??
    findProvidedValue(totals, ...aliases) ??
    findProvidedValue(payload, ...aliases);
  const setNumber = (key: keyof TradingAccountInfo, ...aliases: string[]) => {
    const value = findDeltaValue(...aliases);
    if (value !== undefined) {
      next[key] = parseNumber(value, next[key] as number) as never;
    }
  };
  const setInteger = (key: keyof TradingAccountInfo, ...aliases: string[]) => {
    const value = findDeltaValue(...aliases);
    if (value !== undefined) {
      next[key] = parseInteger(value, next[key] as number) as never;
    }
  };
  const setString = (key: keyof TradingAccountInfo, ...aliases: string[]) => {
    const value = findProvidedValue(source, ...aliases);
    if (value !== undefined) {
      next[key] = parseString(value, next[key] as string) as never;
    }
  };

  setInteger('login', 'login', 'mt5_login');
  setString('name', 'name');
  setString('server', 'server');
  setString('currency', 'currency');
  setInteger('leverage', 'leverage');
  setNumber('balance', 'balance');
  setNumber('equity', 'equity');
  setNumber('margin', 'margin');
  setNumber('marginFree', 'marginFree', 'freeMargin', 'free_margin', 'margin_free');
  setNumber('marginLevel', 'marginLevel', 'margin_level');
  setNumber('marginInitial', 'marginInitial', 'margin_initial');
  setNumber('marginMaintenance', 'marginMaintenance', 'margin_maintenance');
  setNumber('profit', 'profit', 'floatingProfit', 'floating_profit', 'floating');
  setNumber('swap', 'swap', 'storage');
  setNumber('commission', 'commission');
  setNumber('credit', 'credit');
  setInteger('limitOrders', 'limitOrders', 'limit_orders');
  setNumber('availableMargin', 'availableMargin', 'available_margin', 'marginAvailable');

  const equityProvided = findDeltaValue('equity') !== undefined;
  const marginProvided = findDeltaValue('margin') !== undefined;
  const marginFreeProvided =
    findDeltaValue('marginFree', 'freeMargin', 'free_margin', 'margin_free') !== undefined;
  const marginLevelProvided = findDeltaValue('marginLevel', 'margin_level') !== undefined;
  const availableMarginProvided =
    findDeltaValue('availableMargin', 'available_margin', 'marginAvailable') !== undefined;

  // MT5 free margin and margin level are deterministic from authoritative
  // equity/margin when a compact delta omits the precomputed fields.
  if (!marginFreeProvided && (equityProvided || marginProvided)) {
    next.marginFree = next.equity - next.margin;
  }
  if (!availableMarginProvided && (marginFreeProvided || equityProvided || marginProvided)) {
    next.availableMargin = next.marginFree;
  }
  if (!marginLevelProvided && (equityProvided || marginProvided)) {
    next.marginLevel = next.margin > 0 ? (next.equity / next.margin) * 100 : 0;
  }

  return next;
};

const mapPosition = (payload: unknown): Position | null => {
  if (!isRecord(payload)) return null;
  const ticket = parseInteger(
    payload.ticket ??
      payload.positionId ??
      payload.position_id ??
      payload.mt5_position_id ??
      payload.id,
  );
  const symbol = parseString(payload.symbol ?? payload.instrument);
  if (!ticket || !symbol) return null;

  const rawSide = parseString(payload.side ?? payload.type_label ?? payload.type ?? payload.position_type);
  const side = rawSide.toLowerCase().includes('sell') ? 'sell' : 'buy';

  return {
    accountId: parseString(payload.accountId ?? payload.account_id ?? payload.mt5_account_id) || undefined,
    accountLogin: parseInteger(payload.accountLogin ?? payload.account_login ?? payload.login ?? payload.mt5_login) || undefined,
    login: parseInteger(payload.accountLogin ?? payload.account_login ?? payload.login ?? payload.mt5_login) || undefined,
    ticket,
    symbol,
    type: side,
    volume: parseNumber(payload.lots ?? payload.volumeLots ?? payload.volume_lots ?? payload.volume),
    openPrice: parseNumber(
      payload.openPrice ??
        payload.open_price ??
        payload.priceOpen ??
        payload.price_open ??
        payload.entryPrice ??
        payload.entry_price ??
        payload.price,
    ),
    priceCurrent: parseNumber(
      payload.priceCurrent ??
        payload.currentPrice ??
        payload.price_current ??
        payload.current_price ??
        payload.marketPrice ??
        payload.market_price,
    ),
    sl: parseNumber(payload.sl ?? payload.stopLoss ?? payload.stop_loss ?? payload.price_sl),
    tp: parseNumber(payload.tp ?? payload.takeProfit ?? payload.take_profit ?? payload.price_tp),
    profit: parseNumber(payload.profit ?? payload.floatingProfit ?? payload.floating_profit ?? payload.floating),
    swap: parseNumber(payload.swap ?? payload.storage),
    commission: parseNumber(payload.commission),
    comment: parseString(payload.comment) || undefined,
    externalId: parseString(payload.externalId ?? payload.external_id) || undefined,
    openTime: parseDate(
      payload.openTime ??
        payload.open_time ??
        payload.openTimeMsc ??
        payload.open_time_msc ??
        payload.timeCreate ??
        payload.time_create ??
        payload.time ??
        payload.time_msc ??
        payload.created_at,
    ),
    magic: parseInteger(payload.magic) || undefined,
  };
};

const parseOrderType = (payload: JsonRecord): Order['type'] => {
  const raw = payload.type_label ?? payload.pending_type ?? payload.order_type ?? payload.type;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const orderTypes: Order['type'][] = [
      'buy',
      'sell',
      'buy_limit',
      'sell_limit',
      'buy_stop',
      'sell_stop',
      'buy_stop_limit',
      'sell_stop_limit',
    ];
    return orderTypes[Math.trunc(raw)] ?? 'buy_limit';
  }

  const normalized = parseString(raw, 'buy_limit').toLowerCase();
  const allowed: Order['type'][] = [
    'buy',
    'sell',
    'buy_limit',
    'sell_limit',
    'buy_stop',
    'sell_stop',
    'buy_stop_limit',
    'sell_stop_limit',
  ];
  return allowed.includes(normalized as Order['type'])
    ? normalized as Order['type']
    : 'buy_limit';
};

const parseOrderState = (payload: JsonRecord): Order['state'] => {
  const raw = payload.state_label ?? payload.status ?? payload.state;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const stateByCode: Record<number, Order['state']> = {
      0: 'started',
      1: 'placed',
      2: 'cancelled',
      3: 'filled',
      4: 'rejected',
      5: 'modified',
    };
    return stateByCode[Math.trunc(raw)] ?? 'placed';
  }

  const normalized = parseString(raw, 'placed').toLowerCase();
  const allowed: Order['state'][] = [
    'started',
    'placing',
    'placed',
    'modifying',
    'modified',
    'cancelling',
    'cancelled',
    'filling',
    'filled',
    'rejected',
  ];
  return allowed.includes(normalized as Order['state'])
    ? normalized as Order['state']
    : 'placed';
};

const mapOrder = (payload: unknown): Order | null => {
  if (!isRecord(payload)) return null;
  const ticket = parseInteger(
    payload.ticket ??
      payload.orderId ??
      payload.order_id ??
      payload.mt5_order_id ??
      payload.id,
  );
  const symbol = parseString(payload.symbol ?? payload.instrument);
  if (!ticket || !symbol) return null;

  return {
    ticket,
    symbol,
    type: parseOrderType(payload),
    state: parseOrderState(payload),
    volume: parseNumber(payload.lots ?? payload.volumeLots ?? payload.volume_lots ?? payload.volumeInitial ?? payload.volume_initial ?? payload.volume),
    volumeCurrent: parseNumber(payload.lots_current ?? payload.volumeCurrent ?? payload.volume_current ?? payload.volume),
    openPrice: parseNumber(payload.openPrice ?? payload.open_price ?? payload.orderPrice ?? payload.order_price ?? payload.price_order ?? payload.price),
    priceCurrent: parseNumber(payload.priceCurrent ?? payload.currentPrice ?? payload.price_current ?? payload.current_price),
    sl: parseNumber(payload.sl ?? payload.stopLoss ?? payload.stop_loss ?? payload.price_sl),
    tp: parseNumber(payload.tp ?? payload.takeProfit ?? payload.take_profit ?? payload.price_tp),
    profit: parseNumber(payload.profit),
    swap: parseNumber(payload.swap ?? payload.storage),
    commission: parseNumber(payload.commission),
    comment: parseString(payload.comment) || undefined,
    externalId: parseString(payload.externalId ?? payload.external_id) || undefined,
    openTime: parseDate(payload.openTime ?? payload.open_time ?? payload.setupTimeMsc ?? payload.setup_time_msc ?? payload.timeSetup ?? payload.time_setup ?? payload.time ?? payload.time_msc),
    closeTime: payload.closeTime ? parseDate(payload.closeTime) : undefined,
    expiration: payload.expiration ? parseDate(payload.expiration) : undefined,
    fillingMode: parseString(payload.fillingMode ?? payload.filling_mode, 'ioc') as Order['fillingMode'],
    magic: parseInteger(payload.magic) || undefined,
  };
};

const mapTradeResult = (payload: unknown): TradeResult => {
  const source = isRecord(payload) && isRecord(payload.result) ? payload.result : payload;
  const record = isRecord(source) ? source : {};
  const envelope = isRecord(payload) ? payload : {};
  const status = parseString(record.status ?? envelope.status).toLowerCase();
  const action = parseString(record.action ?? envelope.action).toLowerCase();
  const rejected =
    record.success === false ||
    ['failed', 'rejected', 'error'].includes(status);
  const retcodeFallback = rejected ? 10006 : 10009;
  const retcode = parseInteger(
    record.retcode ??
      record.ret_code ??
      record.code,
    retcodeFallback,
  );

  return {
    retcode,
    deal:
      record.deal === undefined &&
      record.mt5_deal_id === undefined &&
      record.deal_id === undefined
        ? undefined
        : parseInteger(record.deal ?? record.mt5_deal_id ?? record.deal_id),
    order:
      record.order === undefined &&
      record.mt5_order_id === undefined &&
      record.order_id === undefined
        ? undefined
        : parseInteger(record.order ?? record.mt5_order_id ?? record.order_id),
    volume: parseNumber(record.volume ?? record.confirmedVolume ?? envelope.volume),
    price: parseNumber(record.price ?? record.confirmedPrice ?? record.price_order ?? envelope.price),
    bid: record.bid === undefined ? undefined : parseNumber(record.bid),
    ask: record.ask === undefined ? undefined : parseNumber(record.ask),
    comment:
      parseString(record.comment ?? record.message ?? record.status ?? envelope.message) ||
      undefined,
    requestId:
      record.requestId === undefined &&
      record.request_id === undefined &&
      envelope.requestId === undefined &&
      envelope.request_id === undefined
        ? undefined
        : parseInteger(record.requestId ?? record.request_id ?? envelope.requestId ?? envelope.request_id),
    retcodeExternal:
      record.retcodeExternal === undefined ? undefined : parseInteger(record.retcodeExternal),
    pending:
      record.pending === true ||
      action === 'pending_order' ||
      status === 'pending' ||
      status === 'queued'
        ? true
        : undefined,
    outcomeUnknown: record.outcomeUnknown === true ? true : undefined,
    duplicateRetryBlocked: record.duplicateRetryBlocked === true ? true : undefined,
    retryAfterMs: record.retryAfterMs === undefined ? undefined : parseNumber(record.retryAfterMs),
  };
};

const mapTerminalTradeRequestPayload = (request: TradeRequest): JsonRecord => {
  const isMarket = request.type === 'buy' || request.type === 'sell';
  const payload: JsonRecord = {
    order_type: isMarket ? 'market' : 'pending',
    symbol: request.symbol,
    volume: request.volume,
  };

  if (isMarket) {
    payload.side = request.type;
  } else {
    payload.pending_type = request.type;
    if (request.price !== undefined) payload.price = request.price;
  }

  if (request.sl !== undefined) payload.stop_loss = request.sl;
  if (request.tp !== undefined) payload.take_profit = request.tp;
  if (request.deviation !== undefined) payload.deviation = request.deviation;
  if (request.comment !== undefined) payload.comment = request.comment;
  if (request.magic !== undefined) payload.magic = request.magic;
  if (request.fillingMode !== undefined) payload.filling_mode = request.fillingMode;
  if (request.typeTime !== undefined) payload.type_time = request.typeTime;
  if (request.expiration !== undefined) {
    payload.expiration = request.expiration instanceof Date
      ? request.expiration.toISOString()
      : request.expiration;
  }

  return payload;
};

const getFramePayload = (frame: JsonRecord): JsonRecord => {
  if (isRecord(frame.payload)) return frame.payload;
  if (isRecord(frame.data)) return frame.data;
  if (isRecord(frame.result)) return frame.result;
  return frame;
};

const mapTerminalOrderMutationPayload = (
  params: { sl?: number; tp?: number; price?: number },
): JsonRecord => {
  const payload: JsonRecord = {};
  if (params.price !== undefined) payload.price = params.price;
  if (params.sl !== undefined) payload.stop_loss = params.sl;
  if (params.tp !== undefined) payload.take_profit = params.tp;
  return payload;
};

const getNestedError = (frame: JsonRecord): JsonRecord => {
  const nested = frame.error;
  return isRecord(nested) ? nested : {};
};

const getTradeErrorMessage = (frame: JsonRecord): string => {
  const error = getNestedError(frame);
  const code = parseString(error.code ?? frame.code);
  const message = parseString(
    error.message ??
      error.detail ??
      error.reason ??
      frame.message ??
      frame.error,
  );

  if (code && message) return `${code}: ${message}`;
  return message || code || 'Trade websocket error.';
};

const mapTick = (payload: unknown): PriceTick | null => {
  if (!isRecord(payload)) return null;
  const symbol = parseString(payload.symbol);
  const bid = parseNumber(payload.bid, Number.NaN);
  const ask = parseNumber(payload.ask, Number.NaN);
  const last = parseNumber(payload.last ?? payload.price, Number.NaN);
  if (!symbol || [bid, ask, last].every((price) => !Number.isFinite(price) || price <= 0)) {
    return null;
  }

  const timestamp =
    payload.mt5_time_msc ??
    payload.mt5TimeMsc ??
    payload.mt5_time ??
    payload.mt5Time ??
    payload.time_msc ??
    payload.timeMsc ??
    payload.timestamp_msc ??
    payload.timestampMsc ??
    payload.tick_time ??
    payload.tickTime ??
    payload.timeMs ??
    payload.time_ms ??
    payload.timestampMs ??
    payload.timestamp_ms ??
    payload.time ??
    payload.timestamp;
  const mt5TimeMsc = firstPositiveNumber(payload.mt5_time_msc, payload.mt5TimeMsc);
  const mt5Time = firstPositiveNumber(payload.mt5_time, payload.mt5Time);
  const serverTimeMsc = firstPositiveNumber(payload.server_time_msc, payload.serverTimeMsc);
  const serverReceivedMsc = firstPositiveNumber(payload.server_received_msc, payload.serverReceivedMsc);
  const volume = firstPositiveNumber(
    payload.volume,
    payload.tick_volume,
    payload.tickVolume,
    payload.real_volume,
    payload.realVolume,
    payload.volume_real,
    payload.volumeReal,
  );
  const normalizedBid = Number.isFinite(bid) && bid > 0 ? bid : 0;
  const normalizedAsk = Number.isFinite(ask) && ask > 0 ? ask : 0;
  return {
    symbol,
    bid: normalizedBid,
    ask: normalizedAsk,
    last: Number.isFinite(last) && last > 0 ? last : undefined,
    volume: volume > 0 ? volume : undefined,
    time: parseDate(timestamp),
    ...(mt5TimeMsc > 0 ? { mt5_time_msc: mt5TimeMsc, mt5TimeMsc } : {}),
    ...(mt5Time > 0 ? { mt5_time: mt5Time, mt5Time } : {}),
    ...(serverTimeMsc > 0 ? { server_time_msc: serverTimeMsc, serverTimeMsc } : {}),
    ...(serverReceivedMsc > 0 ? { server_received_msc: serverReceivedMsc, serverReceivedMsc } : {}),
    spread: normalizedBid > 0 && normalizedAsk > 0
      ? Math.max(0, normalizedAsk - normalizedBid)
      : undefined,
    receivedAtMs: Date.now(),
  };
};

const getTickPayloadFromFrame = (frame: JsonRecord): JsonRecord => {
  const nestedPayload = isRecord(frame.payload)
    ? frame.payload
    : isRecord(frame.data)
      ? frame.data
      : isRecord(frame.tick)
        ? frame.tick
        : isRecord(frame.quote)
          ? frame.quote
          : isRecord(frame.price)
            ? frame.price
            : null;

  return nestedPayload ? { ...frame, ...nestedPayload } : frame;
};

const getPayloadArray = (source: JsonRecord, ...keys: string[]): unknown[] => {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
};

const parseTimeframeMinutes = (value: unknown, fallback = 1): number => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().toUpperCase();
    const numeric = Number(normalized);
    if (Number.isFinite(numeric) && numeric > 0) return Math.trunc(numeric);
    const match = normalized.match(/^([MHDW])(\d+)$/);
    if (match) {
      const amount = Number(match[2]);
      if (Number.isFinite(amount) && amount > 0) {
        if (match[1] === 'M') return amount;
        if (match[1] === 'H') return amount * 60;
        if (match[1] === 'D') return amount * 24 * 60;
        if (match[1] === 'W') return amount * 7 * 24 * 60;
      }
    }
  }

  return fallback;
};

const formatBackendTimeframe = (minutes: number): string => {
  if (minutes % (7 * 24 * 60) === 0) return `W${minutes / (7 * 24 * 60)}`;
  if (minutes % (24 * 60) === 0) return `D${minutes / (24 * 60)}`;
  if (minutes % 60 === 0) return `H${minutes / 60}`;
  return `M${minutes}`;
};

const normalizeChartHistorySource = (value: unknown): string => {
  const source = parseString(value);
  return !source || source === 'terminal-feed' ? 'chart.history' : source;
};

const mapOhlcPayload = (payload: unknown, fallback?: JsonRecord): OhlcPayload | null => {
  if (!isRecord(payload)) return null;
  const symbol = parseString(payload.symbol ?? fallback?.symbol);
  const timeframeMinutes = parseTimeframeMinutes(
    payload.timeframeMinutes ?? payload.timeframe_minutes ?? payload.timeframe ?? fallback?.timeframeMinutes ?? fallback?.timeframe,
  );
  const open = parseNumber(payload.open, Number.NaN);
  const high = parseNumber(payload.high, Number.NaN);
  const low = parseNumber(payload.low, Number.NaN);
  const close = parseNumber(payload.close, Number.NaN);
  if (!symbol || [open, high, low, close].some((value) => !Number.isFinite(value))) return null;

  const timeValue =
    payload.openTimeMs ??
    payload.open_time_ms ??
    payload.timeMs ??
    payload.time_msc ??
    payload.time ??
    fallback?.server_time_msc;
  const openTimeMs = parseDate(timeValue).getTime();

  return {
    symbol,
    timeframeMinutes,
    open,
    high,
    low,
    close,
    volume: firstPositiveNumber(
      payload.volume,
      payload.tick_volume,
      payload.tickVolume,
      payload.real_volume,
      payload.realVolume,
      payload.volume_real,
      payload.volumeReal,
    ),
    openTimeMs,
    closeTimeMs:
      payload.closeTimeMs !== undefined || payload.close_time_ms !== undefined
        ? parseDate(payload.closeTimeMs ?? payload.close_time_ms).getTime()
        : undefined,
    closed: payload.closed === undefined ? undefined : Boolean(payload.closed),
    source: normalizeChartHistorySource(payload.source ?? fallback?.source),
    cached: payload.cached === false ? undefined : true,
  };
};

const mapSymbolInfo = (payload: unknown): SymbolInfo | null => {
  const source = isRecord(payload) ? payload : {};
  const name = parseString(isRecord(payload) ? source.name ?? source.symbol : payload);
  if (!name) return null;

  const digits = parseInteger(source.digits, name.includes('JPY') ? 3 : 5);
  const point = parseNumber(source.point, digits > 0 ? 10 ** -digits : 0.00001);
  return {
    name,
    description: parseString(source.description, name),
    baseCurrency: parseString(source.baseCurrency ?? source.base_currency, name.slice(0, 3)),
    quoteCurrency: parseString(source.quoteCurrency ?? source.quote_currency, name.slice(3, 6) || 'USD'),
    digits,
    point,
    tickSize: parseNumber(source.tickSize ?? source.tick_size, point),
    tickValue: parseNumber(source.tickValue ?? source.tick_value, 1),
    tradeContractSize: parseNumber(source.tradeContractSize ?? source.trade_contract_size, 100000),
    tradeMode: parseString(source.tradeMode ?? source.trade_mode, 'full') as SymbolInfo['tradeMode'],
    calcMode: parseString(source.calcMode ?? source.calc_mode, 'forex') as SymbolInfo['calcMode'],
    volumeMin: parseNumber(source.volumeMin ?? source.volume_min, 0.01),
    volumeMax: parseNumber(source.volumeMax ?? source.volume_max, 100),
    volumeStep: parseNumber(source.volumeStep ?? source.volume_step, 0.01),
    marginInitial: parseNumber(source.marginInitial ?? source.margin_initial),
    marginMaintenance: parseNumber(source.marginMaintenance ?? source.margin_maintenance),
    swapLong: parseNumber(source.swapLong ?? source.swap_long),
    swapShort: parseNumber(source.swapShort ?? source.swap_short),
    category: parseString(source.category) || undefined,
  };
};

export class TerminalTicketRealtimeClient {
  private feedSocket: WebSocket | null = null;
  private tradeSocket: WebSocket | null = null;
  private manualDisconnect = false;
  private refreshPromise: Promise<void> | null = null;
  private stateRefreshPromise: Promise<void> | null = null;
  private stateRefreshReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private streamRouter = new WebSocketStreamRouter();
  private accountInfo: TradingAccountInfo | null = null;
  private positions: Position[] = [];
  private orders: Order[] = [];
  private symbols: SymbolInfo[] = [];
  private session: TradingSession | null = null;
  private lastTradeSeq = 0;
  private desiredFeedSymbols = new Set<string>();
  private feedSubscribedSymbols = new Set<string>();
  private ohlcListeners = new Set<(payload: OhlcPayload) => void>();
  private ohlcHistoryMetadataListeners = new Set<(metadata: OhlcHistoryResponseMetadata) => void>();
  // The terminal feed backend keeps only the newest chart request on a socket.
  // Serialize requests so a background prewarm cannot cancel the selected
  // symbol's in-flight history response.
  private chartRequestQueue: Promise<void> = Promise.resolve();

  private terminalToken: string;
  private feedTicket: string;
  private tradeTicket: string;

  public constructor(private readonly options: TerminalTicketClientOptions) {
    this.terminalToken = options.terminalToken;
    this.feedTicket = options.feedTicket;
    this.tradeTicket = options.tradeTicket;
  }

  public addStreamListener<TPayload = unknown>(
    stream: WebSocketStreamKey | WebSocketStreamWildcard,
    listener: WebSocketStreamListener<TPayload>,
  ): () => void {
    return this.streamRouter.subscribe(stream, listener);
  }

  public get isFeedConnected(): boolean {
    return this.feedSocket?.readyState === WebSocket.OPEN;
  }

  public get isTradeConnected(): boolean {
    return this.tradeSocket?.readyState === WebSocket.OPEN;
  }

  public get isConnected(): boolean {
    return this.isFeedConnected && this.isTradeConnected;
  }

  public get isAuthenticated(): boolean {
    return this.isConnected && Boolean(this.terminalToken);
  }

  public get currentSession(): TradingSession | null {
    return this.session;
  }

  public get supportsOhlcActions(): boolean {
    return true;
  }

  private shouldDryRunMutatingCommands(): boolean {
    if (!REAL_TRADING_ENABLED || REQUESTED_DRY_RUN) return true;
    if (isLiveTradingContext(this.options.accountContext)) return true;
    return !isDemoTradingContext(this.options.accountContext);
  }

  public addOhlcListener(listener: (payload: OhlcPayload) => void): () => void {
    this.ohlcListeners.add(listener);
    return () => {
      this.ohlcListeners.delete(listener);
    };
  }

  public addOhlcHistoryMetadataListener(
    listener: (metadata: OhlcHistoryResponseMetadata) => void,
  ): () => void {
    this.ohlcHistoryMetadataListeners.add(listener);
    return () => {
      this.ohlcHistoryMetadataListeners.delete(listener);
    };
  }

  public async subscribeOhlc(symbol: string, timeframeMinutes: number): Promise<boolean> {
    await this.requestChartHistory(symbol, timeframeMinutes, { limit: 500 }).catch(() => null);
    return true;
  }

  public async unsubscribeOhlc(_symbol: string, _timeframeMinutes: number): Promise<boolean> {
    return true;
  }

  public async getSymbols(): Promise<SymbolInfo[]> {
    if (this.symbols.length > 0) return this.symbols;
    const contextSymbols = getPayloadArray(this.options.accountContext ?? {}, 'symbols', 'market_symbols');
    this.symbols = contextSymbols.map(mapSymbolInfo).filter((symbol): symbol is SymbolInfo => Boolean(symbol));
    return this.symbols;
  }

  public async getBootstrapState(): Promise<TerminalBootstrapState> {
    return {
      accountInfo: this.accountInfo,
      symbols: await this.getSymbols(),
      positions: this.positions,
      orders: this.orders,
    };
  }

  public async sendAuthenticatedRequest<T>(
    action: string,
    data?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (action === 'request_ohlc_history' || action === 'chart.request') {
      const request = isRecord(data) ? data : {};
      const payload = await this.requestChartHistory(
        parseString(request.symbol),
        parseTimeframeMinutes(request.timeframeMinutes ?? request.timeframe),
        {
          limit: parseInteger(request.limit, 500),
          from: request.fromUnixMs ?? request.from,
          to: request.toUnixMs ?? request.to,
          before: request.beforeUnixMs ?? request.before,
          timeoutMs,
        },
      );
      return payload as T;
    }

    return this.sendTradeRequest<T>(
      action,
      isRecord(data) ? data : {},
      ['result', 'account.summary', 'history.closed'],
      timeoutMs,
    );
  }

  public async connect(): Promise<boolean> {
    this.manualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.options.onStatus?.('connecting');
    await Promise.all([this.connectFeed(), this.connectTrade()]);
    return this.isConnected;
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stateRefreshReleaseTimer) {
      clearTimeout(this.stateRefreshReleaseTimer);
      this.stateRefreshReleaseTimer = null;
    }
    this.stateRefreshPromise = null;
    this.feedSubscribedSymbols.clear();
    this.desiredFeedSymbols.clear();
    this.feedSocket?.close();
    this.tradeSocket?.close();
    this.feedSocket = null;
    this.tradeSocket = null;
    this.rejectPendingRequests(new Error('Terminal websocket disconnected.'));
    this.options.onStatus?.('disconnected');
  }

  public expireSession(): void {
    this.disconnect();
    this.terminalToken = '';
    this.feedTicket = '';
    this.tradeTicket = '';
  }

  public async revoke(): Promise<void> {
    await fetch(buildHttpUrl(this.options.apiBaseUrl, '/api/terminal/sessions/revoke'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.terminalToken}` },
    }).catch(() => undefined);
    this.disconnect();
  }

  public async subscribeSymbols(symbols: readonly string[]): Promise<boolean> {
    const normalizedSymbols = this.normalizeFeedSymbols(symbols);
    normalizedSymbols.forEach((symbol) => this.desiredFeedSymbols.add(symbol));
    const newSymbols = normalizedSymbols.filter((symbol) => !this.feedSubscribedSymbols.has(symbol));
    if (newSymbols.length === 0) return true;
    this.sendFeedSubscribe(newSymbols);
    return true;
  }

  public async unsubscribeSymbols(symbols: readonly string[]): Promise<boolean> {
    const normalizedSymbols = this.normalizeFeedSymbols(symbols);
    normalizedSymbols.forEach((symbol) => this.desiredFeedSymbols.delete(symbol));
    const activeSymbols = normalizedSymbols.filter((symbol) => this.feedSubscribedSymbols.has(symbol));
    if (activeSymbols.length === 0) return true;
    if (!this.isFeedConnected) {
      activeSymbols.forEach((symbol) => this.feedSubscribedSymbols.delete(symbol));
      return true;
    }
    this.sendFeed({ type: 'unsubscribe', symbols: activeSymbols });
    activeSymbols.forEach((symbol) => this.feedSubscribedSymbols.delete(symbol));
    return true;
  }

  public async getAccountInfo(): Promise<TradingAccountInfo | null> {
    await this.refreshState().catch(() => null);
    return this.accountInfo;
  }

  public async getPositions(): Promise<Position[]> {
    await this.refreshState().catch(() => null);
    return this.positions;
  }

  public async getOrders(): Promise<Order[]> {
    await this.refreshState().catch(() => null);
    return this.orders;
  }

  public async getTradeHistory(
    from: Date,
    to: Date,
    options: { limit?: number; maxRows?: number } = {},
  ): Promise<Deal[]> {
    const payload = await this.sendTradeRequest<JsonRecord>(
      'history.closed',
      {
        from: Math.floor(from.getTime() / 1000),
        to: Math.floor(to.getTime() / 1000),
        limit: options.limit ?? options.maxRows,
      },
      ['result', 'history.closed'],
    );
    const rows = getPayloadArray(getFramePayload(payload), 'history', 'deals', 'trades', 'rows');
    this.streamRouter.publish('account.history', rows);
    return rows as Deal[];
  }

  private async requestChartHistory(
    symbol: string,
    timeframeMinutes: number,
    options: {
      limit?: number;
      from?: unknown;
      to?: unknown;
      before?: unknown;
      timeoutMs?: number;
    } = {},
  ): Promise<JsonRecord> {
    const normalizedSymbol = symbol.trim();
    if (!normalizedSymbol) {
      throw new Error('Chart history request requires a symbol.');
    }

    const payload: JsonRecord = {
      type: 'chart.request',
      symbol: normalizedSymbol,
      timeframe: formatBackendTimeframe(timeframeMinutes),
      timeframeMinutes,
      limit: options.limit ?? 500,
      ...(options.from !== undefined ? { from: options.from } : {}),
      ...(options.to !== undefined ? { to: options.to } : {}),
      ...(options.before !== undefined ? { before: options.before } : {}),
    };

    const request = this.chartRequestQueue.then(() =>
      this.sendFeedRequest<JsonRecord>(
        payload,
        ['chart.history'],
        options.timeoutMs ?? 45_000,
      ),
    );
    this.chartRequestQueue = request.then(
      () => undefined,
      () => undefined,
    );
    return request;
  }

  public async placeOrder(request: TradeRequest): Promise<TradeResult> {
    const payload = await this.sendTradeRequest<JsonRecord>(
      'order.place',
      { ...mapTerminalTradeRequestPayload(request), dry_run: this.shouldDryRunMutatingCommands() },
      ['result'],
      30_000,
      request.clientRequestId,
    );
    return mapTradeResult(payload);
  }

  public async modifyOrder(
    ticket: number,
    params: { sl?: number; tp?: number; price?: number; isPosition?: boolean },
  ): Promise<TradeResult> {
    const operation = params.isPosition ? 'position.modify' : 'order.modify';
    const ticketKey = params.isPosition ? 'position_id' : 'order_id';
    const payload = await this.sendTradeRequest<JsonRecord>(
      operation,
      {
        [ticketKey]: ticket,
        ...mapTerminalOrderMutationPayload(params),
        dry_run: this.shouldDryRunMutatingCommands(),
      },
      ['result'],
      30_000,
    );
    return mapTradeResult(payload);
  }

  public async cancelOrder(ticket: number): Promise<TradeResult> {
    const payload = await this.sendTradeRequest<JsonRecord>(
      'order.cancel',
      { order_id: ticket, dry_run: this.shouldDryRunMutatingCommands() },
      ['result'],
      30_000,
    );
    return mapTradeResult(payload);
  }

  public async closePosition(ticket: number, volume?: number): Promise<TradeResult> {
    const payload = await this.sendTradeRequest<JsonRecord>(
      'position.close',
      {
        position_id: ticket,
        ...(volume !== undefined ? { volume } : {}),
        dry_run: this.shouldDryRunMutatingCommands(),
      },
      ['result'],
      30_000,
    );
    return mapTradeResult(payload);
  }

  private connectFeed(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.feedSocket) {
          this.detachSocketHandlers(this.feedSocket);
          this.feedSocket.close();
          this.rejectPendingRequests(new Error('feed websocket replaced.'), 'feed');
        }
        this.feedSubscribedSymbols.clear();
        const socket = new WebSocket(
          buildWsUrl(this.options.wsBaseUrl, '/ws/terminal/feed', this.feedTicket),
        );
        this.feedSocket = socket;
        socket.onopen = () => {
          this.streamRouter.publish('terminal.connection', { status: 'connected', lane: 'feed' });
          this.resubscribeDesiredFeedSymbols();
          resolve();
        };
        socket.onmessage = (event) => this.handleFeedMessage(event.data);
        socket.onerror = () => reject(new Error('Feed websocket connection failed.'));
        socket.onclose = (event) => {
          if (this.feedSocket !== socket) return;
          this.feedSubscribedSymbols.clear();
          this.handleSocketClose('feed', event);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private connectTrade(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.tradeSocket) {
          this.detachSocketHandlers(this.tradeSocket);
          this.tradeSocket.close();
          this.rejectPendingRequests(new Error('trade websocket replaced.'), 'trade');
        }
        const socket = new WebSocket(
          buildWsUrl(this.options.wsBaseUrl, '/ws/terminal/trade', this.tradeTicket),
        );
        this.tradeSocket = socket;
        socket.onopen = () => {
          this.options.onStatus?.('connected');
          this.streamRouter.publish('terminal.connection', { status: 'connected', lane: 'trade' });
          if (this.lastTradeSeq > 0) {
            const requestId = crypto.randomUUID();
            this.sendTrade({
              type: 'resume',
              request_id: requestId,
              requestId,
              last_seen_seq: this.lastTradeSeq,
            });
          }
          resolve();
        };
        socket.onmessage = (event) => this.handleTradeMessage(event.data);
        socket.onerror = () => reject(new Error('Trade websocket connection failed.'));
        socket.onclose = (event) => {
          if (this.tradeSocket !== socket) return;
          this.handleSocketClose('trade', event);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleFeedMessage(raw: string): void {
    const frame = this.parseFrame(raw);
    if (!frame) return;

    const type = parseString(frame.type ?? frame.event);
    if (type === 'quote' || type === 'tick' || type === 'price') {
      const tick = mapTick(getTickPayloadFromFrame(frame));
      if (tick) {
        this.options.onTick?.(tick);
        this.streamRouter.publish('market.prices', tick);
      }
      return;
    }

    if (type === 'chart.history') {
      this.applyChartHistory(frame);
      this.streamRouter.publish('market.candleHistory', frame);
      this.resolveMatchingPending(type, frame);
      return;
    }

    if (type === 'error') {
      const error = new Error(
        parseString(frame.message ?? frame.error?.toString(), 'Feed websocket error.'),
      );
      this.options.onError?.(error);
      const requestId = parseString(frame.requestId ?? frame.request_id ?? frame.id);
      if (requestId) {
        this.rejectPendingRequest(requestId, error);
      }
      return;
    }

    this.streamRouter.publish('terminal.connection', { status: type || 'feed.message', raw: frame });
  }

  private handleTradeMessage(raw: string): void {
    const frame = this.parseFrame(raw);
    if (!frame) return;

    const type = parseString(frame.type ?? frame.event);
    const normalizedType = type.toLowerCase();
    const seq = parseInteger(frame.seq, Number.NaN);
    if (Number.isFinite(seq) && seq > this.lastTradeSeq) {
      this.lastTradeSeq = seq;
    }

    if (type === 'connected') {
      this.session = this.buildSession(frame);
      this.options.onSession?.(this.session);
      this.options.onStatus?.('connected');
      return;
    }

    if (normalizedType === 'account.summary' || normalizedType === 'account_summary') {
      this.applyAccountSummary(frame);
      this.resolveMatchingPending('account.summary', frame);
      return;
    }

    if (
      normalizedType === 'account.summary.delta' ||
      normalizedType === 'account_summary_delta' ||
      normalizedType === 'account.update' ||
      normalizedType === 'account_update' ||
      normalizedType === 'balance.update' ||
      normalizedType === 'balance_update' ||
      normalizedType === 'equity.update' ||
      normalizedType === 'equity_update' ||
      normalizedType === 'margin.update' ||
      normalizedType === 'margin_update'
    ) {
      this.applyAccountSummaryDelta(frame);
      return;
    }

    if (type === 'result') {
      const op = parseString(frame.op ?? frame.operation);
      const requestId = parseString(frame.requestId ?? frame.request_id ?? frame.id);
      const pending = requestId ? this.pendingRequests.get(requestId) : undefined;
      const clientAckReceivedAtMs = Date.now();
      const clientTiming = pending
        ? {
            clientSentAtMs: pending.clientSentAtMs,
            clientAckReceivedAtMs,
            roundTripMs: Math.max(0, clientAckReceivedAtMs - pending.clientSentAtMs),
          }
        : undefined;
      if (op === 'state.refresh') {
        this.applyAccountSummary(frame);
      }
      this.resolveMatchingPending(type, frame);
      const action =
        op === 'order.place' ? 'place_order' :
        op === 'order.modify' ? 'modify_order' :
        op === 'order.cancel' ? 'cancel_order' :
        op === 'position.modify' ? 'modify_position' :
        op === 'position.close' ? 'close_position' :
        null;
      if (action) {
        this.streamRouter.publish('trade.execution', {
          action,
          requestId,
          request: pending?.request,
          result: mapTradeResult(getFramePayload(frame)),
          ...(clientTiming ? { clientTiming } : {}),
        });
      }
      return;
    }

    if (type === 'position') {
      this.applyPositionEvent(frame);
      return;
    }

    if (type === 'order') {
      this.applyOrderEvent(frame);
      return;
    }

    if (type === 'error') {
      const error = new Error(getTradeErrorMessage(frame));
      const requestId = parseString(frame.requestId ?? frame.request_id ?? frame.id);
      if (requestId && this.pendingRequests.has(requestId)) {
        this.rejectPendingRequest(requestId, error);
      } else {
        this.options.onError?.(error);
      }
      return;
    }

    if (normalizedType === 'state_refresh_failed') {
      const error = new Error(getTradeErrorMessage(frame));
      this.rejectMatchingPending(['account.summary', 'result'], error, 'trade');
      this.options.onError?.(error);
      return;
    }

    if (normalizedType === 'state_refresh_pending') {
      this.streamRouter.publish('terminal.connection', { status: type, raw: frame });
      return;
    }

    if (type === 'pong' || type === 'ack') {
      this.resolveMatchingPending(type, frame);
      return;
    }

    this.streamRouter.publish('terminal.connection', { status: type || 'trade.message', raw: frame });
  }

  private applyAccountSummary(frame: JsonRecord): void {
    const payload = getFramePayload(frame);
    const account = mapAccountInfo(payload, this.options.accountContext);
    const positions = getPayloadArray(payload, 'positions', 'open_positions')
      .map(mapPosition)
      .filter((position): position is Position => Boolean(position));
    const orders = getPayloadArray(payload, 'orders', 'pending_orders')
      .map(mapOrder)
      .filter((order): order is Order => Boolean(order));

    this.accountInfo = account;
    this.positions = positions;
    this.orders = orders;

    if (account) this.streamRouter.publish('account.balance', { account });
    this.streamRouter.publish('account.positions', positions);
    this.streamRouter.publish('account.orders', orders);
    this.options.onAccountSummary?.({ account, positions, orders });
  }

  private applyAccountSummaryDelta(frame: JsonRecord): void {
    const payload = getFramePayload(frame);
    const account = mergeAccountInfo(
      this.accountInfo,
      payload,
      this.options.accountContext,
    );
    if (account) {
      this.accountInfo = account;
      this.streamRouter.publish('account.balance', { account, delta: payload });
    }

    this.options.onAccountSummary?.({
      account: this.accountInfo,
      positions: this.positions,
      orders: this.orders,
    });
  }

  private resubscribeDesiredFeedSymbols(): void {
    const symbols = [...this.desiredFeedSymbols].filter((symbol) => !this.feedSubscribedSymbols.has(symbol));
    if (symbols.length === 0) return;
    try {
      this.sendFeedSubscribe(symbols);
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private applyPositionEvent(frame: JsonRecord): void {
    const payload = getFramePayload(frame);
    const rawPosition = isRecord(payload.position)
      ? payload.position
      : isRecord(frame.position)
        ? frame.position
        : payload;
    const position = mapPosition(rawPosition);
    if (!position) return;

    const eventName = parseString(payload.event ?? frame.event ?? payload.action ?? frame.action).toLowerCase();
    const action =
      eventName === 'close' || eventName === 'closed' || eventName === 'delete' || eventName === 'deleted'
        ? 'deleted'
        : eventName === 'open' || eventName === 'opened' || eventName === 'add' || eventName === 'added'
          ? 'added'
          : 'modified';

    if (action === 'deleted') {
      this.positions = this.positions.filter((entry) => entry.ticket !== position.ticket);
    } else {
      const existingIndex = this.positions.findIndex((entry) => entry.ticket === position.ticket);
      if (existingIndex < 0) {
        this.positions = [...this.positions, position];
      } else {
        const positions = this.positions.slice();
        positions[existingIndex] = position;
        this.positions = positions;
      }
    }

    this.streamRouter.publish('account.positions', { action, position, positions: this.positions });
    this.options.onAccountSummary?.({
      account: this.accountInfo,
      positions: this.positions,
      orders: this.orders,
    });
  }

  private applyOrderEvent(frame: JsonRecord): void {
    const payload = getFramePayload(frame);
    const rawOrder = isRecord(payload.order)
      ? payload.order
      : isRecord(frame.order)
        ? frame.order
        : payload;
    const order = mapOrder(rawOrder);
    if (!order) return;

    const eventName = parseString(payload.event ?? frame.event ?? payload.action ?? frame.action).toLowerCase();
    const isRemoved =
      eventName === 'filled' ||
      eventName === 'cancelled' ||
      eventName === 'canceled' ||
      eventName === 'delete' ||
      eventName === 'deleted';

    if (isRemoved) {
      this.orders = this.orders.filter((entry) => entry.ticket !== order.ticket);
    } else {
      const existingIndex = this.orders.findIndex((entry) => entry.ticket === order.ticket);
      if (existingIndex < 0) {
        this.orders = [...this.orders, order];
      } else {
        const orders = this.orders.slice();
        orders[existingIndex] = order;
        this.orders = orders;
      }
    }

    this.streamRouter.publish('account.orders', this.orders);
    this.options.onAccountSummary?.({
      account: this.accountInfo,
      positions: this.positions,
      orders: this.orders,
    });
  }

  private applyChartHistory(frame: JsonRecord): void {
    const payload = isRecord(frame.payload)
      ? frame.payload
      : isRecord(frame.data)
        ? frame.data
        : frame;
    const bars = getPayloadArray(payload, 'bars', 'candles', 'history')
      .map((bar) => mapOhlcPayload(bar, payload))
      .filter((bar): bar is OhlcPayload => Boolean(bar));

    for (const bar of bars) {
      this.ohlcListeners.forEach((listener) => listener(bar));
    }

    const metadata = {
      event: 'chart.history',
      status: parseString(payload.status, 'ready'),
      symbol: parseString(payload.symbol ?? bars[0]?.symbol),
      timeframeMinutes: parseTimeframeMinutes(payload.timeframeMinutes ?? payload.timeframe ?? bars[0]?.timeframeMinutes),
      limit: parseInteger(payload.limit, bars.length),
      returnedBarCount: bars.length,
      barCount: bars.length,
      source: normalizeChartHistorySource(payload.source),
      bars,
    } as OhlcHistoryResponseMetadata & { bars: OhlcPayload[] };

    this.ohlcHistoryMetadataListeners.forEach((listener) => listener(metadata));
  }

  private buildSession(frame: JsonRecord): TradingSession {
    const context = this.options.accountContext ?? {};
    const login = parseInteger(frame.login ?? context.login ?? context.mt5_login);
    return {
      id: parseString(frame.session_id ?? frame.sessionId ?? context.session_id, `terminal-${login || Date.now()}`),
      login,
      server: parseString(context.server ?? frame.server),
      group: parseString(context.group ?? frame.group) || undefined,
      name: parseString(context.name),
      company: parseString(context.company),
      currency: parseString(context.currency, 'USD'),
      leverage: parseInteger(context.leverage, 0),
      status: 'connected',
      connectedAt: new Date(),
      lastPingAt: new Date(),
    };
  }

  private parseFrame(raw: string): JsonRecord | null {
    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? parsed : null;
    } catch (error) {
      this.options.onError?.(new Error('Received malformed terminal websocket frame.'));
      return null;
    }
  }

  private sendFeed(payload: JsonRecord): void {
    if (this.feedSocket?.readyState !== WebSocket.OPEN) {
      throw new Error('Feed websocket is not connected.');
    }
    this.feedSocket.send(JSON.stringify(payload));
  }

  private sendFeedSubscribe(symbols: readonly string[]): boolean {
    const normalizedSymbols = this.normalizeFeedSymbols(symbols)
      .filter((symbol) => !this.feedSubscribedSymbols.has(symbol));
    if (normalizedSymbols.length === 0) {
      return true;
    }
    if (!this.isFeedConnected) {
      return false;
    }

    this.sendFeed(
      normalizedSymbols.length === 1
        ? { type: 'subscribe', symbol: normalizedSymbols[0] }
        : { type: 'subscribe', symbols: normalizedSymbols },
    );
    normalizedSymbols.forEach((symbol) => this.feedSubscribedSymbols.add(symbol));
    return true;
  }

  private normalizeFeedSymbols(symbols: readonly string[]): string[] {
    return [...new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))];
  }

  private sendTrade(payload: JsonRecord): void {
    if (this.tradeSocket?.readyState !== WebSocket.OPEN) {
      throw new Error('Trade websocket is not connected.');
    }
    this.tradeSocket.send(JSON.stringify(payload));
  }

  private refreshState(): Promise<void> {
    if (this.stateRefreshPromise) return this.stateRefreshPromise;

    if (this.stateRefreshReleaseTimer) {
      clearTimeout(this.stateRefreshReleaseTimer);
      this.stateRefreshReleaseTimer = null;
    }

    const refreshPromise = this.sendTradeRequest(
      'state.refresh',
      { sections: ['account', 'positions', 'orders'] },
      ['result', 'account.summary'],
    )
      .then(() => undefined)
      .finally(() => {
        // Keep the completed snapshot through this event-loop turn. The page
        // reads positions/orders first and account info immediately afterward;
        // all three should reuse the same authoritative state.refresh result.
        this.stateRefreshReleaseTimer = setTimeout(() => {
          if (this.stateRefreshPromise === refreshPromise) {
            this.stateRefreshPromise = null;
          }
          this.stateRefreshReleaseTimer = null;
        }, 0);
      });

    this.stateRefreshPromise = refreshPromise;
    return refreshPromise;
  }

  private detachSocketHandlers(socket: WebSocket): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  private sendFeedRequest<TPayload = JsonRecord>(
    payload: JsonRecord,
    expectedTypes: string[] = ['chart.history'],
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<TPayload> {
    const requestId = crypto.randomUUID();
    const request = new Promise<TPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`${parseString(payload.type, 'feed request')} timed out.`));
      }, timeoutMs);
      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        expectedTypes,
        lane: 'feed',
        operation: parseString(payload.type, 'feed.request'),
        request: payload,
        clientSentAtMs: Date.now(),
      });
    });

    try {
      this.sendFeed({ ...payload, requestId, request_id: requestId });
    } catch (error) {
      this.rejectPendingRequest(requestId, error);
    }
    return request;
  }

  private sendTradeRequest<TPayload = JsonRecord>(
    type: string,
    payload: JsonRecord = {},
    expectedTypes: string[] = ['result'],
    timeoutMs = REQUEST_TIMEOUT_MS,
    requestIdOverride?: string,
  ): Promise<TPayload> {
    const requestId = requestIdOverride?.trim() || crypto.randomUUID();
    const isCommand = type.includes('.');
    const isMutatingCommand = /^(order|position)\./.test(type);
    const explicitIdempotencyKey = parseString(payload.idempotency_key ?? payload.idempotencyKey);
    const idempotencyKey = isMutatingCommand
      ? explicitIdempotencyKey || requestId
      : '';
    const { idempotency_key: _snakeIdempotencyKey, idempotencyKey: _camelIdempotencyKey, ...commandPayload } = payload;
    const mustDryRun = isMutatingCommand ? this.shouldDryRunMutatingCommands() : false;
    const guardedCommandPayload = isMutatingCommand
      ? {
          ...commandPayload,
          dry_run: mustDryRun ? true : commandPayload.dry_run ?? false,
        }
      : commandPayload;
    const request = new Promise<TPayload>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`${type} timed out.`));
      }, timeoutMs);
      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        expectedTypes,
        lane: 'trade',
        operation: type,
        request: guardedCommandPayload,
        clientSentAtMs: Date.now(),
      });
    });

    try {
      this.sendTrade(
        isCommand
          ? {
              type: 'command',
              op: type,
              requestId,
              request_id: requestId,
              ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
              payload: guardedCommandPayload,
            }
          : { type, requestId, request_id: requestId, payload },
      );
    } catch (error) {
      this.rejectPendingRequest(requestId, error);
    }
    return request;
  }

  private resolveMatchingPending(type: string, frame: JsonRecord): void {
    const requestId = parseString(frame.requestId ?? frame.request_id ?? frame.id);
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId);
      if (!pending?.expectedTypes || pending.expectedTypes.includes(type)) {
        this.resolvePendingRequest(requestId, frame);
      }
      return;
    }

    for (const [id, pending] of this.pendingRequests) {
      if (!pending.expectedTypes || pending.expectedTypes.includes(type)) {
        this.resolvePendingRequest(id, frame);
        return;
      }
    }
  }

  private rejectMatchingPending(
    expectedTypes: string[],
    error: unknown,
    lane?: 'feed' | 'trade',
  ): void {
    for (const [id, pending] of [...this.pendingRequests]) {
      if (lane && pending.lane !== lane) continue;
      if (!pending.expectedTypes || pending.expectedTypes.some((type) => expectedTypes.includes(type))) {
        this.rejectPendingRequest(id, error);
      }
    }
  }

  private resolvePendingRequest(id: string, payload: unknown): void {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    pending.resolve(payload);
  }

  private rejectPendingRequest(id: string, error: unknown): void {
    const pending = this.pendingRequests.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);
    pending.reject(error);
  }

  private rejectPendingRequests(error: unknown, lane?: 'feed' | 'trade'): void {
    for (const [id, pending] of [...this.pendingRequests]) {
      if (!lane || pending.lane === lane) {
        this.rejectPendingRequest(id, error);
      }
    }
  }

  private handleSocketClose(lane: 'feed' | 'trade', event?: CloseEvent): void {
    if (this.manualDisconnect) return;
    const closeDetails = event
      ? ` (code ${event.code}${event.reason ? `: ${event.reason}` : ''})`
      : '';
    const message = `${lane} websocket disconnected${closeDetails}.`;
    this.rejectPendingRequests(new Error(message), lane);
    this.options.onStatus?.('reconnecting', `${message} Reconnecting...`);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.refreshTickets();
        await this.connect();
        await this.refreshState().catch(() => undefined);
      } catch (error) {
        const reconnectError = error instanceof Error ? error : new Error(String(error));
        this.options.onStatus?.('error');
        this.options.onError?.(reconnectError);
        if (isTerminalAuthError(error)) {
          this.expireSession();
          this.options.onTerminalAuthExpired?.(reconnectError);
          return;
        }
        this.scheduleReconnect();
      }
    }, RECONNECT_DELAY_MS);
  }

  private async refreshTickets(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const payload = await refreshTerminalWsTickets(this.terminalToken, this.options.apiBaseUrl);
      this.feedTicket = payload.feed_ticket;
      this.tradeTicket = payload.trade_ticket;
    })().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }
}
