import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import { redactDashboardSnapshotForClient } from "@/lib/server/redact-credentials";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getSnapshotForUser(auth.user.id);
  return NextResponse.json(redactDashboardSnapshotForClient(snapshot), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
