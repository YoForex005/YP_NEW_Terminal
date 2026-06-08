import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import {
    requestAccountsBackend,
    withBrokerContext,
} from "@/lib/server/accounts-backend";
import { resolveOwnedMt5Login } from "@/lib/server/mt5-account-scope";

interface BalanceSyncData {
    login: string;
    balance: number;
    equity: number;
    freeMargin: number;
    credit: number;
    syncedAt: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: { accountId: string } }
) {
    const auth = await authenticateRequest(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { accountId } = params;
    if (!accountId) {
        return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const mt5Login = await resolveOwnedMt5Login(auth.user, accountId);
    if (!mt5Login) {
        return NextResponse.json(
            { error: "Account not found" },
            { status: 404 }
        );
    }

    try {
        const data = await requestAccountsBackend<BalanceSyncData>(
            `/accounts/${mt5Login}/sync-balance`,
            {
                method: "POST",
                body: withBrokerContext({ ownerId: auth.user.id }, auth.user.brokerId),
                timeoutMs: 20000,
            }
        );

        return NextResponse.json(
            { ok: true, data },
            {
                status: 200,
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to sync balance from MT5";
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
