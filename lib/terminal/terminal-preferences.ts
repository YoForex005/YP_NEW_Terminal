import { GLOBAL_CHART_SPACING } from './chart-visual-config';

export interface TerminalPreferences {
  accountId: string;
  selectedSymbol: string | null;
  openTabs: string[];
  watchlistSymbols: string[];
  timeframeMinutes?: number;
  chartType?: string;
  chartLayoutPanes?: number;
  chartBarSpacing?: number;
  updatedAt?: string;
}

export interface SaveTerminalPreferencesInput {
  accountId: string;
  selectedSymbol: string | null;
  openTabs: string[];
  watchlistSymbols: string[];
  timeframeMinutes?: number;
  chartType?: string;
  chartLayoutPanes?: number;
  chartBarSpacing?: number | null;
}

const SETTINGS_ROUTE = '/api/private/settings';
// Terminal bootstrap should not wait on preference persistence before live quotes connect.
const TERMINAL_PREFERENCES_TIMEOUT_MS = 2_500;
const TERMINAL_PREFERENCES_LAST_SUCCESS_TTL_MS = 2_000;
const TERMINAL_PREFERENCES_READ_CACHE_TTL_MS = 2_500;
const TERMINAL_PREFERENCES_SAVE_BATCH_MS = 100;
const SETTINGS_CACHE_TTL_MS = 5_000;
const TERMINAL_STATE_UNAVAILABLE_TTL_MS = 10_000;
const TERMINAL_BY_ACCOUNT_KEY = 'terminalByAccount';

type PendingTerminalPreferenceSave = {
  input: SaveTerminalPreferencesInput;
  promise: Promise<boolean>;
  resolve: (saved: boolean) => void;
  saveKey: string;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

type QueuedTerminalPreferenceSave = {
  input: SaveTerminalPreferencesInput;
  promise: Promise<boolean>;
  resolve: (saved: boolean) => void;
  saveKey: string;
};

type SoftTimeoutResult<T> =
  | { didTimeout: false; value: T }
  | { didTimeout: true };

const inFlightTerminalPreferenceSaves = new Map<string, Promise<boolean>>();
const activeTerminalPreferenceSavesByAccount = new Map<string, Promise<boolean>>();
const inFlightTerminalPreferenceReads = new Map<string, Promise<TerminalPreferences | null>>();
const inFlightDedicatedTerminalPreferenceReads = new Map<string, Promise<{ attempted: true; preferences: TerminalPreferences | null } | null>>();
const pendingTerminalPreferenceSaves = new Map<string, PendingTerminalPreferenceSave>();
const queuedTerminalPreferenceSaves = new Map<string, QueuedTerminalPreferenceSave>();
const terminalStateUnavailableUntilByAccount = new Map<string, number>();
let cachedSettingsSource: {
  settings: Record<string, unknown>;
  fetchedAt: number;
} | null = null;
let inFlightSettingsSource: Promise<Record<string, unknown> | null> | null = null;
// Dedicated saves can succeed without a settings cache; keep the saved account
// available to settings fallback without seeding a partial global settings object.
const saveBackedSettingsFallbackByAccount = new Map<string, {
  payload: Record<string, unknown>;
}>();
const terminalPreferenceReadCache = new Map<string, {
  preferences: TerminalPreferences | null;
  fetchedAt: number;
  source: 'dedicated' | 'settings' | 'save';
}>();
let lastSuccessfulTerminalPreferencesSave: {
  key: string;
  savedAt: number;
} | null = null;
let latestTerminalPreferencesSaveCachedAt = 0;

const getTerminalStateRoute = (accountId: string): string =>
  `/api/private/accounts/${encodeURIComponent(accountId)}/terminal-state`;

const terminalStateUnavailable = (accountId: string): boolean => {
  const unavailableUntil = terminalStateUnavailableUntilByAccount.get(accountId);
  if (!unavailableUntil) {
    return false;
  }

  if (Date.now() < unavailableUntil) {
    return true;
  }

  terminalStateUnavailableUntilByAccount.delete(accountId);
  return false;
};

const rememberTerminalStateUnavailable = (accountId: string): void => {
  terminalStateUnavailableUntilByAccount.set(
    accountId,
    Date.now() + TERMINAL_STATE_UNAVAILABLE_TTL_MS,
  );
};

const rememberTerminalStateAvailable = (accountId: string): void => {
  terminalStateUnavailableUntilByAccount.delete(accountId);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const normalizeStringList = (value: readonly unknown[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of value) {
    const symbol = typeof entry === 'string' ? entry.trim() : '';
    if (!symbol || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    normalized.push(symbol);
  }

  return normalized;
};

const toStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizeStringList(value);
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

const parseJsonObjectString = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const cloneJsonRecord = (value: Record<string, unknown>): Record<string, unknown> => {
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return { ...value };
  }
};

const cloneTerminalPreferences = (
  preferences: TerminalPreferences | null,
): TerminalPreferences | null =>
  preferences
    ? {
        ...preferences,
        openTabs: [...preferences.openTabs],
        watchlistSymbols: [...preferences.watchlistSymbols],
      }
    : null;

const getCachedTerminalPreferences = (
  accountId: string,
): TerminalPreferences | null | undefined => {
  const cached = terminalPreferenceReadCache.get(accountId);
  if (
    !cached ||
    Date.now() - cached.fetchedAt > TERMINAL_PREFERENCES_READ_CACHE_TTL_MS
  ) {
    if (cached) {
      terminalPreferenceReadCache.delete(accountId);
    }
    return undefined;
  }

  return cloneTerminalPreferences(cached.preferences);
};

const cacheTerminalPreferences = (
  accountId: string,
  preferences: TerminalPreferences | null,
  options: {
    source?: 'dedicated' | 'settings' | 'save';
    startedAt?: number;
    skipIfNewerDedicated?: boolean;
    skipIfNewerSave?: boolean;
  } = {},
): TerminalPreferences | null => {
  const existing = terminalPreferenceReadCache.get(accountId);
  if (
    options.skipIfNewerSave &&
    options.startedAt !== undefined &&
    existing?.source === 'save' &&
    existing.fetchedAt >= options.startedAt
  ) {
    return cloneTerminalPreferences(existing.preferences);
  }

  if (
    options.skipIfNewerDedicated &&
    options.startedAt !== undefined &&
    existing?.source === 'dedicated' &&
    existing.fetchedAt >= options.startedAt
  ) {
    return cloneTerminalPreferences(existing.preferences);
  }

  terminalPreferenceReadCache.set(accountId, {
    preferences: cloneTerminalPreferences(preferences),
    fetchedAt: Date.now(),
    source: options.source ?? 'settings',
  });

  return cloneTerminalPreferences(preferences);
};

const extractSettingsSource = (payload: unknown): Record<string, unknown> => {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : root;
  const settings =
    parseJsonObjectString(data.settings_json) ??
    parseJsonObjectString(data.settingsJson) ??
    parseJsonObjectString(data.settings) ??
    parseJsonObjectString(data.preferences) ??
    data;

  return settings;
};

const extractTerminalByAccount = (settings: Record<string, unknown>): Record<string, unknown> => {
  const source =
    parseJsonObjectString(settings[TERMINAL_BY_ACCOUNT_KEY]) ??
    parseJsonObjectString(settings.terminal_by_account) ??
    {};

  return source;
};

const parseTerminalPreferenceSource = (
  accountId: string,
  source: Record<string, unknown>,
): TerminalPreferences | null => {
  const openTabs = toStringList(source.openTabs ?? source.open_tabs);
  const watchlistSymbols = toStringList(
    source.watchlistSymbols ??
      source.watchlist_symbols ??
      source.marketWatchSymbols ??
      source.market_watch_symbols ??
      source.watchlist,
  );
  const selectedSymbol =
    firstString(source.selectedSymbol, source.selected_symbol) ?? null;
  const timeframeMinutesRaw = source.timeframeMinutes ?? source.timeframe_minutes;
  const timeframeMinutes =
    typeof timeframeMinutesRaw === 'number' && Number.isFinite(timeframeMinutesRaw)
      ? Math.trunc(timeframeMinutesRaw)
      : typeof timeframeMinutesRaw === 'string' && Number.isFinite(Number(timeframeMinutesRaw))
        ? Math.trunc(Number(timeframeMinutesRaw))
        : undefined;
  const chartType = firstString(source.chartType, source.chart_type);
  const chartLayoutPanesRaw = source.chartLayoutPanes ?? source.chart_layout_panes;
  const chartLayoutPanes =
    typeof chartLayoutPanesRaw === 'number' && Number.isFinite(chartLayoutPanesRaw)
      ? Math.trunc(chartLayoutPanesRaw)
      : typeof chartLayoutPanesRaw === 'string' && Number.isFinite(Number(chartLayoutPanesRaw))
        ? Math.trunc(Number(chartLayoutPanesRaw))
        : undefined;
  const chartBarSpacingRaw = source.chartBarSpacing ?? source.chart_bar_spacing;
  const chartBarSpacing =
    typeof chartBarSpacingRaw === 'number' && Number.isFinite(chartBarSpacingRaw)
      ? chartBarSpacingRaw
      : typeof chartBarSpacingRaw === 'string' && Number.isFinite(Number(chartBarSpacingRaw))
        ? Number(chartBarSpacingRaw)
        : undefined;

  if (
    openTabs.length === 0 &&
    watchlistSymbols.length === 0 &&
    !selectedSymbol &&
    timeframeMinutes === undefined &&
    chartType === undefined &&
    chartLayoutPanes === undefined &&
    chartBarSpacing === undefined
  ) {
    return null;
  }

  return {
    accountId:
      firstString(source.accountId, source.account_id) ?? accountId,
    selectedSymbol,
    openTabs,
    watchlistSymbols,
    timeframeMinutes,
    chartType,
    chartLayoutPanes,
    chartBarSpacing: normalizeChartBarSpacingPreference(chartBarSpacing),
    updatedAt: firstString(source.updatedAt, source.updated_at),
  };
};

const parseSettingsTerminalPreferences = (
  accountId: string,
  settings: Record<string, unknown>,
): TerminalPreferences | null => {
  const terminalByAccount = extractTerminalByAccount(settings);
  const source =
    parseJsonObjectString(terminalByAccount[accountId]) ??
    parseJsonObjectString(terminalByAccount[accountId.replace(/^mt5-/i, '')]) ??
    {};

  return parseTerminalPreferenceSource(accountId, source);
};

const getSaveBackedSettingsFallbackPreferences = (
  accountId: string,
): TerminalPreferences | null => {
  const fallback = saveBackedSettingsFallbackByAccount.get(accountId);
  if (!fallback) {
    return null;
  }

  return parseTerminalPreferenceSource(
    accountId,
    cloneJsonRecord(fallback.payload),
  );
};

const applySaveBackedSettingsFallback = (
  accountId: string,
  settingsPreferences: TerminalPreferences | null,
): TerminalPreferences | null =>
  getSaveBackedSettingsFallbackPreferences(accountId) ?? settingsPreferences;

const parseDedicatedTerminalPreferences = (
  accountId: string,
  payload: unknown,
): TerminalPreferences | null => {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : root;
  const source =
    parseJsonObjectString(data.terminalState) ??
    parseJsonObjectString(data.terminal_state) ??
    parseJsonObjectString(data.state) ??
    parseJsonObjectString(data.preferences) ??
    parseJsonObjectString(data.settings) ??
    data;

  return parseTerminalPreferenceSource(accountId, source);
};

const isGracefulUnavailableStatus = (status: number): boolean =>
  status === 404 ||
  status === 405 ||
  status === 501 ||
  status === 502 ||
  status === 503 ||
  status === 504;

const withSoftTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<SoftTimeoutResult<T>> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<SoftTimeoutResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ didTimeout: true });
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      promise.then((value): SoftTimeoutResult<T> => ({ didTimeout: false, value })),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const fetchDedicatedTerminalPreferences = async (
  accountId: string,
): Promise<{ attempted: true; preferences: TerminalPreferences | null } | null> => {
  if (terminalStateUnavailable(accountId)) {
    return null;
  }

  const existingRead = inFlightDedicatedTerminalPreferenceReads.get(accountId);
  const readPromise = existingRead ?? (async (): Promise<{ attempted: true; preferences: TerminalPreferences | null } | null> => {
    const readStartedAt = Date.now();
    const response = await fetch(getTerminalStateRoute(accountId), {
      cache: 'no-store',
    });
    const payload = await parseJsonSafely(response);

    if (isGracefulUnavailableStatus(response.status)) {
      rememberTerminalStateUnavailable(accountId);
      return null;
    }

    if (!response.ok) {
      throw new Error(`Dedicated terminal state request failed with status ${response.status}.`);
    }

    rememberTerminalStateAvailable(accountId);
    const result: { attempted: true; preferences: TerminalPreferences | null } = {
      attempted: true,
      preferences: parseDedicatedTerminalPreferences(accountId, payload),
    };

    if (result.preferences) {
      result.preferences = cacheTerminalPreferences(accountId, result.preferences, {
        source: 'dedicated',
        startedAt: readStartedAt,
        skipIfNewerSave: true,
      });
    }

    return result;
  })()
    .catch((error) => {
      rememberTerminalStateUnavailable(accountId);
      console.warn('[Terminal] Dedicated terminal state is unavailable', error);
      return null;
    })
    .finally(() => {
      if (inFlightDedicatedTerminalPreferenceReads.get(accountId) === readPromise) {
        inFlightDedicatedTerminalPreferenceReads.delete(accountId);
      }
    });

  if (!existingRead) {
    inFlightDedicatedTerminalPreferenceReads.set(accountId, readPromise);
  }

  const result = await withSoftTimeout(readPromise, TERMINAL_PREFERENCES_TIMEOUT_MS);
  if (result.didTimeout) {
    return null;
  }

  return result.value;
};

const fetchSettingsTerminalPreferences = async (
  accountId: string,
): Promise<TerminalPreferences | null> => {
  const settings = await fetchSettingsSource();
  if (!settings) {
    return getSaveBackedSettingsFallbackPreferences(accountId);
  }

  return applySaveBackedSettingsFallback(
    accountId,
    parseSettingsTerminalPreferences(accountId, settings),
  );
};

const fetchSettingsSource = async (
  options: { softTimeout?: boolean } = {},
): Promise<Record<string, unknown> | null> => {
  const softTimeout = options.softTimeout ?? true;

  if (
    cachedSettingsSource &&
    Date.now() - cachedSettingsSource.fetchedAt <= SETTINGS_CACHE_TTL_MS
  ) {
    return cloneJsonRecord(cachedSettingsSource.settings);
  }

  if (inFlightSettingsSource) {
    if (!softTimeout) {
      const settings = await inFlightSettingsSource;
      return settings ? cloneJsonRecord(settings) : null;
    }

    const result = await withSoftTimeout(
      inFlightSettingsSource,
      TERMINAL_PREFERENCES_TIMEOUT_MS,
    );
    if (result.didTimeout) {
      return null;
    }

    return result.value ? cloneJsonRecord(result.value) : null;
  }

  const settingsFetchStartedAt = Date.now();
  inFlightSettingsSource = (async (): Promise<Record<string, unknown> | null> => {
    const response = await fetch(SETTINGS_ROUTE, {
      cache: 'no-store',
    });
    const payload = await parseJsonSafely(response);

    if (isGracefulUnavailableStatus(response.status)) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Terminal preferences request failed with status ${response.status}.`);
    }

    const settings = extractSettingsSource(payload);
    if (
      latestTerminalPreferencesSaveCachedAt > 0 &&
      latestTerminalPreferencesSaveCachedAt >= settingsFetchStartedAt
    ) {
      return cachedSettingsSource
        ? cloneJsonRecord(cachedSettingsSource.settings)
        : cloneJsonRecord(settings);
    }

    cachedSettingsSource = {
      settings: cloneJsonRecord(settings),
      fetchedAt: Date.now(),
    };
    return cloneJsonRecord(settings);
  })()
    .catch((error) => {
      console.warn('[Terminal] Terminal preferences are unavailable', error);
      return null;
    })
    .finally(() => {
      inFlightSettingsSource = null;
    });

  if (!softTimeout) {
    const settings = await inFlightSettingsSource;
    return settings ? cloneJsonRecord(settings) : null;
  }

  const result = await withSoftTimeout(
    inFlightSettingsSource,
    TERMINAL_PREFERENCES_TIMEOUT_MS,
  );
  if (result.didTimeout) {
    return null;
  }

  return result.value ? cloneJsonRecord(result.value) : null;
};

export async function fetchTerminalPreferences(
  accountId: string,
): Promise<TerminalPreferences | null> {
  const normalizedAccountId = accountId.trim();
  if (!normalizedAccountId) {
    return null;
  }

  const cached = getCachedTerminalPreferences(normalizedAccountId);
  if (cached !== undefined) {
    return cached;
  }

  const inFlightRead = inFlightTerminalPreferenceReads.get(normalizedAccountId);
  if (inFlightRead) {
    return cloneTerminalPreferences(await inFlightRead);
  }

  const readPromise = (async (): Promise<TerminalPreferences | null> => {
    const dedicatedPreferences = await fetchDedicatedTerminalPreferences(normalizedAccountId);
    if (dedicatedPreferences?.preferences) {
      return dedicatedPreferences.preferences;
    }

    const fallbackStartedAt = Date.now();
    return fetchSettingsTerminalPreferences(normalizedAccountId)
      .then((preferences) => cacheTerminalPreferences(normalizedAccountId, preferences, {
        source: 'settings',
        startedAt: fallbackStartedAt,
        skipIfNewerDedicated: true,
        skipIfNewerSave: true,
      }));
  })()
    .finally(() => {
      inFlightTerminalPreferenceReads.delete(normalizedAccountId);
    });

  inFlightTerminalPreferenceReads.set(normalizedAccountId, readPromise);
  return cloneTerminalPreferences(await readPromise);
}

const buildTerminalStatePayload = (
  input: SaveTerminalPreferencesInput,
): Record<string, unknown> => ({
  accountId: input.accountId,
  account_id: input.accountId,
  selectedSymbol: input.selectedSymbol,
  selected_symbol: input.selectedSymbol,
  openTabs: input.openTabs,
  open_tabs: input.openTabs,
  watchlistSymbols: input.watchlistSymbols,
  watchlist_symbols: input.watchlistSymbols,
  timeframeMinutes: input.timeframeMinutes ?? 1,
  timeframe_minutes: input.timeframeMinutes ?? 1,
  chartType: input.chartType,
  chart_type: input.chartType,
  chartLayoutPanes: input.chartLayoutPanes,
  chart_layout_panes: input.chartLayoutPanes,
  chartBarSpacing: normalizeChartBarSpacingPreference(input.chartBarSpacing),
  chart_bar_spacing: normalizeChartBarSpacingPreference(input.chartBarSpacing),
  updatedAt: new Date().toISOString(),
});

const buildTerminalPreferencesFromInput = (
  input: SaveTerminalPreferencesInput,
): TerminalPreferences => ({
  accountId: input.accountId,
  selectedSymbol: input.selectedSymbol,
  openTabs: [...input.openTabs],
  watchlistSymbols: [...input.watchlistSymbols],
  timeframeMinutes: input.timeframeMinutes,
  chartType: input.chartType,
  chartLayoutPanes: input.chartLayoutPanes,
  chartBarSpacing: normalizeChartBarSpacingPreference(input.chartBarSpacing),
  updatedAt: new Date().toISOString(),
});

const normalizeTimeframeMinutes = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 1;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 1;
};

const normalizePositiveNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizeChartBarSpacingPreference = (value: unknown): number | undefined => {
  const normalized = normalizePositiveNumber(value);
  return normalized === undefined
    ? undefined
    : Math.max(GLOBAL_CHART_SPACING.minBarSpacing, normalized);
};

const normalizeSaveTerminalPreferencesInput = (
  input: SaveTerminalPreferencesInput,
): SaveTerminalPreferencesInput => {
  const selectedSymbol = input.selectedSymbol?.trim() || null;

  return {
    accountId: input.accountId.trim(),
    selectedSymbol,
    openTabs: normalizeStringList(input.openTabs),
    watchlistSymbols: normalizeStringList(input.watchlistSymbols),
    timeframeMinutes: normalizeTimeframeMinutes(input.timeframeMinutes),
    chartType: input.chartType?.trim() || undefined,
    chartLayoutPanes: normalizePositiveNumber(input.chartLayoutPanes) !== undefined
      ? Math.trunc(normalizePositiveNumber(input.chartLayoutPanes) as number)
      : undefined,
    chartBarSpacing: normalizeChartBarSpacingPreference(input.chartBarSpacing),
  };
};

const getTerminalPreferencesSaveKey = (
  input: SaveTerminalPreferencesInput,
): string =>
  JSON.stringify({
    accountId: input.accountId,
    selectedSymbol: input.selectedSymbol,
    openTabs: input.openTabs,
    watchlistSymbols: input.watchlistSymbols,
    timeframeMinutes: input.timeframeMinutes,
    chartType: input.chartType,
    chartLayoutPanes: input.chartLayoutPanes,
    chartBarSpacing: input.chartBarSpacing,
  });

const isRecentSuccessfulTerminalPreferencesSave = (
  saveKey: string,
): boolean =>
  lastSuccessfulTerminalPreferencesSave?.key === saveKey &&
  Date.now() - lastSuccessfulTerminalPreferencesSave.savedAt <
    TERMINAL_PREFERENCES_LAST_SUCCESS_TTL_MS;

const hasPendingOrSerializedTerminalPreferencesSave = (
  accountId: string,
): boolean =>
  pendingTerminalPreferenceSaves.has(accountId) ||
  activeTerminalPreferenceSavesByAccount.has(accountId) ||
  queuedTerminalPreferenceSaves.has(accountId);

const updateCachedSettingsSourceFromTerminalPreferencesSave = (
  input: SaveTerminalPreferencesInput,
  savedAt: number,
): void => {
  const savedPayload = buildTerminalStatePayload(input);

  latestTerminalPreferencesSaveCachedAt = Math.max(
    latestTerminalPreferencesSaveCachedAt,
    savedAt,
  );
  saveBackedSettingsFallbackByAccount.set(input.accountId, {
    payload: cloneJsonRecord(savedPayload),
  });

  if (!cachedSettingsSource) {
    return;
  }

  const currentSettings = cloneJsonRecord(cachedSettingsSource.settings);
  const terminalByAccount = {
    ...extractTerminalByAccount(currentSettings),
    [input.accountId]: cloneJsonRecord(savedPayload),
  };
  const nextSettings = {
    ...currentSettings,
    [TERMINAL_BY_ACCOUNT_KEY]: terminalByAccount,
  };

  cachedSettingsSource = {
    settings: cloneJsonRecord(nextSettings),
    fetchedAt: savedAt,
  };
};

const persistTerminalPreferencesWithFallback = async (
  input: SaveTerminalPreferencesInput,
): Promise<boolean> => {
  const dedicatedSaved = await saveDedicatedTerminalPreferences(input);
  if (dedicatedSaved === true) {
    return true;
  }

  return saveSettingsTerminalPreferences(input);
};

const startTerminalPreferencesSave = (
  input: SaveTerminalPreferencesInput,
  saveKey: string,
): Promise<boolean> => {
  const inFlightSave = inFlightTerminalPreferenceSaves.get(saveKey);
  if (inFlightSave) {
    return inFlightSave;
  }

  const savePromise = persistTerminalPreferencesWithFallback(input)
    .then((saved) => {
      if (saved) {
        const savedAt = Date.now();
        lastSuccessfulTerminalPreferencesSave = {
          key: saveKey,
          savedAt,
        };
        cacheTerminalPreferences(
          input.accountId,
          buildTerminalPreferencesFromInput(input),
          { source: 'save' },
        );
        updateCachedSettingsSourceFromTerminalPreferencesSave(input, savedAt);
      }

      return saved;
    })
    .finally(() => {
      inFlightTerminalPreferenceSaves.delete(saveKey);
      if (activeTerminalPreferenceSavesByAccount.get(input.accountId) === savePromise) {
        activeTerminalPreferenceSavesByAccount.delete(input.accountId);
      }

      const queuedSave = queuedTerminalPreferenceSaves.get(input.accountId);
      if (queuedSave) {
        queuedTerminalPreferenceSaves.delete(input.accountId);
        void runOrQueueTerminalPreferencesSave(queuedSave.input, queuedSave.saveKey)
          .then(queuedSave.resolve);
      }
    });

  inFlightTerminalPreferenceSaves.set(saveKey, savePromise);
  activeTerminalPreferenceSavesByAccount.set(input.accountId, savePromise);
  return savePromise;
};

const runOrQueueTerminalPreferencesSave = (
  input: SaveTerminalPreferencesInput,
  saveKey: string,
): Promise<boolean> => {
  const inFlightSave = inFlightTerminalPreferenceSaves.get(saveKey);
  if (inFlightSave) {
    return inFlightSave;
  }

  if (activeTerminalPreferenceSavesByAccount.has(input.accountId)) {
    const queuedSave = queuedTerminalPreferenceSaves.get(input.accountId);
    if (queuedSave) {
      if (queuedSave.saveKey === saveKey) {
        return queuedSave.promise;
      }

      queuedSave.input = input;
      queuedSave.saveKey = saveKey;
      return queuedSave.promise;
    }

    let resolveQueuedSave: (saved: boolean) => void = () => undefined;
    const promise = new Promise<boolean>((resolve) => {
      resolveQueuedSave = resolve;
    });
    queuedTerminalPreferenceSaves.set(input.accountId, {
      input,
      promise,
      resolve: resolveQueuedSave,
      saveKey,
    });
    return promise;
  }

  if (isRecentSuccessfulTerminalPreferencesSave(saveKey)) {
    return Promise.resolve(true);
  }

  return startTerminalPreferencesSave(input, saveKey);
};

const scheduleTerminalPreferencesSave = (
  input: SaveTerminalPreferencesInput,
  saveKey: string,
): Promise<boolean> => {
  const pendingSave = pendingTerminalPreferenceSaves.get(input.accountId);
  if (pendingSave) {
    if (pendingSave.saveKey === saveKey) {
      return pendingSave.promise;
    }

    if (pendingSave.timeoutId) {
      clearTimeout(pendingSave.timeoutId);
    }
    pendingSave.input = input;
    pendingSave.saveKey = saveKey;
    pendingSave.timeoutId = setTimeout(() => {
      pendingTerminalPreferenceSaves.delete(input.accountId);
      void runOrQueueTerminalPreferencesSave(pendingSave.input, pendingSave.saveKey)
        .then(pendingSave.resolve);
    }, TERMINAL_PREFERENCES_SAVE_BATCH_MS);

    return pendingSave.promise;
  }

  let resolvePendingSave: (saved: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((resolve) => {
    resolvePendingSave = resolve;
  });
  const nextPendingSave: PendingTerminalPreferenceSave = {
    input,
    promise,
    resolve: resolvePendingSave,
    saveKey,
    timeoutId: null,
  };
  nextPendingSave.timeoutId = setTimeout(() => {
    pendingTerminalPreferenceSaves.delete(input.accountId);
    void runOrQueueTerminalPreferencesSave(nextPendingSave.input, nextPendingSave.saveKey)
      .then(nextPendingSave.resolve);
  }, TERMINAL_PREFERENCES_SAVE_BATCH_MS);

  pendingTerminalPreferenceSaves.set(input.accountId, nextPendingSave);
  return promise;
};

const saveDedicatedTerminalPreferences = async (
  input: SaveTerminalPreferencesInput,
): Promise<boolean | null> => {
  if (terminalStateUnavailable(input.accountId)) {
    return null;
  }

  try {
    const response = await fetch(getTerminalStateRoute(input.accountId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTerminalStatePayload(input)),
      cache: 'no-store',
    });

    if (isGracefulUnavailableStatus(response.status)) {
      rememberTerminalStateUnavailable(input.accountId);
      return null;
    }

    if (!response.ok) {
      throw new Error(`Dedicated terminal state save failed with status ${response.status}.`);
    }

    await parseJsonSafely(response);
    rememberTerminalStateAvailable(input.accountId);
    return true;
  } catch (error) {
    rememberTerminalStateUnavailable(input.accountId);
    console.warn('[Terminal] Dedicated terminal state save is unavailable', error);
    return null;
  }
};

const saveSettingsTerminalPreferences = async (
  input: SaveTerminalPreferencesInput,
): Promise<boolean> => {
  const accountId = input.accountId;

  try {
    const currentSettings = await fetchSettingsSource({ softTimeout: false }) ?? {};
    const terminalByAccount = {
      ...extractTerminalByAccount(currentSettings),
      [accountId]: buildTerminalStatePayload(input),
    };
    const nextSettings = {
      ...currentSettings,
      [TERMINAL_BY_ACCOUNT_KEY]: terminalByAccount,
    };

    const response = await fetch(SETTINGS_ROUTE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings_json: nextSettings,
        settingsJson: nextSettings,
        settings: nextSettings,
        [TERMINAL_BY_ACCOUNT_KEY]: terminalByAccount,
      }),
      cache: 'no-store',
    });

    if (isGracefulUnavailableStatus(response.status)) {
      return false;
    }

    if (!response.ok) {
      throw new Error(`Terminal preferences save failed with status ${response.status}.`);
    }

    cachedSettingsSource = {
      settings: cloneJsonRecord(nextSettings),
      fetchedAt: Date.now(),
    };
    return true;
  } catch (error) {
    console.warn('[Terminal] Failed to persist terminal preferences', error);
    return false;
  }
};

export async function saveTerminalPreferences(
  input: SaveTerminalPreferencesInput,
): Promise<boolean> {
  const normalizedInput = normalizeSaveTerminalPreferencesInput(input);
  if (!normalizedInput.accountId) {
    return false;
  }

  const saveKey = getTerminalPreferencesSaveKey(normalizedInput);
  const inFlightSave = inFlightTerminalPreferenceSaves.get(saveKey);
  if (inFlightSave) {
    return inFlightSave;
  }

  if (
    !hasPendingOrSerializedTerminalPreferencesSave(normalizedInput.accountId) &&
    isRecentSuccessfulTerminalPreferencesSave(saveKey)
  ) {
    return true;
  }

  return scheduleTerminalPreferencesSave(normalizedInput, saveKey);
}
