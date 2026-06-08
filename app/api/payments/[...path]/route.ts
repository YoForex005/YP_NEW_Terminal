import type { NextRequest } from "next/server";

import { proxyBackendResponse } from "@/lib/server/backend-response-proxy";

interface RouteContext {
  params: {
    path: string[];
  };
}

const proxyPaymentsRoute = async (
  request: NextRequest,
  { params }: RouteContext,
) => {
  const backendPath = `/api/payments/${params.path.join("/")}`;
  return proxyBackendResponse(request, backendPath);
};

export const GET = proxyPaymentsRoute;
export const POST = proxyPaymentsRoute;
