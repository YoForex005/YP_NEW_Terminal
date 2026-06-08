import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export async function POST(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { action, ...rest } = body;

    if (action === "get-email") {
        try {
            const data = await requestAccountsBackend("/verification/get-email", {
                method: "POST",
                body: { userId: auth.user.id },
            });
            return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (error: any) {
            return NextResponse.json({ ok: false, error: error.message || "Failed to get email" }, { status: 500 });
        }
    }

    if (action === "send-code") {
        try {
            const data = await requestAccountsBackend("/verification/send-code", {
                method: "POST",
                body: { ...rest, userId: auth.user.id },
            });
            return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (error: any) {
            return NextResponse.json({ ok: false, error: error.message || "Failed to send code" }, { status: 500 });
        }
    }

    if (action === "verify-code") {
        try {
            const data = await requestAccountsBackend("/verification/verify-code", {
                method: "POST",
                body: { ...rest, userId: auth.user.id },
            });
            return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (error: any) {
            return NextResponse.json({ ok: false, error: error.message || "Verification failed" }, { status: 400 });
        }
    }

    if (action === "verify-email") {
        try {
            const data = await requestAccountsBackend("/verification/verify-email", {
                method: "POST",
                body: { ...rest, userId: auth.user.id },
            });
            return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (error: any) {
            return NextResponse.json({ ok: false, error: error.message || "Email verification failed" }, { status: 400 });
        }
    }

    if (action === "verify-mobile") {
        try {
            const data = await requestAccountsBackend("/verification/verify-mobile", {
                method: "POST",
                body: { ...rest, userId: auth.user.id },
            });
            return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (error: any) {
            return NextResponse.json({ ok: false, error: error.message || "Mobile verification failed" }, { status: 400 });
        }
    }

    if (action === "verify-profile") {
        try {
            const data = await requestAccountsBackend("/verification/verify-profile", {
                method: "POST",
                body: { ...rest, userId: auth.user.id },
            });
            return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (error: any) {
            return NextResponse.json({ ok: false, error: error.message || "Profile verification failed" }, { status: 400 });
        }
    }

    if (action === "verify-aadhaar") {
        try {
            const data = await requestAccountsBackend("/verification/verify-aadhaar", {
                method: "POST",
                body: { ...rest, userId: auth.user.id },
            });
            return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
        } catch (error: any) {
            return NextResponse.json({ ok: false, error: error.message || "Aadhaar verification failed" }, { status: 400 });
        }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
