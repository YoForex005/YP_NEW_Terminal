import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getCanonicalSymbol, normalizeSymbolKey } from "@/lib/market-symbols";
import Redis from "ioredis";

const redisCache = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

type JsonRecord = Record<string, unknown>;

interface TerminalSessionResponse {
  ok?: boolean;
  state?: string;
  token?: string;
  expiresAt?: string | number;
  accountId?: string | number;
  login?: string | number;
  brokerId?: string;
  terminalSessionId?: string;
  error?: string;
  code?: string;
}

interface TerminalSessionContext {
  token: string;
  dedupeIdentity: string;
}

export interface TerminalOhlcRepairRequest {
  symbol: string;
  timeframeMinutes: number;
  limit: number;
  requestType: "latest" | "get_before" | "range";
  beforeUnixMs?: number;
  fromUnixMs?: number;
  toUnixMs?: number;
  reason?: string;
}

export interface TerminalOhlcRepairDiagnostics {
  ready: boolean;
  repaired: boolean;
  repairAttempted: boolean;
  gaps: boolean;
  stale: boolean;
  source: string;
  phase: "probe" | "repair";
  status?: string;
  message?: string;
  reason?: string;
  symbol: string;
  timeframeMinutes: number;
  requestedLimit: number;
  returnedBarCount: number;
  realBarCount: number;
  historySparse: boolean;
  historyGapped: boolean;
  historyStale: boolean;
  managerFetchDeferred: boolean;
  managerFetchPending: boolean;
  managerFetchSucceeded: boolean;
  retryAfterMs?: number;
  beforeUnixMs?: number;
  fromUnixMs?: number;
  toUnixMs?: number;
}

export interface TerminalOhlcRepairResult extends TerminalOhlcRepairDiagnostics {
  accountId: string;
  checkedAt: string;
  probe: TerminalOhlcRepairDiagnostics;
  repair?: TerminalOhlcRepairDiagnostics;
  bars?: unknown[];
}

export class TerminalBridgeError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status = 500, code = "TERMINAL_BRIDGE_ERROR", details?: unknown) {
    super(message);
    this.name = "TerminalBridgeError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TERMINAL_SESSION_NON_OK_RESPONSE_ERROR = Symbol("terminal-session-non-ok-response-error");
type TerminalSessionNonOkResponseError = TerminalBridgeError & {
  [TERMINAL_SESSION_NON_OK_RESPONSE_ERROR]?: true;
};

const DEFAULT_WS_TIMEOUT_MS = 30_000;
export const TERMINAL_OHLC_REPAIR_DEFAULT_LIMIT = 720;
export const TERMINAL_OHLC_REPAIR_MAX_LIMIT = 5_000;
export const TERMINAL_OHLC_REPAIR_PROBE_TIMEOUT_MS = 6_000;
export const TERMINAL_OHLC_REPAIR_FILL_TIMEOUT_MS = 8_000;
export const TERMINAL_OHLC_REPAIR_SESSION_TIMEOUT_MS = 5_000;
export const TERMINAL_OHLC_REPAIR_ROUTE_TIMEOUT_MS = 12_000;
export const TERMINAL_OHLC_REPAIR_LANE_STAGGER_MS = 100;
export const TERMINAL_OHLC_REPAIR_BUSY_RETRY_AFTER_MS = 30_000;
export const TERMINAL_OHLC_REPAIR_LANE_BUSY_RETRY_AFTER_MS = 15_000;
export const TERMINAL_OHLC_REPAIR_SESSION_RETRY_AFTER_MS = 5_000;
const TERMINAL_SESSION_CONTEXT_CACHE_REUSE_MARGIN_MS = 75_000;
const TERMINAL_SESSION_CONTEXT_UNKNOWN_EXPIRY_REUSE_MS = 30_000;

// ---------------------------------------------------------------------------
// Circuit breaker — OHLC upstream availability
//
// Three states:
//   CLOSED   (openedAt=null, halfOpen=false) — normal, all requests pass
//   OPEN     (openedAt=Date.now(), halfOpen=false) — upstream known-down, all blocked
//   HALF_OPEN(openedAt=set, halfOpen=true)  — cooldown expired, ONE probe allowed
//
// On success in HALF_OPEN → CLOSED.
// On failure in HALF_OPEN → back to OPEN immediately.
// ---------------------------------------------------------------------------
const OHLC_CIRCUIT_BREAKER_THRESHOLD = 4;          // failures before OPEN (raised from 2 so a burst of 2 failing symbols doesn't block all)
const OHLC_CIRCUIT_BREAKER_COOLDOWN_MS = 20_000;   // 20 s OPEN window before HALF_OPEN (faster recovery)

interface OhlcCircuitBreakerState {
  failures: number;
  openedAt: number | null;  // Date.now() when circuit tripped, null = closed
  halfOpen: boolean;        // true = one probe request allowed through
}

const ohlcCircuitBreakerByWsUrl = new Map<string, OhlcCircuitBreakerState>();

const getOhlcCircuitBreaker = (wsUrl: string): OhlcCircuitBreakerState => {
  let state = ohlcCircuitBreakerByWsUrl.get(wsUrl);
  if (!state) {
    state = { failures: 0, openedAt: null, halfOpen: false };
    ohlcCircuitBreakerByWsUrl.set(wsUrl, state);
  }
  return state;
};

/**
 * Returns true if the circuit is OPEN (block the request).
 * Transitions OPEN → HALF_OPEN when the cooldown expires and sets `halfOpen`
 * so only the FIRST caller in the half-open window gets through.
 */
const isOhlcCircuitOpen = (wsUrl: string): boolean => {
  const state = ohlcCircuitBreakerByWsUrl.get(wsUrl);
  if (!state || state.openedAt === null) return false;

  if (Date.now() - state.openedAt >= OHLC_CIRCUIT_BREAKER_COOLDOWN_MS) {
    if (!state.halfOpen) {
      // Transition to HALF_OPEN — let exactly one probe request through.
      state.halfOpen = true;
      console.info(
        `[terminal-ws-bridge] OHLC circuit breaker HALF-OPEN for ${wsUrl} — allowing one probe request.`,
      );
    } else {
      // Already HALF_OPEN and another request arrived before the probe settled.
      // Keep blocking to enforce the single-probe guarantee.
      return true;
    }
    return false;
  }

  return true;
};

const recordOhlcCircuitSuccess = (wsUrl: string): void => {
  const state = ohlcCircuitBreakerByWsUrl.get(wsUrl);
  if (!state) return;
  if (state.halfOpen) {
    console.info(`[terminal-ws-bridge] OHLC circuit breaker CLOSED for ${wsUrl} — upstream recovered.`);
  }
  state.failures = 0;
  state.openedAt = null;
  state.halfOpen = false;
};

const recordOhlcCircuitFailure = (wsUrl: string): void => {
  const state = getOhlcCircuitBreaker(wsUrl);

  if (state.halfOpen) {
    // Probe in HALF_OPEN failed — re-open immediately.
    state.halfOpen = false;
    state.openedAt = Date.now();
    console.warn(
      `[terminal-ws-bridge] OHLC circuit breaker re-OPEN for ${wsUrl} — half-open probe failed. ` +
      `Blocking for another ${OHLC_CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s.`,
    );
    return;
  }

  state.failures += 1;
  if (state.failures >= OHLC_CIRCUIT_BREAKER_THRESHOLD && state.openedAt === null) {
    state.openedAt = Date.now();
    console.warn(
      `[terminal-ws-bridge] OHLC circuit breaker OPEN for ${wsUrl} after ${state.failures} consecutive upstream failures. ` +
      `Blocking repair requests for ${OHLC_CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s.`,
    );
  }
};

const buildGatewayHealthUrl = (wsUrl: string): string | null => {
  try {
    const url = new URL(wsUrl);
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/health";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
};

const isGatewayHealthReady = async (
  wsUrl: string,
  timeoutMs = 750,
): Promise<boolean> => {
  const healthUrl = buildGatewayHealthUrl(wsUrl);
  if (!healthUrl) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(healthUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!payload || typeof payload !== "object") {
      return true;
    }

    const status = (payload as { status?: unknown }).status;
    const ok = (payload as { ok?: unknown }).ok;
    return ok === true || status === "ready" || status === "ok";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const closeOhlcCircuitIfGatewayRecovered = async (wsUrl: string): Promise<boolean> => {
  if (!(await isGatewayHealthReady(wsUrl))) {
    return false;
  }

  recordOhlcCircuitSuccess(wsUrl);
  console.info(
    `[terminal-ws-bridge] OHLC circuit breaker CLOSED for ${wsUrl} — gateway health is ready.`,
  );
  return true;
};


const pendingTerminalOhlcRepairRequests = new Map<string, Promise<TerminalOhlcRepairResult>>();
const terminalSessionContextCache = new Map<string, {
  context: TerminalSessionContext;
  expiresAtMs: number | null;
  cachedAtMs: number;
}>();
const pendingTerminalSessionContextResolutions = new Map<string, Promise<TerminalSessionContext>>();
let terminalOhlcRepairLaneBusy = false;
let terminalOhlcRepairLaneLastStartedAt = 0;
const TERMINAL_OHLC_TIMEFRAME_ALIASES: Record<string, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440,
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseJsonSafely = (text: string): unknown => {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

const parseOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const parseOptionalInteger = (value: unknown): number | undefined => {
  if (typeof value === "string") {
    const alias = TERMINAL_OHLC_TIMEFRAME_ALIASES[value.trim().toUpperCase()];
    if (alias !== undefined) {
      return alias;
    }
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.trunc(parsed);
};

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
};

const normalizeOptionalUnixMs = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.trunc(parsed < 10_000_000_000 ? parsed * 1000 : parsed);
  }

  if (typeof value === "string") {
    const dateMs = new Date(value).getTime();
    if (Number.isFinite(dateMs) && dateMs >= 0) {
      return Math.trunc(dateMs);
    }
  }

  return undefined;
};

const getNestedRecord = (record: JsonRecord, key: string): JsonRecord | undefined => {
  const nested = record[key];
  return isRecord(nested) ? nested : undefined;
};

const getOhlcResponseSource = (payload: unknown): JsonRecord => {
  if (!isRecord(payload)) {
    return {};
  }

  return getNestedRecord(payload, "result") ??
    getNestedRecord(payload, "payload") ??
    getNestedRecord(payload, "data") ??
    payload;
};

const extractOhlcResponseBars = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const direct = payload.bars ?? payload.history ?? payload.candles ?? payload.ohlc ?? payload.data;
  if (Array.isArray(direct)) {
    return direct;
  }

  if (isRecord(direct)) {
    const nested = direct.bars ?? direct.history ?? direct.candles ?? direct.ohlc;
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  const result = payload.result;
  if (Array.isArray(result)) {
    return result;
  }

  if (isRecord(result)) {
    const nested = result.bars ?? result.history ?? result.candles ?? result.ohlc;
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  return [];
};

export const normalizeTerminalOhlcRepairRequest = (
  input: unknown,
): TerminalOhlcRepairRequest => {
  if (!isRecord(input)) {
    throw new TerminalBridgeError(
      "OHLC repair request body must be a JSON object.",
      400,
      "INVALID_OHLC_REPAIR_BODY",
    );
  }

  const symbol = parseOptionalString(input.symbol);
  if (!symbol) {
    throw new TerminalBridgeError(
      "symbol is required for OHLC repair.",
      400,
      "OHLC_SYMBOL_REQUIRED",
    );
  }

  const timeframeMinutes = parseOptionalInteger(
    input.timeframeMinutes ?? input.timeframe_minutes ?? input.timeframe,
  );
  if (!timeframeMinutes || timeframeMinutes <= 0) {
    throw new TerminalBridgeError(
      "timeframeMinutes is required for OHLC repair.",
      400,
      "OHLC_TIMEFRAME_REQUIRED",
    );
  }

  const rawLimit = parseOptionalInteger(input.limit) ?? TERMINAL_OHLC_REPAIR_DEFAULT_LIMIT;
  const limit = Math.min(TERMINAL_OHLC_REPAIR_MAX_LIMIT, Math.max(1, rawLimit));
  const beforeUnixMs = normalizeOptionalUnixMs(
    input.beforeUnixMs ?? input.before_unix_ms ?? input.before ?? input.getBefore ?? input.get_before,
  );
  const fromUnixMs = normalizeOptionalUnixMs(input.fromUnixMs ?? input.from_unix_ms ?? input.from);
  const toUnixMs = normalizeOptionalUnixMs(input.toUnixMs ?? input.to_unix_ms ?? input.to);
  if (fromUnixMs !== undefined && toUnixMs !== undefined && fromUnixMs >= toUnixMs) {
    throw new TerminalBridgeError(
      "fromUnixMs must be earlier than toUnixMs for OHLC repair.",
      400,
      "INVALID_OHLC_REPAIR_RANGE",
    );
  }

  const requestType = beforeUnixMs !== undefined
    ? "get_before"
    : fromUnixMs !== undefined || toUnixMs !== undefined
      ? "range"
      : "latest";
  const reason = parseOptionalString(input.reason);

  return {
    symbol,
    timeframeMinutes,
    limit,
    requestType,
    ...(beforeUnixMs !== undefined ? { beforeUnixMs } : {}),
    ...(fromUnixMs !== undefined ? { fromUnixMs } : {}),
    ...(toUnixMs !== undefined ? { toUnixMs } : {}),
    ...(reason ? { reason } : {}),
  };
};

export const buildTerminalOhlcRepairActionPayload = (
  normalized: TerminalOhlcRepairRequest,
  options: { cacheOnly: boolean; cacheFirst: boolean; repair?: boolean; forceUpstream?: boolean },
): JsonRecord => ({
  symbol: normalized.symbol,
  timeframeMinutes: normalized.timeframeMinutes,
  limit: normalized.limit,
  requestType: normalized.requestType,
  cacheFirst: options.cacheFirst,
  cacheOnly: options.cacheOnly,
  ...(options.repair
    ? {
        repair: true,
        repairCache: true,
        // forceUpstream tells the Rust gateway to skip its PostgreSQL DB cache.
        // Only set this when we KNOW the DB is empty and we must hit C++ directly.
        ...(options.forceUpstream ? { forceRefresh: true, forceUpstream: true } : {}),
      }
    : {}),
  ...(normalized.reason ? { reason: normalized.reason } : {}),
  ...(normalized.beforeUnixMs !== undefined
    ? {
        beforeUnixMs: normalized.beforeUnixMs,
        before_unix_ms: normalized.beforeUnixMs,
      }
    : {}),
  ...(normalized.fromUnixMs !== undefined ? { fromUnixMs: normalized.fromUnixMs } : {}),
  ...(normalized.toUnixMs !== undefined ? { toUnixMs: normalized.toUnixMs } : {}),
});


export const summarizeTerminalOhlcRepairPayload = (
  payload: unknown,
  request: TerminalOhlcRepairRequest,
  phase: "probe" | "repair",
): TerminalOhlcRepairDiagnostics => {
  const source = getOhlcResponseSource(payload);
  const metadata = isRecord(source.metadata) ? source.metadata : {};
  const bars = extractOhlcResponseBars(payload);
  const returnedBarCount =
    parseOptionalInteger(source.returnedBarCount) ??
    parseOptionalInteger(source.barCount) ??
    parseOptionalInteger(metadata.returnedBarCount) ??
    parseOptionalInteger(metadata.barCount) ??
    bars.length;
  const realBarCount =
    parseOptionalInteger(source.realBarCount) ??
    parseOptionalInteger(metadata.realBarCount) ??
    returnedBarCount;
  const status = parseOptionalString(
    source.status ??
      metadata.status ??
      source.managerFetchStatus ??
      metadata.managerFetchStatus ??
      source.backfillStatus ??
      metadata.backfillStatus,
  );
  const message = parseOptionalString(source.message ?? metadata.message);
  const reason = parseOptionalString(source.reason ?? metadata.reason);
  const retryAfterMs = parseOptionalInteger(
    source.retryAfterMs ??
      metadata.retryAfterMs ??
      source.managerFetchRetryAfterMs ??
      metadata.managerFetchRetryAfterMs ??
      source.backfillRetryAfterMs ??
      metadata.backfillRetryAfterMs,
  );
  const sourceName =
    parseOptionalString(source.source ?? metadata.source) ??
    (phase === "probe" ? "cache_probe" : "repair");
  const historySparse =
    parseOptionalBoolean(source.historySparse ?? metadata.historySparse) ?? false;
  const historyGapped =
    parseOptionalBoolean(source.historyGapped ?? metadata.historyGapped) ?? false;
  const historyStale =
    parseOptionalBoolean(source.historyStale ?? metadata.historyStale) ?? false;
  const managerFetchDeferred =
    parseOptionalBoolean(source.managerFetchDeferred ?? metadata.managerFetchDeferred) ?? false;
  const managerFetchPending =
    parseOptionalBoolean(
      source.managerFetchPending ??
        source.manager_fetch_pending ??
        metadata.managerFetchPending ??
        metadata.manager_fetch_pending,
    ) ?? false;
  const managerFetchSucceeded =
    parseOptionalBoolean(source.managerFetchSucceeded ?? metadata.managerFetchSucceeded) ?? false;
  const pendingStatus = Boolean(status && /pending|deferred|queued|loading/i.test(status));
  const gaps = historyGapped || historySparse;
  const stale =
    historyStale ||
    managerFetchDeferred ||
    managerFetchPending ||
    pendingStatus ||
    returnedBarCount <= 0;
  const ready = returnedBarCount > 0 && realBarCount > 0 && !gaps && !stale;

  return {
    ready,
    repaired: false,
    repairAttempted: phase === "repair",
    gaps,
    stale,
    source: sourceName,
    phase,
    ...(status ? { status } : {}),
    ...(message ? { message } : {}),
    ...(reason ? { reason } : {}),
    symbol:
      parseOptionalString(source.symbol ?? metadata.symbol) ??
      request.symbol,
    timeframeMinutes:
      parseOptionalInteger(
        source.timeframeMinutes ??
          source.timeframe_minutes ??
          metadata.timeframeMinutes,
      ) ?? request.timeframeMinutes,
    requestedLimit:
      parseOptionalInteger(source.requestedLimit ?? source.limit ?? metadata.requestedLimit) ??
      request.limit,
    returnedBarCount,
    realBarCount,
    historySparse,
    historyGapped,
    historyStale,
    managerFetchDeferred,
    managerFetchPending,
    managerFetchSucceeded,
    ...(retryAfterMs !== undefined && retryAfterMs > 0 ? { retryAfterMs } : {}),
    ...(request.beforeUnixMs !== undefined ? { beforeUnixMs: request.beforeUnixMs } : {}),
    ...(request.fromUnixMs !== undefined ? { fromUnixMs: request.fromUnixMs } : {}),
    ...(request.toUnixMs !== undefined ? { toUnixMs: request.toUnixMs } : {}),
  };
};

const isTerminalOhlcRepairManagerBusy = (
  diagnostics: Pick<
    TerminalOhlcRepairDiagnostics,
    | "managerFetchDeferred"
    | "managerFetchPending"
    | "status"
    | "source"
    | "message"
    | "reason"
    | "returnedBarCount"
    | "realBarCount"
  >,
): boolean => {
  if (
    diagnostics.reason === "rust_cache_miss" &&
    diagnostics.source === "rust_deferred" &&
    diagnostics.returnedBarCount <= 0 &&
    diagnostics.realBarCount <= 0
  ) {
    return false;
  }

  if (diagnostics.managerFetchDeferred || diagnostics.managerFetchPending) {
    return true;
  }

  const searchableText = [
    diagnostics.status,
    diagnostics.source,
    diagnostics.message,
  ].filter(Boolean).join(" ");

  return /manager[_\s-]?(?:state[_\s-]?)?busy|manager_cooldown|scheduler_busy|already_pending|repair_pending|history[_\s-]?pending|backfill.*pending|defer(?:red)?|queued/i.test(searchableText);
};

export const shouldRepairTerminalOhlcHistory = (
  diagnostics: TerminalOhlcRepairDiagnostics,
): boolean =>
  // `ready` already encodes: returnedBarCount>0, realBarCount>0, !gaps, !stale.
  // Checking the sub-fields would duplicate that logic and diverge silently if
  // the `ready` computation ever changes.
  !diagnostics.ready;

export const buildTerminalOhlcRepairDeferredResult = (
  accountId: string,
  input: unknown,
  message: string,
  options: {
    source?: string;
    status?: string;
    retryAfterMs?: number;
    symbol?: string;
    timeframeMinutes?: number;
    requestedLimit?: number;
  } = {},
): TerminalOhlcRepairResult => {
  const request = normalizeTerminalOhlcRepairRequest(input);
  const probe: TerminalOhlcRepairDiagnostics = {
    ready: false,
    repaired: false,
    repairAttempted: true,
    gaps: true,
    stale: true,
    source: options.source ?? "route_timeout",
    phase: "probe",
    status: options.status ?? "repair_pending",
    message,
    symbol: options.symbol ?? request.symbol,
    timeframeMinutes: options.timeframeMinutes ?? request.timeframeMinutes,
    requestedLimit: options.requestedLimit ?? request.limit,
    returnedBarCount: 0,
    realBarCount: 0,
    historySparse: true,
    historyGapped: true,
    historyStale: true,
    managerFetchDeferred: true,
    managerFetchPending: true,
    managerFetchSucceeded: false,
    ...(options.retryAfterMs !== undefined && options.retryAfterMs > 0
      ? { retryAfterMs: options.retryAfterMs }
      : {}),
    ...(request.beforeUnixMs !== undefined ? { beforeUnixMs: request.beforeUnixMs } : {}),
    ...(request.fromUnixMs !== undefined ? { fromUnixMs: request.fromUnixMs } : {}),
    ...(request.toUnixMs !== undefined ? { toUnixMs: request.toUnixMs } : {}),
  };

  return {
    ...probe,
    accountId,
    checkedAt: new Date().toISOString(),
    probe,
  };
};

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const parseTerminalSessionTokenPayload = (token: string): JsonRecord => {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex <= 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(Buffer.from(token.slice(0, dotIndex), "base64url").toString("utf8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const terminalSessionIdentityPart = (value: unknown): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
};

const buildTerminalSessionDedupeIdentity = (session: TerminalSessionResponse & { token: string }): string => {
  const tokenPayload = parseTerminalSessionTokenPayload(session.token);
  const stableParts = [
    terminalSessionIdentityPart(tokenPayload.userId),
    terminalSessionIdentityPart(session.terminalSessionId ?? tokenPayload.terminalSessionId),
    terminalSessionIdentityPart(session.accountId ?? tokenPayload.accountId),
    terminalSessionIdentityPart(session.login ?? tokenPayload.login),
    terminalSessionIdentityPart(session.brokerId ?? tokenPayload.brokerId),
  ];
  const stableIdentity = stableParts.join("|");

  return sha256Hex(stableParts.some(Boolean) ? stableIdentity : session.token);
};

const getTerminalOhlcRepairDedupeSymbolKey = (symbol: string): string =>
  getCanonicalSymbol(symbol) ||
  normalizeSymbolKey(symbol) ||
  symbol.trim().toUpperCase();

const makeTerminalOhlcRepairDedupeKey = (
  sessionIdentity: string,
  accountId: string,
  request: TerminalOhlcRepairRequest,
): string =>
  [
    sessionIdentity,
    accountId,
    getTerminalOhlcRepairDedupeSymbolKey(request.symbol),
    request.timeframeMinutes,
    request.limit,
    request.requestType,
    request.beforeUnixMs ?? "",
    request.fromUnixMs ?? "",
    request.toUnixMs ?? "",
  ].join("|");

const tryAcquireTerminalOhlcRepairLane = async (): Promise<(() => void) | null> => {
  if (terminalOhlcRepairLaneBusy) {
    return null;
  }

  terminalOhlcRepairLaneBusy = true;
  const elapsedSinceLastStart = Date.now() - terminalOhlcRepairLaneLastStartedAt;
  const waitMs = Math.max(0, TERMINAL_OHLC_REPAIR_LANE_STAGGER_MS - elapsedSinceLastStart);
  if (waitMs > 0) {
    await delay(waitMs);
  }
  terminalOhlcRepairLaneLastStartedAt = Date.now();

  let released = false;
  return () => {
    if (released) {
      return;
    }

    released = true;
    terminalOhlcRepairLaneBusy = false;
  };
};

const requestHeader = (request: NextRequest, name: string): string | null => {
  const value = request.headers.get(name);
  return value && value.trim() ? value : null;
};

const buildTerminalSessionContextCacheKey = (
  request: NextRequest,
  accountId: string,
): string | null => {
  const authorization = requestHeader(request, "authorization") ?? "";
  const cookie = requestHeader(request, "cookie") ?? "";
  if (!authorization && !cookie) {
    return null;
  }

  return sha256Hex([accountId.trim(), authorization, cookie].join("\u001f"));
};

const normalizeTerminalSessionExpiryMs = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
};

const getTerminalSessionTokenExpiryMs = (token: string): number | null =>
  normalizeTerminalSessionExpiryMs(parseTerminalSessionTokenPayload(token).exp);

const getTerminalSessionContextExpiryMs = (
  session: TerminalSessionResponse & { token: string },
): number | null =>
  normalizeTerminalSessionExpiryMs(session.expiresAt) ??
  getTerminalSessionTokenExpiryMs(session.token);

const getCachedTerminalSessionContext = (
  cacheKey: string | null,
): TerminalSessionContext | null => {
  if (!cacheKey) {
    return null;
  }

  const cached = terminalSessionContextCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  const reusable = cached.expiresAtMs !== null
    ? cached.expiresAtMs - Date.now() > TERMINAL_SESSION_CONTEXT_CACHE_REUSE_MARGIN_MS
    : Date.now() - cached.cachedAtMs < TERMINAL_SESSION_CONTEXT_UNKNOWN_EXPIRY_REUSE_MS;
  if (!reusable) {
    terminalSessionContextCache.delete(cacheKey);
    return null;
  }

  return cached.context;
};

const cacheTerminalSessionContext = (
  cacheKey: string | null,
  session: TerminalSessionResponse & { token: string },
  context: TerminalSessionContext,
): void => {
  if (!cacheKey) {
    return;
  }

  terminalSessionContextCache.set(cacheKey, {
    context,
    expiresAtMs: getTerminalSessionContextExpiryMs(session),
    cachedAtMs: Date.now(),
  });
};

export const clearTerminalSessionContextCacheForTests = (): void => {
  terminalSessionContextCache.clear();
  pendingTerminalSessionContextResolutions.clear();
};

const TERMINAL_SESSION_OHLC_DEFERRED_CODES = new Set([
  "TERMINAL_SESSION_TIMEOUT",
  "TERMINAL_SESSION_RESOLVE_TIMEOUT",
]);

const TERMINAL_SESSION_HARD_FAILURE_STATUSES = new Set([401, 403, 423]);

const isTerminalSessionNonOkResponseError = (
  error: TerminalBridgeError,
): error is TerminalSessionNonOkResponseError =>
  (error as TerminalSessionNonOkResponseError)[TERMINAL_SESSION_NON_OK_RESPONSE_ERROR] === true;

const buildTerminalSessionNonOkError = (
  response: Response,
  payload: unknown,
): TerminalBridgeError => {
  const body = isRecord(payload) ? payload : {};
  const error = new TerminalBridgeError(
    typeof body.error === "string"
      ? body.error
      : `Terminal session request failed with status ${response.status}.`,
    response.status,
    typeof body.code === "string" ? body.code : "TERMINAL_SESSION_FAILED",
    payload,
  );

  Object.defineProperty(error, TERMINAL_SESSION_NON_OK_RESPONSE_ERROR, {
    value: true,
  });

  return error;
};

export const isTerminalSessionResolveDeferredError = (
  error: unknown,
): error is TerminalBridgeError => {
  if (!(error instanceof TerminalBridgeError)) {
    return false;
  }

  if (error.code === "TERMINAL_SESSION_RESOLVE_TIMEOUT" && error.status === 504) {
    return true;
  }

  return (
    isTerminalSessionNonOkResponseError(error) &&
    TERMINAL_SESSION_OHLC_DEFERRED_CODES.has(error.code) &&
    !TERMINAL_SESSION_HARD_FAILURE_STATUSES.has(error.status)
  );
};

export const requireTradingAccountId = (request: NextRequest): string => {
  const { searchParams } = new URL(request.url);
  const accountId =
    searchParams.get("accountId") ??
    searchParams.get("account_id") ??
    searchParams.get("account") ??
    "";

  const trimmed = accountId.trim();
  if (!trimmed) {
    throw new TerminalBridgeError(
      "accountId query parameter is required. Example: ?accountId=mt5-303108",
      400,
      "ACCOUNT_ID_REQUIRED",
    );
  }

  return trimmed;
};

const buildForwardedAuthHeaders = (request: NextRequest): HeadersInit => {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const authorization = requestHeader(request, "authorization");
  if (authorization) {
    headers.Authorization = authorization;
  }

  const cookie = requestHeader(request, "cookie");
  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
};

const buildTerminalSessionResolveTimeoutError = (): TerminalBridgeError =>
  new TerminalBridgeError(
    `Terminal session resolution timed out after ${TERMINAL_OHLC_REPAIR_SESSION_TIMEOUT_MS / 1000}s. ` +
    `The accounts backend may be slow or the MT5 manager lock may be contended.`,
    504,
    "TERMINAL_SESSION_RESOLVE_TIMEOUT",
  );

const isFetchAbortTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || error.name === "TimeoutError";
};

const resolveTerminalSessionContext = async (
  request: NextRequest,
  accountId: string,
  cacheKey = buildTerminalSessionContextCacheKey(request, accountId),
): Promise<TerminalSessionContext> => {
  const cached = getCachedTerminalSessionContext(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = cacheKey
    ? pendingTerminalSessionContextResolutions.get(cacheKey)
    : undefined;
  if (pending) {
    return pending;
  }

  const resolution = (async (): Promise<TerminalSessionContext> => {
    const sessionUrl = new URL(
      `/api/private/accounts/${encodeURIComponent(accountId)}/terminal-session`,
      request.url,
    );

    // Hard deadline on the HTTP round-trip so a hung terminal-session route
    // (accounts-backend slow / MT5 manager locked) doesn't block the caller
    // indefinitely. 10 s is well above the terminal-session's own worst-case
    // phase budget (~8.5 s) while still leaving headroom before Next.js kills
    // the outer ohlc-repair route at 60 s.
    let response: Response;
    try {
      response = await fetch(sessionUrl, {
        headers: buildForwardedAuthHeaders(request),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      if (isFetchAbortTimeoutError(error)) {
        throw buildTerminalSessionResolveTimeoutError();
      }

      throw error;
    }

    const raw = await response.text();
    const payload = parseJsonSafely(raw);

    if (!response.ok) {
      throw buildTerminalSessionNonOkError(response, payload);
    }

    const session = isRecord(payload) ? (payload as TerminalSessionResponse) : {};
    if (!session.token || typeof session.token !== "string") {
      throw new TerminalBridgeError(
        session.error ||
          "Terminal session did not return a WebSocket token. Unlock the account first if it is password-protected.",
        session.state === "locked" ? 423 : 502,
        session.code || "TERMINAL_TOKEN_MISSING",
        payload,
      );
    }

    if (!session.token.includes(".")) {
      throw new TerminalBridgeError(
        "Terminal session returned a malformed token. Expected a dotted terminal WebSocket token.",
        502,
        "MALFORMED_TERMINAL_TOKEN",
      );
    }

    const context = {
      token: session.token,
      dedupeIdentity: buildTerminalSessionDedupeIdentity({
        ...session,
        token: session.token,
      }),
    };
    cacheTerminalSessionContext(cacheKey, { ...session, token: session.token }, context);
    return context;
  })();

  if (cacheKey) {
    pendingTerminalSessionContextResolutions.set(cacheKey, resolution);
  }

  try {
    return await resolution;
  } finally {
    if (cacheKey) {
      pendingTerminalSessionContextResolutions.delete(cacheKey);
    }
  }
};

const resolveTerminalSessionContextForOhlcRepair = async (
  request: NextRequest,
  accountId: string,
  cacheKey: string | null,
): Promise<TerminalSessionContext> => {
  const cachedSessionContext = getCachedTerminalSessionContext(cacheKey);
  if (cachedSessionContext) {
    return cachedSessionContext;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolveTerminalSessionContext(request, accountId, cacheKey),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(buildTerminalSessionResolveTimeoutError()),
          TERMINAL_OHLC_REPAIR_SESSION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const normalizeWebSocketUrl = (request: NextRequest): string => {
  // Server-side: prefer the Rust gateway URL so probes hit the PostgreSQL DB
  // cache (fast, no C++ round-trip needed for cacheOnly requests).
  const configured =
    process.env.RUST_GATEWAY_WS_URL?.trim() ||
    process.env.WS_BACKEND_URL?.trim() ||
    process.env.CPP_REALTIME_WS_URL?.trim() ||
    process.env.NEXT_PUBLIC_WS_URL?.trim() ||
    "ws://127.0.0.1:3003";

  if (configured.startsWith("ws://") || configured.startsWith("wss://")) {
    return configured;
  }

  if (configured.startsWith("http://")) {
    return `ws://${configured.slice("http://".length)}`;
  }

  if (configured.startsWith("https://")) {
    return `wss://${configured.slice("https://".length)}`;
  }

  const origin = new URL(request.url);
  origin.protocol = origin.protocol === "https:" ? "wss:" : "ws:";
  return new URL(configured, origin).toString();
};

/**
 * URL for requests that force fresh upstream data (forceUpstream=true fills).
 *
 * Prefers CPP_REALTIME_WS_URL to go DIRECTLY to the C++ backend, bypassing
 * the Rust gateway. This matters because:
 *  - The Rust gateway wraps C++ drop events as OHLC_HISTORY_UNAVAILABLE errors,
 *    adding latency and obscuring the real failure code.
 *  - For cache-bypassing fills there is no benefit from the gateway's DB cache.
 *  - Going direct lets C++ respond (or fail) without an extra WS hop.
 *
 * Falls back to the standard gateway URL when no direct C++ URL is configured.
 */
export const normalizeUpstreamWebSocketUrl = (request: NextRequest): string => {
  const direct =
    process.env.CPP_REALTIME_WS_URL?.trim() ||
    process.env.WS_BACKEND_URL?.trim();

  if (direct) {
    if (direct.startsWith("ws://") || direct.startsWith("wss://")) return direct;
    if (direct.startsWith("http://")) return `ws://${direct.slice("http://".length)}`;
    if (direct.startsWith("https://")) return `wss://${direct.slice("https://".length)}`;
  }

  // No direct C++ URL configured — fall back to the standard gateway URL.
  return normalizeWebSocketUrl(request);
};


const nextRequestId = (action: string): string =>
  `rest-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const messageDataToString = async (data: unknown): Promise<string> => {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  if (data && typeof (data as { text?: unknown }).text === "function") {
    return (data as { text: () => Promise<string> }).text();
  }

  return String(data ?? "");
};

const extractResponsePayload = (frame: JsonRecord): unknown =>
  frame.data ?? frame.payload ?? frame;

const requestTerminalActionWithSessionToken = async <T = unknown>(
  request: NextRequest,
  token: string,
  action: string,
  data?: JsonRecord,
  timeoutMs = DEFAULT_WS_TIMEOUT_MS,
  wsUrlOverride?: string,
): Promise<T> => {
  const wsUrl = wsUrlOverride ?? normalizeWebSocketUrl(request);

  const authRequestId = nextRequestId("auth");
  const actionRequestId = nextRequestId(action);

  if (typeof WebSocket !== "function") {
    throw new TerminalBridgeError(
      "Server WebSocket runtime is unavailable. Use Node 22+ or test this action in Postman WebSocket.",
      500,
      "SERVER_WEBSOCKET_UNAVAILABLE",
    );
  }

  return new Promise<T>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        // Best effort cleanup only.
      }
      callback();
    };

    const timeout = setTimeout(() => {
      finish(() =>
        reject(
          new TerminalBridgeError(
            `${action} timed out while waiting for the terminal WebSocket response.`,
            504,
            "TERMINAL_WS_TIMEOUT",
          ),
        ),
      );
    }, timeoutMs);

    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          action: "auth_with_token",
          requestId: authRequestId,
          data: { token },
        }),
      );
    });

    socket.addEventListener("error", () => {
      console.error("[terminal-ws-bridge] WS error event:", wsUrl, action);
      finish(() =>
        reject(
          new TerminalBridgeError(
            `Failed to connect to terminal WebSocket ${wsUrl}.`,
            502,
            "TERMINAL_WS_CONNECT_FAILED",
          ),
        ),
      );
    });

    socket.addEventListener("close", (event) => {
      const closeInfo = `code=${(event as CloseEvent).code ?? "?"} reason=${(event as CloseEvent).reason ?? ""}`;
      // Only log as an error if we haven't already received a response.
      // When `settled` is true we called socket.close() ourselves after getting the
      // response, and the subsequent close event (often code=1006) is a normal race
      // between our own close and the remote end — not a genuine failure.
      if (!settled) {
        console.error("[terminal-ws-bridge] WS close event:", wsUrl, action, closeInfo);
      }
      finish(() =>
        reject(
          new TerminalBridgeError(
            `Terminal WebSocket closed unexpectedly (${closeInfo}).`,
            502,
            "TERMINAL_WS_CLOSED",
          ),
        ),
      );
    });


    socket.addEventListener("message", (event) => {
      void (async () => {
        let frame: unknown;
        try {
          frame = JSON.parse(await messageDataToString(event.data)) as unknown;
        } catch (error) {
          finish(() =>
            reject(
              new TerminalBridgeError(
                error instanceof Error ? error.message : "Invalid WebSocket JSON frame.",
                502,
                "TERMINAL_WS_INVALID_FRAME",
              ),
            ),
          );
          return;
        }

        if (!isRecord(frame)) {
          return;
        }

        const requestId = typeof frame.requestId === "string" ? frame.requestId : "";
        const error = isRecord(frame.error) ? frame.error : null;
        if (error && (!requestId || requestId === authRequestId || requestId === actionRequestId)) {
          console.error("[terminal-ws-bridge] 502 error frame from gateway:", JSON.stringify({ wsUrl, action, requestId, errorCode: error.code, errorMessage: error.message, frameKeys: Object.keys(frame) }));
          finish(() =>
            reject(
              new TerminalBridgeError(
                typeof error.message === "string"
                  ? error.message
                  : "Terminal WebSocket returned an error.",
                502,
                typeof error.code === "string" ? error.code : "TERMINAL_WS_ERROR",
                frame,
              ),
            ),
          );
          return;
        }

        if (requestId === authRequestId) {
          socket.send(
            JSON.stringify({
              action,
              requestId: actionRequestId,
              data: data ?? {},
            }),
          );
          return;
        }

        if (requestId === actionRequestId) {
          finish(() => resolve(extractResponsePayload(frame) as T));
        }
      })();
    });
  });
};

export const requestTerminalAction = async <T = unknown>(
  request: NextRequest,
  accountId: string,
  action: string,
  data?: JsonRecord,
  timeoutMs = DEFAULT_WS_TIMEOUT_MS,
): Promise<T> => {
  const sessionContext = await resolveTerminalSessionContext(request, accountId);
  return requestTerminalActionWithSessionToken(
    request,
    sessionContext.token,
    action,
    data,
    timeoutMs,
  );
};

export const requestTerminalOhlcGapRepair = async (
  request: NextRequest,
  accountId: string,
  input: unknown,
): Promise<TerminalOhlcRepairResult> => {
  const rawNormalized = normalizeTerminalOhlcRepairRequest(input);
  // Ensure the minimum history fetch is 300 bars regardless of what the frontend
  // requests. The initial chart load uses maxInitialVisibleBars (300) but older
  // callers may send smaller limits. Fetching ≥300 bars on the first request
  // gives 5h of 1-min data instantly, eliminating the gap between history and
  // live bars without extra round-trips.
  const BRIDGE_MIN_SNAPSHOT_LIMIT = 300;
  const normalized: typeof rawNormalized = {
    ...rawNormalized,
    limit: Math.max(rawNormalized.limit, BRIDGE_MIN_SNAPSHOT_LIMIT),
  };
  const sessionScopeKey = buildTerminalSessionContextCacheKey(request, accountId);
  const dedupeKey = makeTerminalOhlcRepairDedupeKey(
    sessionScopeKey ? `session-scope:${sessionScopeKey}` : `account:${sha256Hex(accountId.trim())}`,
    accountId,
    normalized,
  );

  // Tier 0: Check Redis Memory Cache first to avoid hitting MT5 or Gateway
  if (normalized.requestType !== "get_before") {
    try {
      const redisKey = `market:history:${normalized.symbol}:${normalized.timeframeMinutes}`;
      const cachedStr = await redisCache.get(redisKey);
      if (cachedStr) {
        const cachedBars = JSON.parse(cachedStr);
        if (Array.isArray(cachedBars) && cachedBars.length > 0) {
          console.info(`[terminal-ws-bridge] Redis cache hit for ${normalized.symbol} ${normalized.timeframeMinutes}m - ${cachedBars.length} bars`);
          const diagnostics: TerminalOhlcRepairDiagnostics = {
            ready: true,
            repaired: false,
            repairAttempted: false,
            gaps: false,
            stale: false,
            source: "redis_cache",
            phase: "repair",
            symbol: normalized.symbol,
            timeframeMinutes: normalized.timeframeMinutes,
            requestedLimit: normalized.limit,
            returnedBarCount: cachedBars.length,
            realBarCount: cachedBars.length,
            historySparse: false,
            historyGapped: false,
            historyStale: false,
            managerFetchDeferred: false,
            managerFetchPending: false,
            managerFetchSucceeded: true,
          };
          return {
            ...diagnostics,
            accountId,
            checkedAt: new Date().toISOString(),
            probe: diagnostics,
            bars: cachedBars,
          };
        }
      }
    } catch (e) {
      console.error(`[terminal-ws-bridge] Redis read failed for ${normalized.symbol}:`, e);
    }
  }
  const pending = pendingTerminalOhlcRepairRequests.get(dedupeKey);
  if (pending) {
    return pending;
  }

  const isGatewayTransportFailureCode = (code: string): boolean =>
    code === "TERMINAL_WS_CLOSED" ||
    code === "TERMINAL_WS_CONNECT_FAILED" ||
    code === "TERMINAL_WS_CONNECTION_FAILED";

  // Application-level frame from Rust when its C++/MT5 upstream drops mid-request.
  // This is retryable/degraded history work, but it is not proof the Rust gateway is down.
  const isUpstreamDroppedCode = (code: string): boolean =>
    code === "OHLC_HISTORY_UNAVAILABLE";

  const makeDeferredRepairResult = (
    probe: TerminalOhlcRepairDiagnostics,
    message: string,
    options: { source?: string; status?: string; retryAfterMs?: number } = {},
  ): TerminalOhlcRepairResult => {
    const retryAfterMs =
      options.retryAfterMs ??
      probe.retryAfterMs ??
      TERMINAL_OHLC_REPAIR_BUSY_RETRY_AFTER_MS;
    const deferredProbe: TerminalOhlcRepairDiagnostics = {
      ...probe,
      managerFetchDeferred: true,
      managerFetchPending: true,
      retryAfterMs,
    };

    return {
      ...deferredProbe,
      ready: false,
      repaired: false,
      repairAttempted: false,
      gaps: probe.gaps || probe.returnedBarCount <= 0,
      stale: true,
      source: options.source ?? probe.source,
      status: options.status ?? probe.status ?? "repair_pending",
      message,
      accountId,
      checkedAt: new Date().toISOString(),
      probe: deferredProbe,
    };
  };

  const run = (async (): Promise<TerminalOhlcRepairResult> => {
    let sessionContext: TerminalSessionContext;
    try {
      // Keep session resolution bounded for OHLC repair. The underlying
      // auth-scoped resolver remains coalesced/cacheable, so a later retry can
      // reuse the token if the slow terminal-session call eventually succeeds.
      sessionContext = await resolveTerminalSessionContextForOhlcRepair(
        request,
        accountId,
        sessionScopeKey,
      );
    } catch (sessionError) {
      if (isTerminalSessionResolveDeferredError(sessionError)) {
        return buildTerminalOhlcRepairDeferredResult(
          accountId,
          normalized,
          sessionError.message ||
            "Terminal session resolution is still pending; retry OHLC repair shortly.",
          {
            source: "session_resolve_timeout",
            status: "session_pending",
            retryAfterMs: TERMINAL_OHLC_REPAIR_SESSION_RETRY_AFTER_MS,
            symbol: normalized.symbol,
            timeframeMinutes: normalized.timeframeMinutes,
            requestedLimit: normalized.limit,
          },
        );
      }

      throw sessionError;
    }

    const wsUrl = normalizeWebSocketUrl(request);
    const upstreamWsUrl = normalizeUpstreamWebSocketUrl(request);
    const hasDirectCppUrl = upstreamWsUrl !== wsUrl;
    let gatewayCircuitOpen = isOhlcCircuitOpen(wsUrl);
    if (
      gatewayCircuitOpen &&
      await closeOhlcCircuitIfGatewayRecovered(wsUrl)
    ) {
      gatewayCircuitOpen = false;
    }

    if (gatewayCircuitOpen && !hasDirectCppUrl) {
      const remainingMs = OHLC_CIRCUIT_BREAKER_COOLDOWN_MS -
        (Date.now() - (ohlcCircuitBreakerByWsUrl.get(wsUrl)?.openedAt ?? Date.now()));
      const degraded: TerminalOhlcRepairDiagnostics = {
        ready: false,
        repaired: false,
        repairAttempted: false,
        gaps: true,
        stale: true,
        source: "circuit_open",
        phase: "probe",
        status: "circuit_open",
        message: `Upstream unavailable; circuit breaker open for ~${Math.ceil(remainingMs / 1000)}s more.`,
        symbol: normalized.symbol,
        timeframeMinutes: normalized.timeframeMinutes,
        requestedLimit: normalized.limit,
        returnedBarCount: 0,
        realBarCount: 0,
        historySparse: true,
        historyGapped: true,
        historyStale: true,
        managerFetchDeferred: false,
        managerFetchPending: false,
        managerFetchSucceeded: false,
        retryAfterMs: Math.max(1_000, remainingMs),
      };
      return {
        ...degraded,
        accountId,
        checkedAt: new Date().toISOString(),
        probe: degraded,
      };
    }

    if (gatewayCircuitOpen && hasDirectCppUrl) {
      console.warn(
        `[terminal-ws-bridge] OHLC gateway circuit is open for ${wsUrl}; bypassing repair via direct C++ ${upstreamWsUrl}.`,
      );
    }

    const releaseRepairLane = await tryAcquireTerminalOhlcRepairLane();
    if (!releaseRepairLane) {
      return buildTerminalOhlcRepairDeferredResult(
        accountId,
        normalized,
        "Another terminal OHLC repair is already running; this request was not queued so the MT5 manager lane can recover.",
        {
          source: "repair_lane_busy",
          status: "repair_pending",
          retryAfterMs: TERMINAL_OHLC_REPAIR_LANE_BUSY_RETRY_AFTER_MS,
          symbol: normalized.symbol,
          timeframeMinutes: normalized.timeframeMinutes,
          requestedLimit: normalized.limit,
        },
      );
    }
    try {
    const makeGatewayTransportProbe = (
      error: unknown,
      message: string,
    ): TerminalOhlcRepairDiagnostics => ({
      ready: false,
      repaired: false,
      repairAttempted: false,
      gaps: true,
      stale: true,
      source: "gateway_transport_failed",
      phase: "probe",
      status: "degraded",
      message,
      symbol: normalized.symbol,
      timeframeMinutes: normalized.timeframeMinutes,
      requestedLimit: normalized.limit,
      returnedBarCount: 0,
      realBarCount: 0,
      historySparse: true,
      historyGapped: true,
      historyStale: true,
      managerFetchDeferred: false,
      managerFetchPending: false,
      managerFetchSucceeded: false,
      retryAfterMs: error instanceof TerminalBridgeError && isGatewayTransportFailureCode(error.code)
        ? TERMINAL_OHLC_REPAIR_BUSY_RETRY_AFTER_MS
        : undefined,
    });

    const runDirectCppFill = async (): Promise<unknown> =>
      requestTerminalActionWithSessionToken<unknown>(
        request,
        sessionContext.token,
        "request_ohlc_history",
        buildTerminalOhlcRepairActionPayload(normalized, {
          cacheFirst: false,
          cacheOnly: false,
          repair: true,
          forceUpstream: true,
        }),
        TERMINAL_OHLC_REPAIR_FILL_TIMEOUT_MS,
        upstreamWsUrl,
      );

    const buildDirectCppRepairResult = (
      repairPayload: unknown,
      probe: TerminalOhlcRepairDiagnostics,
    ): TerminalOhlcRepairResult => {
      const repair = summarizeTerminalOhlcRepairPayload(repairPayload, normalized, "repair");
      const repaired = repair.ready || repair.managerFetchSucceeded;
      return {
        ...repair,
        repaired,
        repairAttempted: true,
        accountId,
        checkedAt: new Date().toISOString(),
        probe,
        repair: {
          ...repair,
          repaired,
          repairAttempted: true,
        },
      };
    };

    const runDirectCppFallback = async (
      probe: TerminalOhlcRepairDiagnostics,
      reason: string,
    ): Promise<TerminalOhlcRepairResult> => {
      console.warn(
        `[terminal-ws-bridge] ${reason}; trying direct C++ repair for ${normalized.symbol} via ${upstreamWsUrl}.`,
      );
      try {
        return buildDirectCppRepairResult(await runDirectCppFill(), probe);
      } catch (directError) {
        const msg = directError instanceof Error ? directError.message : "Direct C++ repair failed.";
        const code = directError instanceof TerminalBridgeError ? directError.code : "DIRECT_CPP_REPAIR_FAILED";
        console.error("[terminal-ws-bridge] direct C++ repair fallback failed:", code, msg);
        return {
          ...probe,
          ready: false,
          repaired: false,
          repairAttempted: true,
          stale: true,
          source: `${probe.source}:direct_cpp_failed`,
          status: directError instanceof TerminalBridgeError && directError.code === "TERMINAL_WS_TIMEOUT"
            ? "timeout" : "degraded",
          message: msg,
          accountId,
          checkedAt: new Date().toISOString(),
          probe,
        };
      }
    };

    if (gatewayCircuitOpen && hasDirectCppUrl) {
      return runDirectCppFallback(
        makeGatewayTransportProbe(
          undefined,
          "Gateway circuit is open; direct C++ repair is being used.",
        ),
        "gateway circuit open",
      );
    }

    const runProbe = async (): Promise<unknown> =>
      requestTerminalActionWithSessionToken<unknown>(
        request,
        sessionContext.token,
        "request_ohlc_history",
        buildTerminalOhlcRepairActionPayload(normalized, {
          cacheFirst: true,
          cacheOnly: true,
        }),
        TERMINAL_OHLC_REPAIR_PROBE_TIMEOUT_MS,
        wsUrl,
      );

    let probePayload: unknown;
    try {
      probePayload = await runProbe();
      // Probe succeeded — the upstream is responsive for cache reads.
      // Don't reset the circuit yet; only a successful fill (upstream write/fetch)
      // should reset it. Cache probes hit a local layer and don't prove upstream health.
    } catch (probeError) {
      // Retry the probe once if the upstream bridge was transiently closed.
      const isRetryable =
        probeError instanceof TerminalBridgeError && isGatewayTransportFailureCode(probeError.code);
      if (isRetryable) {
        console.warn("[terminal-ws-bridge] probe WS error — retrying once:", probeError.code);
        recordOhlcCircuitFailure(wsUrl);
        await new Promise<void>((r) => setTimeout(r, 1_500));
        try {
          probePayload = await runProbe();
        } catch (probeRetryError) {
          if (
            probeRetryError instanceof TerminalBridgeError &&
            isGatewayTransportFailureCode(probeRetryError.code)
          ) {
            recordOhlcCircuitFailure(wsUrl);
          }
          if (
            hasDirectCppUrl &&
            probeRetryError instanceof TerminalBridgeError &&
            isGatewayTransportFailureCode(probeRetryError.code)
          ) {
            return runDirectCppFallback(
              makeGatewayTransportProbe(
                probeRetryError,
                "Gateway probe failed; direct C++ repair is being used.",
              ),
              `gateway probe failed with ${probeRetryError.code}`,
            );
          }
          if (
            probeRetryError instanceof TerminalBridgeError &&
            isGatewayTransportFailureCode(probeRetryError.code)
          ) {
            const probe = makeGatewayTransportProbe(
              probeRetryError,
              "Gateway probe failed and no direct C++ URL is configured; repair will retry shortly.",
            );
            return {
              ...probe,
              ready: false,
              repaired: false,
              repairAttempted: true,
              stale: true,
              source: `${probe.source}:no_direct_cpp`,
              status: "degraded",
              accountId,
              checkedAt: new Date().toISOString(),
              probe,
            };
          }
          throw probeRetryError;
        }
      } else {
        if (
          hasDirectCppUrl &&
          probeError instanceof TerminalBridgeError &&
          isGatewayTransportFailureCode(probeError.code)
        ) {
          recordOhlcCircuitFailure(wsUrl);
          return runDirectCppFallback(
            makeGatewayTransportProbe(
              probeError,
              "Gateway probe failed; direct C++ repair is being used.",
            ),
            `gateway probe failed with ${probeError.code}`,
          );
        }
        throw probeError;
      }
    }

    const probe = summarizeTerminalOhlcRepairPayload(probePayload, normalized, "probe");
    if (!probe.ready && isTerminalOhlcRepairManagerBusy(probe)) {
      console.info(
        `[terminal-ws-bridge] ${probe.status ?? "manager_busy"} for ${normalized.symbol}; returning retryable pending repair without escalating.`,
      );
      return makeDeferredRepairResult(
        probe,
        probe.message ||
          "MT5 manager history is busy; cached history was returned and repair will retry after the published backoff.",
        {
          source: `${probe.source}:manager_busy`,
          status: "repair_pending",
          retryAfterMs: probe.retryAfterMs ?? TERMINAL_OHLC_REPAIR_BUSY_RETRY_AFTER_MS,
        },
      );
    }

    if (!shouldRepairTerminalOhlcHistory(probe)) {
      return {
        ...probe,
        accountId,
        checkedAt: new Date().toISOString(),
        probe,
      };
    }

    // ── Fill strategy ────────────────────────────────────────────────────────
    // Like Exness/MT5 terminals: serve DB-cached history instantly, only hit
    // C++ upstream when the DB has absolutely nothing for this symbol.
    //
    // Tier 1 — Gateway + PostgreSQL DB cache (fast, no C++ hop):
    //   cacheFirst:true, cacheOnly:false → gateway serves DB bars if present,
    //   falls through to C++ only if DB has 0 bars for this symbol.
    //
    // Tier 2 — Direct C++ (only when Tier 1 returns 0 bars):
    //   Bypass the gateway entirely so C++ drops don't wrap as OHLC_HISTORY_UNAVAILABLE.
    //   forceUpstream:true is sent so the gateway (if used) skips its DB check.

    if (hasDirectCppUrl) {
      console.info(
        `[terminal-ws-bridge] direct C++ URL available (${upstreamWsUrl}); tier-2 fill will bypass gateway`,
      );
    }

    // Tier 1: Ask the gateway with cacheFirst=true. The gateway serves from its
    // PostgreSQL DB cache without touching C++ at all if bars exist.
    const runTier1Fill = async (): Promise<unknown> =>
      requestTerminalActionWithSessionToken<unknown>(
        request,
        sessionContext.token,
        "request_ohlc_history",
        buildTerminalOhlcRepairActionPayload(normalized, {
          cacheFirst: true,   // serve DB cache first — no C++ if DB has data
          cacheOnly: false,   // allow fallthrough to C++ if DB empty
          repair: true,
          forceUpstream: false, // do NOT skip DB
        }),
        TERMINAL_OHLC_REPAIR_FILL_TIMEOUT_MS,
        wsUrl, // gateway URL so it can hit its PostgreSQL DB cache
      );

    // Tier 2: Direct C++ — only used when Tier 1 returned 0 bars AND we have
    // a CPP_REALTIME_WS_URL configured. Bypasses the gateway error-wrapping.
    const runTier2Fill = async (): Promise<unknown> =>
      runDirectCppFill();

    // Short-circuit: if the circuit already has recorded failures (upstream is
    // fragile from a previous request in the same process lifetime) and the probe
    // returned no real bars, skip the fill entirely — the upstream is not serving
    // data and repeated fill attempts would spend the configured repair timeout.
    const circuitState = ohlcCircuitBreakerByWsUrl.get(wsUrl);
    if ((circuitState?.failures ?? 0) > 0 && probe.returnedBarCount <= 0 && probe.realBarCount <= 0) {
      console.warn(
        `[terminal-ws-bridge] skipping fill for ${normalized.symbol} — upstream fragile (${circuitState!.failures} prior failures) and probe returned no bars.`,
      );
      return {
        ...probe,
        ready: false,
        repaired: false,
        repairAttempted: true,
        stale: true,
        source: `${probe.source}:upstream_fragile`,
        status: "degraded",
        message: "Upstream fragile — skipped fill to avoid extended wait.",
        accountId,
        checkedAt: new Date().toISOString(),
        probe,
      };
    }

    let repairPayload: unknown;
    try {
      repairPayload = await runTier1Fill();
      const tier1Summary = summarizeTerminalOhlcRepairPayload(repairPayload, normalized, "repair");

      if (tier1Summary.ready || tier1Summary.managerFetchSucceeded) {
        // DB cache hit — no C++ contact needed. Reset circuit (DB is healthy).
        recordOhlcCircuitSuccess(wsUrl);
        console.info(
          `[terminal-ws-bridge] tier-1 DB cache hit for ${normalized.symbol} — ${tier1Summary.realBarCount} bars, skipping C++`,
        );
      } else if (!hasDirectCppUrl) {
        console.info(
          `[terminal-ws-bridge] tier-1 returned 0 bars for ${normalized.symbol}, but no direct C++ URL is configured; skipping duplicate tier-2 gateway fill`,
        );
      } else {
        // DB has nothing for this symbol. Escalate to direct C++.
        console.info(
          `[terminal-ws-bridge] tier-1 returned 0 bars for ${normalized.symbol} — escalating to direct C++ (${upstreamWsUrl})`,
        );
        try {
          repairPayload = await runTier2Fill();
          recordOhlcCircuitSuccess(wsUrl);
        } catch (tier2Error) {
          const isRetryable =
            tier2Error instanceof TerminalBridgeError && isGatewayTransportFailureCode(tier2Error.code);
          if (isRetryable) {
            console.warn("[terminal-ws-bridge] tier-2 (direct C++) error — retrying once:", (tier2Error as TerminalBridgeError).code);
            await new Promise<void>((r) => setTimeout(r, 1_500));
            try {
              repairPayload = await runTier2Fill();
              recordOhlcCircuitSuccess(wsUrl);
            } catch (retryError) {
              const msg = retryError instanceof Error ? retryError.message : "repair connection failed";
              const code = retryError instanceof TerminalBridgeError ? retryError.code : "REPAIR_FAILED";
              console.error("[terminal-ws-bridge] tier-2 retry also failed:", code, msg);
              return {
                ...probe,
                ready: false,
                repaired: false,
                repairAttempted: true,
                stale: true,
                source: `${probe.source}:repair_connection_failed`,
                status: "degraded",
                message: msg,
                accountId,
                checkedAt: new Date().toISOString(),
                probe,
              };
            }
          } else {
            // Non-retryable (timeout, auth) — degrade gracefully
            const msg = tier2Error instanceof Error ? tier2Error.message : "repair failed";
            return {
              ...probe,
              ready: false,
              repaired: false,
              repairAttempted: true,
              stale: true,
              source: `${probe.source}:repair_failed`,
              status: tier2Error instanceof TerminalBridgeError && tier2Error.code === "TERMINAL_WS_TIMEOUT"
                ? "timeout" : "degraded",
              message: msg,
              accountId,
              checkedAt: new Date().toISOString(),
              probe,
            };
          }
        }
      }
    } catch (tier1Error) {
      // Tier 1 (gateway) itself failed.
      const isRetryable =
        tier1Error instanceof TerminalBridgeError && isGatewayTransportFailureCode(tier1Error.code);

      // OHLC_HISTORY_UNAVAILABLE means the Rust gateway lost its upstream C++ connection
      // while processing our request — C++ dropped because it is busy (MT5 manager lock
      // contention from a concurrent trade/history op). Firing a tier-2 direct C++ call
      // IMMEDIATELY after this would hit the same overloaded backend and burn the
      // configured fill timeout, causing the 504 the user sees.
      //
      // Better strategy: leave the Rust gateway circuit breaker unchanged so cache
      // probes can continue, return a degraded 200 RIGHT NOW so the chart can show
      // whatever cached bars the probe returned, and let the next poll retry after
      // the MT5 lock has released.
      const isUpstreamDropped =
        tier1Error instanceof TerminalBridgeError &&
        isUpstreamDroppedCode(tier1Error.code);

      if (isUpstreamDropped) {
        // The Rust gateway's bridge to C++ dropped mid-request (MT5 manager busy).
        // The gateway itself is still alive — only its upstream pipe broke.
        // If we have a direct C++ URL we can bypass the broken bridge entirely
        // and hit C++ on port 3003 directly; C++ can still serve DB-cached bars
        // even while the MT5 Manager lock is held.
        if (hasDirectCppUrl) {
          console.warn(
            `[terminal-ws-bridge] tier-1 OHLC_HISTORY_UNAVAILABLE for ${normalized.symbol} — escalating to direct C++ (gateway bridge dropped).`,
          );
          // Brief pause: let the MT5 manager lock release before direct C++ hit.
          await new Promise<void>((r) => setTimeout(r, 1_500));
          try {
            repairPayload = await runTier2Fill();
            recordOhlcCircuitSuccess(wsUrl);
          } catch (tier2Error) {
            const msg = tier2Error instanceof Error ? tier2Error.message : "direct C++ repair failed";
            const code = tier2Error instanceof TerminalBridgeError ? tier2Error.code : "REPAIR_FAILED";
            console.warn(`[terminal-ws-bridge] tier-2 also failed after upstream drop (${code}): ${msg}; returning degraded.`);
            return {
              ...probe,
              ready: false,
              repaired: false,
              repairAttempted: true,
              stale: true,
              source: `${probe.source}:upstream_dropped_t2_failed`,
              status: "degraded",
              message: "C++ upstream dropped and direct fill also failed. Chart will retry on next poll.",
              accountId,
              checkedAt: new Date().toISOString(),
              probe,
            };
          }
        } else {
          // No direct C++ URL — nothing we can do but degrade.
          console.warn(
            `[terminal-ws-bridge] tier-1 OHLC_HISTORY_UNAVAILABLE for ${normalized.symbol} — no direct C++ URL; returning degraded.`,
          );
          return {
            ...probe,
            ready: false,
            repaired: false,
            repairAttempted: true,
            stale: true,
            source: `${probe.source}:upstream_dropped`,
            status: "degraded",
            message: "C++ upstream dropped (MT5 manager busy). Retry in progress via background backfill.",
            accountId,
            checkedAt: new Date().toISOString(),
            probe,
          };
        }
      }

      if (isRetryable && hasDirectCppUrl) {
        console.warn("[terminal-ws-bridge] tier-1 gateway error — trying direct C++:", (tier1Error as TerminalBridgeError).code);
        recordOhlcCircuitFailure(wsUrl);
        try {
          repairPayload = await runTier2Fill();
        } catch (tier2Error) {
          const msg = tier2Error instanceof Error ? tier2Error.message : "repair connection failed";
          const code = tier2Error instanceof TerminalBridgeError ? tier2Error.code : "REPAIR_FAILED";
          console.error("[terminal-ws-bridge] tier-1 and tier-2 both failed:", code, msg);
          return {
            ...probe,
            ready: false,
            repaired: false,
            repairAttempted: true,
            stale: true,
            source: `${probe.source}:repair_connection_failed`,
            status: "degraded",
            message: msg,
            accountId,
            checkedAt: new Date().toISOString(),
            probe,
          };
        }
      } else {
        const msg = tier1Error instanceof Error ? tier1Error.message : "repair failed";
        if (
          tier1Error instanceof TerminalBridgeError &&
          isGatewayTransportFailureCode(tier1Error.code)
        ) {
          recordOhlcCircuitFailure(wsUrl);
        }
        return {
          ...probe,
          ready: false,
          repaired: false,
          repairAttempted: true,
          stale: true,
          source: `${probe.source}:repair_failed`,
          status: "degraded",
          message: msg,
          accountId,
          checkedAt: new Date().toISOString(),
          probe,
        };
      }
    }


    const repair = summarizeTerminalOhlcRepairPayload(repairPayload, normalized, "repair");
    const repaired = repair.ready || repair.managerFetchSucceeded;

    const bars = extractOhlcResponseBars(repairPayload);
    if (bars && bars.length > 0 && normalized.requestType !== "get_before") {
      try {
        const redisKey = `market:history:${normalized.symbol}:${normalized.timeframeMinutes}`;
        await redisCache.set(redisKey, JSON.stringify(bars), "EX", 86400);
      } catch (e) {
        console.error(`[terminal-ws-bridge] Redis cache write failed for ${normalized.symbol}:`, e);
      }
    }

    return {
      ...repair,
      repaired,
      repairAttempted: true,
      accountId,
      checkedAt: new Date().toISOString(),
      probe,
      bars,
      repair: {
        ...repair,
        repaired,
        repairAttempted: true,
      },
    };
    } finally {
      releaseRepairLane();
    }
  })().finally(() => {
    pendingTerminalOhlcRepairRequests.delete(dedupeKey);
  });

  pendingTerminalOhlcRepairRequests.set(dedupeKey, run);
  return run;
};
