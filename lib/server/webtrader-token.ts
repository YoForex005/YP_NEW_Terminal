/**
 * Webtrader Session Token
 *
 * Generates a short-lived, HMAC-SHA256-signed token that the frontend
 * passes to the WebSocket server to authenticate without exposing
 * raw MT5 credentials over the socket. The backend validates the signature
 * and extracts the credentials internally.
 *
 * Shared secret: WEBTRADER_TOKEN_SECRET (must match in both frontend .env and backend .env)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { resolveBackendEnvValue } from "@/lib/server/backend-env";

const TERMINAL_GROUP_SCOPE = "webtrader_terminal_group_v1";

const DEFAULT_TTL_SECONDS = 600;

function getTtlMs(): number {
  const configured =
    process.env.WEBTRADER_TOKEN_TTL_SECONDS?.trim() ||
    process.env.NEXT_PUBLIC_WEBTRADER_TOKEN_TTL_SECONDS?.trim();
  const seconds = Number(configured);
  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : DEFAULT_TTL_SECONDS * 1000;
}

const TTL_MS = getTtlMs(); // Default 10 minutes, enough time for manual WebSocket testing.

export function getWebtraderTokenTtlMs(): number {
  return TTL_MS;
}

export interface WebtraderTokenPayload {
  userId: string;
  accountId: string;
  authMode?: "manager";
  terminalSessionId?: string;
  login: number;
  brokerId?: string;
  server: string;
  group?: string;
  scope?: "webtrader_terminal_group_v1";
  tradingPassword?: string;
  exp: number; // unix ms
}

export interface CreatedWebtraderToken {
  token: string;
  expiresAt: number;
}

function getSecret(): string {
  const secret =
    process.env.WEBTRADER_TOKEN_SECRET?.trim() ||
    resolveBackendEnvValue("WEBTRADER_TOKEN_SECRET") ||
    resolveBackendEnvValue("JWT_SECRET");
  if (!secret) {
    throw new Error(
      "WEBTRADER_TOKEN_SECRET is not set in environment. Add it to both frontend and backend .env files.",
    );
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Create a short-lived signed token and return the exact expiry embedded in it.
 */
export function createWebtraderTokenWithExpiry(
  payload: Omit<WebtraderTokenPayload, "exp">,
): CreatedWebtraderToken {
  const expiresAt = Date.now() + TTL_MS;
  const full: WebtraderTokenPayload = {
    ...payload,
    authMode: payload.authMode ?? "manager",
    exp: expiresAt,
  };
  full.server = full.server.trim();
  if (!full.server) {
    throw new Error("Webtrader token requires a non-empty server");
  }
  if (!full.brokerId?.trim()) {
    delete full.brokerId;
  } else {
    full.brokerId = full.brokerId.trim();
  }
  if (!full.tradingPassword) {
    delete full.tradingPassword;
  }
  if (!full.group?.trim()) {
    delete full.group;
    delete full.scope;
  } else {
    full.group = full.group.trim();
    full.scope = TERMINAL_GROUP_SCOPE;
  }

  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = sign(body, getSecret());
  return { token: `${body}.${sig}`, expiresAt };
}

/**
 * Create a short-lived signed token for the given account.
 */
export function createWebtraderToken(payload: Omit<WebtraderTokenPayload, "exp">): string {
  return createWebtraderTokenWithExpiry(payload).token;
}

/**
 * Verify and decode a webtrader token.
 * Throws if invalid, expired, or tampered.
 */
export function verifyWebtraderToken(token: string): WebtraderTokenPayload {
  const secret = getSecret();
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) {
    throw new Error("Malformed token");
  }
  const body = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const expected = sign(body, secret);

  // Timing-safe comparison
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(sig, "utf8");
  const sigMatch =
    expectedBuf.length === actualBuf.length &&
    timingSafeEqual(expectedBuf, actualBuf);

  if (!sigMatch) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as WebtraderTokenPayload;

  payload.server = payload.server?.trim() ?? "";
  if (!payload.server) {
    throw new Error("Terminal token is missing server");
  }
  if (!payload.brokerId?.trim()) {
    delete payload.brokerId;
  } else {
    payload.brokerId = payload.brokerId.trim();
  }

  if (!payload.group?.trim()) {
    delete payload.group;
  } else {
    payload.group = payload.group.trim();
  }

  if (payload.scope === TERMINAL_GROUP_SCOPE && !payload.group) {
    throw new Error("Terminal token is missing group for scoped terminal sessions");
  }

  if (Date.now() > payload.exp) {
    throw new Error("Token expired");
  }

  return payload;
}
