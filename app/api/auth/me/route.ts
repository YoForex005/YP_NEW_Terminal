import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  let auth = null;
  try {
    auth = await authenticateRequest(request);
  } catch {
    return NextResponse.json(
      { user: null, authenticated: false },
      { status: 200 },
    );
  }

  if (!auth) {
    return NextResponse.json(
      { user: null, authenticated: false },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { user: auth.user, authenticated: true },
    { status: 200 },
  );
}
