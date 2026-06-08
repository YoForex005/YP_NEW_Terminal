import type { CurrencyCode, PaymentMethod } from "@/types/dashboard";
import { resolveBackendEnvValue } from "@/lib/server/backend-env";

type TransferSide = "wallet" | "mt5";

interface BackendSuccessEnvelope<TData> {
  ok: true;
  data: TData;
}

interface BackendErrorEnvelope {
  ok?: false;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

interface WalletBalances {
  USD: number;
  EUR: number;
}

export interface WalletBackendOperation {
  id: string;
  type: "deposit" | "withdraw" | "transfer";
  status: "completed" | "rejected" | "pending";
  at: string;
  amount: number;
  currency: CurrencyCode;
  method?: "crypto" | "card" | "mt5";
  from?: TransferSide;
  to?: TransferSide;
  accountLogin?: string;
  reason?: string;
  comment?: string;
  reference?: string;
  transactionId?: string;
}

export interface WalletBackendWallet {
  ownerId: string;
  balances: WalletBalances;
  createdAt: string;
  updatedAt: string;
  operations: WalletBackendOperation[];
}

export interface WalletBackendFundsData {
  wallet: WalletBackendWallet;
  operation: WalletBackendOperation;
  checkout?: any; // CoinPayments checkout details
}

export interface SubmitWalletFundsInput {
  ownerId: string;
  type: "deposit" | "withdraw";
  amount: number;
  currency: CurrencyCode;
  method: PaymentMethod;
  cryptoCurrency?: string;
}

export interface TransferWalletFundsInput {
  ownerId: string;
  login: string;
  amount: number;
  currency: CurrencyCode;
  from: TransferSide;
  to: TransferSide;
}

export interface WalletBackendRequestOptions {
  idempotencyKey?: string;
}

export interface WalletBackendResult<TData> {
  data: TData;
  idempotencyKey?: string;
  idempotencyReplayed?: boolean;
}

const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:3002";

const resolveFirstBackendEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = resolveBackendEnvValue(key);
    if (value) {
      return value;
    }
  }
  return undefined;
};

const resolveBackendBaseUrl = (): string => {
  const raw = resolveFirstBackendEnv(
    "WALLET_BACKEND_BASE_URL",
    "ACCOUNTS_BACKEND_BASE_URL",
    "ACCOUNTS_BACKEND_URL",
  ) ?? DEFAULT_BACKEND_BASE_URL;

  return raw.replace(/\/+$/, "");
};

const resolveBackendAuthToken = (): string | undefined => {
  const token = resolveFirstBackendEnv(
    "WALLET_BACKEND_AUTH_TOKEN",
    "WALLET_AUTH_TOKEN",
    "ACCOUNTS_AUTH_TOKEN",
    "APP_DATA_AUTH_TOKEN",
  );

  return token && token.length > 0 ? token : undefined;
};

const parseErrorMessage = (payload: unknown): {
  code?: string;
  message: string;
  details?: unknown;
} => {
  if (!payload || typeof payload !== "object") {
    return {
      message: "Wallet backend request failed.",
    };
  }

  const envelope = payload as BackendErrorEnvelope;
  if (envelope.error?.message) {
    return {
      code: envelope.error.code,
      message: envelope.error.message,
      details: envelope.error.details,
    };
  }

  if (typeof envelope.message === "string" && envelope.message.trim().length > 0) {
    return {
      message: envelope.message,
    };
  }

  return {
    message: "Wallet backend request failed.",
  };
};

export class WalletBackendError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;
  public readonly idempotencyKey?: string;
  public readonly idempotencyReplayed?: boolean;

  public constructor(
    status: number,
    message: string,
    options?: {
      code?: string;
      details?: unknown;
      idempotencyKey?: string;
      idempotencyReplayed?: boolean;
    },
  ) {
    super(message);
    this.name = "WalletBackendError";
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
    this.idempotencyKey = options?.idempotencyKey;
    this.idempotencyReplayed = options?.idempotencyReplayed;
  }
}

const requestWalletBackend = async <TData>(
  path: string,
  body: unknown,
  options: WalletBackendRequestOptions = {},
): Promise<WalletBackendResult<TData>> => {
  const token = resolveBackendAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${resolveBackendBaseUrl()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Wallet backend is unreachable.";
    throw new WalletBackendError(502, message, {
      idempotencyKey: options.idempotencyKey,
    });
  }

  let payload: unknown = undefined;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const parsed = parseErrorMessage(payload);
    const idempotencyKey =
      response.headers.get("Idempotency-Key") ?? options.idempotencyKey;
    const replayed = response.headers.get("Idempotency-Replayed");

    throw new WalletBackendError(response.status, parsed.message, {
      code: parsed.code,
      details: parsed.details,
      idempotencyKey: idempotencyKey ?? undefined,
      idempotencyReplayed:
        replayed === null ? undefined : replayed.trim().toLowerCase() === "true",
    });
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as { ok?: unknown }).ok !== true ||
    !("data" in (payload as Record<string, unknown>))
  ) {
    throw new WalletBackendError(502, "Wallet backend returned an invalid response.");
  }

  const idempotencyKey =
    response.headers.get("Idempotency-Key") ?? options.idempotencyKey;
  const replayed = response.headers.get("Idempotency-Replayed");

  return {
    data: (payload as BackendSuccessEnvelope<TData>).data,
    idempotencyKey: idempotencyKey ?? undefined,
    idempotencyReplayed:
      replayed === null ? undefined : replayed.trim().toLowerCase() === "true",
  };
};

export const submitWalletFunds = async (
  input: SubmitWalletFundsInput,
  options?: WalletBackendRequestOptions,
): Promise<WalletBackendResult<WalletBackendFundsData>> =>
  requestWalletBackend<WalletBackendFundsData>("/wallet/funds", input, options);

export const transferWalletFunds = async (
  input: TransferWalletFundsInput,
  options?: WalletBackendRequestOptions,
): Promise<WalletBackendResult<WalletBackendFundsData>> =>
  requestWalletBackend<WalletBackendFundsData>("/wallet/transfer", input, options);
