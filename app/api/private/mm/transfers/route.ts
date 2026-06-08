import { NextResponse, type NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { resolveAccountsBackendBaseUrl } from "@/lib/server/accounts-backend";

export async function POST(request: NextRequest) {
    console.log("[mm/transfers] POST handler entered");

    const auth = await authenticateRequest(request);
    if (!auth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const idempotencyKey = request.headers.get("idempotency-key");
        if (!idempotencyKey) {
            return NextResponse.json({ ok: false, error: "Missing Idempotency-Key header" }, { status: 400 });
        }

        const body = await request.json();
        console.log("[mm/transfers] body:", JSON.stringify(body));
        console.log("[mm/transfers] idempotencyKey:", idempotencyKey);

        // Direct fetch to backend — bypassing requestAccountsBackend entirely
        const backendUrl = `${resolveAccountsBackendBaseUrl()}/mm/transfers`;
        console.log("[mm/transfers] fetching:", backendUrl);

        const backendRes = await fetch(backendUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify(body),
        });

        const backendData = await backendRes.json();
        console.log("[mm/transfers] backend status:", backendRes.status, "data:", JSON.stringify(backendData));

        if (!backendRes.ok) {
            return NextResponse.json({
                ok: false,
                error: backendData?.error?.message || backendData?.error || "Backend error"
            }, { status: backendRes.status });
        }

        return NextResponse.json({
            ok: true,
            data: backendData.data || backendData
        }, { status: 201 });
    } catch (error: any) {
        console.error("[mm/transfers] CATCH ERROR:", error);
        return NextResponse.json({
            ok: false,
            error: error.message || "Failed to create internal transfer"
        }, { status: 502 });
    }
}
