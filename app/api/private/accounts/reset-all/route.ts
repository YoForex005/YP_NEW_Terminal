import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import { query } from "@/lib/server/pg";
import { updateUserSnapshot } from "@/lib/server/database";

/**
 * POST /api/private/accounts/reset-all
 *
 * Removes ALL trading accounts from the user's CRM snapshot and, optionally,
 * from the PostgreSQL accounts table.
 *
 * Body (JSON):
 *   { purgePg?: boolean }   — default false; set true to also DELETE rows from PG
 *
 * This does NOT delete accounts from the MT5 broker itself.
 * Use with caution — pass purgePg:true only for development/test environments.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let purgePg = false;
  try {
    const body = (await request.json()) as { purgePg?: boolean };
    purgePg = body.purgePg === true;
  } catch {
    // no body or non-JSON body — purgePg stays false
  }

  const userId = auth.user.id;

  try {
    const before = await getSnapshotForUser(userId);
    const removedCount = before.tradingAccounts.length;

    // Wipe all trading accounts + stale position/order state in one snapshot update
    await updateUserSnapshot(userId, (current) => {
      current.tradingAccounts = [];
      current.positions = [];
      (current as typeof current & { orders?: unknown[] }).orders = [];
      return current;
    });

    // Re-read the fresh snapshot after reset
    const snapshot = await getSnapshotForUser(userId);

    // PostgreSQL: hard-delete account rows owned by this user (opt-in)
    let pgDeleted = 0;
    if (purgePg) {
      const result = await query(
        `DELETE FROM accounts WHERE owner_id = $1 RETURNING login`,
        [userId],
      );
      pgDeleted = result.rows.length;
    }

    return NextResponse.json({
      ok: true,
      message: `Removed ${removedCount} account(s) from the CRM snapshot${purgePg ? ` and ${pgDeleted} row(s) from PostgreSQL` : ""}.`,
      removedCount,
      pgDeleted,
      snapshot,
    });
  } catch (error) {
    console.error("[api/private/accounts/reset-all] failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Failed to reset accounts." },
      { status: 500 },
    );
  }
}
