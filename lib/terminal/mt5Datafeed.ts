import { isContinuityBar, ohlcService } from './ohlcWebSocketService';
import { useWebtraderStore, type WebtraderState } from '@/store/webtrader-store';
import { shouldAllowSyntheticMarketData } from '@/lib/terminal/synthetic-data';
import { getSymbolAliases, symbolsMatch } from '@/lib/market-symbols';
import { GLOBAL_CHART_VIEWPORT } from '@/lib/terminal/chart-visual-config';


/**
 * Retrieve the current stable OHLC data identity from the webtrader store.
 */
function getOhlcSessionScopeIdFromStore(): string | null {
    try {
        const state = useWebtraderStore.getState();
        const storedScopeId = state.ohlcSessionScopeId?.trim();
        if (storedScopeId) return storedScopeId;
    } catch {
        // ignore parse errors
    }

    return null;
}

function hasLiveBackendSession(): boolean {
    try {
        const state = useWebtraderStore.getState();
        return Boolean(
            state.session?.id?.trim() ||
            (state.wsClient?.isConnected && state.wsClient.isAuthenticated),
        );
    } catch {
        return false;
    }
}

function resolveBrokerSymbolName(symbolName: string): string {
    const trimmed = symbolName.trim();
    if (!trimmed) {
        return trimmed;
    }

    const brokerSymbols = useWebtraderStore.getState().symbols ?? [];
    return (
        brokerSymbols.find((symbol) => symbol.name === trimmed)?.name ??
        brokerSymbols.find((symbol) => symbolsMatch(symbol.name, trimmed))?.name ??
        trimmed
    );
}

function getDatafeedSymbolName(symbolInfo: any): string {
    const rawSymbol =
        typeof symbolInfo?.ticker === 'string' && symbolInfo.ticker.trim()
            ? symbolInfo.ticker
            : typeof symbolInfo?.name === 'string'
                ? symbolInfo.name
                : '';

    return resolveBrokerSymbolName(rawSymbol);
}

export async function fetchMt5Session(): Promise<string> {
    const sessionScopeId = getOhlcSessionScopeIdFromStore();

    try {
        if (!sessionScopeId) {
            if (shouldAllowSyntheticMarketData() && !hasLiveBackendSession()) {
                ohlcService.ensureLocalSimulation();
                return 'local-sim';
            }

            throw new Error('No live MT5 OHLC session is connected.');
        }

        ohlcService.connect(sessionScopeId);
        return sessionScopeId;
    } catch (e) {
        if (!hasLiveBackendSession() && shouldAllowSyntheticMarketData()) {
            console.warn('Failed to connect MT5 OHLC session, using local simulation instead.', e);
            ohlcService.ensureLocalSimulation();
            return 'local-sim';
        }

        throw e;
    }
}

// Keep track of TV unsubscribe callbacks
const activeSubscriptions = new Map<string, () => void>();

// Track first-paint requests that returned empty because the feed wasn't ready yet.
// subscribeBars watches for connection and triggers a cache reset so getBars re-fires.
const pendingFirstPaintRetries = new Map<string, () => void>();

const configurationData = {
    supported_resolutions: ['1', '5', '15', '30', '60', 'D', 'W', 'M'],
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
};

const DATAFEED_HISTORY_TIMEOUT_MS = 25_000;
const DATAFEED_HISTORY_RETRY_ATTEMPTS = 2;
const DATAFEED_HISTORY_LIMIT = 5000;
const DATAFEED_SCROLLBACK_HISTORY_LIMIT = DATAFEED_HISTORY_LIMIT;
const DATAFEED_FIRST_PAINT_HISTORY_LIMIT = GLOBAL_CHART_VIEWPORT.maxInitialVisibleBars;
const UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD = 10_000_000_000;

type DatafeedBar = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    source?: string;
    derived?: boolean;
    continuity?: boolean;
    isContinuity?: boolean;
    basis?: string;
    cached?: boolean;
    synthetic?: boolean;
    sourceTimeMs?: number;
};

type CoherentHistoryOptions = {
  trimTrailingContinuityTail?: boolean;
};

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLiveServerUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /no_live_server|no live|quote server|ohlc.*unavailable|market data.*unavailable|backend unavailable/i.test(message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);

        promise.then(
            (value) => {
                clearTimeout(timeout);
                resolve(value);
            },
            (error) => {
                clearTimeout(timeout);
                reject(error);
            },
        );
    });
}

function getHistoryLimitForRequest(periodParams: any): number {
    const isFirstDataRequest = Boolean(periodParams?.firstDataRequest);

    if (!isFirstDataRequest) {
        return DATAFEED_SCROLLBACK_HISTORY_LIMIT;
    }

    return DATAFEED_FIRST_PAINT_HISTORY_LIMIT;
}

function getHistoryRangeForRequest(
    periodParams: any,
    fromUnixMs?: number,
    toUnixMs?: number,
): {
    fromUnixMs?: number;
    toUnixMs?: number;
    beforeUnixMs?: number;
    cacheFirst: boolean;
    cacheOnly: boolean;
} {
    const isFirstDataRequest = Boolean(periodParams?.firstDataRequest);

    if (isFirstDataRequest) {
        return { cacheFirst: true, cacheOnly: false };
    }

    if (toUnixMs !== undefined) {
        return { beforeUnixMs: toUnixMs, cacheFirst: true, cacheOnly: false };
    }

    return { fromUnixMs, toUnixMs, cacheFirst: true, cacheOnly: false };
}

function getResolutionMinutes(resolution: string): number {
    const parsed = parseInt(resolution);
    if (!isNaN(parsed)) {
        return parsed;
    }

    if (resolution === 'D' || resolution === '1D') return 1440;
    if (resolution === 'W' || resolution === '1W') return 10080;
    return 1;
}

function normalizeUnixMs(value: unknown): number | null {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }

    return Math.trunc(
        numeric < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD
            ? numeric * 1000
            : numeric,
    );
}

function normalizeHistoryBar(rawBar: any, resolutionMinutes: number): DatafeedBar | null {
    const rawTime = normalizeUnixMs(
        rawBar?.openTimeMs ??
        rawBar?.open_time_ms ??
        rawBar?.time ??
        rawBar?.timeMs ??
        rawBar?.time_msc,
    );
    const intervalMs = resolutionMinutes * 60 * 1000;
    const time = rawTime && intervalMs > 0
        ? Math.floor(rawTime / intervalMs) * intervalMs
        : rawTime;
    const open = Number(rawBar?.open);
    const high = Number(rawBar?.high);
    const low = Number(rawBar?.low);
    const close = Number(rawBar?.close);
    const volume = Number(rawBar?.volume);

    if (
        !time ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0
    ) {
        return null;
    }

    return {
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volume) && volume > 0 ? volume : 0,
        sourceTimeMs: rawBar?.sourceTimeMs ?? rawTime,
        ...(typeof rawBar?.source === 'string' && rawBar.source.trim()
            ? { source: rawBar.source.trim() }
            : {}),
        ...(rawBar?.derived === true ? { derived: true } : {}),
        ...(rawBar?.continuity === true ? { continuity: true } : {}),
        ...(rawBar?.isContinuity === true ? { isContinuity: true } : {}),
        ...(rawBar?.synthetic === true ? { synthetic: true } : {}),
        ...(typeof rawBar?.basis === 'string' && rawBar.basis.trim()
            ? { basis: rawBar.basis.trim() }
            : {}),
        ...(rawBar?.cached === true ? { cached: true } : {}),
    };
}

function isContinuityHistoryBar(bar: DatafeedBar | null | undefined): boolean {
    return isContinuityBar(bar as Parameters<typeof isContinuityBar>[0]);
}

function preferHistoryBarForBucket(
    existing: DatafeedBar | undefined,
    incoming: DatafeedBar,
): DatafeedBar {
    if (!existing) {
        return incoming;
    }

    const existingIsContinuity = isContinuityHistoryBar(existing);
    const incomingIsContinuity = isContinuityHistoryBar(incoming);
    if (existingIsContinuity !== incomingIsContinuity) {
        return existingIsContinuity ? incoming : existing;
    }

    if (existingIsContinuity && incomingIsContinuity) {
        return incoming;
    }

    const existingSourceTime = Number.isFinite(existing.sourceTimeMs)
        ? Number(existing.sourceTimeMs)
        : existing.time;
    const incomingSourceTime = Number.isFinite(incoming.sourceTimeMs)
        ? Number(incoming.sourceTimeMs)
        : incoming.time;
    const incomingIsLater = incomingSourceTime >= existingSourceTime;
    const first = incomingIsLater ? existing : incoming;
    const last = incomingIsLater ? incoming : existing;

    return {
        ...last,
        time: existing.time,
        open: first.open,
        high: Math.max(existing.high, incoming.high, first.open, last.close),
        low: Math.min(existing.low, incoming.low, first.open, last.close),
        close: last.close,
        volume: Math.max(0, existing.volume) + Math.max(0, incoming.volume),
        sourceTimeMs: last.sourceTimeMs ?? last.time,
        derived: undefined,
        continuity: undefined,
        isContinuity: undefined,
        basis: undefined,
        synthetic: undefined,
        cached: existing.cached === true && incoming.cached === true ? true : undefined,
    };
}

function normalizeHistoryBars(rawBars: any[], resolutionMinutes: number): DatafeedBar[] {
    const byTime = new Map<number, DatafeedBar>();

    for (const rawBar of rawBars) {
        const bar = normalizeHistoryBar(rawBar, resolutionMinutes);
        if (bar) {
            byTime.set(bar.time, preferHistoryBarForBucket(byTime.get(bar.time), bar));
        }
    }

    return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function trimTrailingContinuityTail(bars: DatafeedBar[]): DatafeedBar[] {
    const lastRealIndex = (() => {
        for (let index = bars.length - 1; index >= 0; index -= 1) {
            if (!isContinuityHistoryBar(bars[index])) {
                return index;
            }
        }

        return -1;
    })();

    if (lastRealIndex < 0 || lastRealIndex === bars.length - 1) {
        return bars;
    }

    const trailingBars = bars.slice(lastRealIndex + 1);
    const hasOnlyFlatZeroVolumeContinuity = trailingBars.every((bar) => (
        isContinuityHistoryBar(bar) &&
        bar.volume === 0 &&
        bar.open === bar.high &&
        bar.high === bar.low &&
        bar.low === bar.close
    ));

    return hasOnlyFlatZeroVolumeContinuity
        ? bars.slice(0, lastRealIndex + 1)
        : bars;
}

function getLatestCoherentHistoryBlock(
    bars: DatafeedBar[],
    resolutionMinutes: number,
    limit: number,
    options: CoherentHistoryOptions = {},
): DatafeedBar[] {
    const sourceBars = options.trimTrailingContinuityTail
        ? trimTrailingContinuityTail(bars)
        : bars;
    void resolutionMinutes;
    // Keep continuity bars; they fill chart gaps and must be delivered to the chart datafeed.
    // Filtering them out creates visible gaps on the chart between real data segments.
    return sourceBars.slice(-limit);
}

function historyFeedMayBeNotReady(symbol: string, timeframeMinutes: number): boolean {
    const metadata = ohlcService.getHistoryMetadata(symbol, timeframeMinutes);
    const metadataStatusText = [
        metadata?.status,
        metadata?.message,
        metadata?.source,
        metadata?.event,
        metadata?.metadata?.status,
        metadata?.metadata?.message,
        metadata?.metadata?.source,
    ].filter(Boolean).join(' ');
    if (
        metadata?.managerFetchDeferred === true ||
        metadata?.managerFetchPending === true ||
        metadata?.shouldReload === true ||
        /defer|pending|queued|loading|not[_\s-]?ready|reconnect|disconnect|timeout|unavailable|stale/i.test(metadataStatusText)
    ) {
        return true;
    }

    try {
        const state = useWebtraderStore.getState();
        const preferredClient = state.ohlcWsClient ?? state.wsClient;
        return (
            state.connectionStatus !== 'connected' ||
            preferredClient?.isConnected !== true ||
            preferredClient?.isAuthenticated !== true
        );
    } catch {
        return true;
    }
}

function filterBarsToRange(
    bars: DatafeedBar[],
    fromUnixMs?: number,
    toUnixMs?: number,
): DatafeedBar[] {
    return bars.filter((bar) => (
        (fromUnixMs === undefined || bar.time >= fromUnixMs) &&
        (toUnixMs === undefined || bar.time <= toUnixMs)
    ));
}

function getBarsForHistoryResponse(
    bars: DatafeedBar[],
    periodParams: any,
    resolutionMinutes: number,
    limit: number,
    fromUnixMs?: number,
    toUnixMs?: number,
    options: CoherentHistoryOptions = {},
): DatafeedBar[] {
    if (Boolean(periodParams?.firstDataRequest)) {
        return getLatestCoherentHistoryBlock(bars, resolutionMinutes, limit, options);
    }

    if (toUnixMs !== undefined) {
        return bars.filter((bar) => bar.time <= toUnixMs);
    }

    return filterBarsToRange(bars, fromUnixMs, toUnixMs);
}

/**
 * Generate synthetic seed candles based on a realistic starting price.
 * This ensures the chart datafeed can render a visible chart even before
 * the MT5 backend sends live OHLC data.
 *
 * Strategy: Walk backwards from `to` timestamp, creating realistic
 * OHLCV bars with small random price movements.
 */
function generateSeedBars(
    basePrice: number,
    from: number,   // seconds
    to: number,     // seconds
    resolutionMinutes: number
): DatafeedBar[] {
    const bars: DatafeedBar[] = [];
    const intervalMs = resolutionMinutes * 60 * 1000;
    const fromMs = from * 1000;
    const toMs = to * 1000;

    // Max 500 bars to prevent performance issues
    const maxBars = 500;
    const rangeMs = toMs - fromMs;
    const totalBars = Math.min(Math.floor(rangeMs / intervalMs), maxBars);

    if (totalBars <= 0) return [];

    // Adjust start so we generate bars ending at `to`
    const startMs = toMs - totalBars * intervalMs;

    // Volatility scale by timeframe
    const volatilityPct = resolutionMinutes <= 1 ? 0.0003
        : resolutionMinutes <= 5 ? 0.0006
        : resolutionMinutes <= 60 ? 0.001
        : 0.003;

    let price = basePrice;

    for (let i = 0; i < totalBars; i++) {
        const time = startMs + i * intervalMs;
        const vol = price * volatilityPct;

        // Random walk with slight mean-reversion to basePrice
        const drift = (basePrice - price) * 0.005;
        const open = price;
        const change = (Math.random() - 0.49) * vol * 2 + drift;
        const close = Math.max(open * 0.97, Math.min(open * 1.03, open + change));

        const high = Math.max(open, close) + Math.random() * vol * 0.5;
        const low = Math.min(open, close) - Math.random() * vol * 0.5;
        const volume = Math.floor(Math.random() * 900 + 100);

        bars.push({
            time,
            open: parseFloat(open.toFixed(5)),
            high: parseFloat(high.toFixed(5)),
            low: parseFloat(low.toFixed(5)),
            close: parseFloat(close.toFixed(5)),
            volume,
            source: 'synthetic_seed',
            derived: true,
            continuity: true,
            isContinuity: true,
            synthetic: true,
            basis: 'synthetic_seed',
            sourceTimeMs: time,
        });

        price = close;
    }

    return bars;
}

// Cache the last known price per symbol for seed generation
const lastKnownPrice: Record<string, number> = {};

function rememberLastKnownPrice(symbol: string, price: number) {
    if (!Number.isFinite(price) || price <= 0) {
        return;
    }

    lastKnownPrice[symbol] = price;
    for (const alias of getSymbolAliases(symbol)) {
        lastKnownPrice[alias] = price;
    }
}

const mt5Datafeed = {
    onReady: (callback: (config: any) => void) => {
        console.log('[datafeed] onReady called');
        setTimeout(() => callback(configurationData), 0);
    },

    getServerTime: (callback: (serverTime: number) => void) => {
        // Use MT5 server time from three sources in priority order:
        // 1. Store mt5ServerTimeMs — updated from live ticks AND heartbeat pong messages
        // 2. OHLC service latest tick timestamp — updated from bar data
        // 3. Date.now() — only if no MT5 time known yet (pre-connect)
        const storeMt5Ms = (() => {
            try { return useWebtraderStore.getState().mt5ServerTimeMs; } catch { return 0; }
        })();
        const ohlcMt5Ms = ohlcService.getLatestKnownMt5TimestampMs();
        const bestMs = Math.max(storeMt5Ms, ohlcMt5Ms);
        callback(Math.floor((bestMs > 0 ? bestMs : Date.now()) / 1000));
    },

    searchSymbols: async (_userInput: string, _exchange: string, _symbolType: string, onResultReadyCallback: (result: any[]) => void) => {
        onResultReadyCallback([]);
    },

    resolveSymbol: async (
        symbolName: string,
        onSymbolResolvedCallback: (info: any) => void,
        _onResolveErrorCallback: (err: string) => void
    ) => {
        const brokerSymbolName = resolveBrokerSymbolName(symbolName);
        const brokerSymbolInfo = useWebtraderStore
            .getState()
            .symbols
            .find((symbol) => symbol.name === brokerSymbolName);

        console.log('[datafeed] resolveSymbol', symbolName, '->', brokerSymbolName);

        // Determine price scale based on symbol type
        const upperSymbol = brokerSymbolName.toUpperCase();
        const isJPY = upperSymbol.includes('JPY');
        const isXAU = upperSymbol.includes('XAU') || upperSymbol.includes('GOLD');
        const isBTC = upperSymbol.includes('BTC');
        const isIndex = upperSymbol.includes('US30') || upperSymbol.includes('NAS') || upperSymbol.includes('SPX');

        let pricescale = 100000; // default 5 decimal places (forex)
        if (typeof brokerSymbolInfo?.digits === 'number' && brokerSymbolInfo.digits >= 0) {
            pricescale = Math.pow(10, brokerSymbolInfo.digits);
        }
        if (isJPY) pricescale = 1000;
        if (isXAU) pricescale = 100;
        if (isBTC) pricescale = 10;
        if (isIndex) pricescale = 100;

        const symbolInfo = {
            ticker: brokerSymbolName,
            name: brokerSymbolName,
            description: brokerSymbolInfo?.description || brokerSymbolName,
            type: 'forex',
            session: '24x7',
            timezone: 'Etc/UTC',
            exchange: 'MT5 Broker',
            minmov: 1,
            pricescale,
            has_intraday: true,
            has_no_volume: false,
            has_weekly_and_monthly: true,
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: 2,
            data_status: 'streaming',
        };
        setTimeout(() => onSymbolResolvedCallback(symbolInfo), 0);
    },

    getBars: async (
        symbolInfo: any,
        resolution: string,
        periodParams: any,
        onHistoryCallback: (bars: any[], params: any) => void,
        _onErrorCallback: (err: string) => void
    ) => {
        // First paint must be cache-first and auth-light: local/cache OHLC can be
        // returned immediately while terminal-session bootstrap continues in the
        // background. Awaiting auth here turns every session hiccup into a blank chart.
        fetchMt5Session().catch(() => null);

        const { from, to } = periodParams;
        const requestSymbol = getDatafeedSymbolName(symbolInfo);
        const historyLimit = getHistoryLimitForRequest(periodParams);
        const isFirstDataRequest = Boolean(periodParams?.firstDataRequest);
        console.log(`[datafeed] getBars: ${requestSymbol} / res: ${resolution} / from: ${from} to: ${to} / limit: ${historyLimit} / first: ${isFirstDataRequest}`);
        const fromUnixMs = Number.isFinite(Number(from))
            ? Math.trunc(Number(from) * 1000)
            : undefined;
        const toUnixMs = Number.isFinite(Number(to))
            ? Math.trunc(Number(to) * 1000)
            : undefined;

        const minutes = getResolutionMinutes(resolution);

        try {
            // Try live backend first (with retries)
            const fetchHistory = async (): Promise<any[]> => {
                let lastError: unknown;

                for (let attempt = 0; attempt < DATAFEED_HISTORY_RETRY_ATTEMPTS; attempt += 1) {
                    try {
                        return await withTimeout(
                            ohlcService.getHistory(
                                requestSymbol,
                                minutes,
                                historyLimit,
                                getHistoryRangeForRequest(periodParams, fromUnixMs, toUnixMs),
                            ),
                            DATAFEED_HISTORY_TIMEOUT_MS,
                            'Timed out waiting for MT5 candle history.',
                        );
                    } catch (error) {
                        lastError = error;
                        if (isLiveServerUnavailableError(error)) {
                            break;
                        }
                        if (attempt + 1 < DATAFEED_HISTORY_RETRY_ATTEMPTS) {
                            await delay(800);
                        }
                    }
                }

                throw lastError instanceof Error
                    ? lastError
                    : new Error('OHLC history is unavailable.');
            };

            let bars: any[] = [];
            try {
                const rawBars = await fetchHistory();
                const normalizedBars = normalizeHistoryBars(rawBars, minutes);
                bars = getBarsForHistoryResponse(
                    normalizedBars,
                    periodParams,
                    minutes,
                    historyLimit,
                    fromUnixMs,
                    toUnixMs,
                    {
                        // Never trim continuity tails on first paint — they fill the chart while
                        // real history is still loading. Trimming them causes a blank left side on open.
                        trimTrailingContinuityTail: !isFirstDataRequest && historyFeedMayBeNotReady(requestSymbol, minutes),
                    },
                );
            } catch {
                // Backend timed out or is unavailable
                bars = [];
            }

            if (bars.length > 0) {
                // Track last price for future fallbacks
                rememberLastKnownPrice(requestSymbol, bars[bars.length - 1].close);
                onHistoryCallback(bars, { noData: false });
            } else {
                // Only generate synthetic seed bars when explicitly opted in via env flag.
                // Showing fake candles without the flag misleads traders and masked real
                // history fetch failures in production.
                if (!shouldAllowSyntheticMarketData()) {
                    // If this is first paint and the feed wasn't ready, register for a retry
                    // so subscribeBars can reset the chart once the connection comes up.
                    if (isFirstDataRequest && historyFeedMayBeNotReady(requestSymbol, minutes)) {
                        pendingFirstPaintRetries.set(`${requestSymbol}:${resolution}`, () => {});
                    }
                    onHistoryCallback([], { noData: true });
                    return;
                }

                // ── Fallback: Generate synthetic seed candles ──
                // Use last known price, or a reasonable default by symbol
                let seedPrice = lastKnownPrice[requestSymbol];
                if (!seedPrice) {
                    const sym = requestSymbol.toUpperCase();
                    if (sym.includes('XAU') || sym.includes('GOLD')) seedPrice = 2320;
                    else if (sym.includes('BTC')) seedPrice = 60000;
                    else if (sym.includes('JPY')) seedPrice = 155.5;
                    else if (sym.includes('GBP')) seedPrice = 1.27;
                    else if (sym.includes('EUR')) seedPrice = 1.085;
                    else if (sym.includes('NAS') || sym.includes('US100')) seedPrice = 20000;
                    else if (sym.includes('US30') || sym.includes('DOW')) seedPrice = 43000;
                    else seedPrice = 1.1;
                }

                const seedBars = generateSeedBars(seedPrice, from, to, minutes);
                if (seedBars.length > 0) {
                    console.log(`[datafeed] Using ${seedBars.length} synthetic seed bars for ${requestSymbol}`);
                    onHistoryCallback(seedBars, { noData: false });
                } else {
                    onHistoryCallback([], { noData: true });
                }
            }
        } catch (error: any) {
            console.error('[datafeed] getBars Error:', error);
            onHistoryCallback([], { noData: true });
        }
    },

    subscribeBars: (
        symbolInfo: any,
        resolution: string,
        onRealtimeCallback: (bar: any) => void,
        subscriberUID: string,
        _onResetCacheNeededCallback: () => void
    ) => {
        const requestSymbol = getDatafeedSymbolName(symbolInfo);

        if (activeSubscriptions.has(subscriberUID)) {
            const unsub = activeSubscriptions.get(subscriberUID);
            if (unsub) unsub();
        }

        const minutes = getResolutionMinutes(resolution);

        // Ensure session is live so the subscription can reach the backend.
        fetchMt5Session().catch(() => null);

        const unsubscribe = ohlcService.subscribe(requestSymbol, minutes, (symbol, timeframe, bar) => {
            try {
                const normalizedBar = normalizeHistoryBar(bar, timeframe);
                // For live bars: skip continuity/synthetic fillers — only push real ticks.
                if (!normalizedBar || isContinuityHistoryBar(normalizedBar)) {
                    return;
                }

                rememberLastKnownPrice(symbol, normalizedBar.close);
                onRealtimeCallback(normalizedBar);
            } catch (e) {
                // The chart may be disposed or in an invalid state; swallow to keep subscription alive.
                console.warn('[datafeed] subscribeBars callback error:', e);
            }
        });

        activeSubscriptions.set(subscriberUID, unsubscribe);

        // If first paint returned empty because the feed wasn't ready, watch for the
        // connection to become live and reset the chart cache so getBars re-fires.
        const retryKey = `${requestSymbol}:${resolution}`;
        if (pendingFirstPaintRetries.has(retryKey)) {
            pendingFirstPaintRetries.delete(retryKey);
            let resetCalled = false;

            const triggerResetIfReady = (state: WebtraderState) => {
                if (resetCalled) return false;
                const client = state.ohlcWsClient ?? state.wsClient;
                if (
                    state.connectionStatus === 'connected' &&
                    client?.isConnected === true &&
                    client?.isAuthenticated === true
                ) {
                    resetCalled = true;
                    return true;
                }
                return false;
            };

            const unsubscribeStoreWatcher = useWebtraderStore.subscribe((state) => {
                if (triggerResetIfReady(state)) {
                    unsubscribeStoreWatcher();
                    _onResetCacheNeededCallback();
                }
            });

            // Also check the current state immediately — by the time subscribeBars runs
            // the connection may already be up (Zustand subscribe only fires on changes).
            if (triggerResetIfReady(useWebtraderStore.getState())) {
                unsubscribeStoreWatcher();
                _onResetCacheNeededCallback();
            }

            // Wrap existing unsub so the store watcher is cleaned up on unsubscribeBars too.
            activeSubscriptions.set(subscriberUID, () => {
                unsubscribe();
                if (!resetCalled) {
                    resetCalled = true;
                    unsubscribeStoreWatcher();
                }
            });
        }
    },

    unsubscribeBars: (subscriberUID: string) => {
        const unsub = activeSubscriptions.get(subscriberUID);
        if (unsub) {
            unsub();
            activeSubscriptions.delete(subscriberUID);
        }
    },
};

export default mt5Datafeed;

/**
 * Pre-warm the OHLC history cache for a symbol + timeframe set.
 * Call this when the user switches symbols so data is ready before
 * the chart requests bars.
 */
export async function prefetchSymbol(
    symbol: string,
    resolutionMinutes: number[],
): Promise<void> {
    fetchMt5Session().catch(() => null);

    const prefetchLimit = DATAFEED_FIRST_PAINT_HISTORY_LIMIT;

    await Promise.allSettled(
        resolutionMinutes.map((minutes) =>
            ohlcService.getHistory(symbol, minutes, prefetchLimit, {
                cacheFirst: true,
                cacheOnly: false,
            }),
        ),
    );
}

export const __mt5DatafeedTestHooks = {
    DATAFEED_HISTORY_LIMIT,
    DATAFEED_FIRST_PAINT_HISTORY_LIMIT,
    DATAFEED_SCROLLBACK_HISTORY_LIMIT,
    getBarsForHistoryResponse,
    getHistoryLimitForRequest,
    getHistoryRangeForRequest,
    getLatestCoherentHistoryBlock,
    getResolutionMinutes,
    normalizeHistoryBar,
    normalizeHistoryBars,
    trimTrailingContinuityTail,
};
