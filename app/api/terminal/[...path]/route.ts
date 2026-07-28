import { NextRequest, NextResponse } from "next/server";

const TERMINAL_PROXY_TIMEOUT_MS = 15_000;
const DEFAULT_TERMINAL_PROXY_ORIGIN = "https://terminal.yopips.com";

const isUsableHttpOrigin = (value: string | undefined): value is string => {
  const normalized = value?.trim() ?? "";
  if (!normalized) return false;
  // "proxy" / same-origin are browser client flags, not upstream origins.
  if (["proxy", "same-origin", "same_origin"].includes(normalized.toLowerCase())) {
    return false;
  }
  return /^https?:\/\//i.test(normalized);
};

const getTerminalBackendBase = (): string => {
  const candidates = [
    process.env.TERMINAL_API_BASE,
    process.env.RUST_GATEWAY_PUBLIC_API_BASE_URL,
    process.env.RUST_GATEWAY_HTTP_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.ACCOUNTS_BACKEND_URL,
  ];
  for (const candidate of candidates) {
    if (isUsableHttpOrigin(candidate)) {
      return candidate.trim().replace(/\/+$/, "");
    }
  }
  return "http://127.0.0.1:3001";
};

const getTerminalProxyOrigin = (): string => {
  const candidates = [
    process.env.TERMINAL_PROXY_ORIGIN,
    process.env.NEXT_PUBLIC_TERMINAL_ORIGIN,
    DEFAULT_TERMINAL_PROXY_ORIGIN,
  ];
  for (const candidate of candidates) {
    const normalized = candidate?.trim().replace(/\/+$/, "") ?? "";
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
  }
  return DEFAULT_TERMINAL_PROXY_ORIGIN;
};

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

  if (accept) headers.set("accept", accept);
  if (authorization) headers.set("authorization", authorization);
  if (contentType) headers.set("content-type", contentType);
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", getTerminalProxyOrigin());

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const controller = new AbortController();

  try {
    timeoutId = setTimeout(() => controller.abort(), TERMINAL_PROXY_TIMEOUT_MS);
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text(),
      cache: "no-store",
      signal: controller.signal,
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
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Terminal backend did not respond within ${TERMINAL_PROXY_TIMEOUT_MS}ms.`
        : "Terminal backend is unreachable from the Next.js proxy.";
    console.warn("[terminal-proxy] upstream request failed", {
      targetUrl,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: message,
        code: "TERMINAL_BACKEND_UNREACHABLE",
        upstream: getTerminalBackendBase(),
      },
      { status: 502 },
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const GET = proxyTerminalRequest;
export const POST = proxyTerminalRequest;
