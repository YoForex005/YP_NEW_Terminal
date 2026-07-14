export type LiveCandleTimeframe = 'M1' | 'M5' | 'M15' | 'H1' | 'H4' | 'D1' | number;

export type LiveCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type LiveQuoteLike = {
  bid?: unknown;
  ask?: unknown;
  last?: unknown;
  price?: unknown;
  volume?: unknown;
  tick_volume?: unknown;
  tickVolume?: unknown;
  real_volume?: unknown;
  realVolume?: unknown;
  volume_real?: unknown;
  volumeReal?: unknown;
  mt5_time_msc?: unknown;
  mt5TimeMsc?: unknown;
  mt5_time?: unknown;
  mt5Time?: unknown;
  time_msc?: unknown;
  timeMsc?: unknown;
  timestamp_msc?: unknown;
  timestampMsc?: unknown;
  server_time_msc?: unknown;
  serverTimeMsc?: unknown;
  server_time?: unknown;
  serverTime?: unknown;
  server_received_msc?: unknown;
  serverReceivedMsc?: unknown;
  tick_time?: unknown;
  tickTime?: unknown;
  timeMs?: unknown;
  time_ms?: unknown;
  timestampMs?: unknown;
  timestamp_ms?: unknown;
  time?: unknown;
  timestamp?: unknown;
  receivedAtMs?: unknown;
};

export const TF_MINUTES: Record<Exclude<LiveCandleTimeframe, number>, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  H1: 60,
  H4: 240,
  D1: 1440,
};

const UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD = 10_000_000_000;

export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }

  const safeDecimals = Number.isFinite(decimals) ? Math.max(0, Math.trunc(decimals)) : 0;
  const factor = 10 ** safeDecimals;
  return Math.round(value * factor) / factor;
}

export function getTimeframeMinutes(timeframe: LiveCandleTimeframe): number {
  if (typeof timeframe === 'number' && Number.isFinite(timeframe) && timeframe > 0) {
    return Math.trunc(timeframe);
  }

  return TF_MINUTES[timeframe as Exclude<LiveCandleTimeframe, number>] ?? TF_MINUTES.M1;
}

export function getTimeframeMs(timeframe: LiveCandleTimeframe): number {
  return getTimeframeMinutes(timeframe) * 60 * 1000;
}

export function normalizeLiveTimestampMs(value: unknown, fallback = Date.now()): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) && timestamp > 0 ? Math.trunc(timestamp) : fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(
      value < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD ? value * 1000 : value,
    );
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.trunc(
        numeric < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD ? numeric * 1000 : numeric,
      );
    }

    const parsedDate = new Date(value).getTime();
    if (Number.isFinite(parsedDate) && parsedDate > 0) {
      return Math.trunc(parsedDate);
    }
  }

  return fallback;
}

function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

export function getLiveQuotePrice(quote: LiveQuoteLike): number | null {
  const bid = Number(quote.bid);
  const ask = Number(quote.ask);
  const midpoint =
    Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > 0
      ? (bid + ask) / 2
      : 0;
  const price = firstPositiveNumber(midpoint, quote.last, quote.price, quote.bid, quote.ask);
  return price > 0 ? price : null;
}

export function getLiveQuoteEventTime(quote: LiveQuoteLike, fallback = Date.now()): number {
  return normalizeLiveTimestampMs(
    quote.mt5_time_msc ??
      quote.mt5TimeMsc ??
      quote.mt5_time ??
      quote.mt5Time ??
      quote.time_msc ??
      quote.timeMsc ??
      quote.timestamp_msc ??
      quote.timestampMsc ??
      quote.server_time_msc ??
      quote.serverTimeMsc ??
      quote.server_time ??
      quote.serverTime ??
      quote.server_received_msc ??
      quote.serverReceivedMsc ??
      quote.tick_time ??
      quote.tickTime ??
      quote.timeMs ??
      quote.time_ms ??
      quote.timestampMs ??
      quote.timestamp_ms ??
      quote.time ??
      quote.timestamp ??
      quote.receivedAtMs,
    fallback,
  );
}

export function getLiveQuoteVolumeIncrement(quote: LiveQuoteLike): number {
  const volume = firstPositiveNumber(
    quote.volume,
    quote.tick_volume,
    quote.tickVolume,
    quote.real_volume,
    quote.realVolume,
    quote.volume_real,
    quote.volumeReal,
  );

  return volume > 0 ? Math.round(volume) : 1;
}

export function applyPriceToCandleSeries<TCandle extends LiveCandle>(
  current: TCandle[],
  price: number,
  decimals: number,
  timeframe: LiveCandleTimeframe,
  eventTime = Date.now(),
  quoteVolume = 0,
  limit = 120,
): TCandle[] {
  if (!Number.isFinite(price) || price <= 0) return current;
  if (current.length === 0) return current;

  const roundedPrice = roundTo(price, decimals);
  const timeframeMs = getTimeframeMs(timeframe);
  const bucketTime = Math.floor(eventTime / timeframeMs) * timeframeMs;
  const last = current[current.length - 1];
  const volumeIncrement = Number.isFinite(quoteVolume) && quoteVolume > 0
    ? Math.round(quoteVolume)
    : 1;

  if (bucketTime > last.time) {
    const newCandle = {
      ...last,
      time: bucketTime,
      open: last.close,
      high: Math.max(last.close, roundedPrice),
      low: Math.min(last.close, roundedPrice),
      close: roundedPrice,
      volume: volumeIncrement,
    };

    return [...current.slice(-Math.max(0, limit - 1)), newCandle as TCandle];
  }

  const next = [...current];
  const target = next[next.length - 1];

  next[next.length - 1] = {
    ...target,
    close: roundedPrice,
    high: Math.max(target.high, roundedPrice),
    low: Math.min(target.low, roundedPrice),
    volume: (target.volume ?? 0) + volumeIncrement,
  };

  return next;
}
