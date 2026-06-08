import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const endpoint = request.nextUrl.searchParams.get("type") === "commissions" ? "/partner/commissions" : "/partner/stats";
    const partnerId = request.nextUrl.searchParams.get("partnerId") || auth.user.id;
    const limit = request.nextUrl.searchParams.get("limit") || "50";
    const offset = request.nextUrl.searchParams.get("offset") || "0";
    const data = await requestAccountsBackend(endpoint, { query: { partnerId, limit, offset } });
    return NextResponse.json({ ok: true, data });
}
