import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const subTab = request.nextUrl.searchParams.get("subTab") || "overview";
    const data = await requestAccountsBackend("/journal/stats", { query: { subTab } });
    return NextResponse.json({ ok: true, data });
}
