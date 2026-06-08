import { NextResponse } from "next/server";

import {
  issueBackendSessionForCredentials,
  issueSessionForCredentials,
  setSessionCookie,
} from "@/lib/server/auth";
import { getUserByEmail, registerUser } from "@/lib/server/database";
import { hashPassword } from "@/lib/server/password";

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
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const response = NextResponse.json(
    {
      user: authResult.user,
    },
    { status: 200 },
  );

  setSessionCookie(response, authResult.token, authResult.session.expiresAt, request);
  return response;
}
