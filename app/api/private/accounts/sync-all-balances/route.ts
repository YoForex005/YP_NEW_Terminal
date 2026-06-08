import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import {
    requestAccountsBackend,
    withBrokerContext,
} from "@/lib/server/accounts-backend";
import { getOwnedMt5Logins } from "@/lib/server/mt5-account-scope";

interface BalanceSyncData {
    login: string;
    balance: number;
    equity: number;
    freeMargin: number;
    credit: number;
    syncedAt: string;
}

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const logins = await getOwnedMt5Logins(auth.user);
        const results = await Promise.allSettled(
            logins.map((login) =>
                requestAccountsBackend<BalanceSyncData>(
                    `/accounts/${encodeURIComponent(login)}/sync-balance`,
                    {
                        method: "POST",
                        body: withBrokerContext(
                            { ownerId: auth.user.id },
                            auth.user.brokerId,
                        ),
                        timeoutMs: 20_000,
                    },
                ),
            ),
        );
        const failures = results
            .map((result, index) =>
                result.status === "rejected"
                    ? {
                        login: logins[index],
                        error:
                            result.reason instanceof Error
                                ? result.reason.message
                                : "Balance sync failed",
                    }
                    : null,
            )
            .filter((failure): failure is { login: string; error: string } =>
                Boolean(failure),
            );

        return NextResponse.json(
            {
                ok: failures.length === 0,
                data: {
                    updated: results.length - failures.length,
                    requested: logins.length,
                    failures,
                },
            },
            { status: failures.length === 0 ? 200 : 502 },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Balance sync failed";
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
