import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { requestSettingsBackend } from "@/lib/server/settings-backend";

const buildSettingsReadFallbackResponse = (error: unknown) =>
    NextResponse.json(
        {
            ok: true,
            data: {
                settings: {},
                degraded: true,
                source: "settings-backend-fallback",
                error: error instanceof Error ? error.message : "Settings backend request failed.",
            },
        },
        { status: 200 },
    );

const buildSettingsWriteFallbackResponse = (
    settingsBody: Record<string, unknown>,
    error: unknown,
) => {
    const { _type, ...acceptedSettings } = settingsBody;

    return NextResponse.json(
        {
            ok: true,
            data: {
                settings: acceptedSettings,
                persisted: false,
                degraded: true,
                source: "settings-backend-fallback",
                error: error instanceof Error ? error.message : "Settings backend request failed.",
            },
        },
        { status: 202 },
    );
};

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const data = await requestSettingsBackend("/settings", {
            query: { userId: auth.user.id },
        });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        return buildSettingsReadFallbackResponse(error);
    }
}

export async function PUT(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ ok: false, error: "Request body must be a JSON object." }, { status: 400 });
    }

    const settingsBody = body as Record<string, unknown>;
    const endpoint = settingsBody._type === "security" ? "/settings/security" : settingsBody._type === "trading" ? "/settings/trading" : "/settings";
    try {
        const data = await requestSettingsBackend(endpoint, {
            method: "PUT",
            body: { ...settingsBody, userId: auth.user.id },
        });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        return buildSettingsWriteFallbackResponse(settingsBody, error);
    }
}
