import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import {
  AccountsBackendError,
  extractMt5LoginFromAccount,
  requestAccountsBackend,
} from "@/lib/server/accounts-backend";
import { getFullAccountsFromPg, getUserById } from "@/lib/server/database";
import { verifyPassword } from "@/lib/server/password";
import { query } from "@/lib/server/pg";
import {
  applyRateLimitHeaders,
  consumeRateLimit,
  getClientIpFromRequest,
} from "@/lib/server/rate-limit";
import type { TradingAccount, TradingAccountCredentials } from "@/types/dashboard";

const STEP_UP_RATE_LIMIT = 5;
const STEP_UP_RATE_WINDOW_MS = 10 * 60_000;

interface RouteContext {
  params: {
    accountId: string;
  };
}

const findAccountByIdOrLogin = (
  accounts: TradingAccount[],
  accountId: string,
): TradingAccount | null => {
  const trimmed = accountId.trim();
  const stripped = trimmed.replace(/^mt5-/, "");

  return (
    accounts.find(
      (a) =>
        a.id === trimmed ||
        a.accountNumber === stripped ||
        extractMt5LoginFromAccount(a) === stripped,
    ) ?? null
  );
};

const resolveLoginFromAccountId = (accountId: string): string | null => {
  const stripped = accountId.trim().replace(/^mt5-/, "");
  return /^\d+$/.test(stripped) ? stripped : null;
};

/**
 * Reads credentials_json directly from the PostgreSQL accounts table.
 * Used as a last-resort fallback when the C++ backend is unreachable and the
 * local JSONB snapshot does not carry credentials.
 */
const readCredentialsFromPg = async (
  login: string,
  userId: string,
): Promise<TradingAccountCredentials | null> => {
  if (!/^\d+$/.test(login)) return null;
  try {
    // Fail-closed: only return credentials for rows this user already owns.
    // Never match owner_id IS NULL and never auto-adopt ownership from a credential read.
    const { rows } = await query(
      `SELECT credentials_json::text AS credentials_json, server, server_host, owner_id
       FROM accounts
       WHERE login = $1 AND owner_id = $2
       LIMIT 1`,
      [Number(login), userId],
    );
    if (rows.length === 0) return null;

    const row = rows[0] as {
      credentials_json?: string;
      server?: string;
      server_host?: string;
      owner_id?: string | null;
    };
    if (!row.credentials_json) return null;

    const raw = JSON.parse(row.credentials_json) as Partial<TradingAccountCredentials>;
    const server = raw.server?.trim() || row.server_host?.trim() || row.server?.trim() || "";
    return {
      login: raw.login?.trim() || login,
      server,
      tradingPassword: raw.tradingPassword ?? "",
      investorPassword: raw.investorPassword ?? "",
      generatedAt: raw.generatedAt ?? "",
      source: raw.source ?? "broker",
    };
  } catch {
    return null;
  }
};

const resolveOwnedAccount = async (
  userId: string,
  brokerId: string | null | undefined,
  accountId: string,
): Promise<{ account: TradingAccount; login: string } | null> => {
  const localSnapshot = await getSnapshotForUser(userId);
  let localAccount = findAccountByIdOrLogin(localSnapshot.tradingAccounts, accountId);

  if (!localAccount) {
    try {
      const pgAccounts = await getFullAccountsFromPg(userId, brokerId);
      localAccount = findAccountByIdOrLogin(pgAccounts, accountId);
    } catch {
      // PG fallback failed — ownership cannot be confirmed
    }
  }

  if (!localAccount) {
    return null;
  }

  const login = resolveLoginFromAccountId(accountId) ?? extractMt5LoginFromAccount(localAccount);
  if (!login) {
    return null;
  }

  return { account: localAccount, login };
};

const loadStoredCredentials = async (
  login: string,
  userId: string,
  localAccount: TradingAccount,
): Promise<TradingAccountCredentials | null> => {
  // Tier 1: dedicated C++ endpoint.
  try {
    const result = await requestAccountsBackend<{ credentials: TradingAccountCredentials }>(
      `/accounts/${encodeURIComponent(login)}/credentials`,
      { timeoutMs: 3_000 },
    );
    if (result.credentials) {
      return result.credentials;
    }
  } catch (error) {
    if (!(error instanceof AccountsBackendError && error.status === 404)) {
      console.warn("[stored-credentials] C++ credentials fetch failed", {
        login,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  // Tier 2: credentials stored in the local JSONB snapshot (server-side only).
  if (localAccount.credentials) {
    return localAccount.credentials;
  }

  // Tier 3: PostgreSQL credentials_json for owned rows.
  return readCredentialsFromPg(login, userId);
};

/**
 * GET /api/private/accounts/:accountId/stored-credentials
 *
 * Metadata only — never returns raw MT5 passwords.
 * Use POST with CRM password step-up to reveal secrets.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  const owned = await resolveOwnedAccount(auth.user.id, auth.user.brokerId, accountId);
  if (!owned) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const stored = await loadStoredCredentials(owned.login, auth.user.id, owned.account);
  return NextResponse.json({
    ok: true,
    requiresStepUp: true,
    login: owned.login,
    server:
      stored?.server?.trim() ||
      owned.account.credentials?.server?.trim() ||
      owned.account.serverIp?.trim() ||
      "",
    hasTradingPassword: Boolean(stored?.tradingPassword?.trim()),
    hasInvestorPassword: Boolean(stored?.investorPassword?.trim()),
    // No passwords on GET — force step-up via POST.
  });
}

/**
 * POST /api/private/accounts/:accountId/stored-credentials
 *
 * Step-up: re-enter CRM password to reveal stored MT5 credentials.
 * Body: { password: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = (await context.params).accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required." }, { status: 400 });
  }

  const ip = getClientIpFromRequest(request);
  const rateKey = `stored-credentials-stepup:${auth.user.id}:${ip}`;
  const rate = consumeRateLimit(rateKey, {
    limit: STEP_UP_RATE_LIMIT,
    windowMs: STEP_UP_RATE_WINDOW_MS,
  });
  const headers = new Headers();
  applyRateLimitHeaders(headers, rate);
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: "Too many credential reveal attempts. Try again later.",
        code: "RATE_LIMITED",
        retryAfterSec: rate.retryAfterSec,
      },
      { status: 429, headers },
    );
  }

  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }

  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json(
      {
        error: "CRM password is required to reveal stored credentials.",
        code: "STEP_UP_REQUIRED",
      },
      { status: 400, headers },
    );
  }

  const dbUser = await getUserById(auth.user.id);
  if (!dbUser?.passwordHash || !verifyPassword(password, dbUser.passwordHash)) {
    return NextResponse.json(
      {
        error: "Invalid CRM password.",
        code: "STEP_UP_FAILED",
      },
      { status: 401, headers },
    );
  }

  const owned = await resolveOwnedAccount(auth.user.id, auth.user.brokerId, accountId);
  if (!owned) {
    return NextResponse.json({ error: "Account not found." }, { status: 404, headers });
  }

  const credentials = await loadStoredCredentials(owned.login, auth.user.id, owned.account);
  if (!credentials) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No credentials stored for this account. This account may have been created before credential storage was enabled.",
        code: "NO_CREDENTIALS",
      },
      { status: 404, headers },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      credentials,
      revealedAt: new Date().toISOString(),
    },
    { status: 200, headers },
  );
}
