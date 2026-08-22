/**
 * POST /api/private/accounts/{accountId}/ohlc-gap-fill
 *
 * Detects and fills missing OHLC bars for a symbol/timeframe.
 * Fires multiple repair requests — one per detected gap range — through the
 * Rust gateway so the PostgreSQL DB cache gets fully populated.
 * The frontend chart calls this after initial history loads; the admin broker
 * can also POST it manually to fix any symbol's history.
 * Repairs are processed serially to avoid single-lane terminal contention.
 *
 * Body: { symbol, timeframeMinutes, bars: [{time: ms}...], reason? }
 * Returns: { ok, gapsFound, gapsFilled, ranges: [{fromMs, toMs, filled}...] }
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  TerminalBridgeError,
  requestTerminalOhlcGapRepair,
} from "@/lib/server/terminal-ws-bridge";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

interface GapRange {
  fromMs: number;
  toMs: number;
  buckets: number;
}

interface GapFillRangeResult {
  fromMs: number;
  toMs: number;
  filled: boolean;
  status?: string;
  source?: string;
  retryAfterMs?: number;
}

const NO_STORE = { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

function detectGaps(bars: Array<{ time: number }>, bucketMs: number): GapRange[] {
  if (bars.length < 2) return [];
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  const gaps: GapRange[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const missing = Math.floor((sorted[i].time - sorted[i - 1].time) / bucketMs) - 1;
    if (missing >= 5 && missing <= 2880) {
      gaps.push({ fromMs: sorted[i - 1].time, toMs: sorted[i].time, buckets: missing });
    }
  }
  return gaps;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext) {
  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return json({ ok: false, error: "accountId is required", code: "ACCOUNT_ID_REQUIRED" }, 400);
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return json({ ok: false, error: "Invalid JSON body", code: "INVALID_JSON" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "Body must be a JSON object", code: "INVALID_BODY" }, 400);
  }

  const b = body as Record<string, unknown>;
  const symbol = typeof b.symbol === "string" ? b.symbol.trim() : "";
  const timeframeMinutes = Number(b.timeframeMinutes) || 1;
  const rawBars = Array.isArray(b.bars) ? (b.bars as unknown[]) : [];
  const reason = typeof b.reason === "string" ? b.reason : "ohlc-gap-fill";

  if (!symbol) {
    return json({ ok: false, error: "symbol is required", code: "SYMBOL_REQUIRED" }, 400);
  }

  const bucketMs = timeframeMinutes * 60 * 1000;
  const bars = rawBars
    .filter((bar): bar is { time: number } =>
      typeof bar === "object" && bar !== null && typeof (bar as any).time === "number",
    )
    .map((bar) => ({ time: (bar as any).time }));

  // Also add tail gap: from the last known bar to now
  const nowMs = Date.now();
  if (bars.length > 0) {
    // Use reduce instead of Math.max(...array) — spread on large arrays causes
    // "Maximum call stack size exceeded" when bars.length > ~10,000.
    const lastTime = bars.reduce((max, b) => b.time > max ? b.time : max, bars[0].time);
    bars.push({ time: lastTime });
    bars.push({ time: nowMs }); // tail gap: from last known bar to now
  }

  const gaps = detectGaps(bars, bucketMs);

  if (gaps.length === 0) {
    return json({ ok: true, gapsFound: 0, gapsFilled: 0, ranges: [] });
  }

  const ranges: GapFillRangeResult[] = [];
  for (const gap of gaps) {
    try {
      const diagnostics = await requestTerminalOhlcGapRepair(request, accountId, {
        symbol,
        timeframeMinutes,
        limit: Math.min(gap.buckets + 10, 1500),
        fromUnixMs: gap.fromMs,
        toUnixMs: gap.toMs,
        reason,
      });
      const filled = diagnostics.ready || diagnostics.repaired;
      ranges.push({
        fromMs: gap.fromMs,
        toMs: gap.toMs,
        filled,
        ...(diagnostics.status ? { status: diagnostics.status } : {}),
        ...(diagnostics.source ? { source: diagnostics.source } : {}),
        ...(diagnostics.retryAfterMs ? { retryAfterMs: diagnostics.retryAfterMs } : {}),
      });

      const pending =
        !filled &&
        (
          diagnostics.managerFetchPending ||
          diagnostics.managerFetchDeferred ||
          /busy|deferred|pending|queued/i.test(diagnostics.status ?? "")
        );
      if (pending) {
        for (const skipped of gaps.slice(ranges.length)) {
          ranges.push({
            fromMs: skipped.fromMs,
            toMs: skipped.toMs,
            filled: false,
            status: "not_attempted",
            source: "previous_range_pending",
            ...(diagnostics.retryAfterMs ? { retryAfterMs: diagnostics.retryAfterMs } : {}),
          });
        }
        break;
      }
    } catch (error) {
      ranges.push({
        fromMs: gap.fromMs,
        toMs: gap.toMs,
        filled: false,
        status: "failed",
        source: error instanceof TerminalBridgeError ? error.code : "gap_fill_error",
      });
    }
  }

  return json({
    ok: true,
    gapsFound: gaps.length,
    gapsFilled: ranges.filter((r) => r.filled).length,
    ranges,
  });
}
