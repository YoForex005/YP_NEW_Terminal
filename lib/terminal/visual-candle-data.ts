import type { BarData, CandlestickData, UTCTimestamp } from 'lightweight-charts';

import type { OHLCBar } from './ohlcWebSocketService';

export type VisualCandleData = CandlestickData<UTCTimestamp> & BarData<UTCTimestamp>;

export function toUnixSeconds(timeValue: unknown): UTCTimestamp {
    const normalizedMs = normalizeTimestampMs(timeValue);
    const ms = normalizedMs ?? Date.now();

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

function isContinuityBarLike(bar: OHLCBar): boolean {
    const source = typeof bar.source === 'string' ? bar.source.trim().toLowerCase() : undefined;
    const basis = typeof bar.basis === 'string' ? bar.basis.trim().toLowerCase() : undefined;
    const isLiveGeneratedSource = source === 'rust_realtime' || source === 'mt5_tick' || source === 'mt5_live_tick';
    const isHistoricalOhlcSource = Boolean(source && /chart|history|ohlc|cache|server|manager/.test(source));

    return bar.isContinuity === true
        || bar.continuity === true
        || Boolean(source && /continuity/.test(source))
        || basis === 'prior_real_close'
        || (
            bar.derived === true
            && bar.cached !== true
            && !isLiveGeneratedSource
            && !isHistoricalOhlcSource
        );
}

export function isRealMarketBar(bar: OHLCBar): boolean {
    const source = typeof bar.source === 'string' ? bar.source.trim().toLowerCase() : undefined;

    if (source === 'live_price_seed') {
        return false;
    }

    if (isContinuityBarLike(bar)) {
        return false;
    }

    if (source && /synthetic|simulation|dummy|local_sim|client_quote_seed/.test(source)) {
        return false;
    }

    // Filter out completely flat bars with 0 volume.
    // These act as continuity/gap-filler bars but might not be explicitly flagged
    // by the backend. Filtering them prevents huge empty horizontal gaps on the chart.
    if (bar.open === bar.close && bar.high === bar.low && bar.open === bar.high && bar.volume <= 0) {
        return false;
    }

    if (!source || source === 'mt5_chart' || source === 'mt5_tick') {
        return true;
    }

    return !source.includes('continuity');
}

export function toCandleData(
    bar: OHLCBar,
    seriesTime: UTCTimestamp = toUnixSeconds(bar.time),
): VisualCandleData {
    return {
        time: seriesTime,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
    };
}

export function getVisualCandleEpsilon(bar: OHLCBar, precision: number): number {
    const digits = Math.max(precision, 0);
    const tickSize = 1 / Math.pow(10, digits);
    const anchorPrice = Math.max(Math.abs(bar.open), Math.abs(bar.high), Math.abs(bar.low), Math.abs(bar.close), 1);

    return Math.max(tickSize, anchorPrice * 0.00000005);
}

export function toVisualCandleData(
    bar: OHLCBar,
    precision: number,
    seriesTime: UTCTimestamp = toUnixSeconds(bar.time),
    previousClose: number = 1,
): VisualCandleData {
    const candle = toCandleData(bar, seriesTime);

    // Defensive: if lightweight-charts receives NaN it throws. Guard every price.
    const safeOpen = Number.isFinite(candle.open) && candle.open > 0 ? candle.open : previousClose;
    const safeClose = Number.isFinite(candle.close) && candle.close > 0 ? candle.close : safeOpen;
    const rawHigh = Number.isFinite(candle.high) && candle.high > 0 ? candle.high : Math.max(safeOpen, safeClose);
    const rawLow = Number.isFinite(candle.low) && candle.low > 0 ? candle.low : Math.min(safeOpen, safeClose);
    const safeHigh = Math.max(rawHigh, safeOpen, safeClose);
    const safeLow = Math.min(rawLow, safeOpen, safeClose);
    const safeCandle = { ...candle, open: safeOpen, high: safeHigh, low: safeLow, close: safeClose };
    const isContinuity = isContinuityBarLike(bar);
    const muteColor = 'rgba(42,46,57,0.45)';
    const muteBorderColor = 'rgba(42,46,57,0.65)';

    // Check if the candle needs visual body/wick inflation to avoid rendering as a thin line.
    // This applies to ALL bars (real market bars included) — the first tick of a new live candle
    // often has open===high===low===close, which lightweight-charts renders as an invisible line.
    const epsilon = getVisualCandleEpsilon(bar, precision);
    const bodySize = Math.abs(safeCandle.close - safeCandle.open);
    const rangeSize = Math.abs(safeCandle.high - safeCandle.low);

    // Real market bars with sufficient body/range don't need any visual adjustment.
    if (isRealMarketBar(bar)) {
        if (bodySize > epsilon && rangeSize > epsilon * 2) {
            return safeCandle;
        }

        // Real market bar with near-zero body/range (e.g. first tick of a new candle):
        // apply epsilon inflation so it renders as a visible candle, not a line.
        const isDownBar = safeCandle.close < safeCandle.open;
        const bodyMidpoint = (safeCandle.open + safeCandle.close) / 2 || safeCandle.close;
        const bodyHalf = epsilon;
        const wickHalf = epsilon * 2;
        const visualOpen = bodySize <= epsilon
            ? bodyMidpoint + (isDownBar ? bodyHalf : -bodyHalf)
            : safeCandle.open;
        const visualClose = bodySize <= epsilon
            ? bodyMidpoint + (isDownBar ? -bodyHalf : bodyHalf)
            : safeCandle.close;
        const wickMidpoint = (Math.max(safeCandle.high, visualOpen, visualClose) + Math.min(safeCandle.low, visualOpen, visualClose)) / 2;

        return {
            ...safeCandle,
            open: visualOpen,
            high: rangeSize <= epsilon * 2
                ? Math.max(safeCandle.high, visualOpen, visualClose, wickMidpoint + wickHalf)
                : Math.max(safeCandle.high, visualOpen, visualClose),
            low: rangeSize <= epsilon * 2
                ? Math.min(safeCandle.low, visualOpen, visualClose, wickMidpoint - wickHalf)
                : Math.min(safeCandle.low, visualOpen, visualClose),
            close: visualClose,
        };
    }

    const maybeMutedCandle = {
        ...safeCandle,
        ...(isContinuity && {
            color: muteColor,
            borderColor: muteBorderColor,
            wickColor: muteBorderColor,
        }),
    };

    if (bodySize > epsilon && rangeSize > epsilon * 2) {
        return maybeMutedCandle;
    }

    const isDownBar = safeCandle.close < safeCandle.open;
    const bodyMidpoint = (safeCandle.open + safeCandle.close) / 2 || safeCandle.close;
    const bodyHalf = epsilon;
    const wickHalf = epsilon * 2;
    const visualOpen = bodySize <= epsilon
        ? bodyMidpoint + (isDownBar ? bodyHalf : -bodyHalf)
        : safeCandle.open;
    const visualClose = bodySize <= epsilon
        ? bodyMidpoint + (isDownBar ? -bodyHalf : bodyHalf)
        : safeCandle.close;
    const wickMidpoint = (Math.max(safeCandle.high, visualOpen, visualClose) + Math.min(safeCandle.low, visualOpen, visualClose)) / 2;

    return {
        ...maybeMutedCandle,
        open: visualOpen,
        high: rangeSize <= epsilon * 2
            ? Math.max(safeCandle.high, visualOpen, visualClose, wickMidpoint + wickHalf)
            : Math.max(safeCandle.high, visualOpen, visualClose),
        low: rangeSize <= epsilon * 2
            ? Math.min(safeCandle.low, visualOpen, visualClose, wickMidpoint - wickHalf)
            : Math.min(safeCandle.low, visualOpen, visualClose),
        close: visualClose,
    };
}
