# Terminal Optimization Implementation Plan

This document is a planning artifact only. No terminal behavior should be changed until this plan is reviewed and approved.

## Goal

Make the YoPips terminal feel faster and more stable under live market conditions by reducing React work during quote ticks, lowering hidden chart CPU and memory usage, controlling chart/history prefetch pressure, and making trade outcome uncertainty easier to reason about.

## Current Diagnosis

The terminal is functional, but several parts of the implementation can compound under real trading load:

- Live quote changes can wake a large part of `app/terminal/page.tsx`.
- Inactive chart tabs are progressively mounted and then hidden, so they can keep chart instances, history state, subscriptions, and cached data alive.
- Multi-chart layouts multiply chart rendering, history loading, live tick handling, and resize work.
- OHLC history loading is defensive but complex, with multiple retries, gap repair, deferred paths, and loading states.
- Order placement already handles MT5 timeout and reconnect ambiguity, but the user-facing state can still be unclear.
- Position rows subscribe to live prices, so many open trades can create many React updates per tick.
- Websocket backpressure exists, which means prewarm, repair, subscription, and reconciliation requests can compete.
- Production still keeps `console.warn` and `console.error`, which can become noisy during repeated transport or history failures.

## Files To Change Later

Primary targets:

- `app/terminal/page.tsx`
- `components/terminal/TradingChart.tsx`
- `components/terminal/KlineChartContainer.tsx`
- `components/terminal/PositionsTable.tsx`
- `lib/trading/websocket-client.ts`
- `lib/terminal/ohlcWebSocketService.ts`
- `lib/terminal/quotesWebSocketService.ts`
- `next.config.mjs`

Possible supporting targets:

- `store/webtrader-store.ts`
- `store/chart-settings-store.ts`
- `lib/terminal/terminal-preferences.ts`
- `TRADE_WEBSOCKET_FIX.md`
- `README-FRONTEND.md`

## Phase 0: Measure Before Changing

Before changing behavior, add lightweight diagnostics that can be removed or gated later.

Planned changes:

- Add render counters around the terminal shell, chart tab host, active chart, inactive chart path, and positions table.
- Add timing marks for terminal boot, selected symbol switch, chart first visible candle, OHLC history ready, and first live quote.
- Add counters for quote subscription requests, OHLC subscription requests, history requests, gap repair requests, position refreshes, and backpressure rejections.
- Add a simple local debug flag so diagnostics are not always active.

Success criteria:

- We can compare before/after numbers for render count, symbol switch time, chart ready time, and pending websocket request count.
- The diagnostics do not expose secrets or trade account credentials.

## Phase 1: Isolate Live Quote Updates

Problem:

`app/terminal/page.tsx` subscribes to broad price-derived values such as `storePriceCount` and `livePriceSymbolKey`. This makes live ticks capable of re-running large terminal computations and effects.

Planned changes:

- Move broad live quote awareness out of the main terminal component where possible.
- Replace global price key dependencies with narrower selectors for the currently selected symbol, open tab symbols, watchlist symbols, and position symbols.
- Memoize derived symbol status maps so quote ticks only update the smallest UI surfaces that need them.
- Review effects that depend on `livePriceSymbolKey` and split them into:
  - boot readiness checks
  - selected symbol quote checks
  - watchlist quote checks
  - positions quote checks
- Avoid using a serialized all-prices key as a dependency for unrelated terminal effects.

Expected files:

- `app/terminal/page.tsx`
- `store/webtrader-store.ts`
- `lib/terminal/quotesWebSocketService.ts`

Success criteria:

- A live tick for one symbol does not cause the full terminal page to re-render.
- Watchlist, selected chart, ticker, and positions still show fresh prices.
- Initial terminal readiness still detects when the first quote arrives.

## Phase 2: Stop Hidden Chart Tabs From Staying Fully Hot

Problem:

Inactive tabs are mounted in the background and hidden with CSS. This improves instant switching, but after users open multiple tabs, hidden charts can keep expensive chart instances alive.

Planned changes:

- Replace always-hot hidden tab charts with a bounded warm-cache policy.
- Keep only the active chart fully mounted.
- Keep at most one or two recently used inactive tabs warm, based on least-recently-used tab order.
- For older inactive tabs, preserve lightweight state only:
  - symbol
  - timeframe
  - chart type
  - last known visible range, if available
  - cached history key
- Ensure unmounted hidden tabs unsubscribe from active OHLC streaming if the active chart no longer needs them.
- Add a fast remount path so switching back to a cold tab uses cached history before requesting new history.

Expected files:

- `app/terminal/page.tsx`
- `components/terminal/TradingChart.tsx`
- `components/terminal/KlineChartContainer.tsx`
- `lib/terminal/ohlcWebSocketService.ts`

Success criteria:

- Opening many symbol tabs does not linearly increase active chart CPU usage.
- Switching to a recently used tab still feels instant.
- Switching to an older tab shows cached data quickly and then refreshes if needed.
- Hidden tabs do not continue unnecessary OHLC subscriptions.

## Phase 3: Put A Budget On Multi-Chart Layouts

Problem:

Layouts with 2, 3, 4, or 6 panes render multiple chart containers in the same terminal view. This multiplies history, resize, overlay, and live update work.

Planned changes:

- Keep the first pane as the primary fully interactive pane.
- For secondary panes, reduce nonessential work:
  - disable heavy overlays by default
  - avoid duplicate history prewarm when all panes share the same symbol and timeframe
  - throttle resize and visible-range sync
  - avoid redundant status callbacks from non-primary panes
- Add a per-layout history request budget so 4-pane and 6-pane layouts do not fire all history requests at once.
- Consider lazy mounting lower-priority panes after the primary pane is ready.
- Keep layout selection UI behavior unchanged.

Expected files:

- `components/terminal/TradingChart.tsx`
- `components/terminal/KlineChartContainer.tsx`
- `app/terminal/page.tsx`

Success criteria:

- Multi-chart layout still renders every requested pane.
- Primary pane becomes usable first.
- 4-pane and 6-pane layouts do not create request spikes.
- Changing layout does not leak chart instances or subscriptions.

## Phase 4: Make OHLC History Loading Predictable

Problem:

OHLC loading has many defensive paths: retry, deferred state, timeout, cache, stale detection, gap repair, and backfill. This protects the user from bad data, but can create delayed or confusing loading states.

Planned changes:

- Create a clearer selected-history state machine:
  - idle
  - cached
  - loading
  - live-ready
  - stale
  - repairing
  - failed
- Collapse duplicated timeout and retry paths where the behavior is equivalent.
- Prefer showing cached history immediately, then annotate when repair or refresh is happening.
- Rate-limit gap repair requests by symbol and timeframe.
- Make history prewarm lower priority than active selected-symbol history.
- Add explicit cancellation or generation guards for symbol/timeframe switches.

Expected files:

- `components/terminal/KlineChartContainer.tsx`
- `app/terminal/page.tsx`
- `lib/terminal/ohlcWebSocketService.ts`
- `lib/terminal/chart-history-gap.ts`

Success criteria:

- Symbol switching cannot show stale candles for the wrong symbol.
- Cached candles appear quickly when available.
- Gap repair does not repeatedly compete with active chart loading.
- Loading messages match the actual state.

## Phase 5: Reduce Positions Table Tick Cost

Problem:

Each open position row subscribes to live prices and recalculates current price and profit in React. This becomes expensive with many open positions.

Planned changes:

- Replace per-row store subscriptions with a single parent-level subscription for the symbols present in open positions.
- Build a memoized live price map and pass each row only the price object it needs.
- Memoize position rows with stable props.
- Throttle visual flash state so rapid ticks do not trigger excessive animation updates.
- Consider virtualization if real open-position counts can become large.

Expected files:

- `components/terminal/PositionsTable.tsx`
- `store/webtrader-store.ts`

Success criteria:

- Many positions across a few symbols cause one price map update, not one independent subscription per row.
- Current price and profit remain correct.
- Grouped and expanded rows keep their current behavior.

## Phase 6: Make Order Uncertainty More Explicit

Problem:

The code already avoids automatic resubmission after MT5 timeouts, which is correct. The remaining risk is user confusion when an order may have executed but confirmation is delayed.

Planned changes:

- Add a visible "verification pending" state for uncertain order outcomes.
- Keep the order panel open, but disable immediate duplicate submission for the same symbol, side, volume, and account until reconciliation finishes or the user explicitly overrides.
- Show reconciliation progress in terms traders understand:
  - checking positions
  - checking trade result
  - checking history
  - connection still unavailable
- Add a short-lived local correlation record so reconnect handling can match late confirmations more clearly.
- Document that automatic retry must stay disabled for uncertain trade outcomes.

Expected files:

- `app/terminal/page.tsx`
- `components/terminal/OrderPanel.tsx`
- `TRADE_WEBSOCKET_FIX.md`

Success criteria:

- User is not encouraged to retry before reconciliation.
- Confirmed late success moves to a success state.
- Unconfirmed outcomes remain clearly marked.
- Duplicate intent protection is scoped and does not block unrelated trades.

## Phase 7: Control Websocket And Prefetch Pressure

Problem:

Quote subscriptions, selected-symbol subscriptions, OHLC history, gap repair, position refreshes, and post-trade reconciliation all share the websocket path. The client rejects when too many requests are pending.

Planned changes:

- Introduce request priorities:
  - trade execution and reconciliation
  - active chart selected-symbol history
  - active quote subscriptions
  - positions/account refresh
  - visible watchlist data
  - background prewarm
  - repair and speculative prefetch
- Add a small scheduler for OHLC history and repair requests so low-priority work yields to active chart and trade work.
- Debounce watchlist and hover prewarm.
- Cap concurrent background history requests.
- Surface backpressure as a diagnostic event, not just an error string.

Expected files:

- `lib/trading/websocket-client.ts`
- `app/terminal/page.tsx`
- `lib/terminal/ohlcWebSocketService.ts`
- `lib/terminal/quotesWebSocketService.ts`

Success criteria:

- Backpressure rejections are rare during normal symbol switching.
- Trade reconciliation is not delayed by background prewarm.
- Initial terminal first paint is not blocked by speculative history work.

## Phase 8: Account And Balance Freshness

Problem:

Account state refresh currently includes periodic polling. Balance, equity, margin, and free margin may feel behind live trading reality.

Planned changes:

- Trigger an immediate account refresh after confirmed trade open, close, or modify.
- Keep periodic polling as a fallback.
- Avoid refreshing account state on every quote tick.
- Add a timestamp or subtle stale indicator if account data is older than the freshness target.

Expected files:

- `app/terminal/page.tsx`
- `lib/server/backend-balance-sync.ts`
- relevant account API routes if needed

Success criteria:

- Account metrics update quickly after trade actions.
- Polling does not become more aggressive during idle periods.
- The UI can distinguish fresh account state from fallback cached state.

## Phase 9: Production Logging Cleanup

Problem:

Production removes `console.log`, but keeps `console.warn` and `console.error`. Repeated websocket or history failures can still add noise and small overhead.

Planned changes:

- Replace repeated warn/error paths with a small rate-limited logger helper.
- Keep critical errors visible.
- Suppress repeated identical transport/history warnings within a short window.
- Consider changing production console removal only after confirming server/client observability needs.

Expected files:

- `next.config.mjs`
- possible new helper under `lib/terminal/` or `lib/trading/`
- websocket and chart history call sites that currently emit repeated warnings

Success criteria:

- Important failures remain visible.
- Repeated expected retry noise is rate-limited.
- Production debugging remains possible when explicitly enabled.

## Phase 10: Verification Plan

Manual checks:

- Open terminal with one symbol and confirm first chart render.
- Switch symbols repeatedly.
- Open 5 or more tabs and confirm inactive tabs do not keep increasing active CPU load.
- Switch back to an older tab and confirm chart data appears from cache before refresh.
- Use 1, 2, 4, and 6 pane layouts.
- Keep many open positions and confirm current price/profit still update.
- Simulate websocket reconnect during order placement and verify uncertain outcome UI.
- Confirm account metrics update after open, close, and modify flows.

Automated checks where practical:

- Unit tests for selector utilities and request priority/scheduler behavior.
- Component tests for positions table live price mapping.
- Tests for history state transitions.
- Tests for duplicate-intent protection during uncertain order states.
- Build check with `npm run build`.

Performance checks:

- Compare render counts before and after Phase 1.
- Compare chart ready time before and after Phase 4.
- Compare websocket pending request count during startup, tab switching, and 6-pane layout.
- Compare CPU and memory after opening many tabs before and after Phase 2.

## Rollout Order

Recommended implementation order:

1. Phase 0: diagnostics.
2. Phase 1: quote update isolation.
3. Phase 2: hidden tab lifecycle.
4. Phase 7: websocket and prefetch pressure.
5. Phase 4: OHLC history state cleanup.
6. Phase 5: positions table optimization.
7. Phase 3: multi-chart budgeting.
8. Phase 6: order uncertainty UX.
9. Phase 8: account freshness.
10. Phase 9: production logging.

## Safety Rules For Implementation

- Do not change trade execution semantics while optimizing rendering.
- Do not automatically retry an uncertain trade request.
- Do not remove chart recovery or repair paths until replacement behavior is measured.
- Keep active selected-symbol chart loading higher priority than background prewarm.
- Keep changes small enough to test after each phase.
- Preserve existing user preferences unless a migration is added.

## Open Questions Before Implementation

- What is the expected maximum number of open chart tabs per user?
- What is the expected maximum number of open positions?
- Should inactive tabs stay warm for instant switching, or is a small remount delay acceptable?
- Should 6-pane layout prioritize all panes equally, or should pane 1 always be the primary fast path?
- Is there an existing production observability service that should receive rate-limited websocket/history diagnostics?

