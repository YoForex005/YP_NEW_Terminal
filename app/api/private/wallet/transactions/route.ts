import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "50";
    const offset = searchParams.get("offset") || "0";
    const type = searchParams.get("type") || "";
    const qs = `ownerId=${encodeURIComponent(auth.user.id)}&limit=${limit}&offset=${offset}${type ? `&type=${type}` : ""}`;
    const res = await requestAccountsBackend(`/wallet/transactions?${qs}`);
    return NextResponse.json(res);
}
