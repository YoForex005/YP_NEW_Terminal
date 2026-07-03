# Trade Websocket Fix Notes

## Issue

Demo trade placement in the YoPips terminal was failing with a generic websocket error:

```text
Order failed: Trade websocket error
```

The frontend was using the ticket-based terminal websocket flow, but the trade payload did not match the backend websocket command contract.

## Changes Made

### 0. Fixed open-position visibility after trade fill

File:

```text
lib/terminal/ticket-terminal-client.ts
```

After testing a real terminal trade, the trade could be accepted but still not appear in the Open tab.

The frontend adapter now:

- accepts backend position ID aliases such as `position_id`, `positionId`, `mt5_position_id`, and `id`
- accepts backend order ID aliases such as `order_id`, `orderId`, `mt5_order_id`, and `id`
- maps MT5-style fields like `open_price`, `current_price`, `stop_loss`, and `take_profit`
- rejects malformed position/order payloads instead of creating fake ticket `0` rows
- handles live `position` websocket events and updates the local open positions list immediately
- handles live `order` websocket events for pending-order updates
- treats backend `success:false` / `status:"failed"` trade results as failed instead of defaulting them to success

This fixes the case where the backend opens the MT5 position successfully, but the terminal table remains on `No open positions`.

### 1. Mapped frontend trade requests to backend websocket payload

File:

```text
lib/terminal/ticket-terminal-client.ts
```

Added `mapTerminalTradeRequestPayload()` to convert the frontend `TradeRequest` shape:

```ts
{
  symbol,
  type: "buy" | "sell" | "buy_limit" | "sell_limit" | ...,
  volume,
  sl,
  tp,
  price
}
```

into the backend ticket websocket shape:

```json
{
  "order_type": "market",
  "side": "sell",
  "symbol": "XAUUSD",
  "volume": 0.01,
  "stop_loss": 4197.47,
  "take_profit": 4172.37
}
```

For pending orders it now sends:

```json
{
  "order_type": "pending",
  "pending_type": "buy_limit",
  "price": 1.08
}
```

### 2. Fixed command idempotency key placement

File:

```text
lib/terminal/ticket-terminal-client.ts
```

Before, the client placed `idempotency_key` inside `payload`.

Now it sends `idempotency_key` at the websocket command envelope level:

```json
{
  "type": "command",
  "op": "order.place",
  "request_id": "...",
  "idempotency_key": "...",
  "payload": {}
}
```

This matches the terminal websocket documentation.

### 2a. Aligned one-click market/limit order result handling

Files:

```text
lib/terminal/ticket-terminal-client.ts
lib/trading/websocket-client.ts
app/terminal/page.tsx
lib/trading/use-auto-connect.ts
```

The one-click order flow now follows the backend terminal websocket contract for market and limit orders:

- sends a fresh UUID `idempotency_key` at the command-envelope level for each mutating command
- keeps market orders mapped as `order_type: "market"` plus `side`
- keeps limit orders mapped as `order_type: "pending"` plus `pending_type` and `price`
- treats backend `success: true` results as accepted even when no MT5 `retcode` is present
- maps `mt5_order_id` / `mt5_deal_id` into the frontend `order` / `deal` result fields
- refreshes backend `orders[]` after trade results so the Pending tab can show real pending rows from `state.refresh`
- requests `sections: ["account", "positions", "orders"]` in ticket-session `state.refresh` so the backend includes pending orders in the snapshot
- still does not create real pending rows from `ack`; those remain queue-only confirmations until `result`, `order`, or `state.refresh`

### 3. Improved backend websocket error messages

File:

```text
lib/terminal/ticket-terminal-client.ts
```

Added nested backend error parsing so errors like this:

```json
{
  "type": "error",
  "error": {
    "code": "TRADE_VALIDATION_FAILED",
    "message": "Trade blocked by challenge rules"
  }
}
```

show as:

```text
TRADE_VALIDATION_FAILED: Trade blocked by challenge rules
```

instead of the generic:

```text
Trade websocket error
```

### 4. Fixed modify-position websocket operation

File:

```text
app/terminal/page.tsx
```

Position modification now passes:

```ts
isPosition: true
```

so the ticket client uses `position.modify` with `position_id`, instead of treating it as `order.modify`.

### 5. Added dry-run environment switch

Files:

```text
.env
.env.example
```

Added:

```env
NEXT_PUBLIC_TERMINAL_TRADE_DRY_RUN=false
```

in local `.env` so demo account orders are submitted as real demo MT5 mutations.

The template keeps the safe default:

```env
NEXT_PUBLIC_TERMINAL_TRADE_DRY_RUN=true
```

so new environments validate trade commands without opening MT5 orders unless explicitly enabled.

### 6. Cleared corrupted Next.js dev cache after chunk 500s

Files/directories affected:

```text
.next
tsconfig.tsbuildinfo
```

The browser showed 500 errors for assets such as:

```text
/_next/static/chunks/main-app.js
/_next/static/chunks/app-pages-internals.js
```

The server error showed:

```text
Cannot find module './9276.js'
Require stack:
.next/server/webpack-runtime.js
```

This was caused by a stale or partially generated `.next` cache from interrupted dev/build runs.

Actions taken:

- stopped leftover `yopips-terminal` `next dev` / `next build` Node processes
- deleted generated `.next`
- deleted generated `tsconfig.tsbuildinfo`
- restarted the terminal dev server

After restarting, the terminal route and current Next chunks returned `200`.

### 7. Centered SL/TP chart badges

File:

```text
components/terminal/KlineChartContainer.tsx
```

The chart was drawing stop-loss and take-profit badges on the far right side of the chart, next to the price axis.

The trade-level overlay renderer now:

- keeps the open-position badge on the right side, preserving the existing close/drag behavior
- centers SL and TP badge groups horizontally in the chart plot area
- keeps the full horizontal price lines and price-axis labels unchanged
- keeps drag-to-modify and remove-SL/TP callbacks wired to the existing overlay elements
- clamps the centered badge group with `max-width: calc(100% - 24px)` so narrow chart panes do not push the badges outside the chart

### 8. Changed open trade line color to white

File:

```text
components/terminal/KlineChartContainer.tsx
```

The open trade price line on the chart now uses a white line color instead of the previous buy/sell line color.

The update keeps:

- BUY/SELL open-position badge styling unchanged
- open trade price-axis label color tied to the buy/sell side
- SL and TP line colors unchanged
- existing drag, close, and modify behavior unchanged

### 9. Added ticket-session browser refresh recovery

Files:

```text
lib/terminal/ticket-terminal-client.ts
lib/terminal/use-terminal-launch-session.ts
app/terminal/page.tsx
```

The launched terminal flow can now recover after a browser refresh without reusing one-time launch codes or websocket tickets.

The frontend now:

- stores only the terminal token and account context in `sessionStorage`
- never stores `feed_ticket` or `trade_ticket` in browser storage
- tries `POST /api/terminal/sessions/refresh-ws-tickets` first when a valid stored terminal token exists
- reconnects Feed WS and Trade WS only with the fresh tickets returned by `refresh-ws-tickets`
- falls back to the recovered MT5 login when the terminal token is missing, expired, or rejected
- creates a new launch session with `POST /api/terminal/sessions` using `{ login }`
- exchanges the newly returned launch code once with `POST /api/terminal/sessions/exchange`
- removes the URL launch fragment after exchange so old launch codes are not reused on refresh
- waits for `state.refresh` / `account.summary` before marking the launched terminal session ready
- keeps the positions panel in a loading/restoring state while launched-session restore is in progress

This keeps the backend contract unchanged for these cases:

```text
Refresh with valid terminal_token -> refresh-ws-tickets -> fresh WS tickets
Refresh without terminal_token but login available -> new launch session -> exchange -> fresh WS tickets
Old launch_code -> not reused
Old feed/trade tickets -> not reused and not stored
```

### 10. Made SL/TP chart line colors explicit

File:

```text
components/terminal/KlineChartContainer.tsx
```

The chart trade-level renderer now uses fixed colors for stop-loss and take-profit lines:

```text
TP -> green (#22c55e)
SL -> yellow (#facc15)
```

This applies to the horizontal chart price lines, centered SL/TP badges, mini badges, and related overlay text while keeping trade logic, drag-to-modify, and remove callbacks unchanged.

### 11. Reduced terminal refresh startup gate

File:

```text
app/terminal/page.tsx
```

Browser refreshes were showing the full-page terminal loading shell for roughly 10 seconds before the terminal became usable.

The frontend had a safety timeout that blocked the whole terminal UI while snapshot/account lookup and websocket readiness were still settling:

```ts
setTimeout(() => setLoadingTimedOut(true), 10_000)
```

This was changed to a named short grace period:

```ts
const INITIAL_TERMINAL_ACCOUNT_DATA_GATE_TIMEOUT_MS = 1_200;
```

and the startup gate now uses that value.

Result:

- the terminal shell mounts after about 1.2 seconds instead of waiting up to 10 seconds
- dashboard snapshot, account lookup, symbol loading, and websocket hydration continue inside the terminal panels
- the existing chart readiness gate remains separate at 3 seconds
- trade execution and websocket command behavior were not changed by this refresh-speed update

While checking the dev log, Redis was also refusing local connections:

```text
ECONNREFUSED 127.0.0.1:6379
```

and cold `/api/auth/me` plus `/api/private/dashboard/snapshot` calls were observed around 5.5 seconds. The refresh gate change fixes the visible full-page wait, but running/fixing Redis and the local DB fallback path will make backend data hydration faster too.

### 12. Fixed missing terminal data after browser refresh

File:

```text
app/terminal/page.tsx
```

After reducing the visible startup gate, a hard browser refresh could show the terminal shell but still not load account/symbol/position data.

Root cause:

- after a browser refresh, the in-memory Zustand `tradingAccounts` store starts empty
- `activeTradingAccount` depended on that hydrated snapshot store
- `connectAccountId` was derived only from `activeTradingAccount`
- if `/api/private/dashboard/snapshot` was slow, empty, or temporarily unavailable, `connectAccountId` stayed `null`
- with `connectAccountId === null`, `useAutoConnectTrading()` never started the terminal-session/websocket reconnect path

The reconnect path now has a snapshot-independent fallback:

- prefer the launched terminal session account id when present
- then prefer the hydrated active MT5 account
- then fall back to the `accountId` URL query param
- then fall back to the remembered last terminal account from localStorage

Numeric ids and `mt5-` ids are normalized into the terminal-session format:

```ts
900123 -> mt5-900123
mt5-900123 -> mt5-900123
```

This lets `/api/private/accounts/:accountId/terminal-session` start reconnecting immediately after refresh, even before dashboard snapshot hydration completes. Once the websocket returns account info, symbols, prices, and positions, the terminal can populate from live terminal data instead of waiting on the dashboard snapshot.

### 13. Made refresh data boot faster and observable

File:

```text
app/terminal/page.tsx
```

The terminal refresh path still had a senior-frontend loading problem: even after `connectAccountId` could fall back to the URL or remembered account, the remembered account was stored only in a user-scoped localStorage key.

That meant this sequence could still delay data loading:

```text
refresh -> wait for /api/auth/me -> read user-scoped last account -> derive connectAccountId -> start terminal-session/websocket
```

If `/api/auth/me` was slow, terminal websocket boot was also slow.

The frontend now stores and reads a fast global remembered account key:

```text
terminal:last-account:global
```

Behavior now:

- read the global remembered terminal account immediately on mount
- mark last-account recovery ready before `/api/auth/me` completes
- still read the user-scoped key after auth is ready
- write both the user-scoped key and global key when a terminal account is selected or resolved
- keep `accountId` URL query param as the highest normal refresh fallback
- keep the dashboard snapshot as background hydration, not a blocker for starting websocket reconnect

This makes the practical boot path:

```text
refresh -> read URL/global remembered account -> derive connectAccountId -> start terminal-session/websocket
```

The page also now includes opt-in boot timing diagnostics. Enable with any of:

```text
/terminal?terminalBootDebug=1
/terminal?terminalDebug=1
/terminal?bootDebug=1
localStorage.setItem("terminal:boot-debug", "1")
NEXT_PUBLIC_TERMINAL_BOOT_DEBUG=1
```

When enabled, the console logs `[Terminal boot]` milestones such as:

```text
mounted
auth-ready
last-account-ready
connect-account-ready
terminal-status:connecting
terminal-status:ready
snapshot-ready
snapshot-failed
symbols-ready
quotes-ready
positions-ready
```

This is intentionally silent by default, but gives a concrete refresh waterfall when troubleshooting slow data loads.

### 14. Removed duplicate chart SL/TP draft overlays after fills

File:

```text
app/terminal/page.tsx
```

The chart could show two SL/TP values at the same price after placing an order from the order panel.

Root cause:

- the chart renders real open positions from `liveTerminalPositions`
- while the order panel is still active, it also renders a `draft-order` preview from `activeAction` and `orderForm`
- after the backend position arrived, the real position and the still-active draft could have the same symbol, side, volume, SL, and TP
- both entries were passed into `TradingChart`, so both drew SL/TP overlays at the same prices

The chart input now suppresses the draft-order preview when a matching live position already exists for the selected symbol.

Matching uses:

```text
side + volume + SL + TP
```

with a symbol-digit-aware price tolerance.

This keeps:

- real MT5/websocket position state unchanged
- order placement unchanged
- modify/close behavior unchanged
- the draft preview before placement unchanged

It only prevents the already-filled draft preview from drawing a second set of SL/TP chart markers over the authoritative live position.

### 15. Fixed historical chart volume normalization

Files:

```text
lib/trading/websocket-client.ts
lib/terminal/ticket-terminal-client.ts
lib/terminal/mt5Datafeed.ts
components/terminal/KlineChartContainer.tsx
```

Historical chart volume was missing for FX/CFD symbols even when the backend sent usable `tick_volume`.

Root cause:

- MT5 real volume can legitimately be `0` for FX/CFD symbols
- the frontend OHLC adapters read `volume` first
- when `volume` was `0`, the adapters kept `0` instead of falling back to `tick_volume`
- the histogram then received zero-volume bars even though the backend had sent tick volume

The frontend OHLC adapters now normalize historical bar volume with this priority:

```text
volume > 0
tick_volume > 0
tickVolume > 0
real_volume > 0
realVolume > 0
volume_real > 0
volumeReal > 0
0
```

The chart histogram now uses the normalized bar volume directly as the histogram `value`.

This keeps backend behavior unchanged. No backend change is required for historical `chart.history` volume right now.

### 16. Added refresh-safe terminal restore gate

File:

```text
app/terminal/page.tsx
```

Browser refresh could briefly show:

```text
Trade ticket unavailable
No live instrument is selected yet. Connect an MT5 session, then choose a market symbol to trade.
```

Root cause:

- on hard refresh, in-memory terminal state starts empty
- `activeTradingAccount`, `connectAccountId`, websocket status, symbol catalog, selected symbol, and `selectedInstrument` hydrate in stages
- the order ticket only needs `selectedInstrument` to be temporarily `null` to show the unavailable fallback
- fallback symbols could also make the UI look initialized before the real broker catalog had settled

Fix:

- added a refresh/restore gate that tracks account, websocket, symbol catalog, and selected-instrument restoration
- the chart and trade ticket now show loading while MT5 account/session/symbol data is still restoring
- the ticket no longer shows `Trade ticket unavailable` during normal refresh hydration just because `selectedInstrument` is temporarily `null`
- symbol bootstrap now waits for the real broker catalog instead of locking in fallback symbols too early
- the initial terminal gate no longer releases only because of timeout while restore is still in progress

Expected refresh flow:

```text
restore account -> connect websocket -> load symbols -> restore selected instrument -> show order ticket
```

This keeps order placement, websocket commands, and backend behavior unchanged. It only changes frontend readiness gating during refresh.

### 17. Fixed BTCUSD chart-history candle classification

Files:

```text
lib/terminal/ticket-terminal-client.ts
lib/trading/websocket-client.ts
lib/terminal/ohlcWebSocketService.ts
```

BTCUSD could show live price and volume histogram bars while the candle bodies did not render.

Root cause:

- ticket-session `chart.history` bars defaulted to `source: "terminal-feed"`
- the chart render gate only treats trusted historical/cache sources as candle-history seed data
- `terminal-feed` is too generic and does not match the historical-source checks
- the historical-source regexes were also inconsistent: `chart-history-gap.ts` recognized database/cache-backed sources such as `database`, `rust_db`, `backend`, `upstream`, and `db`, while `ohlcWebSocketService.ts` and the websocket client used a narrower list

Fix:

- ticket-session chart-history bars now default to `source: "chart.history"` instead of `terminal-feed`
- ticket-session history bars are marked cache-backed unless the backend explicitly sends `cached: false`
- historical-source detection was aligned across the websocket client and OHLC service to recognize:

```text
chart
history
ohlc
cache
server
manager
database
rust_db
backend
upstream
db
```

This lets real BTCUSD `chart.history` bars satisfy the chart's historical seed checks, so the candle series can render instead of only the volume/live-price context.

### 18. Added optimistic open-position rendering after market orders

Files:

```text
app/terminal/page.tsx
components/terminal/PositionsTable.tsx
```

After placing a BUY/SELL market order, the success toast could appear before the backend position snapshot reached the Open tab.

Root cause:

- order placement acknowledgement and open-position hydration arrive through different websocket/refresh paths
- the UI waited for authoritative `account.positions` / `request_positions` data before rendering the Open tab row
- if MT5 position refresh was deferred or slow, users saw the success popup first and the Open tab row later

Fix:

- added a frontend-only optimistic open-position overlay for successful market orders
- the optimistic row is display-only and does not mutate the backend or websocket store
- the row uses the submitted symbol, side, volume, SL/TP, live market price, digits, and contract size
- the Open tab and chart receive the same merged display list, so the position appears immediately in both places
- once the real MT5 position arrives, the optimistic row is removed by matching symbol, side, volume, SL/TP, and nearby open price
- if no authoritative position arrives, the optimistic row expires automatically after a short TTL
- optimistic rows visually match normal open-position rows while keeping modify/close actions disabled until the real MT5 ticket is available

This keeps:

- backend behavior unchanged
- websocket command behavior unchanged
- authoritative position reconciliation unchanged
- close/modify logic restricted to real MT5 position tickets

### 19. Cleaned up websocket request timers when socket send fails

File:

```text
lib/terminal/ticket-terminal-client.ts
```

The terminal could show an unhandled runtime error like:

```text
Error: chart.request timed out.
```

This error comes from the chart/feed websocket path, not from the trade execution path. It means the frontend sent a chart candle-history request and did not receive the expected `chart.history` response before the timeout.

One frontend robustness issue was found in the shared ticket websocket client:

- `sendFeedRequest()` created a pending request and timeout before calling `sendFeed()`
- if the feed socket send failed immediately, the pending timeout could remain active
- later, that orphaned timer could reject as a timeout and surface as an unhandled runtime error
- `sendTradeRequest()` had the same cleanup risk if the trade socket send failed immediately

Fix:

- wrapped `sendFeed()` in `sendFeedRequest()` with `try/catch`
- wrapped `sendTrade()` in `sendTradeRequest()` with `try/catch`
- on immediate socket-send failure, the pending request is rejected through `rejectPendingRequest()`
- `rejectPendingRequest()` clears the timeout and removes the pending request from the map

This does not change the backend websocket contract or trade payloads. It only prevents stale pending timers from firing after an immediate socket-send failure.

Important behavior note:

- if the backend/feed service is genuinely slow or does not return `chart.history`, the chart request can still time out
- that backend/feed issue should be checked in `/ws/terminal/feed`, OHLC history logs, and matching `requestId` / `chart.history` frames
- this frontend fix makes the request lifecycle cleaner and prevents orphaned timer rejections from becoming misleading runtime crashes

### 20. Reduced duplicate feed subscriptions and quote/history warmups

Files:

```text
lib/terminal/ticket-terminal-client.ts
app/terminal/page.tsx
```

The terminal websocket/feed path was doing more subscription and warmup work than needed during reconnects, symbol changes, and chart timeframe changes.

The ticket terminal client now:

- tracks feed subscriptions per feed socket with `feedSubscribedSymbols`
- sends `subscribeSymbols()` frames only for symbols not already tracked as subscribed
- sends `unsubscribeSymbols()` frames only for symbols currently tracked as subscribed
- clears tracked feed subscription state on disconnect, feed reconnect, and feed socket close
- keeps trade socket behavior, the one-time ticket flow, public API shape, and pending request cleanup unchanged

Important behavior note:

- feed subscription tracking is updated after a successful client send, not after a backend subscribe/unsubscribe acknowledgement
- if the backend partially rejects a subscription change, the local tracking may stay optimistic until the next reconnect/reset

The terminal page now:

- avoids duplicate ad-hoc quote subscribe calls when the current quote client already covers the requested symbols
- narrows quote subscription effect dependencies to stable symbol keys to reduce re-subscribe churn
- splits bootstrap quote and history warmup keys so chart timeframe changes do not re-trigger quote warmup
- resets and account-scopes reactive OHLC warmup keys so account/session switches do not skip history warmup

### 21. Optimized hard reload and fast symbol-switch startup work

Files:

```text
app/terminal/page.tsx
lib/terminal/ticket-terminal-client.ts
```

The latest hard reload-speed pass reduced the amount of work that can stack up while the terminal is discovering the local account, opening sockets, and reacting to quick symbol/timeframe changes.

The terminal page now:

- mounts the terminal shell after local account discovery instead of waiting for websocket readiness
- keeps the selected chart OHLC prime immediate so the visible chart can hydrate first
- delays non-selected, bootstrap, and common OHLC warmups so they do not compete with the first visible chart load
- keeps the multi-symbol bootstrap history warmup from rerunning on timeframe-only changes
- cleans up stale OHLC warmup retry timers and delayed symbol-switch prefetch timers
- makes common timeframe prefetch delayed and cancelable, avoiding stacked prefetch work during fast symbol clicks

The ticket terminal client now:

- coalesces in-flight `state.refresh` calls for `getAccountInfo()`, `getPositions()`, and `getOrders()`
- tracks pending request lanes for feed and trade sockets
- rejects pending requests by lane when a socket closes or is replaced
- detaches and guards old socket handlers so intentional socket replacement does not schedule duplicate reconnects
- clears any queued reconnect timer when a fresh connect starts

### 22. Added fast Open Terminal handoff from Accounts page

Files:

```text
components/accounts/accounts-page.tsx
app/terminal/page.tsx
```

Clicking `Terminal` from the Accounts page opened a new `/terminal?accountId=...` tab, but that new tab had to rediscover the clicked account through dashboard/auth/session hydration before the terminal could confidently render.

The Accounts page now writes a short-lived same-origin launch hint before the new tab opens:

- stores the clicked MT5 account id/login/display metadata in `localStorage`
- stores the global last-terminal account id at the same time
- intentionally does not store MT5 trading password or investor password
- expires the hint after a short TTL

The terminal page now:

- reads that launch hint synchronously during startup
- uses it as an immediate account candidate when the dashboard account store is still empty
- still replaces it with authoritative dashboard/session data when those hydrate
- releases the initial full-page gate after a short timeout when an account candidate is known, letting websocket/session recovery continue inside the terminal shell instead of blocking the whole page

This targets the real slow path after `Open Terminal`:

```text
new tab -> /terminal?accountId=... -> wait for account rediscovery/session hydration -> render shell
```

and changes it to:

```text
click Terminal -> write lightweight account hint -> new tab -> render terminal shell from hint -> hydrate live session in-panel
```

This keeps backend behavior unchanged. If the hint is missing, expired, blocked by storage policy, or does not match the URL account id, the terminal falls back to the existing URL/dashboard/session path.

## Verification

Ran:

```bash
npm run typecheck
```

Result:

```text
Passed
```

Also verified:

```text
GET http://127.0.0.1:3002/terminal -> 200
GET /_next/static/chunks/main-app.js -> 200
GET /_next/static/chunks/app-pages-internals.js -> 200
GET /_next/static/chunks/app/terminal/page.js -> 200
```

For the SL/TP badge positioning update, also verified:

```text
npm run typecheck -> Passed
GET http://127.0.0.1:3002/terminal -> 200
```

For the open trade line color update, also verified:

```text
npm run typecheck -> Passed
```

For the ticket-session browser refresh recovery update, also verified:

```text
npm run typecheck -> Passed
```

For the SL/TP color update, also verified:

```text
npm run typecheck -> Passed
```

For the terminal refresh startup gate update, also verified:

```text
cmd /c npm run typecheck -> Passed
```

For the missing terminal data after refresh update, also verified:

```text
cmd /c npm run typecheck -> Passed
```

For the faster refresh data boot and boot diagnostics update, also verified:

```text
cmd /c npm run typecheck -> Passed
GET http://127.0.0.1:3002/terminal -> 200
```

For the duplicate SL/TP draft-overlay fix, also verified:

```text
cmd /c npm run typecheck -> Passed
```

For the historical chart volume normalization fix, also verified:

```text
cmd /c npm run typecheck -> Passed
```

For the refresh-safe terminal restore gate, also verified:

```text
cmd /c npm run typecheck -> Passed
```

For the BTCUSD chart-history candle classification fix, also verified:

```text
cmd /c npm run typecheck -> Passed
```

For the optimistic open-position rendering fix, also verified:

```text
cmd /c npm run typecheck -> Passed
```

For the websocket request timer cleanup, also verified:

```text
cmd /c npx tsc --noEmit -> Passed
```

For the feed subscription de-duplication update, Worker A also verified:

```text
cmd /c npx tsc --noEmit -> Passed
```

For the terminal quote/history warmup optimization, Worker B attempted:

```text
cmd /c npx tsc --noEmit
```

Result:

```text
Timed out after 120 seconds due to concurrent compiler load.
No dedicated Worker B typecheck pass was captured in that run.
```

For the hard reload-speed optimization pass, workers reported:

```text
cmd /c npx tsc --noEmit
```

Result:

```text
Initial worker runs timed out in their environment.
After fixing the readonly tuple type issue in app/terminal/page.tsx, final verification passed:
cmd /c npx tsc --noEmit -> Passed
git diff --check -- app/terminal/page.tsx lib/terminal/ticket-terminal-client.ts TRADE_WEBSOCKET_FIX.md -> Passed
GET http://127.0.0.1:3002/terminal -> 200
Current /_next static CSS and JS assets discovered from /terminal -> 200
```

For the Open Terminal fast handoff update, also verified:

```text
cmd /c npx tsc --noEmit -> Passed
git diff --check -- components/accounts/accounts-page.tsx app/terminal/page.tsx TRADE_WEBSOCKET_FIX.md -> Passed
GET http://127.0.0.1:3002/terminal?accountId=mt5-303129 -> 200
Current /_next static CSS and JS assets discovered from /terminal?accountId=mt5-303129 -> 200
```

Attempted full production build:

```text
cmd /c npm run build
```

Result:

```text
The first build attempt was blocked while fetching Google Fonts in the sandbox.
The approved build attempt did not complete within the 120 second command timeout.
No TypeScript errors were reported by the dedicated no-emit check.
```

The local terminal dev server was started at:

```text
http://127.0.0.1:3002/terminal
```

The dev log showed:

```text
Next.js ready at http://127.0.0.1:3002
GET /terminal 200
```

Visual browser automation could not be completed in this session because the required in-app browser Node execution tool was not exposed, so verification was limited to typecheck plus the running terminal route response.

## 23. Frontend-only Open Terminal warm launch optimization

### Problem

The Open Terminal click could only start the heavy work after the new terminal tab opened. Even when the terminal shell rendered quickly, the new tab still had to wait for route prefetch, account lookup, positions, symbols, and terminal-session hydration.

### Frontend-only changes made

- Added `lib/terminal/terminal-launch-cache.ts` as a small browser-side launch cache.
- The Accounts page now warms the terminal before the click:
  - prefetches the `/terminal?accountId=...` route with the canonical `mt5-LOGIN` id
  - starts best-effort requests for auth, dashboard snapshot, terminal session, positions, and symbols
  - writes account info, positions, and symbols into a short-lived localStorage snapshot
  - dedupes warmup requests per account so hover/focus/click do not spam the APIs
- The Terminal page now reads the warm launch snapshot immediately:
  - restores cached account info
  - restores cached open positions
  - restores cached symbol catalog
  - restores the last selected symbol/watchlist tab when available
  - continues live websocket/API hydration in the background
- The Terminal page also writes fresh runtime account/positions/symbol data back to the same cache so the next open starts warmer.
- The Accounts page terminal link now opens the canonical `mt5-LOGIN` URL when the login is known, avoiding a DB-id-to-MT5-id correction pass after navigation.

### Expected impact

This does not make slow backend calls faster, but it moves them before the click and lets the new tab paint from cached frontend data in milliseconds when a warm snapshot exists. Fresh/live data still refreshes after open.

### Verification

```text
cmd /c npx tsc --noEmit -> Passed
```

The backend Swagger/OpenAPI at:

```text
http://192.168.1.38:3001/swagger.json
```

was checked for the ticket websocket contract. It confirms:

- `idempotency_key` belongs on the command envelope
- command results are nested under `result`
- websocket errors are nested under `error`
- terminal trade socket supports live `position` and `order` events

## 24. Hardened terminal frontend launch cache for hard refresh

File:

```text
lib/terminal/terminal-launch-cache.ts
```

The browser-side warm launch cache now behaves more like stale-while-refresh data instead of an all-or-nothing short TTL snapshot:

- keeps the normal fresh window at 5 minutes
- adds a bounded 15 minute stale grace window for hard refresh recovery while live websocket/API hydration continues in the background
- stores `staleExpiresAtMs` metadata and returns `isStale` on restored snapshots
- rejects oversized cache records before JSON parsing to avoid blocking hard-refresh startup on corrupted or unexpectedly huge localStorage payloads
- drops malformed, wrong-account, unsupported-version, and fully expired snapshots safely
- preserves the difference between missing positions/symbols and known-empty positions/symbols, so an account-info-only warm hint does not accidentally mark positions as loaded empty
- prunes old frontend launch snapshots under the same key prefix and keeps only the most recent account entries
- retries one write after pruning if localStorage quota is full
- keeps symbol and position sanitization bounded by scan limits before writing or restoring
- sanitizes symbol trade/calc modes, session arrays, snake_case backend aliases, and selected symbol text
- revives position `openTime` correctly from ISO strings, seconds, milliseconds, microseconds, nanoseconds, and common MT5 `time_msc` aliases

This remains frontend-only. The cache is still only a launch/restoration hint; authoritative account, symbol, position, quote, and order state still comes from the live terminal session/websocket path after the terminal mounts.

### Verification

```text
cmd /c npx tsc --noEmit -> Passed
```

## 25. Worker batch hard-refresh optimization summary

Files covered by this batch:

```text
app/terminal/page.tsx
components/terminal/TradingChart.tsx
components/terminal/PositionsTable.tsx
lib/terminal/terminal-launch-cache.ts
```

The combined frontend-only pass reduced hard-refresh perceived load without changing backend/API speed:

- Worker A updated `app/terminal/page.tsx` so a stale frontend launch cache can release the initial terminal gate and avoid full-screen blocking while live account, symbol, position, quote, and websocket data refresh in the background.
- Worker B updated `components/terminal/TradingChart.tsx` and `components/terminal/PositionsTable.tsx` to defer chart runtime work, secondary panes, and optional modals, while reducing position-table render churn during refresh hydration.
- Worker C hardened `lib/terminal/terminal-launch-cache.ts` so launch snapshots survive refresh more reliably, remain bounded, tolerate malformed/stale records, and still hand control back to live session hydration.

Reviewer verification:

```text
cmd /c npx tsc --noEmit -> Passed
git diff --check -> Passed
GET /terminal?accountId=mt5-303129 -> 200 in ~1034ms after compile
Initial asset HTML list remained ~17.2MB in dev
```

The dev asset size means this pass improves perceived frontend startup and render blocking, but does not make backend/API calls or the dev bundle payload itself faster.

## 26. Fixed chart-switch freeze on symbol change

Files:

```text
app/terminal/page.tsx
components/terminal/KlineChartContainer.tsx
```

This update was focused on the symbol-switch freeze that made the instruments section stall for a few seconds when changing charts.

The frontend now:

- renders only one active `TradingChart` instance instead of keeping extra hidden chart trees mounted for background tabs
- removes the background tab mounting path that was keeping additional chart work alive during symbol changes
- moves the heavy chart rebuild path from `useLayoutEffect` to `useEffect` so the browser can paint the terminal shell and instruments list before the chart does its expensive work

Why this matters:

- the symbols panel already uses direct per-symbol price subscriptions, so its rows are not the main bottleneck
- the freeze came from chart setup, OHLC history normalization, and series rebuilding running on the same frame as the symbol switch
- reducing the amount of work in the urgent click path makes the terminal feel much closer to a native trading terminal

Reviewer verification:

```text
npm run typecheck -> Passed
```

## 27. Reduced terminal startup blocking

File:

```text
app/terminal/page.tsx
```

This update reduced the amount of work the terminal does before the first usable screen appears.

The frontend now:

- shortens the initial account-data grace window from 1.2s to 600ms
- shortens the initial chart gate window from 750ms to 450ms
- moves frontend launch-cache restore from `useLayoutEffect` to `useEffect` so the page can paint before cache hydration work runs
- moves the positions-refresh source reset from `useLayoutEffect` to `useEffect`
- moves the account-switch cleanup and terminal preferences hydrate path from `useLayoutEffect` to `useEffect`

Why this matters:

- the terminal was spending too much time in synchronous boot work before the first paint
- the restore and cleanup paths are useful, but they do not need to block the browser from drawing the shell
- letting the shell paint earlier makes the terminal feel much faster even when backend/session hydration is still finishing

Reviewer verification:

```text
npm run typecheck -> Passed
```

## 28. Included USDJPY in degraded quote fallback

Files:

```text
lib/trading/terminal-symbols.ts
lib/terminal/use-terminal-launch-session.ts
```

This update fixes a fallback mismatch where `USDJPY` was part of the requested warm quote set but was not present in the degraded/fallback symbol catalog used by the instruments search.

The frontend now:

- seeds fallback symbols from `DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS`, which includes `USDJPY`
- builds fallback `SymbolInfo` metadata for warm symbols beyond the original first-run list
- subscribes the launched terminal's initial quote feed to the same warm symbol set

Why this matters:

- when the live broker catalog is slow, empty, or temporarily unavailable, the search panel can still resolve `USDJPY`
- the quote subscription fallback now matches the symbols the terminal already considers worth warming
- the normal broker-catalog path still remains preferred whenever live symbols are available

Reviewer verification:

```text
cmd /c npx tsc --noEmit -> Passed
```

## 29. Feed live quote ticks into the active OHLC candle

Files:

```text
components/terminal/KlineChartContainer.tsx
lib/terminal/use-terminal-launch-session.ts
lib/terminal/ohlcWebSocketService.ts
```

This update makes the launched ticket-terminal feed drive the active chart candle from the same real-time quote ticks used by the current price line.

The frontend now:

- still writes each feed tick to the live price store
- also passes each feed tick into `ohlcService.ingestTick(...)`
- subscribes the OHLC service to the same live price store updates used by the chart price label while a chart symbol is active
- uses the quote snapshot receive time for store-driven candle updates so stale broker timestamps cannot strand the current-price line away from the active candle
- lets the chart renderer subscribe to the same live quote snapshot as the current-price line and update the visible open candle from that snapshot
- dedupes identical live quote ticks before aggregation so explicit websocket hooks and store listeners do not double-count candle volume
- treats chart-local live quote snapshots as one tick-volume unit so broker-specific or cumulative quote volume cannot flatten the whole volume pane
- lets the OHLC service keep the candle open fixed, expand high/low, and move close to the latest tick for the active timeframe bucket
- aligns OHLC tick aggregation to the same bid-first quote side used by the chart's current-price axis
- folds a lagging live tick into the still-open rendered candle instead of dropping it as older than the latest chart bar
- bypasses only the stateful OHLC sanity gate for the chart-local same-symbol live quote fallback, while still checking the symbol price domain before drawing

Why this matters:

- the current/open candle now behaves like a real trading terminal candle from live ticks
- the green current-price line and the active candle close use the same incoming quote source
- the live candle body should close at the visible current-price line instead of leaving the line stranded on a wick while the body shows another quote side
- if the price label is moving, the active candle has a direct path to move from that same live quote snapshot
- the renderer no longer rejects valid live quote updates just because the broker tick timestamp buckets behind the latest rendered candle
- backend OHLC/history can still preserve candle/open timestamps, but the visible currently forming candle is kept in parity with the fresh live quote snapshot
- low/zero-volume bars still render with a small visual floor, while real nonzero tick-volume values remain the source for the active volume label
- closed candles remain historical; only the current bucket keeps changing from live market data

Reviewer verification:

```text
cmd /c npx tsc --noEmit -> Passed
```

## 30. Kept active 1m chart candles rolling on minute boundaries

Files:

```text
components/terminal/KlineChartContainer.tsx
```

This update fixes the visible chart staying on the previous 1m candle when live quote price was available but no new OHLC websocket bar arrived exactly after the minute changed.

The frontend now:

- keeps the normal tick/OHLC-driven candle update path unchanged
- polls the active chart once per second for timeframe rollover
- when the wall-clock bucket has advanced, uses the latest live quote snapshot to seed the next visible candle
- limits that rollover to recently seen live quote snapshots so stale/disconnected charts do not keep inventing candles forever
- prevents the rollover poll from reprocessing the same stale quote inside the same bucket, which could inflate visible tick volume
- rejects implausible one-off chart-local quote jumps and repairs already-polluted same-bucket fallback highs/lows
- re-checks the rendered same-bucket live bar after merge so a previously preserved bad wick does not keep controlling chart autoscale
- keeps this chart-local so cached/historical OHLC data is not polluted with generated rollover candles

Why this matters:

- selecting `1m` now produces a new visible candle at the next 1-minute boundary while live quotes are flowing
- same-minute ticks still update the existing candle high/low/close
- a single bad quote fallback tick should no longer stretch the latest candle into a huge wick that squashes the whole chart
- real backend OHLC/history can still replace or expand the visible candle as authoritative data arrives

## 31. Moved 1m candle rollover into the OHLC service

Files:

```text
lib/terminal/ohlcWebSocketService.ts
```

The previous chart-local rollover could still miss visible candle creation because the OHLC service's bucket expiry path only closed and deleted the current candle. If no fresh tick arrived after that, subscribers never received a new open bucket.

The OHLC service now:

- closes and notifies the expired bucket after the normal 1 second grace
- immediately seeds the next live bucket from the prior close
- notifies chart subscribers with the new open candle
- catches up a bounded number of missed minute buckets if the tab/browser was paused
- keeps the latest tick timestamp at the bucket open so real broker ticks in that minute can still update the candle
- folds live quote ticks with stale broker timestamps into the current wall-clock bucket instead of dropping them before the candle can move
- still dedupes identical stale-timestamp frames so retry/duplicate quote events do not inflate candle volume

The chart fallback was also tightened so it:

- rolls to the wall-clock bucket when the current bucket is at least one timeframe past the last rendered candle
- can seed a doji rollover candle from the last rendered close if a live quote snapshot lacks freshness metadata
- treats quote freshness as a quality guard instead of the only way a new visible candle slot can be created

Why this matters:

- the active chart receives a normal OHLC event for the next `1m` candle
- flat rollover candles render as real visible live candles until broker ticks update them
- the chart no longer depends only on quote-change callbacks to create the next candle slot

## 32. Seeded the current live candle for every selected timeframe

Files:

```text
lib/terminal/ohlcWebSocketService.ts
```

The chart could load historical candles for `1m`, `5m`, `15m`, `1h`, `4h`, or `1D`, but the OHLC service sometimes refused to seed a current working candle because local history already existed. Without a `currentBars` entry for the selected timeframe, the bucket rollover timer had nothing to close or advance.

The OHLC service now:

- seeds the current live candle from the latest tick or live quote snapshot even when historical candles already exist
- keeps the guard that avoids replacing an already-open current candle
- uses the live quote snapshot receive time when seeding from the store so stale broker timestamps do not start the candle in an old bucket
- replays history and the seeded current candle to a new subscriber for the exact selected timeframe key

Why this matters:

- selecting `1m` gives the service a current `1m` bucket that can roll after one minute
- selecting `5m`, `15m`, `1h`, `4h`, or `1D` gives the same service timer a current bucket aligned to that timeframe
- backend history remains the source of completed historical candles, while frontend live aggregation owns the in-progress candle lifecycle

## 33. Bucket live ticks by receive time so the last candle keeps moving

Files:

```text
lib/terminal/ohlcWebSocketService.ts
```

The active candle could stop changing height even while the price line moved because the OHLC aggregator was still choosing the live candle bucket from the broker tick timestamp. Some broker/feed ticks can arrive with repeated or lagging timestamps, so price updates reached the live price store but OHLC aggregation treated them as old-bucket updates.

The OHLC service now:

- uses browser receive time to choose the active bucket for live `mt5_tick` aggregation
- still preserves broker tick time in the latest-tick cache for diagnostics/history-sensitive paths
- writes `sourceTimeMs` on new and same-bucket live aggregate bars so the chart merge treats the newest quote as the newest candle close
- keeps simulated/non-live aggregation on its original timestamp path

Why this matters:

- the last visible candle high/low/close changes when real-time bid/ask changes inside the selected timeframe
- selecting `1m` creates the next live candle on the next receive-time minute bucket instead of waiting for broker timestamp rollover
- the same bucket logic applies to `5m`, `15m`, `1h`, `4h`, and `1D`

## 34. Aligned live candle close with the current price line and added larger timeframes

Files:

```text
components/terminal/KlineChartContainer.tsx
components/terminal/ChartContextMenu.tsx
lib/terminal/chart-visual-config.ts
lib/terminal/mt5Datafeed.ts
app/terminal/page.tsx
```

The chart toolbar did not expose every requested interval, and an open OHLC websocket candle could briefly repaint the last candle close away from the terminal's current price line.

The frontend now:

- exposes `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`, `1M`, and `1Y` in the main chart resolution list
- exposes `Y1` in the chart context menu
- parses `1M` / `MN` and `1Y` / `Y1` in the MT5 datafeed path
- prewarms the common symbol-switch intervals through `D1`
- aligns open live OHLC websocket bars to the same current-price source used by the price line before rendering them

Why this matters:

- the live candle close should sit on the current price line for the open bucket
- candle creation follows the selected minute-based timeframe contract, including the newly exposed larger intervals
- `1M` is represented as 30 days and `1Y` as 365 days because the current frontend/backend contract is minute-based

## 35. Made candle rollover strictly timeframe-boundary driven

Files:

```text
components/terminal/KlineChartContainer.tsx
lib/terminal/ohlcWebSocketService.ts
```

The chart-local live candle rollover still had a quote freshness guard. That meant the chart could refuse to create the next visible candle at the timeframe boundary if the last quote snapshot was considered too old, even though the user had selected a fixed timeframe such as `1m`.

The frontend now:

- rolls the visible live candle when the selected timeframe bucket advances, independent of quote snapshot freshness
- uses the last visible close/current-line fallback price to seed the next candle when no fresh tick arrives exactly on the boundary
- removes the extra service-side 1 second grace so the OHLC service rolls as soon as its interval observes the boundary crossed

Why this matters:

- with `1m` selected, a new candle slot is created at each new 1-minute bucket
- with `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`, `1M`, or `1Y`, the same selected timeframe bucket rule is applied
- ticks inside the current bucket still update that candle's high, low, and close

## 36. Let the visible chart timer roll candles even while OHLC session state is settling

Files:

```text
components/terminal/KlineChartContainer.tsx
```

The visible chart's local rollover timer still used the same guard as OHLC websocket/history events. That guard requires the OHLC service session id to match the chart's account session id exactly. If the visible chart was active but the OHLC service session was not matched yet, the local timer exited before creating the next `1m` candle.

The frontend now separates:

- active rendered chart guard: mounted chart, same symbol, same timeframe, same account scope
- OHLC service event guard: active rendered chart plus matching OHLC service session

Why this matters:

- the visible chart can create the next timeframe candle slot from its own timer
- websocket/history events still keep the stricter account/session protection
- selecting `1m` no longer depends on a perfect OHLC service session match for the chart-local one-minute candle rollover

## 37. Fixed history-to-live handoff so the first live bucket renders after initial load

Files:

```text
components/terminal/KlineChartContainer.tsx
```

The terminal could show initial historical candles correctly but fail to create the next live candle because the post-history seed path only ran when the current bucket was strictly greater than `latestHistoryTime + bucketMs`. For the normal next candle, the current bucket is exactly equal to `latestHistoryTime + bucketMs`, so the seed was skipped. When it did run, it used `source: "live_price_seed"`, which the live render path treats as non-real and refuses to apply as the visible active candle.

The frontend now:

- seeds the current live bucket when `nowBucketTime >= latestHistoryTime + bucketMs`
- creates that seed as an open `mt5_tick` live candle so it can render as the active candle
- uses the current price line/live snapshot price when available, otherwise the latest history close
- makes the 1-second live timer first force-create the current selected bucket before falling back to the older snapshot update path

Why this matters:

- initial history can remain perfect, then the chart still transitions into a real visible live candle
- with `1m`, the first minute after load now has a renderable active candle slot
- later timeframe-boundary checks continue creating the next visible candle from the same dedicated rollover path

## 38. Seeded OHLC service rollover from stored history for ticket-mode charts

Files:

```text
app/terminal/page.tsx
lib/terminal/ohlcWebSocketService.ts
lib/terminal/terminal-preferences.ts
lib/terminal/ticket-terminal-client.ts
```

The actual reason a selected `1m` chart could load candles but not create a new candle every minute was that ticket-terminal mode does not have a dedicated live OHLC subscribe stream. In `TerminalTicketRealtimeClient`, `subscribeOhlc()` only requests `chart.history` once, then returns success. History bars are replayed into the OHLC service, but they do not always leave an active `currentBars` entry for the subscribed symbol/timeframe. The service rollover timer only advances `currentBars`, so visible history alone was not enough to create the next minute candle.

Backend contract:

- `chart.request` returns timeframe-based candles. For example, when the frontend sends `timeframe: "M1"`, the backend returns `chart.history` bars spaced at 60 seconds with `open`, `high`, `low`, `close`, `time`, and `tick_volume`.
- symbol subscriptions return live quote/tick messages with fields such as `bid`, `ask`, `last`, `volume`, `mt5_time`, and `mt5_time_msc`.
- the backend does not currently push a separate "new candle created" event for every timeframe boundary.
- therefore the frontend must either aggregate/roll the current candle from live ticks, or refresh `chart.request` on the selected interval to replace generated candles with exact backend candles.

Chosen frontend behavior:

- initial candles come from backend `chart.request` / `chart.history`
- exact historical candle refreshes still come from backend `chart.request` / `chart.history`
- live current-candle updates are generated in the frontend from quote/tick messages
- new candles during live streaming are currently generated in the frontend when the selected timeframe bucket changes
- the current codebase implements this through `ohlcWebSocketService._aggregateTick()`, `ohlcWebSocketService._ensureBucketExpiryTimer()`, and `KlineChartContainer.applyLiveBarToRenderedSeries()` rather than a single `applyPriceToCandleSeries()` function

The frontend now:

- makes the terminal default timeframe explicit as `1m`
- keeps terminal preference fallback saves aligned to the same `1m` default
- seeds the OHLC service current bar from the latest stored history when a subscribed key has history but no active current bar
- lets the service timer seed missing current bars before checking timeframe rollover
- still prefers latest tick/live quote price when available, otherwise uses the latest historical close for the rollover seed

Why this matters:

- ticket-mode charts no longer depend on a backend live OHLC stream to have a rollable current candle
- with `1m` selected, loaded history can transition into a current bucket and then roll at the next minute boundary
- quote ticks still update the in-progress candle high, low, and close when live prices are flowing
- backend `chart.history` remains the source of completed historical candles

## 39. Matched live tick candle aggregation to backend quote contract

Files:

```text
lib/terminal/ohlcWebSocketService.ts
lib/terminal/ticket-terminal-client.ts
lib/trading/websocket-client.ts
```

The live candle builder now matches the expected frontend contract exactly:

- historical candles are still backend-authoritative from `chart.request` / `chart.history`
- `tick_volume`, `tickVolume`, `real_volume`, `realVolume`, `volume_real`, and `volumeReal` are normalized into candle `volume`
- live quote price selection prefers midpoint of valid `bid` and `ask`
- if midpoint cannot be calculated, live quote price falls back to `last`, then `price`, then `bid`, then `ask`
- live quote timestamps support `mt5_time_msc`, `mt5_time`, `time_msc`, `timestamp_msc`, `tick_time`, `time`, and `timestamp` variants before falling back to frontend receive time
- timeframe bucketing still uses `floor(eventTime / timeframeMs) * timeframeMs`
- same-bucket ticks update the current candle close/high/low and add the tick volume increment
- next-bucket ticks create a new frontend-derived live candle with `open` from the previous candle close
- older live ticks are ignored unless the existing broker-clock rescue path can safely clamp a marginal late tick into the still-open current bucket

This means the frontend does not wait for a backend "new candle created" event. The backend provides initial/history candles and live quotes; the frontend derives current and next live candles until the next authoritative history refresh.

## 40. Fixed dropped quote frames and live rollover candle open price

Files:

```text
components/terminal/KlineChartContainer.tsx
lib/terminal/ohlcWebSocketService.ts
lib/terminal/ticket-terminal-client.ts
lib/trading/websocket-client.ts
```

Actual issue found after re-checking the live path:

- ticket feed quote parsing only passed `frame.payload ?? frame.data ?? frame` into `mapTick()`
- if backend sent `symbol` on the top-level frame and `bid` / `ask` inside `payload` or `data`, the frontend could drop the tick because the nested payload had no symbol
- when that happened, `onTick` did not run, the live price store did not update, and `ohlcService.ingestTick()` never got called
- result: historical candles loaded, but the selected timeframe bucket did not receive live ticks, so new M1 candles could appear stuck or not generate

Fix:

- ticket feed now merges the top-level quote frame with nested `payload`, `data`, `tick`, `quote`, or `price` before normalizing the tick
- legacy websocket tick mapping now also falls back to top-level `symbol`, price, timestamp, and volume fields when quote values are nested
- frontend fallback live snapshot price now uses midpoint of `bid` and `ask`, then `last`, then `bid`, then `ask`
- live rollover bars now open from the previous candle close and set high/low against the latest price

This keeps the intended split:

- history candles still come from backend `chart.history`
- live current candle and new timeframe candles are frontend-derived from incoming quotes/ticks

## 41. Forced visible chart rollover for every selected timeframe bucket

File:

```text
components/terminal/KlineChartContainer.tsx
```

The remaining candle-generation failure was in the visible chart fallback path. The OHLC service could aggregate ticks, but the chart still only tried to roll directly to the current bucket and could bail when the latest rendered timestamp was not available through `lastBarTimeRef` at the exact moment the timer ran. It also did not fill each missed selected-timeframe bucket.

The chart rollover timer now:

- reads the latest rendered candle directly
- calculates `currentBucketTime = floor(now / timeframeMs) * timeframeMs`
- calculates the first missing bucket from `latestRenderedBar.time + timeframeMs`
- appends every missing selected-timeframe bucket up to the current bucket
- uses previous candle close as the next candle open
- uses latest live price when available, otherwise previous close
- marks locally generated chart candles with `basis: "ui_timeframe_rollover"`
- marks intermediate catch-up bars as closed and the current bucket as open
- caps catch-up at 600 candles so reconnects or stale history cannot freeze the browser
- uses the frontend browser clock (`Date.now()`) for UI-owned rollover, so local candle creation does not depend on MT5/server-time updates

This makes frontend UI candle creation deterministic for `1m`, `5m`, etc. A backend "new candle" event is still not required.

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 42. Centralized live candle update rules without visual UI changes

Files:

```text
lib/terminal/live-candle-builder.ts
components/terminal/KlineChartContainer.tsx
```

The live candle rules are now centralized in `applyPriceToCandleSeries()`:

- price selection uses bid/ask midpoint first, then `last`, `price`, `bid`, `ask`
- event time prefers backend/MT5 timestamp fields before falling back to frontend time
- timeframe conversion supports `M1`, `M5`, `M15`, `H1`, `H4`, and `D1`
- bucket time is `floor(eventTime / timeframeMs) * timeframeMs`
- same bucket updates close/high/low/volume
- newer bucket appends a candle with `open = previous.close`
- older bucket clamps into the latest candle and does not insert historical live ticks
- generated lists stay bounded by the caller-provided limit

No visual UI, timeframe buttons, styling, or layout were changed for this pass. The chart component only calls the shared candle-rule helper from its live quote and local timeframe rollover logic.

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 43. MT5-aligned frontend candle rollover clock

File:

```text
components/terminal/KlineChartContainer.tsx
```

Backend confirmed live quote frames include `mt5_time_msc` in milliseconds. That means live and historical candle bucket times are on the MT5/server timestamp grid.

The visible chart's local rollover timer now uses the frontend-maintained MT5/server clock from `ohlcService.getServerNowMs()` instead of raw browser `Date.now()` when deciding whether a new timeframe bucket has started.

This is still frontend-local candle generation. It does not wait for a backend "new candle created" event. The difference is that the local timer now compares against the same MT5-aligned bucket times used by `chart.history` and live quote timestamps, so a browser-vs-MT5 clock offset cannot block the `1m`, `5m`, `15m`, `1h`, `4h`, or `1D` rollover.

No visual UI, timeframe buttons, styling, or layout were changed.

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 44. Root cause for hidden frontend-generated candles

File:

```text
components/terminal/KlineChartContainer.tsx
```

Root cause found:

- frontend local rollover could create live candles
- but during a history/render refresh, the chart compared latest backend history with earliest live/local candle
- if backend history was more than 1 selected-timeframe bucket behind the live candle, the decision reason became `history_live_time_gap`
- the render merge then suppressed the whole live cache as "pending latest history"
- result: a frontend-generated `1m` candle could be created internally but not remain visible on the chart

Fix:

- `history_live_time_gap` no longer hides frontend live/local candles
- time gaps still trigger background latest-history catch-up
- only `history_live_price_gap` suppresses live cache, because that indicates a possible bad price/symbol mismatch

This keeps the chart moving locally while backend `chart.history` catches up.

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 45. Fixed live ticks stretching the old 1m candle after rollover

File:

```text
components/terminal/KlineChartContainer.tsx
```

Root cause found from the visible chart behavior:

- the chart's timer could create local rollover candles
- but the normal live quote callback still used the quote timestamp bucket unless it was called in a special wall-clock rollover mode
- when quote timestamps or quote-store snapshots stayed in the old bucket, each new tick kept updating `previousLastBarTime`
- result: on `1m`, the rightmost candle kept moving/stretching after 60 seconds instead of starting a new candle

Fix:

- every live quote update now checks the current selected-timeframe bucket using the frontend-maintained MT5/server clock
- if `currentBucketTime >= previousLastBarTime + timeframeMs`, the quote is applied to the new bucket immediately
- the latest price still comes from the live quote, but the candle time is the new selected-timeframe bucket
- this applies to normal live quote callbacks, not only the fallback timer path

Expected result:

- on `1m`, once the next minute bucket begins, the next live tick creates/updates the new candle
- the previous candle stops being stretched by ticks from the new minute

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 46. Forced 1m UI bucket rollover even when quote timestamps lag

File:

```text
components/terminal/KlineChartContainer.tsx
```

Additional root cause from the visible `1m` chart:

- live ticks could still carry or restore an older timestamp bucket through the quote snapshot path
- when that happened, the latest price moved but the old right-edge candle kept receiving the update
- the UI needed a stronger selected-timeframe bucket guard independent of quote timestamp freshness

Fix:

- the chart now calculates the current frontend bucket as:

```text
max(
  bucket(ohlcService.getServerNowMs()),
  bucket(Date.now())
)
```

- normal live quote updates use that bucket check before applying the tick
- the forced rollover timer uses the same bucket check
- the initial live seed after history also uses the same bucket check

Expected result:

- with `1m` selected, once the next minute begins in the frontend, the next tick cannot be applied to the previous candle
- if the quote timestamp is stale/lagging, the tick is still applied to the new selected-timeframe candle

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 47. Removed preserved compact-time gaps between history and live candles

File:

```text
components/terminal/KlineChartContainer.tsx
```

Root cause:

- the chart uses compact sequential series time to avoid visible gaps
- but render rebuilds were passing `previousRealTimeToSeriesTime` back into `buildCompactSeriesEntries()`
- if a live candle had previously been mapped far to the right, that old mapping was preserved
- result: even after candles were merged, the chart could keep a large blank horizontal gap between historical candles and live candles

Fix:

- render rebuilds now compact the visible candle list fresh
- old real-time-to-series mappings are not reused during full data rebuild
- live candles and history candles render adjacent in the rebuilt compact series

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 48. Removed visual open-price gap on displayed candles

File:

```text
components/terminal/KlineChartContainer.tsx
```

Root cause:

- a displayed candle could arrive with an `open` far away from the previous displayed candle `close`
- this created a visible price gap/jump between adjacent rendered candles, even when the chart x-axis was compact
- the original continuity fix only handled bars tagged as live ticks, so merged/history display bars could still keep a gap

Fix:

- every displayed candle after an existing candle now uses `open = previousDisplayedCandle.close`
- high/low are expanded to include both the previous close and the candle close
- the same continuity rule is applied in both paths:
  - immediate live updates
  - full chart `setData()` rebuilds

This only changes frontend chart rendering continuity. Backend historical candles remain authoritative before display normalization.

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## 49. Queued selected-symbol quote subscriptions until feed websocket is open

File:

```text
lib/terminal/ticket-terminal-client.ts
```

Backend contract confirmed:

- `/ws/terminal/feed?ticket=<feed_ticket>` does not stream quotes just because the socket opens
- frontend must send `{ "type": "subscribe", "symbol": "EURUSD" }` or `{ "type": "subscribe", "symbols": ["EURUSD"] }`
- live quote frames use `type: "quote"`, `mt5_time_msc`, and `volume`
- `chart.history` is only a history snapshot; new candles must come from subscribed quote frames

Root cause:

- `isConnected` only represented the trade socket, so quote subscription effects could run while the feed socket was not open
- `subscribeSymbols()` attempted to send immediately and could throw before the feed socket was ready
- a failed early subscribe could leave the selected chart without live quote frames, so `ingestTick()` never received the timestamp crossing the next 1m bucket

Fix:

- `isConnected` now requires both feed and trade sockets to be open
- `subscribeSymbols()` always records desired feed symbols first
- if the feed socket is not open yet, the subscribe is queued instead of failing
- when the feed socket opens or reconnects with a fresh one-time ticket, desired symbols are flushed to the backend
- single-symbol subscriptions are sent as `{ type: "subscribe", symbol }`; multi-symbol subscriptions still use `{ type: "subscribe", symbols }`

Expected result:

- the selected chart symbol is subscribed after every fresh feed connection
- backend `quote` frames reach `onTick`
- `ohlcService.ingestTick()` receives `mt5_time_msc` timestamps and can create the next 1m candle when the timestamp crosses the minute bucket

### Verification

```text
cmd /c npm run typecheck -> Passed
```

## Important Note

After changing `NEXT_PUBLIC_TERMINAL_TRADE_DRY_RUN`, the Next.js dev server must be restarted because `NEXT_PUBLIC_*` values are read into the browser bundle at build/dev-server startup.

If the browser still shows old chunk URLs with an older `v=` value, hard refresh the page so it uses the regenerated Next assets.
