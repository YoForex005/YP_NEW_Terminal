import type { SymbolInfo } from '@/types/webtrader';

export type TerminalMarketCategory = string;

const TERMINAL_CATEGORY_SET = new Set<TerminalMarketCategory>([
  'forex',
  'crypto',
  'commodity',
  'index',
]);

const TERMINAL_PSEUDO_SYMBOLS = new Set([
  'ALL',
  'FOREX',
  'FX',
  'CRYPTO',
  'COMMODITY',
  'COMMODITIES',
  'INDEX',
  'INDICES',
]);

export const DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS = [
  'XAUUSD',
  'EURUSD',
  'AUDUSD',
  'GBPJPY',
  'BTCUSD',
] as const;

// Default chart tabs are independent from the broader first-run market watch.
// Each base symbol is resolved against the active broker catalogue at runtime.
export const DEFAULT_TERMINAL_CHART_SYMBOLS = [
  'XAUUSD',
  'EURUSD',
  'BTCUSD',
] as const;

export const DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS = [
  'XAUUSD',
  'EURUSD',
  'AUDUSD',
  'GBPJPY',
  'BTCUSD',
  'GBPUSD',
  'USDJPY',
  'USDCAD',
  'USDCHF',
  'NZDUSD',
  'XAGUSD',
  'ETHUSD',
  'US30',
  'US500',
] as const;

const DEFAULT_TERMINAL_SYMBOL_METADATA: Record<
  string,
  {
    category: TerminalMarketCategory;
    calcMode: SymbolInfo['calcMode'];
    contractSize: number;
    description: string;
    digits: number;
  }
> = {
  XAUUSD: {
    category: 'commodity',
    calcMode: 'cfdleverage',
    contractSize: 100,
    description: 'Gold / US Dollar',
    digits: 2,
  },
  EURUSD: {
    category: 'forex',
    calcMode: 'forex',
    contractSize: 100_000,
    description: 'Euro / US Dollar',
    digits: 5,
  },
  AUDUSD: {
    category: 'forex',
    calcMode: 'forex',
    contractSize: 100_000,
    description: 'Australian Dollar / US Dollar',
    digits: 5,
  },
  GBPJPY: {
    category: 'forex',
    calcMode: 'forex',
    contractSize: 100_000,
    description: 'British Pound / Japanese Yen',
    digits: 3,
  },
  BTCUSD: {
    category: 'crypto',
    calcMode: 'cfdleverage',
    contractSize: 1,
    description: 'Bitcoin / US Dollar',
    digits: 2,
  },
};

export const createDefaultTerminalSymbolInfo = (
  symbol: string,
): SymbolInfo => {
  const normalizedSymbol = normalizeText(symbol).toUpperCase();
  const fallbackCategory = getTerminalFallbackSymbolCategory(normalizedSymbol);
  const metadata = DEFAULT_TERMINAL_SYMBOL_METADATA[normalizedSymbol] ?? {
    category: fallbackCategory,
    calcMode: fallbackCategory === 'forex'
      ? 'forex'
      : fallbackCategory === 'index'
        ? 'cfdindex'
        : 'cfdleverage',
    contractSize: fallbackCategory === 'forex'
      ? 100_000
      : fallbackCategory === 'commodity'
        ? 100
        : 1,
    description: normalizedSymbol,
    digits: normalizedSymbol.includes('JPY') ? 3 : fallbackCategory === 'forex' ? 5 : 2,
  };
  const point = 10 ** -metadata.digits;

  return {
    name: normalizedSymbol,
    description: metadata.description,
    baseCurrency: normalizedSymbol.slice(0, 3),
    quoteCurrency: normalizedSymbol.slice(3, 6),
    digits: metadata.digits,
    point,
    tickSize: point,
    tickValue: point,
    tradeContractSize: metadata.contractSize,
    tradeMode: 'full',
    calcMode: metadata.calcMode,
    volumeMin: 0.01,
    volumeMax: 100,
    volumeStep: 0.01,
    marginInitial: 0,
    marginMaintenance: 0,
    swapLong: 0,
    swapShort: 0,
    category: metadata.category,
  };
};

export const getDefaultFirstRunTerminalSymbolInfos = (): SymbolInfo[] =>
  DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.map(createDefaultTerminalSymbolInfo);

const PREFERRED_SYMBOL_ORDER = [
  ...DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS,
  'USOIL',
  'UKOIL',
  'USTEC',
] as const;

export const INITIAL_TERMINAL_SUBSCRIPTION_LIMIT =
  DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.length;

const CRYPTO_BASE_SYMBOLS = new Set([
  'ADAUSD',
  'BNBUSD',
  'BTCUSD',
  'DOGEUSD',
  'ETHUSD',
  'LTCUSD',
  'SOLUSD',
  'XRPUSD',
]);

const COMMODITY_BASE_SYMBOLS = new Set([
  'UKOIL',
  'USOIL',
  'WTI',
  'XAGUSD',
  'XAUUSD',
]);

const INDEX_BASE_SYMBOLS = new Set([
  'DE40',
  'GER40',
  'JP225',
  'NAS100',
  'SPX500',
  'UK100',
  'US100',
  'US30',
  'US500',
  'USTEC',
]);

const KNOWN_BASE_SYMBOLS = [
  ...CRYPTO_BASE_SYMBOLS,
  ...COMMODITY_BASE_SYMBOLS,
  ...INDEX_BASE_SYMBOLS,
  ...PREFERRED_SYMBOL_ORDER,
].sort((left, right) => right.length - left.length);

const preferredRankBySymbol = new Map<string, number>(
  PREFERRED_SYMBOL_ORDER.map((symbol, index) => [symbol, index]),
);

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const PREFERRED_VARIANT_SUFFIX_ORDER = new Map<string, readonly string[]>([
  // No hardcoded suffixes; default to clean base symbols for standard accounts.
]);

export const stripExecutionSuffix = (symbol: string): string => {
  const normalized = symbol.trim().toUpperCase().replace(/\.[A-Za-z0-9]+$/u, '');

  if (/^[A-Z]{6}[A-Za-z0-9]{1,4}$/u.test(normalized)) {
    return normalized.slice(0, 6);
  }

  for (const baseSymbol of KNOWN_BASE_SYMBOLS) {
    if (normalized === baseSymbol) {
      return baseSymbol;
    }

    if (!normalized.startsWith(baseSymbol)) {
      continue;
    }

    const remainder = normalized.slice(baseSymbol.length);
    if (
      remainder.length > 0 &&
      remainder.length <= 4 &&
      /^[A-Za-z0-9]+$/u.test(remainder)
    ) {
      return baseSymbol;
    }
  }

  return normalized;
};

const getNormalizedBrokerBaseKey = (symbol: string): string =>
  stripExecutionSuffix(symbol).replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export const getBrokerSymbolVariantSuffix = (symbol: string): string => {
  const normalized = normalizeText(symbol).toUpperCase();
  if (!normalized) {
    return '';
  }

  const dottedSuffix = normalized.match(/\.([A-Z0-9]+)$/u)?.[1];
  if (dottedSuffix) {
    return dottedSuffix.toLowerCase();
  }

  const baseName = stripExecutionSuffix(normalized).toUpperCase();
  if (normalized === baseName) {
    return '';
  }

  return normalized.slice(baseName.length).toLowerCase();
};

function getBrokerSymbolVariantSuffixSortKey(symbol: string): [number, number, number, string] {
  const baseKey = getNormalizedBrokerBaseKey(symbol);
  const suffix = getBrokerSymbolVariantSuffix(symbol);



  if (!suffix) {
    return [0, 0, 0, suffix];
  }

  if (suffix === 'f') {
    return [3, 0, suffix.length, suffix];
  }

  const familySuffixOrder = PREFERRED_VARIANT_SUFFIX_ORDER.get(baseKey);
  const familyRank = familySuffixOrder?.indexOf(suffix) ?? -1;
  if (familyRank >= 0) {
    return [1, familyRank, suffix.length, suffix];
  }

  return [2, 0, suffix.length, suffix];
}

export const compareBrokerSymbolVariantSuffixes = (leftSymbol: string, rightSymbol: string): number => {
  const [leftGroup, leftFamilyRank, leftLength, leftSuffix] =
    getBrokerSymbolVariantSuffixSortKey(leftSymbol);
  const [rightGroup, rightFamilyRank, rightLength, rightSuffix] =
    getBrokerSymbolVariantSuffixSortKey(rightSymbol);

  if (leftGroup !== rightGroup) {
    return leftGroup - rightGroup;
  }

  if (leftFamilyRank !== rightFamilyRank) {
    return leftFamilyRank - rightFamilyRank;
  }

  if (leftLength !== rightLength) {
    return leftLength - rightLength;
  }

  return leftSuffix.localeCompare(rightSuffix);
};

export type LiveQuoteSnapshotLike = {
  symbol?: string;
  bid?: number;
  ask?: number;
  last?: number;
};

const GENERIC_SAFE_BROKER_SUFFIXES = new Set(['f', 'fix', 'cash']);
const SAFE_BROKER_SUFFIXES_BY_BASE = new Map<string, ReadonlySet<string>>([
  ['XAUUSD', new Set(['e', 'fix'])],
  ['EURUSD', new Set(['c', 'cent', 'e', 'u'])],
  ['BTCUSD', new Set(['m'])],
]);

function compactQuoteSymbolKey(symbol: string) {
  return symbol.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function isVettedBrokerSuffix(baseKey: string, suffix: string) {
  const normalizedSuffix = suffix.trim().toLowerCase();
  return Boolean(
    normalizedSuffix &&
    (
      GENERIC_SAFE_BROKER_SUFFIXES.has(normalizedSuffix) ||
      SAFE_BROKER_SUFFIXES_BY_BASE.get(baseKey)?.has(normalizedSuffix)
    ),
  );
}

function getVettedBrokerVariantBaseKey(symbol: string): string | null {
  const trimmed = symbol.trim();
  const separatedSuffixMatch = trimmed.match(/^(.+?)[._-]([A-Za-z0-9]{1,16})$/u);

  if (separatedSuffixMatch) {
    const baseKey = compactQuoteSymbolKey(separatedSuffixMatch[1]);
    const suffix = separatedSuffixMatch[2];
    return baseKey && isVettedBrokerSuffix(baseKey, suffix) ? baseKey : null;
  }

  const compactKey = compactQuoteSymbolKey(trimmed);
  for (const [baseKey] of SAFE_BROKER_SUFFIXES_BY_BASE) {
    if (compactKey.length <= baseKey.length || !compactKey.startsWith(baseKey)) {
      continue;
    }

    const suffix = compactKey.slice(baseKey.length);
    if (isVettedBrokerSuffix(baseKey, suffix)) {
      return baseKey;
    }
  }

  return null;
}

export function isSafeLiveQuoteCacheSymbolMatch(actualSymbol: string, requestedSymbol: string) {
  const actualKey = compactQuoteSymbolKey(actualSymbol);
  const requestedKey = compactQuoteSymbolKey(requestedSymbol);

  if (!actualKey || !requestedKey) {
    return false;
  }

  if (actualKey === requestedKey) {
    return true;
  }

  return (
    getVettedBrokerVariantBaseKey(requestedSymbol) === actualKey ||
    getVettedBrokerVariantBaseKey(actualSymbol) === requestedKey
  );
}

export function findSafeQuoteSnapshotBySymbol<T extends LiveQuoteSnapshotLike>(
  prices: Record<string, T>,
  symbol: string,
): T | undefined {
  const trimmed = symbol.trim();
  if (!trimmed) {
    return undefined;
  }

  const exact = prices[trimmed];
  if (exact) {
    return exact;
  }

  for (const [priceKey, price] of Object.entries(prices)) {
    const actualSymbol = price.symbol ?? priceKey;
    if (
      isSafeLiveQuoteCacheSymbolMatch(priceKey, trimmed) ||
      isSafeLiveQuoteCacheSymbolMatch(actualSymbol, trimmed)
    ) {
      return price;
    }
  }

  return undefined;
}

export function getSafeLiveQuoteSnapshotBySymbol<T extends LiveQuoteSnapshotLike>(
  symbol: string,
  readSnapshotBySymbol: (symbol: string) => T | undefined,
  prices: Record<string, T> = {},
): T | undefined {
  const trimmed = symbol.trim();
  if (!trimmed) {
    return undefined;
  }

  const immediateSnapshot = readSnapshotBySymbol(trimmed);
  if (
    immediateSnapshot?.symbol &&
    isSafeLiveQuoteCacheSymbolMatch(immediateSnapshot.symbol, trimmed)
  ) {
    return immediateSnapshot;
  }

  return findSafeQuoteSnapshotBySymbol(prices, trimmed);
}

export const formatTerminalDisplaySymbol = (symbol: string): string => {
  const trimmed = normalizeText(symbol);
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('.')) {
    return trimmed.replace(/\.[A-Za-z0-9]+$/u, '');
  }

  if (/^[A-Za-z]{6}[A-Za-z0-9]{1,4}$/u.test(trimmed)) {
    return trimmed.slice(0, 6).toUpperCase();
  }

  const stripped = stripExecutionSuffix(trimmed);
  return stripped.toUpperCase() === trimmed.toUpperCase() ? trimmed : stripped;
};

const normalizeCategory = (symbol: SymbolInfo): TerminalMarketCategory | null => {
  const normalized = normalizeText(symbol.category).toLowerCase();
  if (TERMINAL_CATEGORY_SET.has(normalized as TerminalMarketCategory)) {
    return normalized as TerminalMarketCategory;
  }

  const baseName = stripExecutionSuffix(symbol.name).toUpperCase();
  const combined = `${normalized} ${normalizeText(symbol.description).toLowerCase()} ${symbol.name.toLowerCase()} ${baseName.toLowerCase()}`;

  if (
    CRYPTO_BASE_SYMBOLS.has(baseName) ||
    /(crypto|bitcoin|ethereum|cardano|solana|ripple|litecoin|dogecoin|binance|xrp)/u.test(combined)
  ) {
    return 'crypto';
  }

  if (
    COMMODITY_BASE_SYMBOLS.has(baseName) ||
    /(metal|bullion|gold|silver|oil|gas|commodity|xau|xag|usoil|ukoil|wti)/u.test(combined)
  ) {
    return 'commodity';
  }

  if (
    INDEX_BASE_SYMBOLS.has(baseName) ||
    /(indice|index|nasdaq|dow|s&p|ustec|us30|us500|de40|ger40|uk100|jp225|nas100|spx500|us100)/u.test(combined)
  ) {
    return 'index';
  }

  if (
    /(forex|fx|eur|gbp|usd|jpy|aud|cad|nzd|chf|zar|mxn|nok|sek|pln|try)/u.test(combined) ||
    /^[A-Z]{6}$/u.test(baseName)
  ) {
    return 'forex';
  }

  // Unknown category — pass through the real MT5 group name so that symbols from
  // brokers with custom groups (Stocks, Metals, Energies, etc.) are never silently
  // dropped. Callers that previously checked for null will now always get a string.
  return normalizeText(symbol.category).toLowerCase() || 'other';
};

const isUnsupportedDerivative = (symbol: SymbolInfo): boolean => {
  const baseName = stripExecutionSuffix(symbol.name).toUpperCase();

  if (baseName.includes('FUTURE')) {
    return true;
  }

  if (baseName.includes('_')) {
    return true;
  }

  return false;
};

const compareVariantPreference = (left: SymbolInfo, right: SymbolInfo): number => {
  const leftTradeRank =
    left.tradeMode === 'closeonly' ? 1 : left.tradeMode === 'disabled' ? 2 : 0;
  const rightTradeRank =
    right.tradeMode === 'closeonly' ? 1 : right.tradeMode === 'disabled' ? 2 : 0;

  if (leftTradeRank !== rightTradeRank) {
    return leftTradeRank - rightTradeRank;
  }

  const suffixCompare = compareBrokerSymbolVariantSuffixes(left.name, right.name);
  if (suffixCompare !== 0) {
    return suffixCompare;
  }

  if (left.name.length !== right.name.length) {
    return left.name.length - right.name.length;
  }

  return left.name.localeCompare(right.name);
};

const getFinalSortRank = (symbol: SymbolInfo): [number, number, string] => {
  const baseName = stripExecutionSuffix(symbol.name).toUpperCase();
  const preferredRank = preferredRankBySymbol.get(baseName) ?? Number.MAX_SAFE_INTEGER;
  const category = normalizeCategory(symbol) ?? 'index';
  const categoryRank =
    category === 'forex'
      ? 0
      : category === 'commodity'
        ? 1
        : category === 'crypto'
          ? 2
          : 3;

  return [preferredRank, categoryRank, baseName];
};

export const getPreferredTerminalSymbols = (symbols: SymbolInfo[]): SymbolInfo[] => {
  const chosenByBase = new Map<string, SymbolInfo>();

  for (const rawSymbol of symbols) {
    const name = normalizeText(rawSymbol.name);
    if (!name) {
      continue;
    }

    const category = normalizeCategory(rawSymbol);
    if (!category) {
      continue;
    }

    const normalizedSymbol: SymbolInfo = {
      ...rawSymbol,
      category,
    };

    if (isUnsupportedDerivative(normalizedSymbol)) {
      continue;
    }

    const baseName = stripExecutionSuffix(name).toUpperCase();
    const current = chosenByBase.get(baseName);
    if (!current || compareVariantPreference(normalizedSymbol, current) < 0) {
      chosenByBase.set(baseName, normalizedSymbol);
    }
  }

  return [...chosenByBase.values()].sort((left, right) => {
    const [leftPreferred, leftCategory, leftName] = getFinalSortRank(left);
    const [rightPreferred, rightCategory, rightName] = getFinalSortRank(right);

    if (leftPreferred !== rightPreferred) {
      return leftPreferred - rightPreferred;
    }

    if (leftCategory !== rightCategory) {
      return leftCategory - rightCategory;
    }

    return leftName.localeCompare(rightName);
  });
};

export const getTerminalDisplaySymbols = (symbols: SymbolInfo[]): SymbolInfo[] =>
  symbols
    .map((rawSymbol): SymbolInfo | null => {
      const name = normalizeText(rawSymbol.name);
      if (!name) {
        return null;
      }

      const normalizedName = name.toUpperCase();
      if (TERMINAL_PSEUDO_SYMBOLS.has(normalizedName)) {
        return null;
      }

      const category = normalizeCategory({ ...rawSymbol, name });
      if (!category) {
        return null;
      }

      const normalizedSymbol: SymbolInfo = {
        ...rawSymbol,
        name,
        category,
      };

      if (isUnsupportedDerivative(normalizedSymbol)) {
        return null;
      }

      return {
        ...normalizedSymbol,
      };
    })
    .filter((symbol): symbol is SymbolInfo => Boolean(symbol));

export interface TerminalFallbackSymbolSeedOptions {
  selectedSymbol?: string | null;
  openTabs?: readonly string[] | null;
  watchlistSymbols?: readonly string[] | null;
}

const getTerminalFallbackSymbolCategory = (symbol: string): TerminalMarketCategory => {
  const baseName = stripExecutionSuffix(symbol).toUpperCase();

  if (CRYPTO_BASE_SYMBOLS.has(baseName)) {
    return 'crypto';
  }

  if (COMMODITY_BASE_SYMBOLS.has(baseName)) {
    return 'commodity';
  }

  if (INDEX_BASE_SYMBOLS.has(baseName)) {
    return 'index';
  }

  return 'forex';
};

const createTerminalFallbackSymbolInfo = (symbol: string): SymbolInfo => {
  const name = normalizeText(symbol);
  const baseName = stripExecutionSuffix(name).toUpperCase();
  const defaultSymbol = DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.find(
    (candidate) => candidate === baseName,
  );
  const metadata = defaultSymbol ? DEFAULT_TERMINAL_SYMBOL_METADATA[defaultSymbol] : null;
  const category = metadata?.category ?? getTerminalFallbackSymbolCategory(name);
  const digits = metadata?.digits ?? (category === 'forex' ? 5 : 2);
  const point = 10 ** -digits;
  const calcMode: SymbolInfo['calcMode'] =
    metadata?.calcMode ?? (category === 'forex' ? 'forex' : category === 'index' ? 'cfdindex' : 'cfdleverage');
  const contractSize =
    metadata?.contractSize ?? (category === 'forex' ? 100_000 : category === 'commodity' ? 100 : 1);
  const currencyBase = /^[A-Z]{6}$/u.test(baseName) ? baseName.slice(0, 3) : baseName;
  const currencyQuote = /^[A-Z]{6}$/u.test(baseName) ? baseName.slice(3, 6) : 'USD';

  return {
    name,
    description: metadata?.description ?? baseName,
    baseCurrency: currencyBase,
    quoteCurrency: currencyQuote,
    digits,
    point,
    tickSize: point,
    tickValue: point,
    tradeContractSize: contractSize,
    tradeMode: 'full',
    calcMode,
    volumeMin: 0.01,
    volumeMax: 100,
    volumeStep: 0.01,
    marginInitial: 0,
    marginMaintenance: 0,
    swapLong: 0,
    swapShort: 0,
    category,
  };
};

export const getTerminalFallbackSeedSymbols = (
  options: TerminalFallbackSymbolSeedOptions = {},
): string[] => {
  const persistedCandidates = [
    options.selectedSymbol,
    ...(options.openTabs ?? []),
    ...(options.watchlistSymbols ?? []),
  ];
  const persistedSymbols: string[] = [];
  const seen = new Set<string>();

  for (const candidate of persistedCandidates) {
    const symbol = normalizeText(candidate);
    if (!symbol) {
      continue;
    }

    const key = getNormalizedBrokerBaseKey(symbol);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    persistedSymbols.push(symbol);
  }

  return persistedSymbols.length > 0
    ? persistedSymbols
    : [...DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS];
};

export const getTerminalFallbackSymbolInfos = (
  options: TerminalFallbackSymbolSeedOptions = {},
): SymbolInfo[] => getTerminalDisplaySymbols(
  getTerminalFallbackSeedSymbols(options).map(createTerminalFallbackSymbolInfo),
);

export const getTerminalSubscriptionSymbols = (symbols: SymbolInfo[]): string[] => [
  ...new Set(
    getTerminalDisplaySymbols(symbols)
      .map((symbol) => normalizeText(symbol.name))
      .filter(Boolean),
  ),
];

interface InitialTerminalSubscriptionOptions {
  preferredSymbols?: readonly string[];
  limit?: number;
}

export const getInitialTerminalSubscriptionSymbols = (
  symbols: SymbolInfo[],
  options: InitialTerminalSubscriptionOptions = {},
): string[] => {
  const limit = Math.max(
    0,
    Math.floor(options.limit ?? INITIAL_TERMINAL_SUBSCRIPTION_LIMIT),
  );

  if (limit === 0) {
    return [];
  }

  const preferredSymbols = getPreferredTerminalSymbols(symbols);
  const displaySymbols = getTerminalDisplaySymbols(symbols);
  const preferredByBase = new Map<string, SymbolInfo>();
  const displayByExactName = new Map<string, SymbolInfo>();

  for (const symbol of displaySymbols) {
    displayByExactName.set(symbol.name, symbol);
  }

  for (const symbol of [...preferredSymbols, ...displaySymbols]) {
    const baseName = stripExecutionSuffix(symbol.name).toUpperCase();
    if (!baseName || preferredByBase.has(baseName)) {
      continue;
    }

    preferredByBase.set(baseName, symbol);
  }

  const subscriptions: string[] = [];
  const seen = new Set<string>();
  const append = (symbol: string | undefined) => {
    const normalized = normalizeText(symbol);
    if (!normalized || seen.has(normalized) || subscriptions.length >= limit) {
      return;
    }

    seen.add(normalized);
    subscriptions.push(normalized);
  };

  options.preferredSymbols?.forEach((seedSymbol) => {
    const normalizedSeed = normalizeText(seedSymbol);
    const baseName = stripExecutionSuffix(normalizedSeed).toUpperCase();
    append(
      displayByExactName.get(normalizedSeed)?.name ??
        preferredByBase.get(baseName)?.name,
    );
  });
  preferredSymbols.forEach((symbol) => {
    append(symbol.name);
  });
  displaySymbols.forEach((symbol) => {
    append(symbol.name);
  });

  return subscriptions;
};

export const getPreferredTerminalSubscriptionSymbols = (symbols: SymbolInfo[]): string[] => {
  const preferredSymbols = getPreferredTerminalSymbols(symbols);
  const displaySymbols = getTerminalDisplaySymbols(symbols);
  const marketSymbols = preferredSymbols.length > 0 ? preferredSymbols : displaySymbols;
  const selectedBases = new Set(
    marketSymbols.map((symbol) => stripExecutionSuffix(symbol.name).toUpperCase()),
  );
  const subscriptions = new Set<string>();

  for (const rawSymbol of displaySymbols) {
    const name = normalizeText(rawSymbol.name);
    if (!name) {
      continue;
    }

    const category = normalizeCategory(rawSymbol);
    if (!category) {
      continue;
    }

    const normalizedSymbol: SymbolInfo = {
      ...rawSymbol,
      category,
    };

    if (isUnsupportedDerivative(normalizedSymbol)) {
      continue;
    }

    const baseName = stripExecutionSuffix(name).toUpperCase();
    if (!selectedBases.has(baseName)) {
      continue;
    }

    subscriptions.add(name);
  }

  return [...subscriptions];
};
