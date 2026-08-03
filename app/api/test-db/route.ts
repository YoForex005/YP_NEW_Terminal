import { NextResponse } from "next/server";
import { withDatabase } from "@/lib/server/database";
import { authenticateRequest } from "@/lib/server/auth";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Dev-only DB probe. Disabled in production to avoid unauthenticated recon.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = await authenticateRequest(request);
  if (!auth || auth.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await withDatabase((db) => ({ version: db.version }), { persist: false });
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Database probe failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
