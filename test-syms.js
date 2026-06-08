"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreferredTerminalSubscriptionSymbols = exports.getInitialTerminalSubscriptionSymbols = exports.getTerminalSubscriptionSymbols = exports.getTerminalFallbackSymbolInfos = exports.getTerminalFallbackSeedSymbols = exports.getTerminalDisplaySymbols = exports.getPreferredTerminalSymbols = exports.formatTerminalDisplaySymbol = exports.compareBrokerSymbolVariantSuffixes = exports.getBrokerSymbolVariantSuffix = exports.stripExecutionSuffix = exports.INITIAL_TERMINAL_SUBSCRIPTION_LIMIT = exports.getDefaultFirstRunTerminalSymbolInfos = exports.createDefaultTerminalSymbolInfo = exports.DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS = exports.DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS = void 0;
exports.isSafeLiveQuoteCacheSymbolMatch = isSafeLiveQuoteCacheSymbolMatch;
exports.findSafeQuoteSnapshotBySymbol = findSafeQuoteSnapshotBySymbol;
exports.getSafeLiveQuoteSnapshotBySymbol = getSafeLiveQuoteSnapshotBySymbol;
var TERMINAL_CATEGORY_SET = new Set([
    'forex',
    'crypto',
    'commodity',
    'index',
]);
var TERMINAL_PSEUDO_SYMBOLS = new Set([
    'ALL',
    'FOREX',
    'FX',
    'CRYPTO',
    'COMMODITY',
    'COMMODITIES',
    'INDEX',
    'INDICES',
]);
exports.DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS = [
    'XAUUSD',
    'EURUSD',
    'AUDUSD',
    'GBPJPY',
    'BTCUSD',
];
exports.DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS = [
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
];
var DEFAULT_TERMINAL_SYMBOL_METADATA = {
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
        contractSize: 100000,
        description: 'Euro / US Dollar',
        digits: 5,
    },
    AUDUSD: {
        category: 'forex',
        calcMode: 'forex',
        contractSize: 100000,
        description: 'Australian Dollar / US Dollar',
        digits: 5,
    },
    GBPJPY: {
        category: 'forex',
        calcMode: 'forex',
        contractSize: 100000,
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
var createDefaultTerminalSymbolInfo = function (symbol) {
    var metadata = DEFAULT_TERMINAL_SYMBOL_METADATA[symbol];
    var point = Math.pow(10, -metadata.digits);
    return {
        name: symbol,
        description: metadata.description,
        baseCurrency: symbol.slice(0, 3),
        quoteCurrency: symbol.slice(3, 6),
        digits: metadata.digits,
        point: point,
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
exports.createDefaultTerminalSymbolInfo = createDefaultTerminalSymbolInfo;
var getDefaultFirstRunTerminalSymbolInfos = function () {
    return exports.DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.map(exports.createDefaultTerminalSymbolInfo);
};
exports.getDefaultFirstRunTerminalSymbolInfos = getDefaultFirstRunTerminalSymbolInfos;
var PREFERRED_SYMBOL_ORDER = __spreadArray(__spreadArray([], __read(exports.DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS), false), [
    'USOIL',
    'UKOIL',
    'USTEC',
], false);
exports.INITIAL_TERMINAL_SUBSCRIPTION_LIMIT = exports.DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.length;
var CRYPTO_BASE_SYMBOLS = new Set([
    'ADAUSD',
    'BNBUSD',
    'BTCUSD',
    'DOGEUSD',
    'ETHUSD',
    'LTCUSD',
    'SOLUSD',
    'XRPUSD',
]);
var COMMODITY_BASE_SYMBOLS = new Set([
    'UKOIL',
    'USOIL',
    'WTI',
    'XAGUSD',
    'XAUUSD',
]);
var INDEX_BASE_SYMBOLS = new Set([
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
var KNOWN_BASE_SYMBOLS = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], __read(CRYPTO_BASE_SYMBOLS), false), __read(COMMODITY_BASE_SYMBOLS), false), __read(INDEX_BASE_SYMBOLS), false), __read(PREFERRED_SYMBOL_ORDER), false).sort(function (left, right) { return right.length - left.length; });
var preferredRankBySymbol = new Map(PREFERRED_SYMBOL_ORDER.map(function (symbol, index) { return [symbol, index]; }));
var normalizeText = function (value) {
    return typeof value === 'string' ? value.trim() : '';
};
var PREFERRED_VARIANT_SUFFIX_ORDER = new Map([
// No hardcoded suffixes; default to clean base symbols for standard accounts.
]);
var stripExecutionSuffix = function (symbol) {
    var e_1, _a;
    var normalized = symbol.trim().toUpperCase().replace(/\.[A-Za-z0-9]+$/u, '');
    if (/^[A-Z]{6}[A-Za-z0-9]{1,4}$/u.test(normalized)) {
        return normalized.slice(0, 6);
    }
    try {
        for (var KNOWN_BASE_SYMBOLS_1 = __values(KNOWN_BASE_SYMBOLS), KNOWN_BASE_SYMBOLS_1_1 = KNOWN_BASE_SYMBOLS_1.next(); !KNOWN_BASE_SYMBOLS_1_1.done; KNOWN_BASE_SYMBOLS_1_1 = KNOWN_BASE_SYMBOLS_1.next()) {
            var baseSymbol = KNOWN_BASE_SYMBOLS_1_1.value;
            if (normalized === baseSymbol) {
                return baseSymbol;
            }
            if (!normalized.startsWith(baseSymbol)) {
                continue;
            }
            var remainder = normalized.slice(baseSymbol.length);
            if (remainder.length > 0 &&
                remainder.length <= 4 &&
                /^[A-Za-z0-9]+$/u.test(remainder)) {
                return baseSymbol;
            }
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (KNOWN_BASE_SYMBOLS_1_1 && !KNOWN_BASE_SYMBOLS_1_1.done && (_a = KNOWN_BASE_SYMBOLS_1.return)) _a.call(KNOWN_BASE_SYMBOLS_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    return normalized;
};
exports.stripExecutionSuffix = stripExecutionSuffix;
var getNormalizedBrokerBaseKey = function (symbol) {
    return (0, exports.stripExecutionSuffix)(symbol).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
};
var getBrokerSymbolVariantSuffix = function (symbol) {
    var _a;
    var normalized = normalizeText(symbol).toUpperCase();
    if (!normalized) {
        return '';
    }
    var dottedSuffix = (_a = normalized.match(/\.([A-Z0-9]+)$/u)) === null || _a === void 0 ? void 0 : _a[1];
    if (dottedSuffix) {
        return dottedSuffix.toLowerCase();
    }
    var baseName = (0, exports.stripExecutionSuffix)(normalized).toUpperCase();
    if (normalized === baseName) {
        return '';
    }
    return normalized.slice(baseName.length).toLowerCase();
};
exports.getBrokerSymbolVariantSuffix = getBrokerSymbolVariantSuffix;
function getBrokerSymbolVariantSuffixSortKey(symbol) {
    var _a;
    var baseKey = getNormalizedBrokerBaseKey(symbol);
    var suffix = (0, exports.getBrokerSymbolVariantSuffix)(symbol);
    if (!suffix) {
        return [0, 0, 0, suffix];
    }
    if (suffix === 'f') {
        return [3, 0, suffix.length, suffix];
    }
    var familySuffixOrder = PREFERRED_VARIANT_SUFFIX_ORDER.get(baseKey);
    var familyRank = (_a = familySuffixOrder === null || familySuffixOrder === void 0 ? void 0 : familySuffixOrder.indexOf(suffix)) !== null && _a !== void 0 ? _a : -1;
    if (familyRank >= 0) {
        return [1, familyRank, suffix.length, suffix];
    }
    return [2, 0, suffix.length, suffix];
}
var compareBrokerSymbolVariantSuffixes = function (leftSymbol, rightSymbol) {
    var _a = __read(getBrokerSymbolVariantSuffixSortKey(leftSymbol), 4), leftGroup = _a[0], leftFamilyRank = _a[1], leftLength = _a[2], leftSuffix = _a[3];
    var _b = __read(getBrokerSymbolVariantSuffixSortKey(rightSymbol), 4), rightGroup = _b[0], rightFamilyRank = _b[1], rightLength = _b[2], rightSuffix = _b[3];
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
exports.compareBrokerSymbolVariantSuffixes = compareBrokerSymbolVariantSuffixes;
var GENERIC_SAFE_BROKER_SUFFIXES = new Set(['f', 'fix', 'cash']);
var SAFE_BROKER_SUFFIXES_BY_BASE = new Map([
    ['XAUUSD', new Set(['e', 'fix'])],
    ['EURUSD', new Set(['c', 'cent', 'e', 'u'])],
    ['BTCUSD', new Set(['m'])],
]);
function compactQuoteSymbolKey(symbol) {
    return symbol.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}
function isVettedBrokerSuffix(baseKey, suffix) {
    var _a;
    var normalizedSuffix = suffix.trim().toLowerCase();
    return Boolean(normalizedSuffix &&
        (GENERIC_SAFE_BROKER_SUFFIXES.has(normalizedSuffix) ||
            ((_a = SAFE_BROKER_SUFFIXES_BY_BASE.get(baseKey)) === null || _a === void 0 ? void 0 : _a.has(normalizedSuffix))));
}
function getVettedBrokerVariantBaseKey(symbol) {
    var e_2, _a;
    var trimmed = symbol.trim();
    var separatedSuffixMatch = trimmed.match(/^(.+?)[._-]([A-Za-z0-9]{1,16})$/u);
    if (separatedSuffixMatch) {
        var baseKey = compactQuoteSymbolKey(separatedSuffixMatch[1]);
        var suffix = separatedSuffixMatch[2];
        return baseKey && isVettedBrokerSuffix(baseKey, suffix) ? baseKey : null;
    }
    var compactKey = compactQuoteSymbolKey(trimmed);
    try {
        for (var SAFE_BROKER_SUFFIXES_BY_BASE_1 = __values(SAFE_BROKER_SUFFIXES_BY_BASE), SAFE_BROKER_SUFFIXES_BY_BASE_1_1 = SAFE_BROKER_SUFFIXES_BY_BASE_1.next(); !SAFE_BROKER_SUFFIXES_BY_BASE_1_1.done; SAFE_BROKER_SUFFIXES_BY_BASE_1_1 = SAFE_BROKER_SUFFIXES_BY_BASE_1.next()) {
            var _b = __read(SAFE_BROKER_SUFFIXES_BY_BASE_1_1.value, 1), baseKey = _b[0];
            if (compactKey.length <= baseKey.length || !compactKey.startsWith(baseKey)) {
                continue;
            }
            var suffix = compactKey.slice(baseKey.length);
            if (isVettedBrokerSuffix(baseKey, suffix)) {
                return baseKey;
            }
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (SAFE_BROKER_SUFFIXES_BY_BASE_1_1 && !SAFE_BROKER_SUFFIXES_BY_BASE_1_1.done && (_a = SAFE_BROKER_SUFFIXES_BY_BASE_1.return)) _a.call(SAFE_BROKER_SUFFIXES_BY_BASE_1);
        }
        finally { if (e_2) throw e_2.error; }
    }
    return null;
}
function isSafeLiveQuoteCacheSymbolMatch(actualSymbol, requestedSymbol) {
    var actualKey = compactQuoteSymbolKey(actualSymbol);
    var requestedKey = compactQuoteSymbolKey(requestedSymbol);
    if (!actualKey || !requestedKey) {
        return false;
    }
    if (actualKey === requestedKey) {
        return true;
    }
    return (getVettedBrokerVariantBaseKey(requestedSymbol) === actualKey ||
        getVettedBrokerVariantBaseKey(actualSymbol) === requestedKey);
}
function findSafeQuoteSnapshotBySymbol(prices, symbol) {
    var e_3, _a;
    var _b;
    var trimmed = symbol.trim();
    if (!trimmed) {
        return undefined;
    }
    var exact = prices[trimmed];
    if (exact) {
        return exact;
    }
    try {
        for (var _c = __values(Object.entries(prices)), _d = _c.next(); !_d.done; _d = _c.next()) {
            var _e = __read(_d.value, 2), priceKey = _e[0], price = _e[1];
            var actualSymbol = (_b = price.symbol) !== null && _b !== void 0 ? _b : priceKey;
            if (isSafeLiveQuoteCacheSymbolMatch(priceKey, trimmed) ||
                isSafeLiveQuoteCacheSymbolMatch(actualSymbol, trimmed)) {
                return price;
            }
        }
    }
    catch (e_3_1) { e_3 = { error: e_3_1 }; }
    finally {
        try {
            if (_d && !_d.done && (_a = _c.return)) _a.call(_c);
        }
        finally { if (e_3) throw e_3.error; }
    }
    return undefined;
}
function getSafeLiveQuoteSnapshotBySymbol(symbol, readSnapshotBySymbol, prices) {
    if (prices === void 0) { prices = {}; }
    var trimmed = symbol.trim();
    if (!trimmed) {
        return undefined;
    }
    var immediateSnapshot = readSnapshotBySymbol(trimmed);
    if ((immediateSnapshot === null || immediateSnapshot === void 0 ? void 0 : immediateSnapshot.symbol) &&
        isSafeLiveQuoteCacheSymbolMatch(immediateSnapshot.symbol, trimmed)) {
        return immediateSnapshot;
    }
    return findSafeQuoteSnapshotBySymbol(prices, trimmed);
}
var formatTerminalDisplaySymbol = function (symbol) {
    var trimmed = normalizeText(symbol);
    if (!trimmed) {
        return '';
    }
    if (trimmed.includes('.')) {
        return trimmed.replace(/\.[A-Za-z0-9]+$/u, '');
    }
    if (/^[A-Za-z]{6}[A-Za-z0-9]{1,4}$/u.test(trimmed)) {
        return trimmed.slice(0, 6).toUpperCase();
    }
    var stripped = (0, exports.stripExecutionSuffix)(trimmed);
    return stripped.toUpperCase() === trimmed.toUpperCase() ? trimmed : stripped;
};
exports.formatTerminalDisplaySymbol = formatTerminalDisplaySymbol;
var normalizeCategory = function (symbol) {
    var normalized = normalizeText(symbol.category).toLowerCase();
    if (TERMINAL_CATEGORY_SET.has(normalized)) {
        return normalized;
    }
    var baseName = (0, exports.stripExecutionSuffix)(symbol.name).toUpperCase();
    var combined = "".concat(normalized, " ").concat(normalizeText(symbol.description).toLowerCase(), " ").concat(symbol.name.toLowerCase(), " ").concat(baseName.toLowerCase());
    if (CRYPTO_BASE_SYMBOLS.has(baseName) ||
        /(crypto|bitcoin|ethereum|cardano|solana|ripple|litecoin|dogecoin|binance|xrp)/u.test(combined)) {
        return 'crypto';
    }
    if (COMMODITY_BASE_SYMBOLS.has(baseName) ||
        /(metal|bullion|gold|silver|oil|gas|commodity|xau|xag|usoil|ukoil|wti)/u.test(combined)) {
        return 'commodity';
    }
    if (INDEX_BASE_SYMBOLS.has(baseName) ||
        /(indice|index|nasdaq|dow|s&p|ustec|us30|us500|de40|ger40|uk100|jp225|nas100|spx500|us100)/u.test(combined)) {
        return 'index';
    }
    if (/(forex|fx|eur|gbp|usd|jpy|aud|cad|nzd|chf|zar|mxn|nok|sek|pln|try)/u.test(combined) ||
        /^[A-Z]{6}$/u.test(baseName)) {
        return 'forex';
    }
    // Unknown category — pass through the real MT5 group name so that symbols from
    // brokers with custom groups (Stocks, Metals, Energies, etc.) are never silently
    // dropped. Callers that previously checked for null will now always get a string.
    return normalizeText(symbol.category).toLowerCase() || 'other';
};
var isUnsupportedDerivative = function (symbol) {
    var baseName = (0, exports.stripExecutionSuffix)(symbol.name).toUpperCase();
    if (baseName.includes('FUTURE')) {
        return true;
    }
    if (baseName.includes('_')) {
        return true;
    }
    return false;
};
var compareVariantPreference = function (left, right) {
    var leftTradeRank = left.tradeMode === 'closeonly' ? 1 : left.tradeMode === 'disabled' ? 2 : 0;
    var rightTradeRank = right.tradeMode === 'closeonly' ? 1 : right.tradeMode === 'disabled' ? 2 : 0;
    if (leftTradeRank !== rightTradeRank) {
        return leftTradeRank - rightTradeRank;
    }
    var suffixCompare = (0, exports.compareBrokerSymbolVariantSuffixes)(left.name, right.name);
    if (suffixCompare !== 0) {
        return suffixCompare;
    }
    if (left.name.length !== right.name.length) {
        return left.name.length - right.name.length;
    }
    return left.name.localeCompare(right.name);
};
var getFinalSortRank = function (symbol) {
    var _a, _b;
    var baseName = (0, exports.stripExecutionSuffix)(symbol.name).toUpperCase();
    var preferredRank = (_a = preferredRankBySymbol.get(baseName)) !== null && _a !== void 0 ? _a : Number.MAX_SAFE_INTEGER;
    var category = (_b = normalizeCategory(symbol)) !== null && _b !== void 0 ? _b : 'index';
    var categoryRank = category === 'forex'
        ? 0
        : category === 'commodity'
            ? 1
            : category === 'crypto'
                ? 2
                : 3;
    return [preferredRank, categoryRank, baseName];
};
var getPreferredTerminalSymbols = function (symbols) {
    var e_4, _a;
    var chosenByBase = new Map();
    try {
        for (var symbols_1 = __values(symbols), symbols_1_1 = symbols_1.next(); !symbols_1_1.done; symbols_1_1 = symbols_1.next()) {
            var rawSymbol = symbols_1_1.value;
            var name = normalizeText(rawSymbol.name);
            if (!name) {
                continue;
            }
            var category = normalizeCategory(rawSymbol);
            if (!category) {
                continue;
            }
            var normalizedSymbol = __assign(__assign({}, rawSymbol), { category: category });
            if (isUnsupportedDerivative(normalizedSymbol)) {
                continue;
            }
            var baseName = (0, exports.stripExecutionSuffix)(name).toUpperCase();
            var current = chosenByBase.get(baseName);
            if (!current || compareVariantPreference(normalizedSymbol, current) < 0) {
                chosenByBase.set(baseName, normalizedSymbol);
            }
        }
    }
    catch (e_4_1) { e_4 = { error: e_4_1 }; }
    finally {
        try {
            if (symbols_1_1 && !symbols_1_1.done && (_a = symbols_1.return)) _a.call(symbols_1);
        }
        finally { if (e_4) throw e_4.error; }
    }
    return __spreadArray([], __read(chosenByBase.values()), false).sort(function (left, right) {
        var _a = __read(getFinalSortRank(left), 3), leftPreferred = _a[0], leftCategory = _a[1], leftName = _a[2];
        var _b = __read(getFinalSortRank(right), 3), rightPreferred = _b[0], rightCategory = _b[1], rightName = _b[2];
        if (leftPreferred !== rightPreferred) {
            return leftPreferred - rightPreferred;
        }
        if (leftCategory !== rightCategory) {
            return leftCategory - rightCategory;
        }
        return leftName.localeCompare(rightName);
    });
};
exports.getPreferredTerminalSymbols = getPreferredTerminalSymbols;
var getTerminalDisplaySymbols = function (symbols) {
    return symbols
        .map(function (rawSymbol) {
        var name = normalizeText(rawSymbol.name);
        if (!name) {
            return null;
        }
        var normalizedName = name.toUpperCase();
        if (TERMINAL_PSEUDO_SYMBOLS.has(normalizedName)) {
            return null;
        }
        var category = normalizeCategory(__assign(__assign({}, rawSymbol), { name: name }));
        if (!category) {
            return null;
        }
        var normalizedSymbol = __assign(__assign({}, rawSymbol), { name: name, category: category });
        if (isUnsupportedDerivative(normalizedSymbol)) {
            return null;
        }
        return __assign({}, normalizedSymbol);
    })
        .filter(function (symbol) { return Boolean(symbol); });
};
exports.getTerminalDisplaySymbols = getTerminalDisplaySymbols;
var getTerminalFallbackSymbolCategory = function (symbol) {
    var baseName = (0, exports.stripExecutionSuffix)(symbol).toUpperCase();
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
var createTerminalFallbackSymbolInfo = function (symbol) {
    var _a, _b, _c, _d, _e;
    var name = normalizeText(symbol);
    var baseName = (0, exports.stripExecutionSuffix)(name).toUpperCase();
    var defaultSymbol = exports.DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.find(function (candidate) { return candidate === baseName; });
    var metadata = defaultSymbol ? DEFAULT_TERMINAL_SYMBOL_METADATA[defaultSymbol] : null;
    var category = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.category) !== null && _a !== void 0 ? _a : getTerminalFallbackSymbolCategory(name);
    var digits = (_b = metadata === null || metadata === void 0 ? void 0 : metadata.digits) !== null && _b !== void 0 ? _b : (category === 'forex' ? 5 : 2);
    var point = Math.pow(10, -digits);
    var calcMode = (_c = metadata === null || metadata === void 0 ? void 0 : metadata.calcMode) !== null && _c !== void 0 ? _c : (category === 'forex' ? 'forex' : category === 'index' ? 'cfdindex' : 'cfdleverage');
    var contractSize = (_d = metadata === null || metadata === void 0 ? void 0 : metadata.contractSize) !== null && _d !== void 0 ? _d : (category === 'forex' ? 100000 : category === 'commodity' ? 100 : 1);
    var currencyBase = /^[A-Z]{6}$/u.test(baseName) ? baseName.slice(0, 3) : baseName;
    var currencyQuote = /^[A-Z]{6}$/u.test(baseName) ? baseName.slice(3, 6) : 'USD';
    return {
        name: name,
        description: (_e = metadata === null || metadata === void 0 ? void 0 : metadata.description) !== null && _e !== void 0 ? _e : baseName,
        baseCurrency: currencyBase,
        quoteCurrency: currencyQuote,
        digits: digits,
        point: point,
        tickSize: point,
        tickValue: point,
        tradeContractSize: contractSize,
        tradeMode: 'full',
        calcMode: calcMode,
        volumeMin: 0.01,
        volumeMax: 100,
        volumeStep: 0.01,
        marginInitial: 0,
        marginMaintenance: 0,
        swapLong: 0,
        swapShort: 0,
        category: category,
    };
};
var getTerminalFallbackSeedSymbols = function (options) {
    var e_5, _a;
    var _b, _c;
    if (options === void 0) { options = {}; }
    var persistedCandidates = __spreadArray(__spreadArray([
        options.selectedSymbol
    ], __read(((_b = options.openTabs) !== null && _b !== void 0 ? _b : [])), false), __read(((_c = options.watchlistSymbols) !== null && _c !== void 0 ? _c : [])), false);
    var persistedSymbols = [];
    var seen = new Set();
    try {
        for (var persistedCandidates_1 = __values(persistedCandidates), persistedCandidates_1_1 = persistedCandidates_1.next(); !persistedCandidates_1_1.done; persistedCandidates_1_1 = persistedCandidates_1.next()) {
            var candidate = persistedCandidates_1_1.value;
            var symbol = normalizeText(candidate);
            if (!symbol) {
                continue;
            }
            var key = getNormalizedBrokerBaseKey(symbol);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            persistedSymbols.push(symbol);
        }
    }
    catch (e_5_1) { e_5 = { error: e_5_1 }; }
    finally {
        try {
            if (persistedCandidates_1_1 && !persistedCandidates_1_1.done && (_a = persistedCandidates_1.return)) _a.call(persistedCandidates_1);
        }
        finally { if (e_5) throw e_5.error; }
    }
    return persistedSymbols.length > 0
        ? persistedSymbols
        : __spreadArray([], __read(exports.DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS), false);
};
exports.getTerminalFallbackSeedSymbols = getTerminalFallbackSeedSymbols;
var getTerminalFallbackSymbolInfos = function (options) {
    if (options === void 0) { options = {}; }
    return (0, exports.getTerminalDisplaySymbols)((0, exports.getTerminalFallbackSeedSymbols)(options).map(createTerminalFallbackSymbolInfo));
};
exports.getTerminalFallbackSymbolInfos = getTerminalFallbackSymbolInfos;
var getTerminalSubscriptionSymbols = function (symbols) { return __spreadArray([], __read(new Set((0, exports.getTerminalDisplaySymbols)(symbols)
    .map(function (symbol) { return normalizeText(symbol.name); })
    .filter(Boolean))), false); };
exports.getTerminalSubscriptionSymbols = getTerminalSubscriptionSymbols;
var getInitialTerminalSubscriptionSymbols = function (symbols, options) {
    var e_6, _a, e_7, _b;
    var _c, _d;
    if (options === void 0) { options = {}; }
    var limit = Math.max(0, Math.floor((_c = options.limit) !== null && _c !== void 0 ? _c : exports.INITIAL_TERMINAL_SUBSCRIPTION_LIMIT));
    if (limit === 0) {
        return [];
    }
    var preferredSymbols = (0, exports.getPreferredTerminalSymbols)(symbols);
    var displaySymbols = (0, exports.getTerminalDisplaySymbols)(symbols);
    var preferredByBase = new Map();
    var displayByExactName = new Map();
    try {
        for (var displaySymbols_1 = __values(displaySymbols), displaySymbols_1_1 = displaySymbols_1.next(); !displaySymbols_1_1.done; displaySymbols_1_1 = displaySymbols_1.next()) {
            var symbol = displaySymbols_1_1.value;
            displayByExactName.set(symbol.name, symbol);
        }
    }
    catch (e_6_1) { e_6 = { error: e_6_1 }; }
    finally {
        try {
            if (displaySymbols_1_1 && !displaySymbols_1_1.done && (_a = displaySymbols_1.return)) _a.call(displaySymbols_1);
        }
        finally { if (e_6) throw e_6.error; }
    }
    try {
        for (var _e = __values(__spreadArray(__spreadArray([], __read(preferredSymbols), false), __read(displaySymbols), false)), _f = _e.next(); !_f.done; _f = _e.next()) {
            var symbol = _f.value;
            var baseName = (0, exports.stripExecutionSuffix)(symbol.name).toUpperCase();
            if (!baseName || preferredByBase.has(baseName)) {
                continue;
            }
            preferredByBase.set(baseName, symbol);
        }
    }
    catch (e_7_1) { e_7 = { error: e_7_1 }; }
    finally {
        try {
            if (_f && !_f.done && (_b = _e.return)) _b.call(_e);
        }
        finally { if (e_7) throw e_7.error; }
    }
    var subscriptions = [];
    var seen = new Set();
    var append = function (symbol) {
        var normalized = normalizeText(symbol);
        if (!normalized || seen.has(normalized) || subscriptions.length >= limit) {
            return;
        }
        seen.add(normalized);
        subscriptions.push(normalized);
    };
    (_d = options.preferredSymbols) === null || _d === void 0 ? void 0 : _d.forEach(function (seedSymbol) {
        var _a, _b, _c;
        var normalizedSeed = normalizeText(seedSymbol);
        var baseName = (0, exports.stripExecutionSuffix)(normalizedSeed).toUpperCase();
        append((_b = (_a = displayByExactName.get(normalizedSeed)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : (_c = preferredByBase.get(baseName)) === null || _c === void 0 ? void 0 : _c.name);
    });
    preferredSymbols.forEach(function (symbol) {
        append(symbol.name);
    });
    displaySymbols.forEach(function (symbol) {
        append(symbol.name);
    });
    return subscriptions;
};
exports.getInitialTerminalSubscriptionSymbols = getInitialTerminalSubscriptionSymbols;
var getPreferredTerminalSubscriptionSymbols = function (symbols) {
    var e_8, _a;
    var preferredSymbols = (0, exports.getPreferredTerminalSymbols)(symbols);
    var displaySymbols = (0, exports.getTerminalDisplaySymbols)(symbols);
    var marketSymbols = preferredSymbols.length > 0 ? preferredSymbols : displaySymbols;
    var selectedBases = new Set(marketSymbols.map(function (symbol) { return (0, exports.stripExecutionSuffix)(symbol.name).toUpperCase(); }));
    var subscriptions = new Set();
    try {
        for (var displaySymbols_2 = __values(displaySymbols), displaySymbols_2_1 = displaySymbols_2.next(); !displaySymbols_2_1.done; displaySymbols_2_1 = displaySymbols_2.next()) {
            var rawSymbol = displaySymbols_2_1.value;
            var name = normalizeText(rawSymbol.name);
            if (!name) {
                continue;
            }
            var category = normalizeCategory(rawSymbol);
            if (!category) {
                continue;
            }
            var normalizedSymbol = __assign(__assign({}, rawSymbol), { category: category });
            if (isUnsupportedDerivative(normalizedSymbol)) {
                continue;
            }
            var baseName = (0, exports.stripExecutionSuffix)(name).toUpperCase();
            if (!selectedBases.has(baseName)) {
                continue;
            }
            subscriptions.add(name);
        }
    }
    catch (e_8_1) { e_8 = { error: e_8_1 }; }
    finally {
        try {
            if (displaySymbols_2_1 && !displaySymbols_2_1.done && (_a = displaySymbols_2.return)) _a.call(displaySymbols_2);
        }
        finally { if (e_8) throw e_8.error; }
    }
    return __spreadArray([], __read(subscriptions), false);
};
exports.getPreferredTerminalSubscriptionSymbols = getPreferredTerminalSubscriptionSymbols;
