import { stripExecutionSuffix } from '@/lib/trading/terminal-symbols';

const KNOWN_SYMBOL_ALIAS_GROUPS = [
  ['XAU/USD', 'XAUUSD', 'GOLD'],
  ['BTC', 'BTCUSD', 'BTC/USD'],
  ['EUR/USD', 'EURUSD'],
  ['GBP/USD', 'GBPUSD'],
  ['USD/JPY', 'USDJPY'],
  ['AAPL'],
  ['USTEC', 'US100', 'NAS100'],
  ['USOIL', 'WTI', 'XTIUSD'],
] as const;

const aliasesByCanonical = new Map<string, string[]>();
const canonicalByAlias = new Map<string, string>();
// Memoizes getSymbolAliases results — aliases are static after init, so caching
// avoids the Set + array allocation on the hot tick path (called on every price update).
const symbolAliasCache = new Map<string, string[]>();

for (const group of KNOWN_SYMBOL_ALIAS_GROUPS) {
  const aliases = [...new Set(group.map((alias) => alias.trim()).filter(Boolean))];
  const canonical = normalizeSymbolKey(aliases[0]);

  aliasesByCanonical.set(canonical, aliases);

  for (const alias of aliases) {
    canonicalByAlias.set(normalizeSymbolKey(alias), canonical);
  }
}

export function normalizeSymbolKey(symbol: string): string {
  return stripExecutionSuffix(symbol).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function compactSymbolKey(symbol: string): string {
  return symbol.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function isBoundedShortSymbolPrefixAlias(candidate: string, preferredCandidate: string): boolean {
  const normalizedCandidate = compactSymbolKey(candidate);
  const normalizedPreferredCandidate = compactSymbolKey(preferredCandidate);
  if (
    !normalizedCandidate ||
    !normalizedPreferredCandidate ||
    normalizedCandidate === normalizedPreferredCandidate ||
    normalizedCandidate.length < 4 ||
    normalizedCandidate.length >= 6 ||
    !/[0-9]/u.test(normalizedCandidate) ||
    !normalizedPreferredCandidate.startsWith(normalizedCandidate) ||
    normalizedPreferredCandidate.length <= normalizedCandidate.length
  ) {
    return false;
  }

  const suffix = normalizedPreferredCandidate.slice(normalizedCandidate.length);
  return suffix.length <= 8 && /^[A-Z]+$/u.test(suffix);
}

export function getCanonicalSymbol(symbol: string): string {
  const normalized = normalizeSymbolKey(symbol);
  return canonicalByAlias.get(normalized) ?? normalized;
}

export function getSymbolAliases(symbol: string): string[] {
  const trimmed = symbol.trim();
  const cached = symbolAliasCache.get(trimmed);
  if (cached) return cached;

  const canonical = getCanonicalSymbol(trimmed);
  const knownAliases = aliasesByCanonical.get(canonical);
  const aliases = new Set<string>();

  if (trimmed) {
    aliases.add(trimmed);
  }

  knownAliases?.forEach((alias) => aliases.add(alias));

  if (canonical) {
    aliases.add(canonical);
  }

  if (!knownAliases && canonical && /^[A-Z]{6}$/.test(canonical)) {
    aliases.add(`${canonical.slice(0, 3)}/${canonical.slice(3)}`);
  }

  const result = [...aliases];
  symbolAliasCache.set(trimmed, result);
  return result;
}

export function symbolsMatch(left: string, right: string): boolean {
  return getCanonicalSymbol(left) === getCanonicalSymbol(right);
}

export function findValueBySymbol<T>(values: Record<string, T>, symbol: string): T | undefined {
  for (const alias of getSymbolAliases(symbol)) {
    const value = values[alias];
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}
