import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const data = await requestAccountsBackend(`/support/tickets/${params.id}`);
    return NextResponse.json({ ok: true, data });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const data = await requestAccountsBackend(`/support/tickets/${params.id}/reply`, { method: "POST", body });
    return NextResponse.json({ ok: true, data }, { status: 201 });
}
