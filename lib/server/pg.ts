import { Pool } from "pg";

const g = globalThis as typeof globalThis & { __pgPool?: Pool };

const buildConfig = () => {
  const directUrl = process.env.FOREX_CRM_DATABASE_URL?.trim();
  if (directUrl) return { connectionString: directUrl };

  const host = process.env.DB_HOST?.trim();
  const port = parseInt(process.env.DB_PORT?.trim() || "5432", 10);
  const database = process.env.DB_NAME?.trim();
  const user = process.env.DB_USER?.trim();
  const password = process.env.DB_PASSWORD?.trim();

  if (host && database) {
    return { host, port, database, user: user || undefined, password: password || undefined };
  }

  const url = process.env.DATABASE_URL?.trim();
  if (url) return { connectionString: url };

  return { connectionString: "postgresql://crm:crm@localhost:5432/forex_crm" };
};

if (!g.__pgPool) {
  g.__pgPool = new Pool({
    ...buildConfig(),
    max: 10,
    connectionTimeoutMillis: 1_500,  // fail fast so auth can fall through to dev-auto-auth
    idleTimeoutMillis: 30_000,       // release idle connections so the pool stays fresh
    statement_timeout: 8_000,        // server-side kill for runaway queries
  });
  g.__pgPool.on("error", (err) => {
    console.error("[pg] idle client error:", err.message);
  });
}

export const pool = g.__pgPool;

export const query = <T extends object = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => pool.query<T>(text, params);
