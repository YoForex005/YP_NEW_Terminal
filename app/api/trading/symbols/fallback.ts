import { createHash } from 'node:crypto';

import type { NextRequest } from 'next/server';

import {
  TerminalBridgeError,
  requestTerminalAction,
} from '@/lib/server/terminal-ws-bridge';

const SYMBOL_FALLBACK_AFTER_MS = 1_800;
const SYMBOL_BRIDGE_TIMEOUT_MS = 12_000;
const SYMBOL_CACHE_TTL_MS = 5 * 60_000;
const TERMINAL_STATE_FALLBACK_TIMEOUT_MS = 1_200;

const FALLBACK_BRIDGE_ERROR_CODES = new Set([
  'TERMINAL_WS_TIMEOUT',
  'TERMINAL_WS_CLOSED',
  'TERMINAL_WS_CONNECT_FAILED',
  'TERMINAL_WS_CONNECTION_FAILED',
  'OHLC_HISTORY_UNAVAILABLE',
]);

interface CachedSymbolCatalog {
  payload: unknown;
  cachedAtMs: number;
}

export interface SymbolCatalogResult {
  payload: unknown;
  accountId: string;
  degraded: boolean;
  fallbackSource?: 'symbol_catalog_cache' | 'terminal_state' | 'empty';
  fallbackReason?: string;
  refreshScheduled?: boolean;
  warnings?: string[];
}

const symbolCatalogCache = new Map<string, CachedSymbolCatalog>();

export const isSymbolCatalogFallbackError = (error: unknown): boolean =>
  error instanceof TerminalBridgeError &&
  FALLBACK_BRIDGE_ERROR_CODES.has(error.code);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const requestHeader = (request: NextRequest, name: string): string => {
  const value = request.headers.get(name);
  return value?.trim() ?? '';
};

const symbolCatalogCacheKey = (
  request: NextRequest,
  accountId: string,
): string => {
  const authorization = requestHeader(request, 'authorization');
  const cookie = requestHeader(request, 'cookie');
  return sha256Hex([accountId.trim(), authorization, cookie].join('\u001f'));
};

const getCachedSymbolCatalog = (
  cacheKey: string,
): CachedSymbolCatalog | null => {
  const cached = symbolCatalogCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.cachedAtMs > SYMBOL_CACHE_TTL_MS) {
    symbolCatalogCache.delete(cacheKey);
    return null;
  }

  return cached;
};

const cacheSymbolCatalog = (cacheKey: string, payload: unknown): void => {
  const symbols = extractSymbolCatalog(payload);
  if (symbols.length === 0) {
    return;
  }

  symbolCatalogCache.set(cacheKey, {
    payload,
    cachedAtMs: Date.now(),
  });
};

const timeoutError = (): TerminalBridgeError =>
  new TerminalBridgeError(
    'get_symbols did not complete before the symbols fallback deadline.',
    504,
    'TERMINAL_WS_TIMEOUT',
  );

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const requestAuthHeaders = (request: NextRequest): HeadersInit => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');

  if (authorization?.trim()) {
    headers.Authorization = authorization;
  }
  if (cookie?.trim()) {
    headers.Cookie = cookie;
  }

  return headers;
};

const normalizeSymbol = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.toUpperCase() : null;
};

const collectSymbolArray = (
  symbols: Set<string>,
  source: Record<string, unknown>,
  ...keys: string[]
) => {
  for (const key of keys) {
    const value = source[key];
    if (!Array.isArray(value)) {
      continue;
    }

    value.forEach((entry) => {
      const symbol = normalizeSymbol(entry);
      if (symbol) {
        symbols.add(symbol);
      }
    });
  }
};

const inferCategory = (symbol: string): string => {
  if (/^(BTC|ETH|LTC|XRP|ADA|BNB|SOL|DOGE)/u.test(symbol)) {
    return 'crypto';
  }

  if (/^(XAU|XAG|UKOIL|USOIL|WTI)/u.test(symbol)) {
    return 'commodity';
  }

  if (/^(US30|US500|USTEC|NAS|SPX|DE|GER|UK100|JP225)/u.test(symbol)) {
    return 'index';
  }

  return 'forex';
};

const getTerminalStateFallbackPayload = async (
  request: NextRequest,
  accountId: string,
): Promise<unknown | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    TERMINAL_STATE_FALLBACK_TIMEOUT_MS,
  );

  try {
    const stateUrl = new URL(
      `/api/private/accounts/${encodeURIComponent(accountId)}/terminal-state`,
      request.url,
    );
    const response = await fetch(stateUrl, {
      headers: requestAuthHeaders(request),
      cache: 'no-store',
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
    const symbols = new Set<string>();

    [
      data.selectedSymbol,
      data.selected_symbol,
      data.symbol,
      data.activeSymbol,
      data.active_symbol,
    ].forEach((value) => {
      const symbol = normalizeSymbol(value);
      if (symbol) {
        symbols.add(symbol);
      }
    });

    collectSymbolArray(
      symbols,
      data,
      'openTabs',
      'open_tabs',
      'watchlistSymbols',
      'watchlist_symbols',
      'watchlist',
      'defaultSymbols',
      'default_symbols',
    );

    if (symbols.size === 0) {
      return null;
    }

    return {
      symbols: [...symbols].map((symbol) => ({
        name: symbol,
        symbol,
        description: symbol,
        category: inferCategory(symbol),
        tradeMode: 'full',
        quoteCapable: true,
        source: 'terminal_state_fallback',
      })),
      degraded: true,
      symbolCatalogStatus: 'terminal_state_fallback',
      managerUnavailable: true,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildFallbackResult = async (
  request: NextRequest,
  accountId: string,
  cacheKey: string,
  error: unknown,
  refreshScheduled: boolean,
): Promise<SymbolCatalogResult> => {
  const fallbackReason =
    error instanceof TerminalBridgeError ? error.code : 'SYMBOL_CATALOG_FALLBACK';
  const cached = getCachedSymbolCatalog(cacheKey);
  if (cached) {
    return {
      payload: cached.payload,
      accountId,
      degraded: true,
      fallbackSource: 'symbol_catalog_cache',
      fallbackReason,
      refreshScheduled,
      warnings: ['get_symbols unavailable; returned cached symbol catalog.'],
    };
  }

  const terminalStatePayload = await getTerminalStateFallbackPayload(
    request,
    accountId,
  );
  if (terminalStatePayload) {
    return {
      payload: terminalStatePayload,
      accountId,
      degraded: true,
      fallbackSource: 'terminal_state',
      fallbackReason,
      refreshScheduled,
      warnings: ['get_symbols unavailable; returned terminal saved symbols.'],
    };
  }

  return {
    payload: {
      symbols: [],
      degraded: true,
      pending: true,
      symbolCatalogStatus: 'pending',
      managerUnavailable: true,
    },
    accountId,
    degraded: true,
    fallbackSource: 'empty',
    fallbackReason,
    refreshScheduled,
    warnings: ['get_symbols unavailable; symbol catalog refresh is pending.'],
  };
};

export const requestSymbolCatalogWithFallback = async (
  request: NextRequest,
  accountId: string,
): Promise<SymbolCatalogResult> => {
  const cacheKey = symbolCatalogCacheKey(request, accountId);
  const requestPromise = requestTerminalAction<unknown>(
    request,
    accountId,
    'get_symbols',
    {},
    SYMBOL_BRIDGE_TIMEOUT_MS,
  );

  const cacheOnSuccess = requestPromise.then((payload) => {
    cacheSymbolCatalog(cacheKey, payload);
    return payload;
  });

  try {
    const payload = await withTimeout(cacheOnSuccess, SYMBOL_FALLBACK_AFTER_MS);
    return {
      payload,
      accountId,
      degraded: false,
    };
  } catch (error) {
    if (!isSymbolCatalogFallbackError(error)) {
      throw error;
    }

    cacheOnSuccess.catch((refreshError) => {
      if (!isSymbolCatalogFallbackError(refreshError)) {
        console.error('Background symbol catalog refresh failed:', refreshError);
      }
    });

    return buildFallbackResult(request, accountId, cacheKey, error, true);
  }
};

const SYMBOL_CATALOG_ARRAY_KEYS = [
  'symbols',
  'symbol_list',
  'symbolList',
  'symbols_list',
  'symbolsList',
  'catalog',
  'symbolCatalog',
  'symbol_catalog',
  'marketWatch',
  'market_watch',
  'marketSymbols',
  'market_symbols',
] as const;

const SYMBOL_CATALOG_ENVELOPE_KEYS = [
  ...SYMBOL_CATALOG_ARRAY_KEYS,
  'payload',
  'data',
  'result',
] as const;

export const extractSymbolCatalog = (payload: unknown, depth = 0): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload) || depth > 4) {
    return [];
  }

  for (const key of SYMBOL_CATALOG_ARRAY_KEYS) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  for (const key of SYMBOL_CATALOG_ENVELOPE_KEYS) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (!isRecord(candidate)) {
      continue;
    }

    const nested = extractSymbolCatalog(candidate, depth + 1);
    if (nested.length > 0) {
      return nested;
    }
  }

  return [];
};
