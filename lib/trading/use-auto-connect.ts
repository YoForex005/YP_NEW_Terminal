'use client';

/**
 * useAutoConnectTrading
 *
 * On mount, initializes a server-managed terminal session via
 * GET /api/private/accounts/:accountId/terminal-session, then passes that token
 * to the backend WebSocket via 'auth_with_token'. Locked sessions are unlocked
 * by POSTing the password once to the terminal-session route.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useWebtraderStore } from '@/store/webtrader-store';
import { WebSocketTradingClient } from '@/lib/trading/websocket-client';
import { WS_ROUTES } from '@/lib/trading/constants';
import {
  DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS,
  getTerminalFallbackSymbolInfos,
  getInitialTerminalSubscriptionSymbols,
  getTerminalDisplaySymbols,
} from '@/lib/trading/terminal-symbols';
import { ohlcService } from '@/lib/terminal/ohlcWebSocketService';
import type {
  SymbolInfo,
  TerminalBootstrapState,
  TradingAccountInfo,
  TradingSession,
} from '@/types/webtrader';

/** Throttle Zustand mt5ServerTimeMs writes on the hot tick path (~2Hz max). */
const MT5_SERVER_TIME_WRITE_MIN_INTERVAL_MS = 500;
let lastMt5ServerTimeWrittenMs = 0;
let lastMt5ServerTimeWriteWallClockMs = 0;

function maybeSetMt5ServerTimeMs(ms: number): void {
  if (!(ms > 0)) {
    return;
  }
  const now = Date.now();
  const isFirstWrite = lastMt5ServerTimeWriteWallClockMs === 0;
  if (
    ms > lastMt5ServerTimeWrittenMs &&
    (isFirstWrite || now - lastMt5ServerTimeWriteWallClockMs >= MT5_SERVER_TIME_WRITE_MIN_INTERVAL_MS)
  ) {
    lastMt5ServerTimeWrittenMs = ms;
    lastMt5ServerTimeWriteWallClockMs = now;
    useWebtraderStore.getState().setMt5ServerTimeMs(ms);
  }
}

const TERMINAL_SESSION_REQUEST_TIMEOUT_MS = 15_000;
// Reuse a cached token if it expires more than 60s from now (was 75s).
const TERMINAL_SESSION_TOKEN_REUSE_MARGIN_MS = 60_000;
// Reuse a cached token for 5 min if there is no exp claim in the JWT (was 30s).
// This avoids a full DB chain round-trip on every WS reconnect in the common
// case where the token has no parseable expiry.
const TERMINAL_SESSION_TOKEN_UNKNOWN_EXPIRY_REUSE_MS = 300_000;
const SYMBOL_RETRY_ATTEMPTS = 3;
const SYMBOL_RETRY_DELAY_MS = 300;
const SYMBOL_BACKGROUND_RETRY_DELAYS_MS = [
  500,
  1_500,
  5_000,
  10_000,
  20_000,
  30_000,
  60_000,
] as const;
const SYMBOL_BACKGROUND_REFRESH_MAX_ATTEMPTS = SYMBOL_BACKGROUND_RETRY_DELAYS_MS.length;
const PARENT_RECONNECT_RETRY_DELAYS_MS = [
  1_000,    // first retry fast — covers brief gateway hiccup
  3_000,
  5_000,
  10_000,
  20_000,
  30_000,
  60_000,
  60_000,   // keep retrying every minute — covers Chrome freeze recovery
  60_000,
  120_000,
  120_000,
  120_000,
] as const;
const SYMBOLS_REFRESHING_CODE = 'SYMBOLS_REFRESHING';
const SYMBOLS_REFRESHING_MESSAGE =
  'MT5 terminal connected. Broker symbols are still refreshing; Market Watch will update automatically.';
const SYMBOLS_REFRESH_EXHAUSTED_CODE = 'SYMBOLS_REFRESH_EXHAUSTED';
const SYMBOLS_REFRESH_EXHAUSTED_MESSAGE =
  'MT5 terminal connected, but broker symbols are still unavailable after retrying. Reconnect or switch accounts to try again.';
const RECONNECT_RETRY_EXHAUSTED_CODE = 'RECONNECT_RETRY_EXHAUSTED';
const RECONNECT_RETRY_EXHAUSTED_MESSAGE =
  'MT5 terminal reconnect is still unavailable after retrying. Use reconnect or refresh after checking the realtime gateway.';
const PASSWORD_REQUIRED_CODE = 'PASSWORD_REQUIRED';
const TERMINAL_SESSION_TIMEOUT_CODE = 'TERMINAL_SESSION_TIMEOUT';
const TERMINAL_SESSION_RETRY_MESSAGE =
  'MT5 terminal session is still connecting. Please retry in a moment if it does not open automatically.';
const NO_LIVE_QUOTE_SERVER_MESSAGE =
  'No live MT5 quote server. Market Watch symbols loaded from cached bootstrap; bid/ask and charts will update when live ticks return.';
const MT5_UNAVAILABLE_MESSAGE =
  'MT5 terminal is unavailable. Check the MT5/backend connection and retry shortly.';
const BOOTSTRAP_FAILED_MESSAGE =
  'MT5 terminal bootstrap failed. Market data and account state are temporarily unavailable.';

const normalizeOhlcSessionGroup = (group?: string): string =>
  (group ?? '').trim().replace(/\//g, '\\');

export const buildOhlcSessionScopeId = (
  accountId: string,
  session: TradingSession,
): string =>
  // ── Data identity only — NOT connection identity ──────────────────────────
  // session.id is an ephemeral auth token that rotates on every WS
  // reconnect (10053/10054). Including it here caused the OHLC history
  // cache to be wiped on every disconnect → setIsLoading(true) spinner.
  // The data identity is: accountId + MT5 login + server + group.
  // That never changes within a continuous trading session.
  [
    accountId.trim(),
    Number.isFinite(session.login) ? String(session.login) : '',
    session.server.trim(),
    normalizeOhlcSessionGroup(session.group),
  ].filter(Boolean).join('|');

export type AutoConnectStatus =
  | 'idle'
  | 'disconnected'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'ready'
  | 'locked'
  | 'degraded'
  | 'reconnecting'
  | 'error';

interface UseAutoConnectResult {
  status: AutoConnectStatus;
  error: string | null;
  errorCode: string | null;
  requiresPassword: boolean;
  connectWithPassword: (password: string) => Promise<{ ok: boolean; message?: string }>;
}

interface UseAutoConnectOptions {
  subscribeInitialSymbols?: boolean;
}

type DedicatedLaneEnsureState = 'idle' | 'ensuring' | 'failed' | 'ready';

class AutoConnectRequestError extends Error {
  public readonly code: string | null;

  public constructor(message: string, code?: string | null) {
    super(message);
    this.name = 'AutoConnectRequestError';
    this.code = code ?? null;
  }
}

type TerminalSessionState = 'locked' | 'ready';

interface TerminalSessionResult {
  state: TerminalSessionState;
  token: string | null;
  message?: string;
  code?: string | null;
}

interface CachedTerminalSessionToken {
  accountId: string;
  token: string;
  expiresAtMs: number | null;
  cachedAtMs: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const stringifyWarnings = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const warningText = value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (isRecord(entry)) {
          return firstString(entry.message, entry.code, entry.error);
        }
        return '';
      })
      .filter(Boolean)
      .join('; ');

    return warningText || undefined;
  }

  if (isRecord(value)) {
    const warningText = Object.entries(value)
      .filter(([, entryValue]) => Boolean(entryValue))
      .map(([key, entryValue]) => {
        if (typeof entryValue === 'string') {
          return `${key}: ${entryValue}`;
        }
        return key;
      })
      .join('; ');

    return warningText || undefined;
  }

  return undefined;
};

const getWarningText = (...values: unknown[]): string | undefined =>
  firstString(...values) ?? values.map((value) => stringifyWarnings(value)).find(Boolean);

const isQuoteFeedUnavailableMessage = (message?: string | null): boolean =>
  /no_live_server|no live (mt5 )?(quote|price|ohlc|market data) server|quote server|live quote|ohlc.*unavailable|market data.*unavailable/i.test(
    message ?? '',
  );

const isNonBlockingBootstrapNoteMessage = (message?: string | null): boolean => {
  const normalizedMessage = message?.trim() ?? '';
  if (!normalizedMessage) {
    return false;
  }

  if (/bootstrap failed|mt5 unavailable|terminal unavailable/i.test(normalizedMessage)) {
    return false;
  }

  return /cached|cache|stale|deferred|notes?\b|bootstrap note/i.test(normalizedMessage);
};

const isStaleLiveQuoteWarning = (message?: string | null): boolean =>
  isQuoteFeedUnavailableMessage(message) || isNonBlockingBootstrapNoteMessage(message);

const isValidLiveTick = (tick: {
  symbol?: string;
  bid?: number;
  ask?: number;
  last?: number;
}): boolean =>
  Boolean(tick.symbol?.trim()) &&
  [tick.bid, tick.ask, tick.last].some(
    (value) => typeof value === 'number' && Number.isFinite(value) && value > 0,
  );

const normalizeQuoteFeedWarning = (...values: unknown[]): string => {
  const warningText = getWarningText(...values);
  if (isQuoteFeedUnavailableMessage(warningText)) {
    return NO_LIVE_QUOTE_SERVER_MESSAGE;
  }

  return warningText || NO_LIVE_QUOTE_SERVER_MESSAGE;
};

const terminalSessionRoute = (accountId: string) =>
  `/api/private/accounts/${accountId}/terminal-session`;

const tradingSymbolsRoute = (accountId: string) =>
  `/api/trading/symbols?accountId=${encodeURIComponent(accountId)}`;

const parseSymbolNumber = (value: unknown, fallback = 0): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
};

const decodeBase64UrlJson = (value: string): unknown => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );

  if (typeof atob !== 'function') {
    return null;
  }

  return JSON.parse(atob(padded)) as unknown;
};

const getTerminalSessionTokenExpiryMs = (token: string): number | null => {
  const [body] = token.split('.');
  if (!body) {
    return null;
  }

  try {
    const payload = decodeBase64UrlJson(body);
    if (!isRecord(payload)) {
      return null;
    }

    const exp = Number(payload.exp);
    if (!Number.isFinite(exp) || exp <= 0) {
      return null;
    }

    return exp < 10_000_000_000 ? exp * 1000 : exp;
  } catch {
    return null;
  }
};

const isReusableTerminalSessionToken = (
  cachedToken: CachedTerminalSessionToken | null,
  accountId: string,
): cachedToken is CachedTerminalSessionToken =>
  Boolean(
    cachedToken &&
      cachedToken.accountId === accountId &&
      cachedToken.token &&
      (
        cachedToken.expiresAtMs !== null
          ? cachedToken.expiresAtMs - Date.now() > TERMINAL_SESSION_TOKEN_REUSE_MARGIN_MS
          : Date.now() - cachedToken.cachedAtMs < TERMINAL_SESSION_TOKEN_UNKNOWN_EXPIRY_REUSE_MS
      ),
  );

const parseSymbolInteger = (value: unknown, fallback = 0): number =>
  Math.trunc(parseSymbolNumber(value, fallback));

const parseSymbolString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const extractSymbolCatalog = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
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

  if (isRecord(direct)) {
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

  return [];
};

const mapRestSymbol = (payload: unknown): SymbolInfo | null => {
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

  if (!isRecord(payload)) {
    return null;
  }

  const name = parseSymbolString(payload.name) ?? parseSymbolString(payload.symbol);
  if (!name) {
    return null;
  }

  return {
    name,
    description: parseSymbolString(payload.description) ?? name,
    baseCurrency: parseSymbolString(payload.baseCurrency ?? payload.base_currency) ?? '',
    quoteCurrency: parseSymbolString(payload.quoteCurrency ?? payload.quote_currency) ?? '',
    digits: parseSymbolInteger(payload.digits, 5),
    point: parseSymbolNumber(payload.point),
    tickSize: parseSymbolNumber(payload.tickSize ?? payload.tick_size),
    tickValue: parseSymbolNumber(payload.tickValue ?? payload.tick_value),
    tradeContractSize: parseSymbolNumber(
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
    volumeMin: parseSymbolNumber(payload.volumeMin ?? payload.volume_min),
    volumeMax: parseSymbolNumber(payload.volumeMax ?? payload.volume_max),
    volumeStep: parseSymbolNumber(payload.volumeStep ?? payload.volume_step),
    marginInitial: parseSymbolNumber(payload.marginInitial ?? payload.margin_initial),
    marginMaintenance: parseSymbolNumber(payload.marginMaintenance ?? payload.margin_maintenance),
    swapLong: parseSymbolNumber(payload.swapLong ?? payload.swap_long),
    swapShort: parseSymbolNumber(payload.swapShort ?? payload.swap_short),
    category: parseSymbolString(payload.category),
  };
};

const mapRestSymbolCatalog = (payload: unknown): SymbolInfo[] =>
  extractSymbolCatalog(payload)
    .map((symbol) => mapRestSymbol(symbol))
    .filter((symbol): symbol is SymbolInfo => Boolean(symbol));

const REST_VERIFIED_SYMBOL_SOURCE_PATTERN =
  /(^|[_\s-])(broker|mt5|manager)([_\s-].*)?(symbol|symbols|catalog|market[_\s-]?watch)|(^|[_\s-])(symbol|symbols|catalog|market[_\s-]?watch)([_\s-].*)?(broker|mt5|manager)|(^|[_\s-])(broker|mt5|manager)[_\s-]?(cache|cached)|(^|[_\s-])(cache|cached)[_\s-]?(broker|mt5|manager|catalog)/i;
const REST_UNVERIFIED_SYMBOL_SOURCE_PATTERN =
  /terminal[_\s-]?state[_\s-]?fallback|saved|default|prefs?|preferences?|timeout|timed?\s*out|fallback|degraded|warning/i;

const collectRestSymbolMetadataRecords = (payload: unknown): Record<string, unknown>[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const records: Record<string, unknown>[] = [payload];
  const nestedCandidates = [
    payload.data,
    payload.result,
    payload.payload,
    payload.metadata,
    payload.meta,
  ];

  for (const candidate of nestedCandidates) {
    if (isRecord(candidate)) {
      records.push(candidate);
      if (isRecord(candidate.metadata)) {
        records.push(candidate.metadata);
      }
      if (isRecord(candidate.meta)) {
        records.push(candidate.meta);
      }
    }
  }

  return records;
};

const getRestSymbolMetadataText = (record: Record<string, unknown>): string =>
  [
    record.source,
    record.catalogSource,
    record.catalog_source,
    record.symbolSource,
    record.symbol_source,
    record.status,
    record.code,
    record.reason,
    record.message,
    record.error,
    stringifyWarnings(record.warning),
    stringifyWarnings(record.warnings),
  ]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ');

const hasRestSymbolWarning = (record: Record<string, unknown>): boolean =>
  Boolean(
    getWarningText(record.warning, record.warnings) ||
      record.degraded === true ||
      record.fallback === true ||
      record.isFallback === true ||
      record.is_fallback === true,
  );

const isVerifiedRestSymbolCatalogPayload = (payload: unknown): boolean => {
  const metadataRecords = collectRestSymbolMetadataRecords(payload);
  if (metadataRecords.length === 0) {
    return false;
  }

  const metadataText = metadataRecords
    .map((record) => getRestSymbolMetadataText(record))
    .filter(Boolean)
    .join(' ');

  if (
    !metadataText ||
    metadataRecords.some((record) => hasRestSymbolWarning(record)) ||
    REST_UNVERIFIED_SYMBOL_SOURCE_PATTERN.test(metadataText)
  ) {
    return false;
  }

  return REST_VERIFIED_SYMBOL_SOURCE_PATTERN.test(metadataText);
};

const requestRestSymbolCatalog = async (accountId: string): Promise<SymbolInfo[]> => {
  const response = await fetch(tradingSymbolsRoute(accountId), {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `Symbol catalog REST fallback failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!isVerifiedRestSymbolCatalogPayload(payload)) {
    console.warn('[Terminal] Ignoring unverified REST symbol catalog fallback', {
      accountId,
      reason: 'REST symbols response did not include verified broker/cache catalog metadata.',
    });
    return [];
  }

  return mapRestSymbolCatalog(payload);
};

const normalizeAccountLogin = (value: unknown): string | null => {
  const normalized =
    typeof value === 'number' && Number.isFinite(value)
      ? String(Math.trunc(value))
      : typeof value === 'string'
        ? value.trim().replace(/^mt5-/i, '')
        : '';

  return /^\d+$/.test(normalized) ? normalized : null;
};

const accountInfoMatchesAccountId = (
  accountInfo: TradingAccountInfo | null | undefined,
  accountId: string | null,
): boolean => {
  const requestedLogin = normalizeAccountLogin(accountId);
  if (!requestedLogin) {
    return true;
  }

  return normalizeAccountLogin(accountInfo?.login) === requestedLogin;
};

const clientSessionMatchesAccountId = (
  client: WebSocketTradingClient | null | undefined,
  accountId: string | null,
): boolean => {
  const requestedLogin = normalizeAccountLogin(accountId);
  if (!requestedLogin) {
    return false;
  }

  return normalizeAccountLogin(client?.currentSession?.login) === requestedLogin;
};

const isAccountScopedClientEventCurrent = (
  client: WebSocketTradingClient | null | undefined,
  activeClient: WebSocketTradingClient | null | undefined,
  accountId: string | null,
): client is WebSocketTradingClient =>
  Boolean(
    client &&
      client === activeClient &&
      clientSessionMatchesAccountId(client, accountId),
  );

const isAccountSafeAuthenticatedFallbackClient = (
  fallbackClient: WebSocketTradingClient | null | undefined,
  marketClient: WebSocketTradingClient | null | undefined,
  accountId: string | null,
): fallbackClient is WebSocketTradingClient =>
  Boolean(
    fallbackClient &&
      fallbackClient !== marketClient &&
      fallbackClient.isConnected &&
      fallbackClient.isAuthenticated &&
      clientSessionMatchesAccountId(fallbackClient, accountId),
  );

const getAuthenticatedClientSessionForAccount = (
  client: WebSocketTradingClient | null | undefined,
  accountId: string | null,
) => {
  if (!client?.isConnected || !client.isAuthenticated) {
    return null;
  }

  return clientSessionMatchesAccountId(client, accountId)
    ? client.currentSession
    : null;
};

const isTimeoutMessage = (message: string | undefined): boolean =>
  /timed?\s*out|timeout/i.test(message ?? '');

const normalizeRealtimeStatus = (status: string | undefined): string =>
  status?.trim().toLowerCase() ?? '';

const isBootstrapProgressStatus = (status: string): boolean =>
  status === 'bootstrap_started' || status === 'mt5_initializing';

const isTerminalReadyStatus = (status: string): boolean =>
  status === 'terminal_ready' || status === 'connected';

const getRealtimeTerminalProblem = (
  status: string,
  message: string | undefined,
  degraded = false,
): { status: 'degraded' | 'error'; message: string } | null => {
  const normalizedMessage = message?.trim();
  const searchable = `${status} ${normalizedMessage ?? ''}`.toLowerCase();

  if (status === 'bootstrap_failed' || searchable.includes('bootstrap failed')) {
    return {
      status: 'error',
      message: normalizedMessage || BOOTSTRAP_FAILED_MESSAGE,
    };
  }

  if (
    status === 'mt5_unavailable' ||
    searchable.includes('mt5 unavailable') ||
    searchable.includes('mt5 terminal unavailable')
  ) {
    return {
      status: 'error',
      message: normalizedMessage || MT5_UNAVAILABLE_MESSAGE,
    };
  }

  if (
    status === 'no_live_server' ||
    searchable.includes('no_live_server') ||
    isQuoteFeedUnavailableMessage(searchable) ||
    degraded ||
    status === 'terminal_degraded' ||
    status === 'degraded' ||
    searchable.includes('degraded')
  ) {
    return {
      status: 'degraded',
      message: normalizeQuoteFeedWarning(normalizedMessage),
    };
  }

  return null;
};

const normalizeTerminalSessionPayload = (
  response: Response,
  payload: unknown,
): TerminalSessionResult => {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : root;
  const session = isRecord(data.session)
    ? data.session
    : isRecord(data.terminalSession)
      ? data.terminalSession
      : data;

  const state = firstString(session.state, data.state, root.state)?.toLowerCase();
  const token = firstString(session.token, data.token, root.token) ?? null;
  const code = firstString(session.code, data.code, root.code) ?? null;
  const message = firstString(
    session.error,
    session.message,
    data.error,
    data.message,
    root.error,
    root.message,
  );
  const requiresPassword =
    session.requiresPassword === true ||
    data.requiresPassword === true ||
    root.requiresPassword === true ||
    code === PASSWORD_REQUIRED_CODE;

  if (
    state === 'locked' ||
    state === 'password_required' ||
    requiresPassword
  ) {
    return {
      state: 'locked',
      token: null,
      message,
      code: code ?? PASSWORD_REQUIRED_CODE,
    };
  }

  if (!response.ok) {
    if (isTimeoutMessage(message)) {
      throw new AutoConnectRequestError(
        TERMINAL_SESSION_RETRY_MESSAGE,
        TERMINAL_SESSION_TIMEOUT_CODE,
      );
    }

    throw new AutoConnectRequestError(
      message ?? 'Failed to initialize MT5 terminal session.',
      code,
    );
  }

  if (state === 'ready' || token) {
    if (!token) {
      throw new AutoConnectRequestError(
        'Terminal session route did not return a session token.',
        'TOKEN_MISSING',
      );
    }

    return {
      state: 'ready',
      token,
      message,
      code,
    };
  }

  throw new AutoConnectRequestError(
    'Terminal session route did not return a valid session state.',
    'SESSION_STATE_MISSING',
  );
};

export function useAutoConnectTrading(
  accountId: string | null,
  options: UseAutoConnectOptions = {},
): UseAutoConnectResult {
  const shouldSubscribeInitialSymbols = options.subscribeInitialSymbols ?? true;
  const [status, setStatus] = useState<AutoConnectStatus>('idle');
  const statusRef = useRef<AutoConnectStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const setSession = useWebtraderStore((state) => state.setSession);
  const setOhlcSessionScopeId = useWebtraderStore((state) => state.setOhlcSessionScopeId);
  const setWsClient = useWebtraderStore((state) => state.setWsClient);
  const setMarketWsClient = useWebtraderStore((state) => state.setMarketWsClient);
  const setOhlcWsClient = useWebtraderStore((state) => state.setOhlcWsClient);
  const setAccountInfo = useWebtraderStore((state) => state.setAccountInfo);
  const setSymbols = useWebtraderStore((state) => state.setSymbols);
  const updateSymbol = useWebtraderStore((state) => state.updateSymbol);
  const setPositions = useWebtraderStore((state) => state.setPositions);
  const setConnectionStatus = useWebtraderStore((state) => state.setConnectionStatus);
  const setConnectionError = useWebtraderStore((state) => state.setConnectionError);
  const setIsLoadingSymbols = useWebtraderStore((state) => state.setIsLoadingSymbols);
  const addPosition = useWebtraderStore((state) => state.addPosition);
  const updatePositionInStore = useWebtraderStore((state) => state.updatePosition);
  const removePosition = useWebtraderStore((state) => state.removePosition);
  const setOrders = useWebtraderStore((state) => state.setOrders);
  const addOrder = useWebtraderStore((state) => state.addOrder);
  const updateOrderInStore = useWebtraderStore((state) => state.updateOrder);
  const removeOrder = useWebtraderStore((state) => state.removeOrder);
  const updatePrice = useWebtraderStore((state) => state.updatePrice);
  const updateQuoteStatus = useWebtraderStore((state) => state.updateQuoteStatus);
  const existingClient = useWebtraderStore((state) => state.wsClient);
  const existingMarketClient = useWebtraderStore((state) => state.marketWsClient);
  const existingOhlcClient = useWebtraderStore((state) => state.ohlcWsClient);
  const resetLiveState = useWebtraderStore((state) => state.resetLiveState);

  const hasConnected = useRef(false);
  const connectedAccountId = useRef<string | null>(null);
  const requestedAccountIdRef = useRef<string | null>(null);
  const existingClientRef = useRef<WebSocketTradingClient | null>(null);
  const marketClientRef = useRef<WebSocketTradingClient | null>(null);
  const ohlcClientRef = useRef<WebSocketTradingClient | null>(null);
  const marketEnsureStateRef = useRef<DedicatedLaneEnsureState>('idle');
  const ohlcEnsureStateRef = useRef<DedicatedLaneEnsureState>('idle');
  const marketEnsurePromiseRef = useRef<Promise<WebSocketTradingClient | null> | null>(null);
  const ohlcEnsurePromiseRef = useRef<Promise<WebSocketTradingClient | null> | null>(null);
  const marketEnsureGenerationRef = useRef(0);
  const ohlcEnsureGenerationRef = useRef(0);
  const pendingInitialMarketSymbolsRef = useRef<SymbolInfo[]>([]);
  const initialMarketSubscriptionInFlightRef = useRef<Promise<boolean> | null>(null);
  const initialMarketSubscriptionLogKeysRef = useRef<Set<string>>(new Set());
  const symbolRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const symbolRefreshGenerationRef = useRef(0);
  const symbolRefreshAttemptRef = useRef(0);
  const parentReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentReconnectAttemptRef = useRef(0);
  const isIntentionalDisconnectRef = useRef(false);
  const cachedTerminalSessionTokenRef = useRef<CachedTerminalSessionToken | null>(null);
  const readySessionTokenRequestsRef = useRef<Map<string, Promise<string>>>(new Map());

  useEffect(() => {
    existingClientRef.current = existingClient;
  }, [existingClient]);

  useEffect(() => {
    marketClientRef.current = existingMarketClient;
    if (existingMarketClient?.isAuthenticated) {
      marketEnsureStateRef.current = 'ready';
    } else if (!existingMarketClient) {
      marketEnsureStateRef.current = 'idle';
    }
  }, [existingMarketClient]);

  useEffect(() => {
    ohlcClientRef.current = existingOhlcClient;
    if (existingOhlcClient?.isAuthenticated) {
      ohlcEnsureStateRef.current = 'ready';
    } else if (!existingOhlcClient) {
      ohlcEnsureStateRef.current = 'idle';
    }
  }, [existingOhlcClient]);

  // Disconnect on unmount so that page refreshes/navigations don't leave orphaned
  // WebSocket connections fighting new connections via the Rust gateway's "replaced" logic.
  useEffect(() => {
    return () => {
      isIntentionalDisconnectRef.current = true;
      const marketClient = marketClientRef.current;
      const ohlcClient = ohlcClientRef.current;
      marketClientRef.current = null;
      ohlcClientRef.current = null;
      marketEnsureStateRef.current = 'idle';
      ohlcEnsureStateRef.current = 'idle';
      marketEnsurePromiseRef.current = null;
      ohlcEnsurePromiseRef.current = null;
      marketEnsureGenerationRef.current += 1;
      ohlcEnsureGenerationRef.current += 1;
      marketClient?.disconnect();
      if (ohlcClient && ohlcClient !== marketClient) {
        ohlcClient.disconnect();
      }
      if (parentReconnectTimerRef.current) {
        clearTimeout(parentReconnectTimerRef.current);
        parentReconnectTimerRef.current = null;
      }
      setMarketWsClient(null);
      setOhlcWsClient(null);
      existingClientRef.current?.disconnect();
    };
  }, [setMarketWsClient, setOhlcWsClient]);

  const pause = useCallback(
    (durationMs: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
      }),
    [],
  );

  const prepareMarketSymbols = useCallback((symbols: SymbolInfo[]): SymbolInfo[] =>
    getTerminalDisplaySymbols(symbols), []);

  const getDefaultMarketSymbols = useCallback(
    (): SymbolInfo[] => prepareMarketSymbols(getTerminalFallbackSymbolInfos()),
    [prepareMarketSymbols],
  );

  const clearScheduledSymbolRefresh = useCallback(() => {
    symbolRefreshGenerationRef.current += 1;
    symbolRefreshAttemptRef.current = 0;

    if (symbolRefreshTimerRef.current) {
      clearTimeout(symbolRefreshTimerRef.current);
      symbolRefreshTimerRef.current = null;
    }
  }, []);

  const clearScheduledParentReconnect = useCallback(() => {
    parentReconnectAttemptRef.current = 0;

    if (parentReconnectTimerRef.current) {
      clearTimeout(parentReconnectTimerRef.current);
      parentReconnectTimerRef.current = null;
    }
  }, []);

  const scheduleParentReconnect = useCallback((preferredDelayMs?: number): boolean => {
    if (parentReconnectTimerRef.current) {
      return true;
    }

    const attempt = parentReconnectAttemptRef.current;
    if (attempt >= PARENT_RECONNECT_RETRY_DELAYS_MS.length) {
      console.warn('[Terminal] Parent auto-connect retry exhausted', {
        accountId: requestedAccountIdRef.current,
        attempts: attempt,
      });
      setStatus('error');
      setError(RECONNECT_RETRY_EXHAUSTED_MESSAGE);
      setErrorCode(RECONNECT_RETRY_EXHAUSTED_CODE);
      setConnectionStatus('error');
      setConnectionError(RECONNECT_RETRY_EXHAUSTED_MESSAGE);
      return false;
    }

    const delay = Math.max(
      preferredDelayMs ?? 0,
      PARENT_RECONNECT_RETRY_DELAYS_MS[attempt],
    );
    parentReconnectAttemptRef.current = attempt + 1;
    parentReconnectTimerRef.current = setTimeout(() => {
      parentReconnectTimerRef.current = null;
      setReconnectTrigger((n) => n + 1);
    }, delay);
    return true;
  }, [setConnectionError, setConnectionStatus]);

  const clearLiveState = useCallback(() => {
    clearScheduledSymbolRefresh();
    setIsLoadingSymbols(false);
    resetLiveState();
  }, [clearScheduledSymbolRefresh, resetLiveState, setIsLoadingSymbols]);

  const subscribeWarmDefaultQuoteSymbols = useCallback(
    (client: WebSocketTradingClient) => {
      if (!shouldSubscribeInitialSymbols || !client.isAuthenticated) {
        return;
      }

      void client.subscribeSymbols([...DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS]).catch(() => {});
    },
    [shouldSubscribeInitialSymbols],
  );

  const disconnectLocalClient = useCallback((candidate: WebSocketTradingClient | null) => {
    if (!candidate) {
      return;
    }

    if (existingClientRef.current === candidate) {
      existingClientRef.current = null;
    }

    cachedTerminalSessionTokenRef.current = null;
    readySessionTokenRequestsRef.current.clear();
    candidate.disconnect();
  }, []);

  const disconnectMarketClient = useCallback(
    (candidate: WebSocketTradingClient | null) => {
      if (!candidate) {
        return;
      }

      if (marketClientRef.current === candidate) {
        marketClientRef.current = null;
        marketEnsureStateRef.current = 'idle';
        marketEnsurePromiseRef.current = null;
        marketEnsureGenerationRef.current += 1;
      }

      if (candidate !== existingClientRef.current) {
        candidate.disconnect();
      }
      if (useWebtraderStore.getState().marketWsClient === candidate) {
        setMarketWsClient(null);
      }
    },
    [setMarketWsClient],
  );

  const disconnectOhlcClient = useCallback(
    (candidate: WebSocketTradingClient | null) => {
      if (!candidate) {
        return;
      }

      if (ohlcClientRef.current === candidate) {
        ohlcClientRef.current = null;
        ohlcEnsureStateRef.current = 'idle';
        ohlcEnsurePromiseRef.current = null;
        ohlcEnsureGenerationRef.current += 1;
      }

      if (candidate !== existingClientRef.current) {
        candidate.disconnect();
      }
      if (useWebtraderStore.getState().ohlcWsClient === candidate) {
        setOhlcWsClient(null);
      }
    },
    [setOhlcWsClient],
  );

  const activateAuthenticatedClient = useCallback(
    (
      client: WebSocketTradingClient,
      session: TradingSession,
      resolvedAccountId: string,
      options?: { symbolsLoading?: boolean },
    ) => {
      clearScheduledParentReconnect();
      clearScheduledSymbolRefresh();
      connectedAccountId.current = resolvedAccountId;
      const ohlcSessionScopeId = buildOhlcSessionScopeId(resolvedAccountId, session);
      setWsClient(client);
      setSession(session);
      setOhlcSessionScopeId(ohlcSessionScopeId);
      ohlcService.connect(ohlcSessionScopeId);
      setStatus('ready');
      setError(null);
      setErrorCode(null);
      setConnectionStatus('connected');
      setConnectionError(null);
      setIsLoadingSymbols(options?.symbolsLoading ?? false);
    },
    [
      clearScheduledParentReconnect,
      clearScheduledSymbolRefresh,
      setConnectionError,
      setConnectionStatus,
      setIsLoadingSymbols,
      setOhlcSessionScopeId,
      setSession,
      setWsClient,
    ],
  );

  const applyBootstrapState = useCallback(
    (
      bootstrapState: TerminalBootstrapState,
      marketSymbols?: SymbolInfo[],
    ) => {
      const deferred = new Set(
        (bootstrapState.deferred ?? []).map((entry) => entry.toLowerCase()),
      );

      if (bootstrapState.accountInfo) {
        setAccountInfo(bootstrapState.accountInfo);
      }

      if (marketSymbols && marketSymbols.length > 0) {
        clearScheduledSymbolRefresh();
        setSymbols(marketSymbols);
      }

      if (!deferred.has('positions')) {
        setPositions(bootstrapState.positions);
      }

      if (!deferred.has('orders')) {
        setOrders(bootstrapState.orders);
      }
    },
    [clearScheduledSymbolRefresh, setAccountInfo, setOrders, setPositions, setSymbols],
  );

  const requestBootstrapState = useCallback(
    async (
      client: WebSocketTradingClient,
      requestedAccountId: string | null,
    ): Promise<TerminalBootstrapState> => {
      try {
        return await client.getBootstrapState();
      } catch {
        const currentState = useWebtraderStore.getState();
        const [accountInfo, symbols, positions, orders] = await Promise.allSettled([
          client.getAccountInfo(),
          client.supportsSymbolCatalogActions
            ? client.getSymbols()
            : Promise.resolve([] as SymbolInfo[]),
          client.getPositions(),
          client.getOrders(),
        ]);
        const resolvedAccountInfo =
          accountInfo.status === 'fulfilled' &&
          accountInfoMatchesAccountId(accountInfo.value, requestedAccountId)
            ? accountInfo.value
            : accountInfo.status === 'rejected' &&
                accountInfoMatchesAccountId(currentState.accountInfo, requestedAccountId)
              ? currentState.accountInfo
              : null;

        return {
          accountInfo: resolvedAccountInfo,
          symbols: symbols.status === 'fulfilled' ? symbols.value : [],
          positions:
            positions.status === 'fulfilled'
              ? positions.value
              : currentState.positions,
          orders: orders.status === 'fulfilled' ? orders.value : currentState.orders,
          deferred: [
            ...(accountInfo.status === 'rejected' ? ['account'] : []),
            ...(symbols.status === 'rejected' ? ['symbols'] : []),
            ...(positions.status === 'rejected' ? ['positions'] : []),
            ...(orders.status === 'rejected' ? ['orders'] : []),
          ],
        };
      }
    },
    [],
  );

  const getCachedPreparedSymbolCatalog = useCallback((): SymbolInfo[] => {
    const pendingSymbols = pendingInitialMarketSymbolsRef.current;
    if (pendingSymbols.length > 0) {
      return pendingSymbols;
    }

    return prepareMarketSymbols(useWebtraderStore.getState().symbols);
  }, [prepareMarketSymbols]);

  const requestRealSymbolCatalog = useCallback(
    async (
      client: WebSocketTradingClient,
      resolvedAccountId: string,
    ): Promise<SymbolInfo[]> => {
      if (!client.supportsSymbolCatalogActions) {
        return getCachedPreparedSymbolCatalog();
      }

      try {
        const websocketSymbols = await client.getSymbols();
        if (websocketSymbols.length > 0) {
          return websocketSymbols;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (/ws_route_action_not_allowed|not available on the/i.test(errorMessage)) {
          return getCachedPreparedSymbolCatalog();
        }

        console.warn('[Terminal] Websocket symbol catalog fallback failed', {
          error: errorMessage,
        });
      }

      const cachedSymbols = getCachedPreparedSymbolCatalog();
      if (cachedSymbols.length > 0) {
        return cachedSymbols;
      }

      return requestRestSymbolCatalog(resolvedAccountId);
    },
    [getCachedPreparedSymbolCatalog],
  );

  const buildInitialSubscriptions = useCallback(
    (symbols: SymbolInfo[]): string[] => getInitialTerminalSubscriptionSymbols(symbols, {
      preferredSymbols: DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS,
      limit: DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.length,
    }),
    [],
  );

  const logInitialMarketSubscriptionDeferred = useCallback(
    (
      message: string,
      details: Record<string, unknown>,
      key: string,
    ) => {
      const logKey = `${marketEnsureGenerationRef.current}:${key}`;
      if (initialMarketSubscriptionLogKeysRef.current.has(logKey)) {
        console.debug(message, details);
        return;
      }

      initialMarketSubscriptionLogKeysRef.current.add(logKey);
      console.info(message, details);
    },
    [],
  );

  const subscribeInitialMarketSymbols = useCallback(
    async (client: WebSocketTradingClient, symbols: SymbolInfo[]): Promise<boolean> => {
      const subscriptionSymbols = buildInitialSubscriptions(symbols);
      const subscriptionsReady = await client.subscribeSymbols(subscriptionSymbols);

      if (!subscriptionsReady) {
        logInitialMarketSubscriptionDeferred(
          '[Terminal] Initial market symbol subscription was deferred',
          {
            count: subscriptionSymbols.length,
          },
          'client-subscribe-deferred',
        );
      }

      return subscriptionsReady;
    },
    [buildInitialSubscriptions, logInitialMarketSubscriptionDeferred],
  );

  const subscribeInitialMarketSymbolsThroughOwner = useCallback(
    async (
      symbols: SymbolInfo[],
      options?: {
        expectedAccountId?: string | null;
        fallbackClient?: WebSocketTradingClient | null;
        failureLabel?: string;
      },
    ): Promise<boolean> => {
      pendingInitialMarketSymbolsRef.current = symbols;

      if (initialMarketSubscriptionInFlightRef.current) {
        return initialMarketSubscriptionInFlightRef.current;
      }

      const subscriptionAttempt = (async (): Promise<boolean> => {
        const marketClient = marketClientRef.current;
        const expectedAccountId =
          options?.expectedAccountId ??
          connectedAccountId.current ??
          requestedAccountIdRef.current;
        const subscribeWithAuthenticatedFallbackClient = async (
          reason: string,
          logKey: string,
        ): Promise<boolean> => {
          const fallbackClient = options?.fallbackClient ?? existingClientRef.current;
          if (
            !isAccountSafeAuthenticatedFallbackClient(
              fallbackClient,
              marketClient,
              expectedAccountId,
            )
          ) {
            return false;
          }

          try {
            const subscribed = await subscribeInitialMarketSymbols(fallbackClient, symbols);
            if (!subscribed) {
              logInitialMarketSubscriptionDeferred(
                '[Terminal] Initial market symbol subscription deferred on owner websocket',
                {
                  count: symbols.length,
                  reason,
                },
                logKey,
              );
            }
            return subscribed;
          } catch (error) {
            logInitialMarketSubscriptionDeferred(
              '[Terminal] Initial market symbol subscription deferred after owner websocket failure',
              {
                count: symbols.length,
                reason,
                error: error instanceof Error ? error.message : String(error),
              },
              logKey,
            );
            return false;
          }
        };

        if (marketClient) {
          try {
            const subscribed = await subscribeInitialMarketSymbols(marketClient, symbols);
            if (subscribed) {
              return true;
            }

            if (!marketClient.isAuthenticated) {
              const fallbackSubscribed = await subscribeWithAuthenticatedFallbackClient(
                options?.failureLabel ?? 'market websocket authenticating',
                'owner-fallback-market-authenticating',
              );
              if (fallbackSubscribed) {
                return marketEnsureStateRef.current === 'failed';
              }

              logInitialMarketSubscriptionDeferred(
                '[Terminal] Initial market symbol subscription queued for market websocket authentication',
                {
                  count: symbols.length,
                  reason: options?.failureLabel ?? 'market websocket authenticating',
                },
                'market-authentication-queued',
              );
              return false;
            }
          } catch (error) {
            console.warn('[Terminal] Market quote symbol subscription failed; keeping symbols queued for market websocket', {
              count: symbols.length,
              error: error instanceof Error ? error.message : String(error),
            });
          }

          const fallbackSubscribed = await subscribeWithAuthenticatedFallbackClient(
            options?.failureLabel ?? 'market websocket subscription deferred',
            'owner-fallback-market-deferred',
          );
          if (fallbackSubscribed) {
            return marketEnsureStateRef.current === 'failed';
          }

          logInitialMarketSubscriptionDeferred(
            '[Terminal] Initial market symbol subscription deferred to market websocket',
            {
              count: symbols.length,
              reason: options?.failureLabel ?? 'market websocket subscription deferred',
            },
            'market-websocket-deferred',
          );
          return false;
        }

        const fallbackSubscribed = await subscribeWithAuthenticatedFallbackClient(
          options?.failureLabel ??
            (marketEnsureStateRef.current === 'failed'
              ? 'market websocket failed'
              : 'market websocket unavailable'),
          `owner-fallback-market-${marketEnsureStateRef.current}`,
        );
        if (fallbackSubscribed) {
          return marketEnsureStateRef.current === 'failed';
        }

        logInitialMarketSubscriptionDeferred(
          '[Terminal] Initial market symbol subscription waiting for websocket ownership',
          {
            count: symbols.length,
            marketEnsureState: marketEnsureStateRef.current,
            reason:
              options?.failureLabel ??
              (marketEnsureStateRef.current === 'failed'
                ? 'market websocket failed without authenticated fallback'
                : 'market websocket ensure pending'),
          },
          `market-ownership-${marketEnsureStateRef.current}`,
        );
        return false;
      })();

      initialMarketSubscriptionInFlightRef.current = subscriptionAttempt;
      try {
        return await subscriptionAttempt;
      } finally {
        if (initialMarketSubscriptionInFlightRef.current === subscriptionAttempt) {
          initialMarketSubscriptionInFlightRef.current = null;
        }
      }
    },
    [logInitialMarketSubscriptionDeferred, subscribeInitialMarketSymbols],
  );

  const refreshSymbolsOnce = useCallback(
    async (
      client: WebSocketTradingClient,
      resolvedAccountId: string,
      options?: { isCancelled?: () => boolean },
    ): Promise<boolean> => {
      if (
        options?.isCancelled?.() ||
        connectedAccountId.current !== resolvedAccountId ||
        !client.isConnected ||
        !client.isAuthenticated
      ) {
        return false;
      }

      const bootstrapState = await requestBootstrapState(client, resolvedAccountId);
      let marketSymbols = prepareMarketSymbols(bootstrapState.symbols);

      if (marketSymbols.length === 0) {
        try {
          marketSymbols = prepareMarketSymbols(
            await requestRealSymbolCatalog(client, resolvedAccountId),
          );
        } catch (error) {
          console.warn('[Terminal] Symbol catalog refresh fallback failed', {
            error: error instanceof Error ? error.message : String(error),
          });
          marketSymbols = [];
        }
      }

      if (
        marketSymbols.length === 0 ||
        options?.isCancelled?.() ||
        connectedAccountId.current !== resolvedAccountId
      ) {
        return false;
      }

      applyBootstrapState(bootstrapState, marketSymbols);
      if (shouldSubscribeInitialSymbols) {
        void subscribeInitialMarketSymbolsThroughOwner(marketSymbols, {
          expectedAccountId: resolvedAccountId,
          fallbackClient: client,
          failureLabel: 'refreshed market symbols',
        }).catch((error) => {
          console.warn('[Terminal] Failed to subscribe refreshed market symbols', {
            count: marketSymbols.length,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      if (
        options?.isCancelled?.() ||
        connectedAccountId.current !== resolvedAccountId
      ) {
        return false;
      }

      setStatus('ready');
      setError(null);
      setErrorCode(null);
      setIsLoadingSymbols(false);
      setConnectionStatus('connected');
      setConnectionError(null);
      return true;
    },
    [
      applyBootstrapState,
      prepareMarketSymbols,
      requestBootstrapState,
      requestRealSymbolCatalog,
      setConnectionError,
      setConnectionStatus,
      setIsLoadingSymbols,
      shouldSubscribeInitialSymbols,
      subscribeInitialMarketSymbolsThroughOwner,
    ],
  );

  const scheduleSymbolRefresh = useCallback(
    (
      client: WebSocketTradingClient,
      resolvedAccountId: string,
      options?: { isCancelled?: () => boolean },
    ) => {
      clearScheduledSymbolRefresh();
      const generation = symbolRefreshGenerationRef.current;
      const shouldKeepRefreshing = () =>
        !options?.isCancelled?.() &&
        generation === symbolRefreshGenerationRef.current &&
        connectedAccountId.current === resolvedAccountId &&
        client.isConnected &&
        client.isAuthenticated;

      const runRefresh = async () => {
        symbolRefreshTimerRef.current = null;

        if (!shouldKeepRefreshing()) {
          return;
        }

        const attempt = symbolRefreshAttemptRef.current;
        if (attempt >= SYMBOL_BACKGROUND_REFRESH_MAX_ATTEMPTS) {
          console.warn('[Terminal] Broker symbol catalog refresh exhausted', {
            accountId: resolvedAccountId,
            attempts: attempt,
          });
          setStatus('degraded');
          setError(SYMBOLS_REFRESH_EXHAUSTED_MESSAGE);
          setErrorCode(SYMBOLS_REFRESH_EXHAUSTED_CODE);
          setIsLoadingSymbols(false);
          setConnectionStatus('connected');
          setConnectionError(SYMBOLS_REFRESH_EXHAUSTED_MESSAGE);
          return;
        }

        symbolRefreshAttemptRef.current = attempt + 1;
        const refreshed = await refreshSymbolsOnce(client, resolvedAccountId, options);
        if (refreshed) {
          symbolRefreshAttemptRef.current = 0;
          return;
        }

        if (!shouldKeepRefreshing()) {
          return;
        }

        const delay =
          SYMBOL_BACKGROUND_RETRY_DELAYS_MS[
            Math.min(symbolRefreshAttemptRef.current, SYMBOL_BACKGROUND_RETRY_DELAYS_MS.length - 1)
          ];
        symbolRefreshTimerRef.current = setTimeout(runRefresh, delay);
      };

      symbolRefreshTimerRef.current = setTimeout(runRefresh, SYMBOL_BACKGROUND_RETRY_DELAYS_MS[0]);
    },
    [
      clearScheduledSymbolRefresh,
      refreshSymbolsOnce,
      setConnectionError,
      setConnectionStatus,
      setIsLoadingSymbols,
    ],
  );

  const runAuthenticatedBootstrap = useCallback(
    async (
      client: WebSocketTradingClient,
      resolvedAccountId: string,
      options?: { isCancelled?: () => boolean },
    ): Promise<void> => {
      const isCurrentConnection = () =>
        !options?.isCancelled?.() &&
        connectedAccountId.current === resolvedAccountId &&
        existingClientRef.current === client &&
        client.isConnected &&
        client.isAuthenticated;

      try {
        let bootstrapState = await requestBootstrapState(client, resolvedAccountId);

        if (!isCurrentConnection()) {
          return;
        }

        const bootstrapMetadata = isRecord(bootstrapState) ? bootstrapState : null;
        const bootstrapDegraded = bootstrapMetadata?.degraded === true;
        const bootstrapWarningText = getWarningText(
          bootstrapMetadata?.message,
          bootstrapMetadata?.error,
          bootstrapMetadata?.warnings,
        );
        const bootstrapDegradedMessage =
          bootstrapDegraded && !isNonBlockingBootstrapNoteMessage(bootstrapWarningText)
            ? normalizeQuoteFeedWarning(bootstrapWarningText)
            : null;

        let availableSymbols = prepareMarketSymbols(bootstrapState.symbols);
        let marketSymbols = availableSymbols;

        if (marketSymbols.length === 0) {
          for (let attempt = 0; attempt < SYMBOL_RETRY_ATTEMPTS; attempt += 1) {
            // Pause between retries only — not before the first attempt.
            if (attempt > 0) {
              await pause(SYMBOL_RETRY_DELAY_MS);
            }

            if (!isCurrentConnection()) {
              return;
            }

            // Fire both symbol sources in parallel — prefer catalog, fall back to
            // bootstrap.symbols. Also refresh bootstrapState for accountInfo/positions.
            const [catalogResult, freshBootstrapResult] = await Promise.allSettled([
              requestRealSymbolCatalog(client, resolvedAccountId),
              requestBootstrapState(client, resolvedAccountId),
            ]);

            if (freshBootstrapResult.status === 'fulfilled') {
              bootstrapState = freshBootstrapResult.value;
            }

            if (catalogResult.status === 'fulfilled' && catalogResult.value.length > 0) {
              availableSymbols = prepareMarketSymbols(catalogResult.value);
            } else if (freshBootstrapResult.status === 'fulfilled') {
              availableSymbols = prepareMarketSymbols(freshBootstrapResult.value.symbols);
            } else {
              console.warn('[Terminal] Symbol catalog bootstrap fallback failed', {
                catalogError: catalogResult.status === 'rejected'
                  ? (catalogResult.reason instanceof Error ? catalogResult.reason.message : String(catalogResult.reason))
                  : 'empty',
              });
              availableSymbols = [];
            }

            marketSymbols = availableSymbols;

            if (marketSymbols.length > 0) {
              break;
            }
          }
        }

        if (!isCurrentConnection()) {
          return;
        }

        const usingDefaultMarketSymbols = marketSymbols.length === 0;
        if (usingDefaultMarketSymbols) {
          marketSymbols = getDefaultMarketSymbols();
        }

        applyBootstrapState(bootstrapState, marketSymbols);
        pendingInitialMarketSymbolsRef.current = marketSymbols;

        if (bootstrapDegraded) {
          const ai = bootstrapState.accountInfo;
          if (!ai?.name && !ai?.currency && !ai?.leverage) {
            void client.getAccountInfo()
              .then((info) => { if (info && isCurrentConnection()) setAccountInfo(info); })
              .catch(() => {});
          }
        }

        if (shouldSubscribeInitialSymbols) {
          void subscribeInitialMarketSymbolsThroughOwner(marketSymbols, {
            expectedAccountId: resolvedAccountId,
            fallbackClient: client,
            failureLabel: 'initial market symbols',
          }).catch((error) => {
            console.warn('[Terminal] Failed to subscribe initial market symbols', {
              count: marketSymbols.length,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }

        if (!isCurrentConnection()) {
          return;
        }

        const quoteFeedWarning = bootstrapDegradedMessage;
        setStatus('ready');
        setError(null);
        setErrorCode(quoteFeedWarning ? 'QUOTE_FEED_DEGRADED' : null);
        setIsLoadingSymbols(usingDefaultMarketSymbols);
        setConnectionStatus('connected');
        setConnectionError(quoteFeedWarning ?? null);
        if (usingDefaultMarketSymbols) {
          scheduleSymbolRefresh(client, resolvedAccountId, options);
        }
      } catch (error) {
        if (!isCurrentConnection()) {
          return;
        }

        console.warn('[Terminal] Background bootstrap failed after websocket authentication', {
          accountId: resolvedAccountId,
          error: error instanceof Error ? error.message : String(error),
        });
        setStatus('degraded');
        setError(BOOTSTRAP_FAILED_MESSAGE);
        setErrorCode('BOOTSTRAP_BACKGROUND_FAILED');
        setConnectionStatus('connected');
        setConnectionError(BOOTSTRAP_FAILED_MESSAGE);
        setIsLoadingSymbols(true);
        scheduleSymbolRefresh(client, resolvedAccountId, options);
      }
    },
    [
      applyBootstrapState,
      getDefaultMarketSymbols,
      pause,
      prepareMarketSymbols,
      requestBootstrapState,
      requestRealSymbolCatalog,
      scheduleSymbolRefresh,
      setAccountInfo,
      setConnectionError,
      setConnectionStatus,
      setIsLoadingSymbols,
      shouldSubscribeInitialSymbols,
      subscribeInitialMarketSymbolsThroughOwner,
    ],
  );


  // Keep the latest store callbacks in a ref so createTradingClient can have
  // stable identity (empty dep array) without capturing stale closures.
  const callbacksRef = useRef({
    addOrder,
    addPosition,
    clearScheduledSymbolRefresh,
    prepareMarketSymbols,
    removeOrder,
    removePosition,
    scheduleParentReconnect,
    setAccountInfo,
    setConnectionError,
    setConnectionStatus,
    setIsLoadingSymbols,
    setOrders,
    setPositions,
    setSession,
    setSymbols,
    shouldSubscribeInitialSymbols,
    subscribeInitialMarketSymbolsThroughOwner,
    updateOrderInStore,
    updatePositionInStore,
    updatePrice,
    updateQuoteStatus,
    updateSymbol,
  });
  // Mutate on every render — safe because refs are not reactive
  callbacksRef.current = {
    addOrder,
    addPosition,
    clearScheduledSymbolRefresh,
    prepareMarketSymbols,
    removeOrder,
    removePosition,
    scheduleParentReconnect,
    setAccountInfo,
    setConnectionError,
    setConnectionStatus,
    setIsLoadingSymbols,
    setOrders,
    setPositions,
    setSession,
    setSymbols,
    shouldSubscribeInitialSymbols,
    subscribeInitialMarketSymbolsThroughOwner,
    updateOrderInStore,
    updatePositionInStore,
    updatePrice,
    updateQuoteStatus,
    updateSymbol,
  };

  const createTradingClient = useCallback(
    () => {
      let client: WebSocketTradingClient | null = null;
      const isCurrentMainClient = () =>
        client !== null && existingClientRef.current === client;
      const isCurrentMainClientAccountEvent = () =>
        isAccountScopedClientEventCurrent(
          client,
          existingClientRef.current,
          requestedAccountIdRef.current,
        );

      client = new WebSocketTradingClient({
        onMt5TimeUpdate: (mt5ServerTimeMs) => {
          maybeSetMt5ServerTimeMs(mt5ServerTimeMs);
        },
        onAuthenticated: (session) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          symbolRefreshAttemptRef.current = 0;
          callbacksRef.current.setSession(session);
        },
        onDisconnect: () => {
          if (!isCurrentMainClient()) {
            return;
          }

          ohlcService.setTokenProvider(null);
          callbacksRef.current.clearScheduledSymbolRefresh();
          connectedAccountId.current = null;
          hasConnected.current = false;
          callbacksRef.current.setIsLoadingSymbols(false);
          const intentional = isIntentionalDisconnectRef.current;
          isIntentionalDisconnectRef.current = false;
          if (intentional) {
            setStatus('idle');
            callbacksRef.current.setConnectionStatus('disconnected');
            return;
          }
          // Unexpected disconnect with no auto-reconnect credentials — trigger a fresh attempt
          setStatus('connecting');
          callbacksRef.current.setConnectionStatus('connecting');
          callbacksRef.current.scheduleParentReconnect();
        },
        onError: (socketError) => {
          if (!isCurrentMainClient()) {
            return;
          }

          const message = socketError.message;
          callbacksRef.current.setConnectionError(message);

          const terminalProblem = getRealtimeTerminalProblem('', message);
          if (terminalProblem) {
            setError(terminalProblem.message);
            setStatus(terminalProblem.status);
            if (terminalProblem.status === 'error') {
              callbacksRef.current.setConnectionStatus('error');
            }
          }
        },
        onConnectionStatus: (connectionStatus) => {
          if (!isCurrentMainClient()) {
            return;
          }

          const normalizedStatus = normalizeRealtimeStatus(connectionStatus?.status);
          const statusMessage = connectionStatus?.message?.trim();
          const terminalProblem = getRealtimeTerminalProblem(
            normalizedStatus,
            statusMessage,
            connectionStatus?.degraded === true,
          );

          if (terminalProblem) {
            callbacksRef.current.setConnectionError(terminalProblem.message);
            if (terminalProblem.status === 'degraded') {
              setError(null);
              setErrorCode('QUOTE_FEED_DEGRADED');
              const currentClient = existingClientRef.current;
              if (
                connectedAccountId.current ||
                (currentClient?.isConnected && currentClient.isAuthenticated)
              ) {
                setStatus('ready');
                callbacksRef.current.setConnectionStatus('connected');
              } else {
                setStatus('connecting');
                callbacksRef.current.setConnectionStatus('connecting');
              }
              return;
            }

            setError(terminalProblem.message);
            setStatus(terminalProblem.status);
            if (terminalProblem.status === 'error') {
              callbacksRef.current.setConnectionStatus('error');
            }
            return;
          }

          if (normalizedStatus === 'replaced') {
            // Rust gateway superseded this connection with a newer one.
            // Explicitly disconnect so handleClose sees manualDisconnect=true
            // and does NOT schedule a reconnect — preventing an infinite fight.
            isIntentionalDisconnectRef.current = true;
            existingClientRef.current?.disconnect();
            callbacksRef.current.setConnectionStatus('connecting');
            return;
          }

          if (isBootstrapProgressStatus(normalizedStatus)) {
            setError(null);
            setErrorCode(null);
            if (connectedAccountId.current) {
              setStatus('ready');
              callbacksRef.current.setConnectionStatus('connected');
            } else {
              setStatus('connecting');
              callbacksRef.current.setConnectionStatus('connecting');
            }
            callbacksRef.current.setConnectionError(null);
            return;
          }

          if (
            normalizedStatus === 'connecting' ||
            normalizedStatus === 'disconnected' ||
            normalizedStatus === 'reconnecting' ||
            normalizedStatus === 'error'
          ) {
            callbacksRef.current.setConnectionStatus(normalizedStatus);
          }

          if (normalizedStatus === 'error') {
            const message =
              connectionStatus?.message?.trim() ||
              'Live market data is temporarily unavailable.';
            setError(message);
            callbacksRef.current.setConnectionError(message);
            setStatus('error');
            return;
          }

          if (isTerminalReadyStatus(normalizedStatus)) {
            if (connectedAccountId.current) {
              const symbolRefreshPending = useWebtraderStore.getState().isLoadingSymbols;
              setStatus(symbolRefreshPending ? 'degraded' : 'ready');
              if (!symbolRefreshPending) {
                setError(null);
                setErrorCode(null);
                callbacksRef.current.setConnectionError(null);
              }
              callbacksRef.current.setConnectionStatus('connected');
            }
            return;
          }

          if (normalizedStatus === 'reconnecting') {
            setStatus('reconnecting');
          }
        },
        onTick: (tick) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          // Track latest MT5 server time from tick timestamps (most reliable source).
          // Throttled to ≥500ms so Zustand does not fan out on every tick.
          const tickMs = tick.time instanceof Date ? tick.time.getTime() : 0;
          maybeSetMt5ServerTimeMs(tickMs);

          callbacksRef.current.updatePrice(tick);
          if (isValidLiveTick(tick)) {
            const currentConnectionError = useWebtraderStore.getState().connectionError;
            if (currentConnectionError && isStaleLiveQuoteWarning(currentConnectionError)) {
              callbacksRef.current.setConnectionError(null);
            }

            setError((currentError) =>
              isStaleLiveQuoteWarning(currentError) ? null : currentError,
            );
            setErrorCode((currentErrorCode) =>
              currentErrorCode === 'QUOTE_FEED_DEGRADED' ? null : currentErrorCode,
            );
            if (statusRef.current !== 'ready' && connectedAccountId.current) {
              setStatus('ready');
              callbacksRef.current.setConnectionStatus('connected');
            }
          }
          // Only run OHLC aggregation from the main WS when there is no dedicated
          // market-quote WS authenticated — avoids double-ingesting every tick.
          if (!marketClientRef.current?.isAuthenticated) {
            ohlcService.ingestTick(
              tick.symbol,
              tick.bid,
              tick.ask,
              tick.last,
              tick.volume,
              tick.mt5_time_msc ?? tick.mt5TimeMsc ?? tick.time,
            );
          }
        },
        onOrderUpdate: (payload) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          if (payload.action === 'deleted') {
            callbacksRef.current.removeOrder(payload.order.ticket);
            return;
          }

          if (payload.action === 'added') {
            callbacksRef.current.addOrder(payload.order as any);
            return;
          }

          callbacksRef.current.updateOrderInStore(payload.order as any);
        },
        onPositionUpdate: (payload) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          if (payload.action === 'deleted') {
            callbacksRef.current.removePosition(payload.position.ticket);
            return;
          }

          if (payload.action === 'added') {
            callbacksRef.current.addPosition(payload.position as any);
            return;
          }

          callbacksRef.current.updatePositionInStore(payload.position as any);
        },
        onPositionsSnapshot: (positions) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          // Always accept authoritative snapshots, including empty ones.
          // Ignoring empty snapshots left ghost open positions after close-all / last close.
          callbacksRef.current.setPositions(positions);
        },
        onTradeResult: (payload) => {
          if (!client || !isCurrentMainClientAccountEvent()) {
            return;
          }

          void Promise.allSettled([
            client.getPositions({
              force: true,
              coalesceInFlight: true,
            }),
            client.getOrders(),
          ]).then(([positionsResult, ordersResult]) => {
            if (!isCurrentMainClientAccountEvent()) {
              return;
            }

            if (positionsResult.status === 'fulfilled') {
              callbacksRef.current.setPositions(positionsResult.value);
            }

            if (ordersResult.status === 'fulfilled') {
              callbacksRef.current.setOrders(ordersResult.value);
            }

            if (positionsResult.status === 'rejected') {
              console.warn('[Terminal] Failed to refresh positions after trade_result', {
                requestId: payload.requestId,
                error:
                  positionsResult.reason instanceof Error
                    ? positionsResult.reason.message
                    : String(positionsResult.reason),
              });
            }

            if (ordersResult.status === 'rejected') {
              console.warn('[Terminal] Failed to refresh pending orders after trade_result', {
                requestId: payload.requestId,
                error:
                  ordersResult.reason instanceof Error
                    ? ordersResult.reason.message
                    : String(ordersResult.reason),
              });
            }
          });
        },
        onSymbolList: (symbols) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          const marketSymbols = callbacksRef.current.prepareMarketSymbols(symbols);
          if (marketSymbols.length === 0) {
            return;
          }

          callbacksRef.current.setSymbols(marketSymbols);
          pendingInitialMarketSymbolsRef.current = marketSymbols;
          callbacksRef.current.clearScheduledSymbolRefresh();
          callbacksRef.current.setIsLoadingSymbols(false);

          if (connectedAccountId.current) {
            setStatus('ready');
            setError(null);
            setErrorCode(null);
            callbacksRef.current.setConnectionStatus('connected');
            callbacksRef.current.setConnectionError(null);
          }

          if (callbacksRef.current.shouldSubscribeInitialSymbols) {
            void callbacksRef.current.subscribeInitialMarketSymbolsThroughOwner(marketSymbols, {
              expectedAccountId: connectedAccountId.current,
              fallbackClient: existingClientRef.current,
              failureLabel: 'SYMBOL_LIST catalog',
            }).catch((error) => {
              console.warn('[Terminal] Failed to subscribe SYMBOL_LIST catalog', {
                count: marketSymbols.length,
                error: error instanceof Error ? error.message : String(error),
              });
            });
          }
        },
        onSymbolUpdate: (symbol) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          callbacksRef.current.updateSymbol(symbol);
        },
        onMarketStatus: (status) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          callbacksRef.current.updateQuoteStatus(status);
          if (connectedAccountId.current) {
            callbacksRef.current.setConnectionStatus('connected');
          }
        },
        onAccountUpdate: (payload) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          if (!accountInfoMatchesAccountId(payload.account, requestedAccountIdRef.current)) {
            return;
          }

          callbacksRef.current.setAccountInfo(payload.account);
        },
        onOrdersSnapshot: (orders) => {
          if (!isCurrentMainClientAccountEvent()) {
            return;
          }

          callbacksRef.current.setOrders(orders);
        },
      }, { wsUrl: WS_ROUTES.TRADE });

      return client;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const createMarketQuoteLaneClient = useCallback(
    () => {
      let client: WebSocketTradingClient | null = null;
      const publishLaneClientState = () => {
        if (client && marketClientRef.current === client) {
          setMarketWsClient(client);
        }
      };

      client = new WebSocketTradingClient(
        {
          onAuthenticated: () => {
            publishLaneClientState();
          },
          onDisconnect: () => {
            publishLaneClientState();
          },
          onConnectionStatus: () => {
            publishLaneClientState();
          },
          onTick: (tick) => {
            updatePrice(tick);
            if (isValidLiveTick(tick)) {
              const currentConnectionError = useWebtraderStore.getState().connectionError;
              if (currentConnectionError && isStaleLiveQuoteWarning(currentConnectionError)) {
                setConnectionError(null);
              }

              setError((currentError) =>
                isStaleLiveQuoteWarning(currentError) ? null : currentError,
              );
              setErrorCode((currentErrorCode) =>
                currentErrorCode === 'QUOTE_FEED_DEGRADED' ? null : currentErrorCode,
              );
              if (statusRef.current !== 'ready' && connectedAccountId.current) {
                setStatus('ready');
                setConnectionStatus('connected');
              }
            }

            // Market WS is the dedicated price lane — always runs OHLC aggregation here.
            ohlcService.ingestTick(
              tick.symbol,
              tick.bid,
              tick.ask,
              tick.last,
              tick.volume,
              tick.mt5_time_msc ?? tick.mt5TimeMsc ?? tick.time,
            );
          },
          onSymbolUpdate: (symbol) => {
            updateSymbol(symbol);
          },
          onMarketStatus: (status) => {
            updateQuoteStatus(status);
          },
          onError: (socketError) => {
            console.warn('[Terminal] Market quote websocket error', {
              error: socketError.message,
            });
          },
        },
        {
          wsUrl: WS_ROUTES.MARKET,
          skipBootstrapRefresh: true,
        },
      );

      return client;
    },
    [
      setMarketWsClient,
      setConnectionError,
      setConnectionStatus,
      setError,
      setErrorCode,
      setStatus,
      updatePrice,
      updateQuoteStatus,
      updateSymbol,
    ],
  );

  const createOhlcLaneClient = useCallback(
    () => {
      let client: WebSocketTradingClient | null = null;
      const publishLaneClientState = () => {
        if (client && ohlcClientRef.current === client) {
          setOhlcWsClient(client);
        }
      };

      client = new WebSocketTradingClient(
        {
          onAuthenticated: () => {
            publishLaneClientState();
          },
          onDisconnect: () => {
            publishLaneClientState();
          },
          onConnectionStatus: () => {
            publishLaneClientState();
          },
          onError: (socketError) => {
            console.warn('[Terminal] OHLC websocket error', {
              error: socketError.message,
            });
          },
        },
        {
          wsUrl: WS_ROUTES.OHLC,
          skipBootstrapRefresh: true,
        },
      );

      return client;
    },
    [setOhlcWsClient],
  );

  const requestTerminalSession = useCallback(
    async (
      resolvedAccountId: string,
      tradingPassword?: string,
    ): Promise<TerminalSessionResult> => {
      const terminalSessionAbortController = new AbortController();
      const terminalSessionTimeout = setTimeout(() => {
        terminalSessionAbortController.abort();
      }, TERMINAL_SESSION_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(
          terminalSessionRoute(resolvedAccountId),
          {
            method: tradingPassword ? 'POST' : 'GET',
            headers: tradingPassword
              ? { 'Content-Type': 'application/json' }
              : undefined,
            body: tradingPassword ? JSON.stringify({ tradingPassword }) : undefined,
            cache: 'no-store',
            signal: terminalSessionAbortController.signal,
          },
        );

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = undefined;
        }

        return normalizeTerminalSessionPayload(response, payload);
      } finally {
        clearTimeout(terminalSessionTimeout);
      }
    },
    [],
  );

  const requestReadySessionToken = useCallback(
    async (resolvedAccountId: string): Promise<string> => {
      if (isReusableTerminalSessionToken(cachedTerminalSessionTokenRef.current, resolvedAccountId)) {
        return cachedTerminalSessionTokenRef.current.token;
      }

      const pendingRequest = readySessionTokenRequestsRef.current.get(resolvedAccountId);
      if (pendingRequest) {
        return pendingRequest;
      }

      const request = (async () => {
        const terminalSession = await requestTerminalSession(resolvedAccountId);

        if (terminalSession.state !== 'ready' || !terminalSession.token) {
          cachedTerminalSessionTokenRef.current = null;
          throw new AutoConnectRequestError(
            terminalSession.message ??
              'MT5 terminal session is locked. Enter the trading password to reconnect.',
            terminalSession.code ?? PASSWORD_REQUIRED_CODE,
          );
        }

        cachedTerminalSessionTokenRef.current = {
          accountId: resolvedAccountId,
          token: terminalSession.token,
          expiresAtMs: getTerminalSessionTokenExpiryMs(terminalSession.token),
          cachedAtMs: Date.now(),
        };
        return terminalSession.token;
      })().finally(() => {
        if (readySessionTokenRequestsRef.current.get(resolvedAccountId) === request) {
          readySessionTokenRequestsRef.current.delete(resolvedAccountId);
        }
      });

      readySessionTokenRequestsRef.current.set(resolvedAccountId, request);
      return request;
    },
    [requestTerminalSession],
  );

  const ensureDedicatedLaneClient = useCallback(
    async (
      resolvedAccountId: string,
      options: {
        lane: 'market' | 'ohlc';
        createClient: () => WebSocketTradingClient;
        clientRef: MutableRefObject<WebSocketTradingClient | null>;
        ensureStateRef: MutableRefObject<DedicatedLaneEnsureState>;
        ensurePromiseRef: MutableRefObject<Promise<WebSocketTradingClient | null> | null>;
        ensureGenerationRef: MutableRefObject<number>;
        setStoreClient: (client: WebSocketTradingClient | null) => void;
      },
    ): Promise<WebSocketTradingClient | null> => {
      const isCurrentLaneOwner = (
        candidate: WebSocketTradingClient | null,
        generation: number,
      ) =>
        Boolean(
          candidate &&
            options.clientRef.current === candidate &&
            options.ensureGenerationRef.current === generation &&
            requestedAccountIdRef.current === resolvedAccountId,
        );

      const disconnectStaleLaneClient = (
        candidate: WebSocketTradingClient | null,
        generation: number,
      ) => {
        if (!candidate || isCurrentLaneOwner(candidate, generation)) {
          return;
        }

        if (
          useWebtraderStore.getState()[
            options.lane === 'market' ? 'marketWsClient' : 'ohlcWsClient'
          ] === candidate
        ) {
          options.setStoreClient(null);
        }

        if (candidate !== existingClientRef.current) {
          candidate.disconnect();
        }
      };

      const readyLaneClient = getAuthenticatedClientSessionForAccount(
        options.clientRef.current,
        resolvedAccountId,
      );
      if (readyLaneClient) {
        options.ensureStateRef.current = 'ready';
        options.ensurePromiseRef.current = null;
        options.setStoreClient(options.clientRef.current);
        return options.clientRef.current;
      }

      if (options.ensurePromiseRef.current) {
        return options.ensurePromiseRef.current;
      }

      const ensurePromise = (async (): Promise<WebSocketTradingClient | null> => {
        options.ensureStateRef.current = 'ensuring';
        const ensureGeneration = options.ensureGenerationRef.current;

        let laneClient = options.clientRef.current;
        if (laneClient === existingClientRef.current) {
          laneClient = null;
          options.clientRef.current = null;
        }

        if (
          laneClient?.currentSession &&
          !clientSessionMatchesAccountId(laneClient, resolvedAccountId)
        ) {
          laneClient.disconnect();
          laneClient = null;
          options.clientRef.current = null;
        }

        if (!laneClient) {
          laneClient = options.createClient();
          options.clientRef.current = laneClient;
        }

        if (!isCurrentLaneOwner(laneClient, ensureGeneration)) {
          disconnectStaleLaneClient(laneClient, ensureGeneration);
          return null;
        }

        options.setStoreClient(laneClient);
        laneClient.setAuthTokenProvider(() =>
          requestReadySessionToken(resolvedAccountId),
        );

        try {
          const connected = laneClient.isConnected ? true : await laneClient.connect();
          if (!isCurrentLaneOwner(laneClient, ensureGeneration)) {
            disconnectStaleLaneClient(laneClient, ensureGeneration);
            return null;
          }

          if (!connected) {
            throw new Error(`Failed to connect to the ${options.lane} websocket.`);
          }

          const token = await requestReadySessionToken(resolvedAccountId);
          if (!isCurrentLaneOwner(laneClient, ensureGeneration)) {
            disconnectStaleLaneClient(laneClient, ensureGeneration);
            return null;
          }

          const session = await laneClient.authenticateWithToken(token);
          if (!isCurrentLaneOwner(laneClient, ensureGeneration)) {
            disconnectStaleLaneClient(laneClient, ensureGeneration);
            return null;
          }

          if (!session || !clientSessionMatchesAccountId(laneClient, resolvedAccountId)) {
            throw new Error(`Failed to authenticate the ${options.lane} websocket.`);
          }

          options.ensureStateRef.current = 'ready';
          options.setStoreClient(laneClient);
          return laneClient;
        } catch (error) {
          if (isCurrentLaneOwner(laneClient, ensureGeneration)) {
            options.ensureStateRef.current = 'failed';
            options.setStoreClient(laneClient);
          } else {
            disconnectStaleLaneClient(laneClient, ensureGeneration);
          }
          console.warn(`[Terminal] Dedicated ${options.lane} websocket unavailable`, {
            accountId: resolvedAccountId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })();

      options.ensurePromiseRef.current = ensurePromise;
      void ensurePromise.finally(() => {
        if (options.ensurePromiseRef.current === ensurePromise) {
          options.ensurePromiseRef.current = null;
        }
      });
      return ensurePromise;
    },
    [requestReadySessionToken],
  );

  const connectMarketQuoteClient = useCallback(
    async (
      resolvedAccountId: string,
      symbols: SymbolInfo[] = [],
    ): Promise<void> => {
      const marketClient = await ensureDedicatedLaneClient(resolvedAccountId, {
        lane: 'market',
        createClient: createMarketQuoteLaneClient,
        clientRef: marketClientRef,
        ensureStateRef: marketEnsureStateRef,
        ensurePromiseRef: marketEnsurePromiseRef,
        ensureGenerationRef: marketEnsureGenerationRef,
        setStoreClient: setMarketWsClient,
      });

      if (!marketClient) {
        marketEnsureStateRef.current = 'failed';
        return;
      }

      marketEnsureStateRef.current = 'ready';

      // Fire the 3 always-warm defaults immediately — no catalog needed.
      // These arrive in one batch frame; catalog-derived subscriptions merge in shortly after.
      subscribeWarmDefaultQuoteSymbols(marketClient);

      const symbolsToSubscribe =
        symbols.length > 0 ? symbols : pendingInitialMarketSymbolsRef.current;
      if (symbolsToSubscribe.length > 0 && shouldSubscribeInitialSymbols) {
        const authenticatedDrain = initialMarketSubscriptionInFlightRef.current;
        if (authenticatedDrain) {
          const subscribed = await authenticatedDrain;
          if (subscribed) {
            return;
          }

          logInitialMarketSubscriptionDeferred(
            '[Terminal] Market quote websocket draining deferred initial symbol subscription',
            {
              count: symbolsToSubscribe.length,
            },
            'market-websocket-draining-deferred',
          );
        }

        try {
          const subscribed = await subscribeInitialMarketSymbols(marketClient, symbolsToSubscribe);
          if (!subscribed) {
            logInitialMarketSubscriptionDeferred(
              '[Terminal] Market quote websocket kept alive with deferred initial symbol subscription',
              {
                count: symbolsToSubscribe.length,
              },
              'market-websocket-kept-alive-deferred',
            );
          }
        } catch (error) {
          console.warn('[Terminal] Market quote websocket kept alive after initial symbol subscription failure', {
            count: symbolsToSubscribe.length,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
    [
      createMarketQuoteLaneClient,
      ensureDedicatedLaneClient,
      logInitialMarketSubscriptionDeferred,
      setMarketWsClient,
      shouldSubscribeInitialSymbols,
      subscribeInitialMarketSymbols,
      subscribeWarmDefaultQuoteSymbols,
    ],
  );

  const connectOhlcClient = useCallback(
    async (resolvedAccountId: string): Promise<void> => {
      const ohlcClient = await ensureDedicatedLaneClient(resolvedAccountId, {
        lane: 'ohlc',
        createClient: createOhlcLaneClient,
        clientRef: ohlcClientRef,
        ensureStateRef: ohlcEnsureStateRef,
        ensurePromiseRef: ohlcEnsurePromiseRef,
        ensureGenerationRef: ohlcEnsureGenerationRef,
        setStoreClient: setOhlcWsClient,
      });

      if (!ohlcClient) {
        ohlcEnsureStateRef.current = 'failed';
      }
    },
    [createOhlcLaneClient, ensureDedicatedLaneClient, setOhlcWsClient],
  );

  const ensureOhlcLane = useCallback(
    (resolvedAccountId: string) => {
      void connectOhlcClient(resolvedAccountId).catch((error) => {
        console.warn('[Terminal] Failed to ensure OHLC websocket', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [connectOhlcClient],
  );

  const ensureMarketQuoteLane = useCallback(
    (
      resolvedAccountId: string,
      fallbackClient: WebSocketTradingClient | null,
      symbols: SymbolInfo[] = [],
      contextLabel = 'ensure',
    ) => {
      void connectMarketQuoteClient(resolvedAccountId, symbols).catch((error) => {
        console.warn(`[Terminal] Failed to ${contextLabel} market quote websocket`, {
          error: error instanceof Error ? error.message : String(error),
        });
        const pendingSymbols = pendingInitialMarketSymbolsRef.current;
        if (pendingSymbols.length > 0 && shouldSubscribeInitialSymbols) {
          void subscribeInitialMarketSymbolsThroughOwner(pendingSymbols, {
            expectedAccountId: resolvedAccountId,
            fallbackClient,
            failureLabel: 'market quote websocket unavailable',
          }).catch((subscriptionError) => {
            console.warn('[Terminal] Failed to fall back initial market symbols after market websocket failure', {
              count: pendingSymbols.length,
              error:
                subscriptionError instanceof Error
                  ? subscriptionError.message
                  : String(subscriptionError),
            });
          });
        }
      });
    },
    [
      connectMarketQuoteClient,
      shouldSubscribeInitialSymbols,
      subscribeInitialMarketSymbolsThroughOwner,
    ],
  );

  const connectToTradingServer = useCallback(
    async (
      resolvedAccountId: string,
      tradingPassword?: string,
      options?: { isCancelled?: () => boolean },
    ): Promise<{ ok: boolean; message?: string; code?: string | null }> => {
      let client: WebSocketTradingClient | null = null;

      try {
        // Early reuse: if already connected/authenticated for this account, avoid a
        // redundant session fetch and WS switch (guards racy concurrent calls too).
        if (!tradingPassword) {
          const earlyClient = existingClientRef.current;
          const earlySession = getAuthenticatedClientSessionForAccount(earlyClient, resolvedAccountId);
          if (earlyClient && earlySession) {
            activateAuthenticatedClient(earlyClient, earlySession, resolvedAccountId);
            ensureOhlcLane(resolvedAccountId);
            ensureMarketQuoteLane(
              resolvedAccountId,
              existingClientRef.current,
              [],
              'ensure',
            );
            return { ok: true };
          }
        }

        setStatus('connecting');
        setError(null);
        setErrorCode(null);
        setConnectionStatus('connecting');
        setConnectionError(null);
        setIsLoadingSymbols(true);

        const terminalSession = await requestTerminalSession(
          resolvedAccountId,
          tradingPassword,
        );

        if (terminalSession.state === 'locked') {
          connectedAccountId.current = null;
          disconnectMarketClient(marketClientRef.current);
          disconnectOhlcClient(ohlcClientRef.current);
          clearLiveState();
          setStatus('locked');
          setError(null);
          setErrorCode(terminalSession.code ?? PASSWORD_REQUIRED_CODE);
          setConnectionStatus('disconnected');
          setConnectionError(null);
          setIsLoadingSymbols(false);
          return {
            ok: false,
            message:
              terminalSession.message ??
              'MT5 trading password is required to unlock this terminal session.',
            code: terminalSession.code ?? PASSWORD_REQUIRED_CODE,
          };
        }

        const token = terminalSession.token;
        if (!token) {
          throw new AutoConnectRequestError(
            'Terminal session route did not return a session token.',
            'TOKEN_MISSING',
          );
        }
        cachedTerminalSessionTokenRef.current = {
          accountId: resolvedAccountId,
          token,
          expiresAtMs: getTerminalSessionTokenExpiryMs(token),
          cachedAtMs: Date.now(),
        };

        if (options?.isCancelled?.()) {
          return { ok: false, message: 'Cancelled' };
        }

        const reusableClient = existingClientRef.current;
        const reusableSession = getAuthenticatedClientSessionForAccount(
          reusableClient,
          resolvedAccountId,
        );
        if (reusableClient && reusableSession) {
          activateAuthenticatedClient(reusableClient, reusableSession, resolvedAccountId);
          ensureOhlcLane(resolvedAccountId);
          ensureMarketQuoteLane(
            resolvedAccountId,
            existingClientRef.current,
            [],
            'ensure',
          );
          return { ok: true };
        }

        if (reusableClient) {
          disconnectLocalClient(reusableClient);
        }

        client = createTradingClient();
        existingClientRef.current = client;
        client.setAuthTokenProvider(() =>
          requestReadySessionToken(resolvedAccountId),
        );

        setStatus('connecting');
        const connected = await client.connect();
        if (!connected) {
          throw new Error(
            useWebtraderStore.getState().connectionError ||
              'Failed to connect to the trading websocket. Check the gateway /health endpoint for upstream C++ realtime or MT5 quote errors; restart the C++ realtime service if needed and verify MT5 quotes.',
          );
        }

        if (options?.isCancelled?.()) {
          disconnectLocalClient(client);
          return { ok: false, message: 'Cancelled' };
        }

        setStatus('authenticating');
        const session = await client.authenticateWithToken(token);
        if (!session) {
          throw new Error('Authentication failed');
        }

        if (options?.isCancelled?.()) {
          disconnectLocalClient(client);
          return { ok: false, message: 'Cancelled' };
        }

        ohlcService.setTokenProvider(() => requestReadySessionToken(resolvedAccountId));
        activateAuthenticatedClient(client, session, resolvedAccountId, {
          symbolsLoading: true,
        });
        ensureOhlcLane(resolvedAccountId);
        ensureMarketQuoteLane(resolvedAccountId, client, [], 'connect');
        void runAuthenticatedBootstrap(client, resolvedAccountId, options);
        return { ok: true };
      } catch (err) {
        disconnectLocalClient(client);

        if (options?.isCancelled?.()) {
          return { ok: false, message: 'Cancelled' };
        }

        const code =
          err instanceof AutoConnectRequestError
            ? err.code
            : err instanceof DOMException && err.name === 'AbortError'
              ? TERMINAL_SESSION_TIMEOUT_CODE
              : null;
        const message =
          err instanceof DOMException && err.name === 'AbortError'
            ? TERMINAL_SESSION_RETRY_MESSAGE
            : err instanceof Error
              ? err.message
              : String(err);

        connectedAccountId.current = null;
        hasConnected.current = false;
        disconnectMarketClient(marketClientRef.current);
        disconnectOhlcClient(ohlcClientRef.current);
        clearLiveState();
        setIsLoadingSymbols(false);
        setError(message);
        setErrorCode(code);
        if (code === TERMINAL_SESSION_TIMEOUT_CODE) {
          setStatus('connecting');
          setConnectionStatus('connecting');
          setConnectionError(null);
        } else {
          setStatus('error');
          setConnectionStatus('error');
          setConnectionError(message);
        }

        return { ok: false, message, code };
      }
    },
    [
      activateAuthenticatedClient,
      clearLiveState,
      connectMarketQuoteClient,
      disconnectMarketClient,
      disconnectLocalClient,
      requestReadySessionToken,
      requestTerminalSession,
      runAuthenticatedBootstrap,
      setConnectionError,
      setConnectionStatus,
      setIsLoadingSymbols,
      shouldSubscribeInitialSymbols,
      subscribeInitialMarketSymbolsThroughOwner,
    ],
  );

  const connectWithPassword = useCallback(
    async (tradingPassword: string) => {
      const normalizedPassword = tradingPassword.trim();
      if (!accountId) {
        return { ok: false, message: 'No MT5 account is selected.' };
      }

      if (!normalizedPassword) {
        return { ok: false, message: 'Enter the MT5 trading password.' };
      }

      disconnectLocalClient(existingClientRef.current);
      clearScheduledParentReconnect();
      clearLiveState();
      hasConnected.current = true;

      const result = await connectToTradingServer(accountId, normalizedPassword);
      return {
        ok: result.ok,
        ...(result.message ? { message: result.message } : {}),
      };
    },
    [
      accountId,
      clearLiveState,
      clearScheduledParentReconnect,
      connectToTradingServer,
      disconnectLocalClient,
    ],
  );

  useEffect(() => {
    if (!accountId) {
      clearScheduledParentReconnect();
      disconnectMarketClient(marketClientRef.current);
      disconnectOhlcClient(ohlcClientRef.current);
      disconnectLocalClient(existingClientRef.current);
      connectedAccountId.current = null;
      requestedAccountIdRef.current = null;
      hasConnected.current = false;
      clearLiveState();
      setConnectionStatus('disconnected');
      setConnectionError(null);
      setStatus('idle');
      setError(null);
      setErrorCode(null);
      return;
    }

    if (requestedAccountIdRef.current && requestedAccountIdRef.current !== accountId) {
      if (clientSessionMatchesAccountId(existingClientRef.current, accountId)) {
        connectedAccountId.current = accountId;
      } else {
        // Disconnect and clear the ref before clearLiveState() so resetLiveState()
        // cannot race to null existingClientRef while the old socket is still alive.
        disconnectMarketClient(marketClientRef.current);
        disconnectOhlcClient(ohlcClientRef.current);
        disconnectLocalClient(existingClientRef.current);
        connectedAccountId.current = null;
        hasConnected.current = false;
        clearScheduledParentReconnect();
        clearLiveState();
        setStatus('connecting');
        setConnectionStatus('connecting');
        setConnectionError(null);
        setErrorCode(null);
      }
    }
    requestedAccountIdRef.current = accountId;

    const currentClient = existingClientRef.current;
    const currentSession = getAuthenticatedClientSessionForAccount(currentClient, accountId);
    if (currentClient && currentSession) {
      hasConnected.current = true;
      activateAuthenticatedClient(currentClient, currentSession, accountId);
      ensureOhlcLane(accountId);
      ensureMarketQuoteLane(accountId, currentClient, [], 'ensure');
      return;
    }

    if (hasConnected.current) return;

    hasConnected.current = true;
    let isCancelled = false;

    const connect = async () => {
      const result = await connectToTradingServer(accountId, undefined, {
        isCancelled: () => isCancelled,
      });

      if (isCancelled || result.ok) return;

      // Password-required and permanent account errors need user action — don't loop.
      if (
        result.code === PASSWORD_REQUIRED_CODE ||
        result.code === 'ACCOUNT_NOT_FOUND' ||
        result.code === 'INVALID_MT5_LOGIN' ||
        result.code === 'UNSUPPORTED_PLATFORM' ||
        result.code === 'ACCOUNT_ARCHIVED'
      ) return;

      // Retriable failures (network error, C++ down, timeout) — schedule next attempt.
      const retryMs = result.code === TERMINAL_SESSION_TIMEOUT_CODE ? 5_000 : undefined;
      if (!isCancelled) {
        scheduleParentReconnect(retryMs);
      }
    };

    void connect();

    return () => {
      isCancelled = true;
      const candidate = existingClientRef.current;
      if (candidate && useWebtraderStore.getState().wsClient !== candidate) {
        disconnectLocalClient(candidate);
      }
      hasConnected.current = false;
    };
  }, [
    activateAuthenticatedClient,
    accountId,
    setConnectionError,
    setConnectionStatus,
    clearLiveState,
    clearScheduledParentReconnect,
    connectToTradingServer,
    disconnectMarketClient,
    disconnectOhlcClient,
    disconnectLocalClient,
    ensureMarketQuoteLane,
    ensureOhlcLane,
    reconnectTrigger,
    scheduleParentReconnect,
  ]);

  // Keep a synchronously-readable status ref so event handlers see current value.
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // When the browser tab becomes visible again (after Chrome freeze / background switch),
  // immediately retry if we're stuck in reconnecting or error state.
  useEffect(() => {
    if (!accountId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const s = statusRef.current;
      if (s === 'reconnecting' || s === 'error' || s === 'connecting') {
        clearScheduledParentReconnect();
        setReconnectTrigger((n) => n + 1);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [accountId, clearScheduledParentReconnect]);

  // When the network comes back online, immediately retry if disconnected.
  useEffect(() => {
    if (!accountId) return;

    const handleOnline = () => {
      const s = statusRef.current;
      if (s === 'reconnecting' || s === 'error' || s === 'connecting') {
        clearScheduledParentReconnect();
        setReconnectTrigger((n) => n + 1);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [accountId, clearScheduledParentReconnect]);

  return {
    status,
    error,
    errorCode,
    requiresPassword: status === 'locked' || errorCode === PASSWORD_REQUIRED_CODE,
    connectWithPassword,
  };
}
