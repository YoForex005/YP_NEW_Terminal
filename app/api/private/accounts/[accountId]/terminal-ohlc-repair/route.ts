import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  TerminalBridgeError,
  TERMINAL_OHLC_REPAIR_ROUTE_TIMEOUT_MS,
  TERMINAL_OHLC_REPAIR_SESSION_RETRY_AFTER_MS,
  buildTerminalOhlcRepairDeferredResult,
  isTerminalSessionResolveDeferredError,
  requestTerminalOhlcGapRepair,
} from "@/lib/server/terminal-ws-bridge";

interface RouteContext {
  params: {
    accountId: string;
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const TERMINAL_OHLC_REPAIR_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const terminalOhlcRepairJson = (
  body: Record<string, unknown>,
  init?: { status?: number },
) =>
  NextResponse.json(body, {
    ...init,
    headers: TERMINAL_OHLC_REPAIR_NO_STORE_HEADERS,
  });

const parseJsonBody = async (request: NextRequest): Promise<unknown> => {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new TerminalBridgeError(
      "Invalid JSON body.",
      400,
      "INVALID_JSON_BODY",
    );
  }
};

const TERMINAL_OHLC_REPAIR_DEFERRED_STATUSES = new Set([
  "already_pending",
  "backfill_pending",
  "deferred",
  "history_pending",
  "manager_busy",
  "manager_cooldown",
  "manager_state_busy",
  "pending",
  "queued",
  "repair_pending",
  "scheduler_busy",
]);

const TERMINAL_OHLC_REPAIR_DEFERRED_SOURCES = new Set([
  "manager_busy",
  "repair_lane_busy",
  "route_deadline",
  "route_timeout",
  "session_resolve_timeout",
  "terminal_session_resolve_timeout",
  "terminal_session_timeout",
]);

const normalizeTerminalOhlcRepairClassifierToken = (value: string) =>
  value.trim().toLowerCase().replace(/[\s-]+/g, "_");

const hasTerminalOhlcRepairDeferredSource = (source: string) =>
  source
    .split(":")
    .map(normalizeTerminalOhlcRepairClassifierToken)
    .some((token) => TERMINAL_OHLC_REPAIR_DEFERRED_SOURCES.has(token));

const isTerminalOhlcRepairDeferredDiagnostic = (
  diagnostics: {
    ready?: unknown;
    repaired?: unknown;
    managerFetchDeferred?: unknown;
    managerFetchPending?: unknown;
    manager_fetch_deferred?: unknown;
    manager_fetch_pending?: unknown;
    status?: unknown;
    source?: unknown;
  },
) => {
  if (diagnostics.ready === true || diagnostics.repaired === true) {
    return false;
  }

  if (
    diagnostics.managerFetchDeferred === true ||
    diagnostics.managerFetchPending === true ||
    diagnostics.manager_fetch_deferred === true ||
    diagnostics.manager_fetch_pending === true
  ) {
    return true;
  }

  const status = typeof diagnostics.status === "string" ? diagnostics.status : "";
  const source = typeof diagnostics.source === "string" ? diagnostics.source : "";

  return (
    TERMINAL_OHLC_REPAIR_DEFERRED_STATUSES.has(
      normalizeTerminalOhlcRepairClassifierToken(status),
    ) ||
    hasTerminalOhlcRepairDeferredSource(source)
  );
};

const isTerminalOhlcRepairSessionResolveDeferredError = (
  error: TerminalBridgeError,
) =>
  isTerminalSessionResolveDeferredError(error);

export async function POST(request: NextRequest, context: RouteContext) {
  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return terminalOhlcRepairJson(
      { ok: false, error: "accountId is required.", code: "ACCOUNT_ID_REQUIRED" },
      { status: 400 },
    );
  }

  let body: unknown = {};
  try {
    body = await parseJsonBody(request);

    if (body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).symbols)) {
      const symbols = (body as Record<string, unknown>).symbols as unknown[];
      
      // Process symbols in the background so we don't timeout the route
      void (async () => {
        for (const sym of symbols) {
          if (typeof sym !== "string") continue;
          await requestTerminalOhlcGapRepair(request, accountId, { ...body, symbol: sym }).catch(() => {});
          // Stagger requests to avoid monopolizing the MT5 manager lock
          // which would block positions refresh and other chart streams.
          await new Promise(r => setTimeout(r, 150));
        }
      })();
      
      return terminalOhlcRepairJson({ ok: true, message: "Batch repair accepted", status: "pending" }, { status: 202 });
    }

    const deferredDiagnostics = buildTerminalOhlcRepairDeferredResult(
      accountId,
      body,
      `OHLC repair is still running after ${TERMINAL_OHLC_REPAIR_ROUTE_TIMEOUT_MS / 1000}s. The request was bounded so the browser can retry without a 504.`,
    );

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const repairPromise = requestTerminalOhlcGapRepair(request, accountId, body)
      .then((diagnostics) => ({
        diagnostics,
        status: isTerminalOhlcRepairDeferredDiagnostic(diagnostics)
          ? 202
          : 200,
      }));
    const timeoutPromise = new Promise<{ diagnostics: typeof deferredDiagnostics; status: 202 }>((resolve) => {
      timeoutId = setTimeout(
        () => resolve({ diagnostics: deferredDiagnostics, status: 202 }),
        TERMINAL_OHLC_REPAIR_ROUTE_TIMEOUT_MS,
      );
    });

    const result = await Promise.race([repairPromise, timeoutPromise]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    return terminalOhlcRepairJson({
      ok: true,
      ...result.diagnostics,
    }, { status: result.status });
  } catch (error) {
    if (error instanceof TerminalBridgeError) {
      if (isTerminalOhlcRepairSessionResolveDeferredError(error)) {
        try {
          const diagnostics = buildTerminalOhlcRepairDeferredResult(
            accountId,
            body,
            error.message ||
              "Terminal session resolution is still pending; retry OHLC repair shortly.",
            {
              source: "session_resolve_timeout",
              status: "session_pending",
              retryAfterMs: TERMINAL_OHLC_REPAIR_SESSION_RETRY_AFTER_MS,
            },
          );

          return terminalOhlcRepairJson({
            ok: true,
            ...diagnostics,
          }, { status: 202 });
        } catch {
          // Fall through to the typed bridge error if the request body itself
          // was invalid and cannot be converted into repair diagnostics.
        }
      }

      return terminalOhlcRepairJson(
        {
          ok: false,
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/private/accounts/[accountId]/terminal-ohlc-repair] POST failed", {
      accountId,
      error: message,
    });

    return terminalOhlcRepairJson(
      { ok: false, error: "Internal Server Error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
