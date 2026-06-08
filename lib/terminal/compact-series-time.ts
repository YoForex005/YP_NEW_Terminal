import type { UTCTimestamp } from 'lightweight-charts';

import type { OHLCBar } from './ohlcWebSocketService';

export type CompactSeriesEntry = {
    bar: OHLCBar;
    seriesTime: UTCTimestamp;
    logicalIndex: number;
};

export type CompactSeriesBuildOptions = {
    previousRealTimeToSeriesTime?: ReadonlyMap<number, UTCTimestamp>;
};

export const COMPACT_SERIES_EPOCH_MS = Date.UTC(2000, 0, 1);
export const COMPACT_SERIES_SLOT_SECONDS = 1;

export function getCompactSeriesTime(anchorTimeMs: number, bucketMs: number, index: number): UTCTimestamp {
    void bucketMs;
    const stepSeconds = COMPACT_SERIES_SLOT_SECONDS;
    // Guard against invalid anchor: if anchorTimeMs is 0 or negative, fall back to a safe
    // epoch offset so lightweight-charts never receives a zero or duplicate timestamp.
    const safeAnchorMs = anchorTimeMs > 0 ? anchorTimeMs : COMPACT_SERIES_EPOCH_MS;
    return (Math.floor(safeAnchorMs / 1000) + index * stepSeconds) as UTCTimestamp;
}

export function buildCompactSeriesEntries(
    bars: OHLCBar[],
    bucketMs: number,
    anchorTimeMs = COMPACT_SERIES_EPOCH_MS,
    options: CompactSeriesBuildOptions = {},
): CompactSeriesEntry[] {
    const previousSeriesTimes = options.previousRealTimeToSeriesTime;
    const stableSeriesTimes = previousSeriesTimes?.size
        ? buildStableSeriesTimes(bars, previousSeriesTimes)
        : null;
    const mapped = bars.map((bar, index) => ({
        bar,
        seriesTime: stableSeriesTimes?.[index] ?? getCompactSeriesTime(anchorTimeMs, bucketMs, index),
        logicalIndex: index,
    }));

    // Deduplicate: lightweight-charts requires strictly ascending series times.
    // If two bars map to the same seriesTime, the later entry wins.
    const seenSeriesTimes = new Set<number>();
    const entries: CompactSeriesEntry[] = [];

    for (const entry of mapped) {
        const key = Number(entry.seriesTime);
        if (seenSeriesTimes.has(key)) {
            const existingIndex = entries.findIndex((e) => Number(e.seriesTime) === key);
            if (existingIndex >= 0) {
                entries[existingIndex] = entry;
            }
        } else {
            seenSeriesTimes.add(key);
            entries.push(entry);
        }
    }

    return entries;
}

function buildStableSeriesTimes(
    bars: OHLCBar[],
    previousSeriesTimes: ReadonlyMap<number, UTCTimestamp>,
): UTCTimestamp[] | null {
    const slot = COMPACT_SERIES_SLOT_SECONDS;
    const result = new Array<UTCTimestamp | null>(bars.length).fill(null);
    const knownIndexes: number[] = [];
    const usedSeriesTimes = new Set<number>();

    bars.forEach((bar, index) => {
        const previousSeriesTime = previousSeriesTimes.get(bar.time);
        const numericSeriesTime = Number(previousSeriesTime);
        if (
            previousSeriesTime === undefined ||
            !Number.isFinite(numericSeriesTime) ||
            usedSeriesTimes.has(numericSeriesTime)
        ) {
            return;
        }

        result[index] = previousSeriesTime;
        knownIndexes.push(index);
        usedSeriesTimes.add(numericSeriesTime);
    });

    if (knownIndexes.length === 0) {
        return null;
    }

    knownIndexes.sort((left, right) => left - right);

    for (let index = 1; index < knownIndexes.length; index += 1) {
        const previousKnown = result[knownIndexes[index - 1]];
        const nextKnown = result[knownIndexes[index]];
        if (
            previousKnown === null ||
            nextKnown === null ||
            Number(nextKnown) <= Number(previousKnown)
        ) {
            return null;
        }
    }

    const assignSegment = (fromIndex: number, toIndex: number, startSeriesTime: number) => {
        for (let index = fromIndex; index <= toIndex; index += 1) {
            result[index] = (startSeriesTime + (index - fromIndex) * slot) as UTCTimestamp;
        }
    };

    const firstKnownIndex = knownIndexes[0];
    if (firstKnownIndex > 0) {
        const firstKnownSeriesTime = Number(result[firstKnownIndex]);
        assignSegment(0, firstKnownIndex - 1, firstKnownSeriesTime - firstKnownIndex * slot);
    }

    for (let knownCursor = 0; knownCursor < knownIndexes.length - 1; knownCursor += 1) {
        const leftIndex = knownIndexes[knownCursor];
        const rightIndex = knownIndexes[knownCursor + 1];
        const gapCount = rightIndex - leftIndex - 1;
        const leftSeriesTime = Number(result[leftIndex]);
        const rightSeriesTime = Number(result[rightIndex]);

        if (gapCount > 0) {
            assignSegment(leftIndex + 1, rightIndex - 1, leftSeriesTime + slot);
        }
    }

    const lastKnownIndex = knownIndexes[knownIndexes.length - 1];
    if (lastKnownIndex < bars.length - 1) {
        const lastKnownSeriesTime = Number(result[lastKnownIndex]);
        assignSegment(lastKnownIndex + 1, bars.length - 1, lastKnownSeriesTime + slot);
    }

    const resolved = result as UTCTimestamp[];
    for (let index = 1; index < resolved.length; index += 1) {
        if (Number(resolved[index]) <= Number(resolved[index - 1])) {
            return null;
        }
    }

    return resolved;
}
