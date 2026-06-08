/**
 * Trading REST API Client
 * Handles HTTP communication with trading endpoints
 */

import { API_ENDPOINTS } from './constants';
import {
  Mt5Credentials,
  TradingAccountInfo,
  SymbolInfo,
  Order,
  Position,
  TradeRequest,
  TradeResult,
  Deal,
} from '@/types/webtrader';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

interface TradingRequestOptions {
  accountId?: string;
  force?: boolean;
  refresh?: boolean;
  live?: boolean;
  reconcile?: boolean;
  limit?: number;
  maxRows?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractArrayField = <T>(payload: unknown, fields: string[]): T[] => {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const field of fields) {
    const direct = payload[field];
    if (Array.isArray(direct)) {
      return direct as T[];
    }
  }

  const data = payload.data;
  if (Array.isArray(data)) {
    return data as T[];
  }
  if (isRecord(data)) {
    for (const field of fields) {
      const nested = data[field];
      if (Array.isArray(nested)) {
        return nested as T[];
      }
    }
  }

  return [];
};

const extractTradeResult = (payload: unknown): TradeResult => {
  if (isRecord(payload)) {
    const result = payload.result;
    if (isRecord(result)) {
      return result as unknown as TradeResult;
    }

    const data = payload.data;
    if (isRecord(data)) {
      if (isRecord(data.result)) {
        return data.result as unknown as TradeResult;
      }
      if (typeof data.retcode === 'number') {
        return data as unknown as TradeResult;
      }
    }

    if (typeof payload.retcode === 'number') {
      return payload as unknown as TradeResult;
    }
  }

  return payload as TradeResult;
};

interface AuthResponse {
  session: {
    id: string;
    login: number;
    server: string;
    name: string;
    company: string;
    currency: string;
    leverage: number;
  };
  token: string;
}

/**
 * Trading API Client
 * REST API wrapper for trading operations
 */
class TradingApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    // Keep browser calls on the current Next.js origin so the app only exposes one HTTP port.
    this.baseUrl = '';
  }

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Clear authentication token
   */
  clearToken(): void {
    this.token = null;
  }

  /**
   * Get request headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Make API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    extract?: (payload: unknown) => T,
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        cache: 'no-store',
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        if (response.status === 401) {
          // Unauthorized - clear token
          this.clearToken();
        }
        const errorMessage =
          isRecord(payload) && typeof payload.error === 'string'
            ? payload.error
            : response.statusText;
        throw Object.assign(new Error(`HTTP ${response.status}: ${errorMessage}`), {
          status: response.status,
        });
      }

      if (isRecord(payload) && payload.success === false) {
        throw new Error(
          typeof payload.error === 'string'
            ? payload.error
            : 'Trading API request failed',
        );
      }

      const data = extract ? extract(payload) : (payload as T);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
        status: typeof (error as { status?: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined,
      };
    }
  }

  private buildUrl(endpoint: string, params: Record<string, unknown> = {}): string {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      if (typeof value === 'boolean') {
        if (value) {
          searchParams.set(key, '1');
        }
        continue;
      }
      searchParams.set(key, String(value));
    }

    const query = searchParams.toString();
    return query ? `${endpoint}?${query}` : endpoint;
  }

  private buildTradingUrl(
    endpoint: string,
    options: TradingRequestOptions = {},
    params: Record<string, unknown> = {},
  ): string {
    return this.buildUrl(endpoint, {
      accountId: options.accountId,
      force: options.force,
      refresh: options.refresh,
      live: options.live,
      reconcile: options.reconcile,
      ...params,
    });
  }

  // ==================== Authentication ====================

  /**
   * Authenticate with MT5 credentials
   */
  async authenticate(credentials: Mt5Credentials): Promise<ApiResponse<AuthResponse>> {
    return this.request<AuthResponse>(API_ENDPOINTS.AUTH_LOGIN, {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  /**
   * Logout and clear session
   */
  async logout(): Promise<ApiResponse<void>> {
    const result = await this.request<void>(API_ENDPOINTS.AUTH_LOGOUT, {
      method: 'POST',
    });
    this.clearToken();
    return result;
  }

  // ==================== Account ====================

  /**
   * Get account information
   */
  async getAccountInfo(): Promise<ApiResponse<TradingAccountInfo>> {
    return this.request<TradingAccountInfo>(API_ENDPOINTS.ACCOUNT_INFO);
  }

  // ==================== Market Data ====================

  /**
   * Get all available symbols
   */
  async getSymbols(): Promise<ApiResponse<SymbolInfo[]>> {
    return this.request<SymbolInfo[]>(API_ENDPOINTS.SYMBOLS);
  }

  /**
   * Get symbol information
   */
  async getSymbolInfo(symbol: string): Promise<ApiResponse<SymbolInfo>> {
    return this.request<SymbolInfo>(`${API_ENDPOINTS.SYMBOL_INFO}/${symbol}`);
  }

  // ==================== Trading ====================

  /**
   * Get open positions
   */
  async getPositions(options: TradingRequestOptions = {}): Promise<ApiResponse<Position[]>> {
    return this.request<Position[]>(
      this.buildTradingUrl(API_ENDPOINTS.POSITIONS, options),
      { method: 'GET' },
      (payload) => extractArrayField<Position>(payload, ['positions']),
    );
  }

  /**
   * Get pending orders
   */
  async getOrders(options: TradingRequestOptions = {}): Promise<ApiResponse<Order[]>> {
    return this.request<Order[]>(
      this.buildTradingUrl(API_ENDPOINTS.ORDERS, options),
      { method: 'GET' },
      (payload) => extractArrayField<Order>(payload, ['orders']),
    );
  }

  /**
   * Place a new order
   */
  async placeOrder(
    request: TradeRequest & { accountId?: string },
    options: TradingRequestOptions = {},
  ): Promise<ApiResponse<TradeResult>> {
    const { accountId, ...body } = request;
    return this.request<TradeResult>(this.buildTradingUrl(API_ENDPOINTS.ORDERS, {
      ...options,
      accountId: options.accountId ?? accountId,
    }), {
      method: 'POST',
      body: JSON.stringify(body),
    }, extractTradeResult);
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(
    ticket: number,
    params: { sl?: number; tp?: number; price?: number },
    options: TradingRequestOptions = {},
  ): Promise<ApiResponse<TradeResult>> {
    return this.request<TradeResult>(this.buildTradingUrl(API_ENDPOINTS.ORDERS, options), {
      method: 'PATCH',
      body: JSON.stringify({ ticket, ...params }),
    }, extractTradeResult);
  }

  /**
   * Cancel a pending order
   */
  async cancelOrder(
    ticket: number,
    options: TradingRequestOptions = {},
  ): Promise<ApiResponse<TradeResult>> {
    return this.request<TradeResult>(this.buildTradingUrl(
      API_ENDPOINTS.ORDERS,
      options,
      { ticket },
    ), {
      method: 'DELETE',
    }, extractTradeResult);
  }

  /**
   * Close a position
   */
  async closePosition(
    ticket: number,
    volume?: number,
    options: TradingRequestOptions = {},
  ): Promise<ApiResponse<TradeResult>> {
    return this.request<TradeResult>(this.buildTradingUrl(
      API_ENDPOINTS.POSITIONS,
      options,
      { ticket, ...(volume !== undefined ? { volume } : {}) },
    ), {
      method: 'DELETE',
    }, extractTradeResult);
  }

  // ==================== History ====================

  /**
   * Get trade history
   */
  async getTradeHistory(
    from: Date,
    to: Date,
    options: TradingRequestOptions = {},
  ): Promise<ApiResponse<Deal[]>> {
    const params: Record<string, unknown> = {
      from: from.toISOString(),
      to: to.toISOString(),
      ...(options.limit !== undefined ? { limit: options.limit } : {}),
      ...(options.maxRows !== undefined ? { maxRows: options.maxRows } : {}),
    };
    return this.request<Deal[]>(
      this.buildTradingUrl(API_ENDPOINTS.ACCOUNT_HISTORY, options, params),
      { method: 'GET' },
      (payload) => extractArrayField<Deal>(payload, ['history', 'deals', 'trades']),
    );
  }
}

// Export singleton instance
export const tradingApi = new TradingApiClient();
export default TradingApiClient;
