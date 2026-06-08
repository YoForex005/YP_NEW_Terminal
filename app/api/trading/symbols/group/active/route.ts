/**
 * GET /api/trading/symbols/group/active
 *
 * Returns quote-capable, non-disabled symbols for the caller's MT5 group(s),
 * grouped by market category and sorted by preferred display order.
 *
 * Query params:
 *   accountId  — MT5 account used to open the terminal WS session (required)
 *   group      — optional: filter to a single MT5 group name
 *   category   — optional: filter to forex | crypto | commodity | index
 */

import { NextRequest, NextResponse } from 'next/server';

import { TerminalBridgeError, requireTradingAccountId } from '@/lib/server/terminal-ws-bridge';
import type { SymbolInfo } from '@/types/webtrader';
import {
  getTerminalDisplaySymbols,
  type TerminalMarketCategory,
} from '@/lib/trading/terminal-symbols';
import { requestSymbolCatalogWithFallback } from '../../fallback';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Types ──────────────────────────────────────────────────────────────────

interface RawSymbol {
  name?: unknown;
  symbol?: unknown;
  description?: unknown;
  baseCurrency?: unknown;
  quoteCurrency?: unknown;
  digits?: unknown;
  point?: unknown;
  tickSize?: unknown;
  tickValue?: unknown;
  tradeContractSize?: unknown;
  tradeMode?: unknown;
  calcMode?: unknown;
  volumeMin?: unknown;
  volumeMax?: unknown;
  volumeStep?: unknown;
  marginInitial?: unknown;
  marginMaintenance?: unknown;
  swapLong?: unknown;
  swapShort?: unknown;
  category?: unknown;
  path?: unknown;
  quoteCapable?: unknown;
  fillFlags?: unknown;
  execMode?: unknown;
}

interface GetSymbolsPayload {
  symbols?: unknown[];
  degraded?: boolean;
  pending?: boolean;
  symbolCatalogStatus?: string;
  refreshScheduled?: boolean;
  managerUnavailable?: boolean;
  warnings?: string[];
  notes?: string[];
}

export interface ActiveSymbolsResponse {
  ok: true;
  accountId: string;
  group: string | null;
  category: TerminalMarketCategory | null;
  symbols: SymbolInfo[];
  byCategory: Record<TerminalMarketCategory, SymbolInfo[]>;
  total: number;
  catalogStatus: string;
  degraded: boolean;
  managerUnavailable: boolean;
  fallbackSource?: string;
  fallbackReason?: string;
  refreshScheduled?: boolean;
  warnings?: string[];
}

export interface ActiveSymbolsErrorResponse {
  ok: false;
  error: string;
  code: string;
  details?: unknown;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const toStr = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v.trim() : fallback;

const toNum = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && isFinite(v) ? v : fallback;

const toBool = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;

const VALID_CATEGORIES = new Set<TerminalMarketCategory>([
  'forex',
  'crypto',
  'commodity',
  'index',
]);

const isValidCategory = (v: unknown): v is TerminalMarketCategory =>
  typeof v === 'string' && VALID_CATEGORIES.has(v as TerminalMarketCategory);

const normalizeRawSymbol = (raw: unknown): SymbolInfo | null => {
  if (!isRecord(raw)) return null;

  const s = raw as RawSymbol;
  const name = toStr(s.name) || toStr(s.symbol);
  if (!name) return null;

  return {
    name,
    description: toStr(s.description, name),
    baseCurrency: toStr(s.baseCurrency),
    quoteCurrency: toStr(s.quoteCurrency),
    digits: toNum(s.digits, 5),
    point: toNum(s.point),
    tickSize: toNum(s.tickSize),
    tickValue: toNum(s.tickValue),
    tradeContractSize: toNum(s.tradeContractSize),
    tradeMode: toStr(s.tradeMode, 'full') as SymbolInfo['tradeMode'],
    calcMode: toStr(s.calcMode, 'forex') as SymbolInfo['calcMode'],
    volumeMin: toNum(s.volumeMin, 0.01),
    volumeMax: toNum(s.volumeMax),
    volumeStep: toNum(s.volumeStep, 0.01),
    marginInitial: toNum(s.marginInitial),
    marginMaintenance: toNum(s.marginMaintenance),
    swapLong: toNum(s.swapLong),
    swapShort: toNum(s.swapShort),
    category: toStr(s.category) || undefined,
  };
};

const isActive = (symbol: SymbolInfo, raw: RawSymbol): boolean => {
  if (symbol.tradeMode === 'disabled') return false;
  // quoteCapable comes from the C++ bridge — prefer it when present
  const qc = toBool(raw.quoteCapable, true);
  return qc;
};

const extractPayload = (raw: unknown): GetSymbolsPayload => {
  if (!isRecord(raw)) return {};
  // The WS bridge wraps the response in { data: ... } — unwrap if needed
  const base = isRecord(raw.data) ? raw.data : raw;
  return base as GetSymbolsPayload;
};

const buildByCategory = (symbols: SymbolInfo[]): Record<TerminalMarketCategory, SymbolInfo[]> => ({
  forex: symbols.filter((s) => s.category === 'forex'),
  crypto: symbols.filter((s) => s.category === 'crypto'),
  commodity: symbols.filter((s) => s.category === 'commodity'),
  index: symbols.filter((s) => s.category === 'index'),
});

const bridgeErrorResponse = (error: unknown): NextResponse<ActiveSymbolsErrorResponse> => {
  if (error instanceof TerminalBridgeError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
    { status: 500 },
  );
};

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ActiveSymbolsResponse | ActiveSymbolsErrorResponse>> {
  const { searchParams } = new URL(request.url);
  const groupFilter = searchParams.get('group')?.trim() || null;
  const categoryParam = searchParams.get('category')?.trim().toLowerCase() || null;

  if (categoryParam && !isValidCategory(categoryParam)) {
    return NextResponse.json(
      { ok: false, error: `Invalid category "${categoryParam}". Use: forex, crypto, commodity, index`, code: 'INVALID_CATEGORY' },
      { status: 400 },
    );
  }

  const categoryFilter = categoryParam as TerminalMarketCategory | null;

  let accountId: string;
  try {
    accountId = requireTradingAccountId(request);
  } catch (error) {
    return bridgeErrorResponse(error);
  }

  let payload: unknown;
  let degraded = false;
  let managerUnavailable = false;
  let fallbackSource: string | undefined;
  let fallbackReason: string | undefined;
  let refreshScheduled = false;
  let warnings: string[] | undefined;
  try {
    const catalog = await requestSymbolCatalogWithFallback(request, accountId);
    payload = catalog.payload;
    degraded = catalog.degraded;
    managerUnavailable = catalog.degraded;
    fallbackSource = catalog.fallbackSource;
    fallbackReason = catalog.fallbackReason;
    refreshScheduled = Boolean(catalog.refreshScheduled);
    warnings = catalog.warnings;
  } catch (error) {
    return bridgeErrorResponse(error);
  }

  const envelope = extractPayload(payload);
  const rawSymbols: unknown[] = Array.isArray(envelope.symbols) ? envelope.symbols : [];

  // Normalize and filter to active, quote-capable symbols while keeping raw path for group scoping.
  const activeSymbolEntries = rawSymbols
    .map((raw) => {
      const normalized = normalizeRawSymbol(raw);
      if (!normalized) return null;
      if (!isActive(normalized, (isRecord(raw) ? raw : {}) as RawSymbol)) return null;
      return {
        symbol: normalized,
        path: toStr((isRecord(raw) ? raw.path : undefined)),
      };
    })
    .filter((entry): entry is { symbol: SymbolInfo; path: string } => entry !== null);

  // Optional group filter: use the path field to match MT5 group prefix
  const groupFiltered = groupFilter
    ? activeSymbolEntries.filter((entry) => {
        return entry.path
          ? entry.path.toLowerCase().startsWith(groupFilter.toLowerCase())
          : true; // keep if no path info
      })
    : activeSymbolEntries;

  // Apply terminal display normalization (category inference, deduplication by base)
  const displaySymbols = getTerminalDisplaySymbols(groupFiltered.map((entry) => entry.symbol));

  // Optional category filter
  const categoryFiltered = categoryFilter
    ? displaySymbols.filter((s) => s.category === categoryFilter)
    : displaySymbols;

  const byCategory = buildByCategory(categoryFiltered);

  return NextResponse.json({
    ok: true,
    accountId,
    group: groupFilter,
    category: categoryFilter,
    symbols: categoryFiltered,
    byCategory,
    total: categoryFiltered.length,
    catalogStatus: toStr(envelope.symbolCatalogStatus, 'unknown'),
    degraded: degraded || toBool(envelope.degraded),
    managerUnavailable:
      managerUnavailable || toBool(envelope.managerUnavailable),
    ...(fallbackSource ? { fallbackSource } : {}),
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(refreshScheduled ? { refreshScheduled } : {}),
    ...(warnings ? { warnings } : {}),
  });
}
