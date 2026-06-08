import { NextResponse } from "next/server";

import {
  AccountsBackendError,
  requestAccountsBackend,
  type BackendRequestOptions,
} from "@/lib/server/accounts-backend";

export const SETTINGS_BACKEND_TIMEOUT_MS = 3_000;

export const requestSettingsBackend = async <TData>(
  path: string,
  options?: BackendRequestOptions,
): Promise<TData> =>
  requestAccountsBackend<TData>(path, {
    ...options,
    timeoutMs: options?.timeoutMs ?? SETTINGS_BACKEND_TIMEOUT_MS,
  });

export const buildSettingsBackendErrorResponse = (error: unknown): NextResponse => {
  if (error instanceof AccountsBackendError) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        code: error.code ?? "ACCOUNTS_BACKEND_ERROR",
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: error instanceof Error ? error.message : "Settings backend request failed.",
    },
    { status: 502 },
  );
};
