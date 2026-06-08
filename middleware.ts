import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const AUTH_REDIRECT_PATHS = new Set(["/login", "/register"]);
const PUBLIC_BYPASS_PATHS = new Set([
  "/health",
  "/login",
  "/register",
  "/webtrader/login",
]);

const isPublicPath = (pathname: string): boolean =>
  PUBLIC_BYPASS_PATHS.has(pathname) ||
  pathname.startsWith("/api/auth") ||
  pathname.startsWith("/_next") ||
  pathname === "/favicon.ico";

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname === "[::1]";

const isDevAutoAuthEnabled = (request: NextRequest): boolean => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const configured = process.env.DEV_AUTO_AUTH?.trim().toLowerCase();
  if (configured !== "1" && configured !== "true" && configured !== "on") {
    return false;
  }

  return isLoopbackHostname(request.nextUrl.hostname);
};

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const hasBearerToken = /^Bearer\s+\S+/i.test(
    request.headers.get("authorization") ?? "",
  );
  const hasDevAutoAuth = isDevAutoAuthEnabled(request);

  if (pathname.startsWith("/api/private")) {
    if (!hasSession && !hasBearerToken && !hasDevAutoAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    // DEV_AUTO_AUTH keeps developers auto-authenticated but must NOT block /login —
    // logout explicitly navigates there and should always be reachable.
    if (AUTH_REDIRECT_PATHS.has(pathname) && hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession && !hasDevAutoAuth && !pathname.startsWith("/api")) {
    const loginUrl = new URL("/login", request.url);
    const next = `${pathname}${search}`;
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};

