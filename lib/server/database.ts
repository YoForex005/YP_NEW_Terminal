import { randomUUID } from "node:crypto";

import { SESSION_TTL_MS } from "@/lib/auth/constants";
import type { DashboardSnapshot, SocialStrategy, TradingAccount, TradingAccountCredentials } from "@/types/dashboard";
import { query } from "@/lib/server/pg";

export interface AppUser {
  id: string;
  brokerId?: string;
  email: string;
  name: string;
  phone?: string;
  country?: string;
  role: "admin" | "user";
  passwordHash: string;
  createdAt: string;
  emailVerified?: string;
  mobileVerified?: string;
  profileVerified?: string;
  kycData?: any;
}

export interface AppSession {
  token: string;
  userId: string;
  brokerId?: string;
  createdAt: string;
  expiresAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  type?: "info" | "success" | "warning" | "error";
}

// ─── Row-to-model mappers ────────────────────────────────────────────────────

const rowToUser = (row: any): AppUser => ({
  id: row.id,
  brokerId: row.broker_id ?? undefined,
  email: row.email,
  name: row.name,
  phone: row.phone ?? undefined,
  country: row.country ?? undefined,
  role: row.role === "admin" ? "admin" : "user",
  passwordHash: row.password_hash ?? "",
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  emailVerified: row.email_verified ? "verified" : undefined,
  mobileVerified: row.mobile_verified ? "verified" : undefined,
  profileVerified: row.profile_verified ? "verified" : undefined,
  kycData: row.kyc_data ?? undefined,
});

const rowToSession = (row: any): AppSession => ({
  token: row.token,
  userId: row.user_id,
  brokerId: row.broker_id ?? undefined,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
});

const rowToNotification = (row: any): AppNotification => ({
  id: row.id,
  title: row.title,
  message: row.message,
  timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  isRead: Boolean(row.is_read),
  type: row.type as AppNotification["type"] ?? "info",
});

const createEmptyDashboardSnapshot = (): DashboardSnapshot => ({
  marketInstruments: [],
  tradingSessions: [],
  wallets: { USD: 0, EUR: 0 },
  positions: [],
  transactions: [],
  pnlSeries: [],
  tradingAccounts: [],
});

// ─── Exported DB functions ───────────────────────────────────────────────────

export const getUserByEmail = async (email: string): Promise<AppUser | null> => {
  const { rows } = await query(
    "SELECT * FROM app_users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [email.trim()],
  );
  return rows.length > 0 ? rowToUser(rows[0]) : null;
};

export const getUserById = async (userId: string): Promise<AppUser | null> => {
  const { rows } = await query("SELECT * FROM app_users WHERE id = $1 LIMIT 1", [userId]);
  return rows.length > 0 ? rowToUser(rows[0]) : null;
};

export const getFirstUser = async (): Promise<AppUser | null> => {
  const { rows } = await query("SELECT * FROM app_users ORDER BY created_at ASC LIMIT 1");
  return rows.length > 0 ? rowToUser(rows[0]) : null;
};

export const registerUser = async (
  user: Omit<AppUser, "id" | "createdAt" | "role">,
): Promise<AppUser> => {
  const id = randomUUID();
  const normalizedEmail = user.email.trim().toLowerCase();

  try {
    const { rows } = await query(
      `INSERT INTO app_users (id, email, name, phone, country, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'user')
       RETURNING *`,
      [id, normalizedEmail, user.name.trim() || normalizedEmail, user.phone?.trim() || "", user.country?.trim() || "", user.passwordHash],
    );
    return rowToUser(rows[0]);
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new Error("User with this email already exists.");
    }
    throw err;
  }
};

export const upsertUser = async (user: {
  id: string;
  email: string;
  name: string;
  brokerId?: string;
  role?: "admin" | "user";
}): Promise<AppUser> => {
  const normalizedEmail = user.email.trim().toLowerCase();
  const { rows } = await query(
    `INSERT INTO app_users (id, email, name, broker_id, role, password_hash)
     VALUES ($1, $2, $3, $4, $5, '')
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE app_users.name END,
       broker_id = COALESCE(EXCLUDED.broker_id, app_users.broker_id),
       role = COALESCE(EXCLUDED.role, app_users.role),
       updated_at = NOW()
     RETURNING *`,
    [user.id, normalizedEmail, user.name.trim() || normalizedEmail, user.brokerId?.trim() || null, user.role ?? "user"],
  );
  return rowToUser(rows[0]);
};

export const updateUserProfile = async (
  userId: string,
  input: { name: string; phone: string; country?: string },
): Promise<AppUser | null> => {
  const { rows } = await query(
    `UPDATE app_users
     SET name = CASE WHEN $2 <> '' THEN $2 ELSE name END,
         phone = $3,
         country = COALESCE($4, country),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [userId, input.name.trim(), input.phone.trim(), input.country?.trim() ?? null],
  );
  return rows.length > 0 ? rowToUser(rows[0]) : null;
};

export const upsertSession = async (
  userId: string,
  token: string,
  brokerId?: string,
): Promise<AppSession> => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await query(
    `INSERT INTO app_sessions (token, user_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (token) DO UPDATE SET
       expires_at = EXCLUDED.expires_at,
       revoked_at = NULL`,
    [token, userId, now, expiresAt],
  );

  const bk = brokerId ?? (await getUserById(userId))?.brokerId;

  return {
    token,
    userId,
    brokerId: bk,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
};

export const getSessionByToken = async (token: string): Promise<AppSession | null> => {
  const { rows } = await query(
    `SELECT s.*, u.broker_id
     FROM app_sessions s
     JOIN app_users u ON s.user_id = u.id
     WHERE s.token = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
     LIMIT 1`,
    [token],
  );
  return rows.length > 0 ? rowToSession(rows[0]) : null;
};

export const deleteSession = async (token: string): Promise<void> => {
  await query("UPDATE app_sessions SET revoked_at = NOW() WHERE token = $1", [token]);
};

export const getUserSnapshot = async (userId: string): Promise<DashboardSnapshot> => {
  try {
    const { rows } = await query(
      "SELECT snapshot FROM dashboard_snapshots WHERE owner_id = $1 LIMIT 1",
      [userId],
    );
    if (rows.length === 0) return createEmptyDashboardSnapshot();
    const raw = rows[0].snapshot;
    const snapshot = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      ...createEmptyDashboardSnapshot(),
      ...(snapshot ?? {}),
    } as DashboardSnapshot;
  } catch (err) {
    console.warn(
      "[database] getUserSnapshot failed; returning empty local snapshot:",
      err instanceof Error ? err.message : err,
    );
    return createEmptyDashboardSnapshot();
  }
};

const DEFAULT_FLEXY_MARKETS_SERVER_IP = "89.21.67.29";

const resolveFlexyMarketsServerIp = (): string => {
  const configuredServer =
    process.env.FLEXY_MARKETS_IP?.trim() || process.env.MT5_SERVER_HOST?.trim();
  return configuredServer || DEFAULT_FLEXY_MARKETS_SERVER_IP;
};

export const withServerIpSnapshot = (snapshot: DashboardSnapshot): DashboardSnapshot => {
  const defaultServerIp = resolveFlexyMarketsServerIp();
  return {
    ...snapshot,
    tradingAccounts: snapshot.tradingAccounts.map((account) => ({
      ...account,
      serverIp: account.serverIp?.trim() || defaultServerIp,
      credentials: (() => {
        if (!account.credentials) return undefined;
        const legacyMasterPassword =
          typeof (account.credentials as { masterPassword?: unknown }).masterPassword === "string"
            ? (account.credentials as { masterPassword?: string }).masterPassword ?? ""
            : "";
        return {
          ...account.credentials,
          login: account.credentials.login || account.accountNumber,
          server: account.credentials.server?.trim() || account.serverIp?.trim() || defaultServerIp,
          tradingPassword: account.credentials.tradingPassword || legacyMasterPassword,
        };
      })(),
    })),
  };
};


export const getUserSnapshotWithServerIp = async (
  userId: string,
): Promise<DashboardSnapshot> => withServerIpSnapshot(await getUserSnapshot(userId));

/** Reads accounts.created_at for a single MT5 login number. */
export const getAccountCreatedAtFromPg = async (login: string): Promise<string | null> => {
  if (!/^\d+$/.test(login)) return null;
  try {
    const { rows } = await query(
      "SELECT created_at FROM accounts WHERE login = $1 LIMIT 1",
      [Number(login)],
    );
    if (rows.length === 0) return null;
    const val = rows[0].created_at;
    return val instanceof Date ? val.toISOString() : (val ? String(val) : null);
  } catch {
    return null;
  }
};

export interface PgAccountLiveRow {
  login: string;
  balance: number | null;
  equity: number | null;
  freeMargin: number | null;
  status: string;
  createdAt: string | null;
}

/**
 * Reads live balance, equity, free_margin, status and created_at for all
 * accounts owned by a user directly from the PostgreSQL `accounts` table.
 * This is the authoritative source — always fresher than the JSONB snapshot.
 */
export const getAccountsLiveFromPg = async (userId: string): Promise<PgAccountLiveRow[]> => {
  try {
    const { rows } = await query(
      `SELECT login, balance, equity, free_margin, status, created_at
       FROM accounts
       WHERE owner_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((row: any): PgAccountLiveRow => ({
      login: String(row.login),
      balance: row.balance != null ? Number(row.balance) : null,
      equity: row.equity != null ? Number(row.equity) : null,
      freeMargin: row.free_margin != null ? Number(row.free_margin) : null,
      status: row.status ?? "Active",
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at
            ? String(row.created_at)
            : null,
    }));
  } catch (err) {
    console.warn("[database] getAccountsLiveFromPg failed:", err instanceof Error ? err.message : err);
    return [];
  }
};



const defaultStats = () => ({
  totalTrades: 0, winRate: 0, profitFactor: 0, totalVolume: 0,
  winningTrades: 0, losingTrades: 0, averageWin: 0, averageLoss: 0,
  largestWin: 0, largestLoss: 0, consecutiveWins: 0, consecutiveLosses: 0,
});

/**
 * Reads full TradingAccount objects for all accounts owned by a user directly
 * from the PostgreSQL `accounts` table — same columns as the C++ backend's
 * accountJsonFromRow. Replaces the HTTP call to the C++ /dashboard/snapshot.
 */
export const getFullAccountsFromPg = async (
  userId: string,
  brokerId?: string | null,
): Promise<TradingAccount[]> => {
  try {
    const { rows } = await query(
      `SELECT
         login::text AS login,
         COALESCE(broker_id, '') AS broker_id,
         leverage,
         platform,
         mode,
         status,
         currency,
         name,
         server,
         server_host,
         credentials_json::text AS credentials_json,
         COALESCE(balance, 0) AS balance,
         COALESCE(equity, balance, 0) AS equity,
         COALESCE(free_margin, balance, 0) AS free_margin,
         created_at
       FROM accounts
       WHERE owner_id = $1
         AND ($2 = '' OR COALESCE(broker_id, '') = '' OR broker_id = $2)
       ORDER BY login ASC`,
      [userId, brokerId ?? ''],
    );

    return rows.map((row: any): TradingAccount => {
      const login = String(row.login ?? '');
      const platform = (row.platform || 'mt5') as TradingAccount['platform'];
      const server = row.server ?? '';
      const serverHost = (row.server_host || server) as string;
      const balance = Number(row.balance ?? 0);
      const equity = Number(row.equity ?? 0) || balance;
      const freeMargin = Number(row.free_margin ?? 0) || balance;

      let credentials: TradingAccountCredentials | undefined;
      try {
        const raw = typeof row.credentials_json === 'string'
          ? JSON.parse(row.credentials_json)
          : (row.credentials_json ?? {});
        credentials = {
          login: raw.login || login,
          server: raw.server || server || serverHost,
          tradingPassword: raw.tradingPassword ?? '',
          investorPassword: raw.investorPassword ?? '',
          generatedAt: raw.generatedAt ?? new Date().toISOString(),
          source: raw.source ?? 'broker',
        };
      } catch {
        credentials = {
          login,
          server: server || serverHost,
          tradingPassword: '',
          investorPassword: '',
          generatedAt: new Date().toISOString(),
          source: 'broker',
        };
      }

      return {
        id: `mt5-${login}`,
        accountNumber: login,
        name: row.name || `MT5 ${login}`,
        platform,
        type: (row.mode || 'demo') === 'live' ? 'Live' : 'Demo',
        leverage: Number(row.leverage) || 100,
        serverIp: serverHost || server,
        currency: row.currency || 'USD',
        balance,
        equity,
        freeMargin,
        margin: 0,
        status: ((row.status || 'Active') === 'Archived' ? 'Archived' : 'Active') as 'Active' | 'Archived',
        credentials,
        createdAt: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at ? String(row.created_at) : undefined,
        transactions: [],
        stats: defaultStats(),
      };
    });
  } catch (err) {
    console.warn('[database] getFullAccountsFromPg failed:', err instanceof Error ? err.message : err);
    return [];
  }
};

export const updateUserSnapshot = async (
  userId: string,
  updater: (snapshot: DashboardSnapshot) => DashboardSnapshot,
): Promise<DashboardSnapshot> => {
  const current = await getUserSnapshot(userId);
  const next = updater(current);

  await query(
    `INSERT INTO dashboard_snapshots (owner_id, snapshot, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (owner_id) DO UPDATE SET snapshot = $2::jsonb, updated_at = NOW()`,
    [userId, JSON.stringify(next)],
  );

  return next;
};

export const getSocialStrategies = async (): Promise<SocialStrategy[]> => {
  try {
    const { rows } = await query(
      "SELECT id, payload, created_at FROM copy_trading_strategies ORDER BY created_at DESC LIMIT 100",
    );
    return rows.map((row: any) => ({
      id: row.id,
      ...(typeof row.payload === "object" ? row.payload : {}),
    })) as SocialStrategy[];
  } catch {
    return [];
  }
};

export const getUserNotifications = async (userId: string): Promise<AppNotification[]> => {
  const { rows } = await query(
    "SELECT * FROM user_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200",
    [userId],
  );
  return rows.map(rowToNotification);
};

export const setUserNotifications = async (
  userId: string,
  notifications: AppNotification[],
): Promise<void> => {
  const client = await (await import("@/lib/server/pg")).pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_notifications WHERE user_id = $1", [userId]);

    for (const n of notifications) {
      await client.query(
        `INSERT INTO user_notifications (id, user_id, title, message, type, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, message = EXCLUDED.message,
           type = EXCLUDED.type, is_read = EXCLUDED.is_read`,
        [n.id ?? randomUUID(), userId, n.title, n.message, n.type ?? "info", n.isRead, n.timestamp ? new Date(n.timestamp) : new Date()],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

// ─── withDatabase compatibility shim (used by /api/test-db) ─────────────────

interface LegacyDb {
  version: 1;
  users: AppUser[];
  sessions: AppSession[];
}

export const withDatabase = async <T,>(
  mutator: (db: LegacyDb) => Promise<T> | T,
  _options?: { persist?: boolean },
): Promise<T> => {
  const { rows: userRows } = await query("SELECT * FROM app_users LIMIT 100");
  const { rows: sessionRows } = await query(
    "SELECT s.*, u.broker_id FROM app_sessions s JOIN app_users u ON s.user_id = u.id WHERE s.revoked_at IS NULL AND s.expires_at > NOW() LIMIT 100",
  );

  const db: LegacyDb = {
    version: 1,
    users: userRows.map(rowToUser),
    sessions: sessionRows.map(rowToSession),
  };

  return mutator(db);
};
