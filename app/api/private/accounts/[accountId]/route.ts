import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { deleteTradingAccountForUser } from "@/lib/server/dashboard-service";

interface RouteContext {
  params: {
    accountId: string;
  };
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = context.params.accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  try {
    const result = await deleteTradingAccountForUser(auth.user.id, accountId);
    if (!result.ok) {
      const status = result.message === "Account not found." ? 404 : 400;
      return NextResponse.json(
        { error: result.message, snapshot: result.snapshot },
        { status },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        snapshot: result.snapshot,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/private/accounts/[accountId]] DELETE failed", {
      userId: auth.user.id,
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Failed to delete account." },
      { status: 500 },
    );
  }
}
