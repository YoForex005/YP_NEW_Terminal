/**
 * GET /api/trading/ohlc-history
 *
 * Read-only OHLC history endpoint for chart backfills. The browser chart uses
 * this for historical candles while live candle updates continue over OHLC WS.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  TerminalBridgeError,
  requestTerminalOhlcGapRepair,
} from "@/lib/server/terminal-ws-bridge";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
};

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

const readPositiveInteger = (
  searchParams: URLSearchParams,
  key: string,
): number | undefined => {
  const value = searchParams.get(key);
  if (!value?.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : undefined;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId")?.trim() ?? "";
  const symbol = searchParams.get("symbol")?.trim() ?? "";
  const timeframeMinutes = readPositiveInteger(searchParams, "timeframeMinutes");
  const limit = readPositiveInteger(searchParams, "limit");
  const beforeUnixMs = readPositiveInteger(searchParams, "beforeUnixMs");
  const fromUnixMs = readPositiveInteger(searchParams, "fromUnixMs");
  const toUnixMs = readPositiveInteger(searchParams, "toUnixMs");

  if (!accountId) {
    return json({ ok: false, error: "accountId is required.", code: "ACCOUNT_ID_REQUIRED" }, 400);
  }

  if (!symbol) {
    return json({ ok: false, error: "symbol is required.", code: "SYMBOL_REQUIRED" }, 400);
  }

  if (!timeframeMinutes) {
    return json(
      { ok: false, error: "timeframeMinutes is required.", code: "TIMEFRAME_REQUIRED" },
      400,
    );
  }

  try {
    const result = await requestTerminalOhlcGapRepair(request, accountId, {
      symbol,
      timeframeMinutes,
      ...(limit ? { limit } : {}),
      ...(beforeUnixMs ? { beforeUnixMs } : {}),
      ...(fromUnixMs ? { fromUnixMs } : {}),
      ...(toUnixMs ? { toUnixMs } : {}),
      reason: "chart-history-api",
    });

    return json({
      ok: true,
      bars: Array.isArray(result.bars) ? result.bars : [],
      metadata: {
        ...result,
        bars: undefined,
        probe: undefined,
        repair: undefined,
      },
      probe: result.probe,
      repair: result.repair,
    }, result.managerFetchDeferred || result.managerFetchPending ? 202 : 200);
  } catch (error) {
    if (error instanceof TerminalBridgeError) {
      return json(
        {
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details,
        },
        error.status,
      );
    }

    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OHLC history request failed.",
        code: "OHLC_HISTORY_FAILED",
      },
      500,
    );
  }
}
