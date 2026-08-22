import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const data = await requestAccountsBackend(`/journal/notes/${id}`, { method: "DELETE" });
    return NextResponse.json({ ok: true, data });
}
