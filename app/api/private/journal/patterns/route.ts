import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const type = request.nextUrl.searchParams.get("type") || "time-based";
    const data = await requestAccountsBackend("/journal/patterns", { query: { type } });
    return NextResponse.json({ ok: true, data });
}
