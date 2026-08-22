/**
 * PropFirm C++ Backend adapter.
 *
 * The dashboard/accounts/wallet pages historically read from a local Postgres
 * CRM mirror. When the terminal is deployed as its own subdomain it talks to
 * the PropFirm C++ Backend over HTTP instead, forwarding the authenticated
 * user's JWT. Every backend endpoint lives under the `/api` prefix and returns
 * a `{ success: boolean, ... }` envelope.
 *
 * Field shapes for accounts/wallet are not pinned in the OpenAPI spec, so the
 * mappers read defensively (camelCase and snake_case) — matching how the
 * existing terminal client (`lib/terminal/ticket-terminal-client.ts`) consumes
 * this backend.
 */
import type {
  CurrencyCode,
  DashboardSnapshot,
  Position,
  Transaction,
  TradingAccount,
  WalletBalances,
} from "@/types/dashboard";
import { resolveTerminalBackendOrigin } from "@/lib/server/backend-origin";

const DEV_AUTH_SENTINEL = "dev-auto-auth";

/** A token can be forwarded upstream only if it is a real backend JWT. */
export const isForwardableToken = (
  token: string | null | undefined,
): token is string => Boolean(token && token !== DEV_AUTH_SENTINEL);

/** Bare backend ORIGIN (no trailing slash, no `/api`). */
export const resolvePropfirmOrigin = (): string => resolveTerminalBackendOrigin();

export class PropfirmBackendError extends Error {
  public readonly status: number;
  public readonly code?: string;

  public constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "PropfirmBackendError";
    this.status = status;
    this.code = code;
  }
}

interface PropfirmRequestOptions {
  token: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  origin?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;

const buildUrl = (
  origin: string,
  path: string,
  query?: PropfirmRequestOptions["query"],
): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`/api${normalizedPath}`, `${origin}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};

/** Low-level request: forwards the user JWT, unwraps the `{ success, ... }` envelope. */
export const requestPropfirm = async <T = Record<string, unknown>>(
  path: string,
  options: PropfirmRequestOptions,
): Promise<T> => {
  const origin = options.origin ?? resolvePropfirmOrigin();
  const url = buildUrl(origin, path, options.query);
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.token}`,
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `PropFirm backend request timed out (${path}).`
        : error instanceof Error
          ? error.message
          : "PropFirm backend request failed.";
    throw new PropfirmBackendError(502, message);
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => undefined)) as
    | (Record<string, unknown> & { success?: boolean; error?: unknown; message?: unknown })
    | undefined;

  if (!response.ok || (payload && payload.success === false)) {
    const err = payload?.error;
    const message =
      (err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : typeof payload?.message === "string"
          ? payload.message
          : `PropFirm backend returned HTTP ${response.status}.`);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    throw new PropfirmBackendError(response.status, message, code);
  }

  return (payload ?? {}) as T;
};

// ── defensive field readers ──────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const isRaw = (v: unknown): v is Raw => Boolean(v) && typeof v === "object";

const pick = (obj: Raw, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
};

const num = (value: unknown, fallback = 0): number => {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : fallback;
};

const str = (value: unknown, fallback = ""): string =>
  value === undefined || value === null ? fallback : String(value);

const toCurrency = (value: unknown): CurrencyCode =>
  str(value).toUpperCase() === "EUR" ? "EUR" : "USD";

// ── mappers ──────────────────────────────────────────────────────────────────

export const mapTradingAccount = (
  raw: unknown,
  status: "Active" | "Archived" = "Active",
): TradingAccount | null => {
  if (!isRaw(raw)) return null;
  const login = str(pick(raw, "login", "account", "accountNumber", "account_number"));
  if (!login) return null;

  const group = str(pick(raw, "group", "group_name", "accountType", "account_type", "type")).toLowerCase();
  const isDemo =
    group.includes("demo") || pick(raw, "demo", "isDemo", "is_demo") === true;

  return {
    id: `mt5-${login}`,
    accountNumber: login,
    name: str(pick(raw, "name", "nickname", "account_name", "label"), `Account ${login}`),
    platform: "mt5",
    type: isDemo ? "Demo" : "Live",
    leverage: num(pick(raw, "leverage"), 0) || undefined,
    serverIp: str(pick(raw, "serverIp", "server_ip", "server")) || undefined,
    currency: str(pick(raw, "currency"), "USD"),
    balance: num(pick(raw, "balance")),
    equity: num(pick(raw, "equity", "balance")),
    freeMargin: num(pick(raw, "freeMargin", "free_margin", "margin_free", "marginFree")),
    margin: num(pick(raw, "margin", "margin_used", "marginUsed")),
    status,
    createdAt: str(pick(raw, "createdAt", "created_at")) || undefined,
  };
};

export const mapWalletBalances = (wallet: unknown): WalletBalances => {
  const balances: WalletBalances = { USD: 0, EUR: 0 };
  if (!isRaw(wallet)) return balances;
  const currency = toCurrency(pick(wallet, "currency"));
  balances[currency] = num(pick(wallet, "available_balance", "availableBalance", "balance"));
  return balances;
};

const TRANSACTION_TYPE_MAP: Record<string, Transaction["type"]> = {
  deposit: "Deposit",
  credit: "Deposit",
  withdraw: "Withdrawal",
  withdrawal: "Withdrawal",
  debit: "Withdrawal",
  transfer_to_mt5: "Transfer to MT5",
  "transfer-to-mt5": "Transfer to MT5",
  transfer_from_mt5: "Transfer from MT5",
  "transfer-from-mt5": "Transfer from MT5",
};

export const mapTransaction = (raw: unknown): Transaction | null => {
  if (!isRaw(raw)) return null;
  const rawType = str(pick(raw, "type", "transaction_type")).toLowerCase();
  const login = pick(raw, "login", "mt5_login", "targetAccount");
  return {
    id: str(pick(raw, "id", "reference_id", "transaction_id"), ""),
    type: TRANSACTION_TYPE_MAP[rawType] ?? "Admin Adjustment",
    amount: Math.abs(num(pick(raw, "amount"))),
    currency: toCurrency(pick(raw, "currency")),
    method: str(pick(raw, "method")).toLowerCase() === "crypto" ? "crypto" : "card",
    status: "Completed",
    createdAt: str(pick(raw, "created_at", "createdAt", "at")),
    targetAccount: login !== undefined ? str(login) : undefined,
  };
};

export const mapPosition = (raw: unknown, accountLogin?: string): Position | null => {
  if (!isRaw(raw)) return null;
  const rawSide = str(pick(raw, "type", "side", "direction")).toLowerCase();
  const side: Position["side"] =
    rawSide.includes("sell") || rawSide === "1" ? "Sell" : "Buy";
  return {
    id: str(pick(raw, "ticket", "id", "positionId", "position_id")),
    symbol: str(pick(raw, "symbol")),
    side,
    volume: num(pick(raw, "lot_size", "volume", "lots")),
    pnl: num(pick(raw, "profit", "pnl")),
    accountLogin,
  };
};

// ── snapshot assembly ────────────────────────────────────────────────────────

export interface PropfirmDashboardData {
  tradingAccounts: TradingAccount[];
  wallets: WalletBalances;
  positions: Position[];
  transactions: Transaction[];
}

/**
 * Assemble the backend-sourced portion of a dashboard snapshot from the
 * PropFirm C++ Backend. Returns null only on a hard auth/transport failure of
 * the primary accounts call — individual sub-calls fail soft so a partial
 * outage still yields a usable snapshot. Market instruments / sessions / pnl
 * series are intentionally omitted (sourced elsewhere).
 */
export const fetchPropfirmDashboardData = async (
  token: string,
  options?: { origin?: string; timeoutMs?: number; includePositions?: boolean },
): Promise<PropfirmDashboardData | null> => {
  const origin = options?.origin ?? resolvePropfirmOrigin();
  const timeoutMs = options?.timeoutMs;

  const [accountsResult, walletResult, txResult] = await Promise.allSettled([
    requestPropfirm<{ accounts?: unknown[]; archivedAccounts?: unknown[] }>(
      "/mt5/accounts",
      { token, origin, timeoutMs },
    ),
    requestPropfirm<Raw>("/user/wallet", { token, origin, timeoutMs }),
    requestPropfirm<{ transactions?: unknown[] }>("/wallet/transactions", {
      token,
      origin,
      timeoutMs,
      query: { limit: 100 },
    }),
  ]);

  // The accounts call is the primary signal — if it failed on auth, treat the
  // whole backend source as unavailable and let the caller fall back.
  if (accountsResult.status === "rejected") {
    const reason = accountsResult.reason;
    if (reason instanceof PropfirmBackendError && reason.status === 401) {
      return null;
    }
    console.warn(
      "[propfirm-backend] /mt5/accounts failed:",
      reason instanceof Error ? reason.message : reason,
    );
    return null;
  }

  const active = (accountsResult.value.accounts ?? [])
    .map((a) => mapTradingAccount(a, "Active"))
    .filter((a): a is TradingAccount => a !== null);
  const archived = (accountsResult.value.archivedAccounts ?? [])
    .map((a) => mapTradingAccount(a, "Archived"))
    .filter((a): a is TradingAccount => a !== null);
  const tradingAccounts = [...active, ...archived];

  const wallets =
    walletResult.status === "fulfilled"
      ? mapWalletBalances(walletResult.value)
      : { USD: 0, EUR: 0 };

  const transactions =
    txResult.status === "fulfilled"
      ? (txResult.value.transactions ?? [])
          .map(mapTransaction)
          .filter((t): t is Transaction => t !== null)
      : [];

  let positions: Position[] = [];
  if (options?.includePositions !== false && active.length > 0) {
    const positionResults = await Promise.allSettled(
      active.map((account) =>
        requestPropfirm<{ positions?: unknown[] }>(
          `/live-positions/${account.accountNumber}`,
          { token, origin, timeoutMs },
        ).then((res) =>
          (res.positions ?? [])
            .map((p) => mapPosition(p, account.accountNumber))
            .filter((p): p is Position => p !== null),
        ),
      ),
    );
    positions = positionResults.flatMap((r) =>
      r.status === "fulfilled" ? r.value : [],
    );
  }

  return { tradingAccounts, wallets, positions, transactions };
};

/** Convenience: overlay backend data onto a base snapshot (keeps market/session/pnl). */
export const overlayPropfirmSnapshot = (
  base: DashboardSnapshot,
  data: PropfirmDashboardData,
): DashboardSnapshot => ({
  ...base,
  tradingAccounts: data.tradingAccounts,
  wallets: data.wallets,
  positions: data.positions,
  transactions: data.transactions,
});
