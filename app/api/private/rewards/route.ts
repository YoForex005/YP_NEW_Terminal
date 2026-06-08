import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const data = await requestAccountsBackend("/rewards", { query: { userId: auth.user.id } });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : "Rewards backend unavailable.",
            },
            { status: 502 },
        );
    }
}

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await request.json();
        const data = await requestAccountsBackend("/rewards/claim", { method: "POST", body });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : "Reward claim backend unavailable.",
            },
            { status: 502 },
        );
    }
}
