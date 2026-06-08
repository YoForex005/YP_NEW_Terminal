"use client";

import { create } from "zustand";

import { INITIAL_WALLETS } from "@/lib/dashboard/default-state";
import type {
  CurrencyCode,
  DashboardSnapshot,
  FundsTab,
  PaymentMethod,
  Position,
  PnlPoint,
  Transaction,
  TradingAccount,
  TradingAccountCredentials,
} from "@/types/dashboard";

interface SubmitResult {
  ok: boolean;
  message: string;
  account?: TradingAccount;
  credentials?: TradingAccountCredentials;
  paymentDetails?: any;
}

interface CreateAccountInput {
  platform: "mt5" | "mt4" | "ctrader";
  mode: "demo" | "live";
  currency: CurrencyCode;
  initialBalance: number;
  leverage?: number;
  group?: string;
  name?: string;
  email?: string;
  tradingPassword?: string;
  investorPassword?: string;
}

interface SnapshotApiResponse {
  ok?: boolean;
  message?: string;
  error?: string;
  stage?: string;
  code?: string;
  idempotencyKey?: string;
  idempotencyReplayed?: boolean;
  snapshot?: DashboardSnapshot;
  account?: TradingAccount;
}

interface TradingState {
  wallets: Record<CurrencyCode, number>;
  fundsTab: FundsTab;
  selectedCurrency: CurrencyCode;
  paymentMethod: PaymentMethod;
  amountInput: string;
  transactions: Transaction[];
  positions: Position[];
  pnlSeries: PnlPoint[];
  accountPnlSeries: Record<string, PnlPoint[]>;
  tradingAccounts: TradingAccount[];
  showUnrealizedPnl: boolean;
  setFundsTab: (tab: FundsTab) => void;
  setSelectedCurrency: (currency: CurrencyCode) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setAmountInput: (value: string) => void;
  selectedCrypto: string;
  paymentDetails: any | null;
  setShowUnrealizedPnl: (value: boolean) => void;
  setSelectedCrypto: (crypto: string) => void;
  setPaymentDetails: (details: any | null) => void;
  hydrateFromSnapshot: (snapshot: DashboardSnapshot) => void;
  submitFunds: () => Promise<SubmitResult>;
  transferFunds: (
    amount: number,
    from: "wallet" | "mt5",
    to: "wallet" | "mt5",
    accountId: string,
  ) => Promise<SubmitResult>;
  addAccount: (input: CreateAccountInput) => Promise<SubmitResult>;
  archiveAccount: (id: string) => Promise<SubmitResult>;
  unarchiveAccount: (id: string) => Promise<SubmitResult>;
  deleteAccount: (id: string) => Promise<SubmitResult>;
  syncAccountBalance: (accountId: string) => Promise<SubmitResult>;
}

const parseApiPayload = async (response: Response): Promise<SnapshotApiResponse> => {
  try {
    return (await response.json()) as SnapshotApiResponse;
  } catch {
    return {
      error: "Failed to parse API response.",
    };
  }
};

const applySnapshot = (setState: (update: Partial<TradingState>) => void, snapshot: DashboardSnapshot) => {
  setState({
    wallets: { ...snapshot.wallets },
    positions: snapshot.positions.map((item) => ({ ...item })),
    transactions: snapshot.transactions.map((item) => ({ ...item })),
    pnlSeries: snapshot.pnlSeries ? snapshot.pnlSeries.map((item) => ({ ...item })) : [],
    accountPnlSeries: snapshot.accountPnlSeries ? { ...snapshot.accountPnlSeries } : {},
    tradingAccounts: snapshot.tradingAccounts.map((item) => ({ ...item })),
  });
};

type WalletOperation = "funds" | "transfer";

interface PendingWalletIdempotencyEntry {
  operation: WalletOperation;
  key: string;
  inFlight: number;
}

interface AcquiredWalletIdempotencyKey {
  operationKey: string;
  key: string;
}

interface WalletIdempotencyOutcome {
  terminal: boolean;
}

const IDEMPOTENCY_REPLAYED_HEADER = "Idempotency-Replayed";
const IDEMPOTENCY_IN_PROGRESS_CODE = "IDEMPOTENCY_IN_PROGRESS";
const pendingWalletIdempotencyKeys = new Map<string, PendingWalletIdempotencyEntry>();

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = sortJsonValue((value as Record<string, unknown>)[key]);
      return sorted;
    }, {});
};

const stableStringify = (value: unknown): string =>
  JSON.stringify(sortJsonValue(value));

const walletOperationKey = (
  operation: WalletOperation,
  payload: Record<string, unknown>,
): string => stableStringify({ operation, payload });

const newWalletIdempotencyKey = (operation: WalletOperation): string => {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `web-wallet-v1.${operation}.${random}`;
};

const acquireWalletIdempotencyKey = (
  operation: WalletOperation,
  payload: Record<string, unknown>,
): AcquiredWalletIdempotencyKey => {
  const operationKey = walletOperationKey(operation, payload);
  cancelSupersededWalletIdempotencyKeys(operation, operationKey);

  const existing = pendingWalletIdempotencyKeys.get(operationKey);
  if (existing) {
    existing.inFlight += 1;
    return { operationKey, key: existing.key };
  }

  const entry = {
    operation,
    key: newWalletIdempotencyKey(operation),
    inFlight: 1,
  };
  pendingWalletIdempotencyKeys.set(operationKey, entry);
  return { operationKey, key: entry.key };
};

const cancelSupersededWalletIdempotencyKeys = (
  operation: WalletOperation,
  currentOperationKey: string,
): void => {
  pendingWalletIdempotencyKeys.forEach((entry, operationKey) => {
    if (
      operationKey !== currentOperationKey &&
      entry.operation === operation &&
      entry.inFlight === 0
    ) {
      pendingWalletIdempotencyKeys.delete(operationKey);
    }
  });
};

const completeWalletIdempotencyAttempt = (
  idempotency: AcquiredWalletIdempotencyKey,
  outcome: WalletIdempotencyOutcome,
): void => {
  const existing = pendingWalletIdempotencyKeys.get(idempotency.operationKey);
  if (!existing || existing.key !== idempotency.key) {
    return;
  }

  existing.inFlight = Math.max(0, existing.inFlight - 1);
  if (outcome.terminal) {
    pendingWalletIdempotencyKeys.delete(idempotency.operationKey);
  }
};

const headerIsTrue = (response: Response, headerName: string): boolean =>
  response.headers.get(headerName)?.trim().toLowerCase() === "true";

const walletIdempotencyOutcomeFromResponse = (
  response: Response,
  payload: SnapshotApiResponse,
): WalletIdempotencyOutcome => {
  const replayed =
    payload.idempotencyReplayed === true ||
    headerIsTrue(response, IDEMPOTENCY_REPLAYED_HEADER);
  const terminalConflict =
    response.status === 409 && payload.code !== IDEMPOTENCY_IN_PROGRESS_CODE;

  return {
    terminal: response.ok || replayed || terminalConflict,
  };
};

export const useTradingStore = create<TradingState>()((set, get) => ({
  wallets: { ...INITIAL_WALLETS },
  fundsTab: "history",
  selectedCurrency: "USD",
  paymentMethod: "crypto",
  selectedCrypto: "BTC",
  amountInput: "",
  transactions: [],
  positions: [],
  pnlSeries: [],
  accountPnlSeries: {},
  tradingAccounts: [],
  showUnrealizedPnl: true,
  setFundsTab: (tab) => set({ fundsTab: tab }),
  setSelectedCurrency: (selectedCurrency) => set({ selectedCurrency }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setAmountInput: (amountInput) => set({ amountInput }),
  setShowUnrealizedPnl: (showUnrealizedPnl) => set({ showUnrealizedPnl }),
  setSelectedCrypto: (selectedCrypto) => set({ selectedCrypto }),
  paymentDetails: null,
  setPaymentDetails: (paymentDetails) => set({ paymentDetails }),
  hydrateFromSnapshot: (snapshot) => applySnapshot(set, snapshot),
  submitFunds: async () => {
    const state = get();
    const amount = Number.parseFloat(state.amountInput);

    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Enter a valid amount greater than 0." };
    }

    const requestBody = {
      type: state.fundsTab === "withdraw" ? "withdraw" : "deposit",
      amount,
      currency: state.selectedCurrency,
      method: state.paymentMethod,
      cryptoCurrency: state.selectedCrypto,
    };
    const idempotency = acquireWalletIdempotencyKey("funds", requestBody);
    let idempotencyAttemptCompleted = false;
    const completeIdempotencyAttempt = (outcome: WalletIdempotencyOutcome) => {
      if (idempotencyAttemptCompleted) {
        return;
      }

      completeWalletIdempotencyAttempt(idempotency, outcome);
      idempotencyAttemptCompleted = true;
    };

    try {
      const response = await fetch("/api/private/wallet/funds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency.key,
        },
        body: JSON.stringify({
          ...requestBody,
          idempotencyKey: idempotency.key,
        }),
      });

      const payload = await parseApiPayload(response);
      completeIdempotencyAttempt(
        walletIdempotencyOutcomeFromResponse(response, payload),
      );
      const checkoutData = (payload as any).data?.checkout;

      if (payload.snapshot) {
        applySnapshot(set, payload.snapshot);

        // FIX: Only switch to history if we DON'T have a payment gateway to show
        // Otherwise, the form unmounts and the modal closes immediately.
        if (!checkoutData) {
          set({
            fundsTab: "history",
            amountInput: "",
          });
        } else {
          set({
            amountInput: "",
            paymentDetails: checkoutData
          });
        }
      }

      if (!response.ok) {
        return {
          ok: false,
          message: payload.message ?? payload.error ?? "Funds request failed.",
        };
      }

      return {
        ok: true,
        message: payload.message ?? "Funds request submitted successfully.",
        paymentDetails: checkoutData,
      };
    } catch (error) {
      completeIdempotencyAttempt({ terminal: false });
      throw error;
    }
  },
  transferFunds: async (amount, from, to, accountId) => {
    const requestBody = {
      amount,
      from,
      to,
      accountId,
    };
    const idempotency = acquireWalletIdempotencyKey("transfer", requestBody);
    let idempotencyAttemptCompleted = false;
    const completeIdempotencyAttempt = (outcome: WalletIdempotencyOutcome) => {
      if (idempotencyAttemptCompleted) {
        return;
      }

      completeWalletIdempotencyAttempt(idempotency, outcome);
      idempotencyAttemptCompleted = true;
    };

    try {
      const response = await fetch("/api/private/wallet/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency.key,
        },
        body: JSON.stringify({
          ...requestBody,
          idempotencyKey: idempotency.key,
        }),
      });

      const payload = await parseApiPayload(response);
      completeIdempotencyAttempt(
        walletIdempotencyOutcomeFromResponse(response, payload),
      );
      if (payload.snapshot) {
        applySnapshot(set, payload.snapshot);
      }

      if (!response.ok) {
        return {
          ok: false,
          message: payload.message ?? payload.error ?? "Transfer failed.",
        };
      }

      return {
        ok: true,
        message: payload.message ?? "Transfer successful!",
      };
    } catch (error) {
      completeIdempotencyAttempt({ terminal: false });
      throw error;
    }
  },
  addAccount: async (input) => {
    const response = await fetch("/api/private/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    const payload = await parseApiPayload(response);
    if (payload.snapshot) {
      applySnapshot(set, payload.snapshot);
    }

    if (!response.ok) {
      const baseMessage = payload.message ?? payload.error ?? "Failed to create account.";
      const marker =
        payload.stage || payload.code
          ? ` [${payload.stage ?? "unknown"}${payload.code ? `/${payload.code}` : ""}]`
          : "";
      return {
        ok: false,
        message: `${baseMessage}${marker}`,
      };
    }

    return {
      ok: true,
      message: payload.message ?? "Trading account created successfully.",
      account: payload.account,
      credentials: payload.account?.credentials,
    };
  },
  archiveAccount: async (id) => {
    const response = await fetch(`/api/private/accounts/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Archived" }),
    });

    const payload = await parseApiPayload(response);
    if (payload.snapshot) {
      applySnapshot(set, payload.snapshot);
    }

    if (!response.ok) {
      return {
        ok: false,
        message: payload.message ?? payload.error ?? "Failed to archive account.",
      };
    }

    return {
      ok: true,
      message: payload.message ?? "Account archived successfully.",
    };
  },
  unarchiveAccount: async (id) => {
    const response = await fetch(`/api/private/accounts/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "Active" }),
    });

    const payload = await parseApiPayload(response);
    if (payload.snapshot) {
      applySnapshot(set, payload.snapshot);
    }

    if (!response.ok) {
      return {
        ok: false,
        message: payload.message ?? payload.error ?? "Failed to restore account.",
      };
    }

    return {
      ok: true,
      message: payload.message ?? "Account restored successfully.",
    };
  },
  deleteAccount: async (id) => {
    const response = await fetch(`/api/private/accounts/${id}`, {
      method: "DELETE",
    });

    const payload = await parseApiPayload(response);
    if (payload.snapshot) {
      applySnapshot(set, payload.snapshot);
    }

    if (!response.ok) {
      return {
        ok: false,
        message: payload.message ?? payload.error ?? "Failed to delete account.",
      };
    }

    return {
      ok: true,
      message: payload.message ?? "Account deleted successfully.",
    };
  },
  syncAccountBalance: async (accountId) => {
    const response = await fetch(
      `/api/private/accounts/${accountId}/sync-balance`,
      { method: "POST" },
    );

    let payload: { ok?: boolean; data?: { balance?: number; equity?: number; freeMargin?: number; syncedAt?: string }; error?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      return { ok: false, message: "Failed to parse sync response." };
    }

    if (!response.ok) {
      return {
        ok: false,
        message: typeof payload.error === "string" ? payload.error : "Balance sync failed.",
      };
    }

    // Optimistically update just the balance field on the matching account
    if (payload.data) {
      const { balance, equity, freeMargin } = payload.data;
      set((state) => ({
        tradingAccounts: state.tradingAccounts.map((account) =>
          account.id === accountId
            ? {
              ...account,
              balance: balance ?? account.balance,
              equity: equity ?? account.equity,
              freeMargin: freeMargin ?? account.freeMargin,
            }
            : account
        ),
      }));
    }

    return {
      ok: true,
      message: "Balance synced from MT5.",
    };
  },
}));

