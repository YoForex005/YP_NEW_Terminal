import { getLivePriceSnapshotBySymbol } from '@/store/webtrader-store';

export type LivePnlPosition = {
  symbol: string;
  type: 'buy' | 'sell';
  openPrice: number;
  currentPrice: number;
  volume: number;
  swap: number;
  profit: number;
  contractSize?: number;
  isHedged?: boolean;
  isAggregated?: boolean;
};

export function computeOpenPositionLivePrice(
  pos: Pick<LivePnlPosition, 'type' | 'isHedged' | 'currentPrice'>,
  snap: ReturnType<typeof getLivePriceSnapshotBySymbol> | undefined,
) {
  if (!pos.isHedged && snap) {
    return pos.type === 'buy' ? snap.bid : snap.ask;
  }
  return pos.currentPrice;
}

export function computeOpenPositionLiveProfit(
  pos: Pick<
    LivePnlPosition,
    'type' | 'isAggregated' | 'contractSize' | 'openPrice' | 'volume' | 'swap' | 'profit'
  >,
  liveCurrentPrice: number,
  snap: ReturnType<typeof getLivePriceSnapshotBySymbol> | undefined,
) {
  if (!pos.isAggregated && pos.contractSize && snap) {
    const directional =
      pos.type === 'buy'
        ? (liveCurrentPrice - pos.openPrice) * pos.volume * pos.contractSize
        : (pos.openPrice - liveCurrentPrice) * pos.volume * pos.contractSize;
    return directional + pos.swap;
  }
  return pos.profit;
}

export function computeLivePositionProfit(pos: LivePnlPosition) {
  const snap = getLivePriceSnapshotBySymbol(pos.symbol);
  const livePrice = computeOpenPositionLivePrice(pos, snap);
  return computeOpenPositionLiveProfit(pos, livePrice, snap);
}

export function sumLivePositionProfit(positions: readonly LivePnlPosition[]) {
  return positions.reduce((sum, position) => sum + computeLivePositionProfit(position), 0);
}

export type CloseAllLiveStat = { count: number; profit: number };

export function buildCloseAllLiveStats(
  positions: readonly LivePnlPosition[],
): Record<string, CloseAllLiveStat> {
  const baseStats: Record<string, CloseAllLiveStat> = {
    all: { count: 0, profit: 0 },
    profitable: { count: 0, profit: 0 },
    losing: { count: 0, profit: 0 },
    buy: { count: 0, profit: 0 },
    sell: { count: 0, profit: 0 },
  };
  const symbolStats: Record<string, CloseAllLiveStat> = {};

  for (const pos of positions) {
    const profit = computeLivePositionProfit(pos);

    baseStats.all.count += 1;
    baseStats.all.profit += profit;

    if (profit >= 0) {
      baseStats.profitable.count += 1;
      baseStats.profitable.profit += profit;
    } else {
      baseStats.losing.count += 1;
      baseStats.losing.profit += profit;
    }

    if (pos.type === 'buy') {
      baseStats.buy.count += 1;
      baseStats.buy.profit += profit;
    } else if (pos.type === 'sell') {
      baseStats.sell.count += 1;
      baseStats.sell.profit += profit;
    }

    if (!symbolStats[pos.symbol]) {
      symbolStats[pos.symbol] = { count: 0, profit: 0 };
    }
    symbolStats[pos.symbol].count += 1;
    symbolStats[pos.symbol].profit += profit;
  }

  return {
    ...baseStats,
    ...Object.fromEntries(
      Object.entries(symbolStats).map(([symbol, stat]) => [`symbol-${symbol}`, stat]),
    ),
  };
}

export function deriveLiveAccountMetrics(
  account: {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    marginLevel: number;
  },
  positions: readonly LivePnlPosition[],
) {
  if (positions.length === 0) {
    return {
      equity: account.equity,
      freeMargin: account.freeMargin,
      marginLevel: account.marginLevel,
      totalProfit: account.equity - account.balance,
    };
  }

  const totalProfit = sumLivePositionProfit(positions);
  const equity = account.balance + totalProfit;
  const freeMargin = equity - account.margin;
  const marginLevel = account.margin > 0 ? (equity / account.margin) * 100 : 0;

  return { equity, freeMargin, marginLevel, totalProfit };
}
