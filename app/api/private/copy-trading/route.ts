import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const data = await requestAccountsBackend("/copy-trading/strategies");
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        console.warn(
            "[copy-trading] backend unavailable; returning empty fallback:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json({ ok: true, data: [], degraded: true, fallbackSource: "local_empty" });
    }
}

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (body._action === "follow") {
        try {
            const data = await requestAccountsBackend("/copy-trading/follow", { method: "POST", body: { ...body, userId: auth.user.id } });
            return NextResponse.json({ ok: true, data }, { status: 201 });
        } catch (error) {
            console.warn(
                "[copy-trading] follow fallback used:",
                error instanceof Error ? error.message : error,
            );
            return NextResponse.json(
                { ok: true, data: { ...body, userId: auth.user.id }, degraded: true, fallbackSource: "local_echo" },
                { status: 201 },
            );
        }
    }
    if (body._action === "unfollow") {
        try {
            const data = await requestAccountsBackend(`/copy-trading/follow/${body.followId}`, { method: "DELETE" });
            return NextResponse.json({ ok: true, data });
        } catch (error) {
            console.warn(
                "[copy-trading] unfollow fallback used:",
                error instanceof Error ? error.message : error,
            );
            return NextResponse.json({ ok: true, data: { followId: body.followId }, degraded: true, fallbackSource: "local_echo" });
        }
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
