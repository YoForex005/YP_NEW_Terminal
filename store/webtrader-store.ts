/**
 * WebTrader Store
 * Splits persisted preferences from volatile realtime state so quotes and
 * connection churn avoid persist/devtools overhead on the hot path.
 */

import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { devtools, persist } from 'zustand/middleware';
import { getSymbolAliases } from '@/lib/market-symbols';
import {
  TradingSession,
  TradingConnectionStatus,
  SymbolInfo,
  PriceTick,
  Order,
  Position,
  TradingAccountInfo,
  Timeframe,
  ChartType,
  QuoteStatus,
  OrderType,
  OrderFillingMode,
} from '@/types/webtrader';
import { WebSocketTradingClient, type MarketStatusPayload } from '@/lib/trading/websocket-client';
import {
  DEFAULT_TIMEFRAME,
  DEFAULT_FILLING_MODE,
  LOT_CONFIG,
  DEVIATION_CONFIG,
} from '@/lib/trading/constants';

interface PriceDirection {
  bidDirection: 'up' | 'down' | 'same';
  askDirection: 'up' | 'down' | 'same';
}

type PriceSnapshot = PriceTick & PriceDirection;
type ActiveBottomTab = 'positions' | 'orders' | 'history';
const MAX_ACCEPTED_FUTURE_TICK_SKEW_MS = 60_000;

const isMarketStatusPayload = (
  status: QuoteStatus | MarketStatusPayload,
): status is MarketStatusPayload =>
  'status' in status || 'quoteStatus' in status;

const arraysEqual = (left?: readonly string[], right?: readonly string[]): boolean => {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

const symbolsEqual = (left: SymbolInfo, right: SymbolInfo): boolean =>
  left.name === right.name &&
  left.description === right.description &&
  left.baseCurrency === right.baseCurrency &&
  left.quoteCurrency === right.quoteCurrency &&
  left.digits === right.digits &&
  left.point === right.point &&
  left.tickSize === right.tickSize &&
  left.tickValue === right.tickValue &&
  left.tradeContractSize === right.tradeContractSize &&
  left.tradeMode === right.tradeMode &&
  left.calcMode === right.calcMode &&
  left.volumeMin === right.volumeMin &&
  left.volumeMax === right.volumeMax &&
  left.volumeStep === right.volumeStep &&
  left.marginInitial === right.marginInitial &&
  left.marginMaintenance === right.marginMaintenance &&
  left.swapLong === right.swapLong &&
  left.swapShort === right.swapShort &&
  left.isFavorite === right.isFavorite &&
  left.category === right.category &&
  arraysEqual(left.sessionOpen, right.sessionOpen) &&
  arraysEqual(left.sessionClose, right.sessionClose);

const createSymbolInfoFromUpdate = (
  symbol: Partial<SymbolInfo> & Pick<SymbolInfo, 'name'>,
): SymbolInfo => ({
  name: symbol.name,
  description: symbol.description ?? symbol.name,
  baseCurrency: symbol.baseCurrency ?? '',
  quoteCurrency: symbol.quoteCurrency ?? '',
  digits: symbol.digits ?? 5,
  point: symbol.point ?? 0,
  tickSize: symbol.tickSize ?? 0,
  tickValue: symbol.tickValue ?? 0,
  tradeContractSize: symbol.tradeContractSize ?? 0,
  tradeMode: symbol.tradeMode ?? 'disabled',
  calcMode: symbol.calcMode ?? 'forex',
  volumeMin: symbol.volumeMin ?? 0,
  volumeMax: symbol.volumeMax ?? 0,
  volumeStep: symbol.volumeStep ?? 0,
  marginInitial: symbol.marginInitial ?? 0,
  marginMaintenance: symbol.marginMaintenance ?? 0,
  swapLong: symbol.swapLong ?? 0,
  swapShort: symbol.swapShort ?? 0,
  ...(symbol.sessionOpen ? { sessionOpen: symbol.sessionOpen } : {}),
  ...(symbol.sessionClose ? { sessionClose: symbol.sessionClose } : {}),
  ...(symbol.isFavorite !== undefined ? { isFavorite: symbol.isFavorite } : {}),
  ...(symbol.category !== undefined ? { category: symbol.category } : {}),
});

interface OrderFormState {
  type: OrderType;
  volume: number;
  sl: number | null;
  tp: number | null;
  useDeviation: boolean;
  deviation: number;
  fillingMode: OrderFillingMode;
}

interface PersistedPreferenceState {
  favorites: string[];
  selectedTimeframe: Timeframe;
  chartType: ChartType;
  showMarketWatch: boolean;
  showTradingPanel: boolean;
  setFavorites: (favorites: string[]) => void;
  toggleFavorite: (symbol: string) => void;
  setTimeframe: (timeframe: Timeframe) => void;
  setChartType: (type: ChartType) => void;
  setShowMarketWatch: (show: boolean) => void;
  setShowTradingPanel: (show: boolean) => void;
}

interface LiveRuntimeState {
  connectionStatus: TradingConnectionStatus;
  connectionError: string | null;
  reconnectAttempts: number;
  session: TradingSession | null;
  ohlcSessionScopeId: string | null;
  accountInfo: TradingAccountInfo | null;
  symbols: SymbolInfo[];
  prices: Record<string, PriceSnapshot>;
  quoteStatuses: Record<string, QuoteStatus>;
  selectedSymbol: string | null;
  positions: Position[];
  knownClosedTickets: Set<number>;
  orders: Order[];
  activeBottomTab: ActiveBottomTab;
  orderForm: OrderFormState;
  activeAction: 'buy' | 'sell' | null;
  wsClient: WebSocketTradingClient | null;
  marketWsClient: WebSocketTradingClient | null;
  ohlcWsClient: WebSocketTradingClient | null;
  isLoadingSymbols: boolean;
  isPlacingOrder: boolean;
  isClosingPosition: boolean;
  isCancellingOrder: boolean;
  // Latest MT5 server timestamp in UTC ms, derived from live broker tick data.
  // 0 until the first tick arrives. Used by mt5-time utilities for display.
  mt5ServerTimeMs: number;
  setMt5ServerTimeMs: (ms: number) => void;
  setConnectionStatus: (status: TradingConnectionStatus) => void;
  setConnectionError: (error: string | null) => void;
  setSession: (session: TradingSession | null) => void;
  setOhlcSessionScopeId: (scopeId: string | null) => void;
  setAccountInfo: (info: TradingAccountInfo | null) => void;
  setSymbols: (symbols: SymbolInfo[]) => void;
  updateSymbol: (symbol: Partial<SymbolInfo> & Pick<SymbolInfo, 'name'>) => void;
  updatePrice: (tick: PriceTick) => void;
  updateQuoteStatus: (status: QuoteStatus | MarketStatusPayload) => void;
  setSelectedSymbol: (symbol: string | null) => void;
  setPositions: (positions: Position[]) => void;
  addPosition: (position: Position) => void;
  updatePosition: (position: Position) => void;
  removePosition: (ticket: number) => void;
  setOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  updateOrder: (order: Order) => void;
  removeOrder: (ticket: number) => void;
  setActiveBottomTab: (tab: ActiveBottomTab) => void;
  updateOrderForm: (updates: Partial<OrderFormState>) => void;
  setActiveAction: (action: 'buy' | 'sell' | null) => void;
  resetOrderForm: () => void;
  resetLiveState: () => void;
  setWsClient: (client: WebSocketTradingClient | null) => void;
  setMarketWsClient: (client: WebSocketTradingClient | null) => void;
  setOhlcWsClient: (client: WebSocketTradingClient | null) => void;
  setIsLoadingSymbols: (loading: boolean) => void;
  setIsPlacingOrder: (loading: boolean) => void;
  setIsClosingPosition: (loading: boolean) => void;
  setIsCancellingOrder: (loading: boolean) => void;
  setReconnectAttempts: (attempts: number) => void;
}

export interface WebtraderState
  extends PersistedPreferenceState,
    LiveRuntimeState {
  getSymbol: (name: string) => SymbolInfo | undefined;
  getPrice: (symbol: string) => PriceSnapshot | undefined;
  getPosition: (ticket: number) => Position | undefined;
  getOrder: (ticket: number) => Order | undefined;
  getTotalProfit: () => number;
  getMarginLevel: () => number;
  getFreeMargin: () => number;
}

const createInitialOrderForm = (): OrderFormState => ({
  type: 'buy',
  volume: LOT_CONFIG.DEFAULT,
  sl: null,
  tp: null,
  useDeviation: false,
  deviation: DEVIATION_CONFIG.DEFAULT,
  fillingMode: DEFAULT_FILLING_MODE as OrderFillingMode,
});

const createInitialLiveRuntimeState = () => ({
  connectionStatus: 'disconnected' as TradingConnectionStatus,
  connectionError: null as string | null,
  reconnectAttempts: 0,
  session: null as TradingSession | null,
  ohlcSessionScopeId: null as string | null,
  accountInfo: null as TradingAccountInfo | null,
  symbols: [] as SymbolInfo[],
  prices: {} as Record<string, PriceSnapshot>,
  quoteStatuses: {} as Record<string, QuoteStatus>,
  selectedSymbol: null as string | null,
  positions: [] as Position[],
  knownClosedTickets: new Set<number>(),
  orders: [] as Order[],
  activeBottomTab: 'positions' as ActiveBottomTab,
  orderForm: createInitialOrderForm(),
  activeAction: null as 'buy' | 'sell' | null,
  wsClient: null as WebSocketTradingClient | null,
  marketWsClient: null as WebSocketTradingClient | null,
  ohlcWsClient: null as WebSocketTradingClient | null,
  isLoadingSymbols: false,
  isPlacingOrder: false,
  isClosingPosition: false,
  isCancellingOrder: false,
  mt5ServerTimeMs: 0,
});

const normalizePriceTickTimestampMs = (tick: PriceTick | undefined): number => {
  const rawTime = tick?.time;
  const now = Date.now();

  if (rawTime instanceof Date) {
    const timestamp = rawTime.getTime();
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return now;
    }
    return timestamp <= now + MAX_ACCEPTED_FUTURE_TICK_SKEW_MS ? timestamp : now;
  }

  const parsed = new Date(rawTime as unknown as string | number).getTime();
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return now;
  }
  return parsed <= now + MAX_ACCEPTED_FUTURE_TICK_SKEW_MS ? parsed : now;
};

const getPriceTickFreshnessTimestampMs = (tick: PriceTick | undefined): number => {
  const receivedAtMs = tick?.receivedAtMs;
  if (
    typeof receivedAtMs === 'number' &&
    Number.isFinite(receivedAtMs) &&
    receivedAtMs > 0
  ) {
    return receivedAtMs;
  }

  return normalizePriceTickTimestampMs(tick);
};

const getPriceTickFreshnessSequence = (tick: PriceTick | undefined): number | null => {
  const receivedSequence = tick?.receivedSequence;
  return typeof receivedSequence === 'number' &&
    Number.isFinite(receivedSequence) &&
    receivedSequence > 0
    ? receivedSequence
    : null;
};

const isPriceTickNewerThan = (
  currentTick: PriceTick | undefined,
  nextTick: PriceTick,
): boolean => {
  if (!currentTick) {
    return false;
  }

  const currentSequence = getPriceTickFreshnessSequence(currentTick);
  const nextSequence = getPriceTickFreshnessSequence(nextTick);
  if (currentSequence !== null && nextSequence !== null) {
    return currentSequence > nextSequence;
  }

  return getPriceTickFreshnessTimestampMs(currentTick) > getPriceTickFreshnessTimestampMs(nextTick);
};

const hasNewerPriceTick = (
  prices: Record<string, PriceSnapshot>,
  aliases: string[],
  tick: PriceTick,
): boolean => aliases.some((alias) => isPriceTickNewerThan(prices[alias], tick));

const buildNextPriceSnapshot = (
  currentPrice: PriceSnapshot | undefined,
  tick: PriceTick,
  alias: string,
): PriceSnapshot => {
  const nextBid = tick.bid > 0 ? tick.bid : currentPrice?.bid ?? 0;
  const nextAsk = tick.ask > 0 ? tick.ask : currentPrice?.ask ?? 0;
  const nextRawLast = tick.last ?? 0;
  const nextRawSpread = tick.spread ?? 0;
  const nextLast =
    nextRawLast > 0 ? nextRawLast : nextBid > 0 ? nextBid : nextAsk;
  const nextSpread =
    nextRawSpread > 0
      ? nextRawSpread
      : nextBid > 0 && nextAsk > 0
        ? nextAsk - nextBid
        : currentPrice?.spread ?? 0;
  const timestampMs = normalizePriceTickTimestampMs(tick);

    return {
    ...currentPrice,
    ...tick,
    symbol: alias,
    bid: nextBid,
    ask: nextAsk,
    last: nextLast,
    spread: nextSpread,
    time: new Date(timestampMs),
    bidDirection: currentPrice
      ? nextBid > currentPrice.bid
        ? 'up'
        : nextBid < currentPrice.bid
          ? 'down'
          : 'same'
      // First tick for this symbol — treat as 'up' since a live price just arrived
      : nextBid > 0 ? 'up' : 'same',
    askDirection: currentPrice
      ? nextAsk > currentPrice.ask
        ? 'up'
        : nextAsk < currentPrice.ask
          ? 'down'
          : 'same'
      : nextAsk > 0 ? 'up' : 'same',
  };
};

const applyTickToPrices = (
  currentPrices: Record<string, PriceSnapshot>,
  tick: PriceTick,
): Record<string, PriceSnapshot> => {
  let nextPrices = currentPrices;
  const aliases = getSymbolAliases(tick.symbol);

  if (hasNewerPriceTick(currentPrices, aliases, tick)) {
    return currentPrices;
  }

  for (const alias of aliases) {
    const nextPrice = buildNextPriceSnapshot(nextPrices[alias], tick, alias);

    if (nextPrices === currentPrices) {
      nextPrices = { ...currentPrices };
    }

    nextPrices[alias] = nextPrice;
  }

  return nextPrices;
};

const livePriceSnapshotCache: Record<string, PriceSnapshot> = {};
const livePriceListenersBySymbol = new Map<string, Set<() => void>>();

const getPriceForSymbolFromRecord = (
  prices: Record<string, PriceSnapshot>,
  symbol: string,
): PriceSnapshot | undefined => {
  for (const alias of getSymbolAliases(symbol)) {
    const price = prices[alias];
    if (price) {
      return price;
    }
  }

  return undefined;
};

const notifyLivePriceListeners = (symbols: string[]) => {
  // Fast path: single alias — skip deduplication Set allocation.
  if (symbols.length === 1) {
    livePriceListenersBySymbol.get(symbols[0])?.forEach((listener) => listener());
    return;
  }

  const listeners = new Set<() => void>();
  for (const symbol of symbols) {
    livePriceListenersBySymbol.get(symbol)?.forEach((listener) => {
      listeners.add(listener);
    });
  }
  listeners.forEach((listener) => listener());
};

const subscribeLivePriceBySymbol = (symbol: string, listener: () => void) => {
  const aliases = getSymbolAliases(symbol);

  for (const alias of aliases) {
    const listeners = livePriceListenersBySymbol.get(alias) ?? new Set<() => void>();
    listeners.add(listener);
    livePriceListenersBySymbol.set(alias, listeners);
  }

  return () => {
    for (const alias of aliases) {
      const listeners = livePriceListenersBySymbol.get(alias);
      if (!listeners) {
        continue;
      }

      listeners.delete(listener);
      if (listeners.size === 0) {
        livePriceListenersBySymbol.delete(alias);
      }
    }
  };
};

const getLivePriceBySymbol = (symbol: string): PriceSnapshot | undefined =>
  getPriceForSymbolFromRecord(livePriceSnapshotCache, symbol) ??
  getPriceForSymbolFromRecord(liveRuntimeStore.getState().prices, symbol);

export const getLivePriceSnapshotBySymbol = (symbol: string): PriceSnapshot | undefined =>
  getLivePriceBySymbol(symbol);

// Direct subscription for zero-overhead DOM updates; use when bypassing React's render cycle.
export const subscribeToLivePriceBySymbol = subscribeLivePriceBySymbol;

const publishLivePriceTick = (tick: PriceTick): boolean => {
  const aliases = getSymbolAliases(tick.symbol);

  if (hasNewerPriceTick(livePriceSnapshotCache, aliases, tick)) {
    return false;
  }

  for (const alias of aliases) {
    livePriceSnapshotCache[alias] = buildNextPriceSnapshot(
      livePriceSnapshotCache[alias],
      tick,
      alias,
    );
  }

  notifyLivePriceListeners(aliases);
  return true;
};

const resetLivePriceSnapshotCache = () => {
  const symbols = Object.keys(livePriceSnapshotCache);
  symbols.forEach((symbol) => {
    delete livePriceSnapshotCache[symbol];
  });

  if (symbols.length > 0) {
    notifyLivePriceListeners(symbols);
  }
};

const getMarginLevel = (account: TradingAccountInfo | null): number => {
  if (!account) return 0;
  if (Number.isFinite(account.marginLevel)) {
    return account.marginLevel;
  }
  if (
    !Number.isFinite(account.equity) ||
    !Number.isFinite(account.margin) ||
    account.margin === 0
  ) {
    return 0;
  }

  return (account.equity / account.margin) * 100;
};

const getFreeMargin = (account: TradingAccountInfo | null): number => {
  if (!account) return 0;
  if (Number.isFinite(account.marginFree)) {
    return account.marginFree;
  }
  if (Number.isFinite(account.availableMargin)) {
    return account.availableMargin;
  }
  if (!Number.isFinite(account.equity) || !Number.isFinite(account.margin)) {
    return 0;
  }

  return account.equity - account.margin;
};

const persistedPreferencesStore = createStore<PersistedPreferenceState>()(
  devtools(
    persist(
      (set) => ({
        favorites: [],
        selectedTimeframe: DEFAULT_TIMEFRAME as Timeframe,
        chartType: 'candlestick',
        showMarketWatch: true,
        showTradingPanel: true,
        setFavorites: (favorites) => {
          set({ favorites });
        },
        toggleFavorite: (symbol) => {
          set((state) => {
            const hasFavorite = state.favorites.includes(symbol);
            return {
              favorites: hasFavorite
                ? state.favorites.filter((entry) => entry !== symbol)
                : [...state.favorites, symbol],
            };
          });
        },
        setTimeframe: (selectedTimeframe) => {
          set({ selectedTimeframe });
        },
        setChartType: (chartType) => {
          set({ chartType });
        },
        setShowMarketWatch: (showMarketWatch) => {
          set({ showMarketWatch });
        },
        setShowTradingPanel: (showTradingPanel) => {
          set({ showTradingPanel });
        },
      }),
      {
        name: 'webtrader-storage',
      },
    ),
    { name: 'WebTraderPreferences' },
  ),
);

const liveRuntimeStore = createStore<LiveRuntimeState>()((set, get) => ({
  ...createInitialLiveRuntimeState(),
  setConnectionStatus: (connectionStatus) => {
    set({ connectionStatus });
  },
  setConnectionError: (connectionError) => {
    set({ connectionError });
  },
  setSession: (session) => {
    set((state) => ({
      session,
      connectionStatus: session ? 'connected' : 'disconnected',
      connectionError: session ? null : state.connectionError,
    }));
  },
  setOhlcSessionScopeId: (ohlcSessionScopeId) => {
    set({ ohlcSessionScopeId: ohlcSessionScopeId?.trim() || null });
  },
  setAccountInfo: (accountInfo) => {
    set({ accountInfo });
  },
  setSymbols: (symbols) => {
    set({ symbols });
  },
  updateSymbol: (symbol) => {
    set((state) => {
      const index = state.symbols.findIndex((entry) => entry.name === symbol.name);
      if (index < 0) {
        return { symbols: [...state.symbols, createSymbolInfoFromUpdate(symbol)] };
      }

      const nextSymbol = { ...state.symbols[index], ...symbol };
      if (symbolsEqual(state.symbols[index], nextSymbol)) {
        return state;
      }

      const symbols = state.symbols.slice();
      symbols[index] = nextSymbol;
      return { symbols };
    });
  },
  updatePrice: (tick) => {
    enqueuePriceTick(tick);
  },
  updateQuoteStatus: (status) => {
    const quoteStatus: QuoteStatus =
      isMarketStatusPayload(status) && status.quoteStatus
        ? status.quoteStatus
        : isMarketStatusPayload(status)
          ? {
              symbol: status.symbol,
              state: status.status,
              ready: status.isOpen === true,
              message: status.message,
              updatedAt: status.timestamp ?? new Date(),
              raw: status.raw,
            }
        : {
            symbol: status.symbol,
            state: status.state,
            ready: status.ready,
            message: status.message,
            engineAvailable: status.engineAvailable,
            seededCount: status.seededCount,
            updatedAt: status.updatedAt,
            raw: status.raw,
          };

    if (!quoteStatus.symbol) {
      return;
    }

    set((state) => {
      const quoteStatuses = { ...state.quoteStatuses };
      for (const alias of getSymbolAliases(quoteStatus.symbol ?? '')) {
        quoteStatuses[alias] = quoteStatus;
      }
      return { quoteStatuses };
    });
  },
  setSelectedSymbol: (selectedSymbol) => {
    set({ selectedSymbol });
  },
  setPositions: (positions) => {
    set((state) => {
      if (state.knownClosedTickets.size === 0) {
        return { positions };
      }

      return {
        positions: positions.filter(
          (position) => !state.knownClosedTickets.has(position.ticket),
        ),
      };
    });
  },
  addPosition: (position) => {
    set((state) => {
      if (state.knownClosedTickets.has(position.ticket)) {
        return state;
      }
      const existingIndex = state.positions.findIndex(
        (entry) => entry.ticket === position.ticket,
      );
      if (existingIndex < 0) {
        return { positions: [...state.positions, position] };
      }

      const positions = state.positions.slice();
      positions[existingIndex] = position;
      return { positions };
    });
  },
  updatePosition: (position) => {
    set((state) => {
      if (state.knownClosedTickets.has(position.ticket)) {
        return state;
      }
      const existingIndex = state.positions.findIndex(
        (entry) => entry.ticket === position.ticket,
      );
      if (existingIndex < 0) {
        return { positions: [...state.positions, position] };
      }

      const positions = state.positions.slice();
      positions[existingIndex] = position;
      return { positions };
    });
  },
  removePosition: (ticket) => {
    set((state) => {
      const nextKnown = new Set(state.knownClosedTickets);
      nextKnown.add(ticket);
      // Keep set size reasonable to prevent memory leaks from long sessions
      if (nextKnown.size > 1000) {
        const iter = nextKnown.values();
        for (let i = 0; i < 100; i++) {
          const val = iter.next().value;
          if (val !== undefined) nextKnown.delete(val);
        }
      }
      return {
        positions: state.positions.filter((entry) => entry.ticket !== ticket),
        knownClosedTickets: nextKnown,
      };
    });
  },
  setOrders: (orders) => {
    set({ orders });
  },
  addOrder: (order) => {
    set((state) => {
      const existingIndex = state.orders.findIndex(
        (entry) => entry.ticket === order.ticket,
      );
      if (existingIndex < 0) {
        return { orders: [...state.orders, order] };
      }

      const orders = state.orders.slice();
      orders[existingIndex] = order;
      return { orders };
    });
  },
  updateOrder: (order) => {
    set((state) => {
      const existingIndex = state.orders.findIndex(
        (entry) => entry.ticket === order.ticket,
      );
      if (existingIndex < 0) {
        return { orders: [...state.orders, order] };
      }

      const orders = state.orders.slice();
      orders[existingIndex] = order;
      return { orders };
    });
  },
  removeOrder: (ticket) => {
    set((state) => ({
      orders: state.orders.filter((entry) => entry.ticket !== ticket),
    }));
  },
  setActiveBottomTab: (activeBottomTab) => {
    set({ activeBottomTab });
  },
  updateOrderForm: (updates) => {
    set((state) => ({
      orderForm: { ...state.orderForm, ...updates },
    }));
  },
  setActiveAction: (activeAction) => {
    set({ activeAction });
  },
  resetOrderForm: () => {
    set({ orderForm: createInitialOrderForm() });
  },
  resetLiveState: () => {
    set(createInitialLiveRuntimeState());
    resetQueuedPrices();
  },
  setWsClient: (wsClient) => {
    set({ wsClient });
  },
  setMarketWsClient: (marketWsClient) => {
    set({ marketWsClient });
  },
  setOhlcWsClient: (ohlcWsClient) => {
    set({ ohlcWsClient });
  },
  setIsLoadingSymbols: (isLoadingSymbols) => {
    set({ isLoadingSymbols });
  },
  setIsPlacingOrder: (isPlacingOrder) => {
    set({ isPlacingOrder });
  },
  setIsClosingPosition: (isClosingPosition) => {
    set({ isClosingPosition });
  },
  setIsCancellingOrder: (isCancellingOrder) => {
    set({ isCancellingOrder });
  },
  setReconnectAttempts: (reconnectAttempts) => {
    set({ reconnectAttempts });
  },
  setMt5ServerTimeMs: (mt5ServerTimeMs) => {
    // Only advance — never go backwards (guards against stale out-of-order messages).
    const current = liveRuntimeStore.getState().mt5ServerTimeMs;
    if (mt5ServerTimeMs > current) {
      set({ mt5ServerTimeMs });
    }
  },
}));

const queuedPriceTicks = new Map<string, PriceTick>();
let pendingPriceFlushHandle: number | ReturnType<typeof setTimeout> | null = null;
let pendingPriceFlushUsesAnimationFrame = false;
let nextPriceTickReceivedSequence = 0;
let lastQueuedPriceFlushAtMs = 0;
const IMMEDIATE_PRICE_FLUSH_COOLDOWN_MS = 4;

const flushQueuedPrices = () => {
  pendingPriceFlushHandle = null;
  pendingPriceFlushUsesAnimationFrame = false;

  if (queuedPriceTicks.size === 0) {
    return;
  }

  lastQueuedPriceFlushAtMs = Date.now();

  const ticks = [...queuedPriceTicks.values()];
  queuedPriceTicks.clear();

  liveRuntimeStore.setState((state) => {
    let prices = state.prices;

    for (const tick of ticks) {
      prices = applyTickToPrices(prices, tick);
    }

    if (prices === state.prices) {
      return state;
    }

    return { prices };
  });
};

const shouldFlushQueuedPricesImmediately = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'
  ) {
    return false;
  }

  return (
    Date.now() - lastQueuedPriceFlushAtMs >=
    IMMEDIATE_PRICE_FLUSH_COOLDOWN_MS
  );
};

const schedulePriceFlush = () => {
  if (pendingPriceFlushHandle !== null) {
    return;
  }

  if (shouldFlushQueuedPricesImmediately()) {
    // queueMicrotask runs before any timer callback (~0ms) so React state
    // (colors, button states) updates as soon as the current JS task yields —
    // faster than the 4ms minimum browser clamp on setTimeout(0).
    pendingPriceFlushHandle = -1;
    queueMicrotask(() => {
      if (pendingPriceFlushHandle === -1) {
        flushQueuedPrices();
      }
    });
    return;
  }

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    pendingPriceFlushUsesAnimationFrame = true;
    pendingPriceFlushHandle = window.requestAnimationFrame(() => {
      flushQueuedPrices();
    });
    return;
  }

  pendingPriceFlushHandle = setTimeout(() => {
    flushQueuedPrices();
  }, 16);
};

const enqueuePriceTick = (tick: PriceTick) => {
  nextPriceTickReceivedSequence += 1;
  const receivedTick = {
    ...tick,
    receivedAtMs: Date.now(),
    receivedSequence: nextPriceTickReceivedSequence,
  };

  const queuedTick = queuedPriceTicks.get(tick.symbol);
  if (isPriceTickNewerThan(queuedTick, receivedTick)) {
    return;
  }

  if (!publishLivePriceTick(receivedTick)) {
    return;
  }

  queuedPriceTicks.set(tick.symbol, receivedTick);
  schedulePriceFlush();
};

const resetQueuedPrices = () => {
  queuedPriceTicks.clear();

  if (pendingPriceFlushHandle === null) {
    resetLivePriceSnapshotCache();
    return;
  }

  if (
    pendingPriceFlushUsesAnimationFrame &&
    typeof window !== 'undefined' &&
    typeof window.cancelAnimationFrame === 'function' &&
    typeof pendingPriceFlushHandle === 'number'
  ) {
    window.cancelAnimationFrame(pendingPriceFlushHandle);
  } else if (pendingPriceFlushHandle !== -1) {
    // -1 is the microtask sentinel — no timer to cancel, the guard in the
    // microtask callback detects the cleared handle and skips flushQueuedPrices.
    clearTimeout(
      pendingPriceFlushHandle as ReturnType<typeof setTimeout>,
    );
  }

  pendingPriceFlushHandle = null;
  pendingPriceFlushUsesAnimationFrame = false;
  resetLivePriceSnapshotCache();
};

const getMergedState = (): WebtraderState => {
  const preferencesState = persistedPreferencesStore.getState();
  const liveState = liveRuntimeStore.getState();

  return {
    ...preferencesState,
    ...liveState,
    getSymbol: (name) => {
      return liveRuntimeStore.getState().symbols.find((symbol) => symbol.name === name);
    },
    getPrice: (symbol) => {
      const prices = liveRuntimeStore.getState().prices;
      for (const alias of getSymbolAliases(symbol)) {
        const price = prices[alias];
        if (price) {
          return price;
        }
      }
      return undefined;
    },
    getPosition: (ticket) => {
      return liveRuntimeStore.getState().positions.find((position) => position.ticket === ticket);
    },
    getOrder: (ticket) => {
      return liveRuntimeStore.getState().orders.find((order) => order.ticket === ticket);
    },
    getTotalProfit: () => {
      return liveRuntimeStore
        .getState()
        .positions.reduce((sum, position) => sum + position.profit, 0);
    },
    getMarginLevel: () => {
      return getMarginLevel(liveRuntimeStore.getState().accountInfo);
    },
    getFreeMargin: () => {
      return getFreeMargin(liveRuntimeStore.getState().accountInfo);
    },
  };
};

const combinedStoreApi: Pick<
  StoreApi<WebtraderState>,
  'getState' | 'getInitialState' | 'subscribe'
> = {
  getState: getMergedState,
  getInitialState: getMergedState,
  subscribe: (listener) => {
    let previousState = getMergedState();

    const notify = () => {
      const nextState = getMergedState();
      const lastState = previousState;
      previousState = nextState;
      listener(nextState, lastState);
    };

    const unsubscribePreferences = persistedPreferencesStore.subscribe(notify);
    const unsubscribeLive = liveRuntimeStore.subscribe(notify);

    return () => {
      unsubscribePreferences();
      unsubscribeLive();
    };
  },
};

type WebtraderSelector<T> = (state: WebtraderState) => T;

export function useWebtraderStore(): WebtraderState;
export function useWebtraderStore<T>(selector: WebtraderSelector<T>): T;
export function useWebtraderStore<T>(selector?: WebtraderSelector<T>) {
  return useStore(
    combinedStoreApi,
    (selector ?? ((state: WebtraderState) => state)) as WebtraderSelector<T>,
  );
}

useWebtraderStore.getState = combinedStoreApi.getState;
useWebtraderStore.subscribe = combinedStoreApi.subscribe;

const getPriceForSymbol = getPriceForSymbolFromRecord;

export const createSymbolPriceSelector = (symbol: string) =>
  (state: WebtraderState) => getPriceForSymbol(state.prices, symbol);

export const useConnectionStatus = () =>
  useWebtraderStore((state) => state.connectionStatus);

export const useSession = () => useWebtraderStore((state) => state.session);

export const useAccountInfo = () =>
  useWebtraderStore((state) => state.accountInfo);

export const useSymbols = () => useWebtraderStore((state) => state.symbols);

export const useFavorites = () => useWebtraderStore((state) => state.favorites);

export const usePrices = () => useWebtraderStore((state) => state.prices);

export const useQuoteStatuses = () =>
  useWebtraderStore((state) => state.quoteStatuses);

export const usePriceBySymbol = (symbol: string) =>
  useSyncExternalStore(
    (listener) => subscribeLivePriceBySymbol(symbol, listener),
    () => getLivePriceBySymbol(symbol),
    () => getPriceForSymbol(liveRuntimeStore.getState().prices, symbol),
  );

export const useSelectedSymbol = () =>
  useWebtraderStore((state) => state.selectedSymbol);

export const usePositions = () => useWebtraderStore((state) => state.positions);

export const useOrders = () => useWebtraderStore((state) => state.orders);

export const useOrderForm = () => useWebtraderStore((state) => state.orderForm);

export const useWsClient = () => useWebtraderStore((state) => state.wsClient);

export const useMarketWsClient = () =>
  useWebtraderStore((state) => state.marketWsClient);

export const useOhlcWsClient = () =>
  useWebtraderStore((state) => state.ohlcWsClient);

/**
 * Seeds a provisional bid/ask from the latest OHLC close price so the market
 * watch and order panel show a real price immediately when bars load — before
 * the first live MT5 tick arrives.  Real ticks always win (they have a newer
 * receivedAtMs), so this never overwrites live data.
 */
export const seedOhlcClosePrice = (symbol: string, closePrice: number, barTimeMs: number): void => {
  if (!symbol || !(closePrice > 0)) {
    return;
  }
  const existing = getLivePriceBySymbol(symbol);
  if (existing && (existing.bid > 0 || existing.ask > 0)) {
    return;
  }
  enqueuePriceTick({
    symbol,
    bid: closePrice,
    ask: closePrice,
    last: closePrice,
    time: new Date(barTimeMs),
  });
};

export default useWebtraderStore;
