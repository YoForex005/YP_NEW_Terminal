import type { DashboardSnapshot, TradingAccount } from "@/types/dashboard";
import { resolveBackendEnvValue } from "@/lib/server/backend-env";

interface BackendSuccessEnvelope<TData> {
  ok: true;
  data: TData;
}

export interface BackendRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const normalizeBrokerId = (brokerId: string | null | undefined): string | undefined => {
  const trimmed = brokerId?.trim();
  return trimmed || undefined;
};

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:3002";
const DEFAULT_BACKEND_TIMEOUT_MS = 15000;

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const resolveFirstBackendEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = resolveBackendEnvValue(key);
    if (value) {
      return value;
    }
  }
  return undefined;
};

export const resolveAccountsBackendBaseUrl = (): string => {
  const configured = resolveFirstBackendEnv(
    "ACCOUNTS_BACKEND_URL",
    "ACCOUNTS_BACKEND_BASE_URL",
    "DASHBOARD_BACKEND_URL",
    "WALLET_BACKEND_BASE_URL",
  ) ?? "";

  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (process.env.NODE_ENV !== "production") {
    return DEFAULT_BACKEND_BASE_URL;
  }

  return trimTrailingSlash(configured || DEFAULT_BACKEND_BASE_URL);
};

export const resolveAccountsBackendAuthToken = (): string | undefined => {
  const token = resolveFirstBackendEnv(
    "ACCOUNTS_BACKEND_AUTH_TOKEN",
    "ACCOUNTS_AUTH_TOKEN",
    "APP_DATA_AUTH_TOKEN",
    "DASHBOARD_BACKEND_AUTH_TOKEN",
    "WALLET_BACKEND_AUTH_TOKEN",
    "WALLET_AUTH_TOKEN",
  ) ?? "";

  return token || undefined;
};

export const resolveAppDataBackendAuthToken = (): string | undefined => {
  const token = resolveFirstBackendEnv(
    "APP_DATA_BACKEND_AUTH_TOKEN",
    "APP_DATA_AUTH_TOKEN",
    "DASHBOARD_BACKEND_AUTH_TOKEN",
    "ACCOUNTS_BACKEND_AUTH_TOKEN",
    "ACCOUNTS_AUTH_TOKEN",
  ) ?? "";

  return token || undefined;
};

const resolveTimeoutMs = (): number => {
  const timeoutRaw = resolveFirstBackendEnv(
    "ACCOUNTS_BACKEND_TIMEOUT_MS",
    "DASHBOARD_BACKEND_TIMEOUT_MS",
    "WALLET_BACKEND_TIMEOUT_MS",
  ) ?? "";
  const configured = Number(timeoutRaw);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_BACKEND_TIMEOUT_MS;
  }

  return configured;
};

const withQuery = (
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string => {
  if (!query) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.set(key, String(value));
  }

  const queryString = params.toString();
  if (!queryString) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}${queryString}`;
};

const parseErrorDetails = (
  payload: unknown,
): { message: string; code?: string; details?: unknown } => {
  if (!payload || typeof payload !== "object") {
    return { message: "Backend request failed." };
  }

  const envelope = payload as {
    error?: unknown;
    message?: unknown;
    code?: unknown;
    details?: unknown;
  };

  if (envelope.error && typeof envelope.error === "object") {
    const nested = envelope.error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
    };

    if (typeof nested.message === "string" && nested.message.trim()) {
      return {
        message: nested.message,
        code: typeof nested.code === "string" ? nested.code : undefined,
        details: nested.details,
      };
    }
  }

  if (typeof envelope.error === "string" && envelope.error.trim()) {
    return {
      message: envelope.error,
      code: typeof envelope.code === "string" ? envelope.code : undefined,
      details: envelope.details,
    };
  }

  if (typeof envelope.message === "string" && envelope.message.trim()) {
    return {
      message: envelope.message,
      code: typeof envelope.code === "string" ? envelope.code : undefined,
      details: envelope.details,
    };
  }

  return { message: "Backend request failed." };
};

const parseJsonSafely = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
};

export class AccountsBackendError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  public constructor(
    status: number,
    message: string,
    options?: { code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "AccountsBackendError";
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export const requestAccountsBackend = async <TData>(
  path: string,
  options?: BackendRequestOptions,
): Promise<TData> => {
  const method = options?.method ?? "GET";
  const timeoutMs = options?.timeoutMs ?? resolveTimeoutMs();
  const url = `${resolveAccountsBackendBaseUrl()}${withQuery(path, options?.query)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options?.headers,
  };

  const token = resolveAccountsBackendAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const hasBody = options?.body !== undefined;
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(options?.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Backend request timed out after ${timeoutMs}ms.`
        : error instanceof Error
          ? error.message
          : "Backend request failed.";
    throw new AccountsBackendError(502, message);
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    const parsed = parseErrorDetails(payload);
    throw new AccountsBackendError(response.status, parsed.message, {
      code: parsed.code,
      details: parsed.details,
    });
  }

  if (
    payload &&
    typeof payload === "object" &&
    (payload as { ok?: unknown }).ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return (payload as BackendSuccessEnvelope<TData>).data;
  }

  return payload as TData;
};

export const withBrokerContext = <T extends Record<string, unknown>>(
  value: T,
  brokerId: string | null | undefined,
): T & { brokerId?: string; broker_id?: string } => {
  const normalizedBrokerId = normalizeBrokerId(brokerId);
  if (!normalizedBrokerId) {
    return value;
  }

  return {
    ...value,
    brokerId: normalizedBrokerId,
    broker_id: normalizedBrokerId,
  };
};

export const hasDashboardSnapshotShape = (
  value: unknown,
): value is DashboardSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<DashboardSnapshot>;
  if (!Array.isArray(candidate.marketInstruments)) return false;
  if (!Array.isArray(candidate.tradingSessions)) return false;
  if (!candidate.wallets || typeof candidate.wallets !== "object") return false;
  if (!Array.isArray(candidate.positions)) return false;
  if (!Array.isArray(candidate.transactions)) return false;
  if (!Array.isArray(candidate.pnlSeries)) return false;
  if (!Array.isArray(candidate.tradingAccounts)) return false;

  return true;
};

export const extractSnapshotFromPayload = (
  payload: unknown,
): DashboardSnapshot | null => {
  if (hasDashboardSnapshotShape(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const wrappedSnapshot = (payload as { data?: { snapshot?: unknown } }).data?.snapshot;
  if (hasDashboardSnapshotShape(wrappedSnapshot)) {
    return wrappedSnapshot;
  }

  const directSnapshot = (payload as { snapshot?: unknown }).snapshot;
  if (hasDashboardSnapshotShape(directSnapshot)) {
    return directSnapshot;
  }

  return null;
};

export const fetchBackendDashboardSnapshot = async (
  ownerId: string,
  brokerId?: string | null,
  options?: { timeoutMs?: number },
): Promise<DashboardSnapshot | null> => {
  try {
    const data = await requestAccountsBackend<{ snapshot?: unknown }>(
      "/dashboard/snapshot",
      {
        method: "GET",
        query: withBrokerContext({ ownerId }, brokerId),
        timeoutMs: options?.timeoutMs,
      },
    );

    return extractSnapshotFromPayload(data);
  } catch (error) {
    console.warn(
      "[accounts-backend] failed to fetch dashboard snapshot",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};

export const extractMt5LoginFromAccountId = (accountId: string): string | null => {
  const trimmed = accountId.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const mt5Prefixed = /^mt5-(\d+)$/.exec(trimmed);
  if (mt5Prefixed?.[1]) {
    return mt5Prefixed[1];
  }

  return null;
};

export const extractMt5LoginFromAccount = (
  account: TradingAccount | null | undefined,
): string | null => {
  const candidate =
    account?.credentials?.login?.trim() || account?.accountNumber?.trim() || "";
  if (!/^\d+$/.test(candidate)) {
    return null;
  }
  return candidate;
};
