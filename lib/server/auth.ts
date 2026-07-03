import { randomBytes } from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { DEV_LOGGED_OUT_COOKIE_NAME, SESSION_COOKIE_NAME, SESSION_TTL_MS } from "@/lib/auth/constants";
import { resolveAccountsBackendBaseUrl } from "@/lib/server/accounts-backend";
import {
  deleteSession,
  getFirstUser,
  getSessionByToken,
  getUserByEmail,
  getUserById,
  upsertSession,
  upsertUser,
  type AppSession,
  type AppUser,
} from "@/lib/server/database";
import { verifyPassword } from "@/lib/server/password";

export interface AuthUser {
  id: string;
  brokerId?: string;
  email: string;
  name: string;
  role: "admin" | "user";
  emailVerified?: string;
  mobileVerified?: string;
  profileVerified?: string;
  country?: string;
  kycData?: any;
}

export interface AuthContext {
  user: AuthUser;
  session: AppSession;
  token: string;
}

const secureCookie = process.env.NODE_ENV === "production";
type CookieRequestContext = Pick<Request, "url"> | NextRequest;
const BACKEND_AUTH_TIMEOUT_MS = 1_000;

// Shared circuit state with the DB layer — both call port 3002, so a DB
// failure implies auth will also fail. Using the same globalThis key means
// openDbCircuit() in database.ts automatically gates auth calls too.
const CIRCUIT_OPEN_MS = 10_000;
const authCircuit = globalThis as typeof globalThis & {
  __dbCircuitOpenAt?: number | null; // same key as database.ts
};
const isAuthCircuitOpen = (): boolean =>
  authCircuit.__dbCircuitOpenAt != null &&
  Date.now() - authCircuit.__dbCircuitOpenAt < CIRCUIT_OPEN_MS;
const openAuthCircuit = (): void => { authCircuit.__dbCircuitOpenAt = Date.now(); };
const closeAuthCircuit = (): void => { authCircuit.__dbCircuitOpenAt = null; };
// 30 s — long enough that repeated API calls within a page load hit the cache,
// but short enough that role/session changes propagate quickly.
const AUTH_CONTEXT_CACHE_TTL_MS = 30_000;

type AuthContextCacheEntry = {
  context: AuthContext;
  expiresAt: number;
};
const authGlobal = globalThis as typeof globalThis & {
  __authContextCache?: Map<string, AuthContextCacheEntry>;
};
if (!authGlobal.__authContextCache) {
  authGlobal.__authContextCache = new Map();
}

const cloneAuthContext = (context: AuthContext): AuthContext => ({
  user: { ...context.user },
  session: { ...context.session },
  token: context.token,
});

const getCachedAuthContext = (token: string | null): AuthContext | null => {
  if (!token) {
    return null;
  }

  const entry = authGlobal.__authContextCache?.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    authGlobal.__authContextCache?.delete(token);
    return null;
  }

  return cloneAuthContext(entry.context);
};

const cacheAuthContext = (context: AuthContext): AuthContext => {
  const sessionExpiresAt = Date.parse(context.session.expiresAt);
  const expiresAt = Math.min(
    Date.now() + AUTH_CONTEXT_CACHE_TTL_MS,
    Number.isFinite(sessionExpiresAt) ? sessionExpiresAt : Date.now(),
  );

  if (expiresAt > Date.now()) {
    authGlobal.__authContextCache?.set(context.token, {
      context: cloneAuthContext(context),
      expiresAt,
    });
  }

  return context;
};

const invalidateCachedAuthContext = (token: string): void => {
  authGlobal.__authContextCache?.delete(token);
};

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname === "[::1]";

const shouldUseSecureCookie = (request?: CookieRequestContext): boolean => {
  if (!secureCookie) {
    return false;
  }

  if (!request?.url) {
    return true;
  }

  try {
    const hostname = new URL(request.url).hostname;
    return !isLoopbackHostname(hostname);
  } catch {
    return true;
  }
};

const isDevAutoAuthEnabled = (request: NextRequest): boolean => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const configured = process.env.DEV_AUTO_AUTH?.trim().toLowerCase();
  if (configured !== "1" && configured !== "true" && configured !== "on") {
    return false;
  }

  try {
    return isLoopbackHostname(new URL(request.url).hostname);
  } catch {
    return false;
  }
};

export const toAuthUser = (user: AppUser): AuthUser => ({
  id: user.id,
  brokerId: user.brokerId,
  email: user.email,
  name: user.name,
  role: user.role,
  emailVerified: user.emailVerified,
  mobileVerified: user.mobileVerified,
  profileVerified: user.profileVerified,
  country: user.country,
  kycData: user.kycData,
});

export const getSessionTokenFromRequest = (request: NextRequest): string | null =>
  request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;

const getBearerTokenFromRequest = (request: NextRequest): string | null => {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const validIsoStringOrUndefined = (value: unknown): string | undefined => {
  const candidate = stringOrUndefined(value);
  if (!candidate) {
    return undefined;
  }

  const timestamp = Date.parse(candidate);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
};

const verificationStringOrUndefined = (value: unknown): string | undefined => {
  if (typeof value === "boolean") {
    return String(value);
  }
  return stringOrUndefined(value);
};

const extractBrokerIdFromRecord = (
  record: Record<string, unknown> | null | undefined,
): string | undefined => {
  if (!record) {
    return undefined;
  }

  const broker = asRecord(record.broker);
  return (
    stringOrUndefined(record.brokerId) ??
    stringOrUndefined(record.broker_id) ??
    stringOrUndefined(broker?.id) ??
    stringOrUndefined(broker?.brokerId) ??
    stringOrUndefined(broker?.broker_id)
  );
};

const extractBackendUserPayload = (
  payload: unknown,
): Record<string, unknown> | null => {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }

  const rootUser = asRecord(root.user);
  if (rootUser) {
    return rootUser;
  }

  const data = asRecord(root.data);
  const dataUser = data ? asRecord(data.user) : null;
  if (dataUser) {
    return dataUser;
  }

  if (data && typeof data.id === "string" && typeof data.email === "string") {
    return data;
  }

  if (typeof root.id === "string" && typeof root.email === "string") {
    return root;
  }

  return null;
};

const toAuthUserFromBackendPayload = (payload: unknown): AuthUser | null => {
  const user = extractBackendUserPayload(payload);
  if (!user) {
    return null;
  }
  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;

  const id = stringOrUndefined(user.id);
  const email = stringOrUndefined(user.email);
  if (!id || !email) {
    return null;
  }

  const name =
    stringOrUndefined(user.name) ??
    email
      .split("@")[0]
      ?.replace(/[._+-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() ??
    email;
  const role = user.role === "admin" ? "admin" : "user";

  return {
    id,
    brokerId:
      extractBrokerIdFromRecord(user) ??
      extractBrokerIdFromRecord(data) ??
      extractBrokerIdFromRecord(root),
    email,
    name,
    role,
    emailVerified: verificationStringOrUndefined(user.emailVerified),
    mobileVerified: verificationStringOrUndefined(user.mobileVerified),
    profileVerified: verificationStringOrUndefined(user.profileVerified),
    country: stringOrUndefined(user.country),
    kycData: user.kycData,
  };
};

const extractBackendLoginToken = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;

  return (
    stringOrUndefined(root?.accessToken) ??
    stringOrUndefined(root?.token) ??
    stringOrUndefined(data?.accessToken) ??
    stringOrUndefined(data?.token)
  );
};

const extractBackendLoginExpiresAt = (payload: unknown): string | undefined => {
  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;

  return validIsoStringOrUndefined(root?.expiresAt) ?? validIsoStringOrUndefined(data?.expiresAt);
};

const fetchBackendAuthUser = async (token: string): Promise<AuthUser | null> => {
  if (isAuthCircuitOpen()) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveAccountsBackendBaseUrl()}/api/auth/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        openAuthCircuit();
      }
      return null;
    }

    const payload = (await response.json()) as unknown;
    const user = toAuthUserFromBackendPayload(payload);
    if (user) closeAuthCircuit();
    return user;
  } catch {
    openAuthCircuit();
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const authenticateBackendTokenRequest = async (
  request: NextRequest,
  fallbackToken: string | null,
): Promise<AuthContext | null> => {
  const token = getBearerTokenFromRequest(request) ?? fallbackToken;
  if (!token) {
    return null;
  }

  const user = await fetchBackendAuthUser(token);
  if (!user) {
    return null;
  }

  const now = Date.now();
  const session: AppSession = {
    token,
    userId: user.id,
    brokerId: user.brokerId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  return {
    user,
    session,
    token,
  };
};

export const authenticateRequest = async (
  request: NextRequest,
): Promise<AuthContext | null> => {
  const token = getSessionTokenFromRequest(request);
  const cached = getCachedAuthContext(getBearerTokenFromRequest(request) ?? token);
  if (cached) {
    return cached;
  }

  if (!token) {
    const auth = (
      (await authenticateBackendTokenRequest(request, null)) ??
      (await authenticateDevelopmentRequest(request))
    );
    return auth ? cacheAuthContext(auth) : null;
  }

  let session = null;
  try {
    session = await getSessionByToken(token);
  } catch (err) {
    console.warn("[auth] local session lookup failed (DB unavailable?):", err instanceof Error ? err.message : err);
  }

  if (session) {
    try {
      const user = await getUserById(session.userId);
      if (user) {
        const authUser = toAuthUser(user);
        const context: AuthContext = {
          user: {
            ...authUser,
            brokerId: session.brokerId ?? authUser.brokerId,
          },
          session,
          token,
        };
        return cacheAuthContext(context);
      }
    } catch (err) {
      console.warn("[auth] user lookup failed (DB unavailable?):", err instanceof Error ? err.message : err);
    }
  }

  const auth = (
    (await authenticateBackendTokenRequest(request, token)) ??
    (await authenticateDevelopmentRequest(request))
  );
  return auth ? cacheAuthContext(auth) : null;
};

const authenticateDevelopmentRequest = async (
  request: NextRequest,
): Promise<AuthContext | null> => {
  if (!isDevAutoAuthEnabled(request)) {
    return null;
  }

  // If the user explicitly logged out, don't auto-authenticate until they log in again.
  // if (request.cookies.get(DEV_LOGGED_OUT_COOKIE_NAME)?.value === "1") {
  //   return null;
  // }

  const adminEmail =
    process.env.APP_ADMIN_EMAIL?.trim().toLowerCase() || "admin@dominionmarkets.local";
  let user: AppUser | null = null;
  try {
    user = (await getUserByEmail(adminEmail)) ?? (await getFirstUser());
  } catch (err) {
    console.warn(
      "[auth] dev auto-auth DB lookup failed; using local fallback user:",
      err instanceof Error ? err.message : err,
    );
  }

  const now = Date.now();
  const fallbackUser: AuthUser = {
    id: "dev-auto-user",
    email: adminEmail,
    name: "Local Developer",
    role: "admin",
    emailVerified: "verified",
    mobileVerified: "verified",
    profileVerified: "verified",
  };
  const session: AppSession = {
    token: "dev-auto-auth",
    userId: user?.id ?? fallbackUser.id,
    brokerId: user?.brokerId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  return {
    user: user ? toAuthUser(user) : fallbackUser,
    session,
    token: session.token,
  };
};

export const issueBackendSessionForCredentials = async (
  email: string,
  password: string,
): Promise<{ user: AuthUser; session: AppSession; token: string } | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BACKEND_AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveAccountsBackendBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    const token = extractBackendLoginToken(payload);
    const user = toAuthUserFromBackendPayload(payload);
    if (!token || !user) {
      return null;
    }

    const now = Date.now();
    const session: AppSession = {
      token,
      userId: user.id,
      brokerId: user.brokerId,
      createdAt: new Date(now).toISOString(),
      expiresAt: extractBackendLoginExpiresAt(payload) ?? new Date(now + SESSION_TTL_MS).toISOString(),
    };

    // Cache user + session in the local DB so auth survives C++ restarts.
    // Non-fatal: C++ backend auth still serves as fallback while it is up.
    try {
      await upsertUser({ id: user.id, email: user.email, name: user.name, brokerId: user.brokerId, role: user.role });
      await upsertSession(user.id, token, user.brokerId);
    } catch {
      // intentionally ignored
    }

    return {
      user,
      session,
      token,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const issueSessionForCredentials = async (
  email: string,
  password: string,
): Promise<{ user: AuthUser; session: AppSession; token: string } | null> => {
  try {
    const user = await getUserByEmail(email);
    if (!user) {
      return null;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return null;
    }

    const token = randomBytes(32).toString("hex");
    const session = await upsertSession(user.id, token, user.brokerId);
    return {
      user: toAuthUser(user),
      session,
      token,
    };
  } catch (err) {
    console.warn(
      "[auth] local credential login failed (DB unavailable?):",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
};

export const revokeSession = async (token: string | null | undefined): Promise<void> => {
  if (!token) return;
  invalidateCachedAuthContext(token);
  await deleteSession(token);
};

export const setSessionCookie = (
  response: NextResponse,
  token: string,
  expiresAtIso: string,
  request?: CookieRequestContext,
): void => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAtIso),
  });
  // Clear the dev logout flag so DEV_AUTO_AUTH resumes after the next explicit login.
  response.cookies.set({
    name: DEV_LOGGED_OUT_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
};

export const clearSessionCookie = (
  response: NextResponse,
  request?: CookieRequestContext,
): void => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  // Signal that the user explicitly logged out so DEV_AUTO_AUTH won't immediately
  // re-authenticate them via authenticateDevelopmentRequest.
  response.cookies.set({
    name: DEV_LOGGED_OUT_COOKIE_NAME,
    value: "1",
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 h — long enough to survive a page reload
  });
};
