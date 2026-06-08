import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const months = request.nextUrl.searchParams.get("months") || "12";
    const data = await requestAccountsBackend("/journal/projections", { query: { months } });
    return NextResponse.json({ ok: true, data });
}
