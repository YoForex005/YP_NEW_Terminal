import { NextResponse } from "next/server";

import {
  issueBackendSessionForCredentials,
  issueSessionForCredentials,
  setSessionCookie,
} from "@/lib/server/auth";
import { getUserByEmail, registerUser } from "@/lib/server/database";
import { hashPassword } from "@/lib/server/password";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getClientIpFromRequest,
} from "@/lib/server/rate-limit";

const LOGIN_IP_LIMIT = 20;
const LOGIN_EMAIL_LIMIT = 8;
const LOGIN_RATE_WINDOW_MS = 15 * 60_000;

interface LoginRequestBody {
  email?: string;
  password?: string;
}

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname === "[::1]";

const shouldProvisionMissingDevUser = (request: Request): boolean => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const configured = process.env.DEV_AUTO_PROVISION_USERS?.trim().toLowerCase();
  if (configured === "0" || configured === "false" || configured === "off") {
    return false;
  }

  try {
    return isLoopbackHostname(new URL(request.url).hostname);
  } catch {
    return false;
  }
};

const nameFromEmail = (email: string): string => {
  const localPart = email.split("@")[0]?.trim() || "User";
  return (
    localPart
      .replace(/[._+-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "User"
  );
};

const issueDevelopmentSessionForMissingUser = async (
  request: Request,
  email: string,
  password: string,
): Promise<Awaited<ReturnType<typeof issueSessionForCredentials>>> => {
  if (!shouldProvisionMissingDevUser(request) || password.length < 8) {
    return null;
  }

  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return null;
    }

    await registerUser({
      email,
      name: nameFromEmail(email),
      phone: "",
      country: "",
      passwordHash: hashPassword(password),
    });
  } catch (err) {
    console.warn(
      "[auth] dev user provisioning skipped (DB unavailable?):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  return issueSessionForCredentials(email, password);
};

export async function POST(request: Request) {
  let payload: LoginRequestBody;

  try {
    payload = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const email = payload.email?.trim() ?? "";
  const password = payload.password ?? "";
  const normalizedEmail = email.toLowerCase();
  const ip = getClientIpFromRequest(request);

  // Rate limit by IP and email separately so one attacker cannot spray many accounts
  // from one IP without limit, and one email cannot be brute-forced from many IPs freely.
  const ipRate = consumeRateLimit(`login:ip:${ip}`, {
    limit: LOGIN_IP_LIMIT,
    windowMs: LOGIN_RATE_WINDOW_MS,
  });
  const emailRate = consumeRateLimit(`login:email:${normalizedEmail || "empty"}`, {
    limit: LOGIN_EMAIL_LIMIT,
    windowMs: LOGIN_RATE_WINDOW_MS,
  });
  const limited = !ipRate.ok
    ? ipRate
    : !emailRate.ok
      ? emailRate
      : null;

  if (limited) {
    const headers = new Headers();
    applyRateLimitHeaders(headers, limited);
    return NextResponse.json(
      {
        error: "Too many login attempts. Please try again later.",
        code: "RATE_LIMITED",
        retryAfterSec: limited.retryAfterSec,
      },
      { status: 429, headers },
    );
  }

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const authResult =
    (await issueSessionForCredentials(email, password)) ??
    (await issueBackendSessionForCredentials(email, password)) ??
    (await issueDevelopmentSessionForMissingUser(request, email, password));
  if (!authResult) {
    const headers = new Headers();
    applyRateLimitHeaders(headers, emailRate.ok ? emailRate : ipRate);
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401, headers },
    );
  }

  const response = NextResponse.json(
    {
      user: authResult.user,
    },
    { status: 200 },
  );
  applyRateLimitHeaders(response.headers, emailRate.ok ? emailRate : ipRate);

  setSessionCookie(response, authResult.token, authResult.session.expiresAt, request);
  return response;
}
