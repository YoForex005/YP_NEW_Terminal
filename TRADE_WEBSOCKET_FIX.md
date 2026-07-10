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

## Important Note

After changing `NEXT_PUBLIC_TERMINAL_TRADE_DRY_RUN`, the Next.js dev server must be restarted because `NEXT_PUBLIC_*` values are read into the browser bundle at build/dev-server startup.

If the browser still shows old chunk URLs with an older `v=` value, hard refresh the page so it uses the regenerated Next assets.
