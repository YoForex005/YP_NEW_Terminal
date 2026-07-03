import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const data = await requestAccountsBackend("/notifications", { query: { userId: auth.user.id } });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        console.warn(
            "[notifications] backend unavailable; returning empty fallback:",
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
        const data = await requestAccountsBackend("/notifications", { method: "POST", body: { ...body, userId: auth.user.id } });
        return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
        console.warn(
            "[notifications] create fallback used:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json(
            { ok: true, data: { ...body, userId: auth.user.id }, degraded: true, fallbackSource: "local_echo" },
            { status: 201 },
        );
    }
}

export async function PUT(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (body.readAll) {
        try {
            const data = await requestAccountsBackend("/notifications/read-all", { method: "PUT", body: { userId: auth.user.id } });
            return NextResponse.json({ ok: true, data });
        } catch (error) {
            console.warn(
                "[notifications] read-all fallback used:",
                error instanceof Error ? error.message : error,
            );
            return NextResponse.json({ ok: true, data: { readAll: true }, degraded: true, fallbackSource: "local_echo" });
        }
    }
    if (body.notificationId) {
        try {
            const data = await requestAccountsBackend(`/notifications/${body.notificationId}/read`, { method: "PUT" });
            return NextResponse.json({ ok: true, data });
        } catch (error) {
            console.warn(
                "[notifications] mark-read fallback used:",
                error instanceof Error ? error.message : error,
            );
            return NextResponse.json({ ok: true, data: { notificationId: body.notificationId }, degraded: true, fallbackSource: "local_echo" });
        }
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
