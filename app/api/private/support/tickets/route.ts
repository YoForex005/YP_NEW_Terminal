import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const data = await requestAccountsBackend("/support/tickets", { query: { userId: auth.user.id } });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        console.warn(
            "[support/tickets] backend unavailable; returning empty fallback:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json({ ok: true, data: [], degraded: true, fallbackSource: "local_empty" });
    }
}

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    try {
        const data = await requestAccountsBackend("/support/tickets", { method: "POST", body: { ...body, userId: auth.user.id } });
        return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
        console.warn(
            "[support/tickets] create fallback used:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json(
            {
                ok: true,
                data: {
                    id: `local-${Date.now()}`,
                    ...body,
                    userId: auth.user.id,
                    createdAt: new Date().toISOString(),
                },
                degraded: true,
                fallbackSource: "local_echo",
            },
            { status: 201 },
        );
    }
}
