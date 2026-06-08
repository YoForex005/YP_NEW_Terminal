import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import {
  buildSettingsBackendErrorResponse,
  requestSettingsBackend,
} from "@/lib/server/settings-backend";

interface SettingsPayload {
  settings?: Record<string, string>;
}

const readTerminalSetting = (
  settings: Record<string, string>,
  ...keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await requestSettingsBackend<SettingsPayload>("/settings", {
      query: { userId: auth.user.id },
    });
    const settings = data.settings ?? {};

    return NextResponse.json(
      {
        ok: true,
        data: {
          defaultMt5Terminal:
            readTerminalSetting(
              settings,
              "default_mt5_terminal",
              "defaultMt5Terminal",
            ) ?? "MetaTrader 5",
          defaultMt4Terminal:
            readTerminalSetting(
              settings,
              "default_mt4_terminal",
              "defaultMt4Terminal",
            ) ?? "MetaTrader 4",
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return buildSettingsBackendErrorResponse(error);
  }
}
