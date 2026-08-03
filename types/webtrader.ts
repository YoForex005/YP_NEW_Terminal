/**
 * WebTrader Type Definitions
 * Complete TypeScript types for MT5 WebTrader functionality
 */

// ============================================================================
// Trading Session Types
// ============================================================================

export type TradingConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

export interface TradingSession {
  id: string;
  login: number;
  server: string;
  group?: string;
  name: string;
  company: string;
  currency: string;
  leverage: number;
  status: TradingConnectionStatus;
  connectedAt?: Date;
  lastPingAt?: Date;
}

export interface Mt5Credentials {
  login: number;
  password: string;
  server: string;
}

// ============================================================================
// Symbol/Market Watch Types
// ============================================================================

export type SymbolTradeMode =
  | 'disabled'      // Trade disabled
  | 'longonly'      // Only long positions
  | 'shortonly'     // Only short positions
  | 'closeonly'     // Only position close
  | 'full';         // All trade operations

export type SymbolCalcMode =
  | 'forex'         // Forex
  | 'futures'       // Futures
  | 'cfd'           // CFD
  | 'cfdindex'      // CFD Index
  | 'cfdleverage';  // CFD Leverage

export interface SymbolInfo {
  name: string;
  description: string;
  baseCurrency: string;
  quoteCurrency: string;
  digits: number;
  point: number;
  tickSize: number;
  tickValue: number;
  tradeContractSize: number;
  tradeMode: SymbolTradeMode;
  calcMode: SymbolCalcMode;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  marginInitial: number;
  marginMaintenance: number;
  swapLong: number;
  swapShort: number;
  sessionOpen?: string[];
  sessionClose?: string[];
  isFavorite?: boolean;
  category?: string;
}

export interface PriceTick {
  symbol: string;
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  time: Date;
  mt5_time_msc?: number;
  mt5TimeMsc?: number;
  mt5_time?: number;
  mt5Time?: number;
  server_time_msc?: number;
  serverTimeMsc?: number;
  server_received_msc?: number;
  serverReceivedMsc?: number;
  spread?: number;
  receivedAtMs?: number;
  receivedSequence?: number;
  // For UI
  bidDirection?: 'up' | 'down' | 'same';
  askDirection?: 'up' | 'down' | 'same';
}

export interface QuoteStatus {
  symbol?: string;
  state: string;
  ready: boolean;
  message?: string;
  engineAvailable?: boolean;
  seededCount?: number;
  seedPending?: boolean;
  updatedAt: Date;
  raw?: unknown;
}

export interface MarketDepthItem {
  price: number;
  volume: number;
  type: 'bid' | 'ask';
}

export interface MarketDepth {
  symbol: string;
  bids: MarketDepthItem[];
  asks: MarketDepthItem[];
}

// ============================================================================
// Order Types
// ============================================================================

export type OrderType =
  | 'buy'           // Market Buy
  | 'sell'          // Market Sell
  | 'buy_limit'     // Buy Limit
  | 'sell_limit'    // Sell Limit
  | 'buy_stop'      // Buy Stop
  | 'sell_stop'     // Sell Stop
  | 'buy_stop_limit'    // Buy Stop Limit
  | 'sell_stop_limit';  // Sell Stop Limit

export type OrderState =
  | 'started'
  | 'placing'
  | 'placed'
  | 'modifying'
  | 'modified'
  | 'cancelling'
  | 'cancelled'
  | 'filling'
  | 'filled'
  | 'rejected';

export type OrderFillingMode =
  | 'ioc'           // Immediate or Cancel
  | 'return'        // Return remaining
  | 'fok';          // Fill or Kill

export interface Order {
  ticket: number;
  symbol: string;
  type: OrderType;
  state: OrderState;
  volume: number;
  volumeCurrent: number;
  openPrice: number;
  priceCurrent: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
  comment?: string;
  externalId?: string;
  openTime: Date;
  closeTime?: Date;
  expiration?: Date;
  fillingMode: OrderFillingMode;
  magic?: number;
}

export interface PendingOrder extends Order {
  type: 'buy_limit' | 'sell_limit' | 'buy_stop' | 'sell_stop' | 'buy_stop_limit' | 'sell_stop_limit';
}

// ============================================================================
// Position Types
// ============================================================================

export type PositionType = 'buy' | 'sell';

export interface Position {
  accountId?: string;
  accountLogin?: number;
  login?: number;
  ticket: number;
  symbol: string;
  type: PositionType;
  volume: number;
  openPrice: number;
  priceCurrent: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  commission: number;
  comment?: string;
  externalId?: string;
  openTime: Date;
  magic?: number;
  // Calculated fields
  priceChange?: number;
  priceChangePercent?: number;
}

export interface PositionHistory extends Position {
  closePrice: number;
  closeTime: Date;
}

// ============================================================================
// Deal Types
// ============================================================================

export type DealType =
  | 'buy'
  | 'sell'
  | 'balance'
  | 'credit'
  | 'charge'
  | 'correction'
  | 'bonus'
  | 'commission'
  | 'dailycommission'
  | 'monthlycommission'
  | 'dailyagentcommission'
  | 'monthlyagentcommission'
  | 'interestrate'
  | 'buycancellation'
  | 'sellcancellation'
  | 'dividend'
  | 'dividendfranking'
  | 'tax';

export type DealEntry = 'in' | 'out' | 'inout' | 'outby';

export interface Deal {
  ticket: number;
  orderTicket: number;
  symbol: string;
  type: DealType;
  entry: DealEntry;
  volume: number;
  price: number;
  commission: number;
  swap: number;
  profit: number;
  fee?: number;
  sl?: number;
  tp?: number;
  comment?: string;
  externalId?: string;
  time: Date;
  magic?: number;
}

// ============================================================================
// Account Trading Info
// ============================================================================

export interface TradingAccountInfo {
  login: number;
  name: string;
  server: string;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  marginFree: number;
  marginLevel: number;
  marginInitial: number;
  marginMaintenance: number;
  profit: number;
  swap: number;
  commission: number;
  credit: number;
  limitOrders: number;
  // Calculated
  availableMargin: number;
}

// ============================================================================
// Trading Request Types
// ============================================================================

export interface TradeRequest {
  /** Frontend correlation/idempotency key for one placement attempt. */
  clientRequestId?: string;
  symbol: string;
  type: OrderType;
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  deviation?: number;
  fillingMode?: OrderFillingMode;
  comment?: string;
  magic?: number;
  expiration?: Date;
  typeTime?: 'gtc' | 'day' | 'specified';
}

export interface ModifyOrderRequest {
  ticket: number;
  price?: number;
  sl?: number;
  tp?: number;
  expiration?: Date;
}

export interface ClosePositionRequest {
  ticket: number;
  volume?: number;  // For partial close
  deviation?: number;
}

export interface CancelOrderRequest {
  ticket: number;
}

// ============================================================================
// Trading Response Types
// ============================================================================

export interface TradeResult {
  retcode: number;
  deal?: number;
  order?: number;
  volume: number;
  price: number;
  bid?: number;
  ask?: number;
  comment?: string;
  requestId?: number;
  retcodeExternal?: number;
  pending?: boolean;
  outcomeUnknown?: boolean;
  duplicateRetryBlocked?: boolean;
  retryAfterMs?: number;
}

export type TradeRetCode =
  | 10004   // Requote
  | 10006   // Request rejected
  | 10007   // Request canceled by trader
  | 10008   // Order placed
  | 10009   // Request completed
  | 10010   // Only part of the request was completed
  | 10011   // Request processing error
  | 10012   // Request timed out
  | 10013   // Invalid request
  | 10014   // Invalid volume in request
  | 10015   // Invalid price in request
  | 10016   // Invalid stops in request
  | 10017   // Trade not allowed
  | 10018   // Market closed
  | 10019   // No money to complete the request
  | 10020   // Price changed
  | 10021   // No quotes to process the request
  | 10022   // Invalid order expiration in request
  | 10023   // Order state changed
  | 10024   // Too frequent requests
  | 10025   // No changes in request
  | 10026   // Autotrading disabled by server
  | 10027   // Autotrading disabled by client terminal
  | 10028   // Request locked for processing
  | 10029   // Order or position frozen
  | 10030   // Invalid fill type
  | 10031   // No connection with trade server
  | 10032   // Operation allowed only for live accounts
  | 10033   // The maximum number of pending orders has been reached
  | 10034   // The maximum order volume is reached
  | 10035   // Processing of the request is disabled
  | 10036;  // The maximum depth of the symbol market is reached

// ============================================================================
// WebSocket Message Types
// ============================================================================

export type WebSocketMessageType =
  // Client -> Server
  | 'auth'
  | 'subscribe_symbols'
  | 'unsubscribe_symbols'
  | 'place_order'
  | 'modify_order'
  | 'cancel_order'
  | 'close_position'
  | 'request_account_info'
  | 'request_history'
  | 'ping'
  // Server -> Client
  | 'authenticated'
  | 'auth_error'
  | 'PRICE_UPDATE'
  | 'POSITION_UPDATE'
  | 'BALANCE_UPDATE'
  | 'SYMBOL_LIST'
  | 'price_update'
  | 'balance_update'
  | 'symbol_list'
  | 'symbols'
  | 'symbols_update'
  | 'market_symbols'
  | 'symbol_catalog'
  | 'tick'
  | 'order_update'
  | 'position_update'
  | 'account_update'
  | 'trade_result'
  | 'error'
  | 'pong'
  | 'connection_status';

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  payload: T;
  timestamp: number;
  id?: string;
}

export interface TickPayload {
  symbol: string;
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  time: string;
}

export interface OrderUpdatePayload {
  order: Order;
  action: 'added' | 'modified' | 'deleted';
}

export interface PositionUpdatePayload {
  position: Position;
  action: 'added' | 'modified' | 'deleted';
}

export interface AccountUpdatePayload {
  account: TradingAccountInfo;
}

export interface TradeResultPayload {
  result: TradeResult;
  requestId: string;
  action?: string;
  request?: unknown;
  clientTiming?: {
    clientSentAtMs: number;
    clientAckReceivedAtMs: number;
    roundTripMs: number;
  };
}

export interface TerminalBootstrapState {
  accountInfo: TradingAccountInfo | null;
  symbols: SymbolInfo[];
  positions: Position[];
  orders: Order[];
  degraded?: boolean;
  message?: string;
  error?: string;
  warnings?: unknown;
  deferred?: string[];
}

// ============================================================================
// Chart Types
// ============================================================================

export type Timeframe =
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M10' | 'M12' | 'M15' | 'M20' | 'M30'
  | 'H1' | 'H2' | 'H3' | 'H4' | 'H6' | 'H8' | 'H12'
  | 'D1' | 'W1' | 'MN1';

export type ChartType = 'candlestick' | 'bar' | 'line' | 'area';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ============================================================================
// WebTrader UI State
// ============================================================================

export interface WebtraderUIState {
  // Selected symbol and timeframe for chart
  selectedSymbol: string | null;
  selectedTimeframe: Timeframe;
  chartType: ChartType;

  // Panel visibility
  showMarketWatch: boolean;
  showTradingPanel: boolean;
  showAccountInfo: boolean;

  // Order form state
  orderForm: {
    type: OrderType;
    volume: number;
    sl: number | null;
    tp: number | null;
    useDeviation: boolean;
    deviation: number;
    fillingMode: OrderFillingMode;
  };

  // Active tab in bottom panel
  activeBottomTab: 'positions' | 'orders' | 'history';

  // Filter states
  symbolFilter: string;
  historyDateRange: {
    from: Date | null;
    to: Date | null;
  };
}

// ============================================================================
// Server Configuration
// ============================================================================

export interface TradingServer {
  id: string;
  name: string;
  host: string;
  port: number;
  isSecure: boolean;
  region?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export interface TradingError {
  code: string;
  message: string;
  retcode?: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// Trade History Filter
// ============================================================================

export interface TradeHistoryFilter {
  from?: Date;
  to?: Date;
  symbol?: string;
  type?: DealType;
  magic?: number;
}
