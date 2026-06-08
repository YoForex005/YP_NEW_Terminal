import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getUserById } from "@/lib/server/database";
import {
  buildSettingsBackendErrorResponse,
  requestSettingsBackend,
} from "@/lib/server/settings-backend";

interface SettingsPayload {
  settings?: Record<string, string>;
}

const maskEmail = (value: string): string => {
  const normalized = value.trim();
  const [localPart = "", domain = ""] = normalized.split("@");
  if (!localPart || !domain) {
    return normalized;
  }

  const visibleStart = localPart.slice(0, 1);
  const visibleEnd = localPart.slice(-1);
  const maskedLocal =
    localPart.length <= 2
      ? `${visibleStart}${"•".repeat(Math.max(1, localPart.length - 1))}`
      : `${visibleStart}${"•".repeat(Math.max(1, localPart.length - 2))}${visibleEnd}`;

  return `${maskedLocal}@${domain}`;
};

const maskPhone = (value: string | undefined): string => {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return "Not set";
  }

  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 4) {
    return normalized;
  }

  const hiddenLength = Math.max(0, digits.length - 4);
  return `+${"•".repeat(hiddenLength)}${digits.slice(-4)}`;
};

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [settingsData, user] = await Promise.all([
      requestSettingsBackend<SettingsPayload>("/settings", {
        query: { userId: auth.user.id },
      }),
      getUserById(auth.user.id),
    ]);

    const settings = settingsData.settings ?? {};

    return NextResponse.json(
      {
        ok: true,
        data: {
          emailMasked: maskEmail(auth.user.email),
          phoneMasked: maskPhone(user?.phone),
          twoFactorEnabled: settings.two_factor_enabled === "true",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return buildSettingsBackendErrorResponse(error);
  }
}
