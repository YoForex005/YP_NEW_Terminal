import { requestAccountsBackend } from "@/lib/server/accounts-backend";

export interface BackendBalanceData {
  login: string;
  balance: number;
  equity: number;
  freeMargin: number;
  credit: number;
  syncedAt: string;
  cached?: boolean;
}

interface SyncBackendAccountBalanceOptions {
  attempts?: number;
  delayMs?: number;
  accept?: (result: BackendBalanceData) => boolean;
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const syncBackendAccountBalance = async (
  login: string,
  options?: SyncBackendAccountBalanceOptions,
): Promise<BackendBalanceData | null> => {
  if (!/^\d+$/.test(login)) {
    return null;
  }

  const attempts = Math.max(1, options?.attempts ?? 1);
  const delayMs = Math.max(0, options?.delayMs ?? 0);
  const accept = options?.accept;
  let lastResult: BackendBalanceData | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await requestAccountsBackend<BackendBalanceData>(
        `/accounts/${login}/sync-balance`,
        {
          method: "POST",
          timeoutMs: 20000,
        },
      );
      lastResult = result;

      if (!accept || accept(result)) {
        return result;
      }
    } catch (error) {
      if (attempt === attempts) {
        console.warn(
          `[backend-balance-sync] failed to sync balance for MT5 login ${login}`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (attempt < attempts && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return lastResult;
};
