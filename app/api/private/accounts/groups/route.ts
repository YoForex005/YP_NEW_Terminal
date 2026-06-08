import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getAllowedMt5GroupsForUser } from "@/lib/server/mt5-account-scope";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const groups = await getAllowedMt5GroupsForUser(auth.user);
    return NextResponse.json(
      {
        ok: true,
        groups,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load allowed MT5 groups.",
      },
      { status: 502 },
    );
  }
}
