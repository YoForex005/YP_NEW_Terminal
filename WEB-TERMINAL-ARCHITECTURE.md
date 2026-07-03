# YoPips Web Terminal Architecture

This document explains how the YoPips web terminal loads, connects to live data, stores terminal state, and renders the trading chart. It is focused on the frontend architecture and the WebSocket data flow used by the terminal UI.

## High-Level Flow

```text
YoPips Client Dashboard
        |
        | create terminal launch session
        v
Terminal launch URL with launch code
        |
        v
Next.js terminal page
        |
        | exchange launch code or auto-connect account
        v
Terminal session + WebSocket credentials
        |
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
Feed WebSocket           Trade WebSocket          REST bootstrap
quotes + chart data      account + orders         dashboard snapshot
        |                      |                      |
        +----------+-----------+----------+-----------+
                   |
                   v
        Zustand terminal store + OHLC service
                   |
        +----------+-----------+----------+
        |                      |          |
        v                      v          v
Instruments panel        Trading chart   Orders, positions, account UI
```

The terminal is a Next.js app. The main terminal experience is mounted from `app/terminal/page.tsx`. That page coordinates account/session resolution, terminal connection state, cached launch data, and the major terminal panels.

## Main Frontend Layers

| Layer | Main files | Responsibility |
| --- | --- | --- |
| App shell | `app/layout.tsx` | Wraps the app with providers such as theme, auth, page loader, and global layout. |
| Terminal page | `app/terminal/page.tsx` | Main terminal route. Resolves the active account, restores launch cache, starts connection hooks, hydrates dashboard snapshot, and renders terminal layout. |
| Launch-code session | `lib/terminal/use-terminal-launch-session.ts` | Reads `#launch=...`, exchanges it for terminal credentials, connects ticket-based realtime clients, and restores stored terminal sessions. |
| Legacy auto-connect | `lib/trading/use-auto-connect.ts` | Uses account id to request a server-managed terminal session and connects the older WebSocket trading client path. |
| Ticket client | `lib/terminal/ticket-terminal-client.ts` | Creates/exchanges launch sessions, refreshes WebSocket tickets, and manages feed/trade WebSocket connections for the launch-code flow. |
| Terminal store | `store/webtrader-store.ts` | Central Zustand store for live terminal state, persisted preferences, account info, symbols, positions, orders, prices, and WebSocket clients. |
| OHLC service | `lib/terminal/ohlcWebSocketService.ts` | Manages chart history, live OHLC subscriptions, cache, backfill, and session-scoped chart data. |
| Chart container | `components/terminal/KlineChartContainer.tsx` | Creates and updates the Lightweight Charts instance. Handles chart series, history, live bars, overlays, and chart interactions. |
| Terminal chart shell | `components/terminal/TradingChart.tsx` | Dynamically mounts chart panes, quote actions, chart toolbar, and multi-pane layout. |
| Instruments UI | `components/terminal/InstrumentsPanel.tsx` | Shows watchlist/instrument rows and updates bid/ask/signal directly from live price subscriptions. |

## Terminal Entry Modes

The terminal currently supports two connection paths.

### 1. Launch-Code Flow

This is the preferred flow when opening the terminal from the YoPips client dashboard.

1. The client dashboard calls the terminal session API.
2. The backend returns a terminal launch URL containing a short-lived launch code.
3. The terminal opens with `#launch=...` in the URL.
4. `useTerminalLaunchSession()` reads the launch code.
5. The hook exchanges the code through `POST /api/terminal/sessions/exchange`.
6. The exchange returns:
   - `terminal_token`
   - `feed_ticket`
   - `trade_ticket`
   - `account_context`
7. The terminal stores the session in browser session storage.
8. The launch hash is removed from the URL.
9. `TerminalTicketRealtimeClient` connects the feed and trade WebSockets.
10. The terminal subscribes to default symbols and becomes ready.

Important frontend files:

- `lib/terminal/use-terminal-launch-session.ts`
- `lib/terminal/ticket-terminal-client.ts`
- `app/terminal/page.tsx`

### 2. Account Auto-Connect Flow

This is the older/internal path used when the terminal already has an account id.

1. `app/terminal/page.tsx` resolves the active account id.
2. `useAutoConnectTrading()` requests a terminal session from:
   - `GET /api/private/accounts/:accountId/terminal-session`
3. The route authenticates the user and resolves the account.
4. The frontend receives a webtrader token/session.
5. The WebSocket trading client connects.
6. The hook bootstraps account info, symbols, positions, orders, and market subscriptions.

Important frontend/backend files:

- `lib/trading/use-auto-connect.ts`
- `app/api/private/accounts/[accountId]/terminal-session/route.ts`
- `store/webtrader-store.ts`

## WebSocket Channels

The launch-code flow separates live data into two WebSocket channels.

### Feed WebSocket

The feed socket is used for market data and chart data.

Typical data:

| Data | Meaning | Main consumers |
| --- | --- | --- |
| Quote ticks | Live bid/ask for subscribed symbols | Instruments panel, header price, top chart quote buttons, order panel, live PnL inputs |
| Quote status or quote gap | Symbol feed health, stale/missing quote warnings | Market status UI, quote status store |
| Chart history | Historical OHLC bars for a symbol/timeframe | `ohlcWebSocketService`, `KlineChartContainer` |
| Live OHLC bars | Current candle/bar updates | Trading chart |
| Heartbeat/ping | Connection health | Realtime client connection state |

Frontend flow:

```text
Feed WebSocket
        |
        v
Terminal realtime client
        |
        +--> store.updatePrice(...)
        |       |
        |       +--> direct live price listeners
        |       +--> batched Zustand price state
        |
        +--> ohlcWebSocketService receives history/live bars
                |
                +--> chart cache
                +--> chart subscribers
```

### Trade WebSocket

The trade socket is used for account state and trading commands.

Typical data:

| Data | Meaning | Main consumers |
| --- | --- | --- |
| Connected/session event | Confirms terminal session and account context | Terminal connection state, account scope |
| Account summary | Canonical full account state: balance, equity, margin, positions, orders, totals | Account header, positions table, order state, dashboard state |
| Position updates | Open position lifecycle and PnL related state | Positions table, chart position overlays |
| Order updates | Pending orders and order lifecycle state | Orders table, order panel |
| Command result/error | Result of trade actions | Order flow, notifications, error UI |
| Resume/outbox replay | Restores missed events after reconnect | Store reconciliation after reconnect |

Frontend flow:

```text
Trade WebSocket
        |
        v
Terminal realtime client
        |
        +--> account summary handler
        |       |
        |       +--> store.accountInfo
        |       +--> store.positions
        |       +--> store.orders
        |
        +--> trade command result handler
                |
                +--> order panel state
                +--> notifications/errors
```

## REST Bootstrap And Session APIs

The terminal does not rely only on WebSockets. It also uses REST calls for session creation, exchange, fallback bootstrap, and cached dashboard data.

| API | Purpose | Used by |
| --- | --- | --- |
| `POST /api/terminal/sessions` | Creates a terminal launch session and returns a launch URL/code | YoPips client dashboard |
| `POST /api/terminal/sessions/exchange` | Exchanges launch code for terminal token and WebSocket tickets | `useTerminalLaunchSession()` |
| Ticket refresh API | Refreshes feed/trade tickets using the terminal token | `TerminalTicketRealtimeClient` |
| `GET /api/private/accounts/:accountId/terminal-session` | Creates or returns an account-scoped terminal session | `useAutoConnectTrading()` |
| `GET /api/private/dashboard/snapshot` | Hydrates dashboard/account snapshot in the terminal | `app/terminal/page.tsx` |

## Central Store Model

`store/webtrader-store.ts` is the shared runtime model for the terminal. It contains two kinds of data:

1. Persisted preferences such as selected symbol, chart settings, watchlists, and layout choices.
2. Live runtime state such as session, account info, symbols, positions, orders, prices, and WebSocket clients.

Important store data:

| Store state | Source | Used by |
| --- | --- | --- |
| `session` | Launch exchange or auto-connect | Account scoping, reconnect logic, OHLC session scope |
| `accountInfo` | Trade WebSocket account summary or bootstrap | Header/account UI, margin/equity display, order validation |
| `symbols` | Bootstrap/session data | Instruments list, search, watchlists, order panel |
| `positions` | Trade WebSocket account summary or bootstrap | Positions table, selected symbol positions, chart overlays |
| `orders` | Trade WebSocket account summary or bootstrap | Orders table, order lifecycle UI |
| `prices` | Feed WebSocket quote ticks | Header price, instruments rows, chart quote actions, order panel |
| `quoteStatuses` | Feed WebSocket status/gap events | Feed health UI and warnings |
| WebSocket clients | Launch hook or auto-connect hook | Market subscriptions, OHLC subscriptions, trade commands |

Price updates are optimized in two ways:

1. Direct live price listeners update high-frequency UI without forcing the whole Zustand store to re-render on every tick.
2. Batched price updates still keep the central store current for components that need store-level state.

This is why components such as `InstrumentsPanel` and chart quote actions use symbol-specific subscriptions instead of reading the entire price map on every render.

## Where WebSocket Data Is Used

| WebSocket data | First frontend landing point | UI usage |
| --- | --- | --- |
| Quote tick for symbol | Realtime client, then `store.updatePrice(...)` | Instruments bid/ask, symbol signal, header quote, chart top buy/sell buttons, order price helpers |
| Quote status/gap | Realtime client, then quote status state | Feed health indicators and stale quote handling |
| OHLC history | `ohlcWebSocketService` | Initial chart candles/bars/line data |
| Live OHLC update | `ohlcWebSocketService.subscribe(...)` callback | Active candle/bar update on the chart |
| Account summary | Trade WebSocket account summary handler | Account metrics, positions, orders, margin/equity state |
| Positions | Account summary/bootstrap | Positions table and chart position lines |
| Orders | Account summary/bootstrap | Orders table and order lifecycle state |
| Trade command response | Trade WebSocket result/error handler | Order submission feedback and error display |

## How The Chart Is Created

The chart is built with `lightweight-charts`.

Main files:

- `components/terminal/TradingChart.tsx`
- `components/terminal/KlineChartContainer.tsx`
- `lib/terminal/ohlcWebSocketService.ts`
- `store/webtrader-store.ts`

Chart creation flow:

1. `app/terminal/page.tsx` renders `TradingChart`.
2. `TradingChart.tsx` dynamically imports the chart implementation with server-side rendering disabled.
3. The chart pane is mounted through a scheduled runtime mount so the heavy chart work can happen after the surrounding terminal layout is ready.
4. `KlineChartContainer.tsx` receives the active symbol, timeframe, chart type, session scope, base price, and position data.
5. A layout effect creates the Lightweight Charts instance with `createChart(...)`.
6. The component creates the main series based on the selected chart type:
   - Candlestick series
   - Bar series
   - Line/area-style series depending on configured chart mode
7. The component also creates a volume histogram series when volume data is available.
8. Chart options, price scale settings, crosshair behavior, range handlers, overlays, and live price markers are attached.
9. Before waiting for network history, the chart checks `ohlcWebSocketService.getSyncBars(...)` for cached bars so it can render quickly if data already exists.
10. The chart requests history through `ohlcWebSocketService.getHistory(...)`.
11. History bars are normalized into Lightweight Charts data format.
12. The main series is populated with `setData(...)`.
13. The volume series is populated with volume data.
14. The latest OHLC close can seed the price store through the chart data path.
15. The chart subscribes to live OHLC updates with `ohlcWebSocketService.subscribe(...)`.
16. Each live bar updates the chart series with `update(...)` when possible.
17. If a gap, correction, timeframe change, or backfill requires a full rebuild, the chart reloads/reapplies history.

Simplified chart data path:

```text
Feed WebSocket chart messages
        |
        v
ohlcWebSocketService
        |
        +--> cache historical bars by session/symbol/timeframe
        +--> serve sync cached bars to chart
        +--> fetch/request history when cache is missing
        +--> notify live bar subscribers
        |
        v
KlineChartContainer
        |
        +--> create Lightweight Chart
        +--> setData(history)
        +--> update(live bar)
        +--> render overlays and position lines
```

## Instrument Panel Live Updates

The instruments panel is sensitive to high-frequency price ticks. The relevant file is `components/terminal/InstrumentsPanel.tsx`.

Each instrument row subscribes to its own symbol price stream. When a tick arrives:

1. The row receives the latest bid/ask data.
2. Bid and ask values are updated.
3. Direction/signal state is updated.
4. The UI can update the row without requiring the full instruments list to re-render.

This explains why the instruments panel depends heavily on the price subscription model. If chart switching causes the symbol section to freeze, the likely cause is not only the row rendering itself. It can also be caused by heavy synchronous chart setup, history normalization, or store work running on the main thread while the same thread is needed for instrument row updates.

## Startup And Loading Sequence

When switching from the YoPips client to the terminal, the frontend typically does this work:

1. Open the terminal URL.
2. Load the Next.js terminal bundle.
3. Mount app providers.
4. Resolve the launch code or account id.
5. Exchange the launch code or request the account terminal session.
6. Restore cached terminal launch snapshot when available.
7. Connect WebSocket clients.
8. Fetch or hydrate dashboard/account snapshot.
9. Bootstrap symbols, account info, positions, and orders.
10. Subscribe to default market symbols.
11. Mount the terminal layout.
12. Mount the chart runtime.
13. Load cached or remote OHLC history.
14. Start live quote and chart updates.

Frontend loading time can be affected by:

- Large terminal bundles loaded before first render.
- Waiting for launch-code exchange or account session API before the UI becomes usable.
- Running dashboard snapshot hydration during terminal startup.
- Connecting multiple WebSocket lanes at the same time as rendering the chart.
- Heavy chart creation and historical candle normalization on the main thread.
- Store updates that cause broad React re-renders during startup.
- Rebuilding instrument rows when only the active chart symbol changes.

Backend loading time can be affected by:

- Terminal session creation latency.
- Account resolution latency in `app/api/private/accounts/[accountId]/terminal-session/route.ts`.
- Fallback chains that wait for backend snapshot or database timeouts.
- WebSocket ticket creation and exchange latency.
- Slow first account summary or delayed symbol bootstrap.

## Performance Improvement Plan

### Backend Improvements

| Area | Needed change | Expected benefit |
| --- | --- | --- |
| Terminal session creation | Make launch session creation and launch-code exchange consistently low-latency. Cache account context needed for exchange. | Faster transition from client dashboard to terminal. |
| Account resolution | Avoid long fallback chains during terminal startup. Prefer a fast local/session-backed account context. | Reduces waiting before WebSocket connection. |
| First account summary | Send account summary immediately after trade socket connection. | Terminal can render account, positions, and orders sooner. |
| Initial symbols | Return required symbols with session exchange or first socket payload. | Avoids separate bootstrap delay before instruments can render. |
| WebSocket tickets | Return both feed and trade tickets during launch exchange and refresh them in the background. | Avoids extra round trips before connecting realtime lanes. |
| Chart history | Serve compact, cacheable OHLC history keyed by account/session/symbol/timeframe. | Faster initial chart paint and chart switching. |
| Quote snapshot | Send latest bid/ask snapshot for subscribed symbols immediately after feed subscribe. | Instruments panel shows prices without waiting for the next tick. |

### Frontend Improvements

| Area | Needed change | Expected benefit |
| --- | --- | --- |
| Terminal route loading | Split non-critical panels and heavy chart code from the first usable terminal shell. | Faster visible terminal startup. |
| Launch cache | Render cached account/symbol/price data immediately while live session connects. | Removes blank or frozen perception during transition. |
| Chart switching | Keep previous chart visible while new symbol history loads. Avoid clearing and rebuilding everything synchronously. | Symbol switching feels instant. |
| Chart history processing | Move heavy normalization/aggregation away from the critical render path or chunk it. | Prevents the instruments section from freezing. |
| Store subscriptions | Ensure high-frequency quote ticks only update symbol-specific consumers. | Prevents broad React re-renders on price ticks. |
| Instruments list | Keep rows memoized and avoid rebuilding row props when only chart state changes. | Reduces watchlist freeze during chart changes. |
| Startup sequencing | Connect market data and render shell before loading secondary panels and background snapshots. | Faster interactive terminal. |
| WebSocket reconnect | Preserve last good state during reconnect instead of resetting visible data. | Less flicker and less perceived loading. |

## Practical Diagnosis Summary

The terminal has a strong architecture foundation: session bootstrap, WebSocket realtime data, a central Zustand store, and a dedicated OHLC service for chart data. The likely reason users feel freezes during chart switching is that chart creation/history work and terminal state updates share the browser main thread with the instruments panel. Even if instruments use optimized direct price subscriptions, they cannot update smoothly while the main thread is busy creating chart objects, normalizing historical bars, calling `setData(...)`, or triggering broad state updates.

The fastest path to a noticeably better experience is:

1. Make backend session exchange and first realtime payloads faster.
2. Render terminal shell and cached data immediately.
3. Keep instruments isolated from chart state changes.
4. Make chart switching incremental: cached bars first, async history next, live updates continuously.
5. Avoid broad store updates during startup and symbol switching.
