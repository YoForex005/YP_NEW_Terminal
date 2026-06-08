import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { EMPTY_DASHBOARD_SNAPSHOT } from "@/lib/dashboard/default-state";
import {
  getUserSnapshotWithServerIp,
  updateUserSnapshot,
  getFullAccountsFromPg,
} from "@/lib/server/database";
import { mergeFullPgAccounts } from "@/lib/server/dashboard-snapshot-merge";
import { normalizeSnapshotTransactions } from "@/lib/server/snapshot-format";
import type { DashboardSnapshot } from "@/types/dashboard";

export const dynamic = "force-dynamic";

const DASHBOARD_SNAPSHOT_AUTH_TIMEOUT_MS = 5_000;
const DASHBOARD_SNAPSHOT_LOCAL_TIMEOUT_MS = 1_500;
const DASHBOARD_SNAPSHOT_BACKEND_PHASE_TIMEOUT_MS = 3_000;
const SLOW_PHASE_MS = 300;

class SnapshotTimeoutError extends Error {
  constructor(
    public readonly phase: string,
    public readonly timeoutMs: number,
    public readonly elapsedMs: number,
  ) {
    super(`${phase} timed out after ${timeoutMs}ms.`);
    this.name = "SnapshotTimeoutError";
  }
}

const cloneEmptySnapshot = (): DashboardSnapshot => ({
  ...EMPTY_DASHBOARD_SNAPSHOT,
  wallets: { ...EMPTY_DASHBOARD_SNAPSHOT.wallets },
  marketInstruments: [...EMPTY_DASHBOARD_SNAPSHOT.marketInstruments],
  tradingSessions: [...EMPTY_DASHBOARD_SNAPSHOT.tradingSessions],
  positions: [...EMPTY_DASHBOARD_SNAPSHOT.positions],
  transactions: [...EMPTY_DASHBOARD_SNAPSHOT.transactions],
  pnlSeries: [...EMPTY_DASHBOARD_SNAPSHOT.pnlSeries],
  tradingAccounts: [...EMPTY_DASHBOARD_SNAPSHOT.tradingAccounts],
});

const withPhaseTimeout = async <T,>(
  phase: string,
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new SnapshotTimeoutError(phase, timeoutMs, Date.now() - startedAt));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= SLOW_PHASE_MS) {
      console.warn(`[snapshot] ${phase} took ${elapsedMs}ms.`);
    }
  }
};

const getFullAccountsWithFallback = async (
  userId: string,
  brokerId: string | null | undefined,
): Promise<{ accounts: DashboardSnapshot["tradingAccounts"]; timedOut: boolean }> => {
  try {
    return {
      accounts: await withPhaseTimeout(
        "getFullAccountsFromPg",
        getFullAccountsFromPg(userId, brokerId),
        DASHBOARD_SNAPSHOT_BACKEND_PHASE_TIMEOUT_MS,
      ),
      timedOut: false,
    };
  } catch (err) {
    if (err instanceof SnapshotTimeoutError) {
      console.warn(
        `[snapshot] ${err.phase} timed out after ${err.elapsedMs}ms; using local snapshot fallback.`,
      );
      return { accounts: [], timedOut: true };
    }

    console.warn("[snapshot] getFullAccountsFromPg threw:", err instanceof Error ? err.message : err);
    return { accounts: [], timedOut: false };
  }
};

export async function GET(request: NextRequest) {
  let auth = null;
  try {
    auth = await withPhaseTimeout(
      "authenticateRequest",
      authenticateRequest(request),
      DASHBOARD_SNAPSHOT_AUTH_TIMEOUT_MS,
    );
  } catch (err) {
    if (err instanceof SnapshotTimeoutError) {
      console.warn(`[snapshot] ${err.phase} timed out after ${err.elapsedMs}ms.`);
      return NextResponse.json(
        { error: "Dashboard authentication timed out. Please retry." },
        {
          status: 504,
          headers: { "Cache-Control": "no-store", "X-Dashboard-Snapshot-Fallback": "auth-timeout" },
        },
      );
    }

    console.error("[snapshot] authenticateRequest threw:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error during authentication." }, { status: 500 });
  }

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let localSnapshot: DashboardSnapshot;
  try {
    localSnapshot = await withPhaseTimeout(
      "getUserSnapshotWithServerIp",
      getUserSnapshotWithServerIp(auth.user.id),
      DASHBOARD_SNAPSHOT_LOCAL_TIMEOUT_MS,
    );
  } catch (err) {
    if (err instanceof SnapshotTimeoutError) {
      console.warn(
        `[snapshot] ${err.phase} timed out after ${err.elapsedMs}ms; returning empty fallback snapshot.`,
      );
      return NextResponse.json(normalizeSnapshotTransactions(cloneEmptySnapshot()), {
        status: 200,
        headers: { "Cache-Control": "no-store", "X-Dashboard-Snapshot-Fallback": "local-timeout" },
      });
    }

    console.error("[snapshot] getUserSnapshotWithServerIp threw:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Data backend unavailable. Please ensure the backend services are running." },
      { status: 503 },
    );
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const localHasAccounts = (localSnapshot.tradingAccounts?.length ?? 0) > 0;

  // Account cards must be driven by the backend accounts table, not stale
  // dashboard JSON. Always fetch full account rows when accounts exist so
  // fields like login, name, leverage, server and credential availability stay fresh.
  if (localHasAccounts && !forceRefresh) {
    const { accounts: pgAccounts, timedOut } = await getFullAccountsWithFallback(
      auth.user.id,
      auth.user.brokerId,
    );
    if (pgAccounts.length === 0) {
      return NextResponse.json(normalizeSnapshotTransactions(localSnapshot), {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          ...(timedOut ? { "X-Dashboard-Snapshot-Fallback": "pg-timeout" } : {}),
        },
      });
    }

    const mergedSnapshot: DashboardSnapshot = {
      ...localSnapshot,
      tradingAccounts: mergeFullPgAccounts(localSnapshot.tradingAccounts, pgAccounts),
    };

    return NextResponse.json(normalizeSnapshotTransactions(mergedSnapshot), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Slow path (first load or forced refresh): query the accounts table directly.
  // This replaces the old HTTP call to the C++ backend, which was doing the
  // same PG query internally and adding 400–600 ms of HTTP round-trip overhead.
  const { accounts: pgAccounts, timedOut } = await getFullAccountsWithFallback(
    auth.user.id,
    auth.user.brokerId,
  );

  if (pgAccounts.length === 0 && !localHasAccounts) {
    return NextResponse.json(normalizeSnapshotTransactions(localSnapshot), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        ...(timedOut ? { "X-Dashboard-Snapshot-Fallback": "pg-timeout" } : {}),
      },
    });
  }

  const mergedAccounts = mergeFullPgAccounts(localSnapshot.tradingAccounts, pgAccounts);
  const mergedSnapshot: DashboardSnapshot = { ...localSnapshot, tradingAccounts: mergedAccounts };

  // Persist newly discovered accounts so the next request hits the fast path.
  if (mergedAccounts.length > localSnapshot.tradingAccounts.length) {
    void updateUserSnapshot(auth.user.id, (current) => {
      current.tradingAccounts = mergedAccounts;
      return current;
    }).catch((err) => {
      console.warn("[snapshot] failed to persist merged accounts:", err instanceof Error ? err.message : err);
    });
  }

  return NextResponse.json(normalizeSnapshotTransactions(mergedSnapshot), {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
