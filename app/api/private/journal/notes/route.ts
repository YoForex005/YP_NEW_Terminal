import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = request.nextUrl.searchParams.get("userId") || auth.user.id;
    try {
        const data = await requestAccountsBackend("/journal/notes", { query: { userId } });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        console.warn(
            "[journal/notes] backend unavailable; returning empty fallback:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json({ ok: true, data: [], degraded: true, fallbackSource: "local_empty" });
    }
}

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const userId = body.userId || auth.user.id;
    try {
        const data = await requestAccountsBackend("/journal/notes", { method: "POST", body: { ...body, userId } });
        return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
        console.warn(
            "[journal/notes] create fallback used:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json(
            {
                ok: true,
                data: {
                    id: `local-${Date.now()}`,
                    ...body,
                    userId,
                    createdAt: new Date().toISOString(),
                },
                degraded: true,
                fallbackSource: "local_echo",
            },
            { status: 201 },
        );
    }
}
