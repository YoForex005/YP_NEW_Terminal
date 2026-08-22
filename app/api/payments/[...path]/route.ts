import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { proxyBackendResponse } from "@/lib/server/backend-response-proxy";

interface RouteContext {
  params: Promise<{
    path: string[];
  }>;
}

const sanitizePaymentsProxyPath = (path: string[] | undefined): string[] | null => {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  for (const segment of segments) {
    if (
      segment === "." ||
      segment === ".." ||
      segment.includes("\\") ||
      segment.includes("\0") ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(segment)
    ) {
      return null;
    }
  }
  return segments;
};

const proxyPaymentsRoute = async (
  request: NextRequest,
  { params }: RouteContext,
) => {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const safePath = sanitizePaymentsProxyPath((await params).path);
  if (!safePath) {
    return NextResponse.json({ error: "Invalid payments proxy path" }, { status: 400 });
  }

  const backendPath = `/api/payments/${safePath.map(encodeURIComponent).join("/")}`;
  // Forward auth after session validation so the backend can re-check identity.
  return proxyBackendResponse(request, backendPath, {
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      authorization: request.headers.get("authorization") ?? "",
      "x-user-id": auth.user.id,
    },
  });
};

export const GET = proxyPaymentsRoute;
export const POST = proxyPaymentsRoute;
