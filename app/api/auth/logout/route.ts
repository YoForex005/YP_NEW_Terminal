import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  getSessionTokenFromRequest,
  revokeSession,
} from "@/lib/server/auth";

// GET /api/auth/logout — used by client-side navigation.
// Clears the session cookie and redirects to /login in a single response
// so the browser never makes a second request with the old cookie still present.
export async function GET(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);

  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
  clearSessionCookie(response, request);

  if (token) {
    void revokeSession(token).catch((error) => {
      console.warn("Logout session revoke failed:", error);
    });
  }

  return response;
}

// POST /api/auth/logout — kept for programmatic / API clients.
export async function POST(request: NextRequest) {
  const token = getSessionTokenFromRequest(request);

  const response = NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
  clearSessionCookie(response, request);

  if (token) {
    void revokeSession(token).catch((error) => {
      console.warn("Logout session revoke failed:", error);
    });
  }

  return response;
}
