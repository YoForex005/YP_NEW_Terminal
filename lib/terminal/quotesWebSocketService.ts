// Deprecated legacy Socket.IO quote service.
// Canonical terminal realtime must use WebSocketTradingClient + WS_ROUTES.MARKET.
// This module is retained only for old standalone integrations and is disabled
// unless NEXT_PUBLIC_ENABLE_LEGACY_QUOTES_SOCKET_IO is explicitly set to "true".
import { io, Socket } from 'socket.io-client';
import { shouldAllowSyntheticMarketData } from '@/lib/terminal/synthetic-data';

const ENABLE_LEGACY_QUOTES_SOCKET_IO =
    process.env.NEXT_PUBLIC_ENABLE_LEGACY_QUOTES_SOCKET_IO === 'true';

const MT5_WS_BASE_URL =
    process.env.NEXT_PUBLIC_MT5_WS_URL ||
    process.env.NEXT_PUBLIC_WS_URL ||
    '/ws';

type QuoteCallback = (symbol: string, bid: number, ask: number, timestamp: number) => void;

class QuotesWebSocketService {
    private socket: Socket | null = null;
    private sessionId: string | null = null;
    private subscribers: Set<QuoteCallback> = new Set();

    // Dev-only local simulation fallback when the live backend is unreachable.
    private localSimulationInterval: NodeJS.Timeout | null = null;
    private connectionFailed = false;

    public connect(sessionId: string) {
        if (!ENABLE_LEGACY_QUOTES_SOCKET_IO) {
            console.warn(
                '[QuotesWS] Legacy Socket.IO quotes service is disabled. Use WebSocketTradingClient with WS_ROUTES.MARKET for canonical realtime quotes.',
            );
            return;
        }

        if (this.socket?.connected) {
            return;
        }

        this.sessionId = sessionId;
        console.log('[QuotesWS] Connecting to:', MT5_WS_BASE_URL);

        this.socket = io(MT5_WS_BASE_URL, {
            transports: ['websocket', 'polling'],
            query: { sessionId },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
            console.log('[QuotesWS] Connected ✓');
            this.connectionFailed = false;
            // Stop local simulation if we got a real connection
            if (this.localSimulationInterval) {
                clearInterval(this.localSimulationInterval);
                this.localSimulationInterval = null;
            }
        });

        // ── Live tick data → quotes subscribers ──────────────────────────
        this.socket.on('tick', (payload: {
            symbol: string; bid: number; ask: number; last?: number; volume?: number; time?: string;
        }) => {
            try {
                if (payload?.symbol && payload.bid && payload.ask) {
                    const ts = payload.time ? new Date(payload.time).getTime() : Date.now();
                    this.notifySubscribers(payload.symbol, payload.bid, payload.ask, ts);
                }
            } catch (err) {
                console.error('[QuotesWS] tick parse error:', err);
            }
        });

        this.socket.on('disconnect', (reason) => {
            console.warn(`[QuotesWS] Disconnected (${reason})`);
        });

        this.socket.on('connect_error', (error) => {
            console.error('[QuotesWS] Connection error:', error.message);
        });

        // ── Fallback simulation after all reconnect attempts fail ─────────
        this.socket.on('reconnect_failed', () => {
            if (!shouldAllowSyntheticMarketData()) {
                console.warn('[QuotesWS] All reconnect attempts failed. Synthetic quote fallback is disabled.');
                return;
            }

            console.warn('[QuotesWS] All reconnect attempts failed. Starting explicit synthetic quote fallback...');
            this.connectionFailed = true;
            this.startLocalSimulationFallback();
        });
    }

    private startLocalSimulationFallback() {
        if (
            this.localSimulationInterval ||
            !this.connectionFailed ||
            this.socket?.connected ||
            !shouldAllowSyntheticMarketData()
        ) return;

        // Realistic baseline prices matching actual current market
        const baseline: Record<string, { bid: number; ask: number; volatility: number }> = {
            'XAU/USD':  { bid: 4919.00, ask: 4919.50, volatility: 0.30 },
            'XAUUSD':   { bid: 4919.00, ask: 4919.50, volatility: 0.30 },
            'BTC':      { bid: 60000.00, ask: 60020.00, volatility: 15.0 },
            'BTCUSD':   { bid: 60000.00, ask: 60020.00, volatility: 15.0 },
            'AAPL':     { bid: 175.20, ask: 175.25, volatility: 0.10 },
            'EUR/USD':  { bid: 1.08500, ask: 1.08510, volatility: 0.00008 },
            'EURUSD':   { bid: 1.08500, ask: 1.08510, volatility: 0.00008 },
            'GBP/USD':  { bid: 1.26500, ask: 1.26515, volatility: 0.00010 },
            'GBPUSD':   { bid: 1.26500, ask: 1.26515, volatility: 0.00010 },
            'USD/JPY':  { bid: 151.200, ask: 151.215, volatility: 0.015 },
            'USDJPY':   { bid: 151.200, ask: 151.215, volatility: 0.015 },
        };

        this.localSimulationInterval = setInterval(() => {
            const symbols = Object.keys(baseline);
            // Update 2–4 random pairs per tick cycle (~300ms)
            const numUpdates = Math.floor(Math.random() * 3) + 2;

            for (let i = 0; i < numUpdates; i++) {
                const symbol = symbols[Math.floor(Math.random() * symbols.length)];
                const data = baseline[symbol];

                const direction = Math.random() > 0.5 ? 1 : -1;
                const change = direction * Math.random() * data.volatility;
                data.bid += change;
                data.ask += change;

                // Keep spread positive
                if (data.ask - data.bid < data.volatility * 0.2) {
                    data.ask = data.bid + data.volatility * 0.5;
                }

                const decimals = data.bid > 100 ? 2 : data.bid > 10 ? 3 : 5;
                const bid = parseFloat(data.bid.toFixed(decimals));
                const ask = parseFloat(data.ask.toFixed(decimals));

                this.notifySubscribers(symbol, bid, ask, Date.now());
            }
        }, 300);
    }

    public subscribe(callback: QuoteCallback): () => void {
        this.subscribers.add(callback);
        return () => {
            this.subscribers.delete(callback);
        };
    }

    private notifySubscribers(symbol: string, bid: number, ask: number, timestamp: number) {
        this.subscribers.forEach(cb => cb(symbol, bid, ask, timestamp));
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        if (this.localSimulationInterval) {
            clearInterval(this.localSimulationInterval);
            this.localSimulationInterval = null;
        }
        this.sessionId = null;
        this.subscribers.clear();
    }
}

// Export a singleton instance
export const quotesService = new QuotesWebSocketService();
