import { NextResponse } from "next/server";

import { resolveAccountsBackendBaseUrl } from "@/lib/server/accounts-backend";

const REQUEST_HEADER_ALLOWLIST = new Set([
  "accept",
  "content-type",
  "user-agent",
]);

const RESPONSE_HEADER_ALLOWLIST = new Set([
  "cache-control",
  "content-type",
  "expires",
  "location",
  "pragma",
]);

const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, "");

const DEFAULT_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const copyAllowedHeaders = (
  source: Headers,
  allowlist: ReadonlySet<string>,
): Headers => {
  const target = new Headers();

  for (const [key, value] of source.entries()) {
    if (allowlist.has(key.toLowerCase())) {
      target.set(key, value);
    }
  }

  return target;
};

export const proxyBackendResponse = async (
  request: Request,
  backendPath: string,
  options?: {
    body?: BodyInit | null;
    headers?: HeadersInit;
    method?: string;
  },
): Promise<NextResponse> => {
  const targetUrl = `${resolveAccountsBackendBaseUrl()}/${trimLeadingSlash(backendPath)}`;
  const method = options?.method ?? request.method;
  const headers = copyAllowedHeaders(request.headers, REQUEST_HEADER_ALLOWLIST);

  if (options?.headers) {
    const explicitHeaders = new Headers(options.headers);
    for (const [key, value] of explicitHeaders.entries()) {
      headers.set(key, value);
    }
  }

  let body = options?.body;
  if (body === undefined && method !== "GET" && method !== "HEAD") {
    const requestBuffer = await request.arrayBuffer();
    body = requestBuffer.byteLength > 0 ? requestBuffer : undefined;
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Backend request failed.",
      },
      { status: 502, headers: DEFAULT_NO_STORE_HEADERS },
    );
  }

  const responseHeaders = copyAllowedHeaders(
    upstream.headers,
    RESPONSE_HEADER_ALLOWLIST,
  );
  if (!responseHeaders.has("cache-control")) {
    responseHeaders.set("Cache-Control", DEFAULT_NO_STORE_HEADERS["Cache-Control"]);
  }
  if (!responseHeaders.has("pragma")) {
    responseHeaders.set("Pragma", DEFAULT_NO_STORE_HEADERS.Pragma);
  }
  if (!responseHeaders.has("expires")) {
    responseHeaders.set("Expires", DEFAULT_NO_STORE_HEADERS.Expires);
  }

  if (method === "HEAD") {
    return new NextResponse(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const responseBuffer = await upstream.arrayBuffer();
  return new NextResponse(
    responseBuffer.byteLength > 0 ? responseBuffer : null,
    {
      status: upstream.status,
      headers: responseHeaders,
    },
  );
};
