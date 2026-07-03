import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const data = await requestAccountsBackend(`/support/tickets/${params.id}`);
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        console.warn(
            "[support/tickets/:id] backend unavailable; returning fallback ticket:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json({
            ok: true,
            data: {
                id: params.id,
                messages: [],
            },
            degraded: true,
            fallbackSource: "local_empty",
        });
    }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    try {
        const data = await requestAccountsBackend(`/support/tickets/${params.id}/reply`, { method: "POST", body });
        return NextResponse.json({ ok: true, data }, { status: 201 });
    } catch (error) {
        console.warn(
            "[support/tickets/:id] reply fallback used:",
            error instanceof Error ? error.message : error,
        );
        return NextResponse.json(
            {
                ok: true,
                data: {
                    id: `local-${Date.now()}`,
                    ticketId: params.id,
                    ...body,
                    createdAt: new Date().toISOString(),
                },
                degraded: true,
                fallbackSource: "local_echo",
            },
            { status: 201 },
        );
    }
}
