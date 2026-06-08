import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSocialStrategiesForUser } from "@/lib/server/dashboard-service";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const strategies = await getSocialStrategiesForUser(auth.user.id);
  return NextResponse.json({ strategies }, { status: 200 });
}

