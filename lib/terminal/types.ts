export interface Instrument {
    symbol: string;
    name: string;
    category: string;
    bid: number;
    ask: number;
    change: number;
    changePercent: number;
    high: number;
    low: number;
    spread: number;
    digits: number;
    pipSize: number;
    contractSize: number;
    isUp?: boolean;
    isDown?: boolean;
    icon: string;
    prevBid?: number;
    priceHistory: number[];
    tradeMode?: string;
}

export interface Position {
    accountId?: string;
    accountLogin?: number;
    login?: number;
    id: string;
    ticket: string;
    symbol: string;
    type: 'buy' | 'sell';
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    swap: number;
    commission: number;
    openTime: string;
    sl: number | null;
    tp: number | null;
    digits?: number;
    contractSize?: number;
}

export interface ClosedTrade {
    id: string;
    symbol: string;
    type: 'buy' | 'sell';
    volume: number;
    openPrice: number;
    closePrice: number;
    profit: number;
    openTime: string;
    closeTime: string;
}

export interface PriceAlert {
    id: string;
    symbol: string;
    condition: 'crosses' | 'greater_than' | 'less_than';
    price: number;
    active: boolean;
    createdAt: string;
}

export interface AccountInfo {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    marginLevel: number;
    profit: number;
    currency: string;
}

export interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}
