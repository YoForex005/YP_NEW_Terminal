import type { OHLCBar } from './ohlcWebSocketService';
import type { OhlcHistoryResponseMetadata } from '@/lib/trading/websocket-client';
import { isRealMarketBar } from './visual-candle-data';

const DEFAULT_LIVE_HISTORY_CONTINUITY_TOLERANCE_BUCKETS = 1;
const DEFAULT_LIVE_HISTORY_PRICE_CONTINUITY_RATIO = 0.2;
const DEFAULT_LATEST_WINDOW_GAP_BUCKETS = 3;
const DEFAULT_LATEST_WINDOW_PRICE_DEVIATION_RATIO = 0.006;
const DEFAULT_LATEST_WINDOW_STRONG_GAP_BUCKETS = 30;

type HistoryBaselineMetadata = Partial<OhlcHistoryResponseMetadata> & {
  metadata?: Partial<NonNullable<OhlcHistoryResponseMetadata['metadata']>>;
};

export type LatestHistoryBaselineDecision = {
  ready: boolean;
  reason:
    | 'ready'
    | 'empty_history'
    | 'unclean_history_metadata'
    | 'history_live_time_gap'
    | 'history_live_price_gap';
  latestHistoryTime: number | null;
  earliestLiveTime: number | null;
};

export type LatestHistoryBaselineOptions = {
  liveHistoryToleranceBuckets?: number;
  maxLivePriceDeviationRatio?: number;
};

export type LatestCoherentMarketWindowOptions = {
  maxGapBuckets?: number;
  maxPriceDeviationRatio?: number;
  strongGapBuckets?: number;
  maxBars?: number;
};

export type LatestCoherentMarketWindowResult = {
  bars: OHLCBar[];
  trimmedDisconnectedPrefix: boolean;
  disconnectTimeGapBuckets: number | null;
  disconnectPriceDeviationRatio: number | null;
};

function getNormalizedSource(bar: OHLCBar): string {
  return typeof bar.source === 'string' ? bar.source.trim().toLowerCase() : '';
}

function isHistoricalOhlcSource(source: string): boolean {
  return /chart|history|ohlc|cache|server|manager|database|rust_db|backend|upstream|\bdb\b/.test(source);
}

export function isLiveTickBar(bar: OHLCBar): boolean {
  const source = getNormalizedSource(bar);
  if (!source || source === 'client_quote_seed' || isHistoricalOhlcSource(source)) {
    return false;
  }

  return source === 'rust_realtime' || /tick|quote/.test(source);
}

export function isOpenLiveTickBar(bar: OHLCBar): boolean {
  return bar.closed !== true && isLiveTickBar(bar);
}

export function isProvisionalPriceSeedBar(bar: OHLCBar): boolean {
  const source = getNormalizedSource(bar);
  return source === 'live_price_seed';
}

export function isLikelyHistoricalOhlcBar(bar: OHLCBar): boolean {
  if (isLiveTickBar(bar) || isProvisionalPriceSeedBar(bar)) {
    return false;
  }

  const source = getNormalizedSource(bar);
  return bar.cached === true || isHistoricalOhlcSource(source);
}

export function isLatestHistoryCatchUpReferenceBar(bar: OHLCBar): boolean {
  if (!isRealMarketBar(bar) || isLiveTickBar(bar) || isProvisionalPriceSeedBar(bar)) {
    return false;
  }

  const source = typeof bar.source === 'string' ? bar.source.trim().toLowerCase() : '';
  return source === '' || isLikelyHistoricalOhlcBar(bar);
}

export function isRenderableCachedOrHistoricalBar(bar: OHLCBar): boolean {
  if (!isRealMarketBar(bar) || isLiveTickBar(bar) || isProvisionalPriceSeedBar(bar)) {
    return false;
  }

  if (bar.cached === true) {
    return true;
  }

  return !isLiveTickBar(bar) && isLikelyHistoricalOhlcBar(bar);
}

function getMaxReferencePriceDeviationRatio(referenceClose: number, bar: OHLCBar): number {
  if (!Number.isFinite(referenceClose) || referenceClose <= 0) {
    return 0;
  }

  return Math.max(
    ...[bar.open, bar.high, bar.low, bar.close]
      .filter((price) => Number.isFinite(price) && price > 0)
      .map((price) => Math.abs(price - referenceClose) / referenceClose),
    0,
  );
}

function hasRenderSourceDiscontinuity(previousBar: OHLCBar, currentBar: OHLCBar): boolean {
  const previousIsLive = isLiveTickBar(previousBar);
  const currentIsLive = isLiveTickBar(currentBar);
  const previousSource = getNormalizedSource(previousBar);
  const currentSource = getNormalizedSource(currentBar);
  const previousIsHistory =
    isLikelyHistoricalOhlcBar(previousBar) ||
    (!previousIsLive && !isProvisionalPriceSeedBar(previousBar) && previousSource === '');
  const currentIsHistory =
    isLikelyHistoricalOhlcBar(currentBar) ||
    (!currentIsLive && !isProvisionalPriceSeedBar(currentBar) && currentSource === '');

  return previousIsLive !== currentIsLive || previousIsHistory !== currentIsHistory;
}

function getLatestWindowDisconnect(
  previousBar: OHLCBar,
  currentBar: OHLCBar,
  bucketMs: number,
  options: Required<Pick<
    LatestCoherentMarketWindowOptions,
    'maxGapBuckets' | 'maxPriceDeviationRatio' | 'strongGapBuckets'
  >>,
): { gapBuckets: number; priceDeviationRatio: number } | null {
  if (bucketMs <= 0 || currentBar.time <= previousBar.time) {
    return null;
  }

  const gapBuckets = Math.max(1, Math.floor((currentBar.time - previousBar.time) / bucketMs));
  if (gapBuckets < options.maxGapBuckets) {
    return null;
  }

  const priceDeviationRatio = getMaxReferencePriceDeviationRatio(previousBar.close, currentBar);
  if (priceDeviationRatio <= options.maxPriceDeviationRatio) {
    return null;
  }

  if (!hasRenderSourceDiscontinuity(previousBar, currentBar)) {
    return null;
  }

  return { gapBuckets, priceDeviationRatio };
}

export function getLatestCoherentMarketWindow(
  bars: Iterable<OHLCBar>,
  bucketMs: number,
  options: LatestCoherentMarketWindowOptions = {},
): LatestCoherentMarketWindowResult {
  const maxBars = Math.max(1, Math.trunc(options.maxBars ?? Number.MAX_SAFE_INTEGER));
  const normalizedBars = toSortedUniqueBucketBars(bars, bucketMs)
    .filter(isRealMarketBar);
  const resultBase = {
    disconnectTimeGapBuckets: null,
    disconnectPriceDeviationRatio: null,
  };

  if (normalizedBars.length <= 1) {
    return {
      ...resultBase,
      bars: normalizedBars.slice(-maxBars).map((bar) => ({ ...bar })),
      trimmedDisconnectedPrefix: false,
    };
  }

  const disconnectOptions = {
    maxGapBuckets: Math.max(1, Math.trunc(options.maxGapBuckets ?? DEFAULT_LATEST_WINDOW_GAP_BUCKETS)),
    maxPriceDeviationRatio: Math.max(0, options.maxPriceDeviationRatio ?? DEFAULT_LATEST_WINDOW_PRICE_DEVIATION_RATIO),
    strongGapBuckets: Math.max(
      1,
      Math.trunc(options.strongGapBuckets ?? DEFAULT_LATEST_WINDOW_STRONG_GAP_BUCKETS),
    ),
  };

  for (let index = normalizedBars.length - 1; index > 0; index -= 1) {
    const disconnect = getLatestWindowDisconnect(
      normalizedBars[index - 1],
      normalizedBars[index],
      bucketMs,
      disconnectOptions,
    );
    if (!disconnect) {
      continue;
    }

    return {
      bars: normalizedBars.slice(index).slice(-maxBars).map((bar) => ({ ...bar })),
      trimmedDisconnectedPrefix: true,
      disconnectTimeGapBuckets: disconnect.gapBuckets,
      disconnectPriceDeviationRatio: disconnect.priceDeviationRatio,
    };
  }

  return {
    ...resultBase,
    bars: normalizedBars.slice(-maxBars).map((bar) => ({ ...bar })),
    trimmedDisconnectedPrefix: false,
  };
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

function hasValidOhlcPrices(bar: OHLCBar): boolean {
  return [bar.open, bar.high, bar.low, bar.close]
    .every((price) => Number.isFinite(price) && price > 0);
}

function toSortedUniqueBucketBars(bars: Iterable<OHLCBar>, bucketMs: number): OHLCBar[] {
  const byTime = new Map<number, OHLCBar>();

  for (const rawBar of bars) {
    const normalizedTime = normalizeTimestampMs(rawBar.time);
    if (normalizedTime === null || !hasValidOhlcPrices(rawBar)) {
      continue;
    }

    const time = bucketMs > 0
      ? Math.floor(normalizedTime / bucketMs) * bucketMs
      : normalizedTime;
    const existing = byTime.get(time);
    if (!existing || normalizeTimestampMs(rawBar.sourceTimeMs ?? rawBar.time)! >= normalizeTimestampMs(existing.sourceTimeMs ?? existing.time)!) {
      byTime.set(time, { ...rawBar, time });
    }
  }

  return [...byTime.values()].sort((left, right) => left.time - right.time);
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

function metadataFlag(metadata: HistoryBaselineMetadata | undefined, key: string): boolean {
  if (!metadata) {
    return false;
  }

  const root = metadata as Record<string, unknown>;
  const nested = metadata.metadata as Record<string, unknown> | undefined;
  return root[key] === true || nested?.[key] === true;
}

export function historyMetadataMarksUncleanBaseline(
  metadata: HistoryBaselineMetadata | undefined,
): boolean {
  if (!metadata) {
    return false;
  }

  if (
    metadataFlag(metadata, 'historyGapped') ||
    metadataFlag(metadata, 'historySparse') ||
    metadataFlag(metadata, 'historyStale') ||
    metadataFlag(metadata, 'managerFetchDeferred') ||
    metadataFlag(metadata, 'managerFetchPending') ||
    metadata.shouldReload === true
  ) {
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

  return /cache[_ ]?issue|gapped|gap[_ -]?detected|sparse|stale|defer|pending|queued|loading|not[_ ]ready|should[_ ]?reload/i
    .test(searchableMetadata);
}

export function isLiveBarTemporalContinuation(
  latestHistoryTime: number | null | undefined,
  liveTime: number | null | undefined,
  bucketMs: number,
  toleranceBuckets = DEFAULT_LIVE_HISTORY_CONTINUITY_TOLERANCE_BUCKETS,
): boolean {
  if (
    latestHistoryTime === null ||
    latestHistoryTime === undefined ||
    liveTime === null ||
    liveTime === undefined ||
    bucketMs <= 0
  ) {
    return false;
  }

  if (liveTime <= latestHistoryTime) {
    return true;
  }

  return liveTime - latestHistoryTime <= Math.max(1, toleranceBuckets) * bucketMs;
}

export function isLiveBarPriceContinuousWithHistory(
  latestHistoryClose: number | null | undefined,
  liveBar: OHLCBar,
  maxDeviationRatio = DEFAULT_LIVE_HISTORY_PRICE_CONTINUITY_RATIO,
): boolean {
  if (!Number.isFinite(latestHistoryClose) || Number(latestHistoryClose) <= 0) {
    return false;
  }

  const referenceClose = Number(latestHistoryClose);
  const prices = [liveBar.open, liveBar.high, liveBar.low, liveBar.close];
  if (!prices.every((price) => Number.isFinite(price) && price > 0)) {
    return false;
  }

  const maxDeviation = Math.max(
    ...prices.map((price) => Math.abs(price - referenceClose) / referenceClose),
  );

  return maxDeviation <= maxDeviationRatio;
}

export function isLiveBarSafeForLatestHistory(
  liveBar: OHLCBar,
  latestHistoryBar: OHLCBar | null | undefined,
  bucketMs: number,
  options: LatestHistoryBaselineOptions = {},
): boolean {
  if (!latestHistoryBar) {
    return false;
  }

  const toleranceBuckets = options.liveHistoryToleranceBuckets
    ?? DEFAULT_LIVE_HISTORY_CONTINUITY_TOLERANCE_BUCKETS;
  const maxDeviationRatio = options.maxLivePriceDeviationRatio
    ?? DEFAULT_LIVE_HISTORY_PRICE_CONTINUITY_RATIO;

  return isLiveBarTemporalContinuation(
    latestHistoryBar.time,
    liveBar.time,
    bucketMs,
    toleranceBuckets,
  ) && isLiveBarPriceContinuousWithHistory(
    latestHistoryBar.close,
    liveBar,
    maxDeviationRatio,
  );
}

export function getLatestCleanHistoryBaselineDecision(
  historyBars: Iterable<OHLCBar>,
  liveBars: Iterable<OHLCBar>,
  bucketMs: number,
  metadata?: HistoryBaselineMetadata,
  options: LatestHistoryBaselineOptions = {},
): LatestHistoryBaselineDecision {
  const historyReferenceBars = toSortedUniqueBucketBars(historyBars, bucketMs)
    .filter(isLatestHistoryCatchUpReferenceBar);
  const latestHistoryBar = historyReferenceBars[historyReferenceBars.length - 1] ?? null;
  const liveReferenceBars = toSortedUniqueBucketBars(liveBars, bucketMs)
    .filter(isRealMarketBar);
  const earliestLiveBar = liveReferenceBars[0] ?? null;

  const baseDecision = {
    latestHistoryTime: latestHistoryBar?.time ?? null,
    earliestLiveTime: earliestLiveBar?.time ?? null,
  };

  if (!latestHistoryBar) {
    return { ...baseDecision, ready: false, reason: 'empty_history' };
  }

  if (historyMetadataMarksUncleanBaseline(metadata)) {
    return { ...baseDecision, ready: false, reason: 'unclean_history_metadata' };
  }

  if (!earliestLiveBar) {
    return { ...baseDecision, ready: true, reason: 'ready' };
  }

  if (
    !isLiveBarTemporalContinuation(
      latestHistoryBar.time,
      earliestLiveBar.time,
      bucketMs,
      options.liveHistoryToleranceBuckets,
    )
  ) {
    return { ...baseDecision, ready: false, reason: 'history_live_time_gap' };
  }

  if (
    !isLiveBarPriceContinuousWithHistory(
      latestHistoryBar.close,
      earliestLiveBar,
      options.maxLivePriceDeviationRatio,
    )
  ) {
    return { ...baseDecision, ready: false, reason: 'history_live_price_gap' };
  }

  return { ...baseDecision, ready: true, reason: 'ready' };
}

export function createLatestHistoryGapCatchUpInFlightGate() {
  let inFlight = false;
  let pendingAfterInFlight = false;

  return {
    get inFlight() {
      return inFlight;
    },
    get pendingAfterInFlight() {
      return pendingAfterInFlight;
    },
    begin() {
      inFlight = true;
    },
    markPending() {
      pendingAfterInFlight = true;
      return true;
    },
    clearPending() {
      pendingAfterInFlight = false;
    },
    finish(disposed: boolean, scheduleCatchUp: () => boolean) {
      inFlight = false;
      const shouldDrainPending = pendingAfterInFlight;
      pendingAfterInFlight = false;

      if (!shouldDrainPending || disposed) {
        return false;
      }

      return scheduleCatchUp();
    },
    reset() {
      inFlight = false;
      pendingAfterInFlight = false;
    },
  };
}
