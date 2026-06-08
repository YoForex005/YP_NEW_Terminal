'use client';

import type { Instrument } from '@/lib/terminal/types';
import { Search, MoreVertical, X, ChevronDown, Star } from 'lucide-react';
import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import { SymbolIcon } from './SymbolIcon';
import { formatTerminalDisplaySymbol, getSafeLiveQuoteSnapshotBySymbol } from '@/lib/trading/terminal-symbols';
import { subscribeToLivePriceBySymbol, getLivePriceSnapshotBySymbol, useWebtraderStore } from '@/store/webtrader-store';

type DisplayInstrument = Pick<Instrument, 'symbol' | 'name' | 'category' | 'digits' | 'tradeMode'>;

interface InstrumentsPanelProps {
    instruments: DisplayInstrument[];
    searchInstruments?: DisplayInstrument[];
    positionPriceSeedsBySymbol?: Readonly<Record<string, number>>;
    selectedSymbol: string;
    onSelect: (symbol: string) => void;
    onClose: () => void;
    onVisibleSearchSymbolsChange?: (symbols: string[]) => void;
    onSymbolHover?: (symbol: string) => void;
    panelWidth?: number;
}

interface InstrumentColumns {
    description: boolean;
    bid: boolean;
    spread: boolean;
    ask: boolean;
    oneDayChange: boolean;
    showChart: boolean;
    pnl: boolean;
}

interface InstrumentRowProps {
    instrument: DisplayInstrument;
    selectedSymbol: string;
    isSearching: boolean;
    panelWidth: number;
    columns: InstrumentColumns;
    priceHighlight: boolean;
    isFavorite: boolean;
    isHighlighted: boolean;
    positionPriceSeed?: number;
    rowHeight: number;
    onSelect: (symbol: string) => void;
    onToggleFavorite: (symbol: string) => void;
    clearSearch: () => void;
    onHover?: (symbol: string) => void;
}

const MAX_VISIBLE_SUBSCRIPTION_SYMBOLS = 20;
const VISIBLE_SEARCH_SYMBOL_DEBOUNCE_MS = 40;
const MARKET_ROW_HEIGHT = 32;
const VIRTUAL_OVERSCAN_ROWS = 6;
const RECENT_INSTRUMENT_LIMIT = 5;
const FAVORITE_STORAGE_KEY = 'terminal.marketWatch.favoriteSymbols';
const RECENT_STORAGE_KEY = 'terminal.marketWatch.recentSymbols';
const RECENT_VIEWED_LABEL = 'Recently viewed';
const MARKET_ROW_FLASH_DURATION_MS = 280;
const MARKET_ROW_FLASH_CLASSES = ['flash-up', 'flash-dn'] as const;
type MarketRowFlashClass = typeof MARKET_ROW_FLASH_CLASSES[number];
type ActiveMarketRowFlash = {
    className: MarketRowFlashClass;
    expiresAt: number;
};

type InstrumentListRow =
    | { type: 'section'; id: string; label: string; count: number }
    | { type: 'instrument'; id: string; instrument: DisplayInstrument };

const dedupeInstrumentsBySymbol = (items: DisplayInstrument[]) => {
    const seen = new Set<string>();
    const unique: DisplayInstrument[] = [];

    for (const item of items) {
        if (seen.has(item.symbol)) continue;
        seen.add(item.symbol);
        unique.push(item);
    }

    return unique;
};

const areSymbolListsEqual = (left: string[], right: string[]) =>
    left.length === right.length && left.every((symbol, index) => symbol === right[index]);

const dedupeSymbols = (symbols: string[]) => {
    const seen = new Set<string>();
    const unique: string[] = [];

    for (const symbol of symbols) {
        const normalized = symbol.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
    }

    return unique;
};

const parseStoredSymbolList = (key: string) => {
    if (typeof window === 'undefined') return [];

    try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
        return Array.isArray(parsed)
            ? parsed.filter((symbol): symbol is string => typeof symbol === 'string' && symbol.trim().length > 0)
            : [];
    } catch {
        return [];
    }
};

const persistSymbolList = (key: string, symbols: string[]) => {
    if (typeof window === 'undefined') return;

    try {
        window.localStorage.setItem(key, JSON.stringify(symbols));
    } catch {
        // Local storage is optional; the panel remains fully usable without it.
    }
};

const getInstrumentCategoryKey = (instrument: DisplayInstrument) =>
    instrument.category?.toLowerCase() ?? '';

const matchesInstrumentSearch = (instrument: DisplayInstrument, normalizedSearch: string) =>
    instrument.symbol.toLowerCase().includes(normalizedSearch) ||
    instrument.name.toLowerCase().includes(normalizedSearch) ||
    getInstrumentCategoryKey(instrument).includes(normalizedSearch);

const formatQuote = (value: number, digits: number) =>
    value > 0 ? value.toFixed(digits) : '--';

const getDisplayBid = (bid: number, ask: number, last: number) =>
    bid > 0 ? bid : bid <= 0 && ask <= 0 && last > 0 ? last : 0;

const getDisplayAsk = (bid: number, ask: number, last: number) =>
    ask > 0 ? ask : bid <= 0 && ask <= 0 && last > 0 ? last : 0;

const hasDisplayQuote = (bid: number, ask: number, last: number) =>
    bid > 0 || ask > 0 || last > 0;

const getDisplayQuoteSeed = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

const getQuoteFlashClass = (direction?: 'up' | 'down' | 'same') =>
    direction === 'up' ? 'quote-flash-up' : direction === 'down' ? 'quote-flash-down' : 'quote-flash-tick';

const getQuoteFlashKey = (symbol: string, side: 'bid' | 'ask', value: number, time: unknown) => {
    const tickTime = time instanceof Date
        ? time.getTime()
        : typeof time === 'string' || typeof time === 'number'
            ? time
            : '';
    return `${symbol}:${side}:${value}:${tickTime}`;
};

const getSafeInstrumentLivePriceSnapshot = (symbol: string) =>
    getSafeLiveQuoteSnapshotBySymbol(
        symbol,
        getLivePriceSnapshotBySymbol,
        useWebtraderStore.getState().prices,
    );

const InstrumentRow = memo(function InstrumentRow({
    instrument,
    selectedSymbol,
    isSearching,
    panelWidth,
    columns,
    priceHighlight,
    isFavorite,
    isHighlighted,
    positionPriceSeed,
    rowHeight,
    onSelect,
    onToggleFavorite,
    clearSearch,
    onHover,
}: InstrumentRowProps) {
    // All dynamic fields use direct DOM writes — zero React re-renders on every tick.
    const bidTextRef = useRef<HTMLSpanElement>(null);
    const askTextRef = useRef<HTMLSpanElement>(null);
    const arrowRef = useRef<HTMLSpanElement>(null);
    const changeRef = useRef<HTMLSpanElement>(null);
    const bidCellRef = useRef<HTMLTableCellElement>(null);
    const askCellRef = useRef<HTMLTableCellElement>(null);
    const changeCellRef = useRef<HTMLTableCellElement>(null);
    const signalRef = useRef<HTMLDivElement>(null);
    const activeBidFlashRef = useRef<ActiveMarketRowFlash | null>(null);
    const activeAskFlashRef = useRef<ActiveMarketRowFlash | null>(null);
    const digitsRef = useRef(instrument.digits);
    digitsRef.current = instrument.digits;
    const lastPriceRef = useRef<{ bid: number; ask: number; last: number }>({ bid: 0, ask: 0, last: 0 });
    const positionPriceSeedRef = useRef(getDisplayQuoteSeed(positionPriceSeed));
    positionPriceSeedRef.current = getDisplayQuoteSeed(positionPriceSeed);
    // Persist the last meaningful direction so 'same' ticks don't wipe out the arrow
    const lastSignalDirRef = useRef<'up' | 'down' | null>(null);
    // Track when the last real price tick arrived (to detect stale/closed markets)
    const lastTickAtRef = useRef<number>(0);
    const [hasLiveQuote, setHasLiveQuote] = useState(() => {
        const snap = getSafeInstrumentLivePriceSnapshot(instrument.symbol);
        return hasDisplayQuote(
            snap?.bid ?? 0,
            snap?.ask ?? 0,
            (snap as any)?.last ?? 0,
        );
    });
    const hasLiveQuoteRef = useRef(hasLiveQuote);
    hasLiveQuoteRef.current = hasLiveQuote;

    useLayoutEffect(() => {
        if (!priceHighlight) return;
        const reapplyActiveFlash = (
            el: HTMLTableCellElement | null,
            activeFlash: ActiveMarketRowFlash | null,
        ) => {
            if (!el || !activeFlash || Date.now() > activeFlash.expiresAt) return;
            el.classList.remove(...MARKET_ROW_FLASH_CLASSES);
            el.classList.add(activeFlash.className);
        };

        reapplyActiveFlash(bidCellRef.current, activeBidFlashRef.current);
        reapplyActiveFlash(askCellRef.current, activeAskFlashRef.current);
    });

    useEffect(() => {
        const sym = instrument.symbol;
        const fmt = (v: number) => v > 0 ? v.toFixed(digitsRef.current) : '--';

        const update = () => {
            const snap = getSafeInstrumentLivePriceSnapshot(sym);
            const seededLast = positionPriceSeedRef.current;
            if (!snap && seededLast <= 0) return;
            const bid = snap?.bid ?? 0;
            const ask = snap?.ask ?? 0;
            const liveLast = (snap as any)?.last ?? 0;
            const displayLast = liveLast > 0 ? liveLast : seededLast;
            const displayBid = getDisplayBid(bid, ask, displayLast);
            const displayAsk = getDisplayAsk(bid, ask, displayLast);
            lastPriceRef.current = { bid, ask, last: liveLast };

            // Bid / Ask text
            if (bidTextRef.current) bidTextRef.current.textContent = fmt(displayBid);
            if (askTextRef.current) askTextRef.current.textContent = fmt(displayAsk);

            // Bid / Ask cell color classes
            const hasQuote = hasDisplayQuote(bid, ask, liveLast);
            if (hasQuote !== hasLiveQuoteRef.current) {
                hasLiveQuoteRef.current = hasQuote;
                startTransition(() => setHasLiveQuote(hasQuote));
            }
            if (bidCellRef.current) {
                bidCellRef.current.className = bidCellRef.current.className
                    .replace(/text-\S+/g, '')
                    .trimEnd() + (hasQuote ? ' text-success' : ' text-muted-foreground/60');
            }
            if (askCellRef.current) {
                askCellRef.current.className = askCellRef.current.className
                    .replace(/text-\S+/g, '')
                    .trimEnd() + (hasQuote ? ' text-destructive' : ' text-muted-foreground/60');
            }

            // Direction arrow
            const bidDir = snap?.bidDirection;
            const askDir = snap?.askDirection;
            if (arrowRef.current) {
                if (!hasQuote) {
                    arrowRef.current.textContent = '▲';
                    arrowRef.current.style.opacity = '0';
                } else if (bidDir === 'up' || askDir === 'up') {
                    arrowRef.current.textContent = '▲';
                    arrowRef.current.style.color = 'var(--success, #089981)';
                    arrowRef.current.style.opacity = '1';
                } else if (bidDir === 'down' || askDir === 'down') {
                    arrowRef.current.textContent = '▼';
                    arrowRef.current.style.color = 'var(--destructive, #f23645)';
                    arrowRef.current.style.opacity = '1';
                } else {
                    arrowRef.current.style.opacity = '0';
                }
            }

            // Signal badge
            if (signalRef.current) {
                const isTradeModeClose = instrument.tradeMode === 'disabled' || instrument.tradeMode === 'closeonly';
                // Market is considered closed when:
                // 1. tradeMode is explicitly disabled/closeonly, OR
                // 2. No bid/ask/last price at all (weekend close, session end)
                const isMarketClosed = isTradeModeClose || !hasQuote;

                if (isMarketClosed) {
                    // Record that we consider it closed — clear last direction so it resets when reopens
                    lastSignalDirRef.current = null;
                    signalRef.current.textContent = 'CLOSE';
                    signalRef.current.className = 'h-[16px] flex items-center justify-center rounded-[2px] text-[8px] font-bold bg-destructive/10 text-destructive mx-auto px-[3px] tracking-widest border border-destructive/20';
                } else {
                    // Update last tick time
                    lastTickAtRef.current = Date.now();
                    // Update direction memory only when a real movement occurs
                    if (bidDir === 'up' || askDir === 'up') lastSignalDirRef.current = 'up';
                    else if (bidDir === 'down' || askDir === 'down') lastSignalDirRef.current = 'down';

                    const effectiveDir = lastSignalDirRef.current;
                    if (effectiveDir === 'up') {
                        signalRef.current.textContent = '↑';
                        signalRef.current.className = 'w-5 h-5 flex items-center justify-center rounded-[2px] text-[10px] font-bold bg-success/20 text-success mx-auto';
                    } else if (effectiveDir === 'down') {
                        signalRef.current.textContent = '↓';
                        signalRef.current.className = 'w-5 h-5 flex items-center justify-center rounded-[2px] text-[10px] font-bold bg-destructive/20 text-destructive mx-auto';
                    } else {
                        signalRef.current.textContent = '-';
                        signalRef.current.className = 'w-5 h-5 flex items-center justify-center rounded-[2px] text-[10px] font-bold bg-accent text-muted-foreground mx-auto';
                    }
                }
            }

            // Change %
            if (changeRef.current && changeCellRef.current) {
                const pct = liveLast > 0 && bid > 0 ? ((bid - liveLast) / liveLast) * 100 : 0;
                changeRef.current.textContent = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
                const color = pct > 0 ? 'var(--success, #089981)' : pct < 0 ? 'var(--destructive, #f23645)' : '';
                changeCellRef.current.style.color = color || 'rgba(156,163,175,0.7)';
            }

            // Flash highlight on bid/ask cells
            if (priceHighlight) {
                const flash = (
                    el: HTMLTableCellElement | null,
                    activeFlashRef: typeof activeBidFlashRef,
                    dir?: string,
                ) => {
                    if (!el) return;
                    const cls: MarketRowFlashClass | '' =
                        dir === 'up' ? 'flash-up' : dir === 'down' ? 'flash-dn' : '';
                    if (!cls) return;
                    activeFlashRef.current = {
                        className: cls,
                        expiresAt: Date.now() + MARKET_ROW_FLASH_DURATION_MS,
                    };
                    el.classList.remove(...MARKET_ROW_FLASH_CLASSES);
                    // Force reflow so re-adding works
                    void el.offsetWidth;
                    el.classList.add(cls);
                };
                flash(bidCellRef.current, activeBidFlashRef, bidDir);
                flash(askCellRef.current, activeAskFlashRef, askDir);
            }
        };

        update();
        return subscribeToLivePriceBySymbol(sym, update);
    }, [instrument.symbol, positionPriceSeed, priceHighlight]);

    const isSelected = instrument.symbol === selectedSymbol;
    // Only use React state for stable fields (isSelected, hasQuote initial render)
    const snap0 = getSafeInstrumentLivePriceSnapshot(instrument.symbol);
    const bid0 = snap0?.bid ?? 0;
    const ask0 = snap0?.ask ?? 0;
    const liveLast0 = (snap0 as any)?.last ?? 0;
    const displayLast0 = liveLast0 > 0 ? liveLast0 : getDisplayQuoteSeed(positionPriceSeed);
    const displayBid0 = getDisplayBid(bid0, ask0, displayLast0);
    const displayAsk0 = getDisplayAsk(bid0, ask0, displayLast0);
    const digitsNow = instrument.digits;
    const hasDisplayQuote0 = hasDisplayQuote(bid0, ask0, liveLast0);

    const fmt0 = (v: number) => v > 0 ? v.toFixed(digitsNow) : '--';

    const bidDir0 = snap0?.bidDirection;
    const askDir0 = snap0?.askDirection;

    // Determine initial signal state: CLOSE when no live quote OR tradeMode says closed
    const isTradeModeClose0 = instrument.tradeMode === 'disabled' || instrument.tradeMode === 'closeonly';
    const isMarketClosed0 = isTradeModeClose0 || !hasDisplayQuote0;

    let signalText0: string;
    let signalClass0: string;

    if (isMarketClosed0) {
        signalText0 = 'CLOSE';
        signalClass0 = 'h-[16px] bg-destructive/10 text-destructive px-[3px] text-[8px] tracking-widest border border-destructive/20';
    } else if (bidDir0 === 'up' || askDir0 === 'up') {
        signalText0 = '\u2191';
        signalClass0 = 'w-5 h-5 bg-success/20 text-success';
    } else if (bidDir0 === 'down' || askDir0 === 'down') {
        signalText0 = '\u2193';
        signalClass0 = 'w-5 h-5 bg-destructive/20 text-destructive';
    } else {
        signalText0 = '-';
        signalClass0 = 'w-5 h-5 bg-accent text-muted-foreground';
    }

    return (
        <tr
            onClick={() => { onSelect(instrument.symbol); if (isSearching) clearSearch(); }}
            onMouseEnter={() => onHover?.(instrument.symbol)}
            aria-selected={isSelected || isHighlighted}
            className={`cursor-pointer border-b border-border/40 transition-colors ${isHighlighted ? 'bg-primary/10' : isSelected ? 'bg-accent/40' : 'bg-background hover:bg-accent/40'}`}
            style={{ height: rowHeight }}
        >
            {/* Symbol cell — left gold indicator line on selected row */}
            <td
                className={`py-[4px] px-0 min-w-[145px] ${isSelected ? 'border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}
                title={`${instrument.symbol}${instrument.name ? ` - ${instrument.name}` : ''}${instrument.category ? ` (${instrument.category})` : ''}`}
            >
                <div className="flex min-w-0 items-center gap-[5px] pl-2 pr-1">
                    <span
                        ref={arrowRef}
                        className="text-[9px] w-[10px] text-center leading-none flex-shrink-0 select-none"
                        style={{ opacity: hasDisplayQuote0 ? 1 : 0 }}
                    >▲</span>
                    <SymbolIcon symbol={instrument.symbol} />
                    <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[12px] font-semibold tracking-wide ${isSelected ? 'text-primary' : 'text-foreground/90'}`}>
                            {formatTerminalDisplaySymbol(instrument.symbol)}
                        </span>
                    </span>
                    <button
                        type="button"
                        aria-label={isFavorite ? `Remove ${instrument.symbol} from favorites` : `Add ${instrument.symbol} to favorites`}
                        aria-pressed={isFavorite}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleFavorite(instrument.symbol);
                        }}
                        className={`flex h-[20px] w-[20px] flex-shrink-0 items-center justify-center rounded-sm transition-colors ${isFavorite ? 'text-primary' : 'text-muted-foreground/35 hover:bg-accent/60 hover:text-foreground'}`}
                    >
                        <Star size={12} className={isFavorite ? 'fill-current' : ''} />
                    </button>
                    {!hasDisplayQuote0 && (
                        <span className="hidden text-[9px] text-muted-foreground/30 font-normal ml-1 min-[340px]:inline">no quote</span>
                    )}
                </div>
            </td>

            {/* Signal cell */}
            <td className="text-center py-[4px] px-1 w-[40px]">
                <div
                    ref={signalRef}
                    className={`flex items-center justify-center rounded-[2px] font-bold mx-auto ${signalClass0}`}
                >
                    {signalText0}
                </div>
            </td>

            {columns.bid && (
                <td
                    ref={bidCellRef}
                    className={`text-right py-[4px] px-3 border-r border-border/40 font-mono text-[12px] tabular-nums transition-none ${hasDisplayQuote0 ? 'text-success' : 'text-muted-foreground/60'}`}
                >
                    <span ref={bidTextRef}>{fmt0(displayBid0)}</span>
                </td>
            )}

            {columns.ask && panelWidth > 220 && (
                <td
                    ref={askCellRef}
                    className={`text-right py-[4px] px-3 border-r border-border/40 font-mono text-[12px] tabular-nums transition-none ${hasDisplayQuote0 ? 'text-destructive' : 'text-muted-foreground/60'}`}
                >
                    <span ref={askTextRef}>{fmt0(displayAsk0)}</span>
                </td>
            )}

            {columns.oneDayChange && panelWidth > 300 && (
                <td
                    ref={changeCellRef}
                    className="text-right py-[4px] px-3 font-mono text-[12px] tabular-nums"
                    style={{ color: 'rgba(156,163,175,0.7)' }}
                >
                    <span ref={changeRef}>0.00%</span>
                </td>
            )}

            {columns.pnl && panelWidth > 240 && (
                <td className="text-right py-[4px] px-3 text-muted-foreground/50 font-mono text-[12px] tabular-nums">
                    -
                </td>
            )}
        </tr>
    );
});

function InstrumentsPanel({
    instruments,
    searchInstruments,
    positionPriceSeedsBySymbol,
    selectedSymbol,
    onSelect,
    onClose,
    onVisibleSearchSymbolsChange,
    onSymbolHover,
    panelWidth = 300,
}: InstrumentsPanelProps) {
    const [search, setSearch] = useState('');
    const [favorites, setFavorites] = useState<string[]>([]);
    const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
    const [hasHydratedSavedLists, setHasHydratedSavedLists] = useState(false);
    const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(-1);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [activeTab, setActiveTab] = useState('All');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [priceHighlight, setPriceHighlight] = useState(true);
    const [columns, setColumns] = useState<InstrumentColumns>({
        description: false,
        bid: true,
        spread: false,
        ask: true,
        oneDayChange: true,
        showChart: false,
        pnl: true,
    });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const onVisibleSearchSymbolsChangeRef = useRef(onVisibleSearchSymbolsChange);
    const deferredSearch = useDeferredValue(search);
    const deferredActiveTab = useDeferredValue(activeTab);
    const searchableInstruments = searchInstruments ?? instruments;
    const allKnownInstruments = useMemo(
        () => dedupeInstrumentsBySymbol([...instruments, ...searchableInstruments]),
        [instruments, searchableInstruments],
    );
    const instrumentBySymbol = useMemo(() => {
        const bySymbol = new Map<string, DisplayInstrument>();
        for (const instrument of allKnownInstruments) {
            bySymbol.set(instrument.symbol, instrument);
        }
        return bySymbol;
    }, [allKnownInstruments]);
    const favoriteSymbolSet = useMemo(() => new Set(favorites), [favorites]);
    const recentSymbolSet = useMemo(() => new Set(recentSymbols), [recentSymbols]);

    // Derive unique categories from real instrument data (MT5 group path first segment).
    // Sorted alphabetically so the order is stable when symbols reload.
    const uniqueCategories = useMemo(() => {
        const seen = new Set<string>();
        for (const inst of searchableInstruments) {
            const cat = getInstrumentCategoryKey(inst);
            if (cat) seen.add(cat);
        }
        return Array.from(seen).sort();
    }, [searchableInstruments]);

    const categories = useMemo(
        () => ['All', 'Favorites', RECENT_VIEWED_LABEL, ...uniqueCategories],
        [uniqueCategories],
    );

    // Count per category for the dropdown badge.
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {
            All: searchableInstruments.length,
            Favorites: favorites.filter((symbol) => instrumentBySymbol.has(symbol)).length,
            [RECENT_VIEWED_LABEL]: recentSymbols.filter((symbol) => instrumentBySymbol.has(symbol)).length,
        };
        for (const inst of searchableInstruments) {
            const cat = getInstrumentCategoryKey(inst);
            if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
        }
        return counts;
    }, [favorites, instrumentBySymbol, recentSymbols, searchableInstruments]);
    const normalizedSearch = deferredSearch.trim().toLowerCase();
    const isSearching = normalizedSearch.length > 0;
    const isFiltering = deferredActiveTab !== 'All';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        onVisibleSearchSymbolsChangeRef.current = onVisibleSearchSymbolsChange;
    }, [onVisibleSearchSymbolsChange]);

    useEffect(() => {
        setFavorites(dedupeSymbols(parseStoredSymbolList(FAVORITE_STORAGE_KEY)));
        setRecentSymbols(dedupeSymbols(parseStoredSymbolList(RECENT_STORAGE_KEY)).slice(0, RECENT_INSTRUMENT_LIMIT));
        setHasHydratedSavedLists(true);
    }, []);

    useEffect(() => {
        if (!hasHydratedSavedLists) return;
        persistSymbolList(FAVORITE_STORAGE_KEY, favorites);
    }, [favorites, hasHydratedSavedLists]);

    useEffect(() => {
        if (!hasHydratedSavedLists) return;
        persistSymbolList(RECENT_STORAGE_KEY, recentSymbols);
    }, [hasHydratedSavedLists, recentSymbols]);

    const addRecentSymbol = useCallback((symbol: string) => {
        setRecentSymbols((current) => {
            const next = [symbol, ...current.filter((recentSymbol) => recentSymbol !== symbol)]
                .slice(0, RECENT_INSTRUMENT_LIMIT);
            return areSymbolListsEqual(current, next) ? current : next;
        });
    }, []);

    const clearSearch = useCallback(() => {
        setSearch('');
        setHighlightedSearchIndex(-1);
    }, []);

    const handleSelectInstrument = useCallback((symbol: string) => {
        addRecentSymbol(symbol);
        onSelect(symbol);
    }, [addRecentSymbol, onSelect]);

    const handleToggleFavorite = useCallback((symbol: string) => {
        setFavorites((current) => {
            if (current.includes(symbol)) {
                return current.filter((favoriteSymbol) => favoriteSymbol !== symbol);
            }

            return [symbol, ...current];
        });
    }, []);

    useEffect(() => {
        if (!selectedSymbol || !instrumentBySymbol.has(selectedSymbol)) return;
        addRecentSymbol(selectedSymbol);
    }, [addRecentSymbol, instrumentBySymbol, selectedSymbol]);

    const matchesActiveTab = useMemo(() => {
        return (instrument: DisplayInstrument) => {
            if (deferredActiveTab === 'Favorites') return favoriteSymbolSet.has(instrument.symbol);
            if (deferredActiveTab === RECENT_VIEWED_LABEL) return recentSymbolSet.has(instrument.symbol);
            if (deferredActiveTab === 'All') return true;
            // activeTab holds the lowercase category string (e.g. 'forex', 'metals').
            return getInstrumentCategoryKey(instrument) === deferredActiveTab;
        };
    }, [deferredActiveTab, favoriteSymbolSet, recentSymbolSet]);

    const sourceInstruments = useMemo(() => {
        if (deferredActiveTab === 'Favorites') {
            return favorites
                .map((symbol) => instrumentBySymbol.get(symbol))
                .filter((instrument): instrument is DisplayInstrument => instrument !== undefined);
        }

        if (deferredActiveTab === RECENT_VIEWED_LABEL) {
            return recentSymbols
                .map((symbol) => instrumentBySymbol.get(symbol))
                .filter((instrument): instrument is DisplayInstrument => instrument !== undefined);
        }

        return isSearching || isFiltering ? searchableInstruments : instruments;
    }, [deferredActiveTab, favorites, instrumentBySymbol, instruments, isFiltering, isSearching, recentSymbols, searchableInstruments]);

    const filteredInstruments = useMemo(
        () => dedupeInstrumentsBySymbol(sourceInstruments).filter((instrument) => {
            if (!matchesActiveTab(instrument)) return false;
            return !isSearching || matchesInstrumentSearch(instrument, normalizedSearch);
        }),
        [isSearching, matchesActiveTab, normalizedSearch, sourceInstruments],
    );

    const tableRows = useMemo<InstrumentListRow[]>(() => {
        if (filteredInstruments.length === 0) return [];

        const rows: InstrumentListRow[] = [];
        if (deferredActiveTab === 'Favorites' || deferredActiveTab === RECENT_VIEWED_LABEL) {
            rows.push({
                type: 'section',
                id: `section:${deferredActiveTab}`,
                label: deferredActiveTab,
                count: filteredInstruments.length,
            });
        }

        for (const instrument of filteredInstruments) {
            rows.push({ type: 'instrument', id: instrument.symbol, instrument });
        }

        return rows;
    }, [deferredActiveTab, filteredInstruments]);

    const totalVirtualHeight = tableRows.length * MARKET_ROW_HEIGHT;
    const visibleStartIndex = Math.max(0, Math.floor(scrollTop / MARKET_ROW_HEIGHT));
    const visibleRowCapacity = Math.max(1, Math.ceil((viewportHeight || MARKET_ROW_HEIGHT * 12) / MARKET_ROW_HEIGHT));
    const visibleEndIndex = Math.min(tableRows.length, visibleStartIndex + visibleRowCapacity);
    const renderStartIndex = Math.max(0, visibleStartIndex - VIRTUAL_OVERSCAN_ROWS);
    const renderEndIndex = Math.min(tableRows.length, visibleEndIndex + VIRTUAL_OVERSCAN_ROWS);
    const visibleRows = tableRows.slice(visibleStartIndex, visibleEndIndex);
    const virtualRows = tableRows.slice(renderStartIndex, renderEndIndex);
    const topSpacerHeight = renderStartIndex * MARKET_ROW_HEIGHT;
    const bottomSpacerHeight = Math.max(0, totalVirtualHeight - topSpacerHeight - virtualRows.length * MARKET_ROW_HEIGHT);
    const visibleInstrumentSymbols = visibleRows
        .filter((row): row is Extract<InstrumentListRow, { type: 'instrument' }> => row.type === 'instrument')
        .map((row) => row.instrument.symbol);
    const visibleInstrumentSymbolKey = visibleInstrumentSymbols
        .slice(0, MAX_VISIBLE_SUBSCRIPTION_SYMBOLS)
        .join('\u0001');

    useEffect(() => {
        const timeout = setTimeout(() => {
            onVisibleSearchSymbolsChangeRef.current?.(
                visibleInstrumentSymbolKey ? visibleInstrumentSymbolKey.split('\u0001') : [],
            );
        }, VISIBLE_SEARCH_SYMBOL_DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [visibleInstrumentSymbolKey]);

    useEffect(() => {
        return () => {
            onVisibleSearchSymbolsChangeRef.current?.([]);
        };
    }, []);

    const resetScrollTop = useCallback(() => {
        const scrollElement = scrollContainerRef.current;
        if (scrollElement) {
            scrollElement.scrollTop = 0;
        }
        setScrollTop(0);
    }, []);

    const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        setScrollTop(event.currentTarget.scrollTop);
    }, []);

    useLayoutEffect(() => {
        const scrollElement = scrollContainerRef.current;
        if (!scrollElement) return;

        const updateViewportHeight = () => {
            setViewportHeight(scrollElement.clientHeight);
        };

        updateViewportHeight();

        if (typeof ResizeObserver === 'undefined') return;
        const resizeObserver = new ResizeObserver(updateViewportHeight);
        resizeObserver.observe(scrollElement);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        resetScrollTop();
        setHighlightedSearchIndex(search.trim().length > 0 ? 0 : -1);
    }, [deferredActiveTab, normalizedSearch, resetScrollTop, search]);

    useEffect(() => {
        setHighlightedSearchIndex((current) => {
            if (filteredInstruments.length === 0) return -1;
            if (current < 0) return search.trim().length > 0 ? 0 : -1;
            return Math.min(current, filteredInstruments.length - 1);
        });
    }, [filteredInstruments.length, search]);

    useEffect(() => {
        const scrollElement = scrollContainerRef.current;
        if (!scrollElement || viewportHeight <= 0) return;

        const maxScrollTop = Math.max(0, totalVirtualHeight - viewportHeight);
        if (scrollElement.scrollTop <= maxScrollTop) return;

        scrollElement.scrollTop = maxScrollTop;
        setScrollTop(maxScrollTop);
    }, [totalVirtualHeight, viewportHeight]);

    const scrollInstrumentIndexIntoView = useCallback((instrumentIndex: number) => {
        const scrollElement = scrollContainerRef.current;
        const instrument = filteredInstruments[instrumentIndex];
        if (!scrollElement || !instrument) return;

        const rowIndex = tableRows.findIndex((row) =>
            row.type === 'instrument' && row.instrument.symbol === instrument.symbol,
        );
        if (rowIndex < 0) return;

        const rowTop = rowIndex * MARKET_ROW_HEIGHT;
        const rowBottom = rowTop + MARKET_ROW_HEIGHT;
        const viewportTop = scrollElement.scrollTop;
        const viewportBottom = viewportTop + scrollElement.clientHeight - MARKET_ROW_HEIGHT;

        if (rowTop < viewportTop) {
            scrollElement.scrollTop = rowTop;
        } else if (rowBottom > viewportBottom) {
            scrollElement.scrollTop = Math.max(0, rowBottom - scrollElement.clientHeight + MARKET_ROW_HEIGHT);
        }

        setScrollTop(scrollElement.scrollTop);
    }, [filteredInstruments, tableRows]);

    const handleSearchValueChange = useCallback((value: string) => {
        setSearch(value);
        setHighlightedSearchIndex(value.trim().length > 0 ? 0 : -1);
        resetScrollTop();
    }, [resetScrollTop]);

    const handleSearchKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (filteredInstruments.length === 0) return;

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightedSearchIndex((current) => {
                const nextIndex = event.key === 'ArrowDown'
                    ? Math.min(filteredInstruments.length - 1, current < 0 ? 0 : current + 1)
                    : Math.max(0, current < 0 ? 0 : current - 1);
                scrollInstrumentIndexIntoView(nextIndex);
                return nextIndex;
            });
            return;
        }

        if (event.key === 'Enter') {
            const selectedIndex = highlightedSearchIndex >= 0 ? highlightedSearchIndex : 0;
            const instrument = filteredInstruments[selectedIndex];
            if (!instrument) return;

            event.preventDefault();
            handleSelectInstrument(instrument.symbol);
            clearSearch();
            setIsDropdownOpen(false);
            searchInputRef.current?.blur();
        }
    }, [clearSearch, filteredInstruments, handleSelectInstrument, highlightedSearchIndex, scrollInstrumentIndexIntoView]);

    // Reset to 'All' if the previously selected category tab is no longer present
    // (e.g. symbols reloaded for a different broker group).
    useEffect(() => {
        if (activeTab !== 'All' && activeTab !== 'Favorites' && activeTab !== RECENT_VIEWED_LABEL && !uniqueCategories.includes(activeTab)) {
            setActiveTab('All');
        }
    }, [activeTab, uniqueCategories]);

    const displayCategoryLabel = (cat: string) =>
        cat === 'All' || cat === 'Favorites' || cat === RECENT_VIEWED_LABEL
            ? cat
            : cat.charAt(0).toUpperCase() + cat.slice(1);

    const columnCount = 2
        + (columns.bid ? 1 : 0)
        + (columns.ask && panelWidth > 220 ? 1 : 0)
        + (columns.oneDayChange && panelWidth > 300 ? 1 : 0)
        + (columns.pnl && panelWidth > 240 ? 1 : 0);
    const resultCountLabel = `${filteredInstruments.length} ${filteredInstruments.length === 1 ? 'symbol' : 'symbols'}`;
    const emptyStateLabel = isSearching
        ? `No symbols match "${search.trim()}"`
        : deferredActiveTab === 'Favorites'
            ? 'No favorites'
            : deferredActiveTab === RECENT_VIEWED_LABEL
                ? 'No recent instruments'
                : 'No instruments';

    return (
        <div className="flex flex-col h-full w-full select-none bg-background text-foreground font-sans relative overflow-hidden">
            <div className="flex items-center justify-between px-3 h-[42px] flex-shrink-0 border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-foreground/85 tracking-widest uppercase">INSTRUMENTS</span>
                </div>
                <div className="flex items-center gap-1 relative">
                    <div ref={settingsRef} className="relative group/settings outline-none flex items-center justify-center">
                        <button
                            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                            className={`flex items-center justify-center w-[24px] h-[24px] rounded-sm transition-all duration-200 ${isSettingsOpen ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'}`}
                        >
                            <MoreVertical size={14} />
                        </button>
                        {isSettingsOpen && (
                            <div className="absolute top-[calc(100%+8px)] right-0 w-[220px] bg-popover border border-border rounded-md shadow-[0_8px_30px_rgba(0,0,0,0.8)] py-3 z-[100] animate-in fade-in zoom-in-95 duration-200">
                                <div className="px-4 pb-2 text-[10px] text-muted-foreground font-semibold tracking-wider">VISIBLE COLUMNS</div>
                                {[
                                    { id: 'description', label: 'Description' },
                                    { id: 'bid', label: 'Bid' },
                                    { id: 'ask', label: 'Ask' },
                                    { id: 'oneDayChange', label: '1D Change' },
                                    { id: 'pnl', label: 'P/L (USD)' },
                                ].map((col) => (
                                    <div
                                        key={col.id}
                                        className="flex items-center justify-between px-4 py-2 hover:bg-accent/40 transition-colors cursor-pointer group"
                                        onClick={() => setColumns((prev) => ({ ...prev, [col.id]: !prev[col.id as keyof InstrumentColumns] }))}
                                    >
                                        <span className={`text-[12px] transition-colors ${columns[col.id as keyof InstrumentColumns] ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{col.label}</span>
                                        <div className={`w-8 h-[16px] rounded-none relative transition-all duration-300 flex items-center ${columns[col.id as keyof InstrumentColumns] ? 'bg-primary' : 'bg-muted-foreground/20'}`}>
                                            <div className={`absolute w-[12px] h-[12px] rounded-none transition-all duration-300 shadow-sm ${columns[col.id as keyof InstrumentColumns] ? 'left-[18px] bg-background scale-110 shadow-[0_0_0_1px_hsl(var(--border))]' : 'left-[2px] bg-muted-foreground/50 scale-90'}`} />
                                        </div>
                                    </div>
                                ))}
                                <div className="h-[1px] bg-border/40 mx-4 my-2" />
                                <div className="px-4 pb-2 text-[10px] text-muted-foreground font-semibold tracking-wider">PREFERENCES</div>
                                <div className="flex items-center justify-between px-4 py-2 hover:bg-accent/40 transition-colors cursor-pointer group" onClick={() => setPriceHighlight(!priceHighlight)}>
                                    <span className={`text-[12px] transition-colors ${priceHighlight ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>Price highlight</span>
                                    <div className={`w-8 h-[16px] rounded-none relative transition-all duration-300 flex items-center ${priceHighlight ? 'bg-primary' : 'bg-muted-foreground/20'}`}>
                                        <div className={`absolute w-[12px] h-[12px] rounded-none transition-all duration-300 ${priceHighlight ? 'left-[18px] bg-background shadow-[0_0_0_1px_hsl(var(--border))]' : 'left-[2px] bg-muted-foreground/50'}`} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground w-[24px] h-[24px] flex items-center justify-center rounded-sm hover:bg-accent/40 transition-all"><X size={16} /></button>
                </div>
            </div>

            {/* Search + filter — always single row, no wrap */}
            <div className="px-3 py-2 flex items-center gap-2 flex-shrink-0 border-b border-border">
                <div className="relative flex-1 min-w-0 group/search">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/search:text-foreground/70 transition-colors" size={13} />
                    <input
                        type="text"
                        placeholder="Search"
                        value={search}
                        onChange={(e) => handleSearchValueChange(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        ref={searchInputRef}
                        className="w-full h-[26px] pl-8 pr-3 rounded-[3px] bg-accent/30 border border-border text-foreground placeholder:text-muted-foreground/50 text-[11px] focus:outline-none focus:border-primary/40 transition-all"
                    />
                </div>
                <div className="relative flex-shrink-0" ref={dropdownRef}>
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={`h-[26px] flex items-center gap-1 px-2 rounded-[3px] border text-[11px] font-medium transition-all ${isDropdownOpen ? 'bg-accent border-border text-foreground' : 'bg-card border-border text-muted-foreground/80 hover:text-foreground hover:border-border/60'}`}
                    >
                        <span className="truncate max-w-[70px]">{displayCategoryLabel(activeTab)}</span>
                        <ChevronDown size={12} className={`transition-transform duration-200 flex-shrink-0 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isDropdownOpen && (
                        <div className="absolute top-[calc(100%+6px)] right-0 w-[160px] bg-popover border border-border rounded-md shadow-[0_8px_30px_rgba(0,0,0,0.8)] py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                            {categories.map((category) => (
                                <div
                                    key={category}
                                    onClick={() => {
                                        startTransition(() => {
                                            setActiveTab(category);
                                        });
                                        setIsDropdownOpen(false);
                                    }}
                                    className={`px-3 py-[7px] text-[12px] cursor-pointer transition-all flex items-center justify-between gap-2 ${activeTab === category ? 'text-primary font-semibold bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'}`}
                                >
                                    <span className="truncate">{displayCategoryLabel(category)}</span>
                                    {categoryCounts[category] !== undefined && (
                                        <span className="text-[10px] tabular-nums shrink-0 text-muted-foreground/50">
                                            {categoryCounts[category]}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar w-full bg-background"
            >
                <table className="w-full border-collapse" style={{ fontFamily: 'Tahoma, Arial, sans-serif', fontSize: '12px' }}>
                    <thead className="sticky top-0 bg-card z-10 border-b border-border select-none text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                        <tr>
                            <th className="text-left font-semibold py-[5px] px-3 border-r border-border">Symbol</th>
                            <th className="text-center font-semibold py-[5px] px-1 border-r border-border w-[40px]">Signal</th>
                            {columns.bid && <th className="text-right font-semibold py-[5px] px-3 border-r border-border min-w-[70px]">Bid</th>}
                            {columns.ask && panelWidth > 220 && <th className="text-right font-semibold py-[5px] px-3 border-r border-border min-w-[70px]">Ask</th>}
                            {columns.oneDayChange && panelWidth > 300 && <th className="text-right font-semibold py-[5px] px-3 border-r border-border min-w-[72px]">Change</th>}
                            {columns.pnl && panelWidth > 240 && <th className="text-right font-semibold py-[5px] px-3 min-w-[48px]">P/L</th>}
                        </tr>
                    </thead>
                    <tbody className="bg-background">
                        {tableRows.length === 0 ? (
                            <tr className="border-b border-border/40 bg-background" style={{ height: MARKET_ROW_HEIGHT }}>
                                <td colSpan={columnCount} className="px-3 py-[6px] text-[11px] text-muted-foreground/60">
                                    {emptyStateLabel}
                                </td>
                            </tr>
                        ) : (
                            <>
                                {topSpacerHeight > 0 && (
                                    <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
                                        <td colSpan={columnCount} className="border-0 p-0" style={{ height: topSpacerHeight }} />
                                    </tr>
                                )}

                                {virtualRows.map((row) => row.type === 'section' ? (
                                    <tr
                                        key={row.id}
                                        className="border-b border-border/40 bg-card/70 text-muted-foreground"
                                        style={{ height: MARKET_ROW_HEIGHT }}
                                    >
                                        <td colSpan={columnCount} className="px-3 py-[5px]">
                                            <div className="flex min-w-0 items-center justify-between gap-2">
                                                <span className="truncate text-[10px] font-semibold uppercase tracking-wider">{row.label}</span>
                                                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">{row.count}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    <InstrumentRow
                                        key={row.id}
                                        instrument={row.instrument}
                                        selectedSymbol={selectedSymbol}
                                        isSearching={isSearching}
                                        panelWidth={panelWidth}
                                        columns={columns}
                                        priceHighlight={priceHighlight}
                                        isFavorite={favoriteSymbolSet.has(row.instrument.symbol)}
                                        isHighlighted={highlightedSearchIndex >= 0 && filteredInstruments[highlightedSearchIndex]?.symbol === row.instrument.symbol}
                                        positionPriceSeed={positionPriceSeedsBySymbol?.[row.instrument.symbol]}
                                        rowHeight={MARKET_ROW_HEIGHT}
                                        onSelect={handleSelectInstrument}
                                        onToggleFavorite={handleToggleFavorite}
                                        clearSearch={clearSearch}
                                        onHover={onSymbolHover}
                                    />
                                ))}

                                {bottomSpacerHeight > 0 && (
                                    <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
                                        <td colSpan={columnCount} className="border-0 p-0" style={{ height: bottomSpacerHeight }} />
                                    </tr>
                                )}
                            </>
                        )}

                        <tr
                            className="border-b border-border bg-background cursor-pointer hover:bg-accent/40"
                            onClick={() => { clearSearch(); searchInputRef.current?.focus(); }}
                        >
                            <td colSpan={columnCount} className="py-[4px] px-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground/60 flex items-center gap-1.5 text-[11px]">
                                        <span className="text-success text-[13px] font-bold leading-none">+</span>
                                        click to add...
                                    </span>
                                    <span className="text-muted-foreground/40 text-[10px] font-mono">
                                        {resultCountLabel}
                                    </span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default memo(InstrumentsPanel);
