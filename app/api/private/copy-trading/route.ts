import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await requestAccountsBackend("/copy-trading/strategies");
    return NextResponse.json({ ok: true, data });
}

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (body._action === "follow") {
        const data = await requestAccountsBackend("/copy-trading/follow", { method: "POST", body: { ...body, userId: auth.user.id } });
        return NextResponse.json({ ok: true, data }, { status: 201 });
    }
    if (body._action === "unfollow") {
        const data = await requestAccountsBackend(`/copy-trading/follow/${body.followId}`, { method: "DELETE" });
        return NextResponse.json({ ok: true, data });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
