export interface PersistentOhlcBar {
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

type PersistentOhlcHistoryRecord = {
  id: string;
  sessionScope: string;
  symbol: string;
  timeframeMinutes: number;
  savedAtMs: number;
  bars: PersistentOhlcBar[];
};

type PersistentOhlcHistoryRequest = {
  sessionId: string;
  symbol: string;
  timeframeMinutes: number;
  limit: number;
};

const DB_NAME = 'yopips-terminal-market-cache';
const DB_VERSION = 1;
const HISTORY_STORE = 'ohlc-history';
const SAVED_AT_INDEX = 'saved-at';
const MAX_PERSISTED_HISTORY_KEYS = 48;
const MAX_PERSISTED_BARS_PER_KEY = 1_000;
const PERSISTED_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PERSISTED_HISTORY_PRUNE_INTERVAL_MS = 60_000;

let openDatabasePromise: Promise<IDBDatabase | null> | null = null;
let lastPruneAtMs = 0;
let pendingPrune: Promise<void> | null = null;

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function normalizeScopePart(value: string): string {
  return value.trim().toUpperCase();
}

function makeRecordId(sessionId: string, symbol: string, timeframeMinutes: number): string {
  return JSON.stringify([
    sessionId.trim(),
    normalizeScopePart(symbol),
    Math.max(1, Math.trunc(timeframeMinutes)),
  ]);
}

function isPersistableBar(bar: PersistentOhlcBar): boolean {
  return (
    Number.isFinite(bar.time) &&
    bar.time > 0 &&
    Number.isFinite(bar.open) &&
    bar.open > 0 &&
    Number.isFinite(bar.high) &&
    bar.high > 0 &&
    Number.isFinite(bar.low) &&
    bar.low > 0 &&
    Number.isFinite(bar.close) &&
    bar.close > 0 &&
    bar.synthetic !== true &&
    bar.continuity !== true &&
    bar.isContinuity !== true
  );
}

function normalizeBars(bars: PersistentOhlcBar[]): PersistentOhlcBar[] {
  const byTime = new Map<number, PersistentOhlcBar>();

  for (const bar of bars) {
    if (!isPersistableBar(bar)) {
      continue;
    }

    byTime.set(bar.time, {
      ...bar,
      volume: Number.isFinite(bar.volume) ? Math.max(0, bar.volume) : 0,
    });
  }

  return [...byTime.values()]
    .sort((left, right) => left.time - right.time)
    .slice(-MAX_PERSISTED_BARS_PER_KEY);
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) {
    return Promise.resolve(null);
  }

  if (openDatabasePromise) {
    return openDatabasePromise;
  }

  openDatabasePromise = new Promise<IDBDatabase | null>((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(HISTORY_STORE)
        ? request.transaction!.objectStore(HISTORY_STORE)
        : database.createObjectStore(HISTORY_STORE, { keyPath: 'id' });

      if (!store.indexNames.contains(SAVED_AT_INDEX)) {
        store.createIndex(SAVED_AT_INDEX, 'savedAtMs');
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        openDatabasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      openDatabasePromise = null;
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });

  return openDatabasePromise;
}

async function pruneOldHistory(database: IDBDatabase): Promise<void> {
  if (Date.now() - lastPruneAtMs < PERSISTED_HISTORY_PRUNE_INTERVAL_MS) {
    return;
  }
  if (pendingPrune) {
    return pendingPrune;
  }

  pendingPrune = new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HISTORY_STORE, 'readwrite');
    const store = transaction.objectStore(HISTORY_STORE);
    const expiryCutoff = Date.now() - PERSISTED_HISTORY_TTL_MS;
    const cursorRequest = store.index(SAVED_AT_INDEX).openKeyCursor(null, 'prev');
    let retainedRecords = 0;

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        return;
      }

      const savedAtMs = Number(cursor.key);
      if (savedAtMs < expiryCutoff || retainedRecords >= MAX_PERSISTED_HISTORY_KEYS) {
        store.delete(cursor.primaryKey);
      } else {
        retainedRecords += 1;
      }
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(
      cursorRequest.error ?? new Error('IndexedDB cursor failed'),
    );
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  }).then(() => {
    lastPruneAtMs = Date.now();
  }).finally(() => {
    pendingPrune = null;
  });

  return pendingPrune;
}

export async function readPersistentOhlcHistory({
  sessionId,
  symbol,
  timeframeMinutes,
  limit,
}: PersistentOhlcHistoryRequest): Promise<PersistentOhlcBar[]> {
  try {
    const database = await openDatabase();
    if (!database) {
      return [];
    }

    const transaction = database.transaction(HISTORY_STORE, 'readonly');
    const store = transaction.objectStore(HISTORY_STORE);
    const record = await requestResult(
      store.get(makeRecordId(sessionId, symbol, timeframeMinutes)),
    ) as PersistentOhlcHistoryRecord | undefined;

    if (!record || Date.now() - record.savedAtMs > PERSISTED_HISTORY_TTL_MS) {
      return [];
    }

    return normalizeBars(record.bars)
      .slice(-Math.max(1, Math.trunc(limit)))
      .map((bar) => ({ ...bar, cached: true }));
  } catch {
    return [];
  }
}

export async function writePersistentOhlcHistory({
  sessionId,
  symbol,
  timeframeMinutes,
  bars,
}: Omit<PersistentOhlcHistoryRequest, 'limit'> & { bars: PersistentOhlcBar[] }): Promise<void> {
  const normalizedBars = normalizeBars(bars);
  if (!sessionId.trim() || !symbol.trim() || normalizedBars.length === 0) {
    return;
  }

  try {
    const database = await openDatabase();
    if (!database) {
      return;
    }

    const transaction = database.transaction(HISTORY_STORE, 'readwrite');
    transaction.objectStore(HISTORY_STORE).put({
      id: makeRecordId(sessionId, symbol, timeframeMinutes),
      sessionScope: sessionId.trim(),
      symbol: normalizeScopePart(symbol),
      timeframeMinutes: Math.max(1, Math.trunc(timeframeMinutes)),
      savedAtMs: Date.now(),
      bars: normalizedBars,
    } satisfies PersistentOhlcHistoryRecord);
    await transactionComplete(transaction);
    await pruneOldHistory(database);
  } catch {
    // Browser storage is an optimization. Live/history networking remains authoritative.
  }
}

export const __ohlcPersistentCacheTestHooks = {
  MAX_PERSISTED_BARS_PER_KEY,
  PERSISTED_HISTORY_TTL_MS,
  isPersistableBar,
  makeRecordId,
  normalizeBars,
};
