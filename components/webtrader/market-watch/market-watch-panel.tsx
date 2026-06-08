'use client';

import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  MoreVertical,
  Search,
  Star,
  X,
} from 'lucide-react';

import { SymbolIcon } from '@/components/terminal/SymbolIcon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SYMBOL_CATEGORIES } from '@/lib/trading/constants';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';
import { cn } from '@/lib/utils';
import { usePriceBySymbol, useWebtraderStore } from '@/store/webtrader-store';
import type { SymbolInfo } from '@/types/webtrader';

interface MarketWatchPanelProps {
  onSymbolSelect?: (symbol: string) => void;
  className?: string;
}

interface MarketWatchSymbolRowProps {
  symbol: SymbolInfo;
  isFavorite: boolean;
  isSelected: boolean;
  onSymbolClick: (symbol: string) => void;
  onToggleFavorite: (symbol: string) => void;
}

interface VisibleSection {
  id: string;
  label: string;
  symbols: SymbolInfo[];
}

const TERMINAL_TABLE_FONT = 'Tahoma, Arial, sans-serif';
const CATEGORY_META = new Map<string, string>(
  SYMBOL_CATEGORIES.map((category) => [category.id, category.label] as const),
);
const CATEGORY_IDS = SYMBOL_CATEGORIES.map((category) => category.id as string);

const formatQuote = (price: number, digits: number) =>
  Number.isFinite(price) && price > 0 ? price.toFixed(digits) : '--';

const getPriceColor = (direction?: 'up' | 'down' | 'same') => {
  if (direction === 'up') return 'text-[#089981]';
  if (direction === 'down') return 'text-[#f23645]';
  return 'text-white';
};

const getSignalTone = (direction?: 'up' | 'down' | 'same') => {
  if (direction === 'up') return 'bg-[#089981]/15 text-[#089981]';
  if (direction === 'down') return 'bg-[#f23645]/15 text-[#f23645]';
  return 'bg-[#232831] text-[#8b93a4]';
};

const getQuoteFlashClass = (
  direction?: 'up' | 'down' | 'same',
  side?: 'bid' | 'ask',
) => {
  if (direction === 'up') return side === 'ask' ? 'quote-flash-buy' : 'quote-flash-up';
  if (direction === 'down') return 'quote-flash-down';
  return '';
};

const getQuoteFlashKey = (
  symbol: string,
  side: 'bid' | 'ask',
  value: number,
  time: unknown,
) => {
  const tickTime =
    time instanceof Date
      ? time.getTime()
      : typeof time === 'string' || typeof time === 'number'
        ? time
        : '';
  return `${symbol}:${side}:${value}:${tickTime}`;
};

const resolveCategoryId = (symbol: SymbolInfo) => {
  const rawCategory = symbol.category?.trim().toLowerCase() ?? '';
  const combined = `${rawCategory} ${symbol.description ?? ''} ${symbol.name}`.toLowerCase();

  if (rawCategory === 'forex' || rawCategory === 'fx') return 'forex';
  if (rawCategory === 'crypto' || /bitcoin|ethereum|crypto|btc|eth|xrp|sol/u.test(combined)) {
    return 'crypto';
  }
  if (rawCategory === 'index' || rawCategory === 'indices' || /index|nas|spx|us30|us500|ustec/u.test(combined)) {
    return 'indices';
  }
  if (
    rawCategory === 'commodity' ||
    rawCategory === 'commodities' ||
    /gold|silver|oil|gas|xau|xag|commodity|usoil|ukoil/u.test(combined)
  ) {
    return 'commodities';
  }
  if (rawCategory === 'stock' || rawCategory === 'stocks' || /share|stock|equity/u.test(combined)) {
    return 'stocks';
  }

  return 'other';
};

const MarketWatchSymbolRow = memo(function MarketWatchSymbolRow({
  symbol,
  isFavorite,
  isSelected,
  onSymbolClick,
  onToggleFavorite,
}: MarketWatchSymbolRowProps) {
  const price = usePriceBySymbol(symbol.name);
  const quoteStatus = useWebtraderStore((state) => state.quoteStatuses[symbol.name]);
  const hasLiveBidAsk = Boolean(
    price &&
      Number.isFinite(price.bid) &&
      Number.isFinite(price.ask) &&
      price.bid > 0 &&
      price.ask > 0,
  );
  const direction = price?.bidDirection ?? price?.askDirection;
  const bidFlashClass = hasLiveBidAsk ? getQuoteFlashClass(price?.bidDirection, 'bid') : '';

  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => onSymbolClick(symbol.name)}
      className={cn(
        'group cursor-pointer border-b border-[#2a2d36] transition-colors',
        isSelected ? 'bg-[#232830] hover:bg-[#232830]' : 'bg-[#111317] hover:bg-white/5',
      )}
    >
      <td className="w-[18px] px-2 py-[7px] text-[#5f6573]">
        <GripVertical className="h-3 w-3" />
      </td>
      <td className={cn('border-r border-[#2a2d36] py-[7px] pl-1 pr-2', isSelected && 'shadow-[inset_2px_0_0_#3b82f6]')}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex-shrink-0">
            <SymbolIcon symbol={symbol.name} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold tracking-[0.02em] text-white">
              {formatTerminalDisplaySymbol(symbol.name)}
            </div>
            <div className="truncate text-[10px] text-[#78808f]">
              {symbol.description || CATEGORY_META.get(resolveCategoryId(symbol)) || symbol.baseCurrency}
            </div>
          </div>
          {!hasLiveBidAsk && quoteStatus?.state ? (
            <span className="rounded-sm border border-amber-400/30 px-1 py-[1px] text-[8px] font-bold uppercase tracking-[0.16em] text-amber-300/80">
              {quoteStatus.ready ? 'pending' : 'indicative'}
            </span>
          ) : null}
        </div>
      </td>
      <td className="w-[58px] border-r border-[#2a2d36] px-2 py-[7px] text-center">
        <div
          className={cn(
            'inline-flex min-w-[30px] items-center justify-center rounded-sm px-1.5 py-[2px] text-[10px] font-bold',
            getSignalTone(direction),
          )}
        >
          {direction === 'up' ? (
            <ArrowUp className="h-3 w-3" />
          ) : direction === 'down' ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <LayoutGrid className="h-2.5 w-2.5" />
          )}
        </div>
      </td>
      <td
        className={cn(
          'quote-flash-cell w-[106px] border-r border-[#2a2d36] px-3 py-[7px] text-right font-mono text-[12px]',
          getPriceColor(price?.bidDirection),
        )}
      >
        {bidFlashClass && price ? (
          <span
            key={getQuoteFlashKey(symbol.name, 'bid', price.bid, price.time)}
            className={`quote-flash-overlay ${bidFlashClass}`}
          />
        ) : null}
        <div className="quote-flash-content">
          <div>{formatQuote(price?.bid ?? 0, symbol.digits)}</div>
          <div className="mt-[2px] text-[9px] text-[#78808f]">
            {hasLiveBidAsk && price?.spread
              ? `spr ${(price.spread * Math.pow(10, symbol.digits)).toFixed(1)}`
              : '--'}
          </div>
        </div>
      </td>
      <td className="w-[34px] px-1.5 py-[7px] text-center">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(symbol.name);
          }}
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors',
            isFavorite
              ? 'text-[#f6c453]'
              : 'text-[#5f6573] hover:bg-white/5 hover:text-[#f6c453]',
          )}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={cn('h-3.5 w-3.5', isFavorite && 'fill-current')} />
        </button>
      </td>
    </motion.tr>
  );
});

export function MarketWatchPanel({ onSymbolSelect, className }: MarketWatchPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(CATEGORY_IDS.concat(['other', 'favorites'])),
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const symbols = useWebtraderStore((state) => state.symbols);
  const favorites = useWebtraderStore((state) => state.favorites);
  const selectedSymbol = useWebtraderStore((state) => state.selectedSymbol);
  const toggleFavorite = useWebtraderStore((state) => state.toggleFavorite);

  const groupedSymbols = useMemo(() => {
    const groups: Record<string, SymbolInfo[]> = Object.fromEntries(
      SYMBOL_CATEGORIES.map((category) => [category.id, [] as SymbolInfo[]]),
    );
    groups.other = [];

    for (const symbol of symbols) {
      const resolvedCategory = resolveCategoryId(symbol);
      if (resolvedCategory in groups) {
        groups[resolvedCategory].push(symbol);
      } else {
        groups.other.push(symbol);
      }
    }

    return groups;
  }, [symbols]);

  const normalizedSearch = deferredSearchQuery.trim().toLowerCase();

  const filterSymbols = useCallback(
    (symbolList: SymbolInfo[]) =>
      symbolList.filter((symbol) => {
        const matchesSearch =
          !normalizedSearch ||
          symbol.name.toLowerCase().includes(normalizedSearch) ||
          symbol.description?.toLowerCase().includes(normalizedSearch);
        const matchesFavorites = !showFavoritesOnly || favorites.includes(symbol.name);

        return matchesSearch && matchesFavorites;
      }),
    [favorites, normalizedSearch, showFavoritesOnly],
  );

  const favoriteSymbols = useMemo(
    () => filterSymbols(symbols.filter((symbol) => favorites.includes(symbol.name))),
    [favorites, filterSymbols, symbols],
  );

  const visibleSections = useMemo(() => {
    if (showFavoritesOnly) {
      return [
        {
          id: 'favorites',
          label: 'Favorites',
          symbols: favoriteSymbols,
        },
      ] satisfies VisibleSection[];
    }

    const sections: VisibleSection[] = SYMBOL_CATEGORIES.map((category) => ({
      id: category.id as string,
      label: category.label as string,
      symbols: filterSymbols(groupedSymbols[category.id] ?? []),
    })).filter((section) => section.symbols.length > 0);

    const otherSymbols = filterSymbols(groupedSymbols.other ?? []);
    if (otherSymbols.length > 0) {
      sections.push({
        id: 'other',
        label: 'Other',
        symbols: otherSymbols,
      });
    }

    return sections;
  }, [favoriteSymbols, filterSymbols, groupedSymbols, showFavoritesOnly]);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((previous) => {
      const next = new Set(previous);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const handleSymbolClick = useCallback(
    (symbol: string) => {
      onSymbolSelect?.(symbol);
    },
    [onSymbolSelect],
  );

  const handleToggleFavorite = useCallback(
    (symbol: string) => {
      toggleFavorite(symbol);
    },
    [toggleFavorite],
  );

  const totalVisibleSymbols = visibleSections.reduce(
    (count, section) => count + section.symbols.length,
    0,
  );

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden border-r border-[#2a2d36] bg-[#111317] text-white',
        className,
      )}
    >
      <div className="flex h-[52px] items-center justify-between border-b border-[#2a2d36] px-4">
        <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#c9cfda]">
          Instruments
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-sm text-[#7b8393] hover:bg-white/5 hover:text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 rounded-none border-[#2a2d36] bg-[#1a1d24] text-white"
            >
              <DropdownMenuItem onClick={() => setShowFavoritesOnly(false)}>
                Show all instruments
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowFavoritesOnly(true)}>
                Show favorites only
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setExpandedCategories(
                    new Set(CATEGORY_IDS.concat(['other', 'favorites'])),
                  )
                }
              >
                Expand all groups
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExpandedCategories(new Set())}>
                Collapse all groups
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#7b8393] transition-colors hover:bg-white/5 hover:text-white"
            title="Favorites filter"
            onClick={() => setShowFavoritesOnly((previous) => !previous)}
          >
            <Star
              className={cn(
                'h-4 w-4',
                showFavoritesOnly && 'fill-current text-[#f6c453]',
              )}
            />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-[#7b8393] transition-colors hover:bg-white/5 hover:text-white"
            title="Panel controls"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 border-b border-[#2a2d36] px-4 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e7686]" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
            className="h-[42px] w-full rounded-md border border-[#2a2d36] bg-[#151a21] pl-10 pr-4 text-[13px] text-white outline-none transition-colors placeholder:text-[#6e7686] focus:border-[#3b82f6]/60"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-[46px] w-full items-center justify-between rounded-md border border-[#2a2d36] bg-[#151a21] px-4 text-left text-[13px] font-semibold text-white transition-colors hover:border-white/20">
              <span>{showFavoritesOnly ? 'Favorites' : 'All instruments'}</span>
              <ChevronDown className="h-4 w-4 text-[#7b8393]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-52 rounded-none border-[#2a2d36] bg-[#1a1d24] text-white"
          >
            <DropdownMenuItem onClick={() => setShowFavoritesOnly(false)}>
              All instruments
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowFavoritesOnly(true)}>
              Favorites
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-b border-[#2a2d36] bg-[#15181e] px-4 py-[7px]">
        <div
          className="grid grid-cols-[1fr_58px_106px_34px] gap-0 text-[10px] uppercase tracking-[0.18em] text-[#7b8393]"
          style={{ fontFamily: TERMINAL_TABLE_FONT }}
        >
          <span className="pl-7">Symbol</span>
          <span className="text-center">Signal</span>
          <span className="text-right">Bid</span>
          <span className="sr-only">Favorite</span>
        </div>
      </div>

      <ScrollArea className="flex-1 bg-[#111317]">
        <div style={{ fontFamily: TERMINAL_TABLE_FONT }}>
          {visibleSections.map((section) => {
            const isExpanded = expandedCategories.has(section.id);

            return (
              <div key={section.id} className="border-b border-[#232831]">
                <button
                  type="button"
                  onClick={() => toggleCategory(section.id)}
                  className="flex w-full items-center gap-2 bg-[#14181f] px-4 py-[7px] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d95a5] transition-colors hover:bg-[#191f28] hover:text-white"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <span>{section.label}</span>
                  <span className="ml-auto text-[10px] font-medium tracking-[0.08em] text-[#6f7787]">
                    {section.symbols.length}
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <table className="w-full border-collapse text-[12px]">
                        <tbody>
                          {section.symbols.map((symbol) => (
                            <MarketWatchSymbolRow
                              key={symbol.name}
                              symbol={symbol}
                              isFavorite={favorites.includes(symbol.name)}
                              isSelected={selectedSymbol === symbol.name}
                              onSymbolClick={handleSymbolClick}
                              onToggleFavorite={handleToggleFavorite}
                            />
                          ))}
                        </tbody>
                      </table>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}

          {symbols.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center text-[#7f8795]">
              <div className="rounded-full border border-[#2a2d36] p-4">
                <LayoutGrid className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-[14px] font-medium text-[#c7ced9]">No instruments available</p>
                <p className="text-[12px]">Connect a session to populate the market watch.</p>
              </div>
            </div>
          ) : totalVisibleSymbols === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center text-[#7f8795]">
              <div className="rounded-full border border-[#2a2d36] p-4">
                <Search className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <p className="text-[14px] font-medium text-[#c7ced9]">No matching instruments</p>
                <p className="text-[12px]">Try another search or switch back to all instruments.</p>
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="border-t border-[#2a2d36] bg-[#15181e] px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-[#7b8393]">
        <div className="flex items-center justify-between">
          <span>{totalVisibleSymbols} visible</span>
          <span>{favorites.length} favorites</span>
        </div>
      </div>
    </div>
  );
}

export default MarketWatchPanel;
