import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await requestAccountsBackend("/notifications", { query: { userId: auth.user.id } });
    return NextResponse.json({ ok: true, data });
}

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const data = await requestAccountsBackend("/notifications", { method: "POST", body: { ...body, userId: auth.user.id } });
    return NextResponse.json({ ok: true, data }, { status: 201 });
}

export async function PUT(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (body.readAll) {
        const data = await requestAccountsBackend("/notifications/read-all", { method: "PUT", body: { userId: auth.user.id } });
        return NextResponse.json({ ok: true, data });
    }
    if (body.notificationId) {
        const data = await requestAccountsBackend(`/notifications/${body.notificationId}/read`, { method: "PUT" });
        return NextResponse.json({ ok: true, data });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
