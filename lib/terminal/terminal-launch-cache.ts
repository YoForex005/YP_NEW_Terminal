import type { Position, SymbolInfo, TradingAccountInfo } from '@/types/webtrader';

export const TERMINAL_FRONTEND_LAUNCH_CACHE_TTL_MS = 5 * 60 * 1000;
export const TERMINAL_FRONTEND_LAUNCH_CACHE_PREFIX = 'terminal:frontend-launch-cache:v1';
const TERMINAL_FRONTEND_LAUNCH_CACHE_STALE_GRACE_MS = 15 * 60 * 1000;
const TERMINAL_FRONTEND_LAUNCH_CACHE_MAX_CHARS = 512_000;
const TERMINAL_FRONTEND_LAUNCH_CACHE_MAX_ENTRIES = 8;
const TERMINAL_FRONTEND_LAUNCH_CACHE_KEY_PREFIX = `${TERMINAL_FRONTEND_LAUNCH_CACHE_PREFIX}:`;
const TERMINAL_FRONTEND_SYMBOL_CACHE_LIMIT = 500;
const TERMINAL_FRONTEND_SYMBOL_CACHE_SCAN_LIMIT = 2_000;
const TERMINAL_FRONTEND_POSITION_CACHE_LIMIT = 200;
const TERMINAL_FRONTEND_POSITION_CACHE_SCAN_LIMIT = 1_000;
const POSITION_DATE_MIN_MS = Date.UTC(2000, 0, 1);
const POSITION_DATE_MAX_FUTURE_SKEW_MS = 7 * 24 * 60 * 60 * 1000;

let lastTerminalFrontendLaunchCachePruneAtMs = 0;

type SerializablePosition = Omit<Position, 'openTime'> & {
  openTime?: Date | string | number | null;
};

export type TerminalFrontendLaunchSnapshot = {
  version: 1;
  accountId: string;
  accountLogin: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
  staleExpiresAtMs?: number;
  isStale?: boolean;
  source: 'accounts-prefetch' | 'terminal-runtime';
  accountInfo?: TradingAccountInfo | null;
  positions?: SerializablePosition[];
  symbols?: SymbolInfo[];
  selectedSymbol?: string | null;
};

export type TerminalFrontendLaunchSnapshotPatch = {
  source: TerminalFrontendLaunchSnapshot['source'];
  accountInfo?: TradingAccountInfo | null;
  positions?: unknown;
  symbols?: unknown;
  selectedSymbol?: string | null;
};

export function normalizeTerminalFrontendAccountLookup(value: string | number | null | undefined): string {
  const normalized = String(value ?? '').trim().replace(/^mt5-/i, '');
  return normalized;
}

export function getTerminalFrontendAccountLogin(value: string | number | null | undefined): string | null {
  const normalized = normalizeTerminalFrontendAccountLookup(value);
  return /^\d+$/.test(normalized) ? normalized : null;
}

export function getTerminalFrontendLaunchCacheKey(accountId: string | number | null | undefined): string | null {
  const normalized = normalizeTerminalFrontendAccountLookup(accountId);
  return normalized ? `${TERMINAL_FRONTEND_LAUNCH_CACHE_PREFIX}:${normalized}` : null;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values: string[] = [];
  for (const entry of value) {
    const item = getTrimmedString(entry);
    if (item) {
      values.push(item);
    }
  }

  return values.length > 0 ? values : undefined;
}

function sanitizeAccountInfo(value: TradingAccountInfo | null | undefined): TradingAccountInfo | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value) {
    return null;
  }

  return {
    login: Math.trunc(toFiniteNumber(value.login)),
    name: String(value.name ?? ''),
    server: String(value.server ?? ''),
    currency: String(value.currency ?? 'USD'),
    leverage: toFiniteNumber(value.leverage),
    balance: toFiniteNumber(value.balance),
    equity: toFiniteNumber(value.equity),
    margin: toFiniteNumber(value.margin),
    marginFree: toFiniteNumber(value.marginFree),
    marginLevel: toFiniteNumber(value.marginLevel),
    marginInitial: toFiniteNumber(value.marginInitial),
    marginMaintenance: toFiniteNumber(value.marginMaintenance),
    profit: toFiniteNumber(value.profit),
    swap: toFiniteNumber(value.swap),
    commission: toFiniteNumber(value.commission),
    credit: toFiniteNumber(value.credit),
    limitOrders: toFiniteNumber(value.limitOrders),
    availableMargin: toFiniteNumber(value.availableMargin),
  };
}

function sanitizeSymbolTradeMode(value: unknown): SymbolInfo['tradeMode'] {
  if (typeof value === 'number') {
    return (['disabled', 'longonly', 'shortonly', 'closeonly', 'full'] as const)[value] ?? 'disabled';
  }

  const normalized = getTrimmedString(value).toLowerCase().replace(/[\s_-]/g, '');
  if (
    normalized === 'disabled' ||
    normalized === 'longonly' ||
    normalized === 'shortonly' ||
    normalized === 'closeonly' ||
    normalized === 'full'
  ) {
    return normalized;
  }

  return 'disabled';
}

function sanitizeSymbolCalcMode(value: unknown): SymbolInfo['calcMode'] {
  const normalized = getTrimmedString(value).toLowerCase().replace(/[\s_-]/g, '');
  if (
    normalized === 'forex' ||
    normalized === 'futures' ||
    normalized === 'cfd' ||
    normalized === 'cfdindex' ||
    normalized === 'cfdleverage'
  ) {
    return normalized;
  }

  return 'forex';
}

function sanitizeSymbol(value: unknown): SymbolInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = value as Partial<SymbolInfo> & Record<string, unknown>;
  const name = getTrimmedString(source.name) || getTrimmedString(source.symbol);
  if (!name) {
    return null;
  }

  const sessionOpen = sanitizeStringArray(source.sessionOpen);
  const sessionClose = sanitizeStringArray(source.sessionClose);

  return {
    name,
    description: getTrimmedString(source.description) || name,
    baseCurrency: getTrimmedString(source.baseCurrency ?? source.currencyBase ?? source.base_currency),
    quoteCurrency: getTrimmedString(source.quoteCurrency ?? source.currencyProfit ?? source.currency_profit ?? source.quote_currency),
    digits: Math.trunc(toFiniteNumber(source.digits, 5)),
    point: toFiniteNumber(source.point),
    tickSize: toFiniteNumber(source.tickSize),
    tickValue: toFiniteNumber(source.tickValue),
    tradeContractSize: toFiniteNumber(source.tradeContractSize ?? source.trade_contract_size),
    tradeMode: sanitizeSymbolTradeMode(source.tradeMode ?? source.trade_mode),
    calcMode: sanitizeSymbolCalcMode(source.calcMode ?? source.calc_mode),
    volumeMin: toFiniteNumber(source.volumeMin ?? source.volume_min),
    volumeMax: toFiniteNumber(source.volumeMax ?? source.volume_max),
    volumeStep: toFiniteNumber(source.volumeStep ?? source.volume_step),
    marginInitial: toFiniteNumber(source.marginInitial ?? source.margin_initial),
    marginMaintenance: toFiniteNumber(source.marginMaintenance ?? source.margin_maintenance),
    swapLong: toFiniteNumber(source.swapLong ?? source.swap_long),
    swapShort: toFiniteNumber(source.swapShort ?? source.swap_short),
    ...(sessionOpen ? { sessionOpen } : {}),
    ...(sessionClose ? { sessionClose } : {}),
    ...(source.isFavorite !== undefined ? { isFavorite: Boolean(source.isFavorite) } : {}),
    ...(getTrimmedString(source.category) ? { category: getTrimmedString(source.category) } : {}),
  };
}

export function sanitizeTerminalLaunchSymbols(value: unknown): SymbolInfo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const symbols: SymbolInfo[] = [];
  let scanned = 0;
  for (const entry of value) {
    scanned += 1;
    if (scanned > TERMINAL_FRONTEND_SYMBOL_CACHE_SCAN_LIMIT) {
      break;
    }

    const symbol = sanitizeSymbol(entry);
    if (!symbol || seen.has(symbol.name)) {
      continue;
    }

    seen.add(symbol.name);
    symbols.push(symbol);
    if (symbols.length >= TERMINAL_FRONTEND_SYMBOL_CACHE_LIMIT) {
      break;
    }
  }

  return symbols;
}

function isUsablePositionDate(date: Date): boolean {
  const time = date.getTime();
  return (
    Number.isFinite(time) &&
    time >= POSITION_DATE_MIN_MS &&
    time <= Date.now() + POSITION_DATE_MAX_FUTURE_SKEW_MS
  );
}

function parseEpochDate(value: number): Date | null {
  const absolute = Math.abs(value);
  let epochMs = value;
  if (absolute > 10_000_000_000_000_000) {
    epochMs = value / 1_000_000;
  } else if (absolute > 10_000_000_000_000) {
    epochMs = value / 1_000;
  } else if (absolute <= 10_000_000_000) {
    epochMs = value * 1000;
  }

  const date = new Date(epochMs);
  return isUsablePositionDate(date) ? date : null;
}

function parsePositionDate(value: unknown): Date {
  if (value instanceof Date && isUsablePositionDate(value)) {
    return new Date(value.getTime());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return parseEpochDate(value) ?? new Date();
  }

  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return parseEpochDate(Number(trimmed)) ?? new Date();
    }

    const date = new Date(trimmed);
    return isUsablePositionDate(date) ? date : new Date();
  }

  return new Date();
}

function sanitizePosition(value: unknown): SerializablePosition | null {
  if (!isRecord(value)) {
    return null;
  }

  const source = value as Partial<SerializablePosition> & Record<string, unknown>;
  const ticket = Math.trunc(toFiniteNumber(
    source.ticket ?? source.id ?? source.positionId ?? source.position_id ?? source.mt5_position_id,
    Number.NaN,
  ));
  const symbol = getTrimmedString(source.symbol);
  if (!Number.isFinite(ticket) || ticket <= 0 || !symbol) {
    return null;
  }

  const rawType = String(source.type ?? '').trim().toLowerCase();
  const accountId = getTrimmedString(source.accountId ?? source.account_id);
  const comment = getTrimmedString(source.comment);
  const externalId = getTrimmedString(source.externalId ?? source.external_id);
  return {
    ...(accountId ? { accountId } : {}),
    ...(Number.isFinite(toFiniteNumber(source.accountLogin ?? source.account_login ?? source.mt5Login ?? source.mt5_login, Number.NaN))
      ? { accountLogin: Math.trunc(toFiniteNumber(source.accountLogin ?? source.account_login ?? source.mt5Login ?? source.mt5_login)) }
      : {}),
    ...(Number.isFinite(toFiniteNumber(source.login, Number.NaN))
      ? { login: Math.trunc(toFiniteNumber(source.login)) }
      : {}),
    ticket,
    symbol,
    type: rawType === '1' || rawType === 'short' || rawType.includes('sell') ? 'sell' : 'buy',
    volume: toFiniteNumber(source.volume ?? source.lots),
    openPrice: toFiniteNumber(source.openPrice ?? source.open_price ?? source.price_open),
    priceCurrent: toFiniteNumber(source.priceCurrent ?? source.price_current ?? source.currentPrice ?? source.current_price),
    sl: toFiniteNumber(source.sl ?? source.stopLoss ?? source.stop_loss),
    tp: toFiniteNumber(source.tp ?? source.takeProfit ?? source.take_profit),
    profit: toFiniteNumber(source.profit),
    swap: toFiniteNumber(source.swap),
    commission: toFiniteNumber(source.commission),
    ...(comment ? { comment } : {}),
    ...(externalId ? { externalId } : {}),
    openTime: parsePositionDate(
      source.openTime ??
      source.openTimeMsc ??
      source.open_time_msc ??
      source.time_msc ??
      source.timeMsc ??
      source.open_time ??
      source.time,
    ).toISOString(),
    ...(Number.isFinite(toFiniteNumber(source.magic, Number.NaN)) ? { magic: Math.trunc(toFiniteNumber(source.magic)) } : {}),
  };
}

export function sanitizeTerminalLaunchPositions(value: unknown): SerializablePosition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const positions: SerializablePosition[] = [];
  let scanned = 0;
  for (const entry of value) {
    scanned += 1;
    if (scanned > TERMINAL_FRONTEND_POSITION_CACHE_SCAN_LIMIT) {
      break;
    }

    const position = sanitizePosition(entry);
    if (!position) {
      continue;
    }

    positions.push(position);
    if (positions.length >= TERMINAL_FRONTEND_POSITION_CACHE_LIMIT) {
      break;
    }
  }

  return positions;
}

export function reviveTerminalLaunchPositions(value: unknown): Position[] {
  return sanitizeTerminalLaunchPositions(value).map((position) => ({
    ...position,
    openTime: parsePositionDate(position.openTime),
  }));
}

export function extractTerminalLaunchPositionsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const source = payload as Record<string, unknown>;
  if (Array.isArray(source.positions)) {
    return source.positions;
  }

  if (source.data && typeof source.data === 'object') {
    const data = source.data as Record<string, unknown>;
    if (Array.isArray(data.positions)) {
      return data.positions;
    }
  }

  return [];
}

export function extractTerminalLaunchSymbolsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const source = payload as Record<string, unknown>;
  const direct = source.symbols ?? source.catalog ?? source.symbolCatalog ?? source.marketWatch ?? source.marketSymbols ?? source.data;
  if (Array.isArray(direct)) {
    return direct;
  }

  if (direct && typeof direct === 'object') {
    const nested = direct as Record<string, unknown>;
    const nestedSymbols = nested.symbols ?? nested.catalog ?? nested.symbolCatalog ?? nested.marketWatch ?? nested.marketSymbols;
    if (Array.isArray(nestedSymbols)) {
      return nestedSymbols;
    }
  }

  return [];
}

export function readTerminalFrontendLaunchSnapshot(
  accountId: string | number | null | undefined,
): TerminalFrontendLaunchSnapshot | null {
  const storage = getBrowserStorage();
  if (!storage) {
    return null;
  }

  const key = getTerminalFrontendLaunchCacheKey(accountId);
  if (!key) {
    return null;
  }

  const now = Date.now();
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    if (shouldDropRawSnapshot(raw, now)) {
      safeRemoveSnapshot(storage, key);
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1) {
      safeRemoveSnapshot(storage, key);
      return null;
    }

    const normalizedAccountId = normalizeTerminalFrontendAccountLookup(accountId);
    const snapshotAccountId = normalizeTerminalFrontendAccountLookup(parsed.accountId as string | number | null | undefined);
    if (snapshotAccountId && snapshotAccountId !== normalizedAccountId) {
      safeRemoveSnapshot(storage, key);
      return null;
    }

    const updatedAtMs = toFiniteNumber(parsed.updatedAtMs, 0);
    const expiresAtMs = toFiniteNumber(parsed.expiresAtMs, 0);
    if (updatedAtMs <= 0 || expiresAtMs <= 0) {
      safeRemoveSnapshot(storage, key);
      return null;
    }

    const staleExpiresAtMs = getSnapshotStaleExpiresAtMs(parsed, expiresAtMs);
    if (staleExpiresAtMs < now) {
      safeRemoveSnapshot(storage, key);
      return null;
    }

    const hasSymbols = Array.isArray(parsed.symbols);
    const hasPositions = Array.isArray(parsed.positions);
    const createdAtMs = toFiniteNumber(parsed.createdAtMs, updatedAtMs);
    const source = parsed.source === 'terminal-runtime' ? 'terminal-runtime' : 'accounts-prefetch';
    const selectedSymbol = getTrimmedString(parsed.selectedSymbol);
    return {
      version: 1,
      accountId: normalizedAccountId,
      accountLogin: getTerminalFrontendAccountLogin(parsed.accountLogin as string | number | null | undefined)
        ?? getTerminalFrontendAccountLogin(accountId),
      createdAtMs,
      updatedAtMs,
      expiresAtMs,
      staleExpiresAtMs,
      isStale: expiresAtMs < now,
      source,
      accountInfo: sanitizeAccountInfo(parsed.accountInfo as TradingAccountInfo | null | undefined) ?? null,
      ...(hasPositions ? { positions: sanitizeTerminalLaunchPositions(parsed.positions) } : {}),
      ...(hasSymbols ? { symbols: sanitizeTerminalLaunchSymbols(parsed.symbols) } : {}),
      selectedSymbol: selectedSymbol || null,
    };
  } catch {
    safeRemoveSnapshot(storage, key);
    return null;
  }
}

export function writeTerminalFrontendLaunchSnapshot(
  accountId: string | number | null | undefined,
  patch: TerminalFrontendLaunchSnapshotPatch,
): void {
  const storage = getBrowserStorage();
  if (!storage) {
    return;
  }

  const key = getTerminalFrontendLaunchCacheKey(accountId);
  if (!key) {
    return;
  }

  const now = Date.now();
  const current = readTerminalFrontendLaunchSnapshot(accountId);
  const normalizedAccountId = normalizeTerminalFrontendAccountLookup(accountId);
  const accountLogin = getTerminalFrontendAccountLogin(accountId);
  const expiresAtMs = now + TERMINAL_FRONTEND_LAUNCH_CACHE_TTL_MS;
  const next: TerminalFrontendLaunchSnapshot = {
    version: 1,
    accountId: normalizedAccountId,
    accountLogin,
    createdAtMs: current?.createdAtMs ?? now,
    updatedAtMs: now,
    expiresAtMs,
    staleExpiresAtMs: expiresAtMs + TERMINAL_FRONTEND_LAUNCH_CACHE_STALE_GRACE_MS,
    source: patch.source === 'terminal-runtime' ? 'terminal-runtime' : 'accounts-prefetch',
    accountInfo: sanitizeAccountInfo(patch.accountInfo) ?? current?.accountInfo ?? null,
    positions: patch.positions !== undefined
      ? sanitizeTerminalLaunchPositions(patch.positions)
      : current?.positions,
    symbols: patch.symbols !== undefined
      ? sanitizeTerminalLaunchSymbols(patch.symbols)
      : current?.symbols,
    selectedSymbol: typeof patch.selectedSymbol === 'string' && patch.selectedSymbol.trim()
      ? patch.selectedSymbol.trim()
      : patch.selectedSymbol === null
        ? null
        : current?.selectedSymbol ?? null,
  };

  try {
    writeSnapshotToStorage(storage, key, next, now);
  } catch {
    // Browser storage can be unavailable or full. Launch still falls back to live hydration.
  }
}

function readJsonNumberProperty(raw: string, property: string): number | null {
  const match = raw.match(new RegExp(`"${property}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function getSnapshotStaleExpiresAtMs(snapshot: Record<string, unknown>, expiresAtMs: number): number {
  const explicitStaleExpiresAtMs = toFiniteNumber(snapshot.staleExpiresAtMs, Number.NaN);
  if (Number.isFinite(explicitStaleExpiresAtMs)) {
    return Math.max(expiresAtMs, explicitStaleExpiresAtMs);
  }

  return expiresAtMs + TERMINAL_FRONTEND_LAUNCH_CACHE_STALE_GRACE_MS;
}

function shouldDropRawSnapshot(raw: string, now: number): boolean {
  const firstNonWhitespaceIndex = raw.search(/\S/);
  if (
    raw.length === 0 ||
    raw.length > TERMINAL_FRONTEND_LAUNCH_CACHE_MAX_CHARS ||
    firstNonWhitespaceIndex < 0 ||
    raw.charCodeAt(firstNonWhitespaceIndex) !== 123
  ) {
    return true;
  }

  const expiresAtMs = readJsonNumberProperty(raw, 'expiresAtMs');
  const staleExpiresAtMs = readJsonNumberProperty(raw, 'staleExpiresAtMs');
  const earliestKnownDropAtMs = staleExpiresAtMs ?? (expiresAtMs === null ? null : expiresAtMs + TERMINAL_FRONTEND_LAUNCH_CACHE_STALE_GRACE_MS);
  return earliestKnownDropAtMs !== null && earliestKnownDropAtMs < now;
}

function safeRemoveSnapshot(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Best effort only.
  }
}

function writeSnapshotToStorage(
  storage: Storage,
  key: string,
  snapshot: TerminalFrontendLaunchSnapshot,
  now: number,
): void {
  const serialized = JSON.stringify(snapshot);
  if (serialized.length > TERMINAL_FRONTEND_LAUNCH_CACHE_MAX_CHARS) {
    return;
  }

  try {
    storage.setItem(key, serialized);
  } catch {
    pruneTerminalFrontendLaunchCache(storage, now, key, true);
    storage.setItem(key, serialized);
  }

  pruneTerminalFrontendLaunchCache(storage, now, key);
}

function pruneTerminalFrontendLaunchCache(
  storage: Storage,
  now: number,
  protectedKey?: string,
  force = false,
): void {
  if (!force && now - lastTerminalFrontendLaunchCachePruneAtMs < 60_000) {
    return;
  }

  lastTerminalFrontendLaunchCachePruneAtMs = now;

  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(TERMINAL_FRONTEND_LAUNCH_CACHE_KEY_PREFIX)) {
        keys.push(key);
      }
    }

    const retained: Array<{ key: string; updatedAtMs: number }> = [];
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (!raw || shouldDropRawSnapshot(raw, now)) {
        if (key !== protectedKey) {
          safeRemoveSnapshot(storage, key);
        }
        continue;
      }

      retained.push({
        key,
        updatedAtMs: readJsonNumberProperty(raw, 'updatedAtMs') ?? 0,
      });
    }

    retained.sort((left, right) => right.updatedAtMs - left.updatedAtMs);
    for (const entry of retained.slice(TERMINAL_FRONTEND_LAUNCH_CACHE_MAX_ENTRIES)) {
      if (entry.key !== protectedKey) {
        safeRemoveSnapshot(storage, entry.key);
      }
    }
  } catch {
    // Local storage enumeration can fail under restricted browser policies.
  }
}
