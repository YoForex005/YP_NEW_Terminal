import {
  getLivePriceSnapshotBySymbol,
  subscribeToLivePriceBySymbol,
  useWebtraderStore,
} from '@/store/webtrader-store';
import {
  DEFAULT_OHLC_HISTORY_LIMIT,
  getOhlcHistoryMetadata,
  OhlcHistoryResponseMetadata,
  WebSocketTradingClient,
} from '@/lib/trading/websocket-client';
import { shouldAllowSyntheticMarketData } from '@/lib/terminal/synthetic-data';
import {
  findValueBySymbol,
  getCanonicalSymbol,
  getSymbolAliases,
  isBoundedShortSymbolPrefixAlias,
  normalizeSymbolKey,
  symbolsMatch,
} from '@/lib/market-symbols';
import {
  compareBrokerSymbolVariantSuffixes,
  getBrokerSymbolVariantSuffix,
  stripExecutionSuffix,
} from '@/lib/trading/terminal-symbols';

type WebtraderStoreSnapshot = ReturnType<typeof useWebtraderStore.getState>;

function formatBackendTimeframe(timeframeMinutes: number): string {
  if (timeframeMinutes === 525600) return 'Y1';
  if (timeframeMinutes === 43200) return 'MN1';
  if (timeframeMinutes === 10080) return 'W1';
  if (timeframeMinutes % 1440 === 0) return `D${timeframeMinutes / 1440}`;
  if (timeframeMinutes % 60 === 0) return `H${timeframeMinutes / 60}`;
  return `M${timeframeMinutes}`;
}

export interface OHLCBar {
  symbol?: string;
  timeframeMinutes?: number;
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
  closed?: boolean;
  synthetic?: boolean;
  sourceTimeMs?: number;
  openTimeMs?: number;
  open_time_ms?: number;
  timeMs?: number;
  time_msc?: number;
}

export interface OhlcHistoryDiagnosticsSnapshot {
  sessionId: string | null;
  symbol: string;
  requestedSymbol?: string;
  timeframeMinutes: number;
  requestType?: string;
  requestedLimit?: number;
  returnedBarCount?: number;
  realBarCount?: number;
  status?: string;
  message?: string;
  source?: string;
  before?: number;
  nextBefore?: number;
  hasMore?: boolean;
  cacheOnly?: boolean;
  brokerSymbol?: string;
  attemptedBrokerSymbol?: string;
  resolvedBrokerSymbol?: string;
  brokerSymbolCandidates?: string[];
  historySparse?: boolean;
  historyGapped?: boolean;
  historyStale?: boolean;
  managerFetchDeferred?: boolean;
  managerFetchPending?: boolean;
  managerFetchSucceeded?: boolean;
  fromUnixMs?: number;
  toUnixMs?: number;
  updatedAtMs: number;
}

type OHLCCallback = (symbol: string, timeframe: number, bar: OHLCBar) => void;
type OhlcHistoryMetadataCallback = (
  symbol: string,
  timeframe: number,
  metadata: OhlcHistoryResponseMetadata,
) => void;
type OhlcHistoryDiagnosticsCallback = (
  symbol: string,
  timeframe: number,
  snapshot: OhlcHistoryDiagnosticsSnapshot,
) => void;
type SubKey = string;
type LatestTick = {
  symbol: string;
  price: number;
  volume: number;
  timestampMs: number;
  source: string;
};
type PendingHistoryRequest = {
  limit: number;
  promise: Promise<OHLCBar[]>;
  semanticKey?: string;
  historyKey?: SubKey;
  cacheFirst?: boolean;
  cacheOnly?: boolean;
  started?: boolean;
};
type CachedHistoryRequest = {
  bars: OHLCBar[];
  limit: number;
  storedAtMs: number;
  semanticKey?: string;
  historyKey?: SubKey;
  retryableEmpty?: boolean;
  retryableDeferred?: boolean;
};
type OhlcHistoryPayloadResponse = {
  bars: unknown[];
  metadata?: OhlcHistoryResponseMetadata;
};
type HttpOhlcHistoryResponse = {
  ok?: boolean;
  bars?: unknown[];
  metadata?: OhlcHistoryResponseMetadata;
  error?: string;
  code?: string;
};
type BackgroundHistoryRefreshRequest = {
  requestKey: string;
  symbol: string;
  timeframeMinutes: number;
  requestLimit: number;
  range: HistoryRequestRange;
  key: SubKey;
  bucketMs: number;
  semanticLatestKey?: string;
};
type HistoryRequestType = 'latest' | 'get_before' | 'range';
type HistoryRequestRange = {
  fromUnixMs?: number;
  toUnixMs?: number;
  beforeUnixMs?: number;
  requestType?: HistoryRequestType | string;
  cacheFirst?: boolean;
  cacheOnly?: boolean;
  bypassPendingLatest?: boolean;
};
type HistoryMergeOptions = {
  notifySubscribers?: boolean;
  barsAlreadyFiltered?: boolean;
};
type OhlcHistoryMetadataWithPagination = OhlcHistoryResponseMetadata & {
  requestType?: string;
  before?: number;
  beforeUnixMs?: number;
  nextBefore?: number;
  nextBeforeUnixMs?: number;
  hasMore?: boolean;
  cacheOnly?: boolean;
  cacheFirst?: boolean;
};
type RawOhlcHistoryRequester = {
  sendAuthenticatedRequest<T>(
    action: string,
    data?: unknown,
    timeoutMs?: number,
  ): Promise<T>;
};

const EMPTY_HISTORY_RETRY_DELAY_MS = 900;
const LIVE_CLIENT_ATTACH_WAIT_MS = 600;
const HISTORY_CLIENT_ATTACH_WAIT_MS = 1_200;
const LIVE_CLIENT_ATTACH_POLL_MS = 80;
const LOCAL_HISTORY_POLL_MS = 100;
const LOCAL_REPLAY_BATCH_SIZE = 100;
const MAX_NORMALIZED_OHLC_BARS = Math.max(DEFAULT_OHLC_HISTORY_LIMIT * 4, 20_000);
const MAX_ACCEPTED_FUTURE_TICK_SKEW_MS = 60_000;
const MAX_ACCEPTED_PAST_LIVE_TICK_SKEW_MS = 2 * 60_000;
const RAW_OHLC_HISTORY_LIMIT = 512;
const RAW_OHLC_HISTORY_MAX_KEYS = 128;
const HISTORY_RESULT_CACHE_TTL_MS = 15_000;
const LATEST_HISTORY_REQUEST_COALESCE_DELAY_MS = 0;
const BACKGROUND_HISTORY_REFRESH_STAGGER_MS = 1_200;
const UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD = 10_000_000_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeSubKey(symbol: string, timeframeMinutes: number): SubKey {
  const exactSymbol = symbol.trim();
  return `${exactSymbol}:${timeframeMinutes}`;
}

function splitSubKey(key: SubKey): { symbol: string; timeframeMinutes: number | null } {
  const separatorIndex = key.lastIndexOf(':');
  if (separatorIndex <= 0) {
    return { symbol: key, timeframeMinutes: null };
  }

  const timeframe = parseInt(key.slice(separatorIndex + 1), 10);
  return {
    symbol: key.slice(0, separatorIndex),
    timeframeMinutes: Number.isFinite(timeframe) && timeframe > 0 ? timeframe : null,
  };
}

function makeRawOhlcCacheKey(symbol: string, timeframeMinutes: number): SubKey | null {
  const normalizedSymbol = normalizeSymbolKey(symbol);
  return normalizedSymbol ? `${normalizedSymbol}:${timeframeMinutes}` : null;
}

function isReadyOhlcClient(
  client: WebSocketTradingClient | null | undefined,
): client is WebSocketTradingClient {
  return Boolean(
    client?.isConnected &&
      client.isAuthenticated &&
      client.supportsOhlcActions,
  );
}

function normalizeOptionalUnixMs(value: unknown): number | undefined {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(
      parsed < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD ? parsed * 1000 : parsed,
    );
  }

  if (typeof value === 'string') {
    const dateMs = new Date(value).getTime();
    if (Number.isFinite(dateMs) && dateMs >= 0) {
      return Math.trunc(dateMs);
    }
  }

  return undefined;
}

function normalizeOptionalInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.trunc(parsed);
}

function firstPositiveFiniteNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 0;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
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

function parseOptionalStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => parseOptionalString(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getHistoryRequestType(range: HistoryRequestRange): HistoryRequestType | string {
  const requestType = parseOptionalString(range.requestType);
  if (requestType) {
    return requestType;
  }

  if (range.beforeUnixMs !== undefined) {
    return 'get_before';
  }

  if (range.fromUnixMs !== undefined || range.toUnixMs !== undefined) {
    return 'range';
  }

  return 'latest';
}

function normalizeHistoryRange(range?: HistoryRequestRange): HistoryRequestRange {
  const fromUnixMs = normalizeOptionalUnixMs(range?.fromUnixMs);
  const toUnixMs = normalizeOptionalUnixMs(range?.toUnixMs);
  const beforeUnixMs = normalizeOptionalUnixMs(
    range?.beforeUnixMs ?? (range as { before?: unknown } | undefined)?.before,
  );
  const normalizedRange: HistoryRequestRange = {
    ...(fromUnixMs !== undefined ? { fromUnixMs } : {}),
    ...(toUnixMs !== undefined ? { toUnixMs } : {}),
    ...(beforeUnixMs !== undefined ? { beforeUnixMs } : {}),
  };
  const requestType = parseOptionalString(range?.requestType);
  if (requestType) {
    normalizedRange.requestType = requestType;
  }
  const cacheFirst = parseOptionalBoolean(range?.cacheFirst);
  if (cacheFirst !== undefined) {
    normalizedRange.cacheFirst = cacheFirst;
  }
  const cacheOnly = parseOptionalBoolean(range?.cacheOnly);
  if (cacheOnly !== undefined) {
    normalizedRange.cacheOnly = cacheOnly;
  }
  const bypassPendingLatest = parseOptionalBoolean(range?.bypassPendingLatest);
  if (bypassPendingLatest !== undefined) {
    normalizedRange.bypassPendingLatest = bypassPendingLatest;
  }

  return normalizedRange;
}

function getHistoryRequestCacheModeKey(range: HistoryRequestRange): string {
  const cacheFirst = range.cacheFirst === false ? 'cacheFirst:false' : 'cacheFirst:true';
  const cacheOnly = range.cacheOnly === true ? 'cacheOnly:true' : 'cacheOnly:false';
  return `${cacheFirst}:${cacheOnly}`;
}

function normalizeHistoryDiagnosticsSessionId(sessionId: string | null | undefined): string {
  const normalized = sessionId?.trim();
  return normalized ? normalized : 'terminal';
}

function makeHistoryRequestKey(
  sessionId: string | null,
  key: SubKey,
  limit: number,
  range: HistoryRequestRange,
): string {
  const requestType = getHistoryRequestType(range);
  const beforeOrLatest =
    range.beforeUnixMs !== undefined
      ? `before:${range.beforeUnixMs}`
      : requestType === 'latest'
        ? 'latest'
        : `range:${range.fromUnixMs ?? 'any'}:${range.toUnixMs ?? 'any'}`;

  return [
    sessionId ?? 'terminal',
    key,
    requestType,
    beforeOrLatest,
    limit,
    getHistoryRequestCacheModeKey(range),
  ].join(':');
}

function makeCanonicalHistorySubKey(symbol: string, timeframeMinutes: number): SubKey {
  return makeSubKey(
    getOhlcRequestCandidateFamilyKey(symbol) || symbol.trim(),
    timeframeMinutes,
  );
}

function makeCanonicalHistoryRequestKey(
  sessionId: string | null,
  key: SubKey,
  limit: number,
  range: HistoryRequestRange,
): string {
  const { symbol, timeframeMinutes } = splitSubKey(key);
  return makeHistoryRequestKey(
    sessionId,
    makeCanonicalHistorySubKey(symbol, timeframeMinutes ?? 0),
    limit,
    range,
  );
}

function isSemanticLatestHistoryRange(range: HistoryRequestRange): boolean {
  return (
    getHistoryRequestType(range) === 'latest' &&
    range.beforeUnixMs === undefined &&
    range.fromUnixMs === undefined &&
    range.toUnixMs === undefined
  );
}

function makeSemanticLatestHistoryRequestKey(
  sessionId: string | null,
  symbol: string,
  timeframeMinutes: number,
): string {
  const normalizedSymbol =
    getOhlcRequestCandidateFamilyKey(symbol) ||
    normalizeSymbolKey(symbol) ||
    symbol.trim().toLowerCase() ||
    symbol;

  return [
    sessionId ?? 'terminal',
    normalizedSymbol,
    timeframeMinutes,
    'latest',
  ].join(':');
}

function bucketTime(time: number, bucketMs: number): number {
  return Math.floor(time / bucketMs) * bucketMs;
}

function makeHistoryDiagnosticsKey(sessionId: string | null, key: SubKey): string {
  return `${normalizeHistoryDiagnosticsSessionId(sessionId)}:${key}`;
}

function extractRawOhlcHistoryBars(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const direct =
    payload.bars ??
    payload.history ??
    payload.candles ??
    payload.ohlc ??
    payload.data;
  if (Array.isArray(direct)) {
    return direct;
  }

  if (isRecord(direct)) {
    const nested =
      direct.bars ??
      direct.history ??
      direct.candles ??
      direct.ohlc;
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  const result = payload.result;
  if (Array.isArray(result)) {
    return result;
  }

  if (isRecord(result)) {
    const nested =
      result.bars ??
      result.history ??
      result.candles ??
      result.ohlc;
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  return [];
}

function getRawOhlcHistoryResponseSource(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    return {};
  }

  if (isRecord(payload.result)) {
    return payload.result;
  }

  if (isRecord(payload.payload)) {
    return payload.payload;
  }

  if (isRecord(payload.data) && !Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload;
}

function mapRawOhlcHistoryMetadata(
  payload: unknown,
  context: {
    symbol: string;
    timeframeMinutes: number;
    limit: number;
    requestType: string;
    beforeUnixMs?: number;
    cacheFirst?: boolean;
    cacheOnly?: boolean;
  },
): OhlcHistoryMetadataWithPagination {
  const source = getRawOhlcHistoryResponseSource(payload);
  const rawMetadata = isRecord(source.metadata) ? source.metadata : undefined;
  const requestedLimit = normalizeOptionalInteger(
    source.requestedLimit ?? source.limit ?? rawMetadata?.requestedLimit ?? context.limit,
  );
  const returnedBarCount = normalizeOptionalInteger(
    source.returnedBarCount ?? source.barCount ?? rawMetadata?.returnedBarCount,
  );
  const realBarCount = normalizeOptionalInteger(
    source.realBarCount ?? rawMetadata?.realBarCount,
  );
  const requestType =
    parseOptionalString(source.requestType ?? source.type ?? rawMetadata?.requestType) ??
    context.requestType;
  const before = normalizeOptionalUnixMs(
    source.beforeUnixMs ??
      source.before_unix_ms ??
      source.before ??
      rawMetadata?.beforeUnixMs ??
      rawMetadata?.before ??
      context.beforeUnixMs,
  );
  const nextBefore = normalizeOptionalUnixMs(
    source.nextBeforeUnixMs ??
      source.next_before_unix_ms ??
      source.nextBefore ??
      rawMetadata?.nextBeforeUnixMs ??
      rawMetadata?.nextBefore,
  );
  const cacheOnly =
    parseOptionalBoolean(source.cacheOnly ?? rawMetadata?.cacheOnly) ??
    context.cacheOnly;
  const cacheFirst =
    parseOptionalBoolean(source.cacheFirst ?? rawMetadata?.cacheFirst) ??
    context.cacheFirst;
  const hasMore = parseOptionalBoolean(source.hasMore ?? rawMetadata?.hasMore);
  const sourceName = parseOptionalString(source.source ?? rawMetadata?.source);
  const status = parseOptionalString(source.status);
  const message = parseOptionalString(source.message);
  const historyStale = parseOptionalBoolean(source.historyStale ?? rawMetadata?.historyStale);
  const managerFetchPending = parseOptionalBoolean(
    source.managerFetchPending ??
      source.manager_fetch_pending ??
      rawMetadata?.managerFetchPending ??
      rawMetadata?.manager_fetch_pending,
  );
  const managerFetchSucceeded = parseOptionalBoolean(
    source.managerFetchSucceeded ?? rawMetadata?.managerFetchSucceeded,
  );
  const brokerSymbol = parseOptionalString(source.brokerSymbol ?? rawMetadata?.brokerSymbol);
  const brokerSymbolCandidates = parseOptionalStringList(
    source.brokerSymbolCandidates ?? rawMetadata?.brokerSymbolCandidates,
  );
  const fromUnixMs = normalizeOptionalUnixMs(source.fromUnixMs ?? rawMetadata?.fromUnixMs);
  const toUnixMs = normalizeOptionalUnixMs(source.toUnixMs ?? rawMetadata?.toUnixMs);

  return {
    ...(status ? { status } : {}),
    symbol: parseOptionalString(source.symbol ?? rawMetadata?.symbol) ?? context.symbol,
    ...(brokerSymbol ? { brokerSymbol } : {}),
    ...(brokerSymbolCandidates.length > 0 ? { brokerSymbolCandidates } : {}),
    timeframeMinutes:
      normalizeOptionalInteger(
        source.timeframeMinutes ??
          source.timeframe_minutes ??
          source.timeframe ??
          rawMetadata?.timeframeMinutes,
      ) ?? context.timeframeMinutes,
    ...(requestedLimit !== undefined ? { limit: requestedLimit, requestedLimit } : {}),
    ...(returnedBarCount !== undefined
      ? { barCount: returnedBarCount, returnedBarCount }
      : {}),
    ...(realBarCount !== undefined ? { realBarCount } : {}),
    ...(message ? { message } : {}),
    ...(rawMetadata
      ? {
          metadata: rawMetadata as OhlcHistoryResponseMetadata['metadata'],
        }
      : {}),
    ...(source.warnings !== undefined ? { warnings: source.warnings } : {}),
    ...(source.notes !== undefined ? { notes: source.notes } : {}),
    historySparse: parseOptionalBoolean(source.historySparse ?? rawMetadata?.historySparse) ?? false,
    historyGapped: parseOptionalBoolean(source.historyGapped ?? rawMetadata?.historyGapped) ?? false,
    ...(historyStale !== undefined ? { historyStale } : {}),
    managerFetchDeferred:
      parseOptionalBoolean(source.managerFetchDeferred ?? rawMetadata?.managerFetchDeferred) ??
      false,
    ...(managerFetchPending !== undefined ? { managerFetchPending } : {}),
    ...(managerFetchSucceeded !== undefined ? { managerFetchSucceeded } : {}),
    ...(sourceName ? { source: sourceName } : {}),
    ...(fromUnixMs !== undefined ? { fromUnixMs } : {}),
    ...(toUnixMs !== undefined ? { toUnixMs } : {}),
    requestType,
    ...(before !== undefined ? { before, beforeUnixMs: before } : {}),
    ...(nextBefore !== undefined ? { nextBefore, nextBeforeUnixMs: nextBefore } : {}),
    ...(hasMore !== undefined ? { hasMore } : {}),
    ...(cacheOnly !== undefined ? { cacheOnly } : {}),
    ...(cacheFirst !== undefined ? { cacheFirst } : {}),
  };
}

const KNOWN_TRUNCATED_OHLC_ALIASES: Record<string, string[]> = {
  BTCU: ['BTCUSD', 'BTC/USD', 'BTC'],
  ETHU: ['ETHUSD', 'ETH/USD', 'ETH'],
};

const INGRESS_ONLY_TRUNCATED_OHLC_ALIASES: Record<string, string[]> = {
  USDCHF: ['USDCH'],
};

const KNOWN_OHLC_BROKER_VARIANT_SUFFIXES = new Set([
  'c',
  'cash',
  'cent',
  'e',
  'f',
  'fix',
  'm',
  'u',
]);

function normalizeOhlcLiteralSymbolKey(symbol: string): string {
  return symbol.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function getOhlcSymbolAliases(symbol: string): string[] {
  const aliases = new Set(getSymbolAliases(symbol));
  const normalized = normalizeSymbolKey(symbol);
  const expandedAliases = KNOWN_TRUNCATED_OHLC_ALIASES[normalized] ?? [];

  for (const alias of expandedAliases) {
    aliases.add(alias);
  }

  for (const [truncated, fullAliases] of Object.entries(KNOWN_TRUNCATED_OHLC_ALIASES)) {
    if (fullAliases.some((alias) => symbolsMatch(alias, symbol))) {
      aliases.add(truncated);
    }
  }

  return [...aliases];
}

function getKnownTruncatedOhlcAliasFamilyKey(symbol: string): string | null {
  const literal = normalizeOhlcLiteralSymbolKey(symbol);
  if (!literal) {
    return null;
  }

  const expandedAliases = KNOWN_TRUNCATED_OHLC_ALIASES[literal] ?? [];
  if (expandedAliases.length > 0) {
    return normalizeOhlcLiteralSymbolKey(expandedAliases[0]) || literal;
  }

  for (const fullAliases of Object.values(KNOWN_TRUNCATED_OHLC_ALIASES)) {
    if (fullAliases.some((alias) => normalizeOhlcLiteralSymbolKey(alias) === literal)) {
      return normalizeOhlcLiteralSymbolKey(fullAliases[0]) || literal;
    }
  }

  return null;
}

function getKnownBrokerVariantOhlcFamilyKey(symbol: string): string | null {
  const suffix = getBrokerSymbolVariantSuffix(symbol);
  if (suffix && !KNOWN_OHLC_BROKER_VARIANT_SUFFIXES.has(suffix)) {
    return null;
  }

  const literal = normalizeOhlcLiteralSymbolKey(symbol);
  const familySymbol = suffix ? literal.slice(0, -suffix.length) : literal;
  return normalizeOhlcLiteralSymbolKey(familySymbol) || null;
}

function getFallbackOhlcFamilyKey(symbol: string): string | null {
  const trimmed = symbol.trim();
  const dottedSuffix = trimmed.match(/\.([A-Za-z0-9]+)$/u)?.[1]?.toLowerCase();
  if (dottedSuffix && !KNOWN_OHLC_BROKER_VARIANT_SUFFIXES.has(dottedSuffix)) {
    return trimmed.toUpperCase();
  }

  return normalizeOhlcLiteralSymbolKey(trimmed) || null;
}

function getOhlcIngressAliasesForSubscriberSymbol(symbol: string): string[] {
  const aliases = new Set<string>();
  const normalized = normalizeSymbolKey(symbol);
  const canonical = getCanonicalSymbol(symbol);

  for (const candidate of [normalized, canonical]) {
    for (const alias of INGRESS_ONLY_TRUNCATED_OHLC_ALIASES[candidate] ?? []) {
      aliases.add(alias);
    }
  }

  return [...aliases];
}

function ohlcIngressSymbolsMatch(subscriberSymbol: string, incomingSymbol: string): boolean {
  const normalizedIncoming = normalizeSymbolKey(incomingSymbol);
  if (!normalizedIncoming) {
    return false;
  }

  return getOhlcIngressAliasesForSubscriberSymbol(subscriberSymbol).some(
    (alias) => normalizeSymbolKey(alias) === normalizedIncoming,
  );
}

function getOhlcRequestCandidateFamilyKey(symbol: string): string {
  const familyKey =
    getKnownTruncatedOhlcAliasFamilyKey(symbol) ??
    getKnownBrokerVariantOhlcFamilyKey(symbol) ??
    getFallbackOhlcFamilyKey(symbol);

  return familyKey || symbol.trim().toUpperCase();
}

function dedupeOhlcRequestCandidatesByFamily(candidates: Iterable<string>): string[] {
  const deduped: string[] = [];
  const seenFamilies = new Set<string>();

  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    const familyKey = getOhlcRequestCandidateFamilyKey(trimmed);
    if (!trimmed || !familyKey || seenFamilies.has(familyKey)) {
      continue;
    }

    seenFamilies.add(familyKey);
    deduped.push(trimmed);
  }

  return deduped;
}

function isWeakerOhlcRequestCandidate(candidate: string, preferredCandidate: string): boolean {
  const normalizedCandidate = normalizeSymbolKey(candidate);
  const normalizedPreferredCandidate = normalizeSymbolKey(preferredCandidate);
  if (
    !normalizedCandidate ||
    !normalizedPreferredCandidate ||
    normalizedCandidate === normalizedPreferredCandidate ||
    normalizedCandidate.length >= normalizedPreferredCandidate.length
  ) {
    return false;
  }

  if (isBoundedShortSymbolPrefixAlias(candidate, preferredCandidate)) {
    return true;
  }

  const expandedAliases = KNOWN_TRUNCATED_OHLC_ALIASES[normalizedCandidate] ?? [];
  return expandedAliases.some(
    (alias) => normalizeSymbolKey(alias) === normalizedPreferredCandidate,
  );
}

function splitDominantOhlcRequestCandidates(
  candidates: Iterable<string | null | undefined>,
): { dominant: string[]; weaker: string[] } {
  const orderedCandidates: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    orderedCandidates.push(trimmed);
  }

  const dominant: string[] = [];
  const weaker: string[] = [];

  for (const candidate of orderedCandidates) {
    if (
      orderedCandidates.some(
        (preferredCandidate) =>
          preferredCandidate !== candidate &&
          isWeakerOhlcRequestCandidate(candidate, preferredCandidate),
      )
    ) {
      weaker.push(candidate);
      continue;
    }

    dominant.push(candidate);
  }

  return { dominant, weaker };
}

function rankOhlcRequestCandidates(
  candidates: Iterable<string | null | undefined>,
  options: {
    preferredExacts?: Array<string | null | undefined>;
    hasLivePrice?: (candidate: string) => boolean;
  } = {},
): string[] {
  const { dominant, weaker } = splitDominantOhlcRequestCandidates(candidates);
  const ranked = new Set<string>();
  const add = (candidate?: string | null) => {
    const trimmed = candidate?.trim();
    if (trimmed) {
      ranked.add(trimmed);
    }
  };
  const addPreferredExactMatches = (pool: string[]) => {
    for (const preferredExact of options.preferredExacts ?? []) {
      const exactMatch = pool.find((candidate) =>
        ohlcSymbolsMatchExact(candidate, preferredExact),
      );
      add(exactMatch);
    }
  };

  addPreferredExactMatches(dominant);
  if (options.hasLivePrice) {
    dominant.filter((candidate) => options.hasLivePrice!(candidate)).forEach(add);
  }
  dominant.forEach(add);
  addPreferredExactMatches(weaker);
  weaker.forEach(add);

  return dedupeOhlcRequestCandidatesByFamily(ranked);
}

function ohlcSymbolsMatch(left: string, right: string): boolean {
  if (symbolsMatch(left, right)) {
    return true;
  }

  const leftAliases = getOhlcSymbolAliases(left);
  const rightAliases = getOhlcSymbolAliases(right);

  return leftAliases.some((leftAlias) =>
    rightAliases.some((rightAlias) =>
      normalizeSymbolKey(leftAlias) === normalizeSymbolKey(rightAlias) ||
      symbolsMatch(leftAlias, rightAlias),
    ),
  );
}

function ohlcSymbolsMatchStrict(left: string, right: string): boolean {
  if (ohlcSymbolsMatchExact(left, right)) {
    return true;
  }

  const leftFamily = getOhlcRequestCandidateFamilyKey(left);
  const rightFamily = getOhlcRequestCandidateFamilyKey(right);

  return Boolean(leftFamily && leftFamily === rightFamily);
}

function ohlcSubscriberSymbolsMatch(
  subscriberSymbol: string,
  incomingSymbol: string,
  options: { allowIngressAliases?: boolean } = {},
): boolean {
  if (ohlcSymbolsMatchStrict(subscriberSymbol, incomingSymbol)) {
    return true;
  }

  return options.allowIngressAliases !== false
    ? ohlcIngressSymbolsMatch(subscriberSymbol, incomingSymbol)
    : false;
}

function ohlcSymbolsMatchExact(left: unknown, right: unknown): boolean {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }

  const normalizedLeft = left.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function sanitizeTimestamp(time: unknown): number {
  if (typeof time === 'number' && Number.isFinite(time)) {
    return Math.trunc(
      time < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD ? time * 1000 : time,
    );
  }

  if (typeof time === 'string') {
    const numeric = Number(time);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.trunc(
        numeric < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD
          ? numeric * 1000
          : numeric,
      );
    }

    const parsedDate = new Date(time).getTime();
    if (Number.isFinite(parsedDate) && parsedDate > 0) {
      return Math.trunc(parsedDate);
    }
  }

  if (time instanceof Date) {
    const timestamp = time.getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return Math.trunc(timestamp);
    }
  }

  // Return 0 so callers (_isValidHistoryBar: time > 0) filter the bar rather than
  // bucket it to the current browser time, which would corrupt the candle series.
  return 0;
}

function sanitizeGenericBarTime(time: unknown): number {
  if (typeof time === 'number' && Number.isFinite(time) && time > 0 && time < 100_000_000) {
    return Math.trunc(time);
  }

  if (typeof time === 'string') {
    const numeric = Number(time);
    if (Number.isFinite(numeric) && numeric > 0 && numeric < 100_000_000) {
      return Math.trunc(numeric);
    }
  }

  // Delegates to sanitizeTimestamp which returns 0 for invalid values.
  // Bars with time=0 are filtered by _isValidHistoryBar (time > 0).
  return sanitizeTimestamp(time);
}

function isLiveServerUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no_live_server|no live|quote server|ohlc.*unavailable|market data.*unavailable|backend unavailable|temporar(?:y|ily) unavailable|service unavailable|history unavailable|websocket.*(disconnect|closed|error)|connection (lost|closed|error|interrupted)|transport closed|reconnecting|not authenticated|not connected|requires an authenticated websocket session|timed out waiting for websocket authentication/i.test(message);
}

function isRequestTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timed out$|\btimed out\b/i.test(message);
}

function historyMetadataIndicatesPendingOrDeferred(
  metadata: OhlcHistoryResponseMetadata | undefined,
): boolean {
  if (!metadata) {
    return false;
  }

  if (
    metadata.managerFetchDeferred ||
    metadata.managerFetchPending ||
    metadata.shouldReload === true
  ) {
    return true;
  }

  const searchableText = [
    metadata.status,
    metadata.message,
    metadata.source,
    metadata.event,
  ].filter(Boolean).join(' ');

  return /defer(?:red)?|pending|queued|loading|not[_\s-]?ready|initiali[sz](?:ing|ation)|starting|warming|bootstrap|startup|temporar(?:y|ily) unavailable|service unavailable|history unavailable|market data unavailable|ohlc unavailable|no bars yet|no history yet|no data yet|retry later|try again|timeout|timed out/i.test(searchableText);
}

function historyMetadataAllowsFastShortHistory(
  metadata: OhlcHistoryMetadataWithPagination | undefined,
  requestLimit: number,
): boolean {
  if (!metadata || historyMetadataIndicatesPendingOrDeferred(metadata)) {
    return false;
  }

  const source = parseOptionalString(metadata.source ?? metadata.metadata?.source);
  const status = parseOptionalString(metadata.status ?? metadata.metadata?.status);
  if (
    source?.toLowerCase() === 'client' ||
    (status && /error|empty|not[_ ]ready|pending|queued|loading/i.test(status))
  ) {
    return false;
  }

  return (
    metadata.hasMore === false ||
    metadata.shouldReload === false ||
    (
      metadata.returnedBarCount !== undefined &&
      metadata.returnedBarCount > 0 &&
      metadata.returnedBarCount < requestLimit
    )
  );
}

function historyDiagnosticsIndicatesPendingOrDeferred(
  snapshot: OhlcHistoryDiagnosticsSnapshot | undefined,
): boolean {
  if (!snapshot) {
    return false;
  }

  if (snapshot.managerFetchDeferred || snapshot.managerFetchPending) {
    return true;
  }

  const searchableText = [
    snapshot.status,
    snapshot.message,
    snapshot.source,
  ].filter(Boolean).join(' ');

  return /defer(?:red)?|pending|queued|loading|not[_\s-]?ready|initiali[sz](?:ing|ation)|starting|warming|bootstrap|startup|temporar(?:y|ily) unavailable|service unavailable|history unavailable|market data unavailable|ohlc unavailable|no bars yet|no history yet|no data yet|retry later|try again|timeout|timed out/i.test(searchableText);
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function historyMetadataHasExactSymbol(
  metadata: OhlcHistoryResponseMetadata,
  symbol: string,
): boolean {
  return [
    metadata.symbol,
    metadata.brokerSymbol,
    metadata.metadata?.symbol,
    metadata.metadata?.brokerSymbol,
  ].some((candidate) => ohlcSymbolsMatchExact(candidate, symbol));
}

function isContinuitySource(source: string | undefined): boolean {
  return Boolean(source && /continuity/i.test(source));
}

function isPriorRealCloseBasis(basis: string | undefined): boolean {
  return basis?.toLowerCase() === 'prior_real_close';
}

function isLiveGeneratedSource(source: string | undefined): boolean {
  source = source?.trim().toLowerCase();
  return source === 'rust_realtime' || source === 'mt5_tick' || source === 'mt5_live_tick';
}

function isProvisionalPriceSeedSource(source: string | undefined): boolean {
  return source?.trim().toLowerCase() === 'live_price_seed';
}

function isProvisionalPriceSeedBar(bar: OHLCBar): boolean {
  return isProvisionalPriceSeedSource(bar.source);
}

function isRawTickDerivedSource(source: string | undefined): boolean {
  return source?.trim().toLowerCase() === 'mt5_tick';
}

function isHistoricalOhlcSource(source: string | undefined): boolean {
  source = source?.trim().toLowerCase() ?? '';
  return /chart|history|ohlc|cache|server|manager|database|rust_db|backend|upstream|\bdb\b/.test(source);
}

function isLiveGeneratedBar(bar: OHLCBar): boolean {
  return isLiveGeneratedSource(bar.source);
}

function isHistoricalOhlcBar(bar: OHLCBar): boolean {
  return bar.cached === true || isHistoricalOhlcSource(bar.source);
}

function areBarsEquivalent(left: OHLCBar | undefined, right: OHLCBar): boolean {
  if (!left) {
    return false;
  }

  return left.time === right.time &&
    left.open === right.open &&
    left.high === right.high &&
    left.low === right.low &&
    left.close === right.close &&
    left.volume === right.volume &&
    left.source === right.source &&
    left.derived === right.derived &&
    left.continuity === right.continuity &&
    left.isContinuity === right.isContinuity &&
    left.basis === right.basis &&
    left.cached === right.cached;
}

function parseIncomingTickTimestampMs(timestampMs: unknown): number | null {
  if (typeof timestampMs === 'number' && Number.isFinite(timestampMs) && timestampMs > 0) {
    return Math.trunc(
      timestampMs < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD
        ? timestampMs * 1000
        : timestampMs,
    );
  }

  if (typeof timestampMs === 'string') {
    const numeric = Number(timestampMs);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.trunc(
        numeric < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD
          ? numeric * 1000
          : numeric,
      );
    }

    const parsedDate = new Date(timestampMs).getTime();
    if (Number.isFinite(parsedDate) && parsedDate > 0) {
      return Math.trunc(parsedDate);
    }
  }

  if (timestampMs instanceof Date) {
    const parsedDate = timestampMs.getTime();
    if (Number.isFinite(parsedDate) && parsedDate > 0) {
      return Math.trunc(parsedDate);
    }
  }

  return null;
}

function normalizeIncomingTickTimestampMs(
  timestampMs: unknown,
  receivedAtMs = Date.now(),
): number {
  const parsedTimestamp = parseIncomingTickTimestampMs(timestampMs);
  const normalizedReceivedAt =
    Number.isFinite(receivedAtMs) && receivedAtMs > 0 ? Math.trunc(receivedAtMs) : Date.now();

  if (parsedTimestamp === null) {
    // No valid MT5/server timestamp — fall back to browser receive time only as last resort.
    return normalizedReceivedAt;
  }

  // Only reject significantly future-skewed timestamps (MT5 clock misconfiguration / drift).
  // Past timestamps MUST preserve the original MT5/server source time so candle buckets stay
  // correct after a backend gateway restart or reconnect tick replay. Using browser receive
  // time for old ticks collapses all replayed ticks into the current bucket, corrupting candles.
  if (parsedTimestamp > normalizedReceivedAt + MAX_ACCEPTED_FUTURE_TICK_SKEW_MS) {
    return normalizedReceivedAt;
  }

  return parsedTimestamp;
}

function normalizeLiveGeneratedBarTimestamp(bar: OHLCBar, receivedAtMs = Date.now()): OHLCBar {
  if (!isRawTickDerivedSource(bar.source)) {
    return bar;
  }

  const normalizedTime = normalizeIncomingTickTimestampMs(bar.time, receivedAtMs);
  return normalizedTime === bar.time ? bar : { ...bar, time: normalizedTime };
}

function getCanonicalIncomingBarTime(bar: OHLCBar): number {
  const rawBar = bar as OHLCBar & {
    openTimeMs?: unknown;
    open_time_ms?: unknown;
    timeMs?: unknown;
    time_msc?: unknown;
  };
  const canonicalTime =
    rawBar.openTimeMs ??
    rawBar.open_time_ms ??
    rawBar.timeMs ??
    rawBar.time_msc;

  return canonicalTime === undefined ? bar.time : sanitizeTimestamp(canonicalTime);
}

function getExplicitCanonicalIncomingBarTime(bar: OHLCBar): number | null {
  const rawBar = bar as OHLCBar & {
    openTimeMs?: unknown;
    open_time_ms?: unknown;
    sourceTimeMs?: unknown;
  };
  const canonicalTime =
    rawBar.openTimeMs ??
    rawBar.open_time_ms ??
    rawBar.sourceTimeMs;

  return canonicalTime === undefined ? null : sanitizeTimestamp(canonicalTime);
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

export type OhlcSanitySymbolClass = 'fx' | 'fx_cross' | 'metals' | 'crypto' | 'default';

export type OhlcSanityRejectionReason =
  | 'invalid_ohlc_price'
  | 'invalid_ohlc_range'
  | 'symbol_price_domain'
  | 'reference_price_deviation'
  | 'isolated_high_spike'
  | 'isolated_low_spike'
  | 'isolated_body_spike'
  | 'isolated_extreme_range';

export type OhlcSanityThresholds = {
  bodyNearReferencePct: number;
  isolatedWickPct: number;
  maxReferenceDeviationPct: number;
  maxRangePct: number;
};

export type OhlcSanityReference = {
  close: number;
  time: number;
};

export type OhlcSanityDecision = {
  accepted: boolean;
  reason?: OhlcSanityRejectionReason;
  referenceClose?: number;
  symbolClass?: OhlcSanitySymbolClass;
  thresholds?: OhlcSanityThresholds;
};

type OhlcSanityLogContext = {
  symbol: string;
  source: string;
  bar: OHLCBar;
  decision: OhlcSanityDecision;
  context: string;
};

type OhlcSanityRejectionWarningBudget = {
  windowStartedAtMs: number;
  emittedCount: number;
  suppressedCount: number;
};

type OhlcSanityRejectionWarningDisposition =
  | 'emit'
  | 'emit_suppression_notice'
  | 'suppress';

type OhlcSanityEvaluationOptions = {
  rejectAnchoredCloseSpike?: boolean;
};

type OhlcSanityReferenceTrackerAcceptOptions = {
  bucketMs?: number;
  staleReferenceGapMs?: number;
};

type LiveAggregateAnchoredSpikeBaseline = {
  bar: OHLCBar;
  referenceClose: number;
};

type OhlcSanityChronologicalFilterOptions = {
  bucketMs?: number;
  initialReference?: OhlcSanityReference | null;
  onRejected?: (bar: OHLCBar, decision: OhlcSanityDecision) => void;
  onAccepted?: (bar: OHLCBar) => void;
};

type OhlcChronologicalSpikeOptions = {
  rejectWholeBarSpike?: boolean;
};

const OHLCSANITY_REJECTION_WARNING_WINDOW_MS = 30_000;
const OHLCSANITY_REJECTION_WARNING_LIMIT = 3;
export const OHLCSANITY_REJECTED_LOG_KEY_LIMIT = 2_048;
const OHLCSANITY_MIN_STALE_REFERENCE_GAP_MS = 10 * 60 * 1000;
const OHLCSANITY_STALE_REFERENCE_GAP_BUCKETS = 20;
const LIVE_BUCKET_ROLLOVER_GRACE_MS = 0;
const LIVE_BUCKET_ROLLOVER_MAX_CATCHUP_BARS = 30;

const OHLCSANITY_THRESHOLDS: Record<OhlcSanitySymbolClass, OhlcSanityThresholds> = {
  // Major FX pairs (EUR/USD, GBP/USD, AUD/USD, USD/CHF …)
  fx: {
    bodyNearReferencePct: 0.005,
    isolatedWickPct: 0.012,
    maxReferenceDeviationPct: 0.08,   // 8%: news events (NFP, FOMC) can move 3-5%
    maxRangePct: 0.04,
  },
  // High-volatility FX crosses (GBP/JPY, EUR/TRY, USD/JPY, EUR/JPY …)
  fx_cross: {
    bodyNearReferencePct: 0.006,
    isolatedWickPct: 0.015,
    maxReferenceDeviationPct: 0.12,   // 12%: JPY crosses move 5-8% on BOJ surprises
    maxRangePct: 0.08,
  },
  // Precious metals (XAU/USD, XAG/USD …)
  // Gold at ~$4000+ regularly has $50-200 swings intraday.
  metals: {
    bodyNearReferencePct: 0.008,
    isolatedWickPct: 0.025,           // ~$109 on XAU at $4382
    maxReferenceDeviationPct: 0.12,   // 12%: gold can gap $200+ on geopolitical news
    maxRangePct: 0.08,                // 8%: intraday swings on CPI/war news
  },
  crypto: {
    bodyNearReferencePct: 0.05,
    isolatedWickPct: 0.20,
    maxReferenceDeviationPct: 0.35,
    maxRangePct: 0.40,
  },
  default: {
    bodyNearReferencePct: 0.015,
    isolatedWickPct: 0.06,
    maxReferenceDeviationPct: 0.15,   // 15%: exotic instruments/indices need headroom
    maxRangePct: 0.20,
  },
};

const KNOWN_FX_CURRENCIES = new Set([
  'AUD',
  'CAD',
  'CHF',
  'CNH',
  'EUR',
  'GBP',
  'HKD',
  'JPY',
  'MXN',
  'NOK',
  'NZD',
  'SEK',
  'SGD',
  'USD',
  'ZAR',
]);

const KNOWN_CRYPTO_BASES = [
  'ADA',
  'AVAX',
  'BCH',
  'BNB',
  'BTC',
  'DOGE',
  'DOT',
  'ETH',
  'LINK',
  'LTC',
  'MATIC',
  'SOL',
  'TRX',
  'XLM',
  'XRP',
];

// JPY is quoted at ~100-200x other currencies, making % moves larger in JPY crosses.
// Any pair where one leg is JPY, TRY, ZAR, MXN, NOK, or SEK (high-pip or high-volatility
// EM currencies) gets the wider fx_cross thresholds.
const HIGH_VOLATILITY_FX_QUOTE_CURRENCIES = new Set([
  'JPY', 'TRY', 'ZAR', 'MXN', 'NOK', 'SEK', 'HUF', 'CZK', 'PLN', 'RUB',
]);

export function getOhlcSymbolPriceDomain(symbol: string): { min?: number; max?: number } | null {
  const normalized = normalizeSymbolKey(symbol).toUpperCase();
  if (!normalized) {
    return null;
  }

  if (/^(BTC|XBT)/.test(normalized)) {
    return { min: 1000, max: 2_000_000 };
  }

  if (/^ETH/.test(normalized)) {
    return { min: 50, max: 200_000 };
  }

  if (/XAU|GOLD/.test(normalized)) {
    return { min: 100, max: 50_000 };
  }

  if (/XAG|SILVER/.test(normalized)) {
    return { min: 1, max: 500 };
  }

  if (/US30|DJI|DOW|US100|USTEC|NAS100|NAS|SPX|US500|GER40|DAX|UK100|JP225|HK50/.test(normalized)) {
    return { min: 100, max: 500_000 };
  }

  const base = normalized.slice(0, 3);
  const quote = normalized.slice(3, 6);
  if (
    normalized.length >= 6 &&
    KNOWN_FX_CURRENCIES.has(base) &&
    KNOWN_FX_CURRENCIES.has(quote)
  ) {
    return { min: 0.00001, max: 500 };
  }

  return null;
}

function isOhlcBarInsideSymbolPriceDomain(symbol: string, bar: OHLCBar): boolean {
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

function getOhlcSanitySymbolClass(symbol: string): OhlcSanitySymbolClass {
  const normalized = normalizeSymbolKey(symbol).toUpperCase();
  if (!normalized) {
    return 'default';
  }

  if (/XAU|GOLD|XAG|SILVER|XPT|PLAT|XPD|PALL/.test(normalized)) {
    return 'metals';
  }

  if (KNOWN_CRYPTO_BASES.some((base) => normalized.startsWith(base))) {
    return 'crypto';
  }

  const base = normalized.slice(0, 3);
  const quote = normalized.slice(3, 6);
  if (
    normalized.length >= 6 &&
    KNOWN_FX_CURRENCIES.has(base) &&
    KNOWN_FX_CURRENCIES.has(quote)
  ) {
    // Use wider thresholds for high-volatility FX crosses (e.g. GBP/JPY, EUR/TRY)
    if (
      HIGH_VOLATILITY_FX_QUOTE_CURRENCIES.has(base) ||
      HIGH_VOLATILITY_FX_QUOTE_CURRENCIES.has(quote)
    ) {
      return 'fx_cross';
    }
    return 'fx';
  }

  return 'default';
}

export function getOhlcSanityReferenceKey(
  symbol: string,
  timeframeMinutes?: number | null,
  resolvedSymbol?: string | null,
): string {
  const normalizedSymbol = normalizeSymbolKey(resolvedSymbol ?? symbol);
  for (const alias of [resolvedSymbol, symbol, ...getOhlcSymbolAliases(resolvedSymbol ?? symbol)]) {
    if (typeof alias !== 'string') {
      continue;
    }
    const canonical = getCanonicalSymbol(alias);
    if (canonical && canonical !== normalizedSymbol) {
      const timeframe = normalizeOptionalInteger(timeframeMinutes);
      return timeframe && timeframe > 0 ? `${canonical}:${timeframe}` : canonical;
    }
  }

  const referenceSymbol = normalizedSymbol || symbol.trim().toUpperCase();
  const timeframe = normalizeOptionalInteger(timeframeMinutes);
  return timeframe && timeframe > 0 ? `${referenceSymbol}:${timeframe}` : referenceSymbol;
}

function isValidOhlcSanityReference(referenceClose: unknown): referenceClose is number {
  return Number.isFinite(referenceClose) && Number(referenceClose) > 0;
}

function isValidOhlcSanityPrice(price: unknown): price is number {
  return Number.isFinite(price) && Number(price) > 0;
}

function getOhlcSanityBarTime(bar: OHLCBar): number {
  const time = getCanonicalIncomingBarTime(bar);
  return Number.isFinite(time) && time > 0 ? time : bar.time;
}

function shouldRememberOhlcSanityReference(bar: OHLCBar): boolean {
  return (
    !isContinuityBar(bar) &&
    isValidOhlcSanityPrice(bar.close) &&
    Number.isFinite(getOhlcSanityBarTime(bar)) &&
    getOhlcSanityBarTime(bar) > 0
  );
}

function updateOhlcSanityReference(
  reference: OhlcSanityReference | null | undefined,
  bar: OHLCBar,
): OhlcSanityReference | null {
  if (!shouldRememberOhlcSanityReference(bar)) {
    return reference ?? null;
  }

  const time = getOhlcSanityBarTime(bar);
  if (!reference || time >= reference.time) {
    return {
      close: bar.close,
      time,
    };
  }

  return reference;
}

function withOhlcSanityReferenceClose(
  decision: OhlcSanityDecision,
  referenceClose: number | null | undefined,
): OhlcSanityDecision {
  return isValidOhlcSanityReference(referenceClose)
    ? { ...decision, referenceClose }
    : decision;
}

function evaluateBasicOhlcStructureSanity(
  bar: OHLCBar,
  referenceClose?: number | null,
): OhlcSanityDecision {
  const prices = [bar.open, bar.high, bar.low, bar.close];
  if (!prices.every(isValidOhlcSanityPrice)) {
    return withOhlcSanityReferenceClose(
      {
        accepted: false,
        reason: 'invalid_ohlc_price',
      },
      referenceClose,
    );
  }

  if (
    bar.low > bar.high ||
    bar.high < Math.max(bar.open, bar.close) ||
    bar.low > Math.min(bar.open, bar.close)
  ) {
    return withOhlcSanityReferenceClose(
      {
        accepted: false,
        reason: 'invalid_ohlc_range',
      },
      referenceClose,
    );
  }

  return { accepted: true };
}

function evaluateOhlcStructureAndDomainSanity(
  symbol: string,
  bar: OHLCBar,
  referenceClose?: number | null,
): OhlcSanityDecision {
  const structureDecision = evaluateBasicOhlcStructureSanity(bar, referenceClose);
  if (!structureDecision.accepted) {
    return structureDecision;
  }

  if (!isOhlcBarInsideSymbolPriceDomain(symbol, bar)) {
    const symbolClass = getOhlcSanitySymbolClass(symbol);
    return withOhlcSanityReferenceClose(
      {
        accepted: false,
        reason: 'symbol_price_domain',
        symbolClass,
        thresholds: OHLCSANITY_THRESHOLDS[symbolClass],
      },
      referenceClose,
    );
  }

  return { accepted: true };
}

function getOhlcSanityStaleReferenceGapMs(
  bucketMs?: number,
  overrideGapMs?: number,
): number {
  if (typeof overrideGapMs === 'number' && Number.isFinite(overrideGapMs) && overrideGapMs > 0) {
    return overrideGapMs;
  }

  return Math.max(
    OHLCSANITY_MIN_STALE_REFERENCE_GAP_MS,
    typeof bucketMs === 'number' && Number.isFinite(bucketMs) && bucketMs > 0
      ? OHLCSANITY_STALE_REFERENCE_GAP_BUCKETS * bucketMs
      : 0,
  );
}

function isOhlcSanityReferenceStaleForBar(
  reference: OhlcSanityReference | null | undefined,
  bar: OHLCBar,
  options: OhlcSanityReferenceTrackerAcceptOptions = {},
): boolean {
  if (!reference) {
    return false;
  }

  const barTime = getOhlcSanityBarTime(bar);
  return (
    barTime > 0 &&
    reference.time > 0 &&
    barTime - reference.time > getOhlcSanityStaleReferenceGapMs(
      options.bucketMs,
      options.staleReferenceGapMs,
    )
  );
}

export function evaluateOhlcBarSanity(
  symbol: string,
  bar: OHLCBar,
  referenceClose: number | null | undefined,
  options: OhlcSanityEvaluationOptions = {},
): OhlcSanityDecision {
  const structureDecision = evaluateOhlcStructureAndDomainSanity(
    symbol,
    bar,
    referenceClose,
  );
  if (!structureDecision.accepted) {
    return structureDecision;
  }

  // No reference only bypasses reference-dependent outlier checks.
  if (!isValidOhlcSanityReference(referenceClose) || isContinuityBar(bar)) {
    return { accepted: true };
  }

  const symbolClass = getOhlcSanitySymbolClass(symbol);
  const thresholds = OHLCSANITY_THRESHOLDS[symbolClass];
  const prices = [bar.open, bar.high, bar.low, bar.close];
  const openDeviationPct = Math.abs(bar.open - referenceClose) / referenceClose;
  const closeDeviationPct = Math.abs(bar.close - referenceClose) / referenceClose;
  const absoluteHighDeviationPct = Math.abs(bar.high - referenceClose) / referenceClose;
  const absoluteLowDeviationPct = Math.abs(bar.low - referenceClose) / referenceClose;
  const highDeviationPct = (bar.high - referenceClose) / referenceClose;
  const lowDeviationPct = (referenceClose - bar.low) / referenceClose;
  const rangePct = (bar.high - bar.low) / referenceClose;
  const openNearReference = openDeviationPct <= thresholds.bodyNearReferencePct;
  const closeNearReference = closeDeviationPct <= thresholds.bodyNearReferencePct;
  const lowNearReference = absoluteLowDeviationPct <= thresholds.bodyNearReferencePct;
  const highNearReference = absoluteHighDeviationPct <= thresholds.bodyNearReferencePct;
  const bodyNearReference =
    openNearReference && closeNearReference;
  const maxReferenceDeviationPct = Math.max(
    openDeviationPct,
    absoluteHighDeviationPct,
    absoluteLowDeviationPct,
    closeDeviationPct,
  );

  if (maxReferenceDeviationPct > thresholds.maxReferenceDeviationPct) {
    return {
      accepted: false,
      reason: 'reference_price_deviation',
      referenceClose,
      symbolClass,
      thresholds,
    };
  }

  if (
    highDeviationPct > thresholds.isolatedWickPct &&
    (
      (bodyNearReference && bar.high > Math.max(bar.open, bar.close)) ||
      (
        options.rejectAnchoredCloseSpike === true &&
        openNearReference &&
        lowNearReference &&
        closeDeviationPct > thresholds.isolatedWickPct &&
        bar.close > referenceClose
      )
    )
  ) {
    return {
      accepted: false,
      reason: 'isolated_high_spike',
      referenceClose,
      symbolClass,
      thresholds,
    };
  }

  if (
    lowDeviationPct > thresholds.isolatedWickPct &&
    (
      (bodyNearReference && bar.low < Math.min(bar.open, bar.close)) ||
      (
        options.rejectAnchoredCloseSpike === true &&
        openNearReference &&
        highNearReference &&
        closeDeviationPct > thresholds.isolatedWickPct &&
        bar.close < referenceClose
      )
    )
  ) {
    return {
      accepted: false,
      reason: 'isolated_low_spike',
      referenceClose,
      symbolClass,
      thresholds,
    };
  }

  if (rangePct > thresholds.maxRangePct) {
    return {
      accepted: false,
      reason: 'isolated_extreme_range',
      referenceClose,
      symbolClass,
      thresholds,
    };
  }

  return {
    accepted: true,
    referenceClose,
    symbolClass,
    thresholds,
  };
}

function getOhlcSanityReferenceFromBar(bar: OHLCBar): OhlcSanityReference | null {
  if (!shouldRememberOhlcSanityReference(bar)) {
    return null;
  }

  return {
    close: bar.close,
    time: getOhlcSanityBarTime(bar),
  };
}

function isOhlcSanityReferenceNear(
  left: OhlcSanityReference,
  right: OhlcSanityReference,
  thresholds: OhlcSanityThresholds,
): boolean {
  const midpoint = (left.close + right.close) / 2;
  if (!isValidOhlcSanityReference(midpoint)) {
    return false;
  }

  const agreementPct = Math.min(
    thresholds.bodyNearReferencePct * 0.75,
    thresholds.isolatedWickPct / 2,
  );
  return Math.abs(left.close - right.close) / midpoint <= agreementPct;
}

function getAgreedOhlcSanityReferenceClose(
  anchors: OhlcSanityReference[],
  thresholds: OhlcSanityThresholds,
): number | null {
  for (let leftIndex = 0; leftIndex < anchors.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < anchors.length; rightIndex += 1) {
      const left = anchors[leftIndex];
      const right = anchors[rightIndex];
      if (isOhlcSanityReferenceNear(left, right, thresholds)) {
        return (left.close + right.close) / 2;
      }
    }
  }

  return null;
}

function getChronologicalOhlcSanityAnchors(
  bars: OHLCBar[],
  index: number,
  initialReference?: OhlcSanityReference | null,
  acceptedPreviousBars?: OHLCBar[],
): OhlcSanityReference[] {
  const anchors: OhlcSanityReference[] = [];
  if (
    initialReference &&
    isValidOhlcSanityReference(initialReference.close) &&
    Number.isFinite(initialReference.time) &&
    initialReference.time > 0
  ) {
    anchors.push({ ...initialReference });
  }

  const previousBars = acceptedPreviousBars ?? bars.slice(0, index);
  for (let previousIndex = previousBars.length - 1; previousIndex >= 0; previousIndex -= 1) {
    const anchor = getOhlcSanityReferenceFromBar(previousBars[previousIndex]);
    if (anchor) {
      anchors.push(anchor);
      break;
    }
  }

  for (let nextIndex = index + 1; nextIndex < bars.length; nextIndex += 1) {
    const anchor = getOhlcSanityReferenceFromBar(bars[nextIndex]);
    if (anchor) {
      anchors.push(anchor);
      break;
    }
  }

  return anchors;
}

function getOhlcIsolatedBodySpikeDecision(
  symbol: string,
  bar: OHLCBar,
  referenceClose: number,
): OhlcSanityDecision | null {
  const symbolClass = getOhlcSanitySymbolClass(symbol);
  const thresholds = OHLCSANITY_THRESHOLDS[symbolClass];
  const prices = [bar.open, bar.high, bar.low, bar.close];
  if (!prices.every(isValidOhlcSanityPrice)) {
    return null;
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const wholeBarAboveReference =
    (minPrice - referenceClose) / referenceClose > thresholds.isolatedWickPct;
  const wholeBarBelowReference =
    (referenceClose - maxPrice) / referenceClose > thresholds.isolatedWickPct;

  if (!wholeBarAboveReference && !wholeBarBelowReference) {
    return null;
  }

  return {
    accepted: false,
    reason: 'isolated_body_spike',
    referenceClose,
    symbolClass,
    thresholds,
  };
}

function getOhlcChronologicalIsolatedSpikeDecision(
  symbol: string,
  bar: OHLCBar,
  referenceClose: number,
  options: OhlcChronologicalSpikeOptions = {},
): OhlcSanityDecision | null {
  const symbolClass = getOhlcSanitySymbolClass(symbol);
  const thresholds = OHLCSANITY_THRESHOLDS[symbolClass];
  const prices = [bar.open, bar.high, bar.low, bar.close];
  if (!prices.every(isValidOhlcSanityPrice)) {
    return null;
  }

  const openDeviationPct = Math.abs(bar.open - referenceClose) / referenceClose;
  const closeDeviationPct = Math.abs(bar.close - referenceClose) / referenceClose;
  const lowDeviationPct = Math.abs(bar.low - referenceClose) / referenceClose;
  const highDeviationPct = Math.abs(bar.high - referenceClose) / referenceClose;
  const bodyNearReference =
    openDeviationPct <= thresholds.bodyNearReferencePct &&
    closeDeviationPct <= thresholds.bodyNearReferencePct;
  const chronologicalSpikePct = Math.min(
    thresholds.isolatedWickPct,
    thresholds.bodyNearReferencePct * 0.75,
  );
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const shouldRejectWholeBarSpike = options.rejectWholeBarSpike !== false;

  if (
    shouldRejectWholeBarSpike &&
    (
      (minPrice - referenceClose) / referenceClose > chronologicalSpikePct ||
      (referenceClose - maxPrice) / referenceClose > chronologicalSpikePct
    )
  ) {
    return {
      accepted: false,
      reason: 'isolated_body_spike',
      referenceClose,
      symbolClass,
      thresholds,
    };
  }

  if (
    bodyNearReference &&
    lowDeviationPct <= thresholds.bodyNearReferencePct &&
    (bar.high - referenceClose) / referenceClose > chronologicalSpikePct &&
    (
      bar.high > Math.max(bar.open, bar.close) ||
      (
        (bar.close - referenceClose) / referenceClose > chronologicalSpikePct &&
        bar.high >= bar.close
      )
    )
  ) {
    return {
      accepted: false,
      reason: 'isolated_high_spike',
      referenceClose,
      symbolClass,
      thresholds,
    };
  }

  if (
    bodyNearReference &&
    highDeviationPct <= thresholds.bodyNearReferencePct &&
    (referenceClose - bar.low) / referenceClose > chronologicalSpikePct &&
    (
      bar.low < Math.min(bar.open, bar.close) ||
      (
        (referenceClose - bar.close) / referenceClose > chronologicalSpikePct &&
        bar.low <= bar.close
      )
    )
  ) {
    return {
      accepted: false,
      reason: 'isolated_low_spike',
      referenceClose,
      symbolClass,
      thresholds,
    };
  }

  return null;
}

function isAnchoredCloseSpikeReason(
  reason: OhlcSanityRejectionReason | undefined,
): boolean {
  return (
    reason === 'isolated_high_spike' ||
    reason === 'isolated_low_spike'
  );
}

function isChronologicalNeighborSpikeReason(
  reason: OhlcSanityRejectionReason | undefined,
): boolean {
  return (
    isAnchoredCloseSpikeReason(reason) ||
    reason === 'isolated_extreme_range'
  );
}

function evaluateChronologicalOhlcBarIsolation(
  symbol: string,
  bar: OHLCBar,
  anchors: OhlcSanityReference[],
): OhlcSanityDecision {
  if (anchors.length === 0) {
    return { accepted: true };
  }

  const symbolClass = getOhlcSanitySymbolClass(symbol);
  const thresholds = OHLCSANITY_THRESHOLDS[symbolClass];
  const hasCorroboratingAnchor = (anchor: OhlcSanityReference): boolean =>
    anchors.some(
      (otherAnchor) =>
        otherAnchor !== anchor &&
        isOhlcSanityReferenceNear(anchor, otherAnchor, thresholds),
    );

  for (const anchor of anchors) {
    const decision = evaluateOhlcBarSanity(symbol, bar, anchor.close, {
      rejectAnchoredCloseSpike: true,
    });
    if (!decision.accepted && isChronologicalNeighborSpikeReason(decision.reason)) {
      return decision;
    }

    const anchorHasCorroboration = hasCorroboratingAnchor(anchor);
    const chronologicalSpikeDecision = getOhlcChronologicalIsolatedSpikeDecision(
      symbol,
      bar,
      anchor.close,
      { rejectWholeBarSpike: anchorHasCorroboration },
    );
    if (chronologicalSpikeDecision) {
      return chronologicalSpikeDecision;
    }
  }

  const agreedReferenceClose = getAgreedOhlcSanityReferenceClose(anchors, thresholds);
  if (!isValidOhlcSanityReference(agreedReferenceClose)) {
    return { accepted: true };
  }

  const agreedReferenceDecision = evaluateOhlcBarSanity(
    symbol,
    bar,
    agreedReferenceClose,
    { rejectAnchoredCloseSpike: true },
  );
  if (!agreedReferenceDecision.accepted) {
    return agreedReferenceDecision;
  }

  const chronologicalSpikeDecision = getOhlcChronologicalIsolatedSpikeDecision(
    symbol,
    bar,
    agreedReferenceClose,
  );
  if (chronologicalSpikeDecision) {
    return chronologicalSpikeDecision;
  }

  return getOhlcIsolatedBodySpikeDecision(symbol, bar, agreedReferenceClose) ?? {
    accepted: true,
    referenceClose: agreedReferenceClose,
    symbolClass,
    thresholds,
  };
}

function filterChronologicalOhlcBarsBySanity(
  symbol: string,
  bars: OHLCBar[],
  {
    bucketMs,
    initialReference,
    onRejected,
    onAccepted,
  }: OhlcSanityChronologicalFilterOptions = {},
): OHLCBar[] {
  const orderedBars = [...bars].sort(
    (left, right) => getOhlcSanityBarTime(left) - getOhlcSanityBarTime(right),
  );
  const firstReferenceBar = orderedBars.find(shouldRememberOhlcSanityReference);
  const firstBarTime = firstReferenceBar ? getOhlcSanityBarTime(firstReferenceBar) : null;
  // When filling a large time gap (e.g. DB cache stale for weeks, repair batch
  // starts far ahead) the old initialReference price is irrelevant — applying it
  // as the deviation anchor causes a cascade rejection of all repair bars.
  // If we know the bucket size and the gap exceeds 20 bars, let the batch
  // self-calibrate from its own first bar instead.
  // Absolute gap check: works whether fill bars are older OR newer than the reference.
  // Uses ms directly (bar times are in ms after normalization) — no *1000 scaling needed.
  const referenceGapTooLarge =
    bucketMs != null &&
    bucketMs > 0 &&
    initialReference != null &&
    firstBarTime != null &&
    Math.abs(firstBarTime - initialReference.time) / bucketMs > 20;
  const chronologicalInitialReference =
    referenceGapTooLarge ? null : initialReference;
  let batchReference =
    chronologicalInitialReference &&
    firstReferenceBar &&
    chronologicalInitialReference.time <= getOhlcSanityBarTime(firstReferenceBar)
      ? chronologicalInitialReference
      : null;
  const preliminarilyAcceptedBars: OHLCBar[] = [];

  for (const bar of orderedBars) {
    const decision = evaluateOhlcBarSanity(symbol, bar, batchReference?.close);
    if (!decision.accepted) {
      onRejected?.(bar, decision);
      continue;
    }

    preliminarilyAcceptedBars.push(bar);
    batchReference = updateOhlcSanityReference(batchReference, bar);
  }

  const acceptedBars: OHLCBar[] = [];
  for (let index = 0; index < preliminarilyAcceptedBars.length; index += 1) {
    const bar = preliminarilyAcceptedBars[index];
    const anchors = getChronologicalOhlcSanityAnchors(
      preliminarilyAcceptedBars,
      index,
      chronologicalInitialReference,
      acceptedBars,
    );
    const decision = evaluateChronologicalOhlcBarIsolation(symbol, bar, anchors);
    if (!decision.accepted) {
      onRejected?.(bar, decision);
      continue;
    }

    acceptedBars.push(bar);
  }

  for (const bar of acceptedBars) {
    onAccepted?.(bar);
  }

  return acceptedBars;
}

function makeOhlcSanityRejectionLogKey(
  symbol: string,
  bar: OHLCBar,
  decision: OhlcSanityDecision,
): string {
  return [
    getOhlcSanityReferenceKey(symbol),
    getOhlcSanityBarTime(bar),
    bar.open,
    bar.high,
    bar.low,
    bar.close,
    decision.referenceClose ?? 'none',
    decision.reason ?? 'unknown',
  ].join(':');
}

function makeOhlcSanityRejectionWarningBudgetKey(
  symbol: string,
  source: string,
  decision: OhlcSanityDecision,
): string {
  return [
    getOhlcSanityReferenceKey(symbol),
    source,
    decision.reason ?? 'unknown',
  ].join(':');
}

function rememberOhlcSanityRejectedLogKey(
  rejectedLogKeys: Set<string>,
  logKey: string,
): boolean {
  if (rejectedLogKeys.has(logKey)) {
    return false;
  }

  rejectedLogKeys.add(logKey);
  while (rejectedLogKeys.size > OHLCSANITY_REJECTED_LOG_KEY_LIMIT) {
    const oldestLogKey = rejectedLogKeys.values().next().value as string | undefined;
    if (oldestLogKey === undefined) {
      break;
    }
    rejectedLogKeys.delete(oldestLogKey);
  }

  return true;
}

function getOhlcSanityRejectionWarningDisposition(
  warningBudgets: Map<string, OhlcSanityRejectionWarningBudget>,
  symbol: string,
  source: string,
  decision: OhlcSanityDecision,
  nowMs = Date.now(),
): OhlcSanityRejectionWarningDisposition {
  const budgetKey = makeOhlcSanityRejectionWarningBudgetKey(symbol, source, decision);
  let budget = warningBudgets.get(budgetKey);

  if (
    !budget ||
    nowMs < budget.windowStartedAtMs ||
    nowMs - budget.windowStartedAtMs >= OHLCSANITY_REJECTION_WARNING_WINDOW_MS
  ) {
    budget = {
      windowStartedAtMs: nowMs,
      emittedCount: 0,
      suppressedCount: 0,
    };
    warningBudgets.set(budgetKey, budget);
  }

  if (budget.emittedCount < OHLCSANITY_REJECTION_WARNING_LIMIT) {
    budget.emittedCount += 1;
    return 'emit';
  }

  budget.suppressedCount += 1;
  return budget.suppressedCount === 1 ? 'emit_suppression_notice' : 'suppress';
}

export function logOhlcSanityRejection({
  symbol,
  source,
  bar,
  decision,
  context,
}: OhlcSanityLogContext): void {
  console.warn('[ohlcSanityGuard] rejected OHLC outlier', {
    context,
    symbol,
    source: bar.source ?? source,
    time: getOhlcSanityBarTime(bar),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    referenceClose: decision.referenceClose,
    reason: decision.reason,
    symbolClass: decision.symbolClass,
    thresholds: decision.thresholds,
  });
}

function logOhlcSanityRejectionSuppression({
  symbol,
  source,
  decision,
  context,
}: Omit<OhlcSanityLogContext, 'bar'>): void {
  console.warn('[ohlcSanityGuard] suppressed repeated OHLC outlier warnings', {
    context,
    symbol,
    source,
    reason: decision.reason,
    windowMs: OHLCSANITY_REJECTION_WARNING_WINDOW_MS,
    emittedInWindow: OHLCSANITY_REJECTION_WARNING_LIMIT,
  });
}

export function createOhlcSanityReferenceTracker(
  symbol: string,
  context = 'frontend',
  initialReference?: OhlcSanityReference | null,
) {
  let reference: OhlcSanityReference | null = initialReference
    ? { ...initialReference }
    : null;
  const rejectedLogKeys = new Set<string>();
  const rejectionWarningBudgets = new Map<string, OhlcSanityRejectionWarningBudget>();

  const rememberAcceptedBar = (bar: OHLCBar) => {
    reference = updateOhlcSanityReference(reference, bar);
  };

  const reject = (bar: OHLCBar, decision: OhlcSanityDecision, source = 'unknown') => {
    const logKey = makeOhlcSanityRejectionLogKey(symbol, bar, decision);
    if (!rememberOhlcSanityRejectedLogKey(rejectedLogKeys, logKey)) {
      return;
    }

    const effectiveSource = bar.source ?? source;
    const disposition = getOhlcSanityRejectionWarningDisposition(
      rejectionWarningBudgets,
      symbol,
      effectiveSource,
      decision,
    );
    if (disposition === 'emit') {
      logOhlcSanityRejection({
        symbol,
        source,
        bar,
        decision,
        context,
      });
    } else if (disposition === 'emit_suppression_notice') {
      logOhlcSanityRejectionSuppression({
        symbol,
        source: effectiveSource,
        decision,
        context,
      });
    }
  };

  const accept = (
    bar: OHLCBar,
    source = 'unknown',
    options: OhlcSanityReferenceTrackerAcceptOptions = {},
  ) => {
    if (isOhlcSanityReferenceStaleForBar(reference, bar, options)) {
      const structureDecision = evaluateOhlcStructureAndDomainSanity(
        symbol,
        bar,
        reference?.close,
      );
      if (!structureDecision.accepted) {
        reject(bar, structureDecision, source);
        return false;
      }

      rememberAcceptedBar(bar);
      return true;
    }

    const decision = evaluateOhlcBarSanity(symbol, bar, reference?.close);
    if (!decision.accepted) {
      reject(bar, decision, source);
      return false;
    }

    rememberAcceptedBar(bar);
    return true;
  };

  return {
    accept,
    filter: (bars: OHLCBar[], source = 'unknown') =>
      bars.filter((bar) => accept(bar, source)),
    filterChronological: (bars: OHLCBar[], source = 'unknown', bucketMs?: number) =>
      filterChronologicalOhlcBarsBySanity(symbol, bars, {
        bucketMs,
        initialReference: reference,
        onRejected: (bar, decision) => reject(bar, decision, source),
        onAccepted: rememberAcceptedBar,
      }),
    getReference: () => reference,
    reset: () => {
      reference = null;
      rejectedLogKeys.clear();
      rejectionWarningBudgets.clear();
    },
  };
}

function priceFromTickLike(value: unknown): number | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as { bid?: unknown; ask?: unknown; last?: unknown };
  const candidates = [source.bid, source.ask, source.last]
    .map((candidate) => Number(candidate))
    .filter((candidate) => Number.isFinite(candidate) && candidate > 0);

  return candidates[0] ?? null;
}

function timestampFromTickLike(value: unknown): number {
  if (!value || typeof value !== 'object') {
    // No tick object: fall back to browser receive time for provisional price seeds only.
    // This path must never be used to calculate real candle bucket timestamps.
    return Date.now();
  }

  const source = value as {
    time?: unknown;
    timestamp?: unknown;
    timestampMs?: unknown;
    timeMs?: unknown;
  };

  const parsed = sanitizeTimestamp(
    source.timestampMs ?? source.timeMs ?? source.timestamp ?? source.time,
  );
  // sanitizeTimestamp returns 0 when no valid MT5/server time is present.
  // Fall back to browser receive time only for provisional seeds (caller marks source clearly).
  return parsed > 0 ? parsed : Date.now();
}

/**
 * Normalize any MT5/Admin tick timestamp to UTC milliseconds.
 *
 * Source of truth rule: candle bucket timestamps must ALWAYS come from MT5/server time,
 * never from browser/PC time. Browser local time is only allowed for display labels.
 *
 *   MT5 tick time (seconds OR milliseconds)
 *   → normalizeTickTimeToMs(tick.time)
 *   → Math.floor(result / timeframeMs) * timeframeMs  → candle bucket
 */
export function normalizeTickTimeToMs(value: number | string | undefined | null): number {
  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    // MT5 sends seconds when value < 10^10; otherwise already milliseconds.
    return Math.trunc(value < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD ? value * 1000 : value);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.trunc(numeric < UNIX_SECONDS_TO_MILLISECONDS_THRESHOLD ? numeric * 1000 : numeric);
  }

  // ISO string from backend ("2024-01-15T12:34:56.789Z")
  const dateMs = new Date(value).getTime();
  return Number.isFinite(dateMs) && dateMs > 0 ? Math.trunc(dateMs) : 0;
}

export function isContinuityBar(bar: OHLCBar | null | undefined): boolean {
  if (!bar) {
    return false;
  }

  const source = bar.source;
  const basis = bar.basis;

  return (
    bar.isContinuity === true ||
    bar.continuity === true ||
    isContinuitySource(source) ||
    isProvisionalPriceSeedSource(source) ||
    isPriorRealCloseBasis(basis) ||
    (
      bar.derived === true &&
      bar.cached !== true &&
      !isLiveGeneratedSource(source) &&
      !isHistoricalOhlcSource(source)
    )
  );
}

function isClosedBucket(bar: OHLCBar, bucketMs?: number, nowMs = Date.now()): boolean {
  return bar.closed === true ||
    (typeof bucketMs === 'number' && bucketMs > 0 && bar.time + bucketMs <= nowMs);
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

  const existingIsContinuity = isContinuityBar(existing);
  const incomingIsContinuity = isContinuityBar(incoming);

  if (existingIsContinuity !== incomingIsContinuity) {
    return existingIsContinuity ? { ...incoming } : { ...existing };
  }

  if (!existingIsContinuity && !incomingIsContinuity) {
    const existingIsLive = isLiveGeneratedBar(existing);
    const incomingIsLive = isLiveGeneratedBar(incoming);
    const existingIsHistorical = isHistoricalOhlcBar(existing);
    const incomingIsHistorical = isHistoricalOhlcBar(incoming);

    if (existingIsLive !== incomingIsLive && existingIsHistorical !== incomingIsHistorical) {
      const historicalBar = existingIsHistorical ? existing : incoming;
      const liveBar = existingIsLive ? existing : incoming;
      if (!isClosedBucket(historicalBar, bucketMs)) {
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

class OhlcWebSocketService {
  private wsClient: WebSocketTradingClient | null = null;
  private detachOhlcListener: (() => void) | null = null;
  private detachOhlcHistoryMetadataListener: (() => void) | null = null;
  private sessionId: string | null = null;
  private subscribers: Map<SubKey, Set<OHLCCallback>> = new Map();
  private historyMetadataListeners: Set<OhlcHistoryMetadataCallback> = new Set();
  private historyDiagnosticsListeners: Set<OhlcHistoryDiagnosticsCallback> =
    new Set();
  private currentBars: Map<SubKey, OHLCBar> = new Map();
  private history: Map<SubKey, OHLCBar[]> = new Map();
  // Tracks the latest confirmed candle bucket timestamp per key (UTC ms).
  // Persisted across reconnects so gap-fill history can start from the last known point.
  private lastKnownCandleTimestampMs: Map<SubKey, number> = new Map();
  private historyMetadata: Map<SubKey, OhlcHistoryResponseMetadata> = new Map();
  private historyDiagnostics: Map<string, OhlcHistoryDiagnosticsSnapshot> =
    new Map();
  private historyDiagnosticsDebugEnabled = false;
  private subscribedKeys = new Set<SubKey>();
  private subscriberKeyIndex: Map<string, Set<SubKey>> = new Map();
  private subscriberKeyIndexAliases: Map<SubKey, Set<string>> = new Map();
  private storePriceSubscriptionCounts: Map<string, number> = new Map();
  private storePriceUnsubscribers: Map<string, () => void> = new Map();
  private ingestedLivePriceKeys: Map<string, string> = new Map();
  private pendingSubscribeRequests: Map<SubKey, Promise<void>> = new Map();
  private pendingSubscribeAliases: Map<SubKey, Set<string>> = new Map();
  private pendingHistoryRequests: Map<string, PendingHistoryRequest> = new Map();
  private pendingHistoryPayloadRequests: Map<string, Promise<OhlcHistoryPayloadResponse>> =
    new Map();
  private recentHistoryRequestResults: Map<string, CachedHistoryRequest> = new Map();
  private backgroundHistoryRefreshes = new Set<string>();
  private backgroundHistoryRefreshQueue: BackgroundHistoryRefreshRequest[] = [];
  private backgroundHistoryRefreshPumpActive = false;
  private backgroundHistoryRefreshLastStartedAt = 0;
  private backgroundHistoryRefreshGeneration = 0;
  private pendingClientAttachWaits: Map<number, Promise<boolean>> = new Map();
  private clientAttachGeneration = 0;
  private resolvedRequestSymbols: Map<SubKey, string> = new Map();
  private latestTicks: Map<string, LatestTick> = new Map();
  private rawOhlcHistory: Map<SubKey, OHLCBar[]> = new Map();
  private ohlcSanityReferences: Map<string, OhlcSanityReference> = new Map();
  private ohlcSanityRejectedLogKeys = new Set<string>();
  private ohlcSanityRejectionWarningBudgets =
    new Map<string, OhlcSanityRejectionWarningBudget>();
  private liveAggregateAnchoredSpikeBaselines =
    new Map<SubKey, LiveAggregateAnchoredSpikeBaseline>();
  private useHistoryApi = true;
  // Tracks keys that have an active tail-gap fill in flight to prevent double-firing.
  private _tailGapFillKeys = new Set<SubKey>();
  private simulationInterval: ReturnType<typeof setInterval> | null = null;
  private currentBarLatestTickMs: Map<SubKey, number> = new Map();
  private _bucketExpiryTimer: ReturnType<typeof setInterval> | null = null;
  // Offset between the broker/MT5 server clock and the local browser clock,
  // sampled from live tick timestamps (serverTimeMs - browserReceiveMs). Candle
  // buckets use the server clock (tick/bar timestamps), so every rollover timer
  // must judge "now" on that same clock. getServerNowMs() = Date.now() + offset
  // advances smoothly between ticks and stays aligned with the server's bars.
  private _serverClockOffsetMs = 0;
  private _hasServerClockOffset = false;
  // Fires instantly when the store's dedicated OHLC socket or fallback trading
  // socket changes so ensureClientAttached picks it up without waiting for the
  // poll loop.
  private readonly _storeClientUnsub = useWebtraderStore.subscribe(
    (state, previousState) => {
      const preferredClient = this._getPreferredStoreClient(state);
      const previousPreferredClient = this._getPreferredStoreClient(previousState);
      if (
        preferredClient !== previousPreferredClient ||
        (isReadyOhlcClient(preferredClient) && this.wsClient !== preferredClient)
      ) {
        this.ensureClientAttached();
      } else if (
        preferredClient === this.wsClient &&
        isReadyOhlcClient(preferredClient) &&
        previousState.connectionStatus !== 'connected' &&
        state.connectionStatus === 'connected'
      ) {
        // Same client instance just authenticated after a reconnect.
        // The server discards subscriptions on disconnect, so re-send them.
        this._resubscribeAll();
      }
    },
  );
  private simulationPrices: Record<string, number> = {
    'XAU/USD': 2323.0,
    XAUUSD: 2323.0,
    BTC: 60000.0,
    BTCUSD: 60000.0,
    'BTC/USD': 60000.0,
    EURUSD: 1.0852,
    'EUR/USD': 1.0852,
    GBPUSD: 1.2655,
    'GBP/USD': 1.2655,
    USDJPY: 151.22,
    'USD/JPY': 151.22,
    AAPL: 175.2,
    USTEC: 24873.45,
    US100: 24873.45,
    NAS100: 24873.45,
    USOIL: 62.576,
    WTI: 62.576,
    XTIUSD: 62.576,
  };

  public connect(sessionId: string) {
    const normalizedSessionId = sessionId.trim() || sessionId;
    const sessionChanged =
      this.sessionId !== null && this.sessionId !== normalizedSessionId;

    if (sessionChanged) {
      // sessionId now encodes data identity only (accountId+login+server+group).
      // session.id was removed — it is an ephemeral token, not data identity.
      // sessionChanged=true means a REAL account switch, not a WS reconnect.
      // Full cache wipe on account switch; history preserved on reconnects.
      this._clearSessionScopedState(true);
    }

    this.sessionId = normalizedSessionId;
    this.ensureClientAttached();

    if (sessionChanged) {
      for (const key of this.subscribers.keys()) {
        const [symbol, tf] = key.split(':');
        void this._sendSubscribe(symbol, parseInt(tf, 10));
      }
    }

    if (this.hasLiveClient()) {
      this._stopSimulation();
      return;
    }
  }

  public setUseHistoryApi(enabled: boolean): void {
    this.useHistoryApi = enabled;
  }

  public ensureLocalSimulation() {

    if (this.hasLiveClient()) {
      return;
    }

    if (!shouldAllowSyntheticMarketData()) {
      return;
    }

    this._startSimulation();
  }

  public setSimulationSeedPrice(symbol: string, price: number) {
    if (!Number.isFinite(price) || price <= 0) {
      return;
    }

    for (const alias of getSymbolAliases(symbol)) {
      this.simulationPrices[alias] = price;
    }

    this.simulationPrices[normalizeSymbolKey(symbol)] = price;
  }

  public setTokenProvider(provider: (() => Promise<string>) | null): void {
    // Compatibility hook: dedicated OHLC ownership is managed by the terminal
    // auto-connect wiring, and this service resolves the best available live
    // client from the store on demand.
    void provider;
    this.ensureClientAttached();
  }

  public ingestTick(
    symbol: string,
    bid: number,
    ask: number,
    last?: number,
    volume?: number,
    timestampMs?: unknown,
  ) {
    const receivedAtMs = Date.now();
    const normalizedBid = Number(bid);
    const normalizedAsk = Number(ask);
    const normalizedLast = Number(last);
    const midpoint =
      Number.isFinite(normalizedBid) &&
      normalizedBid > 0 &&
      Number.isFinite(normalizedAsk) &&
      normalizedAsk > 0
        ? (normalizedBid + normalizedAsk) / 2
        : 0;
    const priceCandidates = [midpoint, normalizedLast, normalizedBid, normalizedAsk];
    const price = priceCandidates.find((candidate) => Number.isFinite(candidate) && candidate > 0);

    if (!symbol.trim() || !price) {
      return;
    }

    const normalizedVolume = Math.max(0, Number(volume) || 0);
    const normalizedTimestamp = normalizeIncomingTickTimestampMs(timestampMs, receivedAtMs);
    // Keep the broker/browser clock offset fresh so rollover timers stay on the
    // same clock as the tick-driven candle buckets. Only sample when the tick
    // carried a real server timestamp (not the receivedAtMs fallback).
    if (parseIncomingTickTimestampMs(timestampMs) !== null) {
      this._updateServerClockOffset(normalizedTimestamp, receivedAtMs);
    }
    const normalizedSymbol = normalizeSymbolKey(symbol);
    const dedupeKey = `${normalizedTimestamp}:${bid}:${ask}:${Number(last) || 0}:${normalizedVolume}`;
    if (normalizedSymbol && this.ingestedLivePriceKeys.get(normalizedSymbol) === dedupeKey) {
      return;
    }

    const acceptedLatestTick = this._rememberLatestTick(
      symbol,
      price,
      normalizedVolume,
      normalizedTimestamp,
      'mt5_tick',
    );
    if (normalizedSymbol) {
      this.ingestedLivePriceKeys.set(normalizedSymbol, dedupeKey);
    }

    if (this.subscribers.size === 0) {
      return;
    }

    this._aggregateTick(
      symbol,
      price,
      normalizedVolume,
      normalizedTimestamp,
      'mt5_tick',
      receivedAtMs,
    );
  }

  public subscribe(
    symbol: string,
    timeframeMinutes: number,
    callback: OHLCCallback,
  ): () => void {
    this.ensureClientAttached();
    this._ensureBucketExpiryTimer();

    const key = makeSubKey(symbol, timeframeMinutes);
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
      this._indexSubscriberKey(key);
      this._retainStorePriceSubscription(symbol);
      void this._sendSubscribe(symbol, timeframeMinutes);
      void this._waitForLiveClientAttached().then((attached) => {
        if (attached && this.subscribers.has(key)) {
          void this._sendSubscribe(symbol, timeframeMinutes);
        }
      });
    }

    const callbacks = this.subscribers.get(key)!;
    const isNewCallback = !callbacks.has(callback);
    callbacks.add(callback);
    const cancelReplay = isNewCallback
      ? this._replayLocalStateToCallback(key, callback)
      : null;

    return () => {
      cancelReplay?.();

      const callbacks = this.subscribers.get(key);
      if (!callbacks) {
        return;
      }

      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscribers.delete(key);
        this._removeSubscriberKeyFromIndex(key);
        this._releaseStorePriceSubscription(symbol);
        void Promise.resolve().then(() => {
          if (!this.subscribers.has(key)) {
            void this._sendUnsubscribe(symbol, timeframeMinutes);
          }
        });
      }
    };
  }

  public async getHistory(
    symbol: string,
    timeframeMinutes: number,
    limit = DEFAULT_OHLC_HISTORY_LIMIT,
    range?: HistoryRequestRange,
  ): Promise<OHLCBar[]> {
    this.ensureClientAttached();

    const key = makeSubKey(symbol, timeframeMinutes);
    const bucketMs = timeframeMinutes * 60 * 1000;
    const parsedLimit = Number.isFinite(limit)
      ? Math.trunc(limit)
      : DEFAULT_OHLC_HISTORY_LIMIT;
    const requestLimit = Math.min(
      DEFAULT_OHLC_HISTORY_LIMIT,
      Math.max(1, parsedLimit),
    );
    const requestRange = normalizeHistoryRange(range);
    const requestKey = makeCanonicalHistoryRequestKey(
      this.sessionId,
      key,
      requestLimit,
      requestRange,
    );
    const semanticLatestKey =
      isSemanticLatestHistoryRange(requestRange) &&
      requestRange.bypassPendingLatest !== true
      ? makeSemanticLatestHistoryRequestKey(this.sessionId, symbol, timeframeMinutes)
      : undefined;
    const hasDirectReadScope = this._hasDirectHistoryForKey(key, { includeCurrent: true });
    const pendingRequestKey = hasDirectReadScope
      ? makeHistoryRequestKey(this.sessionId, key, requestLimit, requestRange)
      : requestKey;
    const canReuseCachedHistory = requestRange.cacheFirst !== false;
    const canUseEarlyCommittedCachedHistory =
      canReuseCachedHistory && (
        Boolean(semanticLatestKey) ||
        requestRange.cacheOnly === true ||
        requestRange.bypassPendingLatest === true
      );

    const fastCachedHistory = canReuseCachedHistory
      ? this._getFastCachedHistoryForRequest(
          key,
          requestLimit,
          requestRange,
        )
      : null;
    if (fastCachedHistory) {
      this._refreshCachedHistoryInBackground(
        requestKey,
        symbol,
        timeframeMinutes,
        requestLimit,
        requestRange,
        key,
        bucketMs,
        semanticLatestKey,
      );
      return fastCachedHistory;
    }
    const committedCachedHistory = canUseEarlyCommittedCachedHistory
      ? this._getCacheFirstCommittedHistoryForRequest(
          key,
          requestLimit,
          requestRange,
        )
      : null;
    if (committedCachedHistory) {
      this._refreshCachedHistoryInBackground(
        requestKey,
        symbol,
        timeframeMinutes,
        requestLimit,
        requestRange,
        key,
        bucketMs,
        semanticLatestKey,
      );
      return committedCachedHistory;
    }
    const pendingLatestRequest = semanticLatestKey
      ? this._getReusablePendingLatestHistoryRequest(semanticLatestKey, requestLimit, requestRange, key)
      : null;
    if (pendingLatestRequest) {
      if (
        pendingLatestRequest.started &&
        pendingLatestRequest.limit < requestLimit
      ) {
        return this._loadLargerLatestHistoryAfterPending(
          pendingLatestRequest,
          semanticLatestKey!,
          symbol,
          timeframeMinutes,
          requestLimit,
          requestRange,
        );
      }

      return pendingLatestRequest.promise.then((bars) =>
        this._selectBarsForRequest(bars, requestLimit, requestRange),
      );
    }
    const smallerPendingLatestRequest = semanticLatestKey
      ? this._getSmallerPendingLatestHistoryRequest(semanticLatestKey, requestLimit, requestRange, key)
      : null;
    if (smallerPendingLatestRequest) {
      return this._loadLargerLatestHistoryAfterPending(
        smallerPendingLatestRequest,
        semanticLatestKey!,
        symbol,
        timeframeMinutes,
        requestLimit,
        requestRange,
      );
    }

    const cachedLatestResult = canReuseCachedHistory && semanticLatestKey
      ? this._getReusableRecentLatestHistoryResult(key, semanticLatestKey, requestLimit, requestRange)
      : null;
    if (cachedLatestResult) {
      return cachedLatestResult;
    }

    const pendingRequest = this.pendingHistoryRequests.get(pendingRequestKey);
    if (
      pendingRequest &&
      this._pendingHistoryRequestMatchesReadScope(key, pendingRequest)
    ) {
      return pendingRequest.promise;
    }

    const cachedResult = canReuseCachedHistory
      ? this.recentHistoryRequestResults.get(pendingRequestKey)
      : undefined;
    if (cachedResult) {
      if (this._cachedHistoryResultMatchesReadScope(key, cachedResult)) {
        if (Date.now() - cachedResult.storedAtMs <= this._getRecentHistoryResultTtlMs(cachedResult)) {
          this._refreshCachedHistoryInBackground(
            requestKey,
            symbol,
            timeframeMinutes,
            requestLimit,
            requestRange,
            key,
            bucketMs,
            semanticLatestKey,
          );
          return cachedResult.bars.map((bar) => ({ ...bar }));
        }

        this.recentHistoryRequestResults.delete(pendingRequestKey);
      }
    }

    const pendingEntry: PendingHistoryRequest = {
      limit: requestLimit,
      promise: Promise.resolve([]),
      semanticKey: semanticLatestKey,
      historyKey: key,
      cacheFirst: requestRange.cacheFirst,
      cacheOnly: requestRange.cacheOnly,
      started: false,
    };
    const request = (async () => {
      if (semanticLatestKey) {
        await delay(LATEST_HISTORY_REQUEST_COALESCE_DELAY_MS);
      }

      pendingEntry.started = true;
      return this._loadHistory(
        symbol,
        timeframeMinutes,
        pendingEntry.limit,
        requestRange,
        key,
        bucketMs,
      );
    })()
      .then((bars) => {
        const retryableDeferred = this._isRetryableHistoryResult(
          symbol,
          timeframeMinutes,
        );
        this.recentHistoryRequestResults.set(pendingRequestKey, {
          bars: bars.map((bar) => ({ ...bar })),
          limit: pendingEntry.limit,
          storedAtMs: Date.now(),
          semanticKey: semanticLatestKey,
          historyKey: key,
          retryableEmpty: bars.length === 0 && retryableDeferred,
          retryableDeferred,
        });
        return bars;
      })
      .finally(() => {
        this.pendingHistoryRequests.delete(pendingRequestKey);
    });
    pendingEntry.promise = request;
    this.pendingHistoryRequests.set(pendingRequestKey, pendingEntry);
    return request.then((bars) =>
      this._selectBarsForRequest(bars, requestLimit, requestRange),
    );
  }

  private _loadLargerLatestHistoryAfterPending(
    pendingRequest: PendingHistoryRequest,
    semanticKey: string,
    symbol: string,
    timeframeMinutes: number,
    requestLimit: number,
    range: HistoryRequestRange,
  ): Promise<OHLCBar[]> {
    return pendingRequest.promise
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        if (range.cacheFirst !== false) {
          const cachedLatestResult = this._getReusableRecentLatestHistoryResult(
            makeSubKey(symbol, timeframeMinutes),
            semanticKey,
            requestLimit,
            range,
          );
          if (cachedLatestResult) {
            return cachedLatestResult;
          }
        }

        return this.getHistory(symbol, timeframeMinutes, requestLimit, range);
      });
  }

  private _getReusablePendingLatestHistoryRequest(
    semanticKey: string,
    requestLimit: number,
    range: HistoryRequestRange,
    key: SubKey,
  ): PendingHistoryRequest | null {
    let bestMatch: PendingHistoryRequest | null = null;

    for (const pendingRequest of this.pendingHistoryRequests.values()) {
      if (pendingRequest.semanticKey !== semanticKey) {
        continue;
      }

      if (!this._pendingHistoryRequestMatchesCacheMode(pendingRequest, range)) {
        continue;
      }

      if (!this._pendingHistoryRequestMatchesReadScope(key, pendingRequest)) {
        continue;
      }

      if (pendingRequest.limit >= requestLimit && (!bestMatch || pendingRequest.limit > bestMatch.limit)) {
        bestMatch = pendingRequest;
      }
    }

    return bestMatch;
  }

  private _getSmallerPendingLatestHistoryRequest(
    semanticKey: string,
    requestLimit: number,
    range: HistoryRequestRange,
    key: SubKey,
  ): PendingHistoryRequest | null {
    let bestMatch: PendingHistoryRequest | null = null;

    for (const pendingRequest of this.pendingHistoryRequests.values()) {
      if (
        pendingRequest.semanticKey !== semanticKey ||
        pendingRequest.limit >= requestLimit
      ) {
        continue;
      }

      if (!this._pendingHistoryRequestMatchesCacheMode(pendingRequest, range)) {
        continue;
      }

      if (!this._pendingHistoryRequestMatchesReadScope(key, pendingRequest)) {
        continue;
      }

      if (!bestMatch || pendingRequest.limit > bestMatch.limit) {
        bestMatch = pendingRequest;
      }
    }

    return bestMatch;
  }

  private _pendingHistoryRequestMatchesCacheMode(
    pendingRequest: PendingHistoryRequest,
    range: HistoryRequestRange,
  ): boolean {
    return (
      (pendingRequest.cacheFirst !== false) === (range.cacheFirst !== false) &&
      (pendingRequest.cacheOnly === true) === (range.cacheOnly === true)
    );
  }

  private _pendingHistoryRequestMatchesReadScope(
    key: SubKey,
    pendingRequest: PendingHistoryRequest,
  ): boolean {
    if (!this._hasDirectHistoryForKey(key, { includeCurrent: true })) {
      return true;
    }

    return pendingRequest.historyKey === key;
  }

  private _getReusableRecentLatestHistoryResult(
    key: SubKey,
    semanticKey: string,
    requestLimit: number,
    range: HistoryRequestRange,
  ): OHLCBar[] | null {
    const nowMs = Date.now();
    let bestMatch: CachedHistoryRequest | null = null;

    for (const [cacheKey, cachedResult] of this.recentHistoryRequestResults.entries()) {
      if (nowMs - cachedResult.storedAtMs > this._getRecentHistoryResultTtlMs(cachedResult)) {
        this.recentHistoryRequestResults.delete(cacheKey);
        continue;
      }

      if (
        cachedResult.semanticKey !== semanticKey ||
        cachedResult.limit < requestLimit
      ) {
        continue;
      }

      if (!this._cachedHistoryResultMatchesReadScope(key, cachedResult)) {
        continue;
      }

      if (
        this._isRetryableDeferredHistoryResult(cachedResult) &&
        this._hasStoredRealHistoryForRequest(key, requestLimit, range)
      ) {
        this.recentHistoryRequestResults.delete(cacheKey);
        continue;
      }

      if (!bestMatch || cachedResult.limit < bestMatch.limit) {
        bestMatch = cachedResult;
      }
    }

    return bestMatch
      ? this._selectBarsForRequest(bestMatch.bars, requestLimit, range)
      : null;
  }

  private _hasStoredRealHistoryForRequest(
    key: SubKey,
    requestLimit: number,
    range: HistoryRequestRange,
  ): boolean {
    for (const historyKey of this._getHistoryReadKeys(key, { includeCurrent: false })) {
      const storedHistory = this.history.get(historyKey) ?? [];
      if (
        this._selectBarsForRequest(storedHistory, requestLimit, range)
          .some((bar) => !isContinuityBar(bar))
      ) {
        return true;
      }
    }

    return false;
  }

  private _cachedHistoryResultMatchesReadScope(
    key: SubKey,
    cachedResult: CachedHistoryRequest,
  ): boolean {
    if (!this._hasDirectHistoryForKey(key, { includeCurrent: true })) {
      return true;
    }

    return cachedResult.historyKey === key;
  }

  private _getRecentHistoryResultTtlMs(cachedResult: CachedHistoryRequest): number {
    return this._isRetryableDeferredHistoryResult(cachedResult)
      ? EMPTY_HISTORY_RETRY_DELAY_MS
      : HISTORY_RESULT_CACHE_TTL_MS;
  }

  private _isRetryableDeferredHistoryResult(cachedResult: CachedHistoryRequest): boolean {
    return cachedResult.retryableEmpty === true || cachedResult.retryableDeferred === true;
  }

  private _isRetryableHistoryResult(
    symbol: string,
    timeframeMinutes: number,
  ): boolean {
    return (
      historyMetadataIndicatesPendingOrDeferred(
        this.getHistoryMetadata(symbol, timeframeMinutes),
      ) ||
      historyDiagnosticsIndicatesPendingOrDeferred(
        this.getHistoryDiagnostics(symbol, timeframeMinutes),
      )
    );
  }

  private _invalidateRecentDeferredHistoryResultsForSymbol(
    symbol: string,
    timeframeMinutes: number,
  ): void {
    for (const [cacheKey, cachedResult] of this.recentHistoryRequestResults.entries()) {
      if (!this._isRetryableDeferredHistoryResult(cachedResult)) {
        continue;
      }

      const historyKey = cachedResult.historyKey;
      if (!historyKey) {
        continue;
      }

      const separatorIndex = historyKey.lastIndexOf(':');
      if (separatorIndex <= 0) {
        continue;
      }

      const cachedSymbol = historyKey.slice(0, separatorIndex);
      const cachedTimeframe = parseInt(historyKey.slice(separatorIndex + 1), 10);
      if (
        cachedTimeframe === timeframeMinutes &&
        ohlcSymbolsMatch(cachedSymbol, symbol)
      ) {
        this.recentHistoryRequestResults.delete(cacheKey);
      }
    }
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public isCurrentSession(sessionId: string | null | undefined): boolean {
    const expectedSessionId = sessionId?.trim();
    if (!expectedSessionId) {
      return true;
    }

    return this.sessionId === expectedSessionId;
  }

  private _refreshCachedHistoryInBackground(
    requestKey: string,
    symbol: string,
    timeframeMinutes: number,
    requestLimit: number,
    range: HistoryRequestRange,
    key: SubKey,
    bucketMs: number,
    semanticLatestKey?: string,
  ) {
    const pendingLatestRequest = semanticLatestKey
      ? this._getReusablePendingLatestHistoryRequest(semanticLatestKey, requestLimit, range, key)
      : null;
    if (
      range.cacheOnly ||
      pendingLatestRequest ||
      this.pendingHistoryRequests.has(requestKey) ||
      this.backgroundHistoryRefreshes.has(requestKey)
    ) {
      return;
    }

    this.backgroundHistoryRefreshes.add(requestKey);
    this.backgroundHistoryRefreshQueue.push({
      requestKey,
      symbol,
      timeframeMinutes,
      requestLimit,
      range,
      key,
      bucketMs,
      ...(semanticLatestKey ? { semanticLatestKey } : {}),
    });
    void this._drainBackgroundHistoryRefreshQueue();
  }

  private async _drainBackgroundHistoryRefreshQueue(): Promise<void> {
    if (this.backgroundHistoryRefreshPumpActive) {
      return;
    }

    this.backgroundHistoryRefreshPumpActive = true;
    const pumpGeneration = this.backgroundHistoryRefreshGeneration;
    try {
      while (
        this.backgroundHistoryRefreshQueue.length > 0 &&
        pumpGeneration === this.backgroundHistoryRefreshGeneration
      ) {
        const task = this.backgroundHistoryRefreshQueue.shift()!;
        if (!this.backgroundHistoryRefreshes.has(task.requestKey)) {
          continue;
        }

        try {
          const pendingLatestRequest = task.semanticLatestKey
            ? this._getReusablePendingLatestHistoryRequest(
                task.semanticLatestKey,
                task.requestLimit,
                task.range,
                task.key,
              )
            : null;
          if (
            pendingLatestRequest ||
            this.pendingHistoryRequests.has(task.requestKey)
          ) {
            continue;
          }

          const elapsedSinceLastStart =
            Date.now() - this.backgroundHistoryRefreshLastStartedAt;
          const waitMs = Math.max(
            0,
            BACKGROUND_HISTORY_REFRESH_STAGGER_MS - elapsedSinceLastStart,
          );
          if (waitMs > 0) {
            await delay(waitMs);
          }
          if (pumpGeneration !== this.backgroundHistoryRefreshGeneration) {
            continue;
          }

          this.backgroundHistoryRefreshLastStartedAt = Date.now();
          const bars = await this._loadHistory(
            task.symbol,
            task.timeframeMinutes,
            task.requestLimit,
            task.range,
            task.key,
            task.bucketMs,
          );
          if (pumpGeneration !== this.backgroundHistoryRefreshGeneration) {
            continue;
          }
          const retryableDeferred = this._isRetryableHistoryResult(
            task.symbol,
            task.timeframeMinutes,
          );
          this.recentHistoryRequestResults.set(task.requestKey, {
            bars: bars.map((bar) => ({ ...bar })),
            limit: task.requestLimit,
            storedAtMs: Date.now(),
            semanticKey: task.semanticLatestKey,
            historyKey: task.key,
            retryableEmpty: bars.length === 0 && retryableDeferred,
            retryableDeferred,
          });
        } catch {
          // Keep the fast cached response path quiet; foreground requests surface errors.
        } finally {
          if (pumpGeneration === this.backgroundHistoryRefreshGeneration) {
            this.backgroundHistoryRefreshes.delete(task.requestKey);
          }
        }
      }
    } finally {
      if (pumpGeneration !== this.backgroundHistoryRefreshGeneration) {
        return;
      }

      this.backgroundHistoryRefreshPumpActive = false;
      if (this.backgroundHistoryRefreshQueue.length > 0) {
        void this._drainBackgroundHistoryRefreshQueue();
      }
    }
  }

  private _getFastCachedHistoryForRequest(
    key: SubKey,
    requestLimit: number,
    range: HistoryRequestRange,
  ): OHLCBar[] | null {
    if (
      range.cacheOnly ||
      range.beforeUnixMs !== undefined ||
      range.fromUnixMs !== undefined ||
      range.toUnixMs !== undefined ||
      getHistoryRequestType(range) !== 'latest'
    ) {
      return null;
    }

    const selected = this._selectStoredHistoryForRequest(key, requestLimit, range);
    if (selected.length === 0) {
      return null;
    }

    const metadata = this.historyMetadata.get(key) as
      | OhlcHistoryMetadataWithPagination
      | undefined;
    const hasCompleteShortHistory = historyMetadataAllowsFastShortHistory(
      metadata,
      requestLimit,
    );

    return selected.length >= requestLimit || hasCompleteShortHistory
      ? selected
      : null;
  }


  private _getCacheFirstCommittedHistoryForRequest(
    key: SubKey,
    requestLimit: number,
    range: HistoryRequestRange,
  ): OHLCBar[] | null {
    if (range.cacheFirst === false) {
      return null;
    }

    const selected = this._selectCommittedHistoryForRequest(
      key,
      requestLimit,
      range,
    );
    return selected.length > 0 ? selected : null;
  }

  public getHistoryMetadata(
    symbol: string,
    timeframeMinutes: number,
    expectedSessionId?: string | null,
  ): OhlcHistoryResponseMetadata | undefined {
    if (!this.isCurrentSession(expectedSessionId)) {
      return undefined;
    }

    const key = makeSubKey(symbol, timeframeMinutes);
    const directMatch = this.historyMetadata.get(key);
    if (directMatch) {
      return this._cloneHistoryMetadata(directMatch);
    }

    for (const [storedKey, metadata] of this.historyMetadata.entries()) {
      const [storedSymbol, tfStr] = storedKey.split(':');
      if (
        parseInt(tfStr, 10) === timeframeMinutes &&
        (
          ohlcSymbolsMatchExact(storedSymbol, symbol) ||
          historyMetadataHasExactSymbol(metadata, symbol)
        )
      ) {
        return this._cloneHistoryMetadata(metadata);
      }
    }

    for (const [storedKey, metadata] of this.historyMetadata.entries()) {
      const [storedSymbol, tfStr] = storedKey.split(':');
      if (
        parseInt(tfStr, 10) === timeframeMinutes &&
        ohlcSymbolsMatch(storedSymbol, symbol)
      ) {
        return this._cloneHistoryMetadata(metadata);
      }
    }

    return undefined;
  }

  /**
   * Returns the last candle bucket timestamp (UTC ms) that was committed to history
   * for a given symbol + timeframe. Used by reconnect logic to compute the gap
   * between the last known candle and the current MT5/server time.
   */
  public getLastKnownCandleTimestampMs(symbol: string, timeframeMinutes: number): number {
    const key = makeSubKey(symbol, timeframeMinutes);
    let latest = this.lastKnownCandleTimestampMs.get(key) ?? 0;

    for (const historyKey of this._getHistoryMergeKeys(key)) {
      latest = Math.max(latest, this.lastKnownCandleTimestampMs.get(historyKey) ?? 0);

      // Fall back to the latest bar in stored history so reconnects inherit
      // pre-session history without needing explicit tracking calls.
      const history = this.history.get(historyKey) ?? [];
      latest = Math.max(latest, history[history.length - 1]?.time ?? 0);
    }

    return latest;
  }

  /**
   * Returns the latest MT5 server timestamp seen across all symbols, in UTC milliseconds.
   * Used by the datafeed's getServerTime to avoid returning browser local time when the
   * actual MT5 server time is known. Returns 0 when no ticks have been received yet.
   */
  public getLatestKnownMt5TimestampMs(): number {
    let latest = 0;
    for (const tick of this.latestTicks.values()) {
      if (tick.timestampMs > latest) {
        latest = tick.timestampMs;
      }
    }
    return latest;
  }

  /**
   * Re-samples the broker-vs-browser clock offset from one observed pair of
   * (server timestamp, local receive time). Lightly smoothed so per-tick network
   * latency jitter doesn't wobble the offset; snaps immediately on first sample.
   */
  private _updateServerClockOffset(serverMs: number, receivedAtMs: number): void {
    if (
      !Number.isFinite(serverMs) || serverMs <= 0 ||
      !Number.isFinite(receivedAtMs) || receivedAtMs <= 0
    ) {
      return;
    }
    const sample = serverMs - receivedAtMs;
    this._serverClockOffsetMs = this._hasServerClockOffset
      ? Math.round(this._serverClockOffsetMs * 0.8 + sample * 0.2)
      : sample;
    this._hasServerClockOffset = true;
  }

  /**
   * Current time on the broker/MT5 server clock, in UTC ms. This is the clock
   * candle buckets live on, so rollover/expiry timers must use this — NOT
   * Date.now() — or any broker timezone offset desyncs the live candle from the
   * server's history bars. Falls back to Date.now() until the first tick lands.
   */
  public getServerNowMs(): number {
    return this._hasServerClockOffset
      ? Date.now() + this._serverClockOffsetMs
      : Date.now();
  }

  /**
   * Synchronously returns whatever bars are already in the local history cache
   * for a given symbol + timeframe. Used by the chart on mount to seed itself
   * instantly — zero network round-trip, zero timer delay.
   * Returns an empty array if nothing is cached yet.
   */
  public getSyncBars(
    symbol: string,
    timeframeMinutes: number,
    expectedSessionId?: string | null,
  ): OHLCBar[] {
    if (!this.isCurrentSession(expectedSessionId)) {
      return [];
    }

    const key = makeSubKey(symbol, timeframeMinutes);
    const directBars = this._getDirectLocalHistory(key);
    const bars = directBars.length > 0 ? directBars : this._getLocalHistory(key);
    return bars.map((bar) => ({ ...bar, cached: bar.cached ?? true }));
  }

  public setHistoryDiagnosticsDebugEnabled(enabled: boolean) {
    this.historyDiagnosticsDebugEnabled = enabled;
  }

  public getHistoryDiagnostics(
    symbol: string,
    timeframeMinutes: number,
    sessionId: string | null = this.sessionId,
  ): OhlcHistoryDiagnosticsSnapshot | undefined {
    const key = makeHistoryDiagnosticsKey(
      sessionId,
      makeSubKey(symbol, timeframeMinutes),
    );
    const directMatch = this.historyDiagnostics.get(key);
    if (directMatch) {
      return this._cloneHistoryDiagnostics(directMatch);
    }

    const expectedSessionId = normalizeHistoryDiagnosticsSessionId(sessionId);
    for (const snapshot of this.historyDiagnostics.values()) {
      if (
        normalizeHistoryDiagnosticsSessionId(snapshot.sessionId) !==
          expectedSessionId ||
        snapshot.timeframeMinutes !== timeframeMinutes
      ) {
        continue;
      }

      if (
        [
          snapshot.symbol,
          snapshot.requestedSymbol,
          snapshot.brokerSymbol,
          snapshot.attemptedBrokerSymbol,
          snapshot.resolvedBrokerSymbol,
        ].some((candidate) => ohlcSymbolsMatchExact(candidate, symbol))
      ) {
        return this._cloneHistoryDiagnostics(snapshot);
      }
    }

    for (const snapshot of this.historyDiagnostics.values()) {
      if (
        normalizeHistoryDiagnosticsSessionId(snapshot.sessionId) !==
          expectedSessionId ||
        snapshot.timeframeMinutes !== timeframeMinutes ||
        !ohlcSymbolsMatch(snapshot.symbol, symbol)
      ) {
        continue;
      }

      return this._cloneHistoryDiagnostics(snapshot);
    }

    return undefined;
  }

  public addOhlcHistoryMetadataListener(
    listener: OhlcHistoryMetadataCallback,
  ): () => void {
    this.historyMetadataListeners.add(listener);

    return () => {
      this.historyMetadataListeners.delete(listener);
    };
  }

  public addOhlcHistoryDiagnosticsListener(
    listener: OhlcHistoryDiagnosticsCallback,
  ): () => void {
    this.historyDiagnosticsListeners.add(listener);

    return () => {
      this.historyDiagnosticsListeners.delete(listener);
    };
  }

  private async _loadHistoryFromLiveClient(
    symbol: string,
    timeframeMinutes: number,
    requestLimit: number,
    range: HistoryRequestRange,
    key: SubKey,
    bucketMs: number,
  ): Promise<OHLCBar[] | null> {
    if (!this.hasLiveClient()) {
      return null;
    }

    void this._sendSubscribe(symbol, timeframeMinutes);

    if (range.cacheOnly) {
      return this._selectStoredHistoryForRequest(key, requestLimit, range);
    }

    // When a backfill just completed (ohlc_history_refreshed with status='ready'), bars are being
    // ingested asynchronously. Wait briefly for them to appear in local history to avoid a
    // redundant server round-trip.
    const backfillMeta = this.historyMetadata.get(key);
    if (
      range.cacheFirst !== false &&
      backfillMeta?.event === 'ohlc_history_refreshed' &&
      backfillMeta?.status?.toLowerCase() === 'ready'
    ) {
      const backfillHistory = await this._waitForLocalHistory(key, 2000, requestLimit, range, true);
      if (backfillHistory.length > 0) {
        return backfillHistory;
      }
    }

    const serverHistory = await this._requestServerHistory(
      symbol,
      timeframeMinutes,
      requestLimit,
      range,
    );
    if (serverHistory && serverHistory.length > 0) {
      this._mergeHistory(key, serverHistory, bucketMs, range, { barsAlreadyFiltered: true });


      // Tail-gap fill: if the last history bar is 2+ buckets behind now, silently
      // fetch the missing bars in the background so the chart has no gap on first paint.
      // Cap at 2880 buckets (2 days of M1) — covers overnight + weekend gaps.
      // Only fires for "latest" (initial-load) requests with no explicit time bounds.
      const isLatestRequest = !range.fromUnixMs && !range.toUnixMs && !range.beforeUnixMs;
      if (isLatestRequest && !this._tailGapFillKeys.has(key)) {
        const lastHistoryBarMs = serverHistory.reduce<number>(
          (max, b) => Math.max(max, b.time),
          0,
        );
        if (lastHistoryBarMs > 0) {
          const nowMs = Date.now();
          const missingBuckets = Math.floor((nowMs - lastHistoryBarMs) / bucketMs) - 1;
          if (missingBuckets >= 2 && missingBuckets <= 2880) {
            this._tailGapFillKeys.add(key);
            this._fillTailGap(symbol, timeframeMinutes, key, bucketMs, lastHistoryBarMs, missingBuckets)
              .finally(() => {
                setTimeout(() => this._tailGapFillKeys.delete(key), 30_000);
              });
          }
        }
      }

      return this._selectHistoryForRequest(key, requestLimit, range);
    }

    return range.cacheFirst === false
      ? []
      : this._selectStoredHistoryForRequest(key, requestLimit, range);
  }

  private async _fillTailGap(
    symbol: string,
    timeframeMinutes: number,
    key: SubKey,
    bucketMs: number,
    lastHistoryBarMs: number,
    missingBuckets: number,
  ): Promise<void> {
    // Fill in passes of up to 1500 bars each so large overnight/weekend gaps
    // (e.g. 989 M1 bars = 16h) are covered without hitting the server limit.
    const PASS_SIZE = 1500;
    let fromMs = lastHistoryBarMs;
    let remaining = missingBuckets + 5;

    try {
      let filledAny = false;
      while (remaining > 0) {
        const fillLimit = Math.min(remaining, PASS_SIZE);
        const fillRange: HistoryRequestRange = { fromUnixMs: fromMs, cacheFirst: false };
        const fillBars = await this._requestServerHistory(symbol, timeframeMinutes, fillLimit, fillRange);
        if (!fillBars || fillBars.length === 0) break;
        this._mergeHistory(key, fillBars, bucketMs, fillRange, { notifySubscribers: true });
        filledAny = true;
        const latestFilledMs = fillBars.reduce<number>((max, b) => Math.max(max, b.time), fromMs);
        if (latestFilledMs <= fromMs) break; // no progress — stop
        fromMs = latestFilledMs;
        remaining -= fillBars.length;
        // Small yield between passes to avoid blocking the event loop
        await new Promise<void>((r) => setTimeout(r, 200));
      }
      if (filledAny) {
        const metadata = this.historyMetadata.get(key) || {
          symbol,
          timeframeMinutes,
          event: 'ohlc_history_refreshed',
          status: 'ready',
          historySparse: false,
          historyGapped: false,
          managerFetchDeferred: false,
        };
        this._rememberHistoryMetadata(symbol, timeframeMinutes, {
          ...metadata,
          event: 'ohlc_history_refreshed',
          status: 'ready',
        });
      }
    } catch {
      // best-effort; silently ignore
    }
  }

  // After initial history loads, scan bars for internal gaps > GAP_THRESHOLD buckets
  // (e.g. >30 missing M1 bars = >30 minutes gap). For each gap, request the missing
  // range from the server so the chart is truly continuous.
  public detectAndFillInternalGaps(
    symbol: string,
    timeframeMinutes: number,
  ): void {
    const key = makeSubKey(symbol, timeframeMinutes);
    const fillKey = `gap:${key}`;
    if (this._tailGapFillKeys.has(fillKey)) return;
    const bars = this._getStoredHistory(key);
    if (!bars || bars.length < 2) return;
    const bucketMs = timeframeMinutes * 60 * 1000;
    // Only fill gaps larger than 60 buckets (1 hour for M1) — weekend/off-hours data
    // sparsity (1-5 missing bars) is normal market behaviour and should not trigger fills.
    const GAP_THRESHOLD_BUCKETS = 60;
    const MAX_GAP_BUCKETS = 10000;    // don't try to fill gaps > 7 days

    const sorted = [...bars].sort((a, b) => a.time - b.time);
    const gaps: Array<{ fromMs: number; toMs: number; buckets: number }> = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const missing = Math.floor((curr.time - prev.time) / bucketMs) - 1;
      if (missing >= GAP_THRESHOLD_BUCKETS && missing <= MAX_GAP_BUCKETS) {
        gaps.push({ fromMs: prev.time, toMs: curr.time, buckets: missing });
      }
    }
    if (gaps.length === 0) return;

    this._tailGapFillKeys.add(fillKey);
    void this._fillInternalGaps(symbol, timeframeMinutes, key, bucketMs, gaps).finally(() => {
      setTimeout(() => this._tailGapFillKeys.delete(fillKey), 30_000);
    });
  }

  private async _fillInternalGaps(
    symbol: string,
    timeframeMinutes: number,
    key: SubKey,
    bucketMs: number,
    gaps: Array<{ fromMs: number; toMs: number; buckets: number }>,
  ): Promise<void> {
    let filledAny = false;
    const PASS_SIZE = 200;
    for (const gap of gaps) {
      try {
        let fromMs = gap.fromMs;
        let remaining = gap.buckets + 10;
        while (remaining > 0) {
          const fillLimit = Math.min(remaining, PASS_SIZE);
          const fillRange: HistoryRequestRange = {
            fromUnixMs: fromMs,
            toUnixMs: gap.toMs,
            cacheFirst: false,
          };
          const fillBars = await this._requestServerHistory(
            symbol, timeframeMinutes, fillLimit, fillRange,
          );
          if (!fillBars || fillBars.length === 0) break;
          this._mergeHistory(key, fillBars, bucketMs, fillRange, { notifySubscribers: true });
          filledAny = true;
          const latestFilledMs = fillBars.reduce<number>((max, b) => Math.max(max, b.time), fromMs);
          fromMs = latestFilledMs;
          remaining -= fillBars.length;
          // Yield between passes to ensure the C++ backend can serve concurrent trades
          await new Promise<void>((r) => setTimeout(r, 1000));
        }
      } catch {
        // best-effort
      }
    }
    if (filledAny) {
      const metadata = this.historyMetadata.get(key) || {
        symbol,
        timeframeMinutes,
        event: 'ohlc_history_refreshed',
        status: 'ready',
        historySparse: false,
        historyGapped: false,
        managerFetchDeferred: false,
      };
      this._rememberHistoryMetadata(symbol, timeframeMinutes, {
        ...metadata,
        event: 'ohlc_history_refreshed',
        status: 'ready',
      });
    }
  }

  private async _loadHistory(
    symbol: string,
    timeframeMinutes: number,
    requestLimit: number,
    range: HistoryRequestRange,
    key: SubKey,
    bucketMs: number,
  ): Promise<OHLCBar[]> {
    const requestSessionId = this.sessionId;
    const requestClient = this.wsClient;
    const requestClientGeneration = this.clientAttachGeneration;

    this._rememberHistoryRequestDiagnostics(
      symbol,
      timeframeMinutes,
      requestLimit,
      range,
      'pending',
      'OHLC history request queued by chart.',
    );

    const liveHistory = await this._loadHistoryFromLiveClient(
      symbol,
      timeframeMinutes,
      requestLimit,
      range,
      key,
      bucketMs,
    );
    if (
      requestClient &&
      !this._isClientRequestCurrent(
        requestSessionId,
        requestClient,
        requestClientGeneration,
      )
    ) {
      return [];
    }

    if (liveHistory && liveHistory.length > 0) {
      return liveHistory;
    }

    const canUseLocalHistoryFallback = range.cacheFirst !== false;
    if (canUseLocalHistoryFallback && this._seedLocalHistoryFromRawCache(key)) {
      return this._selectCommittedHistoryForRequest(key, requestLimit, range);
    }

    if (canUseLocalHistoryFallback) {
      const committedLocal = this._selectCommittedHistoryForRequest(key, requestLimit, range);
      if (committedLocal.length > 0) {
        return committedLocal;
      }
    }

    // Seed current bar for subscribers; don't return as history when live client present -
    // it is an in-progress live candle, not completed history.
    this._seedCurrentBarFromLatestTick(key, { allowWithHistory: true }) ||
      this._seedCurrentBarFromStorePrice(key, { allowWithHistory: true });

    if (canUseLocalHistoryFallback && !this.hasLiveClient()) {
      const local = range.cacheOnly
        ? this._selectStoredHistoryForRequest(key, requestLimit, range)
        : this._selectHistoryForRequest(key, requestLimit, range);
      if (local.length > 0) {
        return local;
      }
    }

    if (!this.hasLiveClient() && await this._waitForLiveClientAttached(HISTORY_CLIENT_ATTACH_WAIT_MS)) {
      const retryLiveHistory = await this._loadHistoryFromLiveClient(
        symbol,
        timeframeMinutes,
        requestLimit,
        range,
        key,
        bucketMs,
      );
      if (retryLiveHistory && retryLiveHistory.length > 0) {
        return retryLiveHistory;
      }

      if (canUseLocalHistoryFallback) {
        const localAfterAttach = range.cacheOnly
          ? this._selectStoredHistoryForRequest(key, requestLimit, range)
          : this._selectHistoryForRequest(key, requestLimit, range);
        if (range.cacheOnly || localAfterAttach.length > 0) {
          return localAfterAttach;
        }
      }
    }

    if (range.cacheOnly && canUseLocalHistoryFallback) {
      return [];
    }

    if (this.hasLiveClient()) {
      const pendingMetadata = this.getHistoryMetadata(symbol, timeframeMinutes);
      const pendingDiagnostics = this.getHistoryDiagnostics(symbol, timeframeMinutes);
      const historyRequestStillPending =
        historyMetadataIndicatesPendingOrDeferred(pendingMetadata) ||
        historyDiagnosticsIndicatesPendingOrDeferred(pendingDiagnostics);

      // For get_before pagination, 0 bars usually means we've reached the beginning of
      // available history. Keep deferred/pending backfills retryable instead of stamping
      // them as definitive empties and overwriting the authoritative server metadata.
      if (range.requestType === 'get_before' || range.beforeUnixMs !== undefined) {
        if (historyRequestStillPending) {
          return [];
        }

        this._rememberHistoryRequestDiagnostics(
          symbol,
          timeframeMinutes,
          requestLimit,
          range,
          'empty',
          'No older OHLC bars available before requested timestamp.',
        );
        return [];
      }

      if (historyRequestStillPending) {
        if (
          canUseLocalHistoryFallback &&
          (isSemanticLatestHistoryRange(range) || range.bypassPendingLatest === true)
        ) {
          const committedPendingFallback =
            this._selectCommittedHistoryForPendingLatestFallback(
              key,
              requestLimit,
              range,
            );
          if (committedPendingFallback.length > 0) {
            return committedPendingFallback;
          }
        }

        return [];
      }

      this._rememberHistoryRequestDiagnostics(
        symbol,
        timeframeMinutes,
        requestLimit,
        range,
        'empty',
        'OHLC history request completed without candles.',
      );
      throw new Error('OHLC history not available yet');
    }

    this._rememberHistoryRequestDiagnostics(
      symbol,
      timeframeMinutes,
      requestLimit,
      range,
      'not_ready',
      'No authenticated realtime client was attached for OHLC history.',
    );
    throw new Error('No live OHLC session is connected');
  }

  public disconnect() {
    this._stopSimulation();
    this._clearBucketExpiryTimer();
    this.detachOhlcListener?.();
    this.detachOhlcListener = null;
    this.detachOhlcHistoryMetadataListener?.();
    this.detachOhlcHistoryMetadataListener = null;
    this.wsClient = null;
    this.sessionId = null;
    this._clearStorePriceSubscriptions();
    this.subscribers.clear();
    this._clearSessionScopedState();
  }

  private _clearSessionScopedState(clearHistoryCache = true) {
    this.clientAttachGeneration += 1;
    this.subscribedKeys.clear();
    this.pendingSubscribeRequests.clear();
    this.pendingSubscribeAliases.clear();
    this.pendingHistoryRequests.clear();
    this.pendingHistoryPayloadRequests.clear();
    this.recentHistoryRequestResults.clear();
    this.backgroundHistoryRefreshGeneration += 1;
    this.backgroundHistoryRefreshes.clear();
    this.backgroundHistoryRefreshQueue = [];
    this.backgroundHistoryRefreshPumpActive = false;
    this.backgroundHistoryRefreshLastStartedAt = 0;
    this.pendingClientAttachWaits.clear();
    this.resolvedRequestSymbols.clear();
    this.latestTicks.clear();
    this.rawOhlcHistory.clear();
    this.ohlcSanityReferences.clear();
    this.ohlcSanityRejectedLogKeys.clear();
    this.ohlcSanityRejectionWarningBudgets.clear();
    this.liveAggregateAnchoredSpikeBaselines.clear();
    this.currentBars.clear();
    this.currentBarLatestTickMs.clear();
    this._rebuildSubscriberKeyIndex();
    if (clearHistoryCache) {
      // Full clear: account switched — wipe history so stale data from the
      // previous account is never shown on the new account's charts.
      this.history.clear();
      this.historyMetadata.clear();
      this.historyDiagnostics.clear();
    }
    // When clearHistoryCache=false (reconnect, same account), we preserve
    // this.history / historyMetadata / historyDiagnostics so the chart
    // keeps showing bars while the WS reconnects — no loading spinner.
  }

  private _getPreferredStoreClient(
    state: WebtraderStoreSnapshot = useWebtraderStore.getState(),
  ): WebSocketTradingClient | null {
    if (isReadyOhlcClient(state.ohlcWsClient)) {
      return state.ohlcWsClient;
    }

    if (isReadyOhlcClient(state.wsClient)) {
      return state.wsClient;
    }

    return state.ohlcWsClient ?? state.wsClient ?? null;
  }

  private _resubscribeAll(): void {
    // Force the server to receive subscribe_ohlc for every active subscription.
    // Called when the same WS client instance re-authenticates after a reconnect
    // (the server drops all subscriptions on disconnect, but the client object
    // reference doesn't change so ensureClientAttached() returns early).
    this.subscribedKeys.clear();
    this.pendingSubscribeRequests.clear();
    this.pendingSubscribeAliases.clear();
    for (const key of this.subscribers.keys()) {
      const [symbol, tf] = key.split(':');
      void this._sendSubscribe(symbol, parseInt(tf, 10));
    }
  }

  private ensureClientAttached() {
    const client = this._getPreferredStoreClient();

    if (!isReadyOhlcClient(client)) {
      const attachedClient = this.wsClient;
      const attachedClientSupportsOhlc =
        attachedClient?.supportsOhlcActions === true;
      if (attachedClient && (attachedClient !== client || !attachedClientSupportsOhlc)) {
        this.clientAttachGeneration += 1;
        this.detachOhlcListener?.();
        this.detachOhlcListener = null;
        this.detachOhlcHistoryMetadataListener?.();
        this.detachOhlcHistoryMetadataListener = null;
        this.wsClient = null;
        this.subscribedKeys.clear();
        this.pendingSubscribeRequests.clear();
        this.pendingSubscribeAliases.clear();
        this.pendingHistoryPayloadRequests.clear();
        this.backgroundHistoryRefreshGeneration += 1;
        this.backgroundHistoryRefreshes.clear();
        this.backgroundHistoryRefreshQueue = [];
        this.backgroundHistoryRefreshPumpActive = false;
        this.backgroundHistoryRefreshLastStartedAt = 0;
        this.resolvedRequestSymbols.clear();
        this._rebuildSubscriberKeyIndex();
        this.historyMetadata.clear();
        this.historyDiagnostics.clear();
      }
      return;
    }

    if (this.wsClient === client) {
      return;
    }

    this.detachOhlcListener?.();
    this.detachOhlcHistoryMetadataListener?.();
    this.wsClient = client;
    this.clientAttachGeneration += 1;
    this.subscribedKeys.clear();
    this.pendingSubscribeRequests.clear();
    this.pendingSubscribeAliases.clear();
    this.pendingHistoryPayloadRequests.clear();
    this.backgroundHistoryRefreshGeneration += 1;
    this.backgroundHistoryRefreshes.clear();
    this.backgroundHistoryRefreshQueue = [];
    this.backgroundHistoryRefreshPumpActive = false;
    this.backgroundHistoryRefreshLastStartedAt = 0;
    this.resolvedRequestSymbols.clear();
    this._rebuildSubscriberKeyIndex();
    this.historyMetadata.clear();
    this.historyDiagnostics.clear();
    this.detachOhlcListener = client.addOhlcListener((payload) => {
      const receivedAtMs = Date.now();
      const normalizedBar = normalizeLiveGeneratedBarTimestamp(
        this._normalizeIncomingBar(payload),
        receivedAtMs,
      );
      let matchedSubscriber = false;
      let acceptedSubscriber = false;
      this._forEachMatchingSubscriberKey(
        payload.symbol,
        payload.timeframeMinutes,
        (key) => {
          matchedSubscriber = true;
          acceptedSubscriber = this._ingestBar(key, normalizedBar) || acceptedSubscriber;
        },
      );

      if (acceptedSubscriber) {
        this._rememberRawOhlcBar(
          payload.symbol,
          payload.timeframeMinutes,
          normalizedBar,
          { skipSanity: true },
        );
        return;
      }

      if (!matchedSubscriber) {
        const key = makeSubKey(payload.symbol, payload.timeframeMinutes);
        if (this._acceptOhlcBarForKey(key, normalizedBar, normalizedBar.source ?? 'live_ohlc')) {
          this._rememberRawOhlcBar(
            payload.symbol,
            payload.timeframeMinutes,
            normalizedBar,
            { skipSanity: true },
          );
        }
      }
    });
    this.detachOhlcHistoryMetadataListener =
      client.addOhlcHistoryMetadataListener((metadata) => {
        const timeframeMinutes = Number(metadata.timeframeMinutes);
        const symbol = metadata.symbol ?? metadata.brokerSymbol;
        if (!symbol || !Number.isFinite(timeframeMinutes) || timeframeMinutes <= 0) {
          return;
        }

        const tf = Math.trunc(timeframeMinutes);

        // When ohlc_history_refreshed arrives with bars, merge them directly into local
        // history before notifying metadata listeners. This ensures _waitForLocalHistory
        // finds bars on its first synchronous check instead of waiting 150ms for the
        // per-bar notifyOhlcListeners path to run.
        if (
          metadata.event === 'ohlc_history_refreshed' &&
          metadata.status?.toLowerCase() === 'ready' &&
          Array.isArray(metadata.bars) &&
          metadata.bars.length > 0
        ) {
          const bucketMs = tf * 60 * 1000;
          const refreshKey = makeSubKey(symbol, tf);
          const normalizedBars = this._filterAcceptedHistoryBarsForKey(
            refreshKey,
            this._normalizeBars(
              (metadata.bars as unknown[])
                .map((bar) => this._normalizeIncomingBar(bar))
                .filter((bar) => bar.time > 0 && bar.open > 0 && bar.close > 0),
              bucketMs,
            ),
            'history_refresh',
            bucketMs,
          );
          if (normalizedBars.length > 0) {
            this._mergeHistory(
              refreshKey,
              normalizedBars,
              bucketMs,
              {},
              { notifySubscribers: true, barsAlreadyFiltered: true },
            );
            this._invalidateRecentDeferredHistoryResultsForSymbol(symbol, tf);
          }
        }

        this._rememberHistoryMetadata(
          symbol,
          tf,
          metadata,
          undefined,
          metadata.brokerSymbol ?? metadata.metadata?.brokerSymbol,
          metadata.brokerSymbol ?? metadata.metadata?.brokerSymbol,
        );
      });

    this._stopSimulation();

    for (const key of this.subscribers.keys()) {
      const [symbol, tf] = key.split(':');
      void this._sendSubscribe(symbol, parseInt(tf, 10));
    }
  }

  private hasLiveClient(): boolean {
    return Boolean(this.wsClient?.isConnected && this.wsClient?.isAuthenticated);
  }

  private async _waitForLiveClientAttached(
    timeoutMs = LIVE_CLIENT_ATTACH_WAIT_MS,
  ): Promise<boolean> {
    this.ensureClientAttached();
    if (this.hasLiveClient()) {
      return true;
    }

    const normalizedTimeoutMs = Math.max(0, Math.trunc(timeoutMs));
    const pendingWait = this.pendingClientAttachWaits.get(normalizedTimeoutMs);
    if (pendingWait) {
      return pendingWait;
    }

    const wait = (async () => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < normalizedTimeoutMs) {
        await delay(LIVE_CLIENT_ATTACH_POLL_MS);
        this.ensureClientAttached();
        if (this.hasLiveClient()) {
          return true;
        }
      }

      this.ensureClientAttached();
      return this.hasLiveClient();
    })().finally(() => {
      this.pendingClientAttachWaits.delete(normalizedTimeoutMs);
    });

    this.pendingClientAttachWaits.set(normalizedTimeoutMs, wait);
    return wait;
  }

  private _getRequestSymbols(symbol: string, resolvedSymbol?: string): string[] {
    const trimmed = symbol.trim();
    if (!trimmed) {
      return [];
    }

    const state = useWebtraderStore.getState();
    const brokerSymbols = state.symbols ?? [];
    const prices = state.prices ?? {};

    const matchingBrokerSymbols = brokerSymbols
      .map((brokerSymbol) => brokerSymbol.name?.trim())
      .filter((name): name is string => Boolean(name && ohlcSymbolsMatch(name, trimmed)))
      .sort((left, right) => compareBrokerSymbolVariantSuffixes(left, right));
    const { dominant: dominantBrokerSymbols } =
      splitDominantOhlcRequestCandidates(matchingBrokerSymbols);

    // Outbound OHLC requests should stick to the strongest broker spellings we know
    // so active quote subscriptions do not get pinned to truncated aliases.
    const rankedBrokerSymbols = rankOhlcRequestCandidates(dominantBrokerSymbols, {
      preferredExacts: [trimmed, resolvedSymbol],
      hasLivePrice: (candidate) => {
        const price = findValueBySymbol(prices, candidate);
        return Boolean(price && ((price.bid ?? 0) > 0 || (price.ask ?? 0) > 0));
      },
    });
    if (rankedBrokerSymbols.length > 0) {
      return rankedBrokerSymbols;
    }

    return rankOhlcRequestCandidates(
      [trimmed, resolvedSymbol, ...getOhlcSymbolAliases(trimmed)],
      {
        preferredExacts: [trimmed, resolvedSymbol],
      },
    );
  }

  private _markSubscribedAlias(
    key: SubKey,
    alias: string,
  ) {
    this.subscribedKeys.add(key);
    this.resolvedRequestSymbols.set(key, alias);
    this._indexSubscriberKey(key);
  }

  private _isSubscribeRequestCurrent(
    key: SubKey,
    requestSessionId: string | null,
    requestClient: WebSocketTradingClient | null,
  ): boolean {
    return Boolean(
      this.subscribers.has(key) &&
        this.sessionId === requestSessionId &&
        this.wsClient === requestClient &&
        this.hasLiveClient(),
    );
  }

  private _isClientRequestCurrent(
    requestSessionId: string | null,
    requestClient: WebSocketTradingClient | null,
    requestClientGeneration: number,
  ): boolean {
    return Boolean(
      this.sessionId === requestSessionId &&
        this.wsClient === requestClient &&
        this.clientAttachGeneration === requestClientGeneration &&
        this.hasLiveClient(),
    );
  }

  private async _sendSubscribe(symbol: string, timeframeMinutes: number) {
    this.ensureClientAttached();
    if (!this.hasLiveClient()) {
      return;
    }

    const key = makeSubKey(symbol, timeframeMinutes);
    if (this.subscribedKeys.has(key)) {
      return;
    }

    const pendingRequest = this.pendingSubscribeRequests.get(key);
    if (pendingRequest) {
      return pendingRequest;
    }

    const request = (async () => {
      const requestSessionId = this.sessionId;
      const requestClient = this.wsClient;
      const resolvedSymbol = this.resolvedRequestSymbols.get(key);
      for (const alias of this._getRequestSymbols(symbol, resolvedSymbol)) {
        const pendingAliases =
          this.pendingSubscribeAliases.get(key) ?? new Set<string>();
        pendingAliases.add(alias);
        this.pendingSubscribeAliases.set(key, pendingAliases);
        try {
          await requestClient!.subscribeOhlc(alias, timeframeMinutes);
          if (!this._isSubscribeRequestCurrent(key, requestSessionId, requestClient)) {
            return;
          }
          this._markSubscribedAlias(key, alias);
          return;
        } catch (error) {
          if (isLiveServerUnavailableError(error)) {
            return;
          }
        }
      }
    })().finally(() => {
      this.pendingSubscribeRequests.delete(key);
      this.pendingSubscribeAliases.delete(key);
    });

    this.pendingSubscribeRequests.set(key, request);
    return request;
  }

  private async _sendUnsubscribe(symbol: string, timeframeMinutes: number) {
    this.ensureClientAttached();
    const key = makeSubKey(symbol, timeframeMinutes);
    if (this.subscribers.has(key)) {
      return;
    }

    const resolvedSymbol = this.resolvedRequestSymbols.get(key);
    const pendingAliases = this.pendingSubscribeAliases.get(key);
    this.subscribedKeys.delete(key);
    this.pendingSubscribeRequests.delete(key);
    this.pendingSubscribeAliases.delete(key);
    this.resolvedRequestSymbols.delete(key);
    this._removeSubscriberKeyFromIndex(key);

    if (!this.hasLiveClient()) {
      return;
    }

    const unsubscribeSymbols = [
      ...new Set([
        symbol,
        ...(resolvedSymbol ? [resolvedSymbol] : []),
        ...this._getRequestSymbols(symbol, resolvedSymbol),
        ...(pendingAliases ? [...pendingAliases] : []),
      ]),
    ];
    for (const alias of unsubscribeSymbols) {
      try {
        await this.wsClient!.unsubscribeOhlc(alias, timeframeMinutes);
      } catch {
        // best effort
      }
    }
  }

  private _bucketMsForKey(key: SubKey): number {
    const [, timeframe] = key.split(':');
    return parseInt(timeframe, 10) * 60 * 1000;
  }

  private _normalizeIncomingBar(bar: any): OHLCBar {
    const source = parseOptionalString(bar.source);
    const basis = parseOptionalString(bar.basis);
    // "rust_realtime" (and mt5_tick) bars are real market data — derived:true on these
    // means "computed from ticks", not "synthetic continuity filler". Don't treat them
    // as continuity bars or the chart will silently drop every live Rust ohlc_bar.
    const isKnownRealSource =
      bar.cached === true ||
      isLiveGeneratedSource(source) ||
      isHistoricalOhlcSource(source);
    const continuity =
      bar.isContinuity === true ||
      bar.continuity === true ||
      (!isKnownRealSource && bar.derived === true) ||
      isContinuitySource(source) ||
      isPriorRealCloseBasis(basis);

    return {
      time: bar.openTimeMs !== undefined || bar.open_time_ms !== undefined
        ? sanitizeTimestamp(bar.openTimeMs ?? bar.open_time_ms)
        : bar.timeMs !== undefined || bar.time_msc !== undefined
          ? sanitizeTimestamp(bar.timeMs ?? bar.time_msc)
          : sanitizeGenericBarTime(bar.time),
      open: Number(bar.open) || 0,
      high: Number(bar.high) || 0,
      low: Number(bar.low) || 0,
      close: Number(bar.close) || 0,
      volume: firstPositiveFiniteNumber(
        bar.volume,
        bar.tick_volume,
        bar.tickVolume,
        bar.real_volume,
        bar.realVolume,
        bar.volume_real,
        bar.volumeReal,
      ),
      symbol: parseOptionalString(bar.symbol),
      timeframeMinutes: normalizeOptionalInteger(
        bar.timeframeMinutes ?? bar.timeframe_minutes ?? bar.timeframe,
      ),
      source,
      derived: (!isKnownRealSource && bar.derived === true) ? true : continuity ? true : undefined,
      continuity: continuity ? true : undefined,
      isContinuity: continuity ? true : undefined,
      basis,
      synthetic: continuity ? true : bar.synthetic === true ? true : undefined,
      sourceTimeMs: getExplicitCanonicalIncomingBarTime(bar) ?? undefined,
      cached:
        bar.cached === true || source === 'continuity_cache'
          ? true
          : undefined,
      closed: bar.closed === true ? true : undefined,
    };
  }

  private _getSubscriberIndexAliases(
    symbol: string,
    resolvedSymbol?: string,
  ): Set<string> {
    const aliases = new Set<string>();
    const addNormalized = (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return;
      }

      const normalized = normalizeSymbolKey(trimmed);
      if (normalized) {
        aliases.add(normalized);
      }

      const canonical = getCanonicalSymbol(trimmed);
      if (canonical) {
        aliases.add(canonical);
      }
    };
    const addSymbol = (value?: string | null) => {
      const trimmed = value?.trim();
      if (!trimmed) {
        return;
      }

      addNormalized(trimmed);
      for (const alias of getOhlcSymbolAliases(trimmed)) {
        addNormalized(alias);
      }
      for (const alias of getOhlcIngressAliasesForSubscriberSymbol(trimmed)) {
        addNormalized(alias);
      }
    };

    addSymbol(symbol);
    addSymbol(resolvedSymbol);
    return aliases;
  }

  private _removeSubscriberKeyFromIndex(key: SubKey) {
    const aliases = this.subscriberKeyIndexAliases.get(key);
    if (!aliases) {
      return;
    }

    for (const alias of aliases) {
      const keys = this.subscriberKeyIndex.get(alias);
      if (!keys) {
        continue;
      }

      keys.delete(key);
      if (keys.size === 0) {
        this.subscriberKeyIndex.delete(alias);
      }
    }

    this.subscriberKeyIndexAliases.delete(key);
  }

  private _indexSubscriberKey(key: SubKey) {
    this._removeSubscriberKeyFromIndex(key);
    if (!this.subscribers.has(key)) {
      return;
    }

    const separatorIndex = key.lastIndexOf(':');
    if (separatorIndex <= 0) {
      return;
    }

    const symbol = key.slice(0, separatorIndex);
    const resolvedSymbol = this.resolvedRequestSymbols.get(key);
    const aliases = this._getSubscriberIndexAliases(symbol, resolvedSymbol);
    if (aliases.size === 0) {
      return;
    }

    this.subscriberKeyIndexAliases.set(key, aliases);
    for (const alias of aliases) {
      let keys = this.subscriberKeyIndex.get(alias);
      if (!keys) {
        keys = new Set();
        this.subscriberKeyIndex.set(alias, keys);
      }
      keys.add(key);
    }
  }

  private _rebuildSubscriberKeyIndex() {
    this.subscriberKeyIndex.clear();
    this.subscriberKeyIndexAliases.clear();
    for (const key of this.subscribers.keys()) {
      this._indexSubscriberKey(key);
    }
  }

  private _getIndexedSubscriberKeys(
    symbol: string,
    timeframeMinutes: number | null,
  ): SubKey[] {
    if (this.subscriberKeyIndex.size === 0) {
      return [];
    }

    const keys = new Set<SubKey>();
    for (const alias of this._getSubscriberIndexAliases(symbol)) {
      const indexedKeys = this.subscriberKeyIndex.get(alias);
      if (!indexedKeys) {
        continue;
      }

      for (const key of indexedKeys) {
        if (timeframeMinutes !== null) {
          const tf = parseInt(key.slice(key.lastIndexOf(':') + 1), 10);
          if (tf !== timeframeMinutes) {
            continue;
          }
        }

        keys.add(key);
      }
    }

    return [...keys];
  }

  private _forEachMatchingSubscriberKey(
    symbol: string,
    timeframeMinutes: number | null,
    callback: (key: SubKey) => void,
    options: { allowIngressAliases?: boolean } = {},
  ) {
    const visitedKeys = new Set<SubKey>();
    const visitKey = (key: SubKey): boolean => {
      if (visitedKeys.has(key)) {
        return false;
      }
      visitedKeys.add(key);

      const separatorIndex = key.lastIndexOf(':');
      if (separatorIndex <= 0) {
        return false;
      }

      const subscriberSymbol = key.slice(0, separatorIndex);
      const tfStr = key.slice(separatorIndex + 1);
      if (timeframeMinutes !== null && parseInt(tfStr, 10) !== timeframeMinutes) {
        return false;
      }

      if (!ohlcSubscriberSymbolsMatch(subscriberSymbol, symbol, options)) {
        return false;
      }

      callback(key);
      return true;
    };

    let matchedIndexedKey = false;
    for (const key of this._getIndexedSubscriberKeys(symbol, timeframeMinutes)) {
      matchedIndexedKey = visitKey(key) || matchedIndexedKey;
    }

    if (matchedIndexedKey) {
      return;
    }

    this.subscribers.forEach((_, key) => {
      visitKey(key);
    });
  }

  private _getRawOhlcAliasKeys(symbol: string, timeframeMinutes: number): SubKey[] {
    const keys = new Set<SubKey>();

    for (const alias of [symbol, ...getOhlcSymbolAliases(symbol)]) {
      const key = makeRawOhlcCacheKey(alias, timeframeMinutes);
      if (key) {
        keys.add(key);
      }
    }

    return [...keys];
  }

  private _symbolFromKey(key: SubKey): string {
    const separatorIndex = key.lastIndexOf(':');
    return separatorIndex > 0 ? key.slice(0, separatorIndex) : key;
  }

  private _timeframeMinutesFromKey(key: SubKey): number | null {
    const separatorIndex = key.lastIndexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }

    const timeframe = normalizeOptionalInteger(key.slice(separatorIndex + 1));
    return timeframe && timeframe > 0 ? timeframe : null;
  }

  private _resolvedSymbolForKey(key: SubKey): string | null {
    return this.resolvedRequestSymbols.get(key) ?? null;
  }

  private _getOhlcSanityReferenceKeyForKey(key: SubKey): string {
    return getOhlcSanityReferenceKey(
      this._symbolFromKey(key),
      this._timeframeMinutesFromKey(key),
      this._resolvedSymbolForKey(key),
    );
  }

  private _rememberOhlcSanityReference(symbol: string, bar: OHLCBar): void {
    const referenceKey = getOhlcSanityReferenceKey(symbol);
    if (!referenceKey) {
      return;
    }

    const nextReference = updateOhlcSanityReference(
      this.ohlcSanityReferences.get(referenceKey),
      bar,
    );
    if (nextReference) {
      this.ohlcSanityReferences.set(referenceKey, nextReference);
    }
  }

  private _rememberOhlcSanityReferenceForKey(key: SubKey, bar: OHLCBar): void {
    const referenceKey = this._getOhlcSanityReferenceKeyForKey(key);
    if (!referenceKey) {
      return;
    }

    const nextReference = updateOhlcSanityReference(
      this.ohlcSanityReferences.get(referenceKey),
      bar,
    );
    if (nextReference) {
      this.ohlcSanityReferences.set(referenceKey, nextReference);
    }
  }

  private _getOhlcSanityReferenceForSymbol(
    symbol: string,
  ): OhlcSanityReference | undefined {
    const referenceKey = getOhlcSanityReferenceKey(symbol);
    return referenceKey
      ? this.ohlcSanityReferences.get(referenceKey)
      : undefined;
  }

  private _getOhlcSanityReferenceForKey(
    key: SubKey,
  ): OhlcSanityReference | undefined {
    const referenceKey = this._getOhlcSanityReferenceKeyForKey(key);
    return referenceKey
      ? this.ohlcSanityReferences.get(referenceKey)
      : undefined;
  }

  private _getLocalOhlcSanityReferenceForKey(
    key: SubKey,
    bar?: OHLCBar,
  ): OhlcSanityReference | undefined {
    const storedReference = this._getOhlcSanityReferenceForKey(key);
    if (storedReference) {
      return storedReference;
    }

    const barTime = bar ? getOhlcSanityBarTime(bar) : 0;
    const history = this.history.get(key) ?? [];
    const candidates = [
      this.currentBars.get(key),
      history.length > 0 ? history[history.length - 1] : undefined,
    ];

    for (const candidate of candidates) {
      if (
        !candidate ||
        isContinuityBar(candidate) ||
        !isValidOhlcSanityPrice(candidate.close)
      ) {
        continue;
      }

      const candidateTime = getOhlcSanityBarTime(candidate);
      if (barTime > 0 && candidateTime > 0 && candidateTime > barTime) {
        continue;
      }

      return {
        close: candidate.close,
        time: candidateTime > 0 ? candidateTime : barTime,
      };
    }

    return undefined;
  }

  private _evaluateOhlcBarForSymbol(
    symbol: string,
    bar: OHLCBar,
    source: string,
    referenceClose: number | null | undefined,
    options: OhlcSanityEvaluationOptions = {},
  ): boolean {
    const decision = evaluateOhlcBarSanity(symbol, bar, referenceClose, options);

    if (!decision.accepted) {
      this._logOhlcSanityRejection(symbol, bar, source, decision);
      return false;
    }

    return true;
  }

  private _acceptOhlcBarForSymbol(
    symbol: string,
    bar: OHLCBar,
    source: string,
    options: OhlcSanityEvaluationOptions = {},
  ): boolean {
    const reference = this._getOhlcSanityReferenceForSymbol(symbol);

    // Stale-reference bypass: if we have a reference but it's more than 10 minutes
    // older than the incoming bar, the market has had time to move significantly
    // (weekend open, news event, overnight gap, gateway restart).
    // In this case: reset the reference and accept the bar if the basic OHLC
    // structure is sound.
    const STALE_REFERENCE_GAP_MS = 10 * 60 * 1000; // 10 minutes
    if (reference) {
      const barTime = getOhlcSanityBarTime(bar);
      if (barTime > 0 && reference.time > 0 && barTime - reference.time > STALE_REFERENCE_GAP_MS) {
        // Reference is stale — accept this bar and use it as the new reference
        const structureDecision = evaluateOhlcStructureAndDomainSanity(
          symbol,
          bar,
          reference.close,
        );
        if (!structureDecision.accepted) {
          this._logOhlcSanityRejection(symbol, bar, source, structureDecision);
          return false;
        }

        this._rememberOhlcSanityReference(symbol, bar);
        return true;
      }
    }

    if (
      !this._evaluateOhlcBarForSymbol(
        symbol,
        bar,
        source,
        reference?.close,
        options,
      )
    ) {
      return false;
    }

    this._rememberOhlcSanityReference(symbol, bar);
    return true;

  }

  private _getLiveAggregateAnchoredSpikeDecision(
    key: SubKey,
    bar: OHLCBar,
    referenceClose?: number | null,
  ): OhlcSanityDecision | null {
    const symbol = this._symbolFromKey(key);
    const reference = referenceClose === undefined
      ? this._getLocalOhlcSanityReferenceForKey(key, bar)?.close
      : referenceClose;
    const liveDecision = evaluateOhlcBarSanity(symbol, bar, reference);
    if (!liveDecision.accepted) {
      return null;
    }

    const anchoredDecision = evaluateOhlcBarSanity(symbol, bar, reference, {
      rejectAnchoredCloseSpike: true,
    });
    if (
      !anchoredDecision.accepted &&
      isAnchoredCloseSpikeReason(anchoredDecision.reason)
    ) {
      return anchoredDecision;
    }

    return isValidOhlcSanityReference(reference)
      ? getOhlcChronologicalIsolatedSpikeDecision(symbol, bar, reference)
      : null;
  }

  private _rememberLiveAggregateAnchoredSpikeBaseline(
    key: SubKey,
    bar: OHLCBar,
    baseline: OHLCBar,
    referenceClose?: number | null,
  ): void {
    const decision = this._getLiveAggregateAnchoredSpikeDecision(
      key,
      bar,
      referenceClose,
    );
    if (!decision || !isValidOhlcSanityReference(decision.referenceClose)) {
      this.liveAggregateAnchoredSpikeBaselines.delete(key);
      return;
    }

    if (this.liveAggregateAnchoredSpikeBaselines.has(key)) {
      return;
    }

    this.liveAggregateAnchoredSpikeBaselines.set(key, {
      bar: { ...baseline },
      referenceClose: decision.referenceClose,
    });
  }

  private _getConfirmedLiveAggregateSpikeDecision(
    key: SubKey,
    bar: OHLCBar,
  ): OhlcSanityDecision | null {
    const baseline = this.liveAggregateAnchoredSpikeBaselines.get(key);
    if (!baseline) {
      return null;
    }

    const symbol = this._symbolFromKey(key);
    const decision = evaluateOhlcBarSanity(symbol, bar, baseline.referenceClose);
    if (!decision.accepted && isChronologicalNeighborSpikeReason(decision.reason)) {
      return decision;
    }

    return getOhlcChronologicalIsolatedSpikeDecision(
      symbol,
      bar,
      baseline.referenceClose,
    );
  }

  private _buildLiveAggregateRecoveredBar(
    baseline: OHLCBar,
    price: number,
    tickVolumeUnit: number,
    source: string,
  ): OHLCBar {
    return {
      ...baseline,
      high: Math.max(baseline.high, price),
      low: Math.min(baseline.low, price),
      close: price,
      volume: baseline.volume + tickVolumeUnit,
      source,
      derived: undefined,
      continuity: undefined,
      isContinuity: undefined,
      basis: undefined,
      cached: undefined,
      closed: undefined,
    };
  }

  private _logOhlcSanityRejection(
    symbol: string,
    bar: OHLCBar,
    source: string,
    decision: OhlcSanityDecision,
  ): void {
    const logKey = makeOhlcSanityRejectionLogKey(symbol, bar, decision);
    if (!rememberOhlcSanityRejectedLogKey(this.ohlcSanityRejectedLogKeys, logKey)) {
      return;
    }

    const effectiveSource = bar.source ?? source;
    const disposition = getOhlcSanityRejectionWarningDisposition(
      this.ohlcSanityRejectionWarningBudgets,
      symbol,
      effectiveSource,
      decision,
    );
    if (disposition === 'emit') {
      logOhlcSanityRejection({
        symbol,
        source,
        bar,
        decision,
        context: 'ohlcWebSocketService',
      });
    } else if (disposition === 'emit_suppression_notice') {
      logOhlcSanityRejectionSuppression({
        symbol,
        source: effectiveSource,
        decision,
        context: 'ohlcWebSocketService',
      });
    }
  }

  private _acceptOhlcBarForKey(
    key: SubKey,
    bar: OHLCBar,
    source: string,
    options: OhlcSanityEvaluationOptions = {},
  ): boolean {
    const reference = this._getLocalOhlcSanityReferenceForKey(key, bar);
    const symbol = this._symbolFromKey(key);

    // Stale-reference bypass: if the key-scoped reference is too old, start a
    // fresh baseline for this symbol/timeframe instead of rejecting real gaps.
    if (isOhlcSanityReferenceStaleForBar(reference, bar, { bucketMs: this._bucketMsForKey(key) })) {
      const structureDecision = evaluateOhlcStructureAndDomainSanity(
        symbol,
        bar,
        reference?.close,
      );
      if (!structureDecision.accepted) {
        this._logOhlcSanityRejection(symbol, bar, source, structureDecision);
        return false;
      }

      this._rememberOhlcSanityReferenceForKey(key, bar);
      return true;
    }

    if (
      !this._evaluateOhlcBarForSymbol(
        symbol,
        bar,
        source,
        reference?.close,
        options,
      )
    ) {
      return false;
    }

    this._rememberOhlcSanityReferenceForKey(key, bar);
    return true;
  }

  private _filterAcceptedHistoryBarsForSymbol(
    symbol: string,
    bars: OHLCBar[],
    source: string,
    bucketMs?: number,
    initialReference: OhlcSanityReference | null | undefined =
      this._getOhlcSanityReferenceForSymbol(symbol),
  ): OHLCBar[] {
    return filterChronologicalOhlcBarsBySanity(symbol, bars, {
      bucketMs,
      initialReference,
      onRejected: (bar, decision) =>
        this._logOhlcSanityRejection(symbol, bar, source, decision),
      onAccepted: (bar) => this._rememberOhlcSanityReference(symbol, bar),
    });
  }

  private _filterAcceptedHistoryBarsForKey(
    key: SubKey,
    bars: OHLCBar[],
    source: string,
    bucketMs?: number,
    initialReference?: OhlcSanityReference | null,
  ): OHLCBar[] {
    const symbol = this._symbolFromKey(key);
    return filterChronologicalOhlcBarsBySanity(symbol, bars, {
      bucketMs,
      initialReference:
        initialReference === undefined
          ? this._getOhlcSanityReferenceForKey(key)
          : initialReference,
      onRejected: (bar, decision) =>
        this._logOhlcSanityRejection(symbol, bar, source, decision),
      onAccepted: (bar) => this._rememberOhlcSanityReferenceForKey(key, bar),
    });
  }

  private _findBarIndexByTime(history: OHLCBar[], time: number): number {
    let low = 0;
    let high = history.length - 1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const middleTime = history[middle].time;
      if (middleTime === time) {
        return middle;
      }
      if (middleTime < time) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return ~low;
  }

  private _upsertSortedBar(
    history: OHLCBar[],
    bar: OHLCBar,
    limit = MAX_NORMALIZED_OHLC_BARS,
    bucketMs?: number,
  ): OHLCBar {
    const index = this._findBarIndexByTime(history, bar.time);
    let storedBar: OHLCBar;

    if (index >= 0) {
      storedBar = preferRealBar(history[index], bar, bucketMs);
      history[index] = storedBar;
    } else {
      storedBar = { ...bar };
      history.splice(~index, 0, storedBar);
    }

    if (history.length > limit && limit === MAX_NORMALIZED_OHLC_BARS) {
      const limitedHistory = this._limitBarsPreservingRealHistory(history);
      history.splice(0, history.length, ...limitedHistory);
    } else if (history.length > limit) {
      history.splice(0, history.length - limit);
    }

    return storedBar;
  }

  private _upsertBarsIntoHistory(
    key: SubKey,
    bars: OHLCBar[],
    limit = MAX_NORMALIZED_OHLC_BARS,
  ): OHLCBar[] {
    const history = this.history.get(key) ?? [];
    const bucketMs = this._bucketMsForKey(key);

    for (const bar of bars) {
      this._upsertSortedBar(history, bar, limit, bucketMs);
    }

    if (!this.history.has(key)) {
      this.history.set(key, history);
    }

    return history;
  }

  private _rememberRawOhlcBar(
    symbol: string,
    timeframeMinutes: number,
    bar: OHLCBar,
    options: { skipSanity?: boolean } = {},
  ) {
    const bucketMs = timeframeMinutes * 60 * 1000;
    if (!symbol.trim() || bucketMs <= 0) {
      return;
    }

    const sourceTimeMs = getCanonicalIncomingBarTime(bar);
    const bucketedBar = {
      ...bar,
      sourceTimeMs: bar.sourceTimeMs ?? sourceTimeMs,
      time: bucketTime(sourceTimeMs, bucketMs),
    };
    if (
      !options.skipSanity &&
      !this._acceptOhlcBarForSymbol(symbol, bucketedBar, bucketedBar.source ?? 'raw_ohlc')
    ) {
      return;
    }

    for (const key of this._getRawOhlcAliasKeys(symbol, timeframeMinutes)) {
      const existing = this.rawOhlcHistory.get(key);
      const history = existing ?? [];
      this._upsertSortedBar(history, bucketedBar, RAW_OHLC_HISTORY_LIMIT, bucketMs);

      if (!existing) {
        this.rawOhlcHistory.set(key, history);
      } else {
        // Refresh insertion order so old inactive alias caches age out first.
        this.rawOhlcHistory.delete(key);
        this.rawOhlcHistory.set(key, history);
      }
    }

    while (this.rawOhlcHistory.size > RAW_OHLC_HISTORY_MAX_KEYS) {
      const oldestKey = this.rawOhlcHistory.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.rawOhlcHistory.delete(oldestKey);
    }
  }

  private _getRawOhlcHistoryForKey(key: SubKey): OHLCBar[] {
    const [symbol, tfStr] = key.split(':');
    const timeframe = parseInt(tfStr, 10);
    const bucketMs = timeframe * 60 * 1000;
    const bars: OHLCBar[] = [];

    if (bucketMs <= 0) {
      return bars;
    }

    for (const rawKey of this._getRawOhlcAliasKeys(symbol, timeframe)) {
      const cached = this.rawOhlcHistory.get(rawKey);
      if (cached) {
        bars.push(...cached);
      }
    }

    return this._normalizeBars(bars, bucketMs);
  }

  private _seedLocalHistoryFromRawCache(key: SubKey): boolean {
    if ((this.history.get(key)?.length ?? 0) > 0) {
      return false;
    }

    const bucketMs = this._bucketMsForKey(key);
    const rawHistory = this._getRawOhlcHistoryForKey(key);
    if (rawHistory.length === 0) {
      return false;
    }

    this.history.set(key, this._normalizeBars(rawHistory, bucketMs));
    return true;
  }

  private _flatBar(time: number, price: number): OHLCBar {
    return {
      time,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
      source: 'client_continuity',
      derived: true,
      continuity: true,
      isContinuity: true,
      synthetic: true,
      basis: 'prior_close',
    };
  }

  private _liveRolloverBar(time: number, price: number, previousBar: OHLCBar): OHLCBar {
    const open = previousBar.close > 0 ? previousBar.close : price;
    return {
      symbol: previousBar.symbol,
      timeframeMinutes: previousBar.timeframeMinutes,
      time,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      close: price,
      // Use one visual tick so flat rollover candles render like a live terminal candle.
      volume: 1,
      source: 'mt5_tick',
      sourceTimeMs: time,
      basis: 'rollover_last_close',
    };
  }

  private _normalizeBars(bars: OHLCBar[], bucketMs: number): OHLCBar[] {
    const byBucketTime = new Map<number, OHLCBar>();

    for (const rawBar of bars) {
      const canonicalTime = getCanonicalIncomingBarTime(rawBar);
      const time = bucketMs > 0 ? bucketTime(canonicalTime, bucketMs) : canonicalTime;
      const bar = { ...rawBar, time, sourceTimeMs: rawBar.sourceTimeMs ?? canonicalTime };
      const existing = byBucketTime.get(time);
      byBucketTime.set(time, preferRealBar(existing, bar, bucketMs));
    }

    const sorted = [...byBucketTime.values()].sort((left, right) => left.time - right.time);
    return this._limitBarsPreservingRealHistory(sorted);
  }

  private _limitBarsPreservingRealHistory(sortedBars: OHLCBar[]): OHLCBar[] {
    if (sortedBars.length <= MAX_NORMALIZED_OHLC_BARS) {
      return sortedBars.map((bar) => ({ ...bar }));
    }

    const selectedByTime = new Map<number, OHLCBar>();
    const realBars = sortedBars
      .filter((bar) => !isContinuityBar(bar))
      .slice(-MAX_NORMALIZED_OHLC_BARS);

    for (const bar of realBars) {
      selectedByTime.set(bar.time, { ...bar });
    }

    const remainingSlots = MAX_NORMALIZED_OHLC_BARS - selectedByTime.size;
    if (remainingSlots > 0) {
      const continuityBars = sortedBars
        .filter((bar) => isContinuityBar(bar) && !selectedByTime.has(bar.time))
        .slice(-remainingSlots);

      for (const bar of continuityBars) {
        selectedByTime.set(bar.time, { ...bar });
      }
    }

    if (selectedByTime.size === 0) {
      return sortedBars.slice(-MAX_NORMALIZED_OHLC_BARS).map((bar) => ({ ...bar }));
    }

    return [...selectedByTime.values()].sort((left, right) => left.time - right.time);
  }

  private _mergeHistory(
    key: SubKey,
    incomingBars: OHLCBar[],
    bucketMs: number,
    range: HistoryRequestRange = {},
    options: HistoryMergeOptions = {},
  ) {
    const mergeKeys = this._getHistoryMergeKeys(key);
    const normalizedBars = this._normalizeBars(incomingBars, bucketMs);
    const initialSanityReference = this._getHistoryMergeInitialSanityReference(
      key,
      normalizedBars,
    );
    const normalizedIncomingBars = options.barsAlreadyFiltered
      ? normalizedBars
      : this._filterAcceptedHistoryBarsForKey(
        key,
        normalizedBars,
        'history',
        bucketMs,
        initialSanityReference,
      );
    const notifyBySubscriberKey = new Map<SubKey, Map<number, OHLCBar>>();
    const baselineHistory = this.history.get(key) ?? [];
    const baselineByTime = new Map(baselineHistory.map((bar) => [bar.time, bar]));

    for (const mergeKey of mergeKeys) {
      this._mergeHistoryIntoKey(
        mergeKey,
        normalizedIncomingBars,
        range,
        options,
        notifyBySubscriberKey,
        baselineByTime,
      );
    }

    if (options.notifySubscribers === false || notifyBySubscriberKey.size === 0) {
      return;
    }

    for (const [subscriberKey, barsByTime] of notifyBySubscriberKey) {
      [...barsByTime.values()]
        .sort((left, right) => left.time - right.time)
        .forEach((bar) => this._notifySubscribers(subscriberKey, bar));
    }
  }

  private _getHistoryMergeInitialSanityReference(
    key: SubKey,
    normalizedBars: OHLCBar[],
  ): OhlcSanityReference | null | undefined {
    const reference = this._getOhlcSanityReferenceForKey(key);
    if (!reference) {
      return undefined;
    }

    const current = this.currentBars.get(key);
    if (
      current &&
      isLiveGeneratedBar(current) &&
      current.time === reference.time &&
      normalizedBars.some(
        (bar) => bar.time === current.time && isHistoricalOhlcBar(bar),
      )
    ) {
      return null;
    }

    return reference;
  }

  private _getHistoryMergeKeys(key: SubKey): SubKey[] {
    const separatorIndex = key.lastIndexOf(':');
    if (separatorIndex <= 0) {
      return [key];
    }

    const symbol = key.slice(0, separatorIndex);
    const timeframeMinutes = parseInt(key.slice(separatorIndex + 1), 10);
    const keys = new Set<SubKey>([key]);

    for (const existingKey of this.history.keys()) {
      const existingSeparatorIndex = existingKey.lastIndexOf(':');
      if (existingSeparatorIndex <= 0) {
        continue;
      }

      const existingTf = parseInt(existingKey.slice(existingSeparatorIndex + 1), 10);
      const existingSymbol = existingKey.slice(0, existingSeparatorIndex);
      if (existingTf === timeframeMinutes && ohlcSymbolsMatchStrict(existingSymbol, symbol)) {
        keys.add(existingKey);
      }
    }

    this._forEachMatchingSubscriberKey(
      symbol,
      timeframeMinutes,
      (subscriberKey) => {
        keys.add(subscriberKey);
      },
      { allowIngressAliases: true },
    );

    return [...keys].sort();
  }

  private _mergeHistoryIntoKey(
    key: SubKey,
    normalizedIncomingBars: OHLCBar[],
    range: HistoryRequestRange = {},
    options: HistoryMergeOptions = {},
    notifyBySubscriberKey: Map<SubKey, Map<number, OHLCBar>>,
    baselineByTime: Map<number, OHLCBar>,
  ) {
    const existingHistory = this.history.get(key) ?? [];
    const current = this.currentBars.get(key);
    const existingByTime = options.notifySubscribers === false
      ? new Map<number, OHLCBar>()
      : existingHistory.length > 0
        ? new Map(existingHistory.map((bar) => [bar.time, bar]))
        : baselineByTime;

    let mergedCurrent: OHLCBar | null = null;
    if (
      current &&
      range.beforeUnixMs === undefined &&
      range.fromUnixMs === undefined &&
      range.toUnixMs === undefined
    ) {
      for (const incomingBar of normalizedIncomingBars) {
        if (incomingBar.time === current.time) {
          mergedCurrent = this._mergeHistoryWithCurrentBar(key, current, incomingBar);
          break;
        }
      }
    }

    this._upsertBarsIntoHistory(key, normalizedIncomingBars);

    if (mergedCurrent && !areBarsEquivalent(current, mergedCurrent)) {
      this.currentBars.set(key, mergedCurrent);
    }

    if (options.notifySubscribers !== false && normalizedIncomingBars.length > 0) {
      const [symbol, tfStr] = key.split(':');
      this._forEachMatchingSubscriberKey(
        symbol,
        parseInt(tfStr, 10),
        (subscriberKey) => {
          let barsByTime = notifyBySubscriberKey.get(subscriberKey);
          if (!barsByTime) {
            barsByTime = new Map();
            notifyBySubscriberKey.set(subscriberKey, barsByTime);
          }

          normalizedIncomingBars.forEach((bar) => {
            if (mergedCurrent && bar.time === mergedCurrent.time) {
              return;
            }
            if (!areBarsEquivalent(existingByTime.get(bar.time), bar)) {
              barsByTime.set(bar.time, bar);
            }
          });
          if (
            mergedCurrent &&
            !areBarsEquivalent(current, mergedCurrent)
          ) {
            barsByTime.set(mergedCurrent.time, mergedCurrent);
          }
        },
        { allowIngressAliases: false },
      );
    }
  }

  private _mergeHistoryWithCurrentBar(
    key: SubKey,
    current: OHLCBar,
    incomingBar: OHLCBar,
  ): OHLCBar {
    const mergedBar = this._blendHistoryWithCurrentBar(key, current, incomingBar);
    const historicalRecoveryDecision =
      this._getHistoryCurrentMergeRecoveryDecision(key, current, incomingBar, mergedBar);
    if (historicalRecoveryDecision) {
      this._logOhlcSanityRejection(
        this._symbolFromKey(key),
        mergedBar,
        mergedBar.source ?? 'history_current_merge',
        historicalRecoveryDecision,
      );
      return incomingBar;
    }

    return this._acceptOhlcBarForKey(
      key,
      mergedBar,
      mergedBar.source ?? 'history_current_merge',
      { rejectAnchoredCloseSpike: true },
    )
      ? mergedBar
      : incomingBar;
  }

  private _getHistoryCurrentMergeRecoveryDecision(
    key: SubKey,
    current: OHLCBar,
    incomingBar: OHLCBar,
    mergedBar: OHLCBar,
  ): OhlcSanityDecision | null {
    if (
      current.time !== incomingBar.time ||
      !isLiveGeneratedBar(current) ||
      !isHistoricalOhlcBar(incomingBar) ||
      this.liveAggregateAnchoredSpikeBaselines.has(key)
    ) {
      return null;
    }

    const referenceClose = incomingBar.close;
    if (!isValidOhlcSanityReference(referenceClose)) {
      return null;
    }

    const symbol = this._symbolFromKey(key);
    const decision = getOhlcChronologicalIsolatedSpikeDecision(
      symbol,
      mergedBar,
      referenceClose,
    );

    return decision && isChronologicalNeighborSpikeReason(decision.reason)
      ? decision
      : null;
  }

  private _blendHistoryWithCurrentBar(
    key: SubKey,
    current: OHLCBar,
    incomingBar: OHLCBar,
  ): OHLCBar {
    const latestLiveTickMs = this.currentBarLatestTickMs.get(key) ?? 0;
    const bucketMs = this._bucketMsForKey(key);
    if (
      latestLiveTickMs > current.time &&
      isLiveGeneratedBar(current) &&
      isHistoricalOhlcBar(incomingBar) &&
      !isClosedBucket(incomingBar, bucketMs)
    ) {
      // Open bucket: history bar has the correct open and full tick range/volume
      // accumulated since the minute started; live bar has the latest close.
      // Blend them so the candle is accurate in all dimensions.
      const mergedBar = {
        ...current,
        time: current.time,
        open: incomingBar.open,
        high: Math.max(current.high, incomingBar.high),
        low: Math.min(current.low, incomingBar.low),
        close: current.close,
        volume: Math.max(current.volume, incomingBar.volume),
        derived: undefined,
        continuity: undefined,
        isContinuity: undefined,
        basis: undefined,
        cached: undefined,
      };
      return mergedBar;
    }

    return preferRealBar(current, incomingBar, bucketMs);
  }

  private _backfillMissingBars(key: SubKey, previousBar: OHLCBar, nextBarTime: number) {
    if (!shouldAllowSyntheticMarketData()) {
      return previousBar;
    }

    const bucketMs = this._bucketMsForKey(key);
    const bucketedNextTime = bucketTime(nextBarTime, bucketMs);
    let lastBar = previousBar;
    const missingBars = Math.max(
      0,
      Math.floor((bucketedNextTime - previousBar.time) / bucketMs) - 1,
    );
    const firstGapTime = missingBars >= MAX_NORMALIZED_OHLC_BARS
      ? bucketedNextTime - (MAX_NORMALIZED_OHLC_BARS - 1) * bucketMs
      : previousBar.time + bucketMs;

    for (
      let gapTime = firstGapTime;
      gapTime < bucketedNextTime;
      gapTime += bucketMs
    ) {
      const filler = this._flatBar(gapTime, lastBar.close);
      this._pushToHistory(key, filler);
      this._notifySubscribers(key, filler);
      lastBar = filler;
    }

    return lastBar;
  }

  private _replayLocalStateToCallback(
    key: SubKey,
    callback: OHLCCallback,
  ): () => void {
    if (this._getLocalHistory(key).length === 0) {
      this._seedLocalHistoryFromRawCache(key);
    }

    if (!this.currentBars.has(key)) {
      this._seedCurrentBarFromLatestHistory(key) ||
        this._seedCurrentBarFromLatestTick(key, { allowWithHistory: true }) ||
        this._seedCurrentBarFromStorePrice(key, { allowWithHistory: true });
    }

    const replayBars = this._getLocalHistory(key);
    let cancelled = false;
    let replayTimer: ReturnType<typeof setTimeout> | null = null;

    if (replayBars.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const [symbol, tfStr] = key.split(':');
    const timeframe = parseInt(tfStr, 10);
    let index = 0;

    const replayBatch = () => {
      if (cancelled || !this.subscribers.get(key)?.has(callback)) {
        return;
      }

      const end = Math.min(index + LOCAL_REPLAY_BATCH_SIZE, replayBars.length);
      while (index < end) {
        callback(symbol, timeframe, { ...replayBars[index] });
        index += 1;
      }

      if (index < replayBars.length) {
        replayTimer = setTimeout(replayBatch, 0);
      }
    };

    Promise.resolve().then(replayBatch);

    return () => {
      cancelled = true;
      if (replayTimer) {
        clearTimeout(replayTimer);
      }
    };
  }

  private _rememberLatestTick(
    symbol: string,
    price: number,
    volume: number,
    timestampMs: number,
    source: string,
  ): boolean {
    const normalizedTimestamp = normalizeIncomingTickTimestampMs(timestampMs);

    const aliases = [symbol, ...getOhlcSymbolAliases(symbol)];
    const latestKnownTimestamp = aliases.reduce((latestTimestamp, alias) => {
      const normalized = normalizeSymbolKey(alias);
      const existing = normalized ? this.latestTicks.get(normalized) : undefined;
      return existing ? Math.max(latestTimestamp, existing.timestampMs) : latestTimestamp;
    }, 0);

    if (latestKnownTimestamp > normalizedTimestamp) {
      return false;
    }

    const tick: LatestTick = {
      symbol: symbol.trim(),
      price,
      volume,
      timestampMs: normalizedTimestamp,
      source,
    };

    for (const alias of aliases) {
      const normalized = normalizeSymbolKey(alias);
      if (normalized) {
        this.latestTicks.set(normalized, tick);
      }
    }

    return true;
  }

  private _getLatestTickForSymbol(symbol: string): LatestTick | null {
    let latestTick: LatestTick | null = null;

    for (const alias of [symbol, ...getOhlcSymbolAliases(symbol)]) {
      const tick = this.latestTicks.get(normalizeSymbolKey(alias));
      if (!tick) {
        continue;
      }

      if (!latestTick || tick.timestampMs > latestTick.timestampMs) {
        latestTick = tick;
      }
    }

    return latestTick ? { ...latestTick } : null;
  }

  private _seedCurrentBarFromLatestHistory(
    key: SubKey,
    nowMs = this.getServerNowMs(),
  ): boolean {
    if (this.currentBars.has(key)) {
      return false;
    }

    const bucketMs = this._bucketMsForKey(key);
    if (bucketMs <= 0) {
      return false;
    }

    const history = this._getStoredHistory(key);
    const previousBar = history[history.length - 1];
    if (!previousBar || previousBar.close <= 0) {
      return false;
    }

    const currentBucketTime = bucketTime(nowMs, bucketMs);
    const latestTick = this._getLatestTickForSymbol(this._symbolFromKey(key));
    const price = latestTick?.price && latestTick.price > 0
      ? latestTick.price
      : previousBar.close;
    const seedTime = currentBucketTime > previousBar.time
      ? currentBucketTime
      : previousBar.time;
    const seedBar = seedTime > previousBar.time
      ? this._liveRolloverBar(seedTime, price, previousBar)
      : {
          ...previousBar,
          sourceTimeMs: previousBar.sourceTimeMs ?? previousBar.time,
        };

    this.currentBars.set(key, seedBar);
    this.currentBarLatestTickMs.set(
      key,
      latestTick?.timestampMs && latestTick.timestampMs > 0
        ? latestTick.timestampMs
        : seedTime,
    );
    this._notifySubscribers(key, { ...seedBar });
    return true;
  }

  private _seedCurrentBarFromLatestTick(
    key: SubKey,
    options: { allowWithHistory?: boolean } = {},
  ): boolean {
    if (this.currentBars.has(key)) {
      return false;
    }

    if (!options.allowWithHistory && this._getLocalHistory(key).length > 0) {
      return false;
    }

    const [symbol] = key.split(':');
    const latestTick = this._getLatestTickForSymbol(symbol);
    if (!latestTick) {
      return false;
    }

    return this._seedCurrentBarFromPrice(
      key,
      latestTick.price,
      latestTick.volume,
      latestTick.timestampMs,
      latestTick.source,
    );
  }

  private _seedCurrentBarFromStorePrice(
    key: SubKey,
    options: { allowWithHistory?: boolean } = {},
  ): boolean {
    if (this.currentBars.has(key)) {
      return false;
    }

    if (!options.allowWithHistory && this._getLocalHistory(key).length > 0) {
      return false;
    }

    const [symbol] = key.split(':');

    // Prefer livePriceSnapshotCache (updated synchronously on every tick / seedOhlcClosePrice)
    // over Zustand store state (updated asynchronously via schedulePriceFlush).
    const liveSnapshot = getLivePriceSnapshotBySymbol(symbol);
    let seedPrice: number | null = null;
    let volume = 0;
    let timestampMs = Date.now();

    if (liveSnapshot && (liveSnapshot.bid > 0 || liveSnapshot.ask > 0 || (liveSnapshot.last ?? 0) > 0)) {
      seedPrice =
        liveSnapshot.bid > 0 && liveSnapshot.ask > 0
          ? (liveSnapshot.bid + liveSnapshot.ask) / 2
          : (liveSnapshot.last ?? 0) > 0
            ? liveSnapshot.last!
            : liveSnapshot.bid > 0
              ? liveSnapshot.bid
              : liveSnapshot.ask;
      const snapTime = typeof liveSnapshot.receivedAtMs === 'number' && liveSnapshot.receivedAtMs > 0
        ? liveSnapshot.receivedAtMs
        : liveSnapshot.time instanceof Date
          ? liveSnapshot.time.getTime()
          : Date.now();
      timestampMs = snapTime > 0 ? snapTime : Date.now();
    } else {
      const price = findValueBySymbol(useWebtraderStore.getState().prices ?? {}, symbol);
      seedPrice = priceFromTickLike(price);
      volume = Number((price as { volume?: unknown } | undefined)?.volume) || 0;
      timestampMs = timestampFromTickLike(price);
    }

    if (!seedPrice) {
      return false;
    }

    // This seed is a provisional axis/price placeholder. It can warm local state,
    // but real MT5/history bars must replace it and the renderer must not treat it
    // as a permanent visible market candle.
    return this._seedCurrentBarFromPrice(
      key,
      seedPrice,
      volume,
      timestampMs,
      'live_price_seed',
    );
  }

  private _seedCurrentBarFromPrice(
    key: SubKey,
    price: number,
    volume: number,
    timestampMs: number,
    source: string,
    derived = false,
  ): boolean {
    const [symbol, tfStr] = key.split(':');
    const timeframe = parseInt(tfStr, 10);
    const bucketMs = timeframe * 60 * 1000;
    if (!Number.isFinite(price) || price <= 0 || bucketMs <= 0) {
      return false;
    }
    const normalizedTimestamp = normalizeIncomingTickTimestampMs(timestampMs);

    const bar: OHLCBar = {
      symbol,
      timeframeMinutes: timeframe,
      time: bucketTime(normalizedTimestamp, bucketMs),
      open: price,
      high: price,
      low: price,
      close: price,
      volume: Math.max(0, Number(volume) || 0),
      source,
    };

    if (derived) {
      bar.derived = true;
      bar.continuity = true;
      bar.isContinuity = true;
      bar.basis = 'latest_quote';
    }

    this.currentBars.set(key, bar);
    if (derived) {
      this.currentBarLatestTickMs.delete(key);
    } else {
      this.currentBarLatestTickMs.set(key, normalizedTimestamp);
    }
    return true;
  }

  private _ensureBucketExpiryTimer() {
    if (this._bucketExpiryTimer !== null) return;
    this._bucketExpiryTimer = setInterval(() => {
      // Server clock, not Date.now() — buckets are keyed on the broker clock, so
      // a broker timezone offset would otherwise stop this timer from ever rolling.
      const nowMs = Math.max(this.getServerNowMs(), Date.now());
      for (const key of this.subscribers.keys()) {
        if (!this.currentBars.has(key)) {
          this._seedCurrentBarFromLatestHistory(key, nowMs);
        }
      }
      for (const [key, current] of this.currentBars.entries()) {
        if (!current || current.time <= 0) continue;
        const tf = parseInt(key.slice(key.lastIndexOf(':') + 1), 10);
        const bucketMs = tf * 60 * 1000;
        // Close bar only if the entire bucket period has elapsed with a small grace.
        if (nowMs >= current.time + bucketMs + LIVE_BUCKET_ROLLOVER_GRACE_MS) {
          const closedBar: OHLCBar = { ...current, closed: true };
          this._pushToHistory(key, closedBar);
          this._notifySubscribers(key, closedBar);
          const prev = this.lastKnownCandleTimestampMs.get(key) ?? 0;
          if (closedBar.time > prev) {
            this.lastKnownCandleTimestampMs.set(key, closedBar.time);
          }
          this.liveAggregateAnchoredSpikeBaselines.delete(key);

          const currentBucketTime = bucketTime(nowMs, bucketMs);
          const firstRolloverTime = current.time + bucketMs;
          const catchUpBars = Math.max(
            1,
            Math.floor((currentBucketTime - firstRolloverTime) / bucketMs) + 1,
          );
          const limitedFirstRolloverTime = catchUpBars > LIVE_BUCKET_ROLLOVER_MAX_CATCHUP_BARS
            ? currentBucketTime - ((LIVE_BUCKET_ROLLOVER_MAX_CATCHUP_BARS - 1) * bucketMs)
            : firstRolloverTime;
          let previousRolloverBar: OHLCBar = closedBar;

          for (
            let rolloverTime = limitedFirstRolloverTime;
            rolloverTime <= currentBucketTime;
            rolloverTime += bucketMs
          ) {
            const rolloverBar = this._liveRolloverBar(
              rolloverTime,
              previousRolloverBar.close,
              previousRolloverBar,
            );

            if (rolloverTime < currentBucketTime) {
              const closedRolloverBar: OHLCBar = { ...rolloverBar, closed: true };
              this._pushToHistory(key, closedRolloverBar);
              this._notifySubscribers(key, closedRolloverBar);
              const known = this.lastKnownCandleTimestampMs.get(key) ?? 0;
              if (closedRolloverBar.time > known) {
                this.lastKnownCandleTimestampMs.set(key, closedRolloverBar.time);
              }
              previousRolloverBar = closedRolloverBar;
              continue;
            }

            this.currentBars.set(key, rolloverBar);
            this.currentBarLatestTickMs.set(key, rolloverTime);
            this._notifySubscribers(key, rolloverBar);
            previousRolloverBar = rolloverBar;
          }
        }
      }
    }, 1000);
  }

  private _clearBucketExpiryTimer() {
    if (this._bucketExpiryTimer === null) return;
    clearInterval(this._bucketExpiryTimer);
    this._bucketExpiryTimer = null;
  }

  private _aggregateTick(
    symbol: string,
    price: number,
    volume: number,
    tsMs: number,
    source = 'mt5_tick',
    receivedAtMs = tsMs,
  ) {
    const acceptedBarsForSanityReference: Array<{ key: SubKey; bar: OHLCBar }> = [];
    const acceptLiveAggregateBar = (key: SubKey, bar: OHLCBar): boolean => {
      const keySymbol = this._symbolFromKey(key);
      const keyReferenceClose = this._getLocalOhlcSanityReferenceForKey(key, bar)?.close ?? null;
      if (
        !this._evaluateOhlcBarForSymbol(
          keySymbol,
          bar,
          source,
          keyReferenceClose,
        )
      ) {
        return false;
      }

      acceptedBarsForSanityReference.push({ key, bar });
      return true;
    };

    this._forEachMatchingSubscriberKey(symbol, null, (key) => {
      const tfStr = key.slice(key.lastIndexOf(':') + 1);
      const tf = parseInt(tfStr, 10);
      const bucketMs = tf * 60 * 1000;
      const liveGeneratedSource = isLiveGeneratedSource(source);
      // Bucket every tick by its own MT5/server timestamp (tsMs), which the backend
      // stamps in UTC epoch ms — the SAME clock it uses for history bar open-times
      // (server_time_msc / open_time). Previously live ticks were bucketed by the
      // browser receive clock (receivedAtMs); any skew between the dev/browser clock
      // and the broker clock pushed the live candle onto a different bucket boundary
      // than the server's bars, breaking per-timeframe bucketing, the history/live
      // seam, and the merge. tsMs is already normalized (server time, with a
      // receivedAtMs fallback only when the backend omits the timestamp).
      const bucketTimestampMs = Number.isFinite(tsMs) && tsMs > 0
        ? tsMs
        : normalizeIncomingTickTimestampMs(receivedAtMs, Date.now());
      let bucketStart = Math.floor(bucketTimestampMs / bucketMs) * bucketMs;

      const current = this.currentBars.get(key);
      const history = this.history.get(key) ?? [];
      const previousCommitted = history[history.length - 1];
      const latestCurrentTickMs = this.currentBarLatestTickMs.get(key) ?? 0;
      let effectiveTickMs = bucketTimestampMs;
      const receivedTimestampMs = normalizeIncomingTickTimestampMs(receivedAtMs, Date.now());
      const serverNowMs = Math.max(tsMs, this.getLatestKnownMt5TimestampMs(), Date.now());
      const receivedBucketStart = Math.floor(receivedTimestampMs / bucketMs) * bucketMs;
      const currentClockBucketStart = Math.max(
        receivedBucketStart,
        bucketTime(serverNowMs, bucketMs),
      );

      // Rescue a marginally late / out-of-order live tick into the still-open current
      // candle, judged against the broker server clock (latest known MT5 time) rather
      // than the browser clock so the decision stays on the same basis as the buckets.
      if (
        current &&
        bucketStart < current.time &&
        liveGeneratedSource &&
        bucketTime(serverNowMs, bucketMs) === current.time
      ) {
        bucketStart = current.time;
        effectiveTickMs = Math.max(effectiveTickMs, current.time);
      }

      // Some gateways repeat the last MT5 tick timestamp while fresh prices keep
      // arriving. Without this guard every new price keeps mutating the old open
      // candle. Once the browser receive clock has crossed the next timeframe
      // boundary, live ticks should advance to that bucket even if their source
      // timestamp is stale.
      if (current && liveGeneratedSource) {
        const sourceTimestampIsStale = (
          bucketStart <= current.time ||
          (
            latestCurrentTickMs > 0 &&
            bucketTimestampMs <= latestCurrentTickMs &&
            currentClockBucketStart > current.time
          )
        );

        if (sourceTimestampIsStale && currentClockBucketStart > current.time) {
          bucketStart = currentClockBucketStart;
          effectiveTickMs = Math.max(effectiveTickMs, receivedTimestampMs, currentClockBucketStart);
        }
      }

      if (current) {
        if (bucketStart < current.time) {
          return;
        }

        if (
          bucketStart === current.time &&
          latestCurrentTickMs > 0 &&
          effectiveTickMs < latestCurrentTickMs
        ) {
          return;
        }
      } else if (previousCommitted && bucketStart < previousCommitted.time) {
        return;
      }

      // Count each price change as 1 unit — matches MT5's tick_volume metric used in
      // all historical bars for every instrument (Forex, Metals, Crypto alike).
      const tickVolumeUnit = Number.isFinite(volume) && volume > 0 ? volume : 1;

      if (!current || current.time !== bucketStart) {
        let previousBar = current ?? previousCommitted ?? null;

        const hasBucketGap = Boolean(
          previousBar && bucketStart > previousBar.time + bucketMs,
        );

        // For the history/live seam, inherit the previous close as the provisional
        // open only when there is no missing candle bucket. If one or more
        // buckets are missing, the first live tick opens the new candle.
        const open = previousBar ? previousBar.close : price;
        const newBar: OHLCBar = {
          time: bucketStart,
          open,
          high: Math.max(open, price),
          low: Math.min(open, price),
          close: price,
          volume: tickVolumeUnit,
          source,
          sourceTimeMs: effectiveTickMs,
        };
        const baselineForDeferredSpike: OHLCBar = {
          ...newBar,
          high: open,
          low: open,
          close: open,
          volume: 0,
        };
        const deferredSpikeDecision =
          this._getLiveAggregateAnchoredSpikeDecision(
            key,
            newBar,
          );
        if (!acceptLiveAggregateBar(key, newBar)) {
          return;
        }

        if (current) {
          const closedBar: OHLCBar = { ...current, closed: true };
          this._pushToHistory(key, closedBar);
          this._notifySubscribers(key, closedBar);
          this.liveAggregateAnchoredSpikeBaselines.delete(key);
          // Record the closed candle's bucket time so reconnect gap-fill knows where to start.
          const prev = this.lastKnownCandleTimestampMs.get(key) ?? 0;
          if (closedBar.time > prev) {
            this.lastKnownCandleTimestampMs.set(key, closedBar.time);
          }
          previousBar = closedBar;
        }

        if (hasBucketGap && previousBar) {
          this._backfillMissingBars(key, previousBar, bucketStart);
        }

        this.currentBars.set(key, newBar);
        this.currentBarLatestTickMs.set(key, effectiveTickMs);
        if (deferredSpikeDecision?.referenceClose) {
          this._rememberLiveAggregateAnchoredSpikeBaseline(
            key,
            newBar,
            baselineForDeferredSpike,
            deferredSpikeDecision.referenceClose,
          );
        } else {
          this.liveAggregateAnchoredSpikeBaselines.delete(key);
        }
        this._notifySubscribers(key, newBar);
      } else {
        const previousVisibleBar = { ...current };
        const nextBar: OHLCBar = {
          ...current,
          high: Math.max(current.high, price),
          low: Math.min(current.low, price),
          close: price,
          volume: current.volume + tickVolumeUnit,
          source,
          sourceTimeMs: effectiveTickMs,
          derived: undefined,
          continuity: undefined,
          isContinuity: undefined,
          basis: undefined,
          cached: undefined,
        };
        const confirmedSpikeDecision =
          this._getConfirmedLiveAggregateSpikeDecision(key, nextBar);
        if (confirmedSpikeDecision) {
          const baseline =
            this.liveAggregateAnchoredSpikeBaselines.get(key)?.bar ?? previousVisibleBar;
          const recoveredBar = this._buildLiveAggregateRecoveredBar(
            baseline,
            price,
            tickVolumeUnit,
            source,
          );
          recoveredBar.sourceTimeMs = effectiveTickMs;
          this._logOhlcSanityRejection(
            this._symbolFromKey(key),
            nextBar,
            source,
            confirmedSpikeDecision,
          );
          if (!acceptLiveAggregateBar(key, recoveredBar)) {
            return;
          }

          this.liveAggregateAnchoredSpikeBaselines.delete(key);
          this.currentBars.set(key, recoveredBar);
          this.currentBarLatestTickMs.set(key, effectiveTickMs);
          if (!areBarsEquivalent(previousVisibleBar, recoveredBar)) {
            this._notifySubscribers(key, { ...recoveredBar });
          }
          return;
        }

        const existingDeferredSpike =
          this.liveAggregateAnchoredSpikeBaselines.get(key);
        const deferredSpikeDecision = this._getLiveAggregateAnchoredSpikeDecision(
          key,
          nextBar,
          existingDeferredSpike?.referenceClose,
        );
        if (!acceptLiveAggregateBar(key, nextBar)) {
          return;
        }

        this.currentBars.set(key, nextBar);
        this.currentBarLatestTickMs.set(key, effectiveTickMs);
        if (deferredSpikeDecision?.referenceClose) {
          this._rememberLiveAggregateAnchoredSpikeBaseline(
            key,
            nextBar,
            previousVisibleBar,
            deferredSpikeDecision.referenceClose,
          );
        } else {
          this.liveAggregateAnchoredSpikeBaselines.delete(key);
        }
        if (areBarsEquivalent(previousVisibleBar, nextBar)) {
          return;
        }
        this._notifySubscribers(key, { ...nextBar });
      }
    });

    for (const { key, bar } of acceptedBarsForSanityReference) {
      this._rememberOhlcSanityReferenceForKey(key, bar);
    }
  }

  private _buildHistoryRequestPayload(
    symbol: string,
    timeframeMinutes: number,
    limit: number,
    range: HistoryRequestRange,
  ): Record<string, unknown> {
    const requestType = getHistoryRequestType(range);
    const cacheFirst = range.cacheFirst ?? true;
    const cacheOnly = range.cacheOnly ?? false;

    return {
      symbol,
      timeframeMinutes,
      timeframe: formatBackendTimeframe(timeframeMinutes),
      limit,
      type: requestType,
      requestType,
      cacheFirst,
      cacheOnly,
      ...(range.beforeUnixMs !== undefined
        ? {
            before: range.beforeUnixMs,
            beforeUnixMs: range.beforeUnixMs,
            before_unix_ms: range.beforeUnixMs,
          }
        : {}),
      ...(range.fromUnixMs !== undefined ? { fromUnixMs: range.fromUnixMs } : {}),
      ...(range.toUnixMs !== undefined ? { toUnixMs: range.toUnixMs } : {}),
    };
  }

  private _retainStorePriceSubscription(symbol: string): void {
    const normalizedSymbol = symbol.trim();
    if (!normalizedSymbol) {
      return;
    }

    const count = this.storePriceSubscriptionCounts.get(normalizedSymbol) ?? 0;
    this.storePriceSubscriptionCounts.set(normalizedSymbol, count + 1);
    if (count > 0) {
      return;
    }

    const handleStorePrice = () => {
      const snapshot = getLivePriceSnapshotBySymbol(normalizedSymbol);
      if (!snapshot || ((snapshot.bid ?? 0) <= 0 && (snapshot.ask ?? 0) <= 0 && (snapshot.last ?? 0) <= 0)) {
        return;
      }

      this.ingestTick(
        normalizedSymbol,
        snapshot.bid ?? 0,
        snapshot.ask ?? 0,
        snapshot.last,
        snapshot.volume,
        snapshot.receivedAtMs ?? snapshot.time,
      );
    };

    this.storePriceUnsubscribers.set(
      normalizedSymbol,
      subscribeToLivePriceBySymbol(normalizedSymbol, handleStorePrice),
    );
    handleStorePrice();
  }

  private _releaseStorePriceSubscription(symbol: string): void {
    const normalizedSymbol = symbol.trim();
    if (!normalizedSymbol) {
      return;
    }

    const count = this.storePriceSubscriptionCounts.get(normalizedSymbol) ?? 0;
    if (count > 1) {
      this.storePriceSubscriptionCounts.set(normalizedSymbol, count - 1);
      return;
    }

    this.storePriceSubscriptionCounts.delete(normalizedSymbol);
    this.storePriceUnsubscribers.get(normalizedSymbol)?.();
    this.storePriceUnsubscribers.delete(normalizedSymbol);
    const normalizedKey = normalizeSymbolKey(normalizedSymbol);
    if (normalizedKey) {
      this.ingestedLivePriceKeys.delete(normalizedKey);
    }
  }

  private _clearStorePriceSubscriptions(): void {
    this.storePriceUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.storePriceUnsubscribers.clear();
    this.storePriceSubscriptionCounts.clear();
    this.ingestedLivePriceKeys.clear();
  }

  private _getAccountIdFromSessionId(): string | null {
    const accountId = this.sessionId?.split('|')[0]?.trim();
    return accountId || null;
  }

  private async _requestOhlcHistoryPayloadViaApi(
    accountId: string,
    alias: string,
    timeframeMinutes: number,
    limit: number,
    range: HistoryRequestRange,
  ): Promise<OhlcHistoryPayloadResponse> {
    const requestType = getHistoryRequestType(range);
    const params = new URLSearchParams({
      accountId,
      symbol: alias,
      timeframeMinutes: String(timeframeMinutes),
      limit: String(limit),
    });

    if (range.beforeUnixMs !== undefined) {
      params.set('beforeUnixMs', String(range.beforeUnixMs));
    }
    if (range.fromUnixMs !== undefined) {
      params.set('fromUnixMs', String(range.fromUnixMs));
    }
    if (range.toUnixMs !== undefined) {
      params.set('toUnixMs', String(range.toUnixMs));
    }

    const response = await fetch(`/api/trading/ohlc-history?${params.toString()}`, {
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({})) as HttpOhlcHistoryResponse;

    if (!response.ok && response.status !== 202) {
      throw new Error(payload.error || payload.code || `OHLC history API failed with status ${response.status}.`);
    }

    return {
      bars: Array.isArray(payload.bars)
        ? payload.bars.map((bar) =>
            isRecord(bar)
              ? {
                  symbol: alias,
                  timeframeMinutes,
                  ...bar,
                }
              : bar,
          )
        : [],
      metadata: {
        ...(isRecord(payload.metadata) ? payload.metadata : {}),
        symbol: alias,
        timeframeMinutes,
        limit,
        requestedLimit: limit,
        requestType,
        cacheFirst: range.cacheFirst ?? true,
        cacheOnly: range.cacheOnly ?? false,
        source: 'history_api',
        ...(range.beforeUnixMs !== undefined ? { beforeUnixMs: range.beforeUnixMs } : {}),
      } as OhlcHistoryResponseMetadata,
    };
  }

  private async _requestOhlcHistoryPayload(
    alias: string,
    timeframeMinutes: number,
    limit: number,
    range: HistoryRequestRange,
  ): Promise<OhlcHistoryPayloadResponse> {
    const requestKey = makeCanonicalHistoryRequestKey(
      this.sessionId,
      makeSubKey(alias, timeframeMinutes),
      limit,
      range,
    );
    const pendingRequest = this.pendingHistoryPayloadRequests.get(requestKey);
    if (pendingRequest) {
      return pendingRequest;
    }

    const request = this._requestOhlcHistoryPayloadUncached(
      alias,
      timeframeMinutes,
      limit,
      range,
    ).finally(() => {
      this.pendingHistoryPayloadRequests.delete(requestKey);
    });

    this.pendingHistoryPayloadRequests.set(requestKey, request);
    return request;
  }

  private async _requestOhlcHistoryPayloadUncached(
    alias: string,
    timeframeMinutes: number,
    limit: number,
    range: HistoryRequestRange,
  ): Promise<OhlcHistoryPayloadResponse> {
    const accountId = this.useHistoryApi ? this._getAccountIdFromSessionId() : null;
    if (accountId) {
      try {
        return await this._requestOhlcHistoryPayloadViaApi(
          accountId,
          alias,
          timeframeMinutes,
          limit,
          range,
        );
      } catch (error) {
        console.warn('[ohlcWebSocketService] history API unavailable; falling back to WS history request', {
          accountId,
          symbol: alias,
          timeframeMinutes,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const requestClient = this.wsClient;
    const rawRequester = requestClient as unknown as Partial<RawOhlcHistoryRequester>;
    if (typeof rawRequester.sendAuthenticatedRequest === 'function') {
      const payload = await rawRequester.sendAuthenticatedRequest<unknown>(
        'request_ohlc_history',
        this._buildHistoryRequestPayload(alias, timeframeMinutes, limit, range),
        45_000,
      );
      const requestType = getHistoryRequestType(range);
      return {
        bars: extractRawOhlcHistoryBars(payload).map((bar) =>
          isRecord(bar)
            ? {
                symbol: alias,
                timeframeMinutes,
                ...bar,
              }
            : bar,
        ),
        metadata: mapRawOhlcHistoryMetadata(payload, {
          symbol: alias,
          timeframeMinutes,
          limit,
          requestType,
          ...(range.beforeUnixMs !== undefined ? { beforeUnixMs: range.beforeUnixMs } : {}),
          cacheFirst: range.cacheFirst ?? true,
          cacheOnly: range.cacheOnly ?? false,
        }),
      };
    }

    const bars = await requestClient!.getOhlcHistory(
      alias,
      timeframeMinutes,
      limit,
      range,
    );
    const metadata = getOhlcHistoryMetadata(bars);
    return {
      bars,
      ...(metadata ? { metadata } : {}),
    };
  }

  private _isValidHistoryBar(bar: OHLCBar): boolean {
    return (
      Number.isFinite(bar.time) &&
      bar.time > 0 &&
      [bar.open, bar.high, bar.low, bar.close].every((price) =>
        Number.isFinite(price) && price > 0,
      ) &&
      Number.isFinite(bar.volume) &&
      bar.volume >= 0
    );
  }

  private _decorateHistoryMetadata(
    metadata: OhlcHistoryResponseMetadata | undefined,
    range: HistoryRequestRange,
    limit: number,
    normalizedBars: OHLCBar[],
  ): OhlcHistoryMetadataWithPagination {
    const metadataCopy = metadata
      ? (this._cloneHistoryMetadata(metadata) as OhlcHistoryMetadataWithPagination)
      : ({
          historySparse: false,
          historyGapped: false,
          managerFetchDeferred: false,
        } as OhlcHistoryMetadataWithPagination);
    const metadataRecord = metadataCopy as OhlcHistoryMetadataWithPagination & Record<string, unknown>;
    const nestedMetadata = metadataCopy.metadata;
    const requestType =
      parseOptionalString(metadataRecord.requestType ?? nestedMetadata?.requestType) ??
      getHistoryRequestType(range);
    const before = normalizeOptionalUnixMs(
      metadataRecord.beforeUnixMs ??
        metadataRecord.before ??
        nestedMetadata?.beforeUnixMs ??
        nestedMetadata?.before ??
        range.beforeUnixMs,
    );
    const returnedBarCount =
      normalizeOptionalInteger(
        metadataCopy.returnedBarCount ??
          metadataCopy.barCount ??
          nestedMetadata?.returnedBarCount,
      ) ?? normalizedBars.length;
    const nextBefore =
      normalizeOptionalUnixMs(
        metadataRecord.nextBeforeUnixMs ??
          metadataRecord.nextBefore ??
          nestedMetadata?.nextBeforeUnixMs ??
          nestedMetadata?.nextBefore,
      ) ?? normalizedBars[0]?.time;
    const hasMore =
      parseOptionalBoolean(metadataRecord.hasMore ?? nestedMetadata?.hasMore) ??
      returnedBarCount >= limit;
    const cacheOnly =
      parseOptionalBoolean(metadataRecord.cacheOnly ?? nestedMetadata?.cacheOnly) ??
      range.cacheOnly ??
      false;
    const cacheFirst =
      parseOptionalBoolean(metadataRecord.cacheFirst ?? nestedMetadata?.cacheFirst) ??
      range.cacheFirst ??
      true;

    return {
      ...metadataCopy,
      requestType,
      requestedLimit: metadataCopy.requestedLimit ?? metadataCopy.limit ?? limit,
      returnedBarCount,
      barCount: metadataCopy.barCount ?? returnedBarCount,
      ...(before !== undefined ? { before, beforeUnixMs: before } : {}),
      ...(nextBefore !== undefined ? { nextBefore, nextBeforeUnixMs: nextBefore } : {}),
      hasMore,
      cacheOnly,
      cacheFirst,
    };
  }

  private _rememberHistoryRequestDiagnostics(
    symbol: string,
    timeframeMinutes: number,
    limit: number,
    range: HistoryRequestRange,
    status: string,
    message: string,
    attemptedBrokerSymbol?: string,
    resolvedBrokerSymbol?: string,
  ) {
    const metadata = this._decorateHistoryMetadata(
      {
        status,
        symbol,
        timeframeMinutes,
        requestedLimit: limit,
        returnedBarCount: 0,
        realBarCount: 0,
        message,
        historySparse: false,
        historyGapped: false,
        managerFetchDeferred: false,
        source: 'client',
      },
      range,
      limit,
      [],
    );

    this._rememberHistoryMetadata(
      symbol,
      timeframeMinutes,
      metadata,
      attemptedBrokerSymbol
        ? makeSubKey(attemptedBrokerSymbol, timeframeMinutes)
        : undefined,
      resolvedBrokerSymbol,
      attemptedBrokerSymbol,
    );
  }

  private async _requestServerHistory(
    symbol: string,
    timeframeMinutes: number,
    limit: number,
    range: HistoryRequestRange,
  ): Promise<OHLCBar[] | null> {
    this.ensureClientAttached();
    if (!this.hasLiveClient()) {
      return null;
    }

    const key = makeSubKey(symbol, timeframeMinutes);
    const requestSessionId = this.sessionId;
    const requestClient = this.wsClient;
    const requestClientGeneration = this.clientAttachGeneration;
    const resolvedSymbol = this.resolvedRequestSymbols.get(key);
    let sawSuccessfulResponse = false;
    let lastNonTransientError: unknown = null;

    for (const alias of this._getRequestSymbols(symbol, resolvedSymbol)) {
      try {
        const historyResponse = await this._requestOhlcHistoryPayload(
          alias,
          timeframeMinutes,
          limit,
          range,
        );
        if (
          !this._isClientRequestCurrent(
            requestSessionId,
            requestClient,
            requestClientGeneration,
          )
        ) {
          return null;
        }

        sawSuccessfulResponse = true;
        const bucketMs = timeframeMinutes * 60 * 1000;
        const normalized = this._filterAcceptedHistoryBarsForKey(
          key,
          this._normalizeBars(
            historyResponse.bars
              .map((bar) => this._normalizeIncomingBar(bar))
              .filter((bar) => this._isValidHistoryBar(bar)),
            bucketMs,
          ),
          'history',
          bucketMs,
        );
        const metadata = this._decorateHistoryMetadata(
          historyResponse.metadata,
          range,
          limit,
          normalized,
        );
        this._rememberHistoryMetadata(
          symbol,
          timeframeMinutes,
          metadata,
          makeSubKey(alias, timeframeMinutes),
          normalized.length > 0 ? alias : undefined,
          alias,
        );

        if (this.historyDiagnosticsDebugEnabled) {
          console.debug('[ohlcWebSocketService] history request result', {
            requestType: metadata.requestType,
            requestedSymbol: symbol,
            attemptedBrokerSymbol: alias,
            resolvedBrokerSymbol: normalized.length > 0 ? alias : undefined,
            timeframeMinutes,
            requestedLimit: limit,
            before: metadata.before,
            nextBefore: metadata.nextBefore,
            hasMore: metadata.hasMore,
            source: metadata.source,
            cacheOnly: metadata.cacheOnly,
            returnedBarCount: metadata.returnedBarCount ?? normalized.length,
            metadataStatus: metadata.status,
            historySparse: metadata.historySparse,
            historyGapped: metadata.historyGapped,
            historyStale: metadata.historyStale,
            managerFetchDeferred: metadata.managerFetchDeferred,
          });
        }

        if (normalized.length > 0) {
          this.resolvedRequestSymbols.set(key, alias);
          this._indexSubscriberKey(key);
          return normalized;
        }

        // Server acknowledged 0 bars but a backfill is in flight — every other alias
        // will hit the same empty cache. Stop early; ohlc_history_refreshed will arrive.
        if (metadata.managerFetchDeferred || metadata.managerFetchPending) {
          return null;
        }
      } catch (error) {
        this._rememberHistoryRequestDiagnostics(
          symbol,
          timeframeMinutes,
          limit,
          range,
          'error',
          error instanceof Error ? error.message : String(error),
          alias,
        );
        // Abort all alias attempts: server disconnects OR request timeout both mean
        // the backend is unavailable right now — trying the next alias would just
        // block for another 8 s with the same result.
        if (isLiveServerUnavailableError(error) || isRequestTimeoutError(error)) {
          return null;
        }

        lastNonTransientError = error;
      }
    }

    if (!sawSuccessfulResponse && lastNonTransientError) {
      throw lastNonTransientError;
    }

    return null;
  }

  private async _waitForLocalHistory(
    key: SubKey,
    timeoutMs: number,
    limit = DEFAULT_OHLC_HISTORY_LIMIT,
    range: HistoryRequestRange = {},
    useStoredOnly = false,
  ): Promise<OHLCBar[]> {
    const startedAt = Date.now();
    const select = useStoredOnly
      ? () => this._selectStoredHistoryForRequest(key, limit, range)
      : () => this._selectHistoryForRequest(key, limit, range);

    while (Date.now() - startedAt < timeoutMs) {
      const local = select();
      if (local.length > 0) {
        return local;
      }

      await delay(LOCAL_HISTORY_POLL_MS);
    }

    return select();
  }

  private _getHistoryBarByTime(history: OHLCBar[], time: number): OHLCBar | undefined {
    const index = this._findBarIndexByTime(history, time);
    return index >= 0 ? history[index] : undefined;
  }

  private _ingestBar(
    key: SubKey,
    bar: OHLCBar,
    options: { skipSanity?: boolean } = {},
  ): boolean {
    const bucketMs = this._bucketMsForKey(key);
    const canonicalTime = getExplicitCanonicalIncomingBarTime(bar);
    if (canonicalTime !== null) {
      bar = { ...bar, time: canonicalTime, sourceTimeMs: canonicalTime };
    }
    bar = normalizeLiveGeneratedBarTimestamp(bar);
    // Tick-derived bars may use receipt time for freshness checks, but candle
    // buckets must stay on the canonical/open time so history and live reuse
    // the same seam slot.
    bar = { ...bar, time: bucketTime(canonicalTime ?? bar.time, bucketMs) };
    if (
      !options.skipSanity &&
      !this._acceptOhlcBarForKey(key, bar, bar.source ?? 'live_ohlc')
    ) {
      return false;
    }
    this.liveAggregateAnchoredSpikeBaselines.delete(key);

    const current = this.currentBars.get(key);
    const history = this.history.get(key) ?? [];
    const previousCommitted = history[history.length - 1];

    if (current && bar.time < current.time) {
      const existingHistoryBar = this._getHistoryBarByTime(history, bar.time);
      const historyBar = this._pushToHistory(key, bar);
      if (!areBarsEquivalent(existingHistoryBar, historyBar)) {
        this._notifySubscribers(key, historyBar);
      }
      return true;
    }

    if (!current && previousCommitted && bar.time < previousCommitted.time) {
      const existingHistoryBar = this._getHistoryBarByTime(history, bar.time);
      const historyBar = this._pushToHistory(key, bar);
      if (!areBarsEquivalent(existingHistoryBar, historyBar)) {
        this._notifySubscribers(key, historyBar);
      }
      return true;
    }

    const previousVisibleBar =
      current?.time === bar.time ? current :
      previousCommitted?.time === bar.time ? previousCommitted :
      undefined;

    if (current && current.time === bar.time) {
      const incomingBar = bar;
      const preferredBar = preferRealBar(current, incomingBar, bucketMs);
      bar = this._acceptOhlcBarForKey(
        key,
        preferredBar,
        preferredBar.source ?? 'live_ohlc_merge',
        { rejectAnchoredCloseSpike: true },
      )
        ? preferredBar
        : incomingBar;
      this.currentBars.set(key, bar);
    } else if (!current && previousCommitted && previousCommitted.time === bar.time) {
      const incomingBar = bar;
      const preferredBar = preferRealBar(previousCommitted, incomingBar, bucketMs);
      bar = this._acceptOhlcBarForKey(
        key,
        preferredBar,
        preferredBar.source ?? 'live_ohlc_merge',
        { rejectAnchoredCloseSpike: true },
      )
        ? preferredBar
        : incomingBar;
      this.currentBars.set(key, bar);
    } else {
      if (current) {
        this._pushToHistory(key, current);
      }

      this.currentBars.set(key, { ...bar });
      this.currentBarLatestTickMs.delete(key);
    }

    if (!areBarsEquivalent(previousVisibleBar, bar)) {
      this._notifySubscribers(key, bar);
    }
    return true;
  }

  private _pushToHistory(key: SubKey, bar: OHLCBar): OHLCBar {
    if (!this.history.has(key)) {
      this.history.set(key, []);
    }

    const bucketMs = this._bucketMsForKey(key);
    const sourceTimeMs = getCanonicalIncomingBarTime(bar);
    const normalizedBar = {
      ...bar,
      sourceTimeMs: bar.sourceTimeMs ?? sourceTimeMs,
      time: bucketTime(sourceTimeMs, bucketMs),
    };
    const history = this.history.get(key)!;
    const storedBar = this._upsertSortedBar(history, normalizedBar, MAX_NORMALIZED_OHLC_BARS, bucketMs);

    // Keep lastKnownCandleTimestampMs up to date for reconnect gap-fill.
    if (normalizedBar.time > 0) {
      const prev = this.lastKnownCandleTimestampMs.get(key) ?? 0;
      if (normalizedBar.time > prev) {
        this.lastKnownCandleTimestampMs.set(key, normalizedBar.time);
      }
    }

    return history[this._findBarIndexByTime(history, normalizedBar.time)] ?? { ...storedBar };
  }

  private _notifySubscribers(key: SubKey, bar: OHLCBar) {
    const [symbol, tfStr] = key.split(':');
    const timeframe = parseInt(tfStr, 10);
    const callbacks = this.subscribers.get(key);
    if (!callbacks) {
      return;
    }

    callbacks.forEach((callback) => callback(symbol, timeframe, bar));
  }

  private _cloneHistoryMetadata(
    metadata: OhlcHistoryResponseMetadata,
  ): OhlcHistoryResponseMetadata {
    const topLevelBrokerSymbolCandidates = parseOptionalStringList(
      metadata.brokerSymbolCandidates,
    );
    const nestedBrokerSymbolCandidates = parseOptionalStringList(
      metadata.metadata?.brokerSymbolCandidates,
    );

    return {
      ...metadata,
      ...(topLevelBrokerSymbolCandidates.length > 0
        ? { brokerSymbolCandidates: [...topLevelBrokerSymbolCandidates] }
        : {}),
      ...(metadata.metadata
        ? {
            metadata: {
              ...metadata.metadata,
              ...(nestedBrokerSymbolCandidates.length > 0
                ? { brokerSymbolCandidates: [...nestedBrokerSymbolCandidates] }
                : {}),
            },
          }
        : {}),
    };
  }

  private _cloneHistoryDiagnostics(
    snapshot: OhlcHistoryDiagnosticsSnapshot,
  ): OhlcHistoryDiagnosticsSnapshot {
    return {
      ...snapshot,
      ...(snapshot.brokerSymbolCandidates
        ? {
            brokerSymbolCandidates: [...snapshot.brokerSymbolCandidates],
          }
        : {}),
    };
  }

  private _createHistoryDiagnosticsSnapshot(
    symbol: string,
    timeframeMinutes: number,
    metadata: OhlcHistoryResponseMetadata,
    resolvedBrokerSymbol?: string,
    attemptedBrokerSymbol?: string,
  ): OhlcHistoryDiagnosticsSnapshot {
    const nestedMetadata = metadata.metadata;
    const metadataWithPagination = metadata as OhlcHistoryMetadataWithPagination;
    const status = parseOptionalString(metadata.status ?? nestedMetadata?.status);
    const message = parseOptionalString(metadata.message ?? nestedMetadata?.message);
    const requestType = parseOptionalString(
      metadataWithPagination.requestType ?? nestedMetadata?.requestType,
    );
    const requestedLimit = normalizeOptionalInteger(
      metadata.requestedLimit ??
        metadata.limit ??
        nestedMetadata?.requestedLimit,
    );
    const returnedBarCount = normalizeOptionalInteger(
      metadata.returnedBarCount ??
        metadata.barCount ??
        nestedMetadata?.returnedBarCount,
    );
    const realBarCount = normalizeOptionalInteger(
      metadata.realBarCount ?? nestedMetadata?.realBarCount,
    );
    const brokerSymbol = parseOptionalString(
      metadata.brokerSymbol ?? nestedMetadata?.brokerSymbol,
    );
    const finalAttemptedBrokerSymbol = parseOptionalString(attemptedBrokerSymbol);
    const finalResolvedBrokerSymbol = parseOptionalString(
      resolvedBrokerSymbol ?? brokerSymbol ?? symbol,
    );
    const brokerSymbolCandidates = parseOptionalStringList(
      metadata.brokerSymbolCandidates ?? nestedMetadata?.brokerSymbolCandidates,
    );
    const historySparse = parseOptionalBoolean(
      metadata.historySparse ?? nestedMetadata?.historySparse,
    );
    const historyGapped = parseOptionalBoolean(
      metadata.historyGapped ?? nestedMetadata?.historyGapped,
    );
    const historyStale = parseOptionalBoolean(
      metadata.historyStale ?? nestedMetadata?.historyStale,
    );
    const managerFetchDeferred = parseOptionalBoolean(
      metadata.managerFetchDeferred ?? nestedMetadata?.managerFetchDeferred,
    );
    const managerFetchPending = parseOptionalBoolean(
      metadata.managerFetchPending ??
        (metadata as { manager_fetch_pending?: unknown }).manager_fetch_pending ??
        nestedMetadata?.managerFetchPending ??
        nestedMetadata?.['manager_fetch_pending'],
    );
    const managerFetchSucceeded = parseOptionalBoolean(
      metadata.managerFetchSucceeded ?? nestedMetadata?.managerFetchSucceeded,
    );
    const source = parseOptionalString(metadata.source ?? nestedMetadata?.source);
    const before = normalizeOptionalUnixMs(
      metadataWithPagination.beforeUnixMs ??
        metadataWithPagination.before ??
        nestedMetadata?.beforeUnixMs ??
        nestedMetadata?.before,
    );
    const nextBefore = normalizeOptionalUnixMs(
      metadataWithPagination.nextBeforeUnixMs ??
        metadataWithPagination.nextBefore ??
        nestedMetadata?.nextBeforeUnixMs ??
        nestedMetadata?.nextBefore,
    );
    const hasMore = parseOptionalBoolean(
      metadataWithPagination.hasMore ?? nestedMetadata?.hasMore,
    );
    const cacheOnly = parseOptionalBoolean(
      metadataWithPagination.cacheOnly ?? nestedMetadata?.cacheOnly,
    );
    const fromUnixMs = normalizeOptionalUnixMs(
      metadata.fromUnixMs ?? nestedMetadata?.fromUnixMs,
    );
    const toUnixMs = normalizeOptionalUnixMs(
      metadata.toUnixMs ?? nestedMetadata?.toUnixMs,
    );

    return {
      sessionId: this.sessionId,
      symbol,
      requestedSymbol: symbol,
      timeframeMinutes,
      ...(requestType ? { requestType } : {}),
      ...(requestedLimit !== undefined ? { requestedLimit } : {}),
      ...(returnedBarCount !== undefined ? { returnedBarCount } : {}),
      ...(realBarCount !== undefined ? { realBarCount } : {}),
      ...(status ? { status } : {}),
      ...(message ? { message } : {}),
      ...(source ? { source } : {}),
      ...(before !== undefined ? { before } : {}),
      ...(nextBefore !== undefined ? { nextBefore } : {}),
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(cacheOnly !== undefined ? { cacheOnly } : {}),
      ...(brokerSymbol ? { brokerSymbol } : {}),
      ...(finalAttemptedBrokerSymbol
        ? { attemptedBrokerSymbol: finalAttemptedBrokerSymbol }
        : {}),
      ...(finalResolvedBrokerSymbol
        ? { resolvedBrokerSymbol: finalResolvedBrokerSymbol }
        : {}),
      ...(brokerSymbolCandidates.length > 0 ? { brokerSymbolCandidates } : {}),
      ...(historySparse !== undefined ? { historySparse } : {}),
      ...(historyGapped !== undefined ? { historyGapped } : {}),
      ...(historyStale !== undefined ? { historyStale } : {}),
      ...(managerFetchDeferred !== undefined ? { managerFetchDeferred } : {}),
      ...(managerFetchPending !== undefined ? { managerFetchPending } : {}),
      ...(managerFetchSucceeded !== undefined ? { managerFetchSucceeded } : {}),
      ...(fromUnixMs !== undefined ? { fromUnixMs } : {}),
      ...(toUnixMs !== undefined ? { toUnixMs } : {}),
      updatedAtMs: Date.now(),
    };
  }

  private _rememberHistoryDiagnostics(
    key: SubKey,
    snapshot: OhlcHistoryDiagnosticsSnapshot,
  ) {
    const storedSnapshot = this._cloneHistoryDiagnostics(snapshot);
    this.historyDiagnostics.set(
      makeHistoryDiagnosticsKey(this.sessionId, key),
      storedSnapshot,
    );

    const timeframe = parseInt(key.split(':')[1] ?? '', 10);
    this.historyDiagnosticsListeners.forEach((listener) =>
      listener(
        storedSnapshot.symbol,
        Number.isFinite(timeframe)
          ? timeframe
          : storedSnapshot.timeframeMinutes,
        this._cloneHistoryDiagnostics(storedSnapshot),
      ),
    );
  }

  private _rememberHistoryMetadata(
    symbol: string,
    timeframeMinutes: number,
    metadata: OhlcHistoryResponseMetadata,
    extraKey?: SubKey,
    resolvedBrokerSymbol?: string,
    attemptedBrokerSymbol?: string,
  ) {
    if (!symbol.trim() || timeframeMinutes <= 0) {
      return;
    }

    const metadataCopy = this._cloneHistoryMetadata(metadata);
    const keys = new Set<SubKey>([makeSubKey(symbol, timeframeMinutes)]);
    if (extraKey) {
      keys.add(extraKey);
    }
    const exactMetadataSymbols = [
      symbol,
      resolvedBrokerSymbol,
      attemptedBrokerSymbol,
      metadataCopy.symbol,
      metadataCopy.brokerSymbol,
      metadataCopy.metadata?.symbol,
      metadataCopy.metadata?.brokerSymbol,
    ];

    for (const [requestKey, resolvedSymbol] of this.resolvedRequestSymbols.entries()) {
      const [requestSymbol, tfStr] = requestKey.split(':');
      if (parseInt(tfStr, 10) !== timeframeMinutes) {
        continue;
      }

      if (
        exactMetadataSymbols.some((candidate) =>
          ohlcSymbolsMatchExact(requestSymbol, candidate),
        ) ||
        exactMetadataSymbols.some((candidate) =>
          ohlcSymbolsMatchExact(resolvedSymbol, candidate),
        )
      ) {
        keys.add(requestKey);
      }
    }

    for (const key of this.subscribers.keys()) {
      const [subscriberSymbol, tfStr] = key.split(':');
      if (
        parseInt(tfStr, 10) === timeframeMinutes &&
        exactMetadataSymbols.some((candidate) =>
          ohlcSymbolsMatchExact(subscriberSymbol, candidate),
        )
      ) {
        keys.add(key);
      }
    }

    for (const key of keys) {
      const storedMetadata = this._cloneHistoryMetadata(metadataCopy);
      this.historyMetadata.set(key, storedMetadata);

      const timeframe = parseInt(key.split(':')[1] ?? '', 10);
      const diagnostics = this._createHistoryDiagnosticsSnapshot(
        symbol,
        Number.isFinite(timeframe) ? timeframe : timeframeMinutes,
        storedMetadata,
        resolvedBrokerSymbol ?? this.resolvedRequestSymbols.get(key),
        attemptedBrokerSymbol,
      );
      this._rememberHistoryDiagnostics(key, diagnostics);

      this.historyMetadataListeners.forEach((listener) =>
        listener(
          symbol,
          Number.isFinite(timeframe) ? timeframe : timeframeMinutes,
          this._cloneHistoryMetadata(storedMetadata),
        ),
      );
    }

    if (this.historyDiagnosticsDebugEnabled) {
      console.debug('[ohlcWebSocketService] history diagnostics', {
        symbol,
        timeframeMinutes,
        sessionId: this.sessionId,
        keys: [...keys],
        snapshot: this._createHistoryDiagnosticsSnapshot(
          symbol,
          timeframeMinutes,
          metadataCopy,
          resolvedBrokerSymbol,
          attemptedBrokerSymbol,
        ),
      });
    }
  }

  private _getLocalHistory(key: SubKey): OHLCBar[] {
    const combined: OHLCBar[] = [];
    for (const historyKey of this._getHistoryReadKeys(key, { includeCurrent: true })) {
      const history = this.history.get(historyKey) ?? [];
      const current = this.currentBars.get(historyKey);
      if (!current) {
        combined.push(...history);
        continue;
      }

      const keyBars = [...history];
      const keyLast = keyBars[keyBars.length - 1];
      if (!keyLast || keyLast.time !== current.time) {
        keyBars.push({ ...current });
      } else {
        keyBars[keyBars.length - 1] = this._blendHistoryWithCurrentBar(historyKey, current, keyLast);
      }

      combined.push(...keyBars);
    }

    return this._normalizeBars(combined, this._bucketMsForKey(key));
  }

  private _getDirectLocalHistory(key: SubKey): OHLCBar[] {
    const history = this.history.get(key) ?? [];
    const current = this.currentBars.get(key);
    if (!current) {
      return this._normalizeBars(history, this._bucketMsForKey(key));
    }

    const bars = [...history];
    const last = bars[bars.length - 1];
    if (!last || last.time !== current.time) {
      bars.push({ ...current });
    } else {
      bars[bars.length - 1] = this._blendHistoryWithCurrentBar(key, current, last);
    }

    return this._normalizeBars(bars, this._bucketMsForKey(key));
  }

  private _getStoredHistory(key: SubKey): OHLCBar[] {
    const combined: OHLCBar[] = [];
    for (const historyKey of this._getHistoryReadKeys(key, { includeCurrent: true })) {
      combined.push(...(this.history.get(historyKey) ?? []));
    }

    return this._normalizeBars(
      combined,
      this._bucketMsForKey(key),
    );
  }

  private _selectHistoryForRequest(
    key: SubKey,
    limit: number,
    range: HistoryRequestRange = {},
  ): OHLCBar[] {
    return this._selectBarsForRequest(this._getLocalHistory(key), limit, range);
  }

  private _selectStoredHistoryForRequest(
    key: SubKey,
    limit: number,
    range: HistoryRequestRange = {},
  ): OHLCBar[] {
    return this._selectBarsForRequest(this._getStoredHistory(key), limit, range);
  }

  private _selectCommittedHistoryForRequest(
    key: SubKey,
    limit: number,
    range: HistoryRequestRange = {},
  ): OHLCBar[] {
    return this._selectBarsForRequest(this._getStoredHistory(key), limit, range);
  }

  private _selectCommittedHistoryForPendingLatestFallback(
    key: SubKey,
    limit: number,
    range: HistoryRequestRange = {},
  ): OHLCBar[] {
    const directHistory = this.history.get(key) ?? [];
    if (directHistory.length > 0) {
      return this._selectBarsForRequest(directHistory, limit, range);
    }

    const combined: OHLCBar[] = [];
    for (const historyKey of this._getHistoryMergeKeys(key)) {
      combined.push(...(this.history.get(historyKey) ?? []));
    }

    return this._selectBarsForRequest(
      this._normalizeBars(combined, this._bucketMsForKey(key)),
      limit,
      range,
    );
  }

  private _hasDirectHistoryForKey(
    key: SubKey,
    options: { includeCurrent?: boolean } = {},
  ): boolean {
    return (
      (this.history.get(key)?.length ?? 0) > 0 ||
      (options.includeCurrent === true && this.currentBars.has(key))
    );
  }

  private _getHistoryReadKeys(
    key: SubKey,
    options: { includeCurrent?: boolean } = {},
  ): SubKey[] {
    return this._hasDirectHistoryForKey(key, options)
      ? [key]
      : this._getHistoryMergeKeys(key);
  }

  private _selectBarsForRequest(
    bars: OHLCBar[],
    limit: number,
    range: HistoryRequestRange = {},
  ): OHLCBar[] {
    const parsedLimit = Number.isFinite(limit)
      ? Math.trunc(limit)
      : DEFAULT_OHLC_HISTORY_LIMIT;
    const requestLimit = Math.min(
      DEFAULT_OHLC_HISTORY_LIMIT,
      Math.max(1, parsedLimit),
    );
    const { beforeUnixMs, fromUnixMs, toUnixMs } = range;
    let source = bars;

    for (let index = 1; index < source.length; index += 1) {
      if (source[index - 1].time > source[index].time) {
        source = [...source].sort((left, right) => left.time - right.time);
        break;
      }
    }

    const selected: OHLCBar[] = [];
    for (let index = source.length - 1; index >= 0; index -= 1) {
      const bar = source[index];

      if (beforeUnixMs !== undefined && bar.time >= beforeUnixMs) {
        continue;
      }
      if (toUnixMs !== undefined && bar.time > toUnixMs) {
        continue;
      }
      if (fromUnixMs !== undefined && bar.time < fromUnixMs) {
        break;
      }

      selected.push({ ...bar });
      if (selected.length >= requestLimit) {
        break;
      }
    }

    return selected.reverse();
  }

  private _startSimulation() {
    if (this.simulationInterval) {
      return;
    }

    this.simulationInterval = setInterval(() => {
      const now = Date.now();
      const symbols = new Map<string, string>();

      this.subscribers.forEach((_, key) => {
        const symbol = key.split(':')[0];
        const canonical = getCanonicalSymbol(symbol);
        if (!symbols.has(canonical)) {
          symbols.set(canonical, symbol);
        }
      });

      symbols.forEach((symbol) => {
        const baseKey = normalizeSymbolKey(symbol);
        let price = this.simulationPrices[symbol] ?? this.simulationPrices[baseKey] ?? 1;

        const volatility = Math.max(
          price * 0.00015,
          price > 1000 ? 0.15 : price > 100 ? 0.02 : price > 10 ? 0.005 : 0.00008,
        );
        const change = (Math.random() - 0.495) * volatility * 2;
        price = Math.max(price * 0.99, price + change);

        for (const alias of getSymbolAliases(symbol)) {
          if (this.simulationPrices[alias] !== undefined) {
            this.simulationPrices[alias] = price;
          }
        }

        this.simulationPrices[symbol] = price;
        if (this.simulationPrices[baseKey] !== undefined) {
          this.simulationPrices[baseKey] = price;
        }

        this._aggregateTick(
          symbol,
          price,
          Math.floor(Math.random() * 10 + 1),
          now,
          'client_simulation_tick',
        );
      });
    }, 500);
  }

  private _stopSimulation() {
    if (!this.simulationInterval) {
      return;
    }

    clearInterval(this.simulationInterval);
    this.simulationInterval = null;
  }
}

export const ohlcService = new OhlcWebSocketService();
