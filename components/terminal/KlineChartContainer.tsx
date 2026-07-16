'use client';

import React, { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    BarSeries,
    CandlestickSeries,
    ColorType,
    CrosshairMode,
    HistogramSeries,
    LineSeries,
    LineStyle,
    createChart,
    type HistogramData,
    type IChartApi,
    type IPriceLine,
    createSeriesMarkers,
    type ISeriesApi,
    type ISeriesMarkersPluginApi,
    type LineData,
    type SeriesMarker,
    type UTCTimestamp,
} from 'lightweight-charts';

import { fetchMt5Session } from '@/lib/terminal/mt5Datafeed';
import {
    createOhlcSanityReferenceTracker,
    getOhlcSymbolPriceDomain,
    isContinuityBar,
    ohlcService,
    type OHLCBar,
} from '@/lib/terminal/ohlcWebSocketService';
import { symbolsMatch } from '@/lib/market-symbols';
import type { OhlcHistoryResponseMetadata } from '@/lib/trading/websocket-client';
import {
    getLivePriceSnapshotBySymbol,
    seedOhlcClosePrice,
    subscribeToLivePriceBySymbol,
    usePriceBySymbol,
    useWebtraderStore,
} from '@/store/webtrader-store';
import { useChartSettingsStore } from '@/store/chart-settings-store';
import {
    DEFAULT_CHART_RESOLUTIONS,
    GLOBAL_CHART_PRICE_ONLY_SCALE_MARGINS,
    GLOBAL_CHART_SCALE_MARGINS,
    GLOBAL_CHART_VIEWPORT,
    createProgrammaticBarSpacingGuard,
    expandPriceRangeToMinVisibleRange,
    getGlobalChartVisualConfig,
    type ChartResolutionOption,
    type ChartType,
} from '@/lib/terminal/chart-visual-config';
import {
    COMPACT_SERIES_EPOCH_MS,
    COMPACT_SERIES_SLOT_SECONDS,
    buildCompactSeriesEntries,
    getCompactSeriesTime,
} from '@/lib/terminal/compact-series-time';
import {
    applyPriceToCandleSeries,
    getLiveQuoteEventTime,
    getLiveQuotePrice,
    getLiveQuoteVolumeIncrement,
} from '@/lib/terminal/live-candle-builder';
import {
    createLatestHistoryGapCatchUpInFlightGate,
    getLatestCoherentMarketWindow,
    getLatestCleanHistoryBaselineDecision,
    historyMetadataMarksUncleanBaseline,
    isLatestHistoryCatchUpReferenceBar,
    isLikelyHistoricalOhlcBar,
    isLiveBarSafeForLatestHistory,
    isLiveTickBar,
    isOpenLiveTickBar,
    isProvisionalPriceSeedBar,
    isRenderableCachedOrHistoricalBar,
} from '@/lib/terminal/chart-history-gap';
import { shouldAllowSyntheticMarketData } from '@/lib/terminal/synthetic-data';
import { isRealMarketBar, toVisualCandleData } from '@/lib/terminal/visual-candle-data';


interface KlineChartContainerProps {
    symbol: string;
    accountSessionScopeId?: string | null;
    symbolName?: string;
    basePrice?: number;
    preferredLiveAxisPrice?: number;
    theme?: 'Dark' | 'Light';
    chartType?: ChartType;
    pricePrecision?: number;
    headerActions?: React.ReactNode;
    positions?: Array<{
        id: string;
        symbol: string;
        type: 'buy' | 'sell';
        volume: number;
        openPrice: number;
        openTime?: string | number;
        openLabel?: string;
        profit?: number;
        sl?: number | null;
        slLabel?: string;
        tp?: number | null;
        tpLabel?: string;
        digits?: number;
        contractSize?: number;
    }>;
    onUpdatePosition?: (id: string, updates: Partial<{ sl: number | null; tp: number | null }>) => void;
    onClosePosition?: (id: string) => void;
    controlRef?: React.MutableRefObject<any>;
    onHistoryStatusChange?: (status: {
        symbol: string;
        timeframeMinutes: number;
        isLoading: boolean;
        hasCandles: boolean;
    }) => void;
    timeframeMinutes?: number;
    onTimeframeChange?: (timeframeMinutes: number) => void;
    chartBarSpacing?: number | null;
    onChartBarSpacingChange?: (barSpacing: number) => void;
    showTitle?: boolean;
}

type ResolutionOption = ChartResolutionOption;

interface AtomicChartSwitchSeed {
    streamKey: string;
    bars: OHLCBar[];
}

const RESOLUTIONS: ResolutionOption[] = DEFAULT_CHART_RESOLUTIONS;

const CHART_HISTORY_TARGET_BARS = 1000;
const MAX_RENDERED_OHLC_BARS = 1000;
const MAX_SCROLLBACK_RENDERED_OHLC_BARS = 1000;
const LIVE_CANDLE_ROLLOVER_POLL_MS = 1000;
const LIVE_CANDLE_ROLLOVER_MAX_SNAPSHOT_AGE_MS = 5 * 60 * 1000;
const LIVE_CANDLE_ROLLOVER_MAX_CATCHUP_BARS = 600;
const LIVE_QUOTE_FALLBACK_MAX_SINGLE_MOVE_RATIO = 0.012;
const LIVE_QUOTE_FALLBACK_MAX_STORED_EXTREME_RATIO = 0.015;
const MAX_INITIAL_VISIBLE_BARS = GLOBAL_CHART_VIEWPORT.initialVisibleBars;
const MIN_LATEST_VISIBLE_BARS = 50;
const INITIAL_CHART_FIRST_PAINT_BARS = GLOBAL_CHART_VIEWPORT.maxInitialVisibleBars;

function isTransientMt5SessionWarmupError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /No live MT5 OHLC session is connected|No live OHLC session is connected/i.test(message);
}

function handleMt5SessionWarmupError(error: unknown) {
    if (isTransientMt5SessionWarmupError(error)) {
        return;
    }

    console.error(error);
}
const INITIAL_CHART_HISTORY_LIMIT = INITIAL_CHART_FIRST_PAINT_BARS;
const INITIAL_CHART_RENDER_BARS = MAX_INITIAL_VISIBLE_BARS;
const LIVE_FIRST_SYMBOL_SWITCH_HISTORY_BARS = MAX_INITIAL_VISIBLE_BARS;
const PROVISIONAL_PREVIEW_DELAY_MS = 60; // was 150ms — show live bars faster while history loads
const STAGED_LATEST_HISTORY_WARMUP_LIMITS = [200, 500, 1000] as const;
const CHART_HISTORY_TIMEOUT_MS = 4_000; // was 8s — fail fast so provisional preview shows sooner
const BACKFILL_CHART_HISTORY_TIMEOUT_MS = 12_000; // was 20s
const BACKFILL_CHART_HISTORY_LIMIT = 200;
const BACKFILL_CHART_HISTORY_DELAY_MS = 200;
// 150 attempts: more retries so sparse/delayed MT5 history eventually fills in (can take ~15s for new timeframes)
const MAX_BACKGROUND_HISTORY_BACKFILL_ATTEMPTS = 200; // was 150 — more retries for slow MT5 history
const LEFT_EDGE_BACKFILL_THRESHOLD_BARS = 80;
const LATEST_PINNED_THRESHOLD_BARS = 8;
const OLDER_HISTORY_RETRY_COOLDOWN_MS = 1_000;
const TRANSIENT_HISTORY_RETRY_COOLDOWN_MS = 100; // was 200ms — poll readiness more frequently
const PROVISIONAL_PREVIEW_HISTORY_CATCH_UP_TOLERANCE_BUCKETS = 2;
const MOSTLY_CONTINUITY_RATIO = 0.7;
const SPARSE_HISTORY_DENSITY_RATIO = 0.25;
const MIN_EXPECTED_BUCKETS_FOR_SPARSE_RETRY = 120;
const PRICE_SCALE_MARGINS = GLOBAL_CHART_SCALE_MARGINS.price;
const PRICE_ONLY_SCALE_MARGINS = GLOBAL_CHART_PRICE_ONLY_SCALE_MARGINS;
const VOLUME_SCALE_MARGINS = GLOBAL_CHART_SCALE_MARGINS.volume;
const ZERO_VOLUME_FLOOR_RATIO = 0.025;
const ZERO_VOLUME_FALLBACK = 1;
const VOLUME_SPIKE_CAP_MEDIAN_MULTIPLIER = 12;
const VOLUME_SPIKE_CAP_P75_MULTIPLIER = 8;
const VOLUME_SPIKE_CAP_P90_MULTIPLIER = 4;
const RECENT_HISTORY_METADATA_WINDOW_MS = 60_000;
// Minimum real bars before we consider history "sufficient" (avoids spurious backfill retries)
const MIN_REAL_BARS_BEFORE_SUFFICIENT = 10;
const LIVE_HISTORY_CONTINUITY_TOLERANCE_BUCKETS = 1;
const LIVE_HISTORY_PRICE_CONTINUITY_RATIO = 0.2;
// Buckets of gap between the last rendered bar and an incoming live bar that
// indicates a backend restart / extended disconnect and triggers a gap-fill fetch.
const RECONNECT_GAP_DETECTION_THRESHOLD_BUCKETS = 5; // was 3 — avoid spurious gap-fills on brief WS drops
const LIVE_HISTORY_BASELINE_OPTIONS = {
    liveHistoryToleranceBuckets: LIVE_HISTORY_CONTINUITY_TOLERANCE_BUCKETS,
    maxLivePriceDeviationRatio: LIVE_HISTORY_PRICE_CONTINUITY_RATIO,
} as const;

type ChartPalette = ReturnType<typeof getGlobalChartVisualConfig>['colors'];

interface HistoryBarStats {
    totalBars: number;
    realBars: number;
    continuityBars: number;
    expectedBuckets: number;
    realDensity: number;
    latestRealTime: number | null;
}

interface HistoryRenderResult {
    stats: HistoryBarStats;
    renderedCandles: boolean;
    historySeedApplied: boolean;
}

type ChartPosition = NonNullable<KlineChartContainerProps['positions']>[number];
type PositionUpdate = Partial<{ sl: number | null; tp: number | null }>;
type PositionMarkerRole = 'open' | 'sl' | 'tp';
type PositionLineOverlay = {
    element: HTMLDivElement;
    price: number;
};
const PRICE_SCALE_CANDLE_GAP_PX = 16;
const PRICE_SCALE_BADGE_GAP_PX = 6;
const POSITION_BADGE_CONTAINER_BASE_STYLE =
    'position:absolute;top:50%;display:flex;align-items:center;gap:4px;pointer-events:auto;';
const RIGHT_ALIGNED_POSITION_BADGE_STYLE =
    `${POSITION_BADGE_CONTAINER_BASE_STYLE}right:8px;transform:translateY(-50%);`;
const CENTERED_POSITION_BADGE_STYLE =
    `${POSITION_BADGE_CONTAINER_BASE_STYLE}left:50%;max-width:calc(100% - 24px);transform:translate(-50%,-50%);`;
const OPEN_TRADE_LINE_COLOR = '#ffffff';
const TAKE_PROFIT_LINE_COLOR = '#22c55e';
const STOP_LOSS_LINE_COLOR = '#facc15';
type DataLayoutMode = 'focus-latest' | 'preserve-visible' | 'preserve-or-follow-latest';
type LogicalRangeSnapshot = { from: number; to: number };
type VisibleAnchorSnapshot = { realTime: number; logicalIndex: number };
type HistoryMetadataWindow = {
    metadata: OhlcHistoryResponseMetadata;
    observedAt: number;
};

function getChartRightOffsetWithPriceScaleGap(
    baseRightOffset: number,
    barSpacing: number,
    showPriceScale: boolean,
) {
    if (!showPriceScale || !Number.isFinite(barSpacing) || barSpacing <= 0) {
        return baseRightOffset;
    }

    return baseRightOffset + PRICE_SCALE_CANDLE_GAP_PX / barSpacing;
}

function getPriceScaleOverlayInset(priceScaleWidth: number) {
    const safePriceScaleWidth = Number.isFinite(priceScaleWidth) && priceScaleWidth > 0
        ? priceScaleWidth
        : 0;
    const gap = safePriceScaleWidth > 0 ? PRICE_SCALE_CANDLE_GAP_PX : 0;

    return {
        priceScaleWidth: safePriceScaleWidth,
        lineRight: safePriceScaleWidth + gap,
        badgeRight: safePriceScaleWidth + gap + PRICE_SCALE_BADGE_GAP_PX,
    };
}

function getHistoryLoadedLayoutMode(
    isBackfillRetry: boolean,
    isLateResult: boolean,
    historyHasRealBars: boolean,
    hasProvisionalLivePreview: boolean,
    currentRenderedBarCount: number,
): DataLayoutMode {
    if (historyHasRealBars && (hasProvisionalLivePreview || currentRenderedBarCount < MIN_LATEST_VISIBLE_BARS)) {
        return 'focus-latest';
    }

    return isBackfillRetry || isLateResult ? 'preserve-or-follow-latest' : 'focus-latest';
}

function toUnixSeconds(timeValue: unknown): UTCTimestamp {
    const normalizedMs = normalizeTimestampMs(timeValue);
    let ms: number;
    if (normalizedMs !== null) {
        ms = normalizedMs;
    } else {
        ms = Date.now();
    }

    return Math.floor(ms / 1000) as UTCTimestamp;
}

function normalizeTimestampMs(timeValue: unknown): number | null {
    if (typeof timeValue === 'number') {
        if (!Number.isFinite(timeValue) || timeValue <= 0) {
            return null;
        }

        return timeValue < 10_000_000_000 ? timeValue * 1000 : timeValue;
    }

    const parsed = Number(timeValue);
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
    }

    const dateValue = new Date(String(timeValue)).getTime();
    return Number.isNaN(dateValue) || dateValue <= 0 ? null : dateValue;
}

function normalizeOptionalHistoryUnixMs(value: unknown): number | undefined {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
    }

    if (typeof value === 'string') {
        const dateMs = new Date(value).getTime();
        if (Number.isFinite(dateMs) && dateMs >= 0) {
            return dateMs;
        }
    }

    return undefined;
}

function normalizeOptionalHistoryBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value !== 0;
    }

    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) {
            return true;
        }
        if (['false', '0', 'no', 'off'].includes(normalized)) {
            return false;
        }
    }

    return undefined;
}

function inferSeedPrice(symbol: string): number {
    const upper = symbol.toUpperCase();
    if (upper.includes('XAU') || upper.includes('GOLD')) return 2320;
    if (upper.includes('BTC')) return 60000;
    if (upper.includes('JPY')) return 155.5;
    if (upper.includes('GBP')) return 1.27;
    if (upper.includes('EUR')) return 1.085;
    if (upper.includes('NAS') || upper.includes('USTEC') || upper.includes('US100')) return 18500;
    if (upper.includes('US30') || upper.includes('DOW')) return 38000;
    if (upper.includes('OIL')) return 62.5;
    if (upper.includes('AAPL')) return 175;
    return 1.1;
}

function formatPrice(value: number, precision: number): string {
    return value.toFixed(precision);
}

function formatBarTime(timeMs: number, timeframeMinutes: number): string {
    const showDate = timeframeMinutes >= 1440;
    const formatter = new Intl.DateTimeFormat('en-US', showDate
        ? { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'UTC' }
        : { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

    return `${formatter.format(timeMs)} UTC`;
}

function formatAxisTime(timeMs: number, timeframeMinutes: number): string {
    const showDate = timeframeMinutes >= 1440;
    const formatter = new Intl.DateTimeFormat('en-US', showDate
        ? { month: 'short', day: '2-digit', timeZone: 'UTC' }
        : { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

    return formatter.format(timeMs);
}

function isLiveServerUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /no_live_server|no live|quote server|ohlc.*unavailable|market data.*unavailable|backend unavailable|websocket.*(disconnect|closed|error)|connection (lost|closed|error|interrupted)|transport closed|reconnecting|not authenticated|not connected|requires an authenticated websocket session|timed out waiting for websocket authentication/i.test(message);
}

function isTransientHistoryNotReadyError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return isLiveServerUnavailableError(error)
        || /auth.*not ready|session.*not ready|client.*not ready|no live ohlc session/i.test(message);
}

function isRealtimeOhlcClientReady(): boolean {
    const { ohlcWsClient, wsClient } = useWebtraderStore.getState();
    if (ohlcWsClient?.isConnected && ohlcWsClient.isAuthenticated && ohlcWsClient.supportsOhlcActions) {
        return true;
    }

    return Boolean(wsClient?.isConnected && wsClient.isAuthenticated && wsClient.supportsOhlcActions);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeout) {
            clearTimeout(timeout);
        }
    });
}

function toLineData(
    bar: OHLCBar,
    seriesTime: UTCTimestamp = toUnixSeconds(bar.time),
): LineData<UTCTimestamp> {
    return { time: seriesTime, value: bar.close };
}

function toVolumeData(
    bar: OHLCBar,
    palette: ChartPalette,
    seriesTime: UTCTimestamp = toUnixSeconds(bar.time),
    visualScaleMaxVolume = bar.volume,
): HistogramData<UTCTimestamp> {
    const rawVolume = Number.isFinite(bar.volume) && bar.volume > 0 ? bar.volume : 0;
    const effectiveVolume = rawVolume > 0
        ? (visualScaleMaxVolume > 0 ? Math.min(rawVolume, visualScaleMaxVolume) : rawVolume)
        : getZeroVolumeFloor(visualScaleMaxVolume);
    return {
        time: seriesTime,
        value: effectiveVolume,
        // Continuity/gap-fill bars render as muted grey volume to distinguish from real bars
        color: isContinuityBar(bar)
            ? 'rgba(120,123,134,0.20)'
            : effectiveVolume > 0
                ? (bar.close >= bar.open ? palette.volumeUp : palette.volumeDown)
                : 'rgba(120,123,134,0.20)',
    };
}

function getZeroVolumeFloor(visibleMaxVolume: number): number {
    return visibleMaxVolume > 0
        ? Math.max(visibleMaxVolume * ZERO_VOLUME_FLOOR_RATIO, ZERO_VOLUME_FALLBACK)
        : ZERO_VOLUME_FALLBACK;
}

function getSortedPositiveVolumes(volumes: number[]): number[] {
    return volumes
        .filter((volume) => Number.isFinite(volume) && volume > 0)
        .sort((left, right) => left - right);
}

function getVolumePercentile(sortedPositiveVolumes: number[], percentile: number): number {
    if (sortedPositiveVolumes.length === 0) {
        return 0;
    }

    const boundedPercentile = Math.min(1, Math.max(0, percentile));
    const index = Math.floor((sortedPositiveVolumes.length - 1) * boundedPercentile);
    return sortedPositiveVolumes[index] ?? 0;
}

function getVisualVolumeScaleMax(volumes: number[]): number {
    const sorted = getSortedPositiveVolumes(volumes);
    if (sorted.length === 0) {
        return 0;
    }

    const max = sorted[sorted.length - 1] ?? 0;
    const median = getVolumePercentile(sorted, 0.5);
    const p75 = getVolumePercentile(sorted, 0.75);
    const p90 = getVolumePercentile(sorted, 0.9);
    const robustCap = Math.max(
        ZERO_VOLUME_FALLBACK,
        median * VOLUME_SPIKE_CAP_MEDIAN_MULTIPLIER,
        p75 * VOLUME_SPIKE_CAP_P75_MULTIPLIER,
        p90 * VOLUME_SPIKE_CAP_P90_MULTIPLIER,
    );

    return max > robustCap ? robustCap : max;
}

function getPositionUpdateField(
    position: ChartPosition,
    role: PositionMarkerRole,
    price: number,
): keyof PositionUpdate | null {
    if (role === 'sl' || role === 'tp') {
        return role;
    }

    if (Math.abs(price - position.openPrice) <= Number.EPSILON) {
        return null;
    }

    const isAboveOpen = price > position.openPrice;
    return position.type === 'buy'
        ? isAboveOpen ? 'tp' : 'sl'
        : isAboveOpen ? 'sl' : 'tp';
}

function hasValidBarPrices(bar: OHLCBar): boolean {
    return normalizeTimestampMs(bar.time) !== null
        && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0);
}

function isBarInsideChartSymbolPriceDomain(symbol: string, bar: OHLCBar): boolean {
    if (!hasValidBarPrices(bar)) {
        return false;
    }

    if (bar.symbol && !symbolsMatch(bar.symbol, symbol)) {
        return false;
    }

    const domain = getOhlcSymbolPriceDomain(symbol);
    if (!domain) {
        return true;
    }

    const prices = [bar.open, bar.high, bar.low, bar.close];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    return !(
        (domain.min !== undefined && maxPrice < domain.min) ||
        (domain.max !== undefined && minPrice > domain.max)
    );
}

function isImplausibleLiveQuoteFallbackMove(
    referencePrice: number,
    candidatePrice: number,
    maxRatio: number,
): boolean {
    return Number.isFinite(referencePrice) &&
        referencePrice > 0 &&
        Number.isFinite(candidatePrice) &&
        candidatePrice > 0 &&
        Math.abs(candidatePrice - referencePrice) / referencePrice > maxRatio;
}

function repairImplausibleSameBucketLiveRange(
    candidateBar: OHLCBar,
    incomingBar: OHLCBar,
    previousBar: OHLCBar | null,
): { bar: OHLCBar; repaired: boolean } {
    if (
        !previousBar ||
        previousBar.time !== candidateBar.time ||
        !isOpenLiveTickBar(candidateBar)
    ) {
        return { bar: candidateBar, repaired: false };
    }

    const referencePrice = previousBar.close > 0 ? previousBar.close : candidateBar.open;
    const plausibleHigh = Math.max(
        candidateBar.open,
        candidateBar.close,
        incomingBar.open,
        incomingBar.close,
        referencePrice,
    );
    const plausibleLow = Math.min(
        candidateBar.open,
        candidateBar.close,
        incomingBar.open,
        incomingBar.close,
        referencePrice,
    );
    const highLooksPolluted =
        candidateBar.high > plausibleHigh &&
        isImplausibleLiveQuoteFallbackMove(
            referencePrice,
            candidateBar.high,
            LIVE_QUOTE_FALLBACK_MAX_STORED_EXTREME_RATIO,
        );
    const lowLooksPolluted =
        candidateBar.low < plausibleLow &&
        isImplausibleLiveQuoteFallbackMove(
            referencePrice,
            candidateBar.low,
            LIVE_QUOTE_FALLBACK_MAX_STORED_EXTREME_RATIO,
        );

    if (!highLooksPolluted && !lowLooksPolluted) {
        return { bar: candidateBar, repaired: false };
    }

    return {
        bar: {
            ...candidateBar,
            high: highLooksPolluted ? plausibleHigh : candidateBar.high,
            low: lowLooksPolluted ? plausibleLow : candidateBar.low,
            volume: Number.isFinite(incomingBar.volume) && incomingBar.volume > 0
                ? incomingBar.volume
                : candidateBar.volume,
        },
        repaired: true,
    };
}

function alignLiveBarOpenToPreviousClose(
    bar: OHLCBar,
    previousBar: OHLCBar | null | undefined,
): OHLCBar {
    if (
        !previousBar ||
        bar.time <= previousBar.time ||
        !Number.isFinite(previousBar.close) ||
        previousBar.close <= 0
    ) {
        return bar;
    }

    const previousClose = previousBar.close;
    if (Math.abs(bar.open - previousClose) <= Number.EPSILON) {
        return bar;
    }

    return {
        ...bar,
        open: previousClose,
        high: Math.max(bar.high, previousClose, bar.close),
        low: Math.min(bar.low, previousClose, bar.close),
    };
}

function alignOpenGapsToPreviousClose(bars: OHLCBar[]): OHLCBar[] {
    return bars.map((bar, index) =>
        alignLiveBarOpenToPreviousClose(bar, index > 0 ? bars[index - 1] : null),
    );
}

function hasSameOhlcvValues(left: OHLCBar | null, right: OHLCBar | null): boolean {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }

    return left.time === right.time
        && left.open === right.open
        && left.high === right.high
        && left.low === right.low
        && left.close === right.close
        && left.volume === right.volume;
}

function getLatestHistoryCatchUpReferenceBar(
    bars: Iterable<OHLCBar>,
    bucketMs: number,
): OHLCBar | null {
    const historyReferenceBars = normalizeChartBars(Array.from(bars), bucketMs)
        .filter(isLatestHistoryCatchUpReferenceBar);

    return historyReferenceBars[historyReferenceBars.length - 1] ?? null;
}

function getLatestHistoryCatchUpReferenceTime(
    bars: Iterable<OHLCBar>,
    bucketMs: number,
): number | null {
    return getLatestHistoryCatchUpReferenceBar(bars, bucketMs)?.time ?? null;
}

function shouldRequestLatestHistoryForLiveGap(
    latestHistoryRealTime: number | null,
    earliestLiveRealTime: number | null,
    bucketMs: number,
): boolean {
    if (latestHistoryRealTime === null || earliestLiveRealTime === null || bucketMs <= 0) {
        return false;
    }

    return earliestLiveRealTime - latestHistoryRealTime >= RECONNECT_GAP_DETECTION_THRESHOLD_BUCKETS * bucketMs;
}

function isClosedBucket(bar: OHLCBar, bucketMs?: number, nowMs = Date.now()): boolean {
    return bar.closed === true ||
        (typeof bucketMs === 'number' && bucketMs > 0 && bar.time + bucketMs <= nowMs);
}

function safeAggregatedVolume(left: number, right: number): number {
    const volumes = [left, right]
        .map((volume) => Number(volume))
        .filter((volume) => Number.isFinite(volume) && volume >= 0);

    return volumes.reduce((sum, volume) => sum + volume, 0);
}

function getBarSourceTimeMs(bar: OHLCBar): number {
    const sourceTime = Number(bar.sourceTimeMs);
    return Number.isFinite(sourceTime) && sourceTime > 0 ? sourceTime : bar.time;
}

function mergeChronologicalOhlcBars(
    existing: OHLCBar,
    incoming: OHLCBar,
    bucketTimeMs: number,
): OHLCBar {
    const existingSourceTime = getBarSourceTimeMs(existing);
    const incomingSourceTime = getBarSourceTimeMs(incoming);
    const incomingIsLater = incomingSourceTime >= existingSourceTime;
    const first = incomingIsLater ? existing : incoming;
    const last = incomingIsLater ? incoming : existing;

    return {
        ...last,
        time: bucketTimeMs,
        open: first.open,
        high: Math.max(existing.high, incoming.high, first.open, last.close),
        low: Math.min(existing.low, incoming.low, first.open, last.close),
        close: last.close,
        volume: safeAggregatedVolume(existing.volume, incoming.volume),
        source: last.source ?? first.source,
        sourceTimeMs: last.sourceTimeMs ?? last.time,
        derived: undefined,
        continuity: undefined,
        isContinuity: undefined,
        basis: undefined,
        cached: existing.cached === true && incoming.cached === true ? true : undefined,
        synthetic: undefined,
    };
}

function preferRealBar(
    existing: OHLCBar | undefined,
    incoming: OHLCBar,
    bucketMs?: number,
): OHLCBar {
    if (!existing) {
        return { ...incoming };
    }

    const existingIsSeed = isProvisionalPriceSeedBar(existing);
    const incomingIsSeed = isProvisionalPriceSeedBar(incoming);
    if (existingIsSeed !== incomingIsSeed) {
        return existingIsSeed ? { ...incoming, time: existing.time } : { ...existing };
    }

    const existingIsReal = isRealMarketBar(existing);
    const incomingIsReal = isRealMarketBar(incoming);

    if (existingIsReal !== incomingIsReal) {
        return existingIsReal ? { ...existing } : { ...incoming };
    }

    if (existingIsReal && incomingIsReal) {
        const existingIsLive = isLiveTickBar(existing);
        const incomingIsLive = isLiveTickBar(incoming);
        const existingIsHistorical = isLikelyHistoricalOhlcBar(existing);
        const incomingIsHistorical = isLikelyHistoricalOhlcBar(incoming);
        if (existingIsLive !== incomingIsLive && existingIsHistorical !== incomingIsHistorical) {
            const historicalBar = existingIsHistorical ? existing : incoming;
            const liveBar = existingIsLive ? existing : incoming;
            if (!isClosedBucket(historicalBar, bucketMs)) {
                // Open bucket: history has the correct bucket open and all ticks since
                // the minute started; live has the latest close price.
                // Blend them: use history's open/range/volume as the base and
                // live's close as the most recent price.
                return {
                    ...liveBar,
                    time: existing.time,
                    open: historicalBar.open,
                    high: Math.max(historicalBar.high, liveBar.high),
                    low: Math.min(historicalBar.low, liveBar.low),
                    close: liveBar.close,
                    volume: Math.max(historicalBar.volume, liveBar.volume),
                    derived: undefined,
                    continuity: undefined,
                    isContinuity: undefined,
                    basis: undefined,
                    cached: undefined,
                };
            }

            return {
                ...historicalBar,
                time: existing.time,
            };
        }

        return mergeChronologicalOhlcBars(existing, incoming, existing.time);
    }

    return { ...incoming };
}

function blendDisplayedBarWithOpenLiveTick(
    displayedBar: OHLCBar | null,
    liveBar: OHLCBar,
    candidateBar: OHLCBar,
): OHLCBar {
    if (
        !displayedBar ||
        displayedBar.time !== liveBar.time ||
        !isOpenLiveTickBar(liveBar)
    ) {
        return candidateBar;
    }

    return {
        ...candidateBar,
        time: displayedBar.time,
        open: displayedBar.open,
        high: Math.max(displayedBar.high, candidateBar.high, liveBar.high, liveBar.close),
        low: Math.min(displayedBar.low, candidateBar.low, liveBar.low, liveBar.close),
        close: liveBar.close,
        volume: Math.max(displayedBar.volume, candidateBar.volume, liveBar.volume),
        source: liveBar.source ?? candidateBar.source,
        sourceTimeMs: liveBar.sourceTimeMs ?? candidateBar.sourceTimeMs,
        closed: false,
        derived: undefined,
        continuity: undefined,
        isContinuity: undefined,
        basis: candidateBar.basis,
        cached: undefined,
        synthetic: undefined,
    };
}

function upsertPreferredBar(map: Map<number, OHLCBar>, bar: OHLCBar, bucketMs?: number): OHLCBar {
    const preferredBar = preferRealBar(map.get(bar.time), bar, bucketMs);
    map.set(bar.time, preferredBar);
    return preferredBar;
}

function bucketTimeMs(time: number, bucketMs: number): number {
    const normalizedTime = normalizeTimestampMs(time);
    if (normalizedTime === null) {
        return 0;
    }

    return Math.floor(normalizedTime / bucketMs) * bucketMs;
}

function toBucketedBar(bar: OHLCBar, bucketMs: number): OHLCBar {
    const time = bucketMs > 0
        ? bucketTimeMs(bar.time, bucketMs)
        : normalizeTimestampMs(bar.time) ?? 0;

    return {
        ...bar,
        sourceTimeMs: bar.sourceTimeMs ?? normalizeTimestampMs(bar.time) ?? time,
        time,
    };
}

function sortBarsByTime(bars: OHLCBar[]): OHLCBar[] {
    return bars
        .map((bar) => ({ ...bar }))
        .sort((left, right) => left.time - right.time);
}

function limitBarsPreservingRealBars(
    sortedBars: OHLCBar[],
    maxBars = MAX_RENDERED_OHLC_BARS,
): OHLCBar[] {
    if (sortedBars.length <= maxBars) {
        return sortedBars.map((bar) => ({ ...bar }));
    }

    const selectedByTime = new Map<number, OHLCBar>();
    const realBars = sortedBars
        .filter(isRealMarketBar)
        .slice(-maxBars);

    for (const bar of realBars) {
        selectedByTime.set(bar.time, { ...bar });
    }

    const remainingSlots = maxBars - selectedByTime.size;
    if (remainingSlots > 0) {
        const continuityBars = sortedBars
            .filter((bar) => !isRealMarketBar(bar) && !selectedByTime.has(bar.time))
            .slice(-remainingSlots);

        for (const bar of continuityBars) {
            selectedByTime.set(bar.time, { ...bar });
        }
    }

    if (selectedByTime.size === 0) {
        return sortedBars.slice(-maxBars).map((bar) => ({ ...bar }));
    }

    return [...selectedByTime.values()].sort((left, right) => left.time - right.time);
}

function normalizeChartBars(
    bars: OHLCBar[],
    bucketMs: number,
    maxBars = MAX_RENDERED_OHLC_BARS,
): OHLCBar[] {
    if (bucketMs <= 0) {
        return limitBarsPreservingRealBars(
            bars
                .filter(hasValidBarPrices)
                .sort((left, right) => left.time - right.time),
            maxBars,
        );
    }

    const byBucketTime = new Map<number, OHLCBar>();
    for (const rawBar of bars) {
        if (!hasValidBarPrices(rawBar)) {
            continue;
        }

        const bar = toBucketedBar(rawBar, bucketMs);
        upsertPreferredBar(byBucketTime, bar, bucketMs);
    }

    return limitBarsPreservingRealBars(
        [...byBucketTime.values()].sort((left, right) => left.time - right.time),
        maxBars,
    );
}

function getRenderableMarketBars(
    bars: OHLCBar[],
    maxBars = MAX_RENDERED_OHLC_BARS,
): OHLCBar[] {
    return bars
        .filter(isRealMarketBar)
        .slice(-maxBars)
        .map((bar) => ({ ...bar }));
}

function summarizeHistoryBars(bars: OHLCBar[], bucketMs: number): HistoryBarStats {
    const normalizedBars = normalizeChartBars(bars, bucketMs);
    const realBars = normalizedBars.filter(isRealMarketBar);
    const continuityBars = normalizedBars.length - realBars.length;
    const earliestRealTime = realBars[0]?.time ?? null;
    const latestRealTime = realBars[realBars.length - 1]?.time ?? null;
    const expectedBuckets = earliestRealTime !== null && latestRealTime !== null && bucketMs > 0
        ? Math.max(1, Math.floor((latestRealTime - earliestRealTime) / bucketMs) + 1)
        : realBars.length;

    return {
        totalBars: normalizedBars.length,
        realBars: realBars.length,
        continuityBars,
        expectedBuckets,
        realDensity: expectedBuckets > 0 ? realBars.length / expectedBuckets : 1,
        latestRealTime,
    };
}

function getRealBarTimeWindow(
    bars: Iterable<OHLCBar>,
    bucketMs: number,
    maxBars = MAX_RENDERED_OHLC_BARS,
): { startTime: number | null; endTime: number | null } {
    const realBars = normalizeChartBars(Array.from(bars), bucketMs, maxBars).filter(isRealMarketBar);

    return {
        startTime: realBars[0]?.time ?? null,
        endTime: realBars[realBars.length - 1]?.time ?? null,
    };
}

function shouldKeepProvisionalLivePreview(
    historyLatestRealTime: number | null,
    latestLivePreviewRealTime: number | null,
    bucketMs: number,
): boolean {
    if (historyLatestRealTime === null || latestLivePreviewRealTime === null) {
        return false;
    }

    return historyLatestRealTime < (
        latestLivePreviewRealTime - (bucketMs * PROVISIONAL_PREVIEW_HISTORY_CATCH_UP_TOLERANCE_BUCKETS)
    );
}

function getStaleHistoryThresholdMs(bucketMs: number): number {
    // Use 5× the bucket size (min 5 min) so a 1m chart retries if the latest
    // bar is >5 minutes old, catching the common case where C++ history lags
    // behind live by tens of minutes (e.g. MT5 backfill still in progress).
    return Math.max(5 * bucketMs, 5 * 60 * 1000);
}

function isLikelyMarketClosed(latestBarTimeMs: number): boolean {
    // Forex/crypto markets close Friday ~21:00 UTC and reopen Sunday ~21:00 UTC.
    // Treat bars as non-stale when the current day is Saturday OR Sunday UTC,
    // OR when it's Friday/Monday but less than 26h since the last bar
    // (covers weekend gap and typical holiday closures).
    const nowMs = Date.now();
    const day = new Date(nowMs).getUTCDay(); // 0=Sun, 6=Sat
    const hoursSinceLastBar = (nowMs - latestBarTimeMs) / (60 * 60 * 1000);
    // Definitively weekend
    if (day === 0 || day === 6) return true;
    // Friday afternoon or Monday early morning → likely weekend boundary
    if ((day === 5 || day === 1) && hoursSinceLastBar > 20) return true;
    // Generic holiday: >20h gap on any weekday = market holiday, not a data bug
    return hoursSinceLastBar > 20;
}

function shouldRetryHistoryBackfill(stats: HistoryBarStats, bucketMs: number): boolean {
    if (stats.totalBars === 0) {
        return true;
    }

    const mostlyContinuity = stats.totalBars >= 20
        && stats.continuityBars / stats.totalBars >= MOSTLY_CONTINUITY_RATIO;
    const sparseAcrossRange = stats.realBars >= 2
        && stats.expectedBuckets >= MIN_EXPECTED_BUCKETS_FOR_SPARSE_RETRY
        && stats.realDensity < SPARSE_HISTORY_DENSITY_RATIO;
    // Only retry when we have very few bars AND the bar count is below our minimum threshold.
    // Using MIN_REAL_BARS_BEFORE_SUFFICIENT (10) instead of 50 prevents spurious retries
    // when the symbol legitimately has sparse data (e.g. new instruments).
    const veryFewRealBars = stats.realBars < MIN_REAL_BARS_BEFORE_SUFFICIENT;
    // Only retry on stale data if the staleness is significantly beyond the threshold —
    // a 2× buffer prevents aggressive retries on slightly-lagging MT5 history.
    // Skip the stale check entirely when the market is likely closed (weekend/holiday)
    // to avoid burning API quota retrying when there simply ARE no new bars.
    const staleLatestBar = stats.latestRealTime !== null
        && !isLikelyMarketClosed(stats.latestRealTime)
        && Date.now() - stats.latestRealTime > getStaleHistoryThresholdMs(bucketMs) * 2;

    return mostlyContinuity || sparseAcrossRange || veryFewRealBars || staleLatestBar;
}

function getLatestCoherentRenderBars(
    normalizedBars: OHLCBar[],
    bucketMs: number,
    maxBars = MAX_RENDERED_OHLC_BARS,
): { bars: OHLCBar[]; trimmedDisconnectedPrefix: boolean } {
    // Keep backend/live bars sorted and bucket-deduped. Visual continuity is handled
    // by compact series time, not by rendering synthetic flat filler candles.
    const sortedBars = sortBarsByTime(normalizedBars.filter(hasValidBarPrices));
    const latestWindow = getLatestCoherentMarketWindow(sortedBars, bucketMs, { maxBars });

    return {
        bars: latestWindow.trimmedDisconnectedPrefix
            ? latestWindow.bars
            : limitBarsPreservingRealBars(sortedBars, maxBars),
        trimmedDisconnectedPrefix: latestWindow.trimmedDisconnectedPrefix,
    };
}

function getPendingHistoryNoDataMessage(emptyMessage: string): string {
    if (/quote server/i.test(emptyMessage)) {
        return emptyMessage;
    }

    return 'No candle history is available yet. Backfilling is still in progress, and cached live bars will merge in once MT5 history is ready.';
}

function stringifyMetadataValue(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }

    if (typeof value === 'string') {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function appendHistoryMetadataSymbolCandidate(candidates: string[], value: unknown): void {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
            candidates.push(trimmed);
        }
        return;
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            appendHistoryMetadataSymbolCandidate(candidates, entry);
        }
    }
}

function getHistoryMetadataRange(metadata: OhlcHistoryResponseMetadata): { fromUnixMs?: number; toUnixMs?: number } {
    return {
        fromUnixMs: normalizeOptionalHistoryUnixMs(metadata.fromUnixMs ?? metadata.metadata?.fromUnixMs),
        toUnixMs: normalizeOptionalHistoryUnixMs(metadata.toUnixMs ?? metadata.metadata?.toUnixMs),
    };
}

function getHistoryMetadataPagination(metadata: OhlcHistoryResponseMetadata | undefined): {
    beforeUnixMs?: number;
    hasMore?: boolean;
    cacheOnly?: boolean;
    returnedBarCount?: number;
    event?: string;
    status?: string;
} {
    if (!metadata) {
        return {};
    }

    const paginationMetadata = metadata as OhlcHistoryResponseMetadata & {
        before?: unknown;
        beforeUnixMs?: unknown;
        hasMore?: unknown;
        nextBefore?: unknown;
        nextBeforeUnixMs?: unknown;
        cacheOnly?: unknown;
    };
    const beforeUnixMs = normalizeOptionalHistoryUnixMs(
        paginationMetadata.beforeUnixMs ??
        paginationMetadata.before ??
        metadata.metadata?.beforeUnixMs ??
        metadata.metadata?.before,
    );
    const returnedBarCount = Number(
        metadata.returnedBarCount ??
        metadata.barCount ??
        metadata.metadata?.returnedBarCount,
    );
    const hasMore = normalizeOptionalHistoryBoolean(
        paginationMetadata.hasMore ?? metadata.metadata?.hasMore,
    );
    const cacheOnly = normalizeOptionalHistoryBoolean(
        paginationMetadata.cacheOnly ?? metadata.metadata?.cacheOnly,
    );

    return {
        ...(beforeUnixMs !== undefined ? { beforeUnixMs } : {}),
        ...(hasMore !== undefined ? { hasMore } : {}),
        ...(cacheOnly !== undefined ? { cacheOnly } : {}),
        ...(Number.isFinite(returnedBarCount) ? { returnedBarCount: Math.trunc(returnedBarCount) } : {}),
        ...(metadata.event ? { event: metadata.event } : {}),
        ...(metadata.status ? { status: metadata.status } : {}),
    };
}

function metadataMatchesBeforeRequest(
    metadata: OhlcHistoryResponseMetadata | undefined,
    beforeUnixMs: number,
    bucketMs: number,
): boolean {
    if (!metadata) {
        return true;
    }

    const pagination = getHistoryMetadataPagination(metadata);
    if (pagination.beforeUnixMs === undefined) {
        return true;
    }

    return Math.abs(pagination.beforeUnixMs - beforeUnixMs) <= Math.max(1, bucketMs);
}

function metadataMatchesHistoryRange(
    metadata: OhlcHistoryResponseMetadata,
    fromUnixMs: number,
    toUnixMs: number,
    bucketMs: number,
): boolean {
    const metadataRange = getHistoryMetadataRange(metadata);
    const hasRange = metadataRange.fromUnixMs !== undefined || metadataRange.toUnixMs !== undefined;
    if (!hasRange) {
        return true;
    }

    const toleranceMs = Math.max(1, bucketMs);
    return (metadataRange.fromUnixMs === undefined || Math.abs(metadataRange.fromUnixMs - fromUnixMs) <= toleranceMs)
        && (metadataRange.toUnixMs === undefined || Math.abs(metadataRange.toUnixMs - toUnixMs) <= toleranceMs);
}

function metadataCoversBarTime(
    metadata: OhlcHistoryResponseMetadata,
    barTimeMs: number,
    bucketMs: number,
): boolean {
    const metadataRange = getHistoryMetadataRange(metadata);
    const hasRange = metadataRange.fromUnixMs !== undefined || metadataRange.toUnixMs !== undefined;
    if (!hasRange) {
        return true;
    }

    const toleranceMs = Math.max(1, bucketMs);
    return (metadataRange.fromUnixMs === undefined || barTimeMs >= metadataRange.fromUnixMs - toleranceMs)
        && (metadataRange.toUnixMs === undefined || barTimeMs <= metadataRange.toUnixMs + toleranceMs);
}

function historyMetadataIndicatesDeferredOrSparse(metadata: OhlcHistoryResponseMetadata | undefined): boolean {
    if (!metadata) {
        return false;
    }

    if (historyMetadataMarksUncleanBaseline(metadata)) {
        return true;
    }

    if (metadata.managerFetchDeferred || metadata.shouldReload === true) {
        return true;
    }

    const searchableMetadata = [
        metadata.status,
        metadata.message,
        metadata.source,
        metadata.event,
        metadata.warnings,
        metadata.notes,
        metadata.metadata,
    ].map(stringifyMetadataValue).join(' ');

    return /defer|pending|queued|loading|not[_ ]ready/i.test(searchableMetadata);
}

function getOlderHistoryFromUnixMs(toUnixMs: number, bucketMs: number, limit: number): number {
    const spanMs = Math.max(bucketMs, bucketMs * Math.max(1, limit));
    return Math.max(0, toUnixMs - spanMs);
}

function getBackfillStatusMessage(stats: HistoryBarStats): string {
    if (stats.realBars === 0) {
        return 'Loading MT5 candle history...';
    }

    if (stats.totalBars > 0 && stats.continuityBars / stats.totalBars >= MOSTLY_CONTINUITY_RATIO) {
        return 'Completing MT5 chart history...';
    }

    return 'Loading MT5 candle history in the background...';
}

function KlineChartContainer({
    symbol,
    accountSessionScopeId,
    symbolName,
    basePrice,
    preferredLiveAxisPrice,
    theme = 'Dark',
    chartType = 'Candles',
    pricePrecision = 5,
    headerActions,
    positions = [],
    onUpdatePosition,
    onClosePosition,
    controlRef,
    onHistoryStatusChange,
    timeframeMinutes,
    onTimeframeChange,
    chartBarSpacing,
    onChartBarSpacingChange,
    showTitle: showTitleProp,
}: KlineChartContainerProps) {
    const showTitleStore = useChartSettingsStore((state) => state.showTitle);
    const showTitle = showTitleProp !== undefined ? showTitleProp : showTitleStore;
    const showChartValues = useChartSettingsStore((state) => state.showChartValues);
    const showBarChangeValues = useChartSettingsStore((state) => state.showBarChangeValues);
    const showVolume = useChartSettingsStore((state) => state.showVolume);
    const bgOpacity = useChartSettingsStore((state) => state.bgOpacity);
    const showPriceLabel = useChartSettingsStore((state) => state.showPriceLabel);
    const showGridLines = useChartSettingsStore((state) => state.showGridLines);
    const crosshairDashed = useChartSettingsStore((state) => state.crosshairDashed);
    const autoScrollEnabled = useChartSettingsStore((state) => state.autoScroll);
    const chartShift = useChartSettingsStore((state) => state.chartShift);
    const scaleFixOneToOne = useChartSettingsStore((state) => state.scaleFixOneToOne);
    const showBody = useChartSettingsStore((state) => state.showBody);
    const showBorders = useChartSettingsStore((state) => state.showBorders);
    const showWick = useChartSettingsStore((state) => state.showWick);
    const showTickVolumes = useChartSettingsStore((state) => state.showTickVolumes);
    const showRealVolumes = useChartSettingsStore((state) => state.showRealVolumes);
    const tradingSessionId = useWebtraderStore((state) => state.session?.id?.trim() || null);
    const normalizedAccountSessionScopeId = accountSessionScopeId?.trim() || null;
    const syntheticMarketDataEnabled = shouldAllowSyntheticMarketData();
    const getResolutionFromMinutes = useCallback((minutes: number | null | undefined) => (
        RESOLUTIONS.find((resolution) => resolution.minutes === minutes) ?? RESOLUTIONS[0]
    ), []);
    const [internalResolution, setInternalResolution] = useState<ResolutionOption>(
        getResolutionFromMinutes(timeframeMinutes),
    );
    const controlledResolution = timeframeMinutes === undefined
        ? null
        : getResolutionFromMinutes(timeframeMinutes);
    const selectedResolution = controlledResolution ?? internalResolution;
    const setSelectedResolution = useCallback((nextResolution: ResolutionOption) => {
        setInternalResolution(nextResolution);
        onTimeframeChange?.(nextResolution.minutes);
    }, [onTimeframeChange]);
    const visualConfig = useMemo(
        () => getGlobalChartVisualConfig(theme, selectedResolution.minutes),
        [selectedResolution.minutes, theme],
    );
    const visualColors = visualConfig.colors;
    const palette: ChartPalette = visualColors;
    const [isLoading, setIsLoading] = useState(true);
    const [noDataMessage, setNoDataMessage] = useState<string | null>(null);
    const [historyBackfillMessage, setHistoryBackfillMessage] = useState<string | null>(null);
    const isLoadingRef = useRef(isLoading);
    const historyBackfillMessageRef = useRef(historyBackfillMessage);
    isLoadingRef.current = isLoading;
    historyBackfillMessageRef.current = historyBackfillMessage;
    const [activeBar, setActiveBar] = useState<OHLCBar | null>(null);
    const activeBarRef = useRef<OHLCBar | null>(null);
    const pendingActiveBarRef = useRef<OHLCBar | null>(null);
    const activeBarFrameRef = useRef<number | null>(null);
    const [refreshToken, setRefreshToken] = useState(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const chartHostRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    // Deferred loading indicator: only show blank/spinner after 400ms of
    // genuinely having no bars — avoids flash-of-blank on fast symbol switches.
    const gracefulLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mainSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const priceLinesRef = useRef<IPriceLine[]>([]);
    const positionLineOverlaysRef = useRef<(PositionLineOverlay & { position?: ChartPosition, role?: PositionMarkerRole })[]>([]);
    const syncMarkersRef = useRef<(() => void) | null>(null);
    const seriesMarkersPluginRef = useRef<ISeriesMarkersPluginApi<UTCTimestamp> | null>(null);
    const persistentPositionLinesRef = useRef<Map<string, {
        mainLine: IPriceLine;
        slLine?: IPriceLine;
        tpLine?: IPriceLine;
        mainOverlay: HTMLDivElement;
        slOverlay?: HTMLDivElement;
        tpOverlay?: HTMLDivElement;
    }>>(new Map());
    const positionDragCleanupRef = useRef<(() => void) | null>(null);
    const chartBarSpacingRef = useRef(chartBarSpacing);
    const onChartBarSpacingChangeRef = useRef(onChartBarSpacingChange);
    const currentBarRef = useRef<OHLCBar | null>(null);
    const lastBarTimeRef = useRef<number>(0);
    // â”€â”€ MT5-style live price indicator (rtx-desktop-main parity): DOM overlays on the chart host. â”€â”€
    const livePriceLineRef = useRef<HTMLDivElement | null>(null);
    const livePriceBadgeRef = useRef<HTMLDivElement | null>(null);
    const livePriceHitRef = useRef<HTMLDivElement | null>(null);
    const fallbackLiveAxisPriceRef = useRef<number | null>(null);
    const livePriceRef = useRef<number | null>(null);
    const preferredLiveAxisPriceRef = useRef<number | null>(null);
    const updateLivePriceOverlayRef = useRef<(() => void) | null>(null);
    const manualPriceRangeRef = useRef<{ minValue: number; maxValue: number } | null>(null);
    const positionsRef = useRef(positions);
    const onUpdatePositionRef = useRef(onUpdatePosition);
    const onClosePositionRef = useRef(onClosePosition);
    const lastHistoryStatusRef = useRef<{
        symbol: string;
        timeframeMinutes: number;
        isLoading: boolean;
        hasCandles: boolean;
    } | null>(null);
    const chartSwitchSequenceRef = useRef(0);
    const activeChartSwitchRef = useRef<{
        id: number;
        accountSessionScopeId: string | null;
        symbol: string;
        timeframeMinutes: number;
    }>({
        id: 0,
        accountSessionScopeId: null,
        symbol: '',
        timeframeMinutes: 0,
    });
    const lastAppliedChartDataStreamKeyRef = useRef<string | null>(null);
    const atomicChartSwitchSeedRef = useRef<AtomicChartSwitchSeed | null>(null);

    // Chart disposal belongs to the component lifecycle, never to a symbol
    // switch. The data controller can rebind while this canvas remains mounted.
    useEffect(() => () => {
        const chart = chartRef.current;
        chartRef.current = null;
        mainSeriesRef.current = null;
        volumeSeriesRef.current = null;
        atomicChartSwitchSeedRef.current = null;
        if (chart) {
            try { chart.remove(); } catch { /* already disposed */ }
        }
    }, []);

    useEffect(() => {
        onUpdatePositionRef.current = onUpdatePosition;
        onClosePositionRef.current = onClosePosition;
    }, [onUpdatePosition, onClosePosition]);

    useEffect(() => {
        chartBarSpacingRef.current = chartBarSpacing;
    }, [chartBarSpacing]);

    useEffect(() => {
        onChartBarSpacingChangeRef.current = onChartBarSpacingChange;
    }, [onChartBarSpacingChange]);

    useEffect(() => {
        manualPriceRangeRef.current = null;
    }, [selectedResolution.minutes, symbol]);

    const getPreferredBarSpacing = useCallback((fallback: number) => {
        const minimumSpacing = visualConfig.timeScale.minBarSpacing;
        const spacing = chartBarSpacingRef.current;
        return typeof spacing === 'number' && Number.isFinite(spacing) && spacing > 0
            ? Math.max(minimumSpacing, spacing)
            : Math.max(minimumSpacing, fallback);
    }, [visualConfig.timeScale.minBarSpacing]);

    const getPreferredRightOffset = useCallback((barSpacing?: number) => {
        const baseRightOffset = chartShift ? 25 : visualConfig.timeScale.rightOffset;
        const effectiveBarSpacing = typeof barSpacing === 'number' && Number.isFinite(barSpacing) && barSpacing > 0
            ? barSpacing
            : getPreferredBarSpacing(visualConfig.timeScale.barSpacing);

        return getChartRightOffsetWithPriceScaleGap(
            baseRightOffset,
            effectiveBarSpacing,
            showPriceLabel,
        );
    }, [
        chartShift,
        getPreferredBarSpacing,
        showPriceLabel,
        visualConfig.timeScale.barSpacing,
        visualConfig.timeScale.rightOffset,
    ]);

    const effectiveBasePrice = useMemo(() => {
        return basePrice && basePrice > 0 ? basePrice : inferSeedPrice(symbol);
    }, [basePrice, symbol]);
    // Subscribe internally so the live price axis updates without re-rendering the parent chain.
    const internalLivePrice = usePriceBySymbol(symbol);
    const normalizedPreferredLiveAxisPrice = useMemo(() => {
        // Prop takes precedence (allows parent override); fall back to internal subscription.
        const candidate = typeof preferredLiveAxisPrice === 'number' && preferredLiveAxisPrice > 0
            ? preferredLiveAxisPrice
            : (internalLivePrice?.bid ?? 0) > 0
                ? internalLivePrice!.bid
                : (internalLivePrice?.ask ?? 0) > 0
                    ? internalLivePrice!.ask
                    : null;

        return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
            ? candidate
            : null;
    }, [preferredLiveAxisPrice, internalLivePrice]);

    const resolveLiveAxisPrice = useCallback((fallbackPrice?: number | null) => {
        const preferredPrice = preferredLiveAxisPriceRef.current;
        if (preferredPrice !== null) {
            return preferredPrice;
        }

        if (
            typeof fallbackPrice === 'number'
            && Number.isFinite(fallbackPrice)
            && fallbackPrice > 0
        ) {
            return fallbackPrice;
        }

        return null;
    }, []);

    useEffect(() => {
        preferredLiveAxisPriceRef.current = normalizedPreferredLiveAxisPrice;
        livePriceRef.current = resolveLiveAxisPrice(fallbackLiveAxisPriceRef.current);
        updateLivePriceOverlayRef.current?.();
    }, [normalizedPreferredLiveAxisPrice, resolveLiveAxisPrice]);

    const markChartHasCandles = useCallback(() => {
        if (isLoadingRef.current) {
            isLoadingRef.current = false;
            setIsLoading(false);
        }
        if (historyBackfillMessageRef.current !== null) {
            historyBackfillMessageRef.current = null;
            setHistoryBackfillMessage(null);
        }
    }, []);

    const flushActiveBarUpdate = useCallback(() => {
        activeBarFrameRef.current = null;
        const nextBar = pendingActiveBarRef.current;
        pendingActiveBarRef.current = null;

        if (hasSameOhlcvValues(activeBarRef.current, nextBar)) {
            return;
        }

        const stableBar = nextBar ? { ...nextBar } : null;
        activeBarRef.current = stableBar;
        startTransition(() => {
            setActiveBar(stableBar);
        });
    }, []);

    const setActiveBarIfChanged = useCallback((nextBar: OHLCBar | null) => {
        if (
            hasSameOhlcvValues(activeBarRef.current, nextBar)
            && hasSameOhlcvValues(pendingActiveBarRef.current, nextBar)
        ) {
            return;
        }

        pendingActiveBarRef.current = nextBar ? { ...nextBar } : null;
        if (activeBarFrameRef.current !== null) {
            return;
        }

        activeBarFrameRef.current = window.requestAnimationFrame(flushActiveBarUpdate);
    }, [flushActiveBarUpdate]);

    useEffect(() => {
        return () => {
            if (activeBarFrameRef.current !== null) {
                window.cancelAnimationFrame(activeBarFrameRef.current);
            }
        };
    }, []);

    // Symbol switches update only the existing series data before passive effects run.
    // The chart canvas, scales, toolbar, overlays, and interaction layer remain mounted.
    useLayoutEffect(() => {
        const chart = chartRef.current;
        const mainSeries = mainSeriesRef.current;
        const volumeSeries = volumeSeriesRef.current;
        if (!chart || !mainSeries || !volumeSeries) {
            return;
        }

        const bucketMs = selectedResolution.minutes * 60 * 1000;
        const cachedBars = normalizeChartBars(
            ohlcService
                .getSyncBars(symbol, selectedResolution.minutes, normalizedAccountSessionScopeId)
                .filter((bar) =>
                    isRenderableCachedOrHistoricalBar(bar) &&
                    isRealMarketBar(bar) &&
                    isBarInsideChartSymbolPriceDomain(symbol, bar),
                ),
            bucketMs,
            LIVE_FIRST_SYMBOL_SWITCH_HISTORY_BARS,
        );
        const barsByTime = new Map(cachedBars.map((bar) => [bar.time, { ...bar }]));
        const snapshot = getLivePriceSnapshotBySymbol(symbol);
        const livePrice = snapshot ? getLiveQuotePrice(snapshot) : null;

        if (livePrice !== null && Number.isFinite(livePrice) && livePrice > 0) {
            const eventTime = getLiveQuoteEventTime(snapshot!, Date.now());
            const liveBucketTime = bucketTimeMs(eventTime, bucketMs);
            const sameBucketBar = barsByTime.get(liveBucketTime);
            const previousBar = cachedBars[cachedBars.length - 1];
            const liveOpen = sameBucketBar?.open ?? previousBar?.close ?? livePrice;
            const liveBar: OHLCBar = {
                ...(sameBucketBar ?? {}),
                symbol,
                timeframeMinutes: selectedResolution.minutes,
                time: liveBucketTime,
                open: liveOpen,
                high: Math.max(sameBucketBar?.high ?? liveOpen, livePrice),
                low: Math.min(sameBucketBar?.low ?? liveOpen, livePrice),
                close: livePrice,
                volume: Math.max(
                    sameBucketBar?.volume ?? 0,
                    getLiveQuoteVolumeIncrement(snapshot!),
                    1,
                ),
                source: 'mt5_tick',
                sourceTimeMs: eventTime,
                closed: false,
            };
            barsByTime.set(liveBucketTime, liveBar);
        }

        const switchBars = alignOpenGapsToPreviousClose(
            getRenderableMarketBars(
                normalizeChartBars(
                    [...barsByTime.values()],
                    bucketMs,
                    LIVE_FIRST_SYMBOL_SWITCH_HISTORY_BARS,
                ),
                LIVE_FIRST_SYMBOL_SWITCH_HISTORY_BARS,
            ),
        );
        const compactEntries = buildCompactSeriesEntries(
            switchBars,
            bucketMs,
            COMPACT_SERIES_EPOCH_MS,
        );
        const priceFormat = {
            type: 'price' as const,
            precision: Math.max(0, pricePrecision),
            minMove: 1 / Math.pow(10, Math.max(0, pricePrecision)),
        };

        mainSeries.applyOptions({ priceFormat });
        if (chartType === 'Line') {
            mainSeries.setData(compactEntries.map(({ bar, seriesTime }) =>
                toLineData(bar, seriesTime),
            ));
        } else {
            let previousClose = 1;
            mainSeries.setData(compactEntries.map(({ bar, seriesTime }) => {
                const candle = toVisualCandleData(bar, pricePrecision, seriesTime, previousClose);
                previousClose = candle.close;
                return candle;
            }));
        }

        const visualVolumeMax = getVisualVolumeScaleMax(switchBars.map((bar) => bar.volume));
        volumeSeries.setData(compactEntries.map(({ bar, seriesTime }) =>
            toVolumeData(bar, palette, seriesTime, visualVolumeMax),
        ));

        const latestBar = switchBars[switchBars.length - 1] ?? null;
        currentBarRef.current = latestBar;
        lastBarTimeRef.current = latestBar?.time ?? 0;
        fallbackLiveAxisPriceRef.current = latestBar?.close ?? null;
        livePriceRef.current = resolveLiveAxisPrice(latestBar?.close ?? null);
        const chartDataStreamKey = [
            normalizedAccountSessionScopeId ?? 'terminal',
            symbol.trim().toUpperCase(),
            selectedResolution.minutes,
        ].join(':');
        lastAppliedChartDataStreamKeyRef.current = chartDataStreamKey;
        atomicChartSwitchSeedRef.current = {
            streamKey: chartDataStreamKey,
            bars: switchBars.map((bar) => ({ ...bar })),
        };

        if (latestBar) {
            setNoDataMessage(null);
            setActiveBarIfChanged(latestBar);
            markChartHasCandles();
            try {
                chart.timeScale().scrollToPosition(getPreferredRightOffset(), false);
            } catch {
                // The chart can be disposed during an account/session replacement.
            }
        }
    }, [
        chartType,
        getPreferredRightOffset,
        markChartHasCandles,
        normalizedAccountSessionScopeId,
        palette,
        pricePrecision,
        resolveLiveAxisPrice,
        selectedResolution.minutes,
        setActiveBarIfChanged,
        symbol,
    ]);

    const notifyHistoryStatusChange = useCallback((status: {
        isLoading: boolean;
        hasCandles: boolean;
    }) => {
        if (!onHistoryStatusChange) {
            return;
        }

        const nextStatus = {
            symbol,
            timeframeMinutes: selectedResolution.minutes,
            ...status,
        };
        const previousStatus = lastHistoryStatusRef.current;

        if (
            previousStatus &&
            previousStatus.symbol === nextStatus.symbol &&
            previousStatus.timeframeMinutes === nextStatus.timeframeMinutes &&
            previousStatus.isLoading === nextStatus.isLoading &&
            previousStatus.hasCandles === nextStatus.hasCandles
        ) {
            return;
        }

        lastHistoryStatusRef.current = nextStatus;
        onHistoryStatusChange(nextStatus);
    }, [onHistoryStatusChange, selectedResolution.minutes, symbol]);

    const handleTakeScreenshot = useCallback(() => {
        if (!chartRef.current) return;
        const canvas = chartRef.current.takeScreenshot();
        const url = canvas.toDataURL('image/jpeg', 0.95);
        const a = document.createElement('a');
        a.download = `${symbol.replace('/', '')}_${Date.now()}.jpeg`;
        a.href = url;
        a.click();
    }, [symbol]);

    const handleTakeScreenshotPDF = useCallback(async () => {
        if (!chartRef.current) return;
        const canvas = chartRef.current.takeScreenshot();
        const url = canvas.toDataURL('image/jpeg', 0.95);

        try {
            const { jsPDF } = await import('jspdf');
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'px',
                format: [canvas.width || 800, canvas.height || 600],
            });
            const props = pdf.getImageProperties(url);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (props.height * pdfWidth) / props.width;
            pdf.addImage(url, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${symbol.replace('/', '')}_${Date.now()}.pdf`);
        } catch (e) {
            console.error('Failed to generate PDF', e);
        }
    }, [symbol]);

    const handleToggleFullscreen = useCallback(() => {
        if (!wrapperRef.current) return;
        if (!document.fullscreenElement) {
            wrapperRef.current.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
        } else {
            document.exitFullscreen().catch((err) => {
                console.error(`Error attempting to exit fullscreen: ${err.message}`);
            });
        }
    }, []);

    useEffect(() => {
        if (controlRef) {
            controlRef.current = {
                takeScreenshot: handleTakeScreenshot,
                takeScreenshotPDF: handleTakeScreenshotPDF,
                toggleFullscreen: handleToggleFullscreen,
            };
        }
    }, [handleTakeScreenshot, handleTakeScreenshotPDF, handleToggleFullscreen, controlRef]);

    useEffect(() => {
        const onSetResolution = (e: Event) => {
            const detail = (e as CustomEvent<{ minutes: number }>).detail;
            const match = RESOLUTIONS.find((r) => r.minutes === detail?.minutes);
            if (match) setSelectedResolution(match);
        };
        const onRefresh = () => setRefreshToken((n) => n + 1);
        const onZoom = (e: Event) => {
            const chart = chartRef.current;
            if (!chart) return;
            const direction = (e as CustomEvent<{ direction: 'in' | 'out' }>).detail?.direction;
            try {
                const ts = chart.timeScale();
                const current = (ts.options() as any).barSpacing ?? visualConfig.timeScale.barSpacing;
                const next = direction === 'in'
                    ? Math.min(60, current * 1.25)
                    : Math.max(visualConfig.timeScale.minBarSpacing, current / 1.25);
                ts.applyOptions({
                    barSpacing: next,
                    rightOffset: getPreferredRightOffset(next),
                });
                chartBarSpacingRef.current = next;
                onChartBarSpacingChangeRef.current?.(next);
            } catch { /* chart disposed */ }
        };
        const onScrollToRealTime = () => {
            // scrollToPosition(rightOffset) scrolls to the latest logical bar,
            // which works correctly with compact sequential series times.
            // scrollToRealTime() uses real UTC and causes a gap with compact times.
            try { chartRef.current?.timeScale().scrollToPosition(getPreferredRightOffset(), false); } catch { /* chart disposed */ }
        };
        window.addEventListener('terminal:set-resolution', onSetResolution as EventListener);
        window.addEventListener('terminal:chart-refresh', onRefresh as EventListener);
        window.addEventListener('terminal:chart-zoom', onZoom as EventListener);
        window.addEventListener('terminal:chart-scroll-realtime', onScrollToRealTime as EventListener);
        return () => {
            window.removeEventListener('terminal:set-resolution', onSetResolution as EventListener);
            window.removeEventListener('terminal:chart-refresh', onRefresh as EventListener);
            window.removeEventListener('terminal:chart-zoom', onZoom as EventListener);
            window.removeEventListener('terminal:chart-scroll-realtime', onScrollToRealTime as EventListener);
        };
    }, [
        setSelectedResolution,
        getPreferredRightOffset,
        visualConfig.timeScale.barSpacing,
        visualConfig.timeScale.minBarSpacing,
    ]);

    const clearPositionLineOverlays = useCallback(() => {
        for (const overlay of positionLineOverlaysRef.current) {
            try { overlay.element.remove(); } catch { /* overlay already removed */ }
        }
        positionLineOverlaysRef.current = [];
    }, []);

    const updatePositionLineOverlays = useCallback(() => {
        const mainSeries = mainSeriesRef.current;
        if (!mainSeries) {
            return;
        }

        let scaleW = 0;
        try { scaleW = mainSeries.priceScale().width(); } catch { scaleW = 0; }
        const priceScaleInset = getPriceScaleOverlayInset(scaleW);

        const currentLivePrice = livePriceRef.current;

        for (const overlay of positionLineOverlaysRef.current) {
            const y = mainSeries.priceToCoordinate(overlay.price);
            if (y == null) {
                overlay.element.style.display = 'none';
                continue;
            }

            overlay.element.style.top = `${y}px`;
            overlay.element.style.right = `${priceScaleInset.lineRight}px`;
            overlay.element.style.display = 'block';
            
            if (typeof (overlay.element as any).updateConnectLine === 'function') {
                (overlay.element as any).updateConnectLine();
            }

            // Dynamically recalculate P/L for open positions on every price tick
            if (currentLivePrice && overlay.position && overlay.role === 'open') {
                const position = overlay.position;
                if (position.id === 'draft-order') continue; // Don't calculate P/L for drafts

                const isBuy = position.type === 'buy';
                const diff = isBuy ? currentLivePrice - position.openPrice : position.openPrice - currentLivePrice;
                const contractSize = position.contractSize || 100000;
                const projectedProfit = diff * position.volume * contractSize;

                const textSpan = overlay.element.querySelector('.badge-text') as HTMLSpanElement;
                if (textSpan) {
                    const sign = projectedProfit > 0 ? '+' : '';
                    textSpan.textContent = ` ${sign}${projectedProfit.toFixed(2)} USD `;
                    textSpan.style.color = projectedProfit >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
                }
            }
        }
    }, []);

    const clearPositionLines = useCallback(() => {
        positionDragCleanupRef.current?.();
        positionDragCleanupRef.current = null;
        clearPositionLineOverlays();

        const mainSeries = mainSeriesRef.current;
        if (!mainSeries) {
            priceLinesRef.current = [];
            return;
        }
        for (const line of priceLinesRef.current) {
            try { mainSeries.removePriceLine(line); } catch { /* series already disposed */ }
        }
        priceLinesRef.current = [];

        // Also clear persistent lines
        for (const [id, state] of persistentPositionLinesRef.current.entries()) {
            try { mainSeries.removePriceLine(state.mainLine); } catch { }
            if (state.slLine) try { mainSeries.removePriceLine(state.slLine); } catch { }
            if (state.tpLine) try { mainSeries.removePriceLine(state.tpLine); } catch { }
            state.mainOverlay.remove();
            state.slOverlay?.remove();
            state.tpOverlay?.remove();
        }
        persistentPositionLinesRef.current.clear();
    }, [clearPositionLineOverlays]);

    const startPositionMarkerDrag = useCallback((
        e: PointerEvent,
        position: ChartPosition,
        role: PositionMarkerRole,
        startPrice: number,
    ) => {
        if (e.button !== 0) return;

        const chart = chartRef.current;
        const mainSeries = mainSeriesRef.current;
        const host = chartHostRef.current;
        const wrapper = wrapperRef.current;
        const updatePosition = onUpdatePositionRef.current;
        if (!chart || !mainSeries || !host || !wrapper || !updatePosition) return;

        e.preventDefault();
        e.stopPropagation();
        positionDragCleanupRef.current?.();

        try {
            chart.applyOptions({
                handleScroll: { pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false, mouseWheel: false },
                handleScale: { axisPressedMouseMove: { time: false, price: false }, mouseWheel: false, pinch: false },
            });
        } catch { /* chart disposed */ }

        const digits = Math.max(pricePrecision, 0);
        const pipStepSnap = Math.pow(10, -digits) * 2;
        const getHostY = (event: PointerEvent) => event.clientY - host.getBoundingClientRect().top;
        const colorForField = (field: keyof PositionUpdate | null) => {
            if (field === 'tp') return palette.up;
            if (field === 'sl') return palette.down;
            return 'rgba(255,255,255,0.35)';
        };

        let scaleW = 0;
        try { scaleW = mainSeries.priceScale().width(); } catch { scaleW = 0; }
        let priceScaleInset = getPriceScaleOverlayInset(scaleW);

        const ghostLine = document.createElement('div');
        ghostLine.style.cssText = `position:absolute;left:0;right:${priceScaleInset.lineRight}px;top:${getHostY(e)}px;height:0;border-top:1px dashed hsl(var(--foreground)/0.35);z-index:999;pointer-events:none;`;
        wrapper.appendChild(ghostLine);

        const ghostBadge = document.createElement('div');
        ghostBadge.style.cssText = `position:absolute;right:${priceScaleInset.badgeRight}px;top:${getHostY(e)}px;padding:1px 6px;background:hsl(var(--background));border:1px solid hsl(var(--border));color:hsl(var(--foreground));font-size:10px;font-family:Consolas,'Courier New',monospace;font-weight:600;z-index:1000;pointer-events:none;transform:translateY(-50%);border-radius:2px;`;
        wrapper.appendChild(ghostBadge);

        const updateGhost = (event: PointerEvent) => {
            const y = getHostY(event);
            const priceAtY = mainSeries.coordinateToPrice(y);
            if (priceAtY == null) return;

            const inDeadzone = Math.abs(priceAtY - startPrice) < pipStepSnap;
            const field = inDeadzone ? null : getPositionUpdateField(position, role, priceAtY);
            const color = colorForField(field);

            try { scaleW = mainSeries.priceScale().width(); } catch { scaleW = 0; }
            priceScaleInset = getPriceScaleOverlayInset(scaleW);
            ghostLine.style.top = `${y}px`;
            ghostLine.style.right = `${priceScaleInset.lineRight}px`;
            ghostLine.style.borderTopColor = color;
            ghostBadge.style.top = `${y}px`;
            ghostBadge.style.right = `${priceScaleInset.badgeRight}px`;
            ghostBadge.style.color = color;
            ghostBadge.style.opacity = field ? '1' : '0.45';
            ghostBadge.textContent = field
                ? `${field.toUpperCase()} ${priceAtY.toFixed(digits)}`
                : priceAtY.toFixed(digits);
        };

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            ghostLine.remove();
            ghostBadge.remove();
            try {
                chart.applyOptions({
                    handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: false, pressedMouseMove: !useChartSettingsStore.getState().autoScroll },
                    handleScale: { axisPressedMouseMove: { time: false, price: true }, axisDoubleClickReset: { time: false, price: true }, mouseWheel: false, pinch: false },
                });
            } catch { /* chart disposed */ }
            updatePositionLineOverlays();
            if (positionDragCleanupRef.current === cleanup) {
                positionDragCleanupRef.current = null;
            }
        };

        const onPointerMove = (event: PointerEvent) => {
            updateGhost(event);
        };

        const onPointerUp = (event: PointerEvent) => {
            const y = getHostY(event);
            const priceAtY = mainSeries.coordinateToPrice(y);
            if (priceAtY != null && Math.abs(priceAtY - startPrice) >= pipStepSnap) {
                const field = getPositionUpdateField(position, role, priceAtY);
                if (field) {
                    if (position.id === 'draft-order') {
                        window.dispatchEvent(
                            new CustomEvent('terminal:drag-set-sl-tp', {
                                detail: {
                                    symbol: position.symbol,
                                    type: field.toUpperCase(),
                                    price: Number(priceAtY.toFixed(digits)),
                                    digits: digits,
                                }
                            })
                        );
                    } else {
                        const updates: PositionUpdate = {
                            [field]: Number(priceAtY.toFixed(digits)),
                        };
                        updatePosition(position.id, updates);
                    }
                }
            }
            cleanup();
        };

        positionDragCleanupRef.current = cleanup;
        updateGhost(e);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    }, [palette.down, palette.up, pricePrecision, updatePositionLineOverlays]);

    const syncPositionLinesTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const syncPositionLines = useCallback(() => {
        if (syncPositionLinesTimeoutRef.current) {
            return; // Already scheduled, throttle it
        }

        syncPositionLinesTimeoutRef.current = setTimeout(() => {
            syncPositionLinesTimeoutRef.current = null;
            const mainSeries = mainSeriesRef.current;
            if (!mainSeries) return;

            const wrapper = wrapperRef.current;
            const normalizedSymbol = symbol.toUpperCase();
            const visiblePositions = positionsRef.current.filter((p) => p.symbol?.toUpperCase() === normalizedSymbol);

            // Track which IDs are still visible
            const activeIds = new Set(visiblePositions.map(p => p.id));

            // Remove lines that are no longer visible
            for (const [id, state] of persistentPositionLinesRef.current.entries()) {
                if (!activeIds.has(id)) {
                    try { mainSeries.removePriceLine(state.mainLine); } catch { }
                    if (state.slLine) try { mainSeries.removePriceLine(state.slLine); } catch { }
                    if (state.tpLine) try { mainSeries.removePriceLine(state.tpLine); } catch { }
                    state.mainOverlay.remove();
                    state.slOverlay?.remove();
                    state.tpOverlay?.remove();
                    persistentPositionLinesRef.current.delete(id);
                }
            }

            // Sync overlays ref for updatePositionLineOverlays
            positionLineOverlaysRef.current = [];

            for (const position of visiblePositions) {
                const isBuy = position.type === 'buy';
                const openColor = isBuy ? 'hsl(var(--success))' : 'hsl(var(--destructive))'; // Green for Buy, Red for Sell
                const slColor = STOP_LOSS_LINE_COLOR;
                const tpColor = TAKE_PROFIT_LINE_COLOR;

                const createOrUpdateOverlay = (
                    role: PositionMarkerRole,
                    price: number,
                    color: string,
                    label: string,
                    title: string,
                    existingOverlay?: HTMLDivElement
                ) => {
                    if (!wrapper) return undefined;

                    const overlay: HTMLDivElement = existingOverlay ?? document.createElement('div');
                    if (!existingOverlay) {
                        const canDrag = Boolean(onUpdatePositionRef.current);
                        overlay.style.cssText = `position:absolute;left:0;right:0;top:0;height:14px;transform:translateY(-50%);z-index:8;display:none;pointer-events:${canDrag ? 'auto' : 'none'};cursor:${canDrag ? 'ns-resize' : 'default'};user-select:none;`;

                        const container = document.createElement('div');
                        container.className = 'position-badge-container';
                        container.style.cssText = role === 'open'
                            ? RIGHT_ALIGNED_POSITION_BADGE_STYLE
                            : CENTERED_POSITION_BADGE_STYLE;

                        if (role === 'open') {
                            const tpMini = document.createElement('div');
                            tpMini.className = 'mini-badge-tp';
                            tpMini.style.cssText = `padding:3px 6px;border:1px solid ${tpColor};color:${tpColor};background:hsl(var(--background)/0.85);backdrop-filter:blur(4px);border-radius:4px;font-size:10px;font-family:Inter,system-ui,sans-serif;font-weight:700;cursor:ns-resize;display:none;transition:all 0.2s ease;`;
                            tpMini.textContent = 'TP';
                            tpMini.addEventListener('pointerdown', (e) => {
                                e.stopPropagation();
                                startPositionMarkerDrag(e, position, 'tp', price);
                            });
                            container.appendChild(tpMini);

                            const slMini = document.createElement('div');
                            slMini.className = 'mini-badge-sl';
                            slMini.style.cssText = `padding:3px 6px;border:1px solid ${slColor};color:${slColor};background:hsl(var(--background)/0.85);backdrop-filter:blur(4px);border-radius:4px;font-size:10px;font-family:Inter,system-ui,sans-serif;font-weight:700;cursor:ns-resize;display:none;transition:all 0.2s ease;`;
                            slMini.textContent = 'SL';
                            slMini.addEventListener('pointerdown', (e) => {
                                e.stopPropagation();
                                startPositionMarkerDrag(e, position, 'sl', price);
                            });
                            container.appendChild(slMini);

                            const connectLine = document.createElement('div');
                            connectLine.className = 'hover-connect-line';
                            connectLine.style.cssText = `position:absolute; width:1px; background:${color}; z-index:-1; pointer-events:none;`;
                            
                            const createDot = (className: string) => {
                                const dot = document.createElement('div');
                                dot.className = className;
                                dot.style.cssText = `position:absolute; width:7px; height:7px; border-radius:50%; border:1.5px solid ${color}; background:hsl(var(--background)); left:-3px; transform:translateY(-50%); display:none;`;
                                return dot;
                            };
                            
                            const dotOpen = createDot('dot-open');
                            dotOpen.style.display = 'block';
                            dotOpen.style.boxShadow = `0 0 0 4px ${color}40`;
                            const dotSL = createDot('dot-sl');
                            const dotTP = createDot('dot-tp');
                            
                            connectLine.appendChild(dotOpen);
                            connectLine.appendChild(dotSL);
                            connectLine.appendChild(dotTP);
                            container.appendChild(connectLine);
                        }

                        const tooltip = document.createElement('div');
                        tooltip.className = 'hover-tooltip';
                        tooltip.style.cssText = `position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);background:hsl(var(--popover));border:1px solid hsl(var(--border));border-radius:4px;padding:6px 10px;color:hsl(var(--foreground));font-size:11px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,0.5);opacity:0;pointer-events:none;transition:opacity 0.15s ease;z-index:10;`;

                        const badge = document.createElement('div');
                        badge.className = 'main-badge';
                        // Base styles for the badge
                        badge.style.cssText = `display:flex;align-items:center;border:1px solid ${color};border-radius:4px;background:hsl(var(--background));color:hsl(var(--muted-foreground));font-size:11px;font-family:Inter,system-ui,sans-serif;white-space:nowrap;overflow:hidden;cursor:pointer;`;

                        // No initial override needed, handled in update loop

                        badge.addEventListener('mouseenter', () => {
                            tooltip.style.opacity = '1';
                            overlay.style.zIndex = '50';
                        });
                        badge.addEventListener('mouseleave', () => {
                            tooltip.style.opacity = '0';
                            overlay.style.zIndex = '8';
                        });

                        const volSpan = document.createElement('span');
                        volSpan.className = 'badge-vol';
                        volSpan.style.cssText = `padding:3px 8px;background:transparent;color:inherit;font-weight:500;border-right:1px solid ${role === 'open' ? 'rgba(0,0,0,0.2)' : 'hsl(var(--border))'};`;

                        const textSpan = document.createElement('span');
                        textSpan.className = 'badge-text';
                        textSpan.style.cssText = `padding:3px 8px;font-weight:500;border-right:1px solid ${role === 'open' ? 'rgba(0,0,0,0.2)' : 'hsl(var(--border))'};`;
                        if (role === 'open') {
                            textSpan.style.display = 'none'; // Exness hides P/L on the open line badge itself in this specific view
                        }

                        const closeBtn = document.createElement('div');
                        closeBtn.className = 'badge-close';
                        closeBtn.style.cssText = `padding:3px 8px;background:transparent;color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;transition:opacity 0.15s;opacity:0.7;`;
                        closeBtn.innerHTML = '&#10005;';
                        closeBtn.addEventListener('pointerdown', (e) => {
                            e.stopPropagation(); // crucial to prevent drag
                        });

                        badge.appendChild(volSpan);
                        badge.appendChild(textSpan);
                        badge.appendChild(closeBtn);
                        container.appendChild(tooltip);
                        container.appendChild(badge);
                        overlay.appendChild(container);
                        wrapper.appendChild(overlay);

                        overlay.addEventListener('pointerdown', (event) => startPositionMarkerDrag(event, position, role, price));
                    }

                    const canDrag = Boolean(onUpdatePositionRef.current);

                    const container = overlay.firstChild as HTMLDivElement;
                    if (container) {
                        container.style.cssText = role === 'open'
                            ? RIGHT_ALIGNED_POSITION_BADGE_STYLE
                            : CENTERED_POSITION_BADGE_STYLE;

                        if (role === 'open') {
                            const tpMini = container.querySelector('.mini-badge-tp') as HTMLDivElement;
                            const slMini = container.querySelector('.mini-badge-sl') as HTMLDivElement;
                            if (tpMini) tpMini.style.display = (typeof position.tp === 'number') ? 'none' : 'block';
                            if (slMini) slMini.style.display = (typeof position.sl === 'number') ? 'none' : 'block';
                        }

                        const tooltip = container.querySelector('.hover-tooltip') as HTMLDivElement;
                        const badge = container.querySelector('.main-badge') as HTMLDivElement;
                        if (badge) {
                            badge.style.borderColor = color;
                            if (role === 'open') {
                                badge.style.background = 'hsl(var(--background))';
                                badge.style.color = 'hsl(var(--foreground))';
                            } else {
                                badge.style.background = 'hsl(var(--background))';
                                badge.style.color = 'hsl(var(--muted-foreground))';
                            }

                            const volSpan = badge.querySelector('.badge-vol') as HTMLSpanElement;
                            const textSpan = badge.querySelector('.badge-text') as HTMLSpanElement;
                            const closeBtn = badge.querySelector('.badge-close') as HTMLDivElement;

                            if (role === 'open') {
                                if (volSpan) {
                                    volSpan.style.background = color;
                                    volSpan.style.color = 'hsl(var(--background))';
                                    volSpan.style.borderRight = 'none';
                                }
                                if (closeBtn) {
                                    closeBtn.style.background = 'transparent';
                                    closeBtn.style.color = 'hsl(var(--muted-foreground))';
                                    
                                    const connectLine = container.querySelector('.hover-connect-line') as HTMLDivElement;
                                    const dotOpen = connectLine?.querySelector('.dot-open') as HTMLDivElement;
                                    const dotSL = connectLine?.querySelector('.dot-sl') as HTMLDivElement;
                                    const dotTP = connectLine?.querySelector('.dot-tp') as HTMLDivElement;

                                    // Always re-sync colors so Buy=blue, Sell=red
                                    if (connectLine) connectLine.style.background = color;
                                    if (dotOpen) {
                                        dotOpen.style.borderColor = color;
                                        dotOpen.style.boxShadow = `0 0 0 4px ${color}40`;
                                    }
                                    if (dotSL) dotSL.style.borderColor = color;
                                    if (dotTP) dotTP.style.borderColor = color;

                                    const updateConnectLine = () => {
                                        if (!connectLine) return;
                                        const mainSeries = mainSeriesRef.current;
                                        if (!mainSeries) return;
                                        
                                        const y_open = mainSeries.priceToCoordinate(position.openPrice);
                                        const y_sl = typeof position.sl === 'number' ? mainSeries.priceToCoordinate(position.sl) : null;
                                        const y_tp = typeof position.tp === 'number' ? mainSeries.priceToCoordinate(position.tp) : null;
                                        
                                        if (y_open === null) return;
                                        
                                        const y_vals = [y_open];
                                        if (y_sl !== null) y_vals.push(y_sl);
                                        if (y_tp !== null) y_vals.push(y_tp);
                                        
                                        const min_y = Math.min(...y_vals);
                                        const max_y = Math.max(...y_vals);
                                        
                                        connectLine.style.top = '50%';
                                        connectLine.style.marginTop = `${min_y - y_open}px`;
                                        connectLine.style.height = `${max_y - min_y}px`;
                                        connectLine.style.left = `${badge.offsetLeft + badge.offsetWidth + 12}px`;
                                        
                                        if (dotOpen) dotOpen.style.top = `${y_open - min_y}px`;
                                        if (dotSL) {
                                            dotSL.style.display = y_sl !== null ? 'block' : 'none';
                                            if (y_sl !== null) dotSL.style.top = `${y_sl - min_y}px`;
                                        }
                                        if (dotTP) {
                                            dotTP.style.display = y_tp !== null ? 'block' : 'none';
                                            if (y_tp !== null) dotTP.style.top = `${y_tp - min_y}px`;
                                        }
                                        // Do NOT set display here â€” visibility is driven by closeBtn hover only
                                    };

                                    (overlay as any).updateConnectLine = updateConnectLine;
                                    // Ensure connect line is hidden by default
                                    if (connectLine) connectLine.style.display = 'none';

                                    closeBtn.onmouseenter = () => {
                                        closeBtn.style.opacity = '1';
                                        if (connectLine && (typeof position.sl === 'number' || typeof position.tp === 'number')) {
                                            updateConnectLine();
                                            connectLine.style.display = 'block';
                                        }
                                    };
                                    closeBtn.onmouseleave = () => {
                                        closeBtn.style.opacity = '0.7';
                                        if (connectLine) connectLine.style.display = 'none';
                                    };
                                }
                            } else {
                                if (volSpan) {
                                    volSpan.style.background = 'transparent';
                                    volSpan.style.color = 'hsl(var(--muted-foreground))';
                                    volSpan.style.borderRight = '1px solid hsl(var(--border))';
                                }
                                if (closeBtn) {
                                    closeBtn.style.color = 'hsl(var(--muted-foreground))';
                                    closeBtn.onmouseenter = () => {
                                        closeBtn.style.opacity = '1';
                                        // Show the open overlay's connect line
                                        const posState = persistentPositionLinesRef.current.get(position.id);
                                        const openOverlay = posState?.mainOverlay;
                                        if (openOverlay) {
                                            const openUpdateFn = (openOverlay as any).updateConnectLine as (() => void) | undefined;
                                            const openConnectLine = openOverlay.querySelector('.hover-connect-line') as HTMLDivElement | null;
                                            if (openConnectLine && (typeof position.sl === 'number' || typeof position.tp === 'number')) {
                                                if (openUpdateFn) openUpdateFn();
                                                openConnectLine.style.display = 'block';
                                            }
                                        }
                                    };
                                    closeBtn.onmouseleave = () => {
                                        closeBtn.style.opacity = '0.7';
                                        // Hide the open overlay's connect line
                                        const posState = persistentPositionLinesRef.current.get(position.id);
                                        const openOverlay = posState?.mainOverlay;
                                        if (openOverlay) {
                                            const openConnectLine = openOverlay.querySelector('.hover-connect-line') as HTMLDivElement | null;
                                            if (openConnectLine) openConnectLine.style.display = 'none';
                                        }
                                    };
                                }
                            }

                            const digits = position.digits ?? pricePrecision;
                            const contractSize = position.contractSize || 100000;
                            const isBuy = position.type === 'buy';

                            let projectedProfit = 0;
                            let diff = 0;
                            const currentLivePrice = livePriceRef.current;

                            if (role === 'open') {
                                if (currentLivePrice != null) {
                                    diff = isBuy ? currentLivePrice - position.openPrice : position.openPrice - currentLivePrice;
                                    projectedProfit = diff * position.volume * contractSize;
                                } else {
                                    projectedProfit = position.profit ?? 0;
                                }
                            } else {
                                diff = isBuy ? price - position.openPrice : position.openPrice - price;
                                projectedProfit = diff * position.volume * contractSize;
                            }

                            const sign = projectedProfit >= 0 ? '+' : '';
                            const usdText = `${sign}${projectedProfit.toFixed(2)} USD`;
                            const ticksText = diff !== 0 ? (diff * Math.pow(10, digits)).toFixed(1) : '0.0';
                            const pctText = position.openPrice > 0 ? ((diff / position.openPrice) * 100).toFixed(2) : '0.00';

                            if (role !== 'open' && tooltip) {
                                const roleText = role === 'sl' ? 'Stop Loss' : 'Take Profit';
                                tooltip.innerHTML = `<div style="margin-bottom:2px;"><b>${roleText}</b> <span style="margin-left:8px;">${pctText}%</span> <span style="margin-left:8px;">${ticksText} ticks</span></div><div>Price ${price.toFixed(digits)}</div>`;
                            } else if (tooltip) {
                                tooltip.innerHTML = `<div>Price ${price.toFixed(digits)}</div>`;
                            }

                            if (volSpan) {
                                const volumeText = role === 'open' ? (isBuy ? position.volume.toString() : `-${position.volume}`) : position.volume.toString();
                                volSpan.textContent = volumeText;
                            }

                            if (textSpan && role !== 'open') {
                                textSpan.textContent = ` ${usdText} `;
                                textSpan.style.color = color; // Exness matches the text color to the line color for SL/TP
                            }

                            if (closeBtn) {
                                closeBtn.onpointerdown = (e) => {
                                    e.stopPropagation();
                                    // Always read from data attribute â€” never from captured closure
                                    const currentPositionId = overlay!.dataset.positionId ?? position.id;
                                    if (currentPositionId === 'draft-order') {
                                        if (role !== 'open') {
                                            window.dispatchEvent(
                                                new CustomEvent('terminal:drag-set-sl-tp', {
                                                    detail: {
                                                        symbol: position.symbol,
                                                        type: role.toUpperCase(),
                                                        price: null,
                                                        digits: pricePrecision,
                                                    }
                                                })
                                            );
                                        } else {
                                            window.dispatchEvent(new CustomEvent('terminal:cancel-draft-order'));
                                        }
                                    } else {
                                        if (role !== 'open' && onUpdatePositionRef.current) {
                                            onUpdatePositionRef.current(currentPositionId, { [role]: null });
                                        } else if (role === 'open' && onClosePositionRef.current) {
                                            onClosePositionRef.current(currentPositionId);
                                        }
                                    }
                                };
                            }
                        }
                    }

                    // Stamp the CURRENT position id so close button always reads the live id
                    overlay.dataset.positionId = position.id;
                    positionLineOverlaysRef.current.push({ element: overlay, price, position, role });
                    return overlay;
                };

                let state = persistentPositionLinesRef.current.get(position.id);
                const openLabelText = position.openLabel ?? `${position.type.toUpperCase()} ${position.volume}`;

                if (!state) {
                    state = {
                        mainLine: mainSeries.createPriceLine({
                            price: position.openPrice,
                            color: OPEN_TRADE_LINE_COLOR,
                            lineWidth: 1, // changed from 0.5 to 1 (minimum allowed)
                            lineStyle: LineStyle.Solid,
                            axisLabelVisible: true,
                            axisLabelColor: openColor,
                            axisLabelTextColor: 'hsl(var(--background))',
                        }),
                        mainOverlay: createOrUpdateOverlay(
                            'open',
                            position.openPrice,
                            openColor,
                            openLabelText,
                            `${position.type.toUpperCase()} open. Drag above/below to set TP or SL.`)!
                    };
                    persistentPositionLinesRef.current.set(position.id, state);
                } else {
                    state.mainLine.applyOptions({
                        price: position.openPrice,
                        color: OPEN_TRADE_LINE_COLOR,
                        axisLabelColor: openColor,
                        axisLabelTextColor: 'hsl(var(--background))',
                    });
                    createOrUpdateOverlay('open', position.openPrice, openColor, openLabelText, `${position.type.toUpperCase()} open. Drag above/below to set TP or SL.`, state.mainOverlay);
                }

                if (typeof position.sl === 'number') {
                    const slLabelText = position.slLabel ?? 'SL';
                    if (!state.slLine) {
                        state.slLine = mainSeries.createPriceLine({
                            price: position.sl,
                            color: slColor,
                            lineWidth: 1,
                            lineStyle: LineStyle.Solid,
                            axisLabelVisible: true,
                            title: slLabelText,
                        });
                    } else {
                        state.slLine.applyOptions({ price: position.sl, title: slLabelText });
                    }
                    state.slOverlay = createOrUpdateOverlay('sl', position.sl, slColor, slLabelText, 'Drag to modify stop loss.', state.slOverlay);
                } else if (state.slLine) {
                    try { mainSeries.removePriceLine(state.slLine); } catch { }
                    state.slOverlay?.remove();
                    state.slLine = undefined;
                    state.slOverlay = undefined;
                }

                if (typeof position.tp === 'number') {
                    const tpLabelText = position.tpLabel ?? 'TP';
                    if (!state.tpLine) {
                        state.tpLine = mainSeries.createPriceLine({
                            price: position.tp,
                            color: tpColor,
                            lineWidth: 1,
                            lineStyle: LineStyle.Solid,
                            axisLabelVisible: true,
                            title: tpLabelText,
                        });
                    } else {
                        state.tpLine.applyOptions({ price: position.tp, title: tpLabelText });
                    }
                    state.tpOverlay = createOrUpdateOverlay('tp', position.tp, tpColor, tpLabelText, 'Drag to modify take profit.', state.tpOverlay);
                } else if (state.tpLine) {
                    try { mainSeries.removePriceLine(state.tpLine); } catch { }
                    state.tpOverlay?.remove();
                    state.tpLine = undefined;
                    state.tpOverlay = undefined;
                }
            }
            updatePositionLineOverlays();
            syncMarkersRef.current?.();
        }, 16); // ~60fps throttle
    }, [clearPositionLines, palette.down, palette.up, startPositionMarkerDrag, symbol, updatePositionLineOverlays]);

    useEffect(() => {
        positionsRef.current = positions;
        syncPositionLines();
    }, [positions, syncPositionLines]);

    useEffect(() => {
        ohlcService.setSimulationSeedPrice(symbol, effectiveBasePrice);
    }, [effectiveBasePrice, symbol]);

    useEffect(() => {
        if (!tradingSessionId && !syntheticMarketDataEnabled) {
            return;
        }

        fetchMt5Session().catch(handleMt5SessionWarmupError);
    }, [symbol, syntheticMarketDataEnabled, tradingSessionId]);

    const shouldShowVolumeSeries = showVolume || showTickVolumes || showRealVolumes;
    const activePriceScaleMargins = shouldShowVolumeSeries
        ? PRICE_SCALE_MARGINS
        : PRICE_ONLY_SCALE_MARGINS;
    const shouldShowVolumeSeriesRef = useRef(shouldShowVolumeSeries);
    const volumeSeriesRefreshRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        shouldShowVolumeSeriesRef.current = shouldShowVolumeSeries;
        volumeSeriesRef.current?.applyOptions({ visible: shouldShowVolumeSeries });
        if (shouldShowVolumeSeries) {
            volumeSeriesRefreshRef.current?.();
        }
    }, [shouldShowVolumeSeries]);

    // Live settings patch â€” avoid full chart rebuild on color toggles.
    useEffect(() => {
        const chart = chartRef.current;
        const mainSeries = mainSeriesRef.current;
        if (!chart || !mainSeries) return;

        const bullColor = visualColors.bullCandle;
        const bearColor = visualColors.bearCandle;
        const barUpColor = visualColors.barUp;
        const barDownColor = visualColors.barDown;
        const bgColor = visualColors.background;
        const fgColor = visualColors.foreground;
        const gridColor = visualColors.grid;

        chart.applyOptions({
            layout: {
                background: { type: ColorType.Solid, color: bgColor },
                textColor: fgColor,
            },
            grid: {
                vertLines: { color: showGridLines ? gridColor : 'transparent', style: LineStyle.Solid },
                horzLines: { color: showGridLines ? gridColor : 'transparent', style: LineStyle.Solid },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: fgColor,
                    width: visualConfig.lineWidths.crosshair,
                    style: crosshairDashed ? LineStyle.Dashed : LineStyle.Solid,
                    labelBackgroundColor: palette.surfaceRaised,
                },
                horzLine: {
                    color: fgColor,
                    width: visualConfig.lineWidths.crosshair,
                    style: crosshairDashed ? LineStyle.Dashed : LineStyle.Solid,
                    labelBackgroundColor: palette.surfaceRaised,
                },
            },
            rightPriceScale: {
                visible: showPriceLabel,
                borderColor: fgColor,
                scaleMargins: activePriceScaleMargins,
                autoScale: !scaleFixOneToOne,
            },
            timeScale: {
                borderColor: fgColor,
                fixLeftEdge: false,
                fixRightEdge: !chartShift && !showPriceLabel,
                rightOffset: getPreferredRightOffset(),
            },
            handleScroll: { pressedMouseMove: !autoScrollEnabled, vertTouchDrag: false, horzTouchDrag: true, mouseWheel: false },
            handleScale: {
                axisPressedMouseMove: { time: false, price: false },
                axisDoubleClickReset: { time: false, price: true },
                mouseWheel: false,
                pinch: false,
            },
        });

        if (chartType === 'Candles') {
            mainSeries.applyOptions({
                upColor: showBody ? bullColor : visualConfig.transparentColor,
                downColor: showBody ? bearColor : visualConfig.transparentColor,
                borderVisible: showBorders,
                borderUpColor: barUpColor,
                borderDownColor: barDownColor,
                wickVisible: showWick,
                wickUpColor: barUpColor,
                wickDownColor: barDownColor,
            });
        } else if (chartType === 'Hollow Candles') {
            mainSeries.applyOptions({
                upColor: visualConfig.transparentColor,
                downColor: bearColor,
                borderVisible: true,
                borderUpColor: barUpColor,
                borderDownColor: barDownColor,
                wickVisible: true,
                wickUpColor: barUpColor,
                wickDownColor: barDownColor,
            });
        } else if (chartType === 'Bars') {
            mainSeries.applyOptions({
                upColor: barUpColor,
                downColor: barDownColor,
            });
        } else if (chartType === 'Line') {
            mainSeries.applyOptions({
                color: visualColors.lineChart,
                lineColor: visualColors.lineChart,
            } as any);
        }

        const volSeries = volumeSeriesRef.current;
        if (volSeries) {
            volSeries.applyOptions({
                visible: shouldShowVolumeSeries,
                color: visualColors.volumeUp,
            });
            volSeries.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
        }
    }, [
        activePriceScaleMargins,
        autoScrollEnabled,
        chartShift,
        chartType,
        crosshairDashed,
        getPreferredRightOffset,
        palette.surfaceRaised,
        scaleFixOneToOne,
        shouldShowVolumeSeries,
        showBody,
        showBorders,
        showGridLines,
        showPriceLabel,
        showWick,
        visualColors,
        visualConfig,
    ]);

    const chartInstanceLifecycleKey = useMemo(() => JSON.stringify({
        accountSessionScopeId: normalizedAccountSessionScopeId,
        timeframeMinutes: selectedResolution.minutes,
        theme,
        chartType,
        tradingSessionId,
        refreshToken,
        activePriceScaleMargins,
        autoScrollEnabled,
        chartShift,
        crosshairDashed,
        scaleFixOneToOne,
        shouldShowVolumeSeries,
        showBody,
        showBorders,
        showGridLines,
        showPriceLabel,
        showWick,
    }), [
        activePriceScaleMargins,
        autoScrollEnabled,
        chartShift,
        chartType,
        crosshairDashed,
        normalizedAccountSessionScopeId,
        refreshToken,
        scaleFixOneToOne,
        selectedResolution.minutes,
        shouldShowVolumeSeries,
        showBody,
        showBorders,
        showGridLines,
        showPriceLabel,
        showWick,
        theme,
        tradingSessionId,
    ]);
    const latestChartInstanceLifecycleKeyRef = useRef(chartInstanceLifecycleKey);
    latestChartInstanceLifecycleKeyRef.current = chartInstanceLifecycleKey;

    // Rebuild after paint so the symbol list and the rest of the terminal can stay
    // responsive while the chart swaps symbols/timeframes.
    useEffect(() => {
        let disposed = false;
        const chartSwitchId = chartSwitchSequenceRef.current + 1;
        chartSwitchSequenceRef.current = chartSwitchId;
        activeChartSwitchRef.current = {
            id: chartSwitchId,
            accountSessionScopeId: normalizedAccountSessionScopeId,
            symbol,
            timeframeMinutes: selectedResolution.minutes,
        };
        const isActiveRenderedChartSwitch = () => (
            !disposed &&
            activeChartSwitchRef.current.id === chartSwitchId &&
            activeChartSwitchRef.current.accountSessionScopeId === normalizedAccountSessionScopeId &&
            activeChartSwitchRef.current.timeframeMinutes === selectedResolution.minutes &&
            symbolsMatch(activeChartSwitchRef.current.symbol, symbol)
        );
        const isCurrentChartSwitch = () => (
            isActiveRenderedChartSwitch() &&
            ohlcService.isCurrentSession(normalizedAccountSessionScopeId)
        );
        const incomingMatchesCurrentChartSwitch = (
            incomingSymbol: string,
            incomingTimeframe: number,
        ) => (
            isCurrentChartSwitch() &&
            incomingTimeframe === selectedResolution.minutes &&
            symbolsMatch(incomingSymbol, symbol)
        );
        const chartDataStreamKey = [
            normalizedAccountSessionScopeId ?? 'terminal',
            symbol.trim().toUpperCase(),
            selectedResolution.minutes,
        ].join(':');
        const atomicSwitchSeed = atomicChartSwitchSeedRef.current?.streamKey === chartDataStreamKey
            ? atomicChartSwitchSeedRef.current
            : null;
        const atomicSwitchSeedBars = atomicSwitchSeed?.bars ?? [];
        const hasAtomicSwitchSeed = atomicSwitchSeedBars.length > 0;
        const prepaintBucketMs = selectedResolution.minutes * 60 * 1000;
        const syncSeedBars = ohlcService.getSyncBars(
            symbol,
            selectedResolution.minutes,
            normalizedAccountSessionScopeId,
        );
        const renderableSyncSeedBars = syncSeedBars.filter((bar) =>
            isRenderableCachedOrHistoricalBar(bar) &&
            isBarInsideChartSymbolPriceDomain(symbol, bar),
        );
        const syncSeedMetadata = ohlcService.getHistoryMetadata(
            symbol,
            selectedResolution.minutes,
            normalizedAccountSessionScopeId,
        );
        const syncSeedBaselineDecision = getLatestCleanHistoryBaselineDecision(
            renderableSyncSeedBars,
            [],
            prepaintBucketMs,
            syncSeedMetadata,
            LIVE_HISTORY_BASELINE_OPTIONS,
        );
        // ── Instant symbol switch: always show cached bars ──────────────────────
        // If we have ANY cached bars for this symbol, display them immediately
        // even if the baseline decision is "unclean" (stale metadata, pending
        // backfill, reconnect flush). A stale chart is infinitely better than a
        // full-screen spinner. The async history fetch will patch data as it
        // arrives. Only show spinner when there are truly zero bars (first-ever
        // load of a symbol that has never been fetched in this session).
        // TradingView / Bloomberg pattern: optimistic render → background refresh.
        const cleanRenderableSyncSeedBars = renderableSyncSeedBars.length > 0
            ? renderableSyncSeedBars
            : (syncSeedBaselineDecision.ready ? renderableSyncSeedBars : []);
        const hasRenderableSyncSeedBars = renderableSyncSeedBars.length > 0;
        // ── Graceful loading: never flash blank for fast switches ───────────────
        // If we have cached bars → show them immediately (isLoading=false).
        // If we have ZERO bars → DON'T blank immediately. Give the in-flight WS
        // request 400ms to arrive. If bars come in time, the timer is cancelled
        // and the screen never goes blank. Only blank after 400ms of real absence.
        if (gracefulLoadingTimerRef.current !== null) {
            clearTimeout(gracefulLoadingTimerRef.current);
            gracefulLoadingTimerRef.current = null;
        }
        if (hasRenderableSyncSeedBars) {
            setIsLoading(false);
        } else {
            // Delay the loading state so a fast WS response can pre-empt it.
            gracefulLoadingTimerRef.current = setTimeout(() => {
                gracefulLoadingTimerRef.current = null;
                if (!isCurrentChartSwitch()) {
                    return;
                }
                setIsLoading(true);
                notifyHistoryStatusChange({ isLoading: true, hasCandles: false });
            }, 400);
        }

        // Helper used by all setIsLoading(false) call sites below so the graceful
        // 400ms timer is always cancelled when bars actually arrive.
        const clearLoadingTimer = () => {
            if (gracefulLoadingTimerRef.current !== null) {
                clearTimeout(gracefulLoadingTimerRef.current);
                gracefulLoadingTimerRef.current = null;
            }
        };

        const host = chartHostRef.current;
        const wrapper = wrapperRef.current;
        if (!host || !wrapper) {
            return () => {
                disposed = true;
                clearLoadingTimer();
            };
        }

        const existingChart = chartRef.current;
        const existingMainSeries = existingChart ? mainSeriesRef.current : null;
        const existingVolumeSeries = existingChart ? volumeSeriesRef.current : null;
        if (!existingChart) {
            host.innerHTML = '';
        }

        const getChartHostSize = () => {
            const rect = host.getBoundingClientRect();
            const wrapperRect = wrapper.getBoundingClientRect();
            const width = Math.floor(rect.width || wrapperRect.width);
            const height = Math.floor(rect.height || wrapperRect.height);

            return width > 0 && height > 0 ? { width, height } : null;
        };

        const digits = Math.max(0, pricePrecision);
        const minMove = 1 / Math.pow(10, digits);
        const priceFormatOpts = { type: 'price' as const, precision: digits, minMove };
        const autoscaleInfoProvider = (original: () => any) => {
            const autoscaleInfo = original();
            const priceRange = autoscaleInfo?.priceRange;
            const manualPriceRange = manualPriceRangeRef.current;

            if (!priceRange) {
                return autoscaleInfo;
            }

            if (
                manualPriceRange &&
                Number.isFinite(manualPriceRange.minValue) &&
                Number.isFinite(manualPriceRange.maxValue) &&
                manualPriceRange.maxValue > manualPriceRange.minValue
            ) {
                return {
                    ...autoscaleInfo,
                    priceRange: manualPriceRange,
                };
            }

            return {
                ...autoscaleInfo,
                priceRange: expandPriceRangeToMinVisibleRange(priceRange, digits),
            };
        };
        const initialSize = getChartHostSize();
        const bucketMs = prepaintBucketMs;
        const programmaticBarSpacingGuard = createProgrammaticBarSpacingGuard();
        const markProgrammaticBarSpacing = (spacing?: unknown) => {
            programmaticBarSpacingGuard.markProgrammaticChange(spacing);
        };
        const shouldIgnoreProgrammaticBarSpacing = (spacing: number) => (
            programmaticBarSpacingGuard.shouldIgnoreSpacingChange(spacing)
        );
        const applyTimeScaleOptions = (options: Record<string, unknown>) => {
            markProgrammaticBarSpacing(options.barSpacing);
            chart.timeScale().applyOptions(options as any);
        };
        const normalizeChartBarSpacingToPreferred = () => {
            const preferredBarSpacing = getPreferredBarSpacing(visualConfig.timeScale.barSpacing);
            applyTimeScaleOptions({
                barSpacing: preferredBarSpacing,
                rightOffset: getPreferredRightOffset(preferredBarSpacing),
            });
        };
        const realTimeToSeriesTime = new Map<number, UTCTimestamp>();
        const seriesTimeToRealTime = new Map<number, number>();
        const compactSlotSeconds = COMPACT_SERIES_SLOT_SECONDS;
        let latestSeriesTime: UTCTimestamp | null = null;
        let latestCommittedSeriesTime: UTCTimestamp | null = null;

        const getLatestKnownSeriesTime = (): UTCTimestamp | null => {
            if (latestSeriesTime !== null) {
                return latestSeriesTime;
            }

            let latestRenderedTime: number | null = null;
            for (const seriesTime of displayBarsBySeriesTime.keys()) {
                const numericSeriesTime = Number(seriesTime);
                if (
                    Number.isFinite(numericSeriesTime) &&
                    (latestRenderedTime === null || numericSeriesTime > latestRenderedTime)
                ) {
                    latestRenderedTime = numericSeriesTime;
                }
            }

            return latestRenderedTime === null ? null : latestRenderedTime as UTCTimestamp;
        };

        const getSeriesTimeLabel = (time: unknown) => {
            const seriesTime = typeof time === 'number' ? time : null;
            const realDisplayTime = seriesTime !== null
                ? seriesTimeToRealTime.get(seriesTime)
                : undefined;
            const compactDisplayTime = realDisplayTime ?? (seriesTime !== null
                ? seriesTime * 1000
                : Date.now()
            );

            // When the real calendar day changes between two adjacent compact slots, show the
            // date label (e.g. "May 22") so the axis doesn't appear to jump backward in time
            // (e.g. 13:20 yesterday → 08:01 today looks broken without this guard).
            if (realDisplayTime !== undefined && seriesTime !== null && selectedResolution.minutes < 1440) {
                const prevRealMs = seriesTimeToRealTime.get((seriesTime - compactSlotSeconds) as UTCTimestamp);
                if (prevRealMs !== undefined) {
                    if (Math.floor(realDisplayTime / 86400000) !== Math.floor(prevRealMs / 86400000)) {
                        return new Intl.DateTimeFormat('en-US', {
                            month: 'short', day: 'numeric', timeZone: 'UTC',
                        }).format(realDisplayTime);
                    }
                }
            }

            return formatAxisTime(compactDisplayTime, selectedResolution.minutes);
        };

        const getNextSeriesTimeForLiveBar = (bar: OHLCBar): UTCTimestamp => {
            const existingTime = realTimeToSeriesTime.get(bar.time);
            if (existingTime !== undefined) {
                return existingTime;
            }

            // Live bars that arrive after sparse history must advance by one
            // rendered slot, not by elapsed wall-clock time.
            const latestKnownSeriesTime = getLatestKnownSeriesTime();
            const nextSeriesTime = latestKnownSeriesTime !== null
                ? (latestKnownSeriesTime + compactSlotSeconds) as UTCTimestamp
                : getCompactSeriesTime(COMPACT_SERIES_EPOCH_MS, bucketMs, 0);
            realTimeToSeriesTime.set(bar.time, nextSeriesTime);
            seriesTimeToRealTime.set(nextSeriesTime, bar.time);
            return nextSeriesTime;
        };

        const chartOptions = {
            width: initialSize?.width ?? 600,
            height: initialSize?.height ?? 400,
            layout: {
                background: { type: ColorType.Solid, color: visualColors.background },
                textColor: visualColors.foreground,
                attributionLogo: false,
                fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: showGridLines ? visualColors.grid : 'transparent', style: LineStyle.Solid },
                horzLines: { color: showGridLines ? visualColors.grid : 'transparent', style: LineStyle.Solid },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: visualColors.foreground,
                    width: visualConfig.lineWidths.crosshair,
                    style: crosshairDashed ? LineStyle.Dashed : LineStyle.Solid,
                    labelBackgroundColor: palette.surfaceRaised,
                },
                horzLine: {
                    color: visualColors.foreground,
                    width: visualConfig.lineWidths.crosshair,
                    style: crosshairDashed ? LineStyle.Dashed : LineStyle.Solid,
                    labelBackgroundColor: palette.surfaceRaised,
                },
            },
            rightPriceScale: {
                visible: showPriceLabel,
                borderColor: visualColors.foreground,
                scaleMargins: activePriceScaleMargins,
                autoScale: !scaleFixOneToOne,
            },
            timeScale: {
                borderColor: visualColors.foreground,
                timeVisible: true,
                secondsVisible: false,
                tickMarkFormatter: getSeriesTimeLabel as any,
                barSpacing: getPreferredBarSpacing(visualConfig.timeScale.barSpacing),
                minBarSpacing: visualConfig.timeScale.minBarSpacing,
                rightOffset: getPreferredRightOffset(),
                fixLeftEdge: false,
                fixRightEdge: !chartShift && !showPriceLabel,
            },
            localization: {
                timeFormatter: getSeriesTimeLabel as any,
            },
            handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: false, pressedMouseMove: !autoScrollEnabled },
            handleScale: {
                axisPressedMouseMove: { time: false, price: false },
                axisDoubleClickReset: { time: false, price: true },
                mouseWheel: false,
                pinch: false,
            },
        };

        const chart = existingChart ?? createChart(host, chartOptions);
        if (existingChart) {
            chart.applyOptions(chartOptions);
        }

        chartRef.current = chart;

        const rememberChartBarSpacing = () => {
            try {
                const spacing = (chart.timeScale().options() as any).barSpacing;
                if (typeof spacing !== 'number' || !Number.isFinite(spacing) || spacing <= 0) {
                    return;
                }

                if (shouldIgnoreProgrammaticBarSpacing(spacing)) {
                    return;
                }

                chartBarSpacingRef.current = spacing;
                onChartBarSpacingChangeRef.current?.(spacing);
            } catch {
                // Chart can be disposed while async history/render callbacks settle.
            }
        };

        const initBull = visualColors.bullCandle;
        const initBear = visualColors.bearCandle;
        const initBarUp = visualColors.barUp;
        const initBarDown = visualColors.barDown;
        const getOrCreateMainSeries = (seriesDefinition: any, options: Record<string, unknown>) => {
            if (existingMainSeries) {
                existingMainSeries.applyOptions(options as any);
                return existingMainSeries;
            }

            return chart.addSeries(seriesDefinition, options as any);
        };

        let mainSeries: ISeriesApi<any>;
        switch (chartType) {
            case 'Bars':
                mainSeries = getOrCreateMainSeries(BarSeries, {
                    upColor: initBarUp,
                    downColor: initBarDown,
                    priceFormat: priceFormatOpts,
                    autoscaleInfoProvider,
                    priceLineVisible: false,
                    lastValueVisible: false,
                });
                break;
            case 'Hollow Candles':
                mainSeries = getOrCreateMainSeries(CandlestickSeries, {
                    upColor: visualConfig.transparentColor,
                    downColor: initBear,
                    borderVisible: true,
                    wickVisible: true,
                    borderUpColor: initBarUp,
                    borderDownColor: initBarDown,
                    wickUpColor: initBarUp,
                    wickDownColor: initBarDown,
                    priceFormat: priceFormatOpts,
                    autoscaleInfoProvider,
                    priceLineVisible: false,
                    lastValueVisible: false,
                });
                break;
            case 'Line':
                mainSeries = getOrCreateMainSeries(LineSeries, {
                    color: visualColors.lineChart,
                    lineWidth: visualConfig.lineWidths.lineSeries,
                    priceFormat: priceFormatOpts,
                    autoscaleInfoProvider,
                    priceLineVisible: false,
                    lastValueVisible: false,
                });
                break;
            case 'Candles':
            default:
                mainSeries = getOrCreateMainSeries(CandlestickSeries, {
                    upColor: initBull,
                    downColor: initBear,
                    borderVisible: true,
                    wickVisible: true,
                    borderUpColor: initBarUp,
                    borderDownColor: initBarDown,
                    wickUpColor: initBarUp,
                    wickDownColor: initBarDown,
                    priceFormat: priceFormatOpts,
                    autoscaleInfoProvider,
                    priceLineVisible: false,
                    lastValueVisible: false,
                });
                break;
        }
        mainSeriesRef.current = mainSeries;
        seriesMarkersPluginRef.current = createSeriesMarkers<UTCTimestamp>(mainSeries as ISeriesApi<any, UTCTimestamp>);

        // Marker sync: wire once here so syncPositionLines and applyBars can call it.
        // The closure captures realTimeToSeriesTime which is mutated in-place, so markers
        // always reflect the most recent compact-series layout.
        syncMarkersRef.current = () => {
            const markers: SeriesMarker<UTCTimestamp>[] = [];
            for (const pos of positionsRef.current) {
                if (pos.id === 'draft-order' || !pos.openTime) continue;
                // openTime is formatted as "YYYY-MM-DD HH:MM:SS" from toISOString() (UTC).
                // Append 'Z' so Date parses it as UTC, not local time.
                const openMs = typeof pos.openTime === 'number'
                    ? pos.openTime
                    : new Date(pos.openTime.trim().replace(' ', 'T') + 'Z').getTime();
                if (!Number.isFinite(openMs) || openMs <= 0) continue;
                const bucketStart = Math.floor(openMs / bucketMs) * bucketMs;
                const seriesTime = realTimeToSeriesTime.get(bucketStart);
                if (seriesTime === undefined) continue;
                markers.push({
                    time: seriesTime,
                    position: pos.type === 'buy' ? 'belowBar' : 'aboveBar',
                    color: pos.type === 'buy' ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
                    shape: pos.type === 'buy' ? 'arrowUp' : 'arrowDown',
                    text: `${pos.type === 'buy' ? 'B' : 'S'} ${pos.volume.toFixed(2)}`,
                    size: 1,
                });
            }
            markers.sort((a, b) => (a.time as number) - (b.time as number));
            seriesMarkersPluginRef.current?.setMarkers(markers);
        };

        const volumeSeriesOptions = {
            color: visualColors.volumeUp,
            priceScaleId: '',
            priceFormat: { type: 'volume' },
            lastValueVisible: false,
            priceLineVisible: false,
            visible: shouldShowVolumeSeries,
        } as const;
        const volSeries = existingVolumeSeries ?? chart.addSeries(HistogramSeries, volumeSeriesOptions);
        if (existingVolumeSeries) {
            existingVolumeSeries.applyOptions(volumeSeriesOptions);
        }
        volSeries.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
        volumeSeriesRef.current = volSeries;

        // â”€â”€ MT5-style live price DOM overlay (rtx-desktop-main parity). â”€â”€
        // Horizontal dashed line + axis-aligned badge tracking tick.close. Repositioned
        // on every bar update AND every visible-range change so it stays glued to the price.
        // Also draggable: drag up â†’ dispatches TP, drag down â†’ dispatches SL.
        const livePriceLine = document.createElement('div');
        livePriceLine.style.cssText = 'position:absolute;left:0;height:0;border-top:1px dashed hsl(var(--destructive));z-index:5;pointer-events:none;display:none;';
        wrapper.appendChild(livePriceLine);
        livePriceLineRef.current = livePriceLine;

        const livePriceBadge = document.createElement('div');
        livePriceBadge.className = 'live-price-axis-badge';
        livePriceBadge.innerHTML = '0.00000';
        livePriceBadge.style.cssText = 'position:absolute;right:0;padding:1px 5px;background:hsl(var(--destructive));color:hsl(var(--destructive-foreground));font-size:11px;font-family:Consolas,\'Courier New\',monospace;font-weight:600;white-space:nowrap;z-index:6;pointer-events:auto;transform:translateY(-50%);text-align:center;display:none;cursor:ns-resize;user-select:none;';
        livePriceBadge.title = 'Drag up for TP, down for SL';
        wrapper.appendChild(livePriceBadge);
        livePriceBadgeRef.current = livePriceBadge;

        // Invisible wide hit-zone sitting over the dashed line so the thin 1px line is draggable.
        const livePriceHit = document.createElement('div');
        livePriceHit.style.cssText = 'position:absolute;left:0;height:10px;background:transparent;z-index:7;pointer-events:auto;cursor:ns-resize;display:none;';
        livePriceHit.title = 'Drag up for TP, down for SL';
        wrapper.appendChild(livePriceHit);
        livePriceHitRef.current = livePriceHit;

        const updateLivePriceOverlay = () => {
            const line = livePriceLineRef.current;
            const badge = livePriceBadgeRef.current;
            const hit = livePriceHitRef.current;
            const series = mainSeriesRef.current;
            const price = livePriceRef.current;
            if (!line || !badge || !hit || !series) return;
            if (price == null) {
                line.style.display = 'none';
                badge.style.display = 'none';
                hit.style.display = 'none';
                return;
            }
            const y = series.priceToCoordinate(price);
            if (y == null) {
                line.style.display = 'none';
                badge.style.display = 'none';
                hit.style.display = 'none';
                return;
            }
            // Hide when live price is scrolled outside the chart's visible Y range.
            // Use cached height (updated on resize) to avoid a forced layout read every frame.
            const hostHeight = cachedHostHeight || host.clientHeight;
            if (hostHeight > 0 && (y < 0 || y > hostHeight)) {
                line.style.display = 'none';
                badge.style.display = 'none';
                hit.style.display = 'none';
                return;
            }
            let scaleW = 0;
            try { scaleW = series.priceScale().width(); } catch { scaleW = 0; }
            const priceScaleInset = getPriceScaleOverlayInset(scaleW);
            line.style.top = `${y}px`;
            line.style.right = `${priceScaleInset.lineRight}px`;
            line.style.display = 'block';
            badge.style.top = `${y}px`;
            badge.style.width = `${priceScaleInset.priceScaleWidth}px`;
            badge.textContent = price.toFixed(Math.max(pricePrecision, 0));
            badge.style.display = 'block';
            // Color the badge/line dynamically: blue when price â‰¥ bar open, red when below.
            const currentBar = currentBarRef.current;
            const liveColor = (currentBar && price >= currentBar.open) ? 'hsl(var(--success))' : 'hsl(var(--destructive))';
            badge.style.background = liveColor;
            line.style.borderTopColor = liveColor;
            hit.style.top = `${y - 5}px`;
            hit.style.right = `${priceScaleInset.lineRight}px`;
            hit.style.display = 'block';

        };
        updateLivePriceOverlayRef.current = updateLivePriceOverlay;

        // â”€â”€ Drag-to-set SL/TP (port of rtx-desktop-main drag-trade behavior, adapted to live price). â”€â”€
        // Up-drag â†’ TP (green); down-drag â†’ SL (red). On release, dispatches 'terminal:drag-set-sl-tp'
        // so forms (OrderPanel) or open positions can react.
        let dragGhostLine: HTMLDivElement | null = null;
        let dragGhostBadge: HTMLDivElement | null = null;
        let dragStartPrice: number | null = null;
        const TP_COLOR = 'hsl(var(--success))';
        const SL_COLOR = 'hsl(var(--destructive))';
        const pipStepSnap = Math.pow(10, -Math.max(pricePrecision, 0)) * 2; // 2-tick deadzone

        const getHostY = (e: PointerEvent) => {
            const rect = host.getBoundingClientRect();
            return e.clientY - rect.top;
        };

        const endDrag = () => {
            dragGhostLine?.remove();
            dragGhostBadge?.remove();
            dragGhostLine = null;
            dragGhostBadge = null;
            dragStartPrice = null;
            try {
                chart.applyOptions({
                    handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: false, pressedMouseMove: !useChartSettingsStore.getState().autoScroll },
                    handleScale: { axisPressedMouseMove: { time: false, price: true }, axisDoubleClickReset: { time: false, price: true }, mouseWheel: false, pinch: false },
                });
            } catch { /* disposed */ }
        };

        const onDragPointerMove = (e: PointerEvent) => {
            if (!dragGhostLine || !dragGhostBadge || !mainSeriesRef.current || dragStartPrice == null) return;
            const y = getHostY(e);
            const priceAtY = mainSeriesRef.current.coordinateToPrice(y);
            if (priceAtY == null) return;

            const role: 'TP' | 'SL' = priceAtY > dragStartPrice ? 'TP' : 'SL';
            const color = role === 'TP' ? TP_COLOR : SL_COLOR;
            const inDeadzone = Math.abs(priceAtY - dragStartPrice) < pipStepSnap;
            let scaleW = 0;
            try { scaleW = mainSeriesRef.current.priceScale().width(); } catch { scaleW = 0; }
            const priceScaleInset = getPriceScaleOverlayInset(scaleW);

            dragGhostLine.style.top = `${y}px`;
            dragGhostLine.style.right = `${priceScaleInset.lineRight}px`;
            dragGhostLine.style.borderTopColor = inDeadzone ? 'rgba(255,255,255,0.25)' : color;
            dragGhostBadge.style.top = `${y}px`;
            dragGhostBadge.style.right = `${priceScaleInset.badgeRight}px`;
            dragGhostBadge.style.color = color;
            dragGhostBadge.style.opacity = inDeadzone ? '0.45' : '1';
            dragGhostBadge.textContent = `${role} ${priceAtY.toFixed(Math.max(pricePrecision, 0))}`;
        };

        const onDragPointerUp = (e: PointerEvent) => {
            if (!dragGhostLine || !mainSeriesRef.current || dragStartPrice == null) {
                endDrag();
                window.removeEventListener('pointermove', onDragPointerMove);
                window.removeEventListener('pointerup', onDragPointerUp);
                return;
            }
            const y = getHostY(e);
            const priceAtY = mainSeriesRef.current.coordinateToPrice(y);
            window.removeEventListener('pointermove', onDragPointerMove);
            window.removeEventListener('pointerup', onDragPointerUp);

            if (priceAtY != null && Math.abs(priceAtY - dragStartPrice) >= pipStepSnap) {
                const role: 'TP' | 'SL' = priceAtY > dragStartPrice ? 'TP' : 'SL';
                window.dispatchEvent(new CustomEvent('terminal:drag-set-sl-tp', {
                    detail: {
                        symbol,
                        type: role,
                        price: Number(priceAtY.toFixed(Math.max(pricePrecision, 0))),
                        digits: Math.max(pricePrecision, 0),
                    },
                }));
            }
            endDrag();
        };

        const onDragPointerDown = (e: PointerEvent) => {
            if (e.button !== 0 || !mainSeriesRef.current || livePriceRef.current == null) return;
            e.preventDefault();
            e.stopPropagation();
            dragStartPrice = livePriceRef.current;

            try {
                chart.applyOptions({
                    handleScroll: { pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false, mouseWheel: false },
                    handleScale: { axisPressedMouseMove: { time: false, price: false }, mouseWheel: false, pinch: false },
                });
            } catch { /* noop */ }

            const y0 = getHostY(e);
            let scaleW = 0;
            try { scaleW = mainSeriesRef.current.priceScale().width(); } catch { scaleW = 0; }
            const priceScaleInset = getPriceScaleOverlayInset(scaleW);

            dragGhostLine = document.createElement('div');
            dragGhostLine.style.cssText = `position:absolute;left:0;right:${priceScaleInset.lineRight}px;top:${y0}px;height:0;border-top:1px dashed hsl(var(--foreground)/0.25);z-index:999;pointer-events:none;`;
            wrapper.appendChild(dragGhostLine);

            dragGhostBadge = document.createElement('div');
            dragGhostBadge.style.cssText = `position:absolute;right:${priceScaleInset.badgeRight}px;top:${y0}px;padding:1px 6px;background:hsl(var(--background));border:1px solid hsl(var(--border));color:hsl(var(--foreground));font-size:10px;font-family:Consolas,'Courier New',monospace;font-weight:600;z-index:1000;pointer-events:none;transform:translateY(-50%);border-radius:2px;`;
            dragGhostBadge.textContent = '';
            wrapper.appendChild(dragGhostBadge);

            window.addEventListener('pointermove', onDragPointerMove);
            window.addEventListener('pointerup', onDragPointerUp);
        };

        livePriceBadge.addEventListener('pointerdown', onDragPointerDown);
        livePriceHit.addEventListener('pointerdown', onDragPointerDown);

        const displayBarsBySeriesTime = new Map<number, OHLCBar>();
        const realBarsBySeriesTime = new Map<number, OHLCBar>();
        const seriesTimeToLogicalIndex = new Map<number, number>();
        let maybeRequestOlderHistory: (range: LogicalRangeSnapshot | null) => void = () => { };
        let volumeRenderFrame: number | null = null;
        let lastVisibleMaxVolume = 0;
        let latestAppliedVolumeSeriesTime: number | null = null;

        const getVisibleVolumeScaleMax = () => {
            const range = chart.timeScale().getVisibleLogicalRange();
            const visibleVolumes: number[] = [];
            const totalVolumes: number[] = [];

            for (const [seriesTime, bar] of displayBarsBySeriesTime) {
                if (Number.isFinite(bar.volume) && bar.volume > 0) {
                    totalVolumes.push(bar.volume);
                }

                const logicalIndex = seriesTimeToLogicalIndex.get(seriesTime);
                const isVisible = !range
                    || logicalIndex === undefined
                    || (logicalIndex >= range.from && logicalIndex <= range.to);
                if (isVisible && Number.isFinite(bar.volume) && bar.volume > 0) {
                    visibleVolumes.push(bar.volume);
                }
            }

            return getVisualVolumeScaleMax(visibleVolumes.length > 0 ? visibleVolumes : totalVolumes);
        };

        const getVisibleCandlePriceRange = () => {
            const range = chart.timeScale().getVisibleLogicalRange();
            let visibleLow = Number.POSITIVE_INFINITY;
            let visibleHigh = Number.NEGATIVE_INFINITY;
            let fallbackLow = Number.POSITIVE_INFINITY;
            let fallbackHigh = Number.NEGATIVE_INFINITY;
            let visibleCount = 0;
            let fallbackCount = 0;

            for (const [seriesTime, bar] of displayBarsBySeriesTime) {
                if (!hasValidBarPrices(bar)) continue;

                fallbackLow = Math.min(fallbackLow, bar.low);
                fallbackHigh = Math.max(fallbackHigh, bar.high);
                fallbackCount += 1;

                const logicalIndex = seriesTimeToLogicalIndex.get(seriesTime);
                const isVisible = !range
                    || logicalIndex === undefined
                    || (logicalIndex >= range.from && logicalIndex <= range.to);
                if (!isVisible) continue;

                visibleLow = Math.min(visibleLow, bar.low);
                visibleHigh = Math.max(visibleHigh, bar.high);
                visibleCount += 1;
            }

            const low = visibleCount > 0 ? visibleLow : fallbackLow;
            const high = visibleCount > 0 ? visibleHigh : fallbackHigh;
            if (
                (visibleCount === 0 && fallbackCount === 0)
                || !Number.isFinite(low)
                || !Number.isFinite(high)
                || high < low
            ) {
                return null;
            }

            const rawSpan = Math.max(high - low, minMove * 20, Math.abs((high + low) / 2) * 0.00002);
            const padding = Math.max(rawSpan * 0.12, minMove * 20);

            return {
                minValue: low - padding,
                maxValue: high + padding,
            };
        };

        const keepPriceRangeContainingVisibleCandles = (range: { minValue: number; maxValue: number }) => {
            const candleRange = getVisibleCandlePriceRange();
            if (!candleRange) {
                return expandPriceRangeToMinVisibleRange(range, digits);
            }

            const requestedSpan = range.maxValue - range.minValue;
            const requiredSpan = candleRange.maxValue - candleRange.minValue;
            if (
                !Number.isFinite(requestedSpan)
                || !Number.isFinite(requiredSpan)
                || requestedSpan <= 0
                || requiredSpan <= 0
            ) {
                return expandPriceRangeToMinVisibleRange(candleRange, digits);
            }

            const span = Math.max(requestedSpan, requiredSpan);
            const requestedCenter = (range.minValue + range.maxValue) / 2;
            const candleCenter = (candleRange.minValue + candleRange.maxValue) / 2;
            const center = Number.isFinite(requestedCenter) ? requestedCenter : candleCenter;
            let minValue = center - span / 2;
            let maxValue = center + span / 2;

            if (minValue > candleRange.minValue) {
                const shift = minValue - candleRange.minValue;
                minValue -= shift;
                maxValue -= shift;
            }

            if (maxValue < candleRange.maxValue) {
                const shift = candleRange.maxValue - maxValue;
                minValue += shift;
                maxValue += shift;
            }

            return expandPriceRangeToMinVisibleRange({ minValue, maxValue }, digits);
        };

        const renderVolumeSeriesForCurrentRange = () => {
            volumeRenderFrame = null;
            if (
                disposed ||
                chartRef.current !== chart ||
                volumeSeriesRef.current !== volSeries
            ) {
                return;
            }

            try {
                volSeries.applyOptions({ visible: shouldShowVolumeSeriesRef.current });
            } catch {
                return;
            }
            if (!shouldShowVolumeSeriesRef.current) {
                try { volSeries.setData([]); } catch { /* detached */ }
                lastVisibleMaxVolume = 0;
                latestAppliedVolumeSeriesTime = null;
                return;
            }

            try {
                volSeries.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
            } catch {
                return;
            }
            const visibleVolumeScaleMax = getVisibleVolumeScaleMax();
            lastVisibleMaxVolume = visibleVolumeScaleMax;
            // Sort by logical index to guarantee ascending series time for lightweight-charts
            const sortedEntries = [...displayBarsBySeriesTime.entries()]
                .sort((left, right) =>
                    (seriesTimeToLogicalIndex.get(left[0]) ?? left[0])
                    - (seriesTimeToLogicalIndex.get(right[0]) ?? right[0]),
                );

            // Deduplicate by seriesTime to guard against lightweight-charts strict ascending check
            const seen = new Set<number>();
            const volumeData: HistogramData<UTCTimestamp>[] = [];
            for (const [seriesTime, bar] of sortedEntries) {
                if (seen.has(seriesTime)) continue;
                seen.add(seriesTime);
                volumeData.push(toVolumeData(bar, palette, seriesTime as UTCTimestamp, visibleVolumeScaleMax));
            }

            try {
                volSeries.setData(volumeData);
            } catch (err) {
                // Swallow lightweight-charts rejection (e.g. out-of-order times on fast symbol switches)
                console.warn('[KlineChart] Volume setData failed:', err);
            }
            const latestVolumeData = volumeData[volumeData.length - 1];
            latestAppliedVolumeSeriesTime = latestVolumeData ? Number(latestVolumeData.time) : null;
        };

        const scheduleVolumeSeriesRender = () => {
            if (
                disposed ||
                chartRef.current !== chart ||
                volumeSeriesRef.current !== volSeries
            ) {
                return;
            }

            if (!shouldShowVolumeSeriesRef.current) {
                return;
            }

            if (volumeRenderFrame !== null) {
                return;
            }

            volumeRenderFrame = window.requestAnimationFrame(() => {
                renderVolumeSeriesForCurrentRange();
            });
        };
        volumeSeriesRefreshRef.current = scheduleVolumeSeriesRender;

        const updateVolumeSeriesForLiveBar = (bar: OHLCBar, seriesTime: UTCTimestamp) => {
            if (
                disposed ||
                chartRef.current !== chart ||
                volumeSeriesRef.current !== volSeries
            ) {
                return;
            }

            try {
                volSeries.applyOptions({ visible: shouldShowVolumeSeriesRef.current });
            } catch {
                return;
            }
            if (!shouldShowVolumeSeriesRef.current) {
                return;
            }

            const numericSeriesTime = Number(seriesTime);
            if (!Number.isFinite(numericSeriesTime)) {
                scheduleVolumeSeriesRender();
                return;
            }

            // If this tick is for a bar older than what's already applied, do a full
            // re-render to keep the volume histogram consistent with the candle series.
            if (
                latestAppliedVolumeSeriesTime !== null
                && numericSeriesTime < latestAppliedVolumeSeriesTime
            ) {
                scheduleVolumeSeriesRender();
                return;
            }

            if (
                lastVisibleMaxVolume > 0 &&
                Number.isFinite(bar.volume) &&
                bar.volume > lastVisibleMaxVolume
            ) {
                scheduleVolumeSeriesRender();
                return;
            }

            const nextVisibleMaxVolume = lastVisibleMaxVolume > 0
                ? lastVisibleMaxVolume
                : getVisualVolumeScaleMax([bar.volume]);

            try {
                volSeries.update(toVolumeData(bar, palette, seriesTime, nextVisibleMaxVolume));
            } catch {
                // lightweight-charts rejects update() if series is empty â€” fall back to full render
                scheduleVolumeSeriesRender();
                return;
            }
            latestAppliedVolumeSeriesTime = numericSeriesTime;
            // Update tracking max without a full setData rebuild.
            // lightweight-charts autoscales the histogram â€” setData on every tick
            // would rebuild 5000 bars per tick and destroy frame rate.
            // The range-change handler schedules a full refresh on scroll.
            lastVisibleMaxVolume = nextVisibleMaxVolume;
        };

        // Crosshair subscription â€” updates OHLC legend
        const cancelPendingLiveSeriesUpdates = () => {
            pendingLiveSeriesUpdates.clear();
            pendingLiveFocusLatest = false;
            pendingNewBarScrollToLatest = false;
            pendingNewBarWasPinnedToLatest = false;
            if (liveRenderFrame !== null) {
                window.cancelAnimationFrame(liveRenderFrame);
                liveRenderFrame = null;
            }
        };

        const flushLiveSeriesUpdates = () => {
            liveRenderFrame = null;
            const pendingUpdates = [...pendingLiveSeriesUpdates.values()]
                .sort((left, right) => left.seriesTime - right.seriesTime);
            pendingLiveSeriesUpdates.clear();
            if (disposed || pendingUpdates.length === 0) {
                pendingLiveFocusLatest = false;
                pendingNewBarWasPinnedToLatest = false;
                return;
            }

            let latestUpdatedBar: OHLCBar | null = null;
            let latestRenderedSeriesTime = latestCommittedSeriesTime;
            let latestRenderedBar = latestCommittedSeriesTime !== null
                ? displayBarsBySeriesTime.get(latestCommittedSeriesTime) ?? null
                : null;
            for (const { seriesTime, bar, isNewBar, previousClose } of pendingUpdates) {
                // Path A: series is empty — seed with setData then break; all bars are now in the chart.
                if (!chartHasSetData) {
                    try {
                        const seedEntries = [...displayBarsBySeriesTime.entries()]
                            .sort((a, b) =>
                                (seriesTimeToLogicalIndex.get(a[0]) ?? a[0])
                                - (seriesTimeToLogicalIndex.get(b[0]) ?? b[0]),
                            );
                        if (chartType === 'Line') {
                            mainSeries.setData(seedEntries.map(([st, b]) => toLineData(b, st as UTCTimestamp)));
                        } else {
                            let lastCloseSeed = 1;
                            mainSeries.setData(seedEntries.map(([st, b]) => {
                                const visual = toVisualCandleData(b, pricePrecision, st as UTCTimestamp, lastCloseSeed);
                                lastCloseSeed = visual.close;
                                return visual;
                            }));
                        }
                        chartHasSetData = seedEntries.length > 0;
                        renderVolumeSeriesForCurrentRange();
                        latestUpdatedBar = pendingUpdates[pendingUpdates.length - 1]?.bar ?? bar;
                        latestSeriesTime = seedEntries.length > 0
                            ? seedEntries[seedEntries.length - 1][0] as UTCTimestamp
                            : latestSeriesTime;
                        latestCommittedSeriesTime = latestSeriesTime;
                        break;
                    } catch (seedErr) {
                        console.warn('[KlineChart] setData seed failed for seriesTime', seriesTime, seedErr);
                        continue;
                    }
                }

                // Path B: historical/backfill bar behind the chart tip.
                // Rebuild with setData so lightweight-charts never receives
                // update(..., true) for a point that may have moved out of the series.
                if (!isNewBar && latestRenderedSeriesTime !== null && seriesTime < latestRenderedSeriesTime) {
                    scheduleHistoricalCacheRender();
                    continue;
                }

                // Path C: standard update — last bar refresh or new bar append.
                try {
                    if (chartType === 'Line') {
                        mainSeries.update(toLineData(bar, seriesTime));
                    } else {
                        // Find the last close price to prevent 0-value fallback blowouts
                        const prevClose = isNewBar
                            ? previousClose ?? latestRenderedBar?.close ?? 1
                            : bar.open;
                        mainSeries.update(toVisualCandleData(bar, pricePrecision, seriesTime, prevClose));
                    }
                } catch {
                    try {
                        const rebuildEntries = [...displayBarsBySeriesTime.entries()]
                            .sort((a, b) =>
                                (seriesTimeToLogicalIndex.get(a[0]) ?? a[0])
                                - (seriesTimeToLogicalIndex.get(b[0]) ?? b[0]),
                            );
                        if (chartType === 'Line') {
                            mainSeries.setData(rebuildEntries.map(([st, b]) =>
                                toLineData(b, st as UTCTimestamp),
                            ));
                        } else {
                            let lastCloseRebuild = 1;
                            mainSeries.setData(rebuildEntries.map(([st, b]) => {
                                const visual = toVisualCandleData(b, pricePrecision, st as UTCTimestamp, lastCloseRebuild);
                                lastCloseRebuild = visual.close;
                                return visual;
                            }));
                        }
                        chartHasSetData = rebuildEntries.length > 0;
                        latestSeriesTime = rebuildEntries.length > 0
                            ? rebuildEntries[rebuildEntries.length - 1][0] as UTCTimestamp
                            : latestSeriesTime;
                        latestCommittedSeriesTime = chartHasSetData ? latestSeriesTime : null;
                        renderVolumeSeriesForCurrentRange();
                    } catch {
                        // If the tip tracking was stale, recover with a full setData rebuild.
                        // This keeps historical/backfill repair off the update() path.
                        scheduleHistoricalCacheRender();
                        continue;
                    }
                }
                updateVolumeSeriesForLiveBar(bar, seriesTime);
                latestUpdatedBar = bar;
                if (latestRenderedSeriesTime === null || seriesTime >= latestRenderedSeriesTime) {
                    latestRenderedSeriesTime = seriesTime;
                    latestRenderedBar = bar;
                    latestSeriesTime = seriesTime;
                    latestCommittedSeriesTime = seriesTime;
                }
            }

            updateLivePriceOverlay();
            if (noDataShown) {
                setNoDataMessage(null);
                noDataShown = false;
            }
            if (latestUpdatedBar) {
                setActiveBarIfChanged(latestUpdatedBar);
            }
            if (pendingLiveFocusLatest) {
                focusLatestBars(renderedBarCount);
                window.requestAnimationFrame(() => {
                    if (disposed) return;
                    refitVisiblePriceScale();
                    updateLivePriceOverlay();
                });
            }
            pendingLiveFocusLatest = false;
            if (pendingNewBarScrollToLatest) {
                pendingNewBarScrollToLatest = false;
                // Only scroll to latest when the user hasn't manually scrolled back.
                // isPinnedToLatest() returns true when the right edge is within
                // LATEST_PINNED_THRESHOLD_BARS of the last rendered bar, so a user
                // inspecting older candles isn't interrupted by every new bar close.
                if (useChartSettingsStore.getState().autoScroll && pendingNewBarWasPinnedToLatest) {
                    try { chart.timeScale().scrollToPosition(getPreferredRightOffset(), false); } catch { /* chart disposed */ }
                }
            }
            pendingNewBarWasPinnedToLatest = false;
            notifyHistoryStatusChange({ isLoading: false, hasCandles: realBarsBySeriesTime.size > 0 });
            // Throttle position overlay DOM updates to â‰¤ 30fps in the live tick path.
            // Price-line Y positions don't meaningfully change faster than 30fps,
            // and every update forces priceToCoordinate + style writes for each position.
            const nowMs = performance.now();
            if (nowMs - lastPositionOverlayMs >= 33) {
                lastPositionOverlayMs = nowMs;
                updatePositionLineOverlays();
            }
        };

        const scheduleLiveSeriesUpdate = (
            seriesTime: UTCTimestamp,
            bar: OHLCBar,
            options: { isNewBar?: boolean; previousClose?: number | null } = {},
        ) => {
            const pendingKey = Number(seriesTime);
            const existingUpdate = pendingLiveSeriesUpdates.get(pendingKey);
            if (
                existingUpdate?.seriesTime === seriesTime &&
                hasSameOhlcvValues(existingUpdate.bar, bar) &&
                existingUpdate.isNewBar === Boolean(options.isNewBar) &&
                existingUpdate.previousClose === (options.previousClose ?? null)
            ) {
                return;
            }

            pendingLiveSeriesUpdates.set(pendingKey, {
                seriesTime,
                bar,
                isNewBar: Boolean(options.isNewBar),
                previousClose: options.previousClose ?? null,
            });
            if (liveRenderFrame !== null) {
                return;
            }

            liveRenderFrame = window.requestAnimationFrame(flushLiveSeriesUpdates);
        };

        const pruneRenderedLiveWindowIfNeeded = () => {
            if (displayBarsBySeriesTime.size <= MAX_RENDERED_OHLC_BARS) {
                return false;
            }

            const retainedEntries: Array<[UTCTimestamp, OHLCBar]> = [...displayBarsBySeriesTime.entries()]
                .sort((left, right) =>
                    (seriesTimeToLogicalIndex.get(left[0]) ?? left[0])
                    - (seriesTimeToLogicalIndex.get(right[0]) ?? right[0]),
                )
                .slice(-MAX_RENDERED_OHLC_BARS)
                .map(([seriesTime, bar]) => [seriesTime as UTCTimestamp, bar]);

            cancelPendingLiveSeriesUpdates();
            displayBarsBySeriesTime.clear();
            realBarsBySeriesTime.clear();
            seriesTimeToLogicalIndex.clear();
            realTimeToSeriesTime.clear();
            seriesTimeToRealTime.clear();
            latestSeriesTime = null;
            latestCommittedSeriesTime = null;

            retainedEntries.forEach(([seriesTime, bar], index) => {
                displayBarsBySeriesTime.set(seriesTime, bar);
                if (isRealMarketBar(bar)) {
                    realBarsBySeriesTime.set(seriesTime, bar);
                }
                seriesTimeToLogicalIndex.set(seriesTime, index);
                realTimeToSeriesTime.set(bar.time, seriesTime);
                seriesTimeToRealTime.set(seriesTime, bar.time);
                latestSeriesTime = seriesTime;
            });
            renderedBarCount = retainedEntries.length;

            if (chartType === 'Line') {
                mainSeries.setData(retainedEntries.map(([seriesTime, bar]) =>
                    toLineData(bar, seriesTime),
                ));
            } else {
                let lastCloseRetained = 1;
                mainSeries.setData(retainedEntries.map(([seriesTime, bar]) => {
                    const visual = toVisualCandleData(bar, pricePrecision, seriesTime, lastCloseRetained);
                    lastCloseRetained = visual.close;
                    return visual;
                }));
            }
            chartHasSetData = retainedEntries.length > 0;
            latestCommittedSeriesTime = chartHasSetData ? latestSeriesTime : null;
            renderVolumeSeriesForCurrentRange();
            return true;
        };

        const crosshairHandler = (param: any) => {
            if (!param || !param.time || !param.seriesData) {
                if (currentBarRef.current) {
                    setActiveBarIfChanged(currentBarRef.current);
                }
                return;
            }
            const timeSec = typeof param.time === 'number' ? param.time : undefined;
            const displayBar = timeSec === undefined ? null : displayBarsBySeriesTime.get(timeSec);
            if (displayBar) {
                setActiveBarIfChanged(displayBar);
            }
        };
        chart.subscribeCrosshairMove(crosshairHandler);

        // â”€â”€ Auto-scroll 3s snap-back: after user stops interacting, snap to realtime. â”€â”€
        let autoScrollTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleAutoScroll = () => {
            if (autoScrollTimer) clearTimeout(autoScrollTimer);
            if (!useChartSettingsStore.getState().autoScroll) return;
            autoScrollTimer = setTimeout(() => {
                // Use scrollToPosition (logical) not scrollToRealTime (real UTC).
                // Real UTC timestamps break compact sequential series time and create
                // a visible void between old history bars and the current live bar.
                try { chartRef.current?.timeScale().scrollToPosition(getPreferredRightOffset(), false); } catch { /* chart disposed */ }
            }, 1500);
        };
        const rangeHandler = () => {
            scheduleAutoScroll();
            rememberChartBarSpacing();
            updateLivePriceOverlay();
            updatePositionLineOverlays();
            scheduleVolumeSeriesRender();
            const range = chart.timeScale().getVisibleLogicalRange();
            maybeRequestOlderHistory(range ? { from: range.from as number, to: range.to as number } : null);
        };
        chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);

        // â”€â”€ MT5-style window-level wheel handler: pans the time axis; ignores modals/scrollable areas. â”€â”€
        const onWheel = (e: WheelEvent) => {
            const currentChart = chartRef.current;
            if (!currentChart) return;
            const hostEl = chartHostRef.current;
            if (!hostEl) return;

            // Skip if cursor is over a modal/portal/scrollable ancestor above the chart.
            const path = (e.composedPath?.() ?? []) as HTMLElement[];
            for (const node of path) {
                if (!(node instanceof HTMLElement)) continue;
                if (node === hostEl) break;
                const role = node.getAttribute?.('role');
                if (role === 'dialog' || role === 'menu') return;
                if (node.dataset?.modal === 'true') return;
                const style = node.style;
                if (style && (style.overflowY === 'auto' || style.overflowY === 'scroll')) {
                    if (node.scrollHeight > node.clientHeight) return;
                }
            }

            // Must be inside the chart host bounding rect.
            const rect = hostEl.getBoundingClientRect();
            const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
            if (!inside) return;

            e.preventDefault();
            e.stopPropagation();

            const ts = currentChart.timeScale();
            if (e.ctrlKey || e.metaKey) {
                const current = (ts.options() as any).barSpacing ?? visualConfig.timeScale.barSpacing;
                const safeCurrent = typeof current === 'number' && Number.isFinite(current) && current > 0
                    ? current
                    : visualConfig.timeScale.barSpacing;
                const wheelSteps = Math.max(1, Math.min(8, Math.round(Math.abs(e.deltaY) / 80)));
                const zoomFactor = Math.pow(1.12, wheelSteps);
                const next = e.deltaY < 0
                    ? Math.min(60, safeCurrent * zoomFactor)
                    : Math.max(visualConfig.timeScale.minBarSpacing, safeCurrent / zoomFactor);

                try {
                    markProgrammaticBarSpacing(next);
                    ts.applyOptions({
                        barSpacing: next,
                        rightOffset: getPreferredRightOffset(next),
                    });
                    chartBarSpacingRef.current = next;
                    onChartBarSpacingChangeRef.current?.(next);
                } catch { /* chart disposed */ }

                scheduleAutoScroll();
                return;
            }

            const range = ts.getVisibleLogicalRange();
            if (!range) return;

            const barsPerScroll = Math.max(1, Math.round(Math.abs(e.deltaY) / 20));
            const shift = e.deltaY > 0 ? barsPerScroll : -barsPerScroll;
            try {
                ts.setVisibleLogicalRange({
                    from: (range.from as number) + shift,
                    to: (range.to as number) + shift,
                });
            } catch { /* out of range */ }

            scheduleAutoScroll();
        };
        window.addEventListener('wheel', onWheel, { passive: false, capture: true });

        // Price axis drag-to-zoom. Keep scaleMargins fixed so the candle pane does not slide.
        let priceAxisCleanup: (() => void) | null = null;
        const attachPriceAxisHandlers = () => {
            const table = host.querySelector('table');
            if (!table) return;
            const firstRow = table.querySelector('tr');
            if (!firstRow) return;
            const cells = firstRow.querySelectorAll('td');
            if (!cells.length) return;
            const priceCell = cells[cells.length - 1] as HTMLElement;

            let dragActive = false;
            let startY = 0;
            let startRange: { minValue: number; maxValue: number } | null = null;
            let anchorPrice: number | null = null;
            let startAnchorRatio = 0.5;

            const onMouseDown = (ev: MouseEvent) => {
                const series = mainSeriesRef.current;
                const hostRect = host.getBoundingClientRect();
                if (!series || !hostRect.height) return;

                const y = Math.min(Math.max(ev.clientY - hostRect.top, 0), hostRect.height);
                const priceAtCursor = series.coordinateToPrice(y);
                const topPrice = series.coordinateToPrice(0);
                const bottomPrice = series.coordinateToPrice(hostRect.height);
                if (
                    typeof priceAtCursor !== 'number' ||
                    typeof topPrice !== 'number' ||
                    typeof bottomPrice !== 'number' ||
                    !Number.isFinite(priceAtCursor) ||
                    !Number.isFinite(topPrice) ||
                    !Number.isFinite(bottomPrice)
                ) {
                    return;
                }

                const minValue = Math.min(topPrice, bottomPrice);
                const maxValue = Math.max(topPrice, bottomPrice);
                if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue <= minValue) return;

                const visibleCandleRange = getVisibleCandlePriceRange();
                const visibleCandleCenter = visibleCandleRange
                    ? (visibleCandleRange.minValue + visibleCandleRange.maxValue) / 2
                    : priceAtCursor;
                const safeStartRange = keepPriceRangeContainingVisibleCandles({ minValue, maxValue });
                const rangeSpan = safeStartRange.maxValue - safeStartRange.minValue;
                const rawAnchorRatio = (visibleCandleCenter - safeStartRange.minValue) / rangeSpan;

                dragActive = true;
                startY = ev.clientY;
                startRange = safeStartRange;
                anchorPrice = visibleCandleCenter;
                startAnchorRatio = Number.isFinite(rawAnchorRatio)
                    ? Math.min(0.85, Math.max(0.15, rawAnchorRatio))
                    : 0.5;
                ev.preventDefault();
                ev.stopPropagation();
            };
            const onMouseMove = (ev: MouseEvent) => {
                if (!dragActive || !startRange || anchorPrice === null) return;
                const dy = ev.clientY - startY;
                const zoomFactor = Math.exp(dy * 0.006);
                const startSpan = startRange.maxValue - startRange.minValue;
                const minSpan = Math.max(minMove, Math.abs(anchorPrice) * 0.000000001);
                const nextSpan = Math.max(minSpan, startSpan * zoomFactor);
                if (!Number.isFinite(nextSpan)) return;
                const nextRange = {
                    minValue: anchorPrice - nextSpan * startAnchorRatio,
                    maxValue: anchorPrice + nextSpan * (1 - startAnchorRatio),
                };

                try {
                    manualPriceRangeRef.current = keepPriceRangeContainingVisibleCandles(nextRange);
                    mainSeriesRef.current?.applyOptions({ autoscaleInfoProvider });
                    chartRef.current?.priceScale('right').applyOptions({
                        autoScale: true,
                        scaleMargins: activePriceScaleMargins,
                    });
                    updatePositionLineOverlays();
                } catch { /* chart disposed */ }
            };
            const onMouseUp = () => {
                dragActive = false;
                startRange = null;
                anchorPrice = null;
            };
            const onDblClick = () => {
                try {
                    manualPriceRangeRef.current = null;
                    mainSeriesRef.current?.applyOptions({ autoscaleInfoProvider });
                    chartRef.current?.priceScale('right').applyOptions({
                        autoScale: true,
                        scaleMargins: activePriceScaleMargins,
                    });
                    updatePositionLineOverlays();
                } catch { /* chart disposed */ }
            };

            priceCell.addEventListener('mousedown', onMouseDown);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            priceCell.addEventListener('dblclick', onDblClick);

            priceAxisCleanup = () => {
                priceCell.removeEventListener('mousedown', onMouseDown);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                priceCell.removeEventListener('dblclick', onDblClick);
            };
        };
        // Defer until chart renders DOM.
        const priceAxisAttachTimer = setTimeout(attachPriceAxisHandlers, 200);

        const atomicSwitchSeedHasHistory = atomicSwitchSeedBars.some(
            isRenderableCachedOrHistoricalBar,
        );
        let isHistoryLoaded = atomicSwitchSeedHasHistory;
        let hasRenderedAnyCandles = hasAtomicSwitchSeed;
        // Tracks whether mainSeries.setData() has been successfully called at least once.
        // Prevents renderProvisionalLivePreview from short-circuiting on an actually-empty series
        // when hasRenderedAnyCandles was set by applyLiveBarToRenderedSeries before history loaded.
        let chartHasSetData = hasAtomicSwitchSeed;
        let renderedBarCount = atomicSwitchSeedBars.length;
        let resizeFrame: number | null = null;
        let dataLayoutFrame: number | null = null;
        let liveRenderFrame: number | null = null;
        let progressiveHistorySeedFrame: number | null = null;
        let historicalCacheRenderFrame: number | null = null;
        let cachedHostHeight = 0;         // refreshed on resize, avoids clientHeight layout-thrash per frame
        let noDataShown = false;          // gate: only dispatch setNoDataMessage when state actually changes
        let lastPositionOverlayMs = 0;    // throttle position overlay updates to â‰¤ 30fps in live path
        let historyBackfillTimer: ReturnType<typeof setTimeout> | null = null;
        let historyReadinessRetryTimer: ReturnType<typeof setTimeout> | null = null;
        let historyReadinessRetryRequested = false;
        let historyLoadSequence = 0;
        let deferredBackfillScheduled = false;
        let backgroundHistoryBackfillAttempts = 0;
        let latestHistoryGapCatchUpAttempts = 0;
        const latestHistoryGapCatchUpInFlightGate = createLatestHistoryGapCatchUpInFlightGate();
        let latestHistoryGapCatchUpRequestSignature: string | null = null;
        let hasProvisionalLivePreview = false;
        let hasRenderedHistorySeed = atomicSwitchSeedHasHistory;
        let pendingLiveFocusLatest = false;
        let pendingNewBarScrollToLatest = false;
        let pendingNewBarWasPinnedToLatest = false;
        let pendingProvisionalPreviewTimer: ReturnType<typeof setTimeout> | null = null;
        const liveBarsByTime = new Map<number, OHLCBar>();
        let oldestLiveBarTime: number | null = null;
        const loadedHistoryBarsByTime = new Map<number, OHLCBar>();
        const pendingLiveSeriesUpdates = new Map<number, {
            seriesTime: UTCTimestamp;
            bar: OHLCBar;
            isNewBar: boolean;
            previousClose: number | null;
        }>();
        if (hasAtomicSwitchSeed) {
            const seedEntries = buildCompactSeriesEntries(
                atomicSwitchSeedBars,
                bucketMs,
                COMPACT_SERIES_EPOCH_MS,
            );
            seedEntries.forEach(({ bar, seriesTime, logicalIndex }) => {
                displayBarsBySeriesTime.set(seriesTime, bar);
                realBarsBySeriesTime.set(seriesTime, bar);
                seriesTimeToLogicalIndex.set(seriesTime, logicalIndex);
                realTimeToSeriesTime.set(bar.time, seriesTime);
                seriesTimeToRealTime.set(seriesTime, bar.time);
                latestSeriesTime = seriesTime;

                if (isOpenLiveTickBar(bar) || bar.closed === false) {
                    liveBarsByTime.set(bar.time, bar);
                } else {
                    loadedHistoryBarsByTime.set(bar.time, bar);
                }
            });
            latestCommittedSeriesTime = latestSeriesTime;
            oldestLiveBarTime = liveBarsByTime.size > 0
                ? Math.min(...liveBarsByTime.keys())
                : null;
        }
        const ohlcSanityGuard = createOhlcSanityReferenceTracker(symbol, 'KlineChartContainer');
        const completedOlderHistoryRangeKeys = new Set<string>();
        const olderHistoryRetryAfterByRangeKey = new Map<string, number>();
        const recentHistoryMetadataWindows: HistoryMetadataWindow[] = [];
        let latestHistoryMetadata = ohlcService.getHistoryMetadata(
            symbol,
            selectedResolution.minutes,
            normalizedAccountSessionScopeId,
        );
        let olderHistoryInFlightKey: string | null = null;
        const markOlderHistoryRangeRetryable = (
            rangeKey: string,
            delayMs = OLDER_HISTORY_RETRY_COOLDOWN_MS,
        ) => {
            olderHistoryRetryAfterByRangeKey.set(rangeKey, Date.now() + delayMs);
        };
        const isOlderHistoryRangeCoolingDown = (rangeKey: string) => {
            const retryAfter = olderHistoryRetryAfterByRangeKey.get(rangeKey);
            if (retryAfter === undefined) {
                return false;
            }

            if (retryAfter > Date.now()) {
                return true;
            }

            olderHistoryRetryAfterByRangeKey.delete(rangeKey);
            return false;
        };
        const pruneRecentHistoryMetadataWindows = () => {
            const cutoff = Date.now() - RECENT_HISTORY_METADATA_WINDOW_MS;
            while (recentHistoryMetadataWindows.length > 0 && recentHistoryMetadataWindows[0].observedAt < cutoff) {
                recentHistoryMetadataWindows.shift();
            }
        };
        const isMatchingHistoryMetadata = (
            metadataSymbol: string,
            timeframe: number,
            metadata: OhlcHistoryResponseMetadata,
        ) => {
            if (timeframe !== selectedResolution.minutes) {
                return false;
            }

            const currentSymbol = symbol.trim();
            const metadataRoot = metadata as unknown as Record<string, unknown>;
            const nestedMetadata = metadata.metadata as Record<string, unknown> | undefined;
            const symbolCandidates: string[] = [];

            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadataSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadata.symbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadata.brokerSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadata.brokerSymbolCandidates);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadataRoot.requestedSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadataRoot.attemptedBrokerSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadataRoot.resolvedBrokerSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadata.metadata?.symbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadata.metadata?.brokerSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, metadata.metadata?.brokerSymbolCandidates);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, nestedMetadata?.requestedSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, nestedMetadata?.attemptedBrokerSymbol);
            appendHistoryMetadataSymbolCandidate(symbolCandidates, nestedMetadata?.resolvedBrokerSymbol);

            return symbolCandidates.some((candidate) => symbolsMatch(candidate, currentSymbol));
        };
        const unsubscribeHistoryMetadata = ohlcService.addOhlcHistoryMetadataListener((
            metadataSymbol,
            timeframe,
            metadata,
        ) => {
            if (!isCurrentChartSwitch() || !isMatchingHistoryMetadata(metadataSymbol, timeframe, metadata)) {
                return;
            }

            latestHistoryMetadata = metadata;
            if (metadata.event === 'ohlc_history_refreshed') {
                recentHistoryMetadataWindows.push({ metadata, observedAt: Date.now() });
                pruneRecentHistoryMetadataWindows();
                if (!latestHistoryGapCatchUpInFlightGate.inFlight) {
                    latestHistoryGapCatchUpInFlightGate.begin();
                    void loadHistory(true, isHistoryLoaded ? 'preserve-visible' : undefined).finally(() => {
                        latestHistoryGapCatchUpInFlightGate.finish(!isCurrentChartSwitch(), scheduleLatestHistoryGapCatchUp);
                    });
                }
            }
        });
        const shouldMergeOlderHistoryUpdate = (bar: OHLCBar, renderedLatestTime = 0) => {
            if (!isRealMarketBar(bar) || isOpenLiveTickBar(bar)) {
                return false;
            }

            const isClosedOlderRealtimeCandle = (
                bucketMs > 0 &&
                renderedLatestTime > 0 &&
                bar.time + bucketMs <= renderedLatestTime
            );

            if (isLikelyHistoricalOhlcBar(bar) || isClosedOlderRealtimeCandle) {
                return true;
            }

            pruneRecentHistoryMetadataWindows();
            return recentHistoryMetadataWindows.some(({ metadata }) =>
                metadataCoversBarTime(metadata, bar.time, bucketMs),
            );
        };
        const getSanityComparableBarTime = (bar: OHLCBar) =>
            normalizeTimestampMs(bar.sourceTimeMs ?? bar.time) ?? normalizeTimestampMs(bar.time) ?? 0;
        const acceptOhlcBarForChart = (bar: OHLCBar, source: string) =>
            ohlcSanityGuard.accept(bar, source, { bucketMs });
        const seedStatefulOhlcSanityReference = (bars: OHLCBar[], source: string) => {
            const initialReferenceTime = ohlcSanityGuard.getReference()?.time ?? null;
            for (const bar of bars) {
                const barTime = getSanityComparableBarTime(bar);
                if (initialReferenceTime !== null && barTime <= initialReferenceTime) {
                    continue;
                }

                acceptOhlcBarForChart(bar, source);
            }
        };
        const filterAcceptedOhlcBarsForChart = (
            bars: OHLCBar[],
            source: string,
            options: { useChronologicalBatch?: boolean; seedStatefulReference?: boolean } = {},
        ) => {
            const symbolDomainBars = bars.filter((bar) => isBarInsideChartSymbolPriceDomain(symbol, bar));
            if (!options.useChronologicalBatch) {
                return symbolDomainBars.filter((bar) => acceptOhlcBarForChart(bar, source));
            }

            const batchSanityGuard = createOhlcSanityReferenceTracker(
                symbol,
                'KlineChartContainer:history_batch',
                ohlcSanityGuard.getReference(),
            );
            const acceptedBars = batchSanityGuard.filterChronological(symbolDomainBars, source, bucketMs);

            if (options.seedStatefulReference) {
                seedStatefulOhlcSanityReference(acceptedBars, source);
            }

            return acceptedBars;
        };
        const cacheLiveBar = (
            bar: OHLCBar,
            options: { replaceExisting?: boolean; skipSanity?: boolean } = {},
        ) => {
            const bucketedBar = toBucketedBar(bar, bucketMs);
            if (
                !options.skipSanity &&
                !acceptOhlcBarForChart(bucketedBar, bucketedBar.source ?? 'live')
            ) {
                return null;
            }

            const preferredBar = options.replaceExisting
                ? { ...bucketedBar }
                : upsertPreferredBar(liveBarsByTime, bucketedBar, bucketMs);
            if (options.replaceExisting) {
                liveBarsByTime.set(bucketedBar.time, preferredBar);
            }
            if (oldestLiveBarTime === null || bucketedBar.time < oldestLiveBarTime) {
                oldestLiveBarTime = bucketedBar.time;
            }

            while (liveBarsByTime.size > MAX_RENDERED_OHLC_BARS) {
                if (oldestLiveBarTime === null) {
                    break;
                }
                liveBarsByTime.delete(oldestLiveBarTime);
                oldestLiveBarTime = null;
                for (const liveBarTime of liveBarsByTime.keys()) {
                    if (oldestLiveBarTime === null || liveBarTime < oldestLiveBarTime) {
                        oldestLiveBarTime = liveBarTime;
                    }
                }
            }

            return preferredBar;
        };
        const alignLaggingOpenLiveTickToRenderedOpenBar = (
            incomingBar: OHLCBar,
            previousLastBarTime: number,
        ): OHLCBar | null => {
            if (
                previousLastBarTime <= 0 ||
                incomingBar.time >= previousLastBarTime ||
                !isOpenLiveTickBar(incomingBar)
            ) {
                return incomingBar;
            }

            const previousLatestSeriesTime = realTimeToSeriesTime.get(previousLastBarTime);
            const latestRenderedBar =
                (previousLatestSeriesTime !== undefined
                    ? displayBarsBySeriesTime.get(previousLatestSeriesTime)
                    : null) ??
                (latestSeriesTime !== null
                    ? displayBarsBySeriesTime.get(latestSeriesTime)
                    : null) ??
                currentBarRef.current;

            const currentClockMs = Math.max(ohlcService.getServerNowMs(), Date.now());
            if (!latestRenderedBar || isClosedBucket(latestRenderedBar, bucketMs, currentClockMs)) {
                return null;
            }

            const liveClose = incomingBar.close;
            return {
                ...incomingBar,
                time: latestRenderedBar.time,
                open: latestRenderedBar.open,
                high: Math.max(latestRenderedBar.high, incomingBar.high, liveClose),
                low: Math.min(latestRenderedBar.low, incomingBar.low, liveClose),
                close: liveClose,
                volume: Math.max(latestRenderedBar.volume, incomingBar.volume),
                sourceTimeMs: getBarSourceTimeMs(incomingBar),
                closed: false,
                derived: undefined,
                continuity: undefined,
                isContinuity: undefined,
                basis: undefined,
                cached: undefined,
                synthetic: undefined,
            };
        };
        const rememberLoadedHistoryBars = (
            bars: OHLCBar[],
            options: { skipSanity?: boolean; source?: string } = {},
        ) => {
            let changed = false;
            for (const bar of bars) {
                if (!isBarInsideChartSymbolPriceDomain(symbol, bar)) {
                    continue;
                }

                const bucketedBar = toBucketedBar(bar, bucketMs);
                if (
                    !options.skipSanity &&
                    !acceptOhlcBarForChart(bucketedBar, options.source ?? bucketedBar.source ?? 'history')
                ) {
                    continue;
                }

                const previousBar = loadedHistoryBarsByTime.get(bucketedBar.time) ?? null;
                const preferredBar = upsertPreferredBar(loadedHistoryBarsByTime, bucketedBar, bucketMs);
                if (!hasSameOhlcvValues(previousBar, preferredBar)) {
                    changed = true;
                }
            }

            return changed;
        };
        const getLoadedRealBars = () => normalizeChartBars(
            [...loadedHistoryBarsByTime.values()],
            bucketMs,
            MAX_SCROLLBACK_RENDERED_OHLC_BARS,
        ).filter(isRealMarketBar);
        const isHistoryResponseSeedBar = (bar: OHLCBar) => {
            if (!isRealMarketBar(bar) || isProvisionalPriceSeedBar(bar)) {
                return false;
            }

            if (isLatestHistoryCatchUpReferenceBar(bar) || isRenderableCachedOrHistoricalBar(bar)) {
                return true;
            }

            const source = typeof bar.source === 'string' ? bar.source.trim().toLowerCase() : '';
            if (/^(?:live[_-]?tick|mt5[_-]?live[_-]?tick|rust_realtime|quote)$/.test(source)) {
                return false;
            }

            return source === 'mt5_tick' || bar.closed === true;
        };
        const hasCachedOrHistoricalSeedBars = (bars: Iterable<OHLCBar>) =>
            normalizeChartBars(Array.from(bars), bucketMs).some(isRenderableCachedOrHistoricalBar);
        const getEarliestLoadedRealBarTimeMs = () => getLoadedRealBars()[0]?.time ?? null;
        const getCurrentRenderLimit = (extraBars = 0) => Math.min(
            MAX_SCROLLBACK_RENDERED_OHLC_BARS,
            Math.max(
                MAX_RENDERED_OHLC_BARS,
                loadedHistoryBarsByTime.size + liveBarsByTime.size + extraBars,
            ),
        );
        const getNextStagedLatestHistoryLimit = () => (
            STAGED_LATEST_HISTORY_WARMUP_LIMITS.find((limit) => loadedHistoryBarsByTime.size < limit) ?? null
        );
        const isPinnedToLatest = () => {
            const range = chart.timeScale().getVisibleLogicalRange();
            if (!range || renderedBarCount <= 0) {
                return true;
            }

            return (range.to as number) >= renderedBarCount - 1 - LATEST_PINNED_THRESHOLD_BARS;
        };
        const getVisibleAnchorSnapshot = (range: LogicalRangeSnapshot | null): VisibleAnchorSnapshot | null => {
            if (!range || displayBarsBySeriesTime.size === 0) {
                return null;
            }

            let firstVisible: VisibleAnchorSnapshot | null = null;
            let nearest: VisibleAnchorSnapshot | null = null;
            let nearestDistance = Number.POSITIVE_INFINITY;

            for (const [seriesTime, bar] of displayBarsBySeriesTime) {
                const logicalIndex = seriesTimeToLogicalIndex.get(seriesTime);
                if (logicalIndex === undefined) {
                    continue;
                }

                if (logicalIndex >= range.from && (!firstVisible || logicalIndex < firstVisible.logicalIndex)) {
                    firstVisible = { realTime: bar.time, logicalIndex };
                }

                const distance = Math.abs(logicalIndex - range.from);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearest = { realTime: bar.time, logicalIndex };
                }
            }

            return firstVisible ?? nearest;
        };
        const restoreVisibleLogicalRange = (
            previousRange: LogicalRangeSnapshot | null,
            anchor: VisibleAnchorSnapshot | null,
        ) => {
            if (!previousRange) {
                return;
            }

            let from = previousRange.from;
            let to = previousRange.to;
            const nextSeriesTime = anchor ? realTimeToSeriesTime.get(anchor.realTime) : undefined;
            const nextLogicalIndex = nextSeriesTime !== undefined
                ? seriesTimeToLogicalIndex.get(nextSeriesTime)
                : undefined;

            if (anchor && nextLogicalIndex !== undefined) {
                const shift = nextLogicalIndex - anchor.logicalIndex;
                from += shift;
                to += shift;
            }

            try {
                markProgrammaticBarSpacing();
                chart.timeScale().setVisibleLogicalRange({ from, to });
            } catch {
                // The anchor can disappear if the data window changed during a fast reload.
            }
        };
        const focusLatestBars = (barCount: number) => {
            if (barCount <= 0) {
                return;
            }

            try {
                const preferredBarSpacing = getPreferredBarSpacing(visualConfig.timeScale.barSpacing);
                const rightOffset = getPreferredRightOffset(preferredBarSpacing);
                const to = barCount - 1 + rightOffset;
                // Always use a fixed window so bar width is identical across all symbols
                // regardless of how many bars are currently loaded. Allows negative `from`
                // so sparse/provisional charts don't produce oversized candles, but keep
                // the window tight enough that first-paint candles remain readable.
                const from = to - MAX_INITIAL_VISIBLE_BARS;

                applyTimeScaleOptions({
                    barSpacing: preferredBarSpacing,
                    rightOffset,
                });
                markProgrammaticBarSpacing();
                chart.timeScale().setVisibleLogicalRange({
                    from,
                    to,
                });
            } catch {
                // Chart can reject range changes during very fast symbol switches.
            }
        };
        const refitVisiblePriceScale = () => {
            if (scaleFixOneToOne) {
                return;
            }

            try {
                const priceScale = chart.priceScale('right');
                priceScale.applyOptions({ autoScale: false });
                priceScale.applyOptions({ autoScale: true });
            } catch {
                // Chart can be disposed while async live/history callbacks settle.
            }
        };
        const resizeChartToHost = () => {
            const size = getChartHostSize();
            if (!size) {
                return false;
            }

            try {
                cachedHostHeight = size.height;
                chart.resize(size.width, size.height);
                updateLivePriceOverlay();
                updatePositionLineOverlays();
                return true;
            } catch {
                // Chart may already be disposed during a fast symbol switch.
                return false;
            }
        };
        const scheduleResizeChartToHost = () => {
            if (resizeFrame !== null) {
                window.cancelAnimationFrame(resizeFrame);
            }

            resizeFrame = window.requestAnimationFrame(() => {
                resizeFrame = null;
                resizeChartToHost();
            });
        };
        const scheduleDataLayout = (
            barCount: number,
            layoutMode: DataLayoutMode = 'focus-latest',
            previousRange: LogicalRangeSnapshot | null = null,
            previousAnchor: VisibleAnchorSnapshot | null = null,
            wasPinnedToLatest = false,
            attempt = 0,
        ) => {
            if (dataLayoutFrame !== null) {
                window.cancelAnimationFrame(dataLayoutFrame);
            }

            dataLayoutFrame = window.requestAnimationFrame(() => {
                dataLayoutFrame = null;
                if (disposed) {
                    return;
                }

                const hasSize = resizeChartToHost();
                if (!hasSize && attempt < 8) {
                    scheduleDataLayout(
                        barCount,
                        layoutMode,
                        previousRange,
                        previousAnchor,
                        wasPinnedToLatest,
                        attempt + 1,
                    );
                    return;
                }

                if (layoutMode === 'focus-latest' || (layoutMode === 'preserve-or-follow-latest' && wasPinnedToLatest)) {
                    focusLatestBars(barCount);
                } else {
                    restoreVisibleLogicalRange(previousRange, previousAnchor);
                }
                updateLivePriceOverlay();
                scheduleVolumeSeriesRender();
                // Second-pass rAF: after the chart commits its layout, re-draw the live price
                // overlay and volume. Also reset the price scale autoScale so Y-axis fits
                // only the VISIBLE bars — not all loaded history. Without this, charts like
                // XAUUSD (4550 AM → 4391 now) or BTCUSD (76000 → 73400) show flat dashes
                // because the full price range squishes each 1-minute candle to a tiny line.
                window.requestAnimationFrame(() => {
                    if (disposed) return;
                    updateLivePriceOverlay();
                    scheduleVolumeSeriesRender();
                    // Force price scale to refit based on currently visible bars only.
                    if (layoutMode === 'focus-latest' || (layoutMode === 'preserve-or-follow-latest' && wasPinnedToLatest)) {
                        refitVisiblePriceScale();
                    }
                });
            });
        };
        scheduleResizeChartToHost();
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(scheduleResizeChartToHost)
            : null;
        resizeObserver?.observe(host);
        resizeObserver?.observe(wrapper);

        const clearHistoryBackfillTimer = () => {
            if (historyBackfillTimer) {
                clearTimeout(historyBackfillTimer);
                historyBackfillTimer = null;
            }
        };
        const clearHistoryReadinessRetryTimer = () => {
            if (historyReadinessRetryTimer) {
                clearTimeout(historyReadinessRetryTimer);
                historyReadinessRetryTimer = null;
            }
            historyReadinessRetryRequested = false;
        };

        const scheduleHistoryLoadWhenRealtimeReady = () => {
            if (!isCurrentChartSwitch() || isHistoryLoaded || historyReadinessRetryRequested) {
                return;
            }

            historyReadinessRetryRequested = true;
            const retryWhenReady = () => {
                historyReadinessRetryTimer = null;
                if (!isCurrentChartSwitch() || isHistoryLoaded) {
                    historyReadinessRetryRequested = false;
                    return;
                }

                if (!isRealtimeOhlcClientReady()) {
                    historyReadinessRetryTimer = setTimeout(retryWhenReady, TRANSIENT_HISTORY_RETRY_COOLDOWN_MS);
                    return;
                }

                historyReadinessRetryRequested = false;
                void loadHistory(false);
            };

            historyReadinessRetryTimer = setTimeout(retryWhenReady, TRANSIENT_HISTORY_RETRY_COOLDOWN_MS);
        };

        const scheduleHistoryBackfillRetry = (
            stats: HistoryBarStats,
            historySeedApplied = hasRenderedHistorySeed,
        ) => {
            const shouldRetry = !historySeedApplied || shouldRetryHistoryBackfill(stats, bucketMs);
            if (
                !isCurrentChartSwitch() ||
                !shouldRetry ||
                backgroundHistoryBackfillAttempts >= MAX_BACKGROUND_HISTORY_BACKFILL_ATTEMPTS
            ) {
                if (historySeedApplied) {
                    setHistoryBackfillMessage(null);
                }
                return false;
            }

            if (historyBackfillTimer) {
                return true;
            }

            if (!historySeedApplied || (renderedBarCount === 0 && stats.realBars === 0)) {
                setHistoryBackfillMessage(getPendingHistoryNoDataMessage(getBackfillStatusMessage(stats)));
            } else {
                setHistoryBackfillMessage(null);
            }

            historyBackfillTimer = setTimeout(() => {
                historyBackfillTimer = null;
                if (!isCurrentChartSwitch()) {
                    return;
                }

                backgroundHistoryBackfillAttempts += 1;
                void loadHistory(true);
            }, BACKFILL_CHART_HISTORY_DELAY_MS);
            return true;
        };
        const ensureHistoryCatchUpRetry = (stats: HistoryBarStats) => {
            const retryScheduled = scheduleHistoryBackfillRetry(stats);
            if (retryScheduled) {
                return true;
            }

            return scheduleDeferredHistoryBackfill(true);
        };

        const scheduleDeferredHistoryBackfill = (hasMoreHistoryPotential: boolean) => {
            if (
                !isCurrentChartSwitch() ||
                !hasMoreHistoryPotential ||
                deferredBackfillScheduled ||
                historyBackfillTimer ||
                backgroundHistoryBackfillAttempts >= MAX_BACKGROUND_HISTORY_BACKFILL_ATTEMPTS ||
                loadedHistoryBarsByTime.size >= CHART_HISTORY_TARGET_BARS ||
                getNextStagedLatestHistoryLimit() === null
            ) {
                return false;
            }

            deferredBackfillScheduled = true;
            if (renderedBarCount === 0) {
                setHistoryBackfillMessage('Loading MT5 candle history in the background...');
            } else {
                setHistoryBackfillMessage(null);
            }

            historyBackfillTimer = setTimeout(() => {
                historyBackfillTimer = null;
                if (!isCurrentChartSwitch()) {
                    return;
                }

                backgroundHistoryBackfillAttempts += 1;
                void loadHistory(true).finally(() => {
                    deferredBackfillScheduled = false;
                });
            }, BACKFILL_CHART_HISTORY_DELAY_MS);
            return true;
        };

        function requestLatestHistoryGapFill(layoutMode: DataLayoutMode = 'preserve-or-follow-latest') {
            if (!isCurrentChartSwitch()) {
                return false;
            }

            const requestSignature = `${symbol}:${selectedResolution.minutes}:${lastBarTimeRef.current}`;
            if (latestHistoryGapCatchUpRequestSignature === requestSignature) {
                return false;
            }

            if (latestHistoryGapCatchUpInFlightGate.inFlight) {
                return latestHistoryGapCatchUpInFlightGate.markPending();
            }

            latestHistoryGapCatchUpRequestSignature = requestSignature;
            latestHistoryGapCatchUpInFlightGate.begin();
            void ohlcService.getHistory(
                symbol,
                selectedResolution.minutes,
                BACKFILL_CHART_HISTORY_LIMIT,
                { cacheFirst: true, cacheOnly: false },
            ).then((gapHistory) => {
                if (!isCurrentChartSwitch()) return;
                if (!gapHistory || gapHistory.length === 0) {
                    latestHistoryGapCatchUpInFlightGate.clearPending();
                    return;
                }

                const renderResult = applyBars(
                    gapHistory,
                    undefined,
                    true,
                    getCurrentRenderLimit(gapHistory.length),
                    true,
                    true,
                    true,
                    layoutMode,
                );
                if (renderResult.historySeedApplied && renderResult.renderedCandles) {
                    notifyHistoryStatusChange({ isLoading: false, hasCandles: true });
                } else {
                    latestHistoryGapCatchUpInFlightGate.clearPending();
                }
            }).catch(() => {
                if (isCurrentChartSwitch() && isRealtimeOhlcClientReady()) {
                    latestHistoryGapCatchUpInFlightGate.clearPending();
                }
                // Gap fill failed silently; chart continues with accumulated live bars.
            }).finally(() => {
                latestHistoryGapCatchUpInFlightGate.finish(!isCurrentChartSwitch(), scheduleLatestHistoryGapCatchUp);
            });

            return true;
        }

        function scheduleLatestHistoryGapCatchUp() {
            if (
                !isCurrentChartSwitch() ||
                latestHistoryGapCatchUpAttempts >= MAX_BACKGROUND_HISTORY_BACKFILL_ATTEMPTS
            ) {
                return false;
            }

            if (latestHistoryGapCatchUpInFlightGate.inFlight) {
                return latestHistoryGapCatchUpInFlightGate.markPending();
            }

            if (historyBackfillTimer) {
                return true;
            }

            historyBackfillTimer = setTimeout(() => {
                historyBackfillTimer = null;
                if (!isCurrentChartSwitch()) {
                    return;
                }

                if (latestHistoryGapCatchUpInFlightGate.inFlight) {
                    latestHistoryGapCatchUpInFlightGate.markPending();
                    return;
                }

                latestHistoryGapCatchUpAttempts += 1;
                requestLatestHistoryGapFill();
            }, BACKFILL_CHART_HISTORY_DELAY_MS);
            return true;
        }

        const renderProvisionalLivePreview = (emptyMessage?: string, allowLiveOnlyPreview = false) => {
            if (liveBarsByTime.size === 0) {
                return false;
            }
            if (
                !allowLiveOnlyPreview &&
                !hasRenderedHistorySeed &&
                !hasCachedOrHistoricalSeedBars(loadedHistoryBarsByTime.values())
            ) {
                return false;
            }
            if (hasRenderedAnyCandles || renderedBarCount > 0) {
                if (chartHasSetData) {
                    if (gracefulLoadingTimerRef.current !== null) {
                        clearTimeout(gracefulLoadingTimerRef.current);
                        gracefulLoadingTimerRef.current = null;
                    }
                    setIsLoading(false);
                    if (emptyMessage == null) {
                        setNoDataMessage(null);
                    }
                    notifyHistoryStatusChange({ isLoading: false, hasCandles: true });
                    return true;
                }
            }

            const renderResult = applyBars(
                [],
                emptyMessage,
                false,
                getCurrentRenderLimit(),
                false,
                true,
                true,
                'focus-latest',
                allowLiveOnlyPreview,
            );
            if (!renderResult.renderedCandles || (!allowLiveOnlyPreview && !renderResult.historySeedApplied)) {
                return false;
            }

            hasProvisionalLivePreview = true;
            if (gracefulLoadingTimerRef.current !== null) {
                clearTimeout(gracefulLoadingTimerRef.current);
                gracefulLoadingTimerRef.current = null;
            }
            setIsLoading(false);
            notifyHistoryStatusChange({ isLoading: false, hasCandles: true });
            return true;
        };

        const applyLiveBarToRenderedSeries = (
            liveBar: OHLCBar,
            previousLastBarTime: number,
            options: { replaceSameBucketRange?: boolean } = {},
        ) => {
            if (!isRealMarketBar(liveBar)) {
                return false;
            }

            const wasPinnedBeforeLiveAppend = isPinnedToLatest();
            const seriesTime = getNextSeriesTimeForLiveBar(liveBar);
            const previousDisplayBar = displayBarsBySeriesTime.get(seriesTime) ?? null;
            let displayLiveBar = options.replaceSameBucketRange && previousDisplayBar?.time === liveBar.time
                ? liveBar
                : preferRealBar(previousDisplayBar ?? undefined, liveBar, bucketMs);
            displayLiveBar = blendDisplayedBarWithOpenLiveTick(
                previousDisplayBar,
                liveBar,
                displayLiveBar,
            );
            const previousLatestSeriesTime = previousLastBarTime > 0
                ? realTimeToSeriesTime.get(previousLastBarTime)
                : undefined;
            let previousRenderedBar = previousDisplayBar;
            if (!previousRenderedBar && previousLatestSeriesTime !== undefined) {
                previousRenderedBar = displayBarsBySeriesTime.get(previousLatestSeriesTime) ?? null;
            }
            previousRenderedBar = previousRenderedBar ?? currentBarRef.current;
            displayLiveBar = alignLiveBarOpenToPreviousClose(displayLiveBar, previousRenderedBar);
            const repairedDisplayLiveBar = repairImplausibleSameBucketLiveRange(
                displayLiveBar,
                liveBar,
                previousDisplayBar,
            );
            if (repairedDisplayLiveBar.repaired) {
                displayLiveBar = repairedDisplayLiveBar.bar;
                liveBarsByTime.set(displayLiveBar.time, displayLiveBar);
            }
            const isCommittedSeriesTime = latestCommittedSeriesTime !== null &&
                seriesTime <= latestCommittedSeriesTime;
            if (hasSameOhlcvValues(previousDisplayBar, displayLiveBar) && isCommittedSeriesTime) {
                return false;
            }

            lastBarTimeRef.current = displayLiveBar.time;
            const latestCommittedBar = latestCommittedSeriesTime !== null
                ? displayBarsBySeriesTime.get(latestCommittedSeriesTime) ?? null
                : null;
            const latestCommittedRealTime = latestCommittedSeriesTime !== null
                ? seriesTimeToRealTime.get(latestCommittedSeriesTime) ?? latestCommittedBar?.time ?? 0
                : 0;
            const isNewLiveBar = latestCommittedRealTime > 0
                ? displayLiveBar.time > latestCommittedRealTime
                : previousLastBarTime === 0 || displayLiveBar.time > previousLastBarTime;
            if (isNewLiveBar) {
                renderedBarCount += 1;
            }

            if (isRealMarketBar(displayLiveBar)) {
                realBarsBySeriesTime.set(seriesTime, displayLiveBar);
            }
            displayBarsBySeriesTime.set(seriesTime, displayLiveBar);
            if (!seriesTimeToLogicalIndex.has(seriesTime)) {
                seriesTimeToLogicalIndex.set(seriesTime, Math.max(0, renderedBarCount - 1));
            }
            realTimeToSeriesTime.set(displayLiveBar.time, seriesTime);
            seriesTimeToRealTime.set(seriesTime, displayLiveBar.time);
            if (latestSeriesTime === null || seriesTime > latestSeriesTime) {
                latestSeriesTime = seriesTime;
            }
            currentBarRef.current = displayLiveBar;
            fallbackLiveAxisPriceRef.current = displayLiveBar.close;
            livePriceRef.current = resolveLiveAxisPrice(displayLiveBar.close);
            hasRenderedAnyCandles = true;
            if (gracefulLoadingTimerRef.current !== null) {
                clearTimeout(gracefulLoadingTimerRef.current);
                gracefulLoadingTimerRef.current = null;
            }
            markChartHasCandles();
            const firstRenderForChartDataStream = lastAppliedChartDataStreamKeyRef.current !== chartDataStreamKey;
            lastAppliedChartDataStreamKeyRef.current = chartDataStreamKey;
            if (firstRenderForChartDataStream || renderedBarCount < MIN_LATEST_VISIBLE_BARS) {
                pendingLiveFocusLatest = true;
            }
            if (isNewLiveBar) {
                pruneRenderedLiveWindowIfNeeded();
                pendingNewBarScrollToLatest = true;
                pendingNewBarWasPinnedToLatest = pendingNewBarWasPinnedToLatest || wasPinnedBeforeLiveAppend;
            }
            scheduleLiveSeriesUpdate(seriesTime, displayLiveBar, {
                isNewBar: isNewLiveBar,
                previousClose: previousRenderedBar?.close ?? null,
            });
            if (isNewLiveBar && displayLiveBar.basis === 'ui_timeframe_rollover') {
                if (liveRenderFrame !== null) {
                    window.cancelAnimationFrame(liveRenderFrame);
                    liveRenderFrame = null;
                }
                flushLiveSeriesUpdates();
            }
            scheduleNextLiveCandleBoundaryRollover();
            notifyHistoryStatusChange({ isLoading: false, hasCandles: true });
            return true;
        };

        const applyLivePriceSnapshotToRenderedCandle = (
            options: { allowWallClockRollover?: boolean } = {},
        ) => {
            if (!isActiveRenderedChartSwitch()) {
                return;
            }

            const snapshot = getLivePriceSnapshotBySymbol(symbol);
            const snapshotLivePrice = snapshot ? getLiveQuotePrice(snapshot) : null;

            const nowMs = getCurrentFrontendTime();
            const previousLastBarTime = lastBarTimeRef.current;
            const currentBucketTime = getCurrentFrontendBucketTime();
            const latestRenderedBar =
                (latestSeriesTime !== null ? displayBarsBySeriesTime.get(latestSeriesTime) : null) ??
                currentBarRef.current;
            const fallbackRolloverPrice =
                latestRenderedBar?.close ??
                fallbackLiveAxisPriceRef.current ??
                livePriceRef.current ??
                null;
            const livePrice = snapshotLivePrice ?? (
                options.allowWallClockRollover ? fallbackRolloverPrice : null
            );

            if (livePrice === null || !Number.isFinite(livePrice) || livePrice <= 0) {
                return;
            }

            const snapshotTime = snapshot
                ? getLiveQuoteEventTime(snapshot, nowMs)
                : nowMs;
            const snapshotBucketTime = bucketTimeMs(snapshotTime, bucketMs);
            const snapshotTimeIsStaleForRenderedBar = Boolean(
                previousLastBarTime > 0 &&
                currentBucketTime >= previousLastBarTime + bucketMs &&
                snapshotBucketTime > 0 &&
                snapshotBucketTime <= previousLastBarTime,
            );
            const shouldRollToCurrentBucket = Boolean(
                previousLastBarTime > 0 &&
                currentBucketTime >= previousLastBarTime + bucketMs &&
                (options.allowWallClockRollover || snapshotTimeIsStaleForRenderedBar),
            );
            if (options.allowWallClockRollover && !shouldRollToCurrentBucket) {
                return;
            }
            const eventTime = shouldRollToCurrentBucket
                ? currentBucketTime
                : snapshotTime;
            const eventBucketTime = bucketTimeMs(eventTime, bucketMs);
            if (eventBucketTime <= 0) {
                return;
            }

            const targetTime = previousLastBarTime > 0 && eventBucketTime < previousLastBarTime
                ? previousLastBarTime
                : eventBucketTime;
            const targetSeriesTime = realTimeToSeriesTime.get(targetTime);
            const previousSameBucketBar =
                liveBarsByTime.get(targetTime) ??
                (targetSeriesTime !== undefined ? displayBarsBySeriesTime.get(targetSeriesTime) : undefined) ??
                (latestRenderedBar?.time === targetTime ? latestRenderedBar : null);
            const candleBase = previousSameBucketBar ?? latestRenderedBar;
            const volumeIncrement = snapshot ? getLiveQuoteVolumeIncrement(snapshot) : 1;
            if (!candleBase) {
                const provisionalLiveBar: OHLCBar = {
                    symbol,
                    timeframeMinutes: selectedResolution.minutes,
                    time: targetTime,
                    open: livePrice,
                    high: livePrice,
                    low: livePrice,
                    close: livePrice,
                    volume: volumeIncrement,
                    source: 'mt5_tick',
                    sourceTimeMs: eventTime,
                    closed: false,
                    basis: 'live_quote_cold_chart_seed',
                };
                if (!isBarInsideChartSymbolPriceDomain(symbol, provisionalLiveBar)) {
                    return;
                }

                const liveBar = cacheLiveBar(provisionalLiveBar, {
                    skipSanity: true,
                });
                if (!liveBar) {
                    return;
                }

                applyLiveBarToRenderedSeries(liveBar, previousLastBarTime);
                return;
            }
            const updatedSeries = applyPriceToCandleSeries(
                [candleBase],
                livePrice,
                pricePrecision,
                selectedResolution.minutes,
                eventTime,
                volumeIncrement,
                2,
            );
            const updatedCandle = updatedSeries[updatedSeries.length - 1];
            if (!updatedCandle) {
                return;
            }
            const liveQuoteReferencePrice =
                previousSameBucketBar?.close ??
                latestRenderedBar?.close ??
                updatedCandle.open;
            if (
                isImplausibleLiveQuoteFallbackMove(
                    liveQuoteReferencePrice,
                    livePrice,
                    LIVE_QUOTE_FALLBACK_MAX_SINGLE_MOVE_RATIO,
                )
            ) {
                return;
            }
            const previousHighLooksPolluted = Boolean(
                previousSameBucketBar &&
                previousSameBucketBar.high > Math.max(previousSameBucketBar.open, previousSameBucketBar.close, livePrice) &&
                isImplausibleLiveQuoteFallbackMove(
                    liveQuoteReferencePrice,
                    previousSameBucketBar.high,
                    LIVE_QUOTE_FALLBACK_MAX_STORED_EXTREME_RATIO,
                ),
            );
            const previousLowLooksPolluted = Boolean(
                previousSameBucketBar &&
                previousSameBucketBar.low < Math.min(previousSameBucketBar.open, previousSameBucketBar.close, livePrice) &&
                isImplausibleLiveQuoteFallbackMove(
                    liveQuoteReferencePrice,
                    previousSameBucketBar.low,
                    LIVE_QUOTE_FALLBACK_MAX_STORED_EXTREME_RATIO,
                ),
            );
            const preservedHigh = previousHighLooksPolluted
                ? Math.max(updatedCandle.open, previousSameBucketBar?.close ?? updatedCandle.open)
                : updatedCandle.high;
            const preservedLow = previousLowLooksPolluted
                ? Math.min(updatedCandle.open, previousSameBucketBar?.close ?? updatedCandle.open)
                : updatedCandle.low;
            const shouldReplaceSameBucketRange = previousHighLooksPolluted || previousLowLooksPolluted;
            const liveSnapshotBar: OHLCBar = {
                ...updatedCandle,
                symbol,
                timeframeMinutes: selectedResolution.minutes,
                high: Math.max(preservedHigh, livePrice),
                low: Math.min(preservedLow, livePrice),
                source: 'mt5_tick',
                sourceTimeMs: eventTime,
                closed: false,
            };
            if (!isBarInsideChartSymbolPriceDomain(symbol, liveSnapshotBar)) {
                return;
            }

            const liveBar = cacheLiveBar(liveSnapshotBar, {
                replaceExisting: shouldReplaceSameBucketRange,
                skipSanity: true,
            });
            if (!liveBar) {
                return;
            }

            applyLiveBarToRenderedSeries(
                liveBar,
                previousLastBarTime,
                { replaceSameBucketRange: shouldReplaceSameBucketRange },
            );
        };

        const alignOpenLiveBarCloseToCurrentPriceLine = (bar: OHLCBar): OHLCBar => {
            if (!isOpenLiveTickBar(bar)) {
                return bar;
            }

            const currentLinePrice = resolveLiveAxisPrice(fallbackLiveAxisPriceRef.current ?? bar.close);
            if (
                typeof currentLinePrice !== 'number' ||
                !Number.isFinite(currentLinePrice) ||
                currentLinePrice <= 0 ||
                currentLinePrice === bar.close
            ) {
                return bar;
            }

            return {
                ...bar,
                high: Math.max(bar.high, currentLinePrice),
                low: Math.min(bar.low, currentLinePrice),
                close: currentLinePrice,
                sourceTimeMs: ohlcService.getServerNowMs(),
            };
        };

        const getLatestRenderedBarForLiveRollover = (): OHLCBar | null => {
            let latest: OHLCBar | null = null;
            for (const bar of displayBarsBySeriesTime.values()) {
                if (isRealMarketBar(bar) && (!latest || bar.time > latest.time)) {
                    latest = bar;
                }
            }
            const currentBar = currentBarRef.current;
            if (currentBar && isRealMarketBar(currentBar) && (!latest || currentBar.time > latest.time)) {
                latest = currentBar;
            }
            return latest;
        };

        const getLiveRolloverPrice = (fallbackPrice: number | null | undefined): number | null => {
            const snapshot = getLivePriceSnapshotBySymbol(symbol);
            const snapshotPrice = snapshot ? getLiveQuotePrice(snapshot) : null;
            const price = snapshotPrice ?? resolveLiveAxisPrice(fallbackPrice ?? null) ?? fallbackPrice ?? null;

            return typeof price === 'number' && Number.isFinite(price) && price > 0
                ? price
                : null;
        };
        const getCurrentFrontendBucketTime = (): number => {
            const serverBucketTime = bucketTimeMs(ohlcService.getServerNowMs(), bucketMs);
            const browserBucketTime = bucketTimeMs(Date.now(), bucketMs);

            return Math.max(serverBucketTime, browserBucketTime);
        };
        const getCurrentFrontendTime = (): number => Math.max(
            ohlcService.getServerNowMs(),
            Date.now(),
        );

        const forceVisibleCandleRolloverToCurrentBucket = (): boolean => {
            if (!isActiveRenderedChartSwitch() || bucketMs <= 0) {
                return false;
            }

            const nowMs = getCurrentFrontendTime();
            const currentBucketTime = getCurrentFrontendBucketTime();
            if (currentBucketTime <= 0) {
                return false;
            }

            const latestRenderedBar = getLatestRenderedBarForLiveRollover();
            const previousLastBarTime = latestRenderedBar?.time ?? (
                lastBarTimeRef.current > 0 ? lastBarTimeRef.current : 0
            );
            if (!latestRenderedBar || previousLastBarTime <= 0 || currentBucketTime < previousLastBarTime + bucketMs) {
                return false;
            }

            const firstRolloverTime = previousLastBarTime + bucketMs;
            const missingBucketCount = Math.floor((currentBucketTime - firstRolloverTime) / bucketMs) + 1;
            if (missingBucketCount <= 0) {
                return false;
            }

            const limitedFirstRolloverTime = missingBucketCount > LIVE_CANDLE_ROLLOVER_MAX_CATCHUP_BARS
                ? currentBucketTime - ((LIVE_CANDLE_ROLLOVER_MAX_CATCHUP_BARS - 1) * bucketMs)
                : firstRolloverTime;
            let renderedAny = false;
            let previousBar = latestRenderedBar;

            // UI-owned candle generation: use the frontend-maintained MT5/server
            // clock so selected-timeframe rollover stays on the same bucket grid as
            // history bars, without waiting for a backend "new candle" event.
            for (
                let rolloverTime = limitedFirstRolloverTime;
                rolloverTime <= currentBucketTime;
                rolloverTime += bucketMs
            ) {
                const livePrice = getLiveRolloverPrice(previousBar.close) ?? previousBar.close;
                if (!Number.isFinite(livePrice) || livePrice <= 0) {
                    continue;
                }

                const rolloverBar: OHLCBar = {
                    time: rolloverTime,
                    open: previousBar.close,
                    high: Math.max(previousBar.close, livePrice),
                    low: Math.min(previousBar.close, livePrice),
                    close: livePrice,
                    volume: 1,
                    symbol,
                    timeframeMinutes: selectedResolution.minutes,
                    source: 'mt5_tick',
                    sourceTimeMs: nowMs,
                    basis: 'ui_timeframe_rollover',
                    closed: rolloverTime < currentBucketTime,
                };

                if (!isBarInsideChartSymbolPriceDomain(symbol, rolloverBar)) {
                    continue;
                }

                const liveBar = cacheLiveBar(rolloverBar, { replaceExisting: true, skipSanity: true });
                if (!liveBar) {
                    continue;
                }

                const applied = applyLiveBarToRenderedSeries(
                    liveBar,
                    previousBar.time,
                    { replaceSameBucketRange: true },
                );
                renderedAny = renderedAny || applied;
                previousBar = liveBar;
            }

            return renderedAny;
        };

        const runLiveCandleRollover = (): boolean => {
            if (forceVisibleCandleRolloverToCurrentBucket()) {
                return true;
            }

            applyLivePriceSnapshotToRenderedCandle({ allowWallClockRollover: true });
            return false;
        };

        let liveCandleBoundaryTimer: number | null = null;
        const scheduleNextLiveCandleBoundaryRollover = () => {
            if (liveCandleBoundaryTimer !== null) {
                window.clearTimeout(liveCandleBoundaryTimer);
                liveCandleBoundaryTimer = null;
            }

            if (!isActiveRenderedChartSwitch() || bucketMs <= 0) {
                return;
            }

            const nowMs = getCurrentFrontendTime();
            const latestRealTime = lastBarTimeRef.current > 0
                ? lastBarTimeRef.current
                : currentBarRef.current?.time ?? 0;
            const nextBoundaryTime = latestRealTime > 0
                ? latestRealTime + bucketMs
                : bucketTimeMs(nowMs, bucketMs) + bucketMs;
            const delayMs = Math.min(
                bucketMs,
                Math.max(25, nextBoundaryTime - nowMs + 25),
            );

            liveCandleBoundaryTimer = window.setTimeout(() => {
                liveCandleBoundaryTimer = null;
                runLiveCandleRollover();
                scheduleNextLiveCandleBoundaryRollover();
            }, delayMs);
        };

        const applyBars = (
            bars: OHLCBar[],
            emptyMessage?: string,
            deferHistoryStatus = false,
            maxBars = MAX_RENDERED_OHLC_BARS,
            markHistoryLoaded = true,
            includeLoadedHistory = true,
            includeLiveCache = true,
            layoutMode: DataLayoutMode = 'focus-latest',
            allowLiveOnlyPreview = false,
        ): HistoryRenderResult => {
            cancelPendingLiveSeriesUpdates();
            if (pendingProvisionalPreviewTimer !== null) {
                clearTimeout(pendingProvisionalPreviewTimer);
                pendingProvisionalPreviewTimer = null;
            }

            const mergedByBucketTime = new Map<number, OHLCBar>();
            const historyCatchUpReferenceBars: OHLCBar[] = [];
            const liveCatchUpReferenceBars: OHLCBar[] = [];
            const acceptedLiveCacheBars: OHLCBar[] = [];
            const canPreserveRangeForChartDataStream = lastAppliedChartDataStreamKeyRef.current === chartDataStreamKey;
            const effectiveLayoutMode = canPreserveRangeForChartDataStream ? layoutMode : 'focus-latest';
            const shouldPreserveRange = effectiveLayoutMode !== 'focus-latest';
            const visibleRange = shouldPreserveRange
                ? chart.timeScale().getVisibleLogicalRange()
                : null;
            const previousRange = visibleRange
                ? { from: visibleRange.from as number, to: visibleRange.to as number }
                : null;
            const previousAnchor = shouldPreserveRange
                ? getVisibleAnchorSnapshot(previousRange)
                : null;
            const wasPinnedToLatest = shouldPreserveRange ? isPinnedToLatest() : false;
            const emitHistoryStatus = (status: { isLoading: boolean; hasCandles: boolean }) => {
                if (!deferHistoryStatus) {
                    notifyHistoryStatusChange(
                        !status.isLoading && historyBackfillTimer && !status.hasCandles
                            ? { ...status, isLoading: true }
                            : status,
                    );
                }
            };
            const acceptedInputBars = filterAcceptedOhlcBarsForChart(
                bars,
                markHistoryLoaded ? 'history' : 'render_input',
                {
                    useChronologicalBatch: markHistoryLoaded,
                    seedStatefulReference: markHistoryLoaded,
                },
            );

            if (markHistoryLoaded) {
                rememberLoadedHistoryBars(acceptedInputBars, { skipSanity: true });
            }

            const acceptedLoadedHistoryBars = filterAcceptedOhlcBarsForChart(
                [...loadedHistoryBarsByTime.values()],
                'loaded_history_cache',
                { useChronologicalBatch: true },
            );
            if (includeLoadedHistory) {
                for (const bar of acceptedLoadedHistoryBars) {
                    if (hasValidBarPrices(bar)) {
                        const bucketedBar = toBucketedBar(bar, bucketMs);
                        if (isLatestHistoryCatchUpReferenceBar(bucketedBar)) {
                            historyCatchUpReferenceBars.push(bucketedBar);
                        }
                        upsertPreferredBar(mergedByBucketTime, bucketedBar, bucketMs);
                    }
                }
            }
            for (const bar of acceptedInputBars) {
                if (hasValidBarPrices(bar)) {
                    const bucketedBar = toBucketedBar(bar, bucketMs);
                    if (isLatestHistoryCatchUpReferenceBar(bucketedBar)) {
                        historyCatchUpReferenceBars.push(bucketedBar);
                    }
                    upsertPreferredBar(mergedByBucketTime, bucketedBar, bucketMs);
                }
            }
            if (includeLiveCache) {
                for (const bar of liveBarsByTime.values()) {
                    if (hasValidBarPrices(bar)) {
                        const bucketedBar = toBucketedBar(bar, bucketMs);
                        if (!acceptOhlcBarForChart(bucketedBar, bucketedBar.source ?? 'live_cache')) {
                            continue;
                        }
                        if (isRealMarketBar(bucketedBar)) {
                            liveCatchUpReferenceBars.push(bucketedBar);
                        }
                        acceptedLiveCacheBars.push(bucketedBar);
                    }
                }
            }
            const latestHistoryBaselineDecision = markHistoryLoaded && includeLiveCache
                ? getLatestCleanHistoryBaselineDecision(
                    historyCatchUpReferenceBars,
                    liveCatchUpReferenceBars,
                    bucketMs,
                    undefined,
                    LIVE_HISTORY_BASELINE_OPTIONS,
                )
                : null;
            const shouldSuppressLiveCacheForPendingLatestHistory = latestHistoryBaselineDecision !== null &&
                latestHistoryBaselineDecision.reason === 'history_live_price_gap';
            const liveBarToRestoreAfterHistoryRender = shouldSuppressLiveCacheForPendingLatestHistory
                ? acceptedLiveCacheBars[acceptedLiveCacheBars.length - 1] ?? null
                : null;
            if (includeLiveCache && !shouldSuppressLiveCacheForPendingLatestHistory) {
                for (const bucketedBar of acceptedLiveCacheBars) {
                    upsertPreferredBar(mergedByBucketTime, bucketedBar, bucketMs);
                }
            }
            const mergedBars = normalizeChartBars([...mergedByBucketTime.values()], bucketMs, maxBars);
            const stats = summarizeHistoryBars(mergedBars, bucketMs);
            const latestHistoryCatchUpReferenceTime = getLatestHistoryCatchUpReferenceTime(
                historyCatchUpReferenceBars,
                bucketMs,
            );
            const earliestLiveCacheRealTime = getRealBarTimeWindow(
                liveCatchUpReferenceBars,
                bucketMs,
            ).startTime;
            const latestRenderWindow = getLatestCoherentRenderBars(mergedBars, bucketMs, maxBars);
            const renderBars = latestRenderWindow.bars;
            const shouldScheduleLatestHistoryGapCatchUp = markHistoryLoaded
                && includeLiveCache
                && (
                    shouldSuppressLiveCacheForPendingLatestHistory ||
                    latestRenderWindow.trimmedDisconnectedPrefix ||
                    shouldRequestLatestHistoryForLiveGap(
                        latestHistoryCatchUpReferenceTime,
                        earliestLiveCacheRealTime,
                        bucketMs,
                    )
                );
            const realBars = getRenderableMarketBars(renderBars, maxBars);
            // Do not render continuity/gap-fill bars. They consume compact logical slots
            // and reintroduce visible gaps between real backend history and live candles.
            const displayBars = alignOpenGapsToPreviousClose(realBars);
            const hasCandles = realBars.length > 0;
            const renderHasHistorySeed = hasRenderedHistorySeed
                || (markHistoryLoaded && acceptedInputBars.some(isLatestHistoryCatchUpReferenceBar))
                || (markHistoryLoaded && acceptedInputBars.some(isHistoryResponseSeedBar))
                || hasCachedOrHistoricalSeedBars(acceptedInputBars)
                || (includeLoadedHistory && hasCachedOrHistoricalSeedBars(acceptedLoadedHistoryBars));
            const renderResult: HistoryRenderResult = {
                stats,
                renderedCandles: false,
                historySeedApplied: false,
            };
            if (hasCandles && !renderHasHistorySeed && !allowLiveOnlyPreview) {
                return renderResult;
            }
            if (!hasCandles && hasRenderedAnyCandles) {
                if (chartHasSetData) {
                    renderResult.renderedCandles = true;
                    renderResult.historySeedApplied = hasRenderedHistorySeed;
                    if (!deferHistoryStatus) { clearLoadingTimer(); setIsLoading(false); }
                    if (emptyMessage == null) {
                        setNoDataMessage(null);
                    }
                    emitHistoryStatus({ isLoading: false, hasCandles: true });
                    return renderResult;
                }
            }
            const compactEntries = buildCompactSeriesEntries(
                displayBars,
                bucketMs,
                COMPACT_SERIES_EPOCH_MS,
            );
            const seriesDataUnchanged = chartHasSetData
                && compactEntries.length === displayBarsBySeriesTime.size
                && compactEntries.every(({ bar, seriesTime }) => {
                    const existingBar = displayBarsBySeriesTime.get(seriesTime);
                    return Boolean(existingBar && hasSameOhlcvValues(existingBar, bar));
                });
            renderedBarCount = compactEntries.length;
            displayBarsBySeriesTime.clear();
            realBarsBySeriesTime.clear();
            seriesTimeToLogicalIndex.clear();
            realTimeToSeriesTime.clear();
            seriesTimeToRealTime.clear();
            latestSeriesTime = null;
            latestCommittedSeriesTime = null;

            compactEntries.forEach(({ bar, seriesTime, logicalIndex }) => {
                displayBarsBySeriesTime.set(seriesTime, bar);
                seriesTimeToLogicalIndex.set(seriesTime, logicalIndex);
                realTimeToSeriesTime.set(bar.time, seriesTime);
                seriesTimeToRealTime.set(seriesTime, bar.time);
                latestSeriesTime = seriesTime;
            });
            for (const bar of realBars) {
                const seriesTime = realTimeToSeriesTime.get(bar.time);
                if (seriesTime !== undefined) {
                    realBarsBySeriesTime.set(seriesTime, bar);
                }
            }

            try {
                if (!seriesDataUnchanged) {
                    if (chartType === 'Line') {
                        mainSeries.setData(compactEntries.map(({ bar, seriesTime }) =>
                            toLineData(bar, seriesTime),
                        ));
                    } else {
                        let lastCloseCompact = 1;
                        mainSeries.setData(compactEntries.map(({ bar, seriesTime }) => {
                            const visual = toVisualCandleData(bar, pricePrecision, seriesTime, lastCloseCompact);
                            lastCloseCompact = visual.close;
                            return visual;
                        }));
                    }
                }
                chartHasSetData = compactEntries.length > 0;
                latestCommittedSeriesTime = chartHasSetData ? latestSeriesTime : null;
                if (!seriesDataUnchanged) {
                    renderVolumeSeriesForCurrentRange();
                    syncMarkersRef.current?.();
                }
                cancelPendingLiveSeriesUpdates();
            } catch (error) {
                cancelPendingLiveSeriesUpdates();
                // Surface detailed diagnostics: most common cause is non-ascending UTCTimestamps.
                // Log the first few series times to diagnose ordering issues.
                const timeSample = compactEntries.slice(0, 5).map((e) => e.seriesTime);
                console.warn(
                    '[KlineChart] mainSeries.setData() failed.',
                    'barCount:', compactEntries.length,
                    'firstSeriesTimes:', timeSample,
                    'error:', error,
                );
                isHistoryLoaded = true;
                clearLoadingTimer(); setIsLoading(false);
                noDataShown = true; setNoDataMessage('Received candle data, but the chart could not render it. Waiting for the next update.');
                emitHistoryStatus({ isLoading: false, hasCandles: false });
                return renderResult;
            }

            const latestRealBar = realBars[realBars.length - 1] ?? null;
            // Use the latest REAL bar for header/crosshair; fall back to last displayBar close
            // for the live price overlay so continuity bars don't pollute the price display.
            const latestDisplayBar = latestRealBar ?? (displayBars[displayBars.length - 1] ?? null);
            if (latestDisplayBar) {
                renderResult.renderedCandles = hasCandles;
                renderResult.historySeedApplied = renderHasHistorySeed && hasCandles;
                hasRenderedAnyCandles = true;
                hasRenderedHistorySeed = hasRenderedHistorySeed || renderResult.historySeedApplied;
                lastBarTimeRef.current = latestRealBar?.time ?? 0;
                currentBarRef.current = latestRealBar;
                fallbackLiveAxisPriceRef.current = latestDisplayBar.close;
                livePriceRef.current = resolveLiveAxisPrice(latestDisplayBar.close);
                setNoDataMessage(null);
                // Keep spinner while still in provisional-preview mode (deferHistoryStatus=true).
                // History hasn't loaded yet â€” clearing isLoading here causes the blank-chart flash.
                if (!deferHistoryStatus) { clearLoadingTimer(); setIsLoading(false); }
                setActiveBarIfChanged(latestDisplayBar);
                if (hasCandles && latestRealBar) {
                    seedOhlcClosePrice(symbol, latestRealBar.close, latestRealBar.time);
                }
                lastAppliedChartDataStreamKeyRef.current = chartDataStreamKey;
                if (markHistoryLoaded && hasCandles) {
                    normalizeChartBarSpacingToPreferred();
                }
                scheduleDataLayout(
                    displayBars.length,
                    effectiveLayoutMode,
                    previousRange,
                    previousAnchor,
                    wasPinnedToLatest,
                );
                emitHistoryStatus({ isLoading: false, hasCandles });
            } else {
                if (hasRenderedAnyCandles) {
                    if (!deferHistoryStatus) { clearLoadingTimer(); setIsLoading(false); }
                    emitHistoryStatus({ isLoading: false, hasCandles: hasRenderedHistorySeed });
                    return renderResult;
                }

                lastBarTimeRef.current = 0;
                currentBarRef.current = null;
                fallbackLiveAxisPriceRef.current = null;
                livePriceRef.current = resolveLiveAxisPrice(null);
                renderedBarCount = 0;
                livePriceLineRef.current?.style.setProperty('display', 'none');
                livePriceBadgeRef.current?.style.setProperty('display', 'none');
                livePriceHitRef.current?.style.setProperty('display', 'none');
                setActiveBarIfChanged(null);
                noDataShown = emptyMessage != null; setNoDataMessage(emptyMessage ?? null);
                emitHistoryStatus({ isLoading: false, hasCandles: false });
            }

            syncPositionLines();
            if (markHistoryLoaded && renderResult.historySeedApplied) {
                isHistoryLoaded = true;
                clearLoadingTimer(); setIsLoading(false);
                // Seed a provisional live candle at the current bucket when history ends
                // in the past — eliminates the right-edge gap before the first real tick arrives.
                if (latestRealBar !== null && bucketMs > 0) {
                    const nowMs = getCurrentFrontendTime();
                    const nowBucketTime = getCurrentFrontendBucketTime();
                    if (
                        nowBucketTime >= latestRealBar.time + bucketMs &&
                        !liveBarsByTime.has(nowBucketTime) &&
                        !realTimeToSeriesTime.has(nowBucketTime)
                    ) {
                        const liveSeedPrice = getLiveRolloverPrice(latestRealBar.close) ?? latestRealBar.close;
                        const seedBar: OHLCBar = {
                            time: nowBucketTime,
                            open: latestRealBar.close,
                            high: Math.max(latestRealBar.close, liveSeedPrice),
                            low: Math.min(latestRealBar.close, liveSeedPrice),
                            close: liveSeedPrice,
                            volume: 1,
                            source: 'mt5_tick',
                            sourceTimeMs: nowMs,
                            closed: false,
                        };
                        const acceptedSeedBar = cacheLiveBar(seedBar, { replaceExisting: true, skipSanity: true });
                        if (acceptedSeedBar) {
                            applyLiveBarToRenderedSeries(acceptedSeedBar, latestRealBar.time);
                        }
                    }
                }
            }

            if (shouldScheduleLatestHistoryGapCatchUp) {
                scheduleLatestHistoryGapCatchUp();
            } else if (markHistoryLoaded && includeLiveCache && renderResult.historySeedApplied) {
                latestHistoryGapCatchUpAttempts = 0;
                latestHistoryGapCatchUpInFlightGate.clearPending();
            }

            // A stale history response must never leave the chart tip behind the live feed.
            // Keep the conservative full-history merge above, then append the already-sanity-
            // checked live candle while the missing history range is repaired in the background.
            if (liveBarToRestoreAfterHistoryRender && isRealMarketBar(liveBarToRestoreAfterHistoryRender)) {
                applyLiveBarToRenderedSeries(liveBarToRestoreAfterHistoryRender, lastBarTimeRef.current);
            }

            return renderResult;
        };

        const flushHistoricalCacheRender = () => {
            historicalCacheRenderFrame = null;
            if (!isCurrentChartSwitch() || !isHistoryLoaded) {
                return;
            }

            applyBars(
                [],
                undefined,
                false,
                getCurrentRenderLimit(),
                false,
                true,
                true,
                'preserve-visible',
            );
        };

        const scheduleHistoricalCacheRender = () => {
            if (historicalCacheRenderFrame !== null) {
                return;
            }

            historicalCacheRenderFrame = window.requestAnimationFrame(flushHistoricalCacheRender);
        };

        const loadOlderHistory = async (rangeKey: string, beforeUnixMs: number) => {
            try {
                if (!isRealtimeOhlcClientReady()) {
                    markOlderHistoryRangeRetryable(rangeKey, TRANSIENT_HISTORY_RETRY_COOLDOWN_MS);
                    setHistoryBackfillMessage(null);
                    return;
                }

                setHistoryBackfillMessage(renderedBarCount === 0 ? 'Loading older MT5 candle history...' : null);
                const history = await ohlcService.getHistory(
                    symbol,
                    selectedResolution.minutes,
                    BACKFILL_CHART_HISTORY_LIMIT,
                    {
                        requestType: 'get_before',
                        beforeUnixMs,
                        cacheFirst: true,
                        cacheOnly: false,
                    },
                );

                if (!isCurrentChartSwitch()) {
                    return;
                }

                const olderBars = normalizeChartBars(
                    history.filter((bar) => {
                        const normalizedTime = normalizeTimestampMs(bar.time);
                        return normalizedTime !== null && normalizedTime < beforeUnixMs;
                    }),
                    bucketMs,
                    BACKFILL_CHART_HISTORY_LIMIT,
                ).filter(isRealMarketBar);
                const hasNewOlderBars = olderBars.some((bar) => bar.time < beforeUnixMs);
                const historyMetadata = ohlcService.getHistoryMetadata(
                    symbol,
                    selectedResolution.minutes,
                    normalizedAccountSessionScopeId,
                )
                    ?? latestHistoryMetadata;
                const pagination = getHistoryMetadataPagination(historyMetadata);
                const historyBackfillStillPending = historyMetadataIndicatesDeferredOrSparse(historyMetadata);
                const metadataIsRefreshResult =
                    pagination.event === 'ohlc_history_refreshed' &&
                    (!pagination.status || pagination.status.toLowerCase() === 'ready');
                const hasDefinitiveEmptyHistory = !hasNewOlderBars
                    && metadataMatchesBeforeRequest(historyMetadata, beforeUnixMs, bucketMs)
                    && pagination.cacheOnly !== true
                    && !historyBackfillStillPending
                    && (
                        pagination.hasMore === false ||
                        metadataIsRefreshResult ||
                        (pagination.returnedBarCount !== undefined && pagination.returnedBarCount < BACKFILL_CHART_HISTORY_LIMIT) ||
                        history.length === 0
                    );
                if (hasNewOlderBars || hasDefinitiveEmptyHistory) {
                    completedOlderHistoryRangeKeys.add(rangeKey);
                    olderHistoryRetryAfterByRangeKey.delete(rangeKey);
                } else {
                    markOlderHistoryRangeRetryable(rangeKey);
                }

                if (!hasNewOlderBars) {
                    setHistoryBackfillMessage(null);
                    return;
                }

                const renderLimit = getCurrentRenderLimit(olderBars.length);
                const renderResult = applyBars(
                    olderBars,
                    undefined,
                    true,
                    renderLimit,
                    true,
                    true,
                    true,
                    'preserve-or-follow-latest',
                );
                setHistoryBackfillMessage(null);
                notifyHistoryStatusChange({
                    isLoading: false,
                    hasCandles: renderResult.historySeedApplied && renderResult.renderedCandles,
                });
            } catch (error) {
                if (isCurrentChartSwitch()) {
                    setHistoryBackfillMessage(null);
                    if (!isRealtimeOhlcClientReady() || isTransientHistoryNotReadyError(error)) {
                        markOlderHistoryRangeRetryable(rangeKey, TRANSIENT_HISTORY_RETRY_COOLDOWN_MS);
                        return;
                    }

                    console.warn('Failed to load older OHLC history.', error);
                }
            } finally {
                if (olderHistoryInFlightKey === rangeKey) {
                    olderHistoryInFlightKey = null;
                }
            }
        };

        maybeRequestOlderHistory = (range: LogicalRangeSnapshot | null) => {
            if (
                !isCurrentChartSwitch() ||
                !isHistoryLoaded ||
                !range ||
                !isRealtimeOhlcClientReady() ||
                renderedBarCount <= 0 ||
                range.from > LEFT_EDGE_BACKFILL_THRESHOLD_BARS ||
                olderHistoryInFlightKey
            ) {
                return;
            }

            const earliestLoadedRealBarTimeMs = getEarliestLoadedRealBarTimeMs();
            if (earliestLoadedRealBarTimeMs === null) {
                return;
            }

            const beforeUnixMs = earliestLoadedRealBarTimeMs;
            if (beforeUnixMs <= 0) {
                return;
            }

            const rangeKey = [
                tradingSessionId ?? 'terminal',
                symbol,
                selectedResolution.minutes,
                BACKFILL_CHART_HISTORY_LIMIT,
                'before',
                beforeUnixMs,
            ].join(':');

            if (completedOlderHistoryRangeKeys.has(rangeKey)) {
                return;
            }

            if (isOlderHistoryRangeCoolingDown(rangeKey)) {
                return;
            }

            olderHistoryInFlightKey = rangeKey;
            void loadOlderHistory(rangeKey, beforeUnixMs);
        };

        async function loadHistory(
            isBackfillRetry = false,
            layoutModeOverride?: DataLayoutMode,
        ) {
            const loadSequence = historyLoadSequence + 1;
            historyLoadSequence = loadSequence;
            const historyLimit = isBackfillRetry
                ? getNextStagedLatestHistoryLimit()
                : INITIAL_CHART_HISTORY_LIMIT;
            if (historyLimit === null) {
                setHistoryBackfillMessage(null);
                return;
            }
            const getLoadHistoryRenderLimit = (extraBars = 0, initialLimit = INITIAL_CHART_RENDER_BARS) =>
                isBackfillRetry
                    ? getCurrentRenderLimit(extraBars)
                    : initialLimit;
            let emptyMessage = 'No candle data is available for this symbol/timeframe yet. Waiting for live MT5 bars.';
            if (isBackfillRetry) {
                setHistoryBackfillMessage(null);
            }

            let appliedHistory = false;
            let historyRequest: Promise<OHLCBar[]> | null = null;
            const applyHistoryResult = (history: OHLCBar[] | null | undefined) => {
                if (
                    appliedHistory ||
                    !isCurrentChartSwitch() ||
                    !history ||
                    history.length === 0
                ) {
                    return false;
                }

                const historyStats = summarizeHistoryBars(history, bucketMs);
                const latestRealLivePreviewBarTime = getRealBarTimeWindow(liveBarsByTime.values(), bucketMs).endTime;
                const shouldDeferHistoryForProvisionalLivePreview = hasProvisionalLivePreview
                    && shouldKeepProvisionalLivePreview(
                        historyStats.latestRealTime,
                        latestRealLivePreviewBarTime,
                        bucketMs,
                    );
                appliedHistory = true;
                clearHistoryReadinessRetryTimer();
                if (shouldDeferHistoryForProvisionalLivePreview) {
                    const acceptedHistoryBars = filterAcceptedOhlcBarsForChart(
                        history,
                        'history',
                        {
                            useChronologicalBatch: true,
                            seedStatefulReference: true,
                        },
                    );
                    rememberLoadedHistoryBars(acceptedHistoryBars, { skipSanity: true });
                    renderProvisionalLivePreview();
                    const retryScheduled = ensureHistoryCatchUpRetry(historyStats);
                    if (retryScheduled) {
                        notifyHistoryStatusChange({
                            isLoading: false,
                            hasCandles: true,
                        });
                        return true;
                    }
                    // Retries exhausted — fall through to apply history now so bars
                    // don't remain stuck in the loaded-history cache without rendering.
                }

                const isLateResult = loadSequence !== historyLoadSequence;
                const historyHasRealBars = historyStats.realBars > 0;
                const shouldResetFromProvisionalLivePreview = hasProvisionalLivePreview && historyHasRealBars;
                const renderResult = applyBars(
                    history,
                    emptyMessage,
                    false,
                    isLateResult
                        ? getCurrentRenderLimit(history.length)
                        : getLoadHistoryRenderLimit(history.length),
                    true,
                    true,
                    true,
                    layoutModeOverride ?? getHistoryLoadedLayoutMode(
                        isBackfillRetry,
                        isLateResult,
                        historyHasRealBars,
                        shouldResetFromProvisionalLivePreview,
                        renderedBarCount,
                    ),
                );
                const historySeedRendered = renderResult.historySeedApplied && renderResult.renderedCandles;
                if (shouldResetFromProvisionalLivePreview) {
                    hasProvisionalLivePreview = false;
                }
                if (isLateResult) {
                    if (historySeedRendered) {
                        notifyHistoryStatusChange({
                            isLoading: false,
                            hasCandles: true,
                        });
                    }
                    return true;
                }

                const retryScheduled = scheduleHistoryBackfillRetry(
                    renderResult.stats,
                    renderResult.historySeedApplied,
                );
                if (!retryScheduled) {
                    scheduleDeferredHistoryBackfill(history.length >= historyLimit);
                }
                if (!retryScheduled) {
                    notifyHistoryStatusChange({
                        isLoading: false,
                        hasCandles: historySeedRendered,
                    });
                } else if (historySeedRendered) {
                    notifyHistoryStatusChange({
                        isLoading: false,
                        hasCandles: true,
                    });
                } else {
                    notifyHistoryStatusChange({
                        isLoading: true,
                        hasCandles: false,
                    });
                }
                return true;
            };
            const renderCacheOnlyHistoryFallback = async (fallbackMessage: string) => {
                if (chartHasSetData && renderedBarCount > 0 && hasRenderedHistorySeed) {
                    return true;
                }

                try {
                    const cachedHistory = await ohlcService.getHistory(
                        symbol,
                        selectedResolution.minutes,
                        historyLimit,
                        {
                            cacheFirst: true,
                            cacheOnly: true,
                        },
                    );

                    if (!isCurrentChartSwitch() || !cachedHistory || cachedHistory.length === 0) {
                        return false;
                    }

                    applyHistoryResult(cachedHistory);
                    const renderedCachedHistory = chartHasSetData && renderedBarCount > 0 && hasRenderedHistorySeed;
                    if (renderedCachedHistory) {
                        setHistoryBackfillMessage(fallbackMessage);
                        setIsLoading(false);
                        setNoDataMessage(null);
                        notifyHistoryStatusChange({ isLoading: false, hasCandles: true });
                    }
                    return renderedCachedHistory;
                } catch {
                    return false;
                }
            };

            try {
                // Cached first-paint history should be
                // returned â€” including any bars the Rust gateway just persisted from
                // live closes into rust_db/cache while repair continues in the background.
                historyRequest = ohlcService.getHistory(
                    symbol,
                    selectedResolution.minutes,
                    historyLimit,
                    {
                        cacheFirst: true,
                        cacheOnly: false,
                    },
                );
                const history = await withTimeout(
                    historyRequest,
                    isBackfillRetry ? BACKFILL_CHART_HISTORY_TIMEOUT_MS : CHART_HISTORY_TIMEOUT_MS,
                    isBackfillRetry ? 'Backfill OHLC history timed out' : 'Initial OHLC history load timed out',
                );
                if (!isCurrentChartSwitch()) return;
                if (applyHistoryResult(history)) {
                    // After the first history paint, scan for internal gaps in the background.
                    // A 2s delay lets the chart finish rendering before gap fetches start.
                    if (!isBackfillRetry) {
                        setTimeout(() => {
                            if (isCurrentChartSwitch()) {
                                ohlcService.detectAndFillInternalGaps(symbol, selectedResolution.minutes);
                            }
                        }, 2_000);
                    }
                    return;
                }

                if (
                    await renderCacheOnlyHistoryFallback(
                        'Showing last available candle history. Live candles will resume when MT5 sends new bars.',
                    )
                ) {
                    return;
                }
            } catch (error) {
                if (!isCurrentChartSwitch()) {
                    return;
                }

                if (!isBackfillRetry && historyRequest) {
                    void historyRequest.then(applyHistoryResult).catch(() => {
                        // Keep waiting for history while live bars accumulate in the cache.
                    });
                }

                if (loadSequence !== historyLoadSequence) {
                    return;
                }

                if (!isRealtimeOhlcClientReady()) {
                    emptyMessage = 'MT5 candle history is connecting. Live bars are being cached and will merge into the chart as soon as MT5 history is ready.';
                    if (!isBackfillRetry) {
                        scheduleHistoryLoadWhenRealtimeReady();
                    }
                } else if (isLiveServerUnavailableError(error)) {
                    emptyMessage = 'No live MT5 quote server is available for candles right now. The chart will update when live OHLC/history returns.';
                }

                if (
                    await renderCacheOnlyHistoryFallback(
                        'Showing last available candle history. Live candles will resume when MT5 sends new bars.',
                    )
                ) {
                    return;
                }
            }

            if (isCurrentChartSwitch() && loadSequence === historyLoadSequence) {
                const renderedProvisionalLivePreview = renderProvisionalLivePreview(emptyMessage);
                const stats = summarizeHistoryBars([...liveBarsByTime.values()], bucketMs);
                const hasVisibleCandles = chartHasSetData && renderedBarCount > 0;
                const hasRenderedSeededCandles = hasRenderedHistorySeed && hasVisibleCandles;
                const retryScheduled = scheduleHistoryBackfillRetry(stats, hasRenderedHistorySeed);
                if (renderedProvisionalLivePreview || hasRenderedSeededCandles) {
                    setHistoryBackfillMessage(null);
                    setIsLoading(false);
                    setNoDataMessage(null);
                    notifyHistoryStatusChange({ isLoading: false, hasCandles: true });
                    return;
                }

                if (retryScheduled) {
                    if (hasVisibleCandles) {
                        setIsLoading(false);
                        setNoDataMessage(null);
                        setHistoryBackfillMessage('Loading MT5 candle history in the background...');
                        notifyHistoryStatusChange({ isLoading: false, hasCandles: true });
                        return;
                    }

                    // After enough fast retries with no visible bars, show a user message
                    // and shift to a slower cadence — but still fast enough to catch MT5
                    // completing its backfill within 2s of the manager lock releasing.
                    const earlyNoData = backgroundHistoryBackfillAttempts >= 15
                        && renderedBarCount === 0;
                    if (earlyNoData) {
                        setHistoryBackfillMessage(null);
                        setIsLoading(false);
                        noDataShown = true;
                        setNoDataMessage(
                            'Loading candle history from MT5. Bars will appear when ready.',
                        );
                        notifyHistoryStatusChange({ isLoading: false, hasCandles: false });
                        // Medium-speed retry (1.5s) — faster than the original 5s so we
                        // recover promptly when the MT5 manager lock releases.
                        if (backgroundHistoryBackfillAttempts < MAX_BACKGROUND_HISTORY_BACKFILL_ATTEMPTS) {
                            historyBackfillTimer = setTimeout(() => {
                                historyBackfillTimer = null;
                                if (!isCurrentChartSwitch()) return;
                                backgroundHistoryBackfillAttempts += 1;
                                void loadHistory(true);
                            }, 1500);
                        }
                        return;
                    }
                    setHistoryBackfillMessage('Loading MT5 candle history before drawing the chart...');
                    setNoDataMessage(null);
                    setIsLoading(true);
                    notifyHistoryStatusChange({ isLoading: true, hasCandles: false });
                    return;
                }

                if (!retryScheduled) {
                    setHistoryBackfillMessage('Loading MT5 candle history before drawing the chart...');
                }
                setIsLoading(false);
                noDataShown = true; setNoDataMessage(getPendingHistoryNoDataMessage(emptyMessage));
                if (!retryScheduled) {
                    notifyHistoryStatusChange({ isLoading: false, hasCandles: false });
                }
            }
        }

        const unsubscribeLivePriceSnapshot = subscribeToLivePriceBySymbol(
            symbol,
            applyLivePriceSnapshotToRenderedCandle,
        );
        applyLivePriceSnapshotToRenderedCandle();
        scheduleNextLiveCandleBoundaryRollover();
        const liveCandleRolloverTimer = window.setInterval(
            () => {
                runLiveCandleRollover();
            },
            LIVE_CANDLE_ROLLOVER_POLL_MS,
        );

        const unsubscribeBars = ohlcService.subscribe(symbol, selectedResolution.minutes, (_s, _tf, bar) => {
            if (!incomingMatchesCurrentChartSwitch(_s, _tf)) return;
            if (!hasValidBarPrices(bar)) return;

            const incomingIsRealMarketBar = isRealMarketBar(bar);
            if (!incomingIsRealMarketBar) {
                return;
            }

            let incomingBar = alignOpenLiveBarCloseToCurrentPriceLine(
                toBucketedBar(bar, bucketMs),
            );
            let previousLastBarTime = lastBarTimeRef.current;
            const currentFrontendBucketTime = getCurrentFrontendBucketTime();
            const shouldForceRolloverForStaleIncomingBar = Boolean(
                previousLastBarTime > 0 &&
                incomingBar.time <= previousLastBarTime &&
                currentFrontendBucketTime >= previousLastBarTime + bucketMs,
            );
            if (shouldForceRolloverForStaleIncomingBar) {
                const previousRenderedBar =
                    getLatestRenderedBarForLiveRollover() ??
                    currentBarRef.current;
                const rolloverPrice = getLiveRolloverPrice(incomingBar.close) ?? incomingBar.close;
                if (
                    previousRenderedBar &&
                    Number.isFinite(rolloverPrice) &&
                    rolloverPrice > 0
                ) {
                    const rolloverOpen = previousRenderedBar.close > 0
                        ? previousRenderedBar.close
                        : rolloverPrice;
                    incomingBar = {
                        ...incomingBar,
                        time: currentFrontendBucketTime,
                        open: rolloverOpen,
                        high: Math.max(rolloverOpen, rolloverPrice),
                        low: Math.min(rolloverOpen, rolloverPrice),
                        close: rolloverPrice,
                        volume: Math.max(1, incomingBar.volume || 0),
                        sourceTimeMs: Math.max(
                            getBarSourceTimeMs(incomingBar),
                            Date.now(),
                            currentFrontendBucketTime,
                        ),
                        basis: 'stale_tick_frontend_rollover',
                        closed: false,
                    };
                } else if (forceVisibleCandleRolloverToCurrentBucket()) {
                    previousLastBarTime = lastBarTimeRef.current;
                }
            }
            const alignedIncomingBar = alignLaggingOpenLiveTickToRenderedOpenBar(incomingBar, previousLastBarTime);
            if (!alignedIncomingBar) {
                return;
            }
            incomingBar = alignedIncomingBar;

            const isOlderThanRenderedLatest = previousLastBarTime > 0 && incomingBar.time < previousLastBarTime;

            if (isOlderThanRenderedLatest && shouldMergeOlderHistoryUpdate(incomingBar, previousLastBarTime)) {
                const acceptedHistoryUpdateBars = filterAcceptedOhlcBarsForChart(
                    [incomingBar],
                    'history_update',
                    { useChronologicalBatch: true },
                );
                const historyUpdateBar = acceptedHistoryUpdateBars[0];
                if (!historyUpdateBar) {
                    return;
                }

                const historyCacheChanged = rememberLoadedHistoryBars(
                    acceptedHistoryUpdateBars,
                    { skipSanity: true },
                );
                if (!isHistoryLoaded) {
                    scheduleHistoryLoadWhenRealtimeReady();
                    return;
                }

                const seriesTime = realTimeToSeriesTime.get(historyUpdateBar.time);
                const previousDisplayBar = seriesTime !== undefined
                    ? displayBarsBySeriesTime.get(seriesTime) ?? null
                    : null;
                const displayHistoryBar = preferRealBar(previousDisplayBar ?? undefined, historyUpdateBar, bucketMs);

                const shouldRebuildDisplayedHistoryBar = (
                    seriesTime !== undefined &&
                    previousDisplayBar &&
                    !hasSameOhlcvValues(previousDisplayBar, displayHistoryBar)
                );

                if (shouldRebuildDisplayedHistoryBar || historyCacheChanged) {
                    scheduleHistoricalCacheRender();
                }
                return;
            }

            // Completed candles (closed=true) are promoted to permanent loaded history
            // so they survive chart rebuilds and remain scrollable on the left side.
            if (bar.closed === true && isRealMarketBar(incomingBar)) {
                rememberLoadedHistoryBars([incomingBar]);
            }

            const liveBar = cacheLiveBar(incomingBar, {
                skipSanity: shouldForceRolloverForStaleIncomingBar,
            });
            if (!liveBar) {
                return;
            }

            // Detect a backend restart / extended disconnect: when the incoming bar
            // arrives more than RECONNECT_GAP_DETECTION_THRESHOLD_BUCKETS buckets after
            // the last rendered bar and history is already loaded, fetch fresh history
            // to fill in any candles the frontend missed while the socket was down.
            // Route through the capped scheduler so repeated held-back live bars
            // cannot create one uncapped history request per socket message.
            if (
                isHistoryLoaded &&
                previousLastBarTime > 0 &&
                incomingBar.time - previousLastBarTime >= RECONNECT_GAP_DETECTION_THRESHOLD_BUCKETS * bucketMs
            ) {
                scheduleLatestHistoryGapCatchUp();
            }

            if (!isHistoryLoaded) {
                // The live candle owns the chart tip. History loading and gap repair are
                // background work and must not hold an accepted MT5 tick off-screen.
                applyLiveBarToRenderedSeries(liveBar, previousLastBarTime);
                scheduleHistoryLoadWhenRealtimeReady();
                return;
            }

            if (!incomingIsRealMarketBar) {
                return;
            }

            if (liveBar.time < previousLastBarTime) {
                return;
            }

            applyLiveBarToRenderedSeries(liveBar, previousLastBarTime);
        }, { replay: 'latest' });

        // Live-first progressive switch: the current quote above owns the first render.
        // On the next frame, merge only the visible cached window behind it. The full
        // 200-bar history request below remains background work and is guarded by the
        // chart-switch sequence, so a late response cannot overwrite another symbol.
        if (
            !hasAtomicSwitchSeed &&
            cleanRenderableSyncSeedBars.length > 0 &&
            isCurrentChartSwitch()
        ) {
            const progressiveSeedBars = normalizeChartBars(
                cleanRenderableSyncSeedBars,
                bucketMs,
                LIVE_FIRST_SYMBOL_SWITCH_HISTORY_BARS,
            );
            progressiveHistorySeedFrame = window.requestAnimationFrame(() => {
                progressiveHistorySeedFrame = null;
                if (!isCurrentChartSwitch() || isHistoryLoaded) {
                    return;
                }

                applyBars(
                    progressiveSeedBars,
                    undefined,
                    false,
                    LIVE_FIRST_SYMBOL_SWITCH_HISTORY_BARS,
                    false,
                    false,
                    true,
                    'focus-latest',
                );
            });
        }

        void loadHistory();

        // If history is slow (network delay, cold MT5), only reveal cached candles
        // after a history/cache seed exists; live-only bars stay cached while priming.
            pendingProvisionalPreviewTimer = setTimeout(() => {
                pendingProvisionalPreviewTimer = null;
                if (isCurrentChartSwitch() && !isHistoryLoaded) {
                    renderProvisionalLivePreview(undefined, true);
                }
            }, PROVISIONAL_PREVIEW_DELAY_MS);

        return () => {
            disposed = true;
            clearLoadingTimer();
            unsubscribeLivePriceSnapshot();
            window.clearInterval(liveCandleRolloverTimer);
            if (liveCandleBoundaryTimer !== null) {
                window.clearTimeout(liveCandleBoundaryTimer);
                liveCandleBoundaryTimer = null;
            }
            unsubscribeBars();
            unsubscribeHistoryMetadata();
            if (resizeFrame !== null) {
                window.cancelAnimationFrame(resizeFrame);
            }
            if (dataLayoutFrame !== null) {
                window.cancelAnimationFrame(dataLayoutFrame);
            }
            if (progressiveHistorySeedFrame !== null) {
                window.cancelAnimationFrame(progressiveHistorySeedFrame);
                progressiveHistorySeedFrame = null;
            }
            if (historicalCacheRenderFrame !== null) {
                window.cancelAnimationFrame(historicalCacheRenderFrame);
                historicalCacheRenderFrame = null;
            }
            cancelPendingLiveSeriesUpdates();
            if (pendingProvisionalPreviewTimer !== null) {
                clearTimeout(pendingProvisionalPreviewTimer);
                pendingProvisionalPreviewTimer = null;
            }
            if (volumeRenderFrame !== null) {
                window.cancelAnimationFrame(volumeRenderFrame);
            }
            clearHistoryBackfillTimer();
            latestHistoryGapCatchUpInFlightGate.reset();
            clearHistoryReadinessRetryTimer();
            resizeObserver?.disconnect();
            if (autoScrollTimer) { clearTimeout(autoScrollTimer); autoScrollTimer = null; }
            clearTimeout(priceAxisAttachTimer);
            window.removeEventListener('wheel', onWheel, { capture: true } as any);
            if (priceAxisCleanup) { try { priceAxisCleanup(); } catch { /* noop */ } priceAxisCleanup = null; }
            try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(rangeHandler); } catch { /* noop */ }
            try { chart.unsubscribeCrosshairMove(crosshairHandler); } catch { /* noop */ }
            try {
                for (const line of priceLinesRef.current) {
                    try { mainSeries.removePriceLine(line); } catch { /* noop */ }
                }
            } finally {
                priceLinesRef.current = [];
            }
            try { positionDragCleanupRef.current?.(); } catch { /* noop */ }
            positionDragCleanupRef.current = null;
            clearPositionLineOverlays();
            try { window.removeEventListener('pointermove', onDragPointerMove); } catch { /* noop */ }
            try { window.removeEventListener('pointerup', onDragPointerUp); } catch { /* noop */ }
            try { endDrag(); } catch { /* noop */ }
            try { livePriceLineRef.current?.remove(); } catch { /* noop */ }
            try { livePriceBadgeRef.current?.remove(); } catch { /* noop */ }
            try { livePriceHitRef.current?.remove(); } catch { /* noop */ }
            livePriceLineRef.current = null;
            livePriceBadgeRef.current = null;
            livePriceHitRef.current = null;
            livePriceRef.current = null;
            updateLivePriceOverlayRef.current = null;
            volumeSeriesRefreshRef.current = null;
            try { seriesMarkersPluginRef.current?.detach(); } catch { /* noop */ }
            seriesMarkersPluginRef.current = null;
            syncMarkersRef.current = null;
            const shouldPreserveChartInstanceForSymbolSwitch =
                latestChartInstanceLifecycleKeyRef.current === chartInstanceLifecycleKey &&
                chartRef.current === chart;
            if (!shouldPreserveChartInstanceForSymbolSwitch) {
                mainSeriesRef.current = null;
                volumeSeriesRef.current = null;
                if (chartRef.current === chart) {
                    chartRef.current = null;
                    try { chart.remove(); } catch { host.innerHTML = ''; }
                }
            }
        };
    }, [
        activePriceScaleMargins,
        chartInstanceLifecycleKey,
        chartType,
        clearPositionLineOverlays,
        getPreferredBarSpacing,
        getPreferredRightOffset,
        markChartHasCandles,
        notifyHistoryStatusChange,
        normalizedAccountSessionScopeId,
        palette,
        pricePrecision,
        resolveLiveAxisPrice,
        selectedResolution,
        setActiveBarIfChanged,
        symbol,
        tradingSessionId,
        syncPositionLines,
        updatePositionLineOverlays,
        visualConfig,
        visualColors,
        refreshToken,
    ]);

    useEffect(() => {
        syncPositionLines();
        return () => { clearPositionLines(); };
    }, [clearPositionLines, syncPositionLines]);

    const change = activeBar
        ? {
            absolute: activeBar.close - activeBar.open,
            percent: activeBar.open === 0 ? 0 : ((activeBar.close - activeBar.open) / activeBar.open) * 100,
            color: activeBar.close > activeBar.open ? palette.up : activeBar.close < activeBar.open ? palette.down : palette.muted,
        }
        : null;
    const statusNotice = !activeBar ? historyBackfillMessage : null;

    return (
        <div
            className="flex h-full min-w-0 flex-col overflow-hidden"
            style={{ backgroundColor: palette.background }}
        >
            <div
                className="relative z-20 flex min-h-[48px] flex-nowrap items-center gap-3 overflow-hidden border-b px-4 py-2 transition-colors"
                style={{
                    borderBottomColor: palette.border,
                    backgroundColor: bgOpacity > 0 ? `rgba(100, 116, 139, ${bgOpacity / 100})` : 'transparent',
                }}
            >
                <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-center gap-3 overflow-x-auto whitespace-nowrap no-scrollbar">
                        <div className="flex items-center gap-2 text-[13px] font-bold tracking-wide" style={{ color: palette.foreground }}>
                            {showTitle ? (
                                <>
                                    <span>{symbol}</span>
                                    {symbolName ? <span className="opacity-60" style={{ color: palette.muted }}>{symbolName}</span> : null}
                                    <span className="opacity-60" style={{ color: palette.muted }}>- {selectedResolution.label}</span>
                                    <div className="ml-2 flex items-center gap-1.5 rounded-none bg-primary/10 px-2 py-0.5">
                                        <div className="h-1.5 w-1.5 animate-pulse rounded-none bg-primary" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Live</span>
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {activeBar && showChartValues ? (
                            <div className="ml-4 flex items-center gap-3 text-[12px] font-medium tabular-nums opacity-80" style={{ color: palette.muted }}>
                                <span>{formatBarTime(activeBar.time, selectedResolution.minutes)}</span>
                                <span>O {formatPrice(activeBar.open, pricePrecision)}</span>
                                <span>H {formatPrice(activeBar.high, pricePrecision)}</span>
                                <span>L {formatPrice(activeBar.low, pricePrecision)}</span>
                                <span style={{ color: palette.foreground }}>C {formatPrice(activeBar.close, pricePrecision)}</span>
                                {shouldShowVolumeSeries ? <span>V {activeBar.volume}</span> : null}
                                {change && showBarChangeValues ? (
                                    <span style={{ color: change.color }}>
                                        {change.absolute >= 0 ? '+' : ''}{formatPrice(change.absolute, pricePrecision)} ({change.percent >= 0 ? '+' : ''}{change.percent.toFixed(2)}%)
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                {headerActions ? (
                    <div className="no-scrollbar flex min-w-0 flex-shrink overflow-x-auto overflow-y-hidden whitespace-nowrap">
                        {headerActions}
                    </div>
                ) : null}
            </div>

            <div className="relative flex-1 min-h-0" ref={wrapperRef}>
                <div className="absolute inset-0" ref={chartHostRef} />

                {!isLoading && !noDataMessage && statusNotice ? (
                    <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex justify-start">
                        <div
                            className="max-w-full rounded-md border px-3 py-2 text-[12px] leading-relaxed shadow-lg whitespace-normal break-words [overflow-wrap:anywhere]"
                            style={{
                                borderColor: palette.border,
                                backgroundColor: palette.surfaceRaised,
                                color: palette.text,
                            }}
                        >
                            {statusNotice}
                        </div>
                    </div>
                ) : null}

                {/* Loading overlay — fade in/out smoothly so chart never hard-flashes */}
                <div
                    className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-200"
                    style={{
                        backgroundColor: 'transparent',
                        opacity: isLoading ? 1 : 0,
                        visibility: isLoading ? 'visible' : 'hidden',
                    }}
                >
                    <div
                        className="h-5 w-5 animate-spin rounded-full border-2"
                        style={{ borderColor: `${palette.muted}40`, borderTopColor: palette.muted }}
                    />
                </div>

                {!isLoading && noDataMessage ? (
                    <div className="pointer-events-none absolute inset-0 z-10 flex min-w-0 items-center justify-center px-3 sm:px-6">
                        <p
                            className="max-w-full text-center text-[12px] leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere] sm:max-w-[320px]"
                            style={{ color: palette.muted }}
                        >
                            {noDataMessage}
                        </p>
                    </div>
                ) : null}
            </div>

            <div
                className="flex min-h-[38px] items-center gap-3 border-t px-3"
                style={{ borderTopColor: palette.border, backgroundColor: palette.surfaceRaised }}
            >
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {RESOLUTIONS.map((resolution) => {
                        const active = resolution.minutes === selectedResolution.minutes;
                        return (
                            <button
                                key={resolution.label}
                                className="rounded-none px-2.5 py-1 text-[12px] font-medium transition-colors"
                                onClick={() => setSelectedResolution(resolution)}
                                style={{
                                    backgroundColor: active ? palette.border : 'transparent',
                                    color: active ? palette.foreground : palette.muted,
                                }}
                            >
                                {resolution.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default memo(KlineChartContainer);

