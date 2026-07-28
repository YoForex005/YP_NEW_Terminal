# Terminal Performance Fix Plan (Sprint A–C)

## Goals
- Near-zero lag on live ticks (no React re-render of chart/header/order on every quote)
- Faster symbol/TF switch (smaller history defaults, less thrash)
- Fewer store writes and layout thrashing
- Safer OHLC probe path when ready (return bars)

## Non-goals (this pass)
- Shared multi-user market bus rewrite
- Full multi-pane shared data controller (document follow-up)
- Removing all 15s account reconcile (later)

## Work items

### P1 — Tick path
1. Throttle `setMt5ServerTimeMs` to ≥500ms in `use-auto-connect.ts`
2. `KlineChartContainer`: stop using `usePriceBySymbol` for React re-renders; keep tip via imperative OHLC path; quotes only update axis/last price via refs
3. Prefer OHLC bar path for candle body when OHLC live; quotes fill tip only when OHLC not delivering
4. `OrderPanel` / `TradingChart` TopQuote: remove flash remount keys; DOM class flash only
5. `Header`: isolate selected price to leaf or DOM path
6. `InstrumentsPanel`: remove forced `offsetWidth` reflow
7. `PositionsTable`: stop flash remount keys; keep row hooks but avoid remount thrash

### P2 — Shell / history
8. `page.tsx`: `useCallback` for chart toggles / handlers that bust memo
9. Cap `DEFAULT_OHLC_HISTORY_LIMIT` to 1000 (align with chart render)

### P3 — Server
10. When OHLC probe is ready and has bars, return extracted bars (not empty array)

## Acceptance
- Chart component does not re-render solely due to selected-symbol ticks
- No `setMt5ServerTimeMs` more often than ~2Hz
- History default requests ≤1000 bars
- Probe-ready responses include bars when payload has them

## Implemented (2026-07-25)

| Item | Status |
|------|--------|
| Throttle `setMt5ServerTimeMs` 500ms | Done (`use-auto-connect.ts`) |
| Chart: remove `usePriceBySymbol`; imperative axis | Done (`KlineChartContainer.tsx`) |
| Chart: prefer OHLC body when fresh (750ms) | Done |
| OrderPanel: no per-tick full re-render; DOM prices; 200ms display throttle | Done |
| Header: isolate price alert modal subscription | Done |
| Flash: no remount every tick; direction/rAF restart | Done |
| InstrumentsPanel: no `offsetWidth` reflow | Done |
| Stabilize `onToggleOrderPanel` | Done (`page.tsx`) |
| `DEFAULT_OHLC_HISTORY_LIMIT = 1000` | Done |
| Probe-ready returns `bars` + Redis write | Done (`terminal-ws-bridge.ts`) |

### Follow-ups — implemented (pass 2)

| Item | Status |
|------|--------|
| Multi-pane secondary mode (pane 0 owns history; secondaries seed+light live) | Done |
| Full multi-user shared market bus | Deferred (unsafe with 1:1 account frames); instead: PRICE_UPDATE coalesce under client backpressure in `server.mjs` |
| REST WS keep-alive pool | Done (`terminal-ws-bridge.ts`) |
| Positions DOM live price/P&L | Done (`PositionsTable.tsx`) |
| Deep history scrollback up to 5000 | Done (`MAX_OHLC_HISTORY_LIMIT`, scrollback render max) |

### Env knobs (pass 2)
- `TERMINAL_REST_WS_POOL_ENABLED` (default true)
- `TERMINAL_REST_WS_POOL_IDLE_MS` (default 45000)
- `TERMINAL_REST_WS_POOL_MAX_TOTAL` (default 64)
- `NODE_WS_CLIENT_BACKPRESSURE_BYTES` (default 524288)
