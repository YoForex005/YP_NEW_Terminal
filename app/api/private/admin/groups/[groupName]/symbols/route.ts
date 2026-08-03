import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { AccountsBackendError, requestAccountsBackend } from "@/lib/server/accounts-backend";

interface RouteContext {
  params: {
    groupName: string;
  };
}

/**
 * POST /api/private/admin/groups/:groupName/symbols
 *
 * Enables a symbol (e.g. "BTCUSD") for full trading in the specified MT5 group.
 * Calls the C++ backend which uses the MT5 Manager SDK to add the symbol to the
 * group with TRADE_FULL mode (or updates its trade mode if it already exists).
 *
 * Body: { symbol: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin surface — any authenticated user must not mutate MT5 group config.
  if (auth.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const groupName = (await context.params).groupName?.trim() ?? "";
  if (!groupName) {
    return NextResponse.json({ error: "groupName is required." }, { status: 400 });
  }

  let body: { symbol?: string };
  try {
    body = (await request.json()) as { symbol?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { symbol } = body;
  if (!symbol?.trim()) {
    return NextResponse.json({ error: "'symbol' is required." }, { status: 400 });
  }

  try {
    const result = await requestAccountsBackend<{ group: string; symbol: string; tradeMode: string }>(
      `/admin/groups/${encodeURIComponent(groupName)}/symbols`,
      {
        method: "POST",
        body: { symbol: symbol.trim() },
      },
    );

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof AccountsBackendError) {
      return NextResponse.json(
        { error: message, code: error.code ?? "BACKEND_ERROR" },
        { status: error.status >= 400 ? error.status : 502 },
      );
    }

    console.error("[admin/groups/symbols] POST failed", { groupName, symbol, error: message });
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
