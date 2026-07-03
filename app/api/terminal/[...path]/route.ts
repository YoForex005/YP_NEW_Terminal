import { NextRequest, NextResponse } from "next/server";

const getTerminalBackendBase = (): string =>
  (
    process.env.TERMINAL_API_BASE ||
    process.env.NEXT_PUBLIC_TERMINAL_API_BASE ||
    process.env.RUST_GATEWAY_PUBLIC_API_BASE_URL ||
    process.env.RUST_GATEWAY_HTTP_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/+$/, "");

const buildTargetUrl = (request: NextRequest, path: string[]): string => {
  const target = new URL(`/api/terminal/${path.join("/")}`, getTerminalBackendBase());
  target.search = request.nextUrl.search;
  return target.toString();
};

const proxyTerminalRequest = async (
  request: NextRequest,
  context: { params: { path?: string[] } },
): Promise<NextResponse> => {
  const targetUrl = buildTargetUrl(request, context.params.path ?? []);
  const headers = new Headers();

  const authorization = request.headers.get("authorization");
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");
  const origin = request.headers.get("origin") ?? request.nextUrl.origin;

  if (accept) headers.set("accept", accept);
  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", origin);

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text(),
    cache: "no-store",
  });

  const responseBody = await response.text();
  const nextResponse = new NextResponse(responseBody, {
    status: response.status,
    statusText: response.statusText,
  });

  const responseContentType = response.headers.get("content-type");
  if (responseContentType) {
    nextResponse.headers.set("content-type", responseContentType);
  }

  return nextResponse;
};

export const GET = proxyTerminalRequest;
export const POST = proxyTerminalRequest;
