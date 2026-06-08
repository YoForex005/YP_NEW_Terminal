import { NextResponse } from "next/server";
import { withDatabase } from "@/lib/server/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await withDatabase((db) => ({ version: db.version }), { persist: false });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, cause: err.cause?.message || String(err.cause) });
  }
}
