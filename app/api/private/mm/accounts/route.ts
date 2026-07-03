import { NextResponse, type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const queryParams = new URLSearchParams();
    
    // Always restrict to the logged-in user
    queryParams.set("userId", auth.user.id);
    
    if (searchParams.has("type")) queryParams.set("type", searchParams.get("type")!);
    if (searchParams.has("status")) queryParams.set("status", searchParams.get("status")!);
    if (searchParams.has("currency")) queryParams.set("currency", searchParams.get("currency")!);
    if (searchParams.has("page")) queryParams.set("page", searchParams.get("page")!);
    if (searchParams.has("limit")) queryParams.set("limit", searchParams.get("limit")!);

    try {
        const data = await requestAccountsBackend(`/mm/accounts?${queryParams.toString()}`);
        return NextResponse.json({
            ok: true,
            data
        });
    } catch (error: any) {
        return NextResponse.json({ 
            ok: true,
            data: {
                accounts: [],
                total: 0,
            },
            degraded: true,
            fallbackSource: "local_empty",
            error: error.message || "Failed to fetch PAMM accounts",
        }, { status: 200 });
    }
}
