import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import { normalizeSnapshotTransactions } from "@/lib/server/snapshot-format";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "50";
    const offset = searchParams.get("offset") || "0";
    const type = searchParams.get("type") || "";
    const qs = `ownerId=${encodeURIComponent(auth.user.id)}&limit=${limit}&offset=${offset}${type ? `&type=${type}` : ""}`;
    try {
        const res = await requestAccountsBackend(`/wallet/transactions?${qs}`);
        return NextResponse.json(res);
    } catch (error) {
        console.warn(
            "[wallet/transactions] backend unavailable; using local snapshot fallback:",
            error instanceof Error ? error.message : error,
        );
        const snapshot = normalizeSnapshotTransactions(await getSnapshotForUser(auth.user.id));
        const limitNumber = Number(limit);
        const offsetNumber = Number(offset);
        const safeLimit = Number.isFinite(limitNumber) && limitNumber > 0 ? Math.trunc(limitNumber) : 50;
        const safeOffset = Number.isFinite(offsetNumber) && offsetNumber > 0 ? Math.trunc(offsetNumber) : 0;
        const normalizedType = type.trim().toLowerCase();
        const transactions = normalizedType
            ? snapshot.transactions.filter((entry) => entry.type.toLowerCase() === normalizedType)
            : snapshot.transactions;

        return NextResponse.json({
            ok: true,
            data: {
                transactions: transactions.slice(safeOffset, safeOffset + safeLimit),
                total: transactions.length,
                limit: safeLimit,
                offset: safeOffset,
            },
            degraded: true,
            fallbackSource: "local_snapshot",
        });
    }
}
