import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { getSnapshotForUser } from "@/lib/server/dashboard-service";
import {
  AccountsBackendError,
  extractMt5LoginFromAccount,
  requestAccountsBackend,
} from "@/lib/server/accounts-backend";
import { getFullAccountsFromPg } from "@/lib/server/database";
import { query } from "@/lib/server/pg";
import type { TradingAccount, TradingAccountCredentials } from "@/types/dashboard";

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
    const { rows } = await query(
      `SELECT credentials_json::text AS credentials_json, server, server_host, owner_id
       FROM accounts
       WHERE login = $1 AND (owner_id = $2 OR owner_id IS NULL)
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

    // Auto-adopt: if this account has no owner in the DB but the user owns it via
    // their CRM snapshot (already verified above), associate it now so future requests
    // use the faster owner-scoped path in the C++ backend.
    if (!row.owner_id) {
      query(
        `UPDATE accounts SET owner_id = $1, updated_at = NOW()
         WHERE login = $2 AND owner_id IS NULL`,
        [userId, Number(login)],
      ).catch(() => { /* non-critical, ignore */ });
    }

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

/**
 * GET /api/private/accounts/:accountId/stored-credentials
 *
 * Returns the raw trading and investor passwords for an account.
 * Resolution order:
 *   1. Dedicated C++ credentials endpoint (fastest, reads credentials_json by login)
 *   2. Local Next.js JSONB snapshot (if the account has credentials stored there)
 *   3. Direct PostgreSQL query on the accounts table (when backend is unreachable)
 *
 * Ownership is verified by finding the account in the user's snapshot or in the
 * PostgreSQL accounts table filtered by owner_id before returning any credentials.
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

  // Security gate: confirm the user owns this account.
  // First check the fast local JSONB snapshot; fall back to PG accounts table.
  const localSnapshot = await getSnapshotForUser(auth.user.id);
  let localAccount = findAccountByIdOrLogin(localSnapshot.tradingAccounts, accountId);

  if (!localAccount) {
    try {
      const pgAccounts = await getFullAccountsFromPg(auth.user.id, auth.user.brokerId);
      localAccount = findAccountByIdOrLogin(pgAccounts, accountId);
    } catch {
      // PG fallback failed — ownership cannot be confirmed
    }
    if (!localAccount) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
  }

  const login = resolveLoginFromAccountId(accountId) ?? extractMt5LoginFromAccount(localAccount);

  if (!login) {
    return NextResponse.json({ error: "Invalid MT5 login." }, { status: 400 });
  }

  // Tier 1: dedicated C++ endpoint that reads credentials_json by login number.
  // Short timeout — the PG fallback is fast; no point blocking the modal for 15 s.
  try {
    const result = await requestAccountsBackend<{ credentials: TradingAccountCredentials }>(
      `/accounts/${encodeURIComponent(login)}/credentials`,
      { timeoutMs: 3_000 },
    );

    if (result.credentials) {
      return NextResponse.json({ ok: true, credentials: result.credentials });
    }
  } catch (error) {
    if (!(error instanceof AccountsBackendError && error.status === 404)) {
      console.warn("[stored-credentials] C++ credentials fetch failed", {
        login,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  // Tier 2: credentials stored in the local JSONB snapshot.
  if (localAccount.credentials) {
    return NextResponse.json({ ok: true, credentials: localAccount.credentials });
  }

  // Tier 3: read credentials_json directly from PostgreSQL (backend unreachable).
  const pgCredentials = await readCredentialsFromPg(login, auth.user.id);
  if (pgCredentials) {
    return NextResponse.json({ ok: true, credentials: pgCredentials });
  }

  return NextResponse.json(
    {
      ok: false,
      error:
        "No credentials stored for this account. This account may have been created before credential storage was enabled.",
      code: "NO_CREDENTIALS",
    },
    { status: 404 },
  );
}
