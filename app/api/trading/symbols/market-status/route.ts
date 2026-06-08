/**
 * GET /api/trading/symbols/market-status
 *
 * Returns ALL symbols from the MT5 symbol catalog cache, including disabled ones,
 * with their live tradeMode so you can see which markets are open or closed.
 *
 * Query params:
 *   accountId  — MT5 account used to open the terminal WS session (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { TerminalBridgeError, requireTradingAccountId } from '@/lib/server/terminal-ws-bridge';
import { requestSymbolCatalogWithFallback } from '../fallback';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Types ──────────────────────────────────────────────────────────────────

export type MarketTradeMode = 'full' | 'longonly' | 'shortonly' | 'closeonly' | 'disabled';

export interface MarketSymbolStatus {
    symbol: string;
    description: string;
    category: string;
    tradeMode: MarketTradeMode;
    isOpen: boolean;
    isClosing: boolean;
    isClosed: boolean;
}

export interface MarketStatusResponse {
    ok: true;
    accountId: string;
    checkedAt: string;
    total: number;
    openCount: number;
    closingCount: number;
    closedCount: number;
    symbols: MarketSymbolStatus[];
    degraded: boolean;
    fallbackSource?: string;
    fallbackReason?: string;
    refreshScheduled?: boolean;
    warnings?: string[];
    _debug?: unknown;
}

export interface MarketStatusErrorResponse {
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

const normalizeTradeMode = (raw: unknown): MarketTradeMode => {
    const s = toStr(raw, '').toLowerCase();
    if (s === 'full') return 'full';
    if (s === 'longonly') return 'longonly';
    if (s === 'shortonly') return 'shortonly';
    if (s === 'closeonly') return 'closeonly';
    if (s === 'disabled') return 'disabled';
    // If empty/missing, default to 'full' (assume open unless told otherwise)
    return s === '' ? 'full' : 'disabled';
};

const firstPathSegment = (path: string): string => {
    const sep = path.search(/[\\/]/);
    return sep === -1 ? path : path.slice(0, sep);
};

/**
 * Deeply unwrap the WS bridge payload.
 * The Rust gateway returns:  { event:"symbol_list", requestId:"...", payload:{ symbols:[...] } }
 * requestTerminalAction extracts: envelope.data ?? envelope.payload
 * So we receive:  { symbols: [...] }  OR  { data: { symbols: [...] } }
 */
const extractSymbolsArray = (payload: unknown): unknown[] => {
    if (!isRecord(payload)) return [];

    // Direct symbols array (most common — payload is already { symbols: [...] })
    if (Array.isArray(payload.symbols)) return payload.symbols;

    // Nested under data
    if (isRecord(payload.data)) {
        const d = payload.data as Record<string, unknown>;
        if (Array.isArray(d.symbols)) return d.symbols;
    }

    // Nested under payload (double-wrapping edge case)
    if (isRecord(payload.payload)) {
        const p = payload.payload as Record<string, unknown>;
        if (Array.isArray(p.symbols)) return p.symbols;
    }

    return [];
};

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
): Promise<NextResponse<MarketStatusResponse | MarketStatusErrorResponse>> {
    let accountId: string;
    try {
        accountId = requireTradingAccountId(request);
    } catch (error) {
        if (error instanceof TerminalBridgeError) {
            return NextResponse.json(
                { ok: false, error: error.message, code: error.code },
                { status: error.status },
            );
        }
        return NextResponse.json({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' }, { status: 500 });
    }

    let payload: unknown;
    let degraded = false;
    let fallbackSource: string | undefined;
    let fallbackReason: string | undefined;
    let refreshScheduled = false;
    let warnings: string[] | undefined;
    try {
        const catalog = await requestSymbolCatalogWithFallback(request, accountId);
        payload = catalog.payload;
        degraded = catalog.degraded;
        fallbackSource = catalog.fallbackSource;
        fallbackReason = catalog.fallbackReason;
        refreshScheduled = Boolean(catalog.refreshScheduled);
        warnings = catalog.warnings;
    } catch (error) {
        if (error instanceof TerminalBridgeError) {
            return NextResponse.json(
                { ok: false, error: error.message, code: error.code, details: error.details },
                { status: error.status },
            );
        }
        return NextResponse.json({ ok: false, error: 'Failed to fetch symbols from MT5', code: 'MT5_ERROR' }, { status: 502 });
    }

    const rawSymbols = extractSymbolsArray(payload);

    const symbols: MarketSymbolStatus[] = rawSymbols
        .filter(isRecord)
        .map((raw) => {
            // C++ symbolToStorageJson stores key "symbol" (not "name")
            const name = toStr(raw.symbol) || toStr(raw.name);
            if (!name) return null;

            const path = toStr(raw.path);
            // category: explicit field OR first segment of MT5 path
            const category = toStr(raw.category) || firstPathSegment(path) || 'unknown';

            // tradeMode stored as camelCase "tradeMode" by C++ symbolToStorageJson (line 53)
            // Also accept snake_case as a fallback
            const tradeMode = normalizeTradeMode(raw.tradeMode ?? raw.trade_mode);

            return {
                symbol: name,
                description: toStr(raw.description, name),
                category: category.toLowerCase(),
                tradeMode,
                isOpen: tradeMode === 'full' || tradeMode === 'longonly' || tradeMode === 'shortonly',
                isClosing: tradeMode === 'closeonly',
                isClosed: tradeMode === 'disabled',
            } satisfies MarketSymbolStatus;
        })
        .filter((s): s is MarketSymbolStatus => s !== null)
        .sort((a, b) => {
            // Open first → closing → closed; alphabetical within each group
            const order = (s: MarketSymbolStatus) => s.isOpen ? 0 : s.isClosing ? 1 : 2;
            const orderDiff = order(a) - order(b);
            if (orderDiff !== 0) return orderDiff;
            return a.symbol.localeCompare(b.symbol);
        });

    const openCount = symbols.filter((s) => s.isOpen).length;
    const closingCount = symbols.filter((s) => s.isClosing).length;
    const closedCount = symbols.filter((s) => s.isClosed).length;

    // Expose debug info in non-production so you can diagnose envelope shape
    const isDev = process.env.NODE_ENV !== 'production';
    const debugInfo = isDev ? {
        rawPayloadKeys: isRecord(payload) ? Object.keys(payload as Record<string, unknown>) : typeof payload,
        rawSymbolCount: rawSymbols.length,
        firstRawSymbol: rawSymbols[0] ?? null,
    } : undefined;

    return NextResponse.json({
        ok: true,
        accountId,
        checkedAt: new Date().toISOString(),
        total: symbols.length,
        openCount,
        closingCount,
        closedCount,
        symbols,
        degraded,
        ...(fallbackSource ? { fallbackSource } : {}),
        ...(fallbackReason ? { fallbackReason } : {}),
        ...(refreshScheduled ? { refreshScheduled } : {}),
        ...(warnings ? { warnings } : {}),
        ...(isDev ? { _debug: debugInfo } : {}),
    });
}
