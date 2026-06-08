import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { resolveOwnedMt5Login } from "@/lib/server/mt5-account-scope";
import { TerminalBridgeError } from "@/lib/server/terminal-ws-bridge";

export const TRADING_API_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export const tradingApiJson = (
  body: Record<string, unknown>,
  init?: { status?: number; headers?: HeadersInit },
) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...TRADING_API_NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });

export interface TradingRouteAccountScope {
  accountId: string;
  login: string;
  brokerId: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const normalizeTradingAccountIdentity = (
  value: unknown,
): string | null => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim().replace(/^mt5-/i, "");
  return normalized || null;
};

export const normalizeTradingBrokerIdentity = (
  value: unknown,
): string | null => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
};

export const resolveTradingRouteAccountScope = async (
  request: NextRequest,
  accountId: string,
): Promise<TradingRouteAccountScope> => {
  const auth = await authenticateRequest(request);
  if (!auth) {
    throw new TerminalBridgeError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const login = await resolveOwnedMt5Login(auth.user, accountId);
  if (!login) {
    throw new TerminalBridgeError(
      "Unable to resolve an owned MT5 login for this account.",
      404,
      "ACCOUNT_NOT_FOUND",
    );
  }

  return {
    accountId,
    login,
    brokerId: normalizeTradingBrokerIdentity(auth.user.brokerId),
  };
};

const collectAccountIdentities = (
  source: Record<string, unknown>,
): string[] =>
  [
    source.accountId,
    source.account_id,
    source.account,
    source.accountLogin,
    source.account_login,
    source.login,
    source.mt5Login,
    source.mt5_login,
  ]
    .map(normalizeTradingAccountIdentity)
    .filter((value): value is string => Boolean(value));

const collectBrokerIdentities = (
  source: Record<string, unknown>,
): string[] =>
  [
    source.brokerId,
    source.broker_id,
    source.broker,
  ]
    .map(normalizeTradingBrokerIdentity)
    .filter((value): value is string => Boolean(value));

export const recordBelongsToTradingScope = (
  source: Record<string, unknown>,
  scope: TradingRouteAccountScope,
): boolean => {
  const expectedAccount =
    scope.login ?? normalizeTradingAccountIdentity(scope.accountId);
  const accountIdentities = collectAccountIdentities(source);
  if (
    expectedAccount &&
    accountIdentities.length > 0 &&
    accountIdentities.some((value) => value !== expectedAccount)
  ) {
    return false;
  }

  const brokerIdentities = collectBrokerIdentities(source);
  if (
    scope.brokerId &&
    brokerIdentities.length > 0 &&
    brokerIdentities.some((value) => value !== scope.brokerId)
  ) {
    return false;
  }

  return true;
};

const SCOPE_ENVELOPE_KEYS = [
  "data",
  "payload",
  "result",
  "terminalState",
  "terminal_state",
  "state",
  "snapshot",
] as const;

export const payloadBelongsToTradingScope = (
  payload: unknown,
  scope: TradingRouteAccountScope,
): boolean => {
  if (!isRecord(payload)) {
    return true;
  }

  if (!recordBelongsToTradingScope(payload, scope)) {
    return false;
  }

  for (const key of SCOPE_ENVELOPE_KEYS) {
    const nested = payload[key];
    if (isRecord(nested) && !recordBelongsToTradingScope(nested, scope)) {
      return false;
    }
  }

  return true;
};

export const hasTradingScopeRowMismatch = (
  rows: unknown[],
  scope: TradingRouteAccountScope,
): boolean =>
  rows.some((row) => isRecord(row) && !recordBelongsToTradingScope(row, scope));

export const filterRowsForTradingScope = <T = unknown>(
  rows: T[],
  scope: TradingRouteAccountScope,
): T[] =>
  rows.filter((row) => (
    isRecord(row) ? recordBelongsToTradingScope(row, scope) : true
  ));

export const extractPayloadArray = (
  payload: unknown,
  keys: readonly string[],
): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of keys) {
    const direct = payload[key];
    if (Array.isArray(direct)) {
      return direct;
    }
  }

  for (const envelopeKey of SCOPE_ENVELOPE_KEYS) {
    const nested = payload[envelopeKey];
    if (!isRecord(nested)) {
      continue;
    }

    for (const key of keys) {
      const candidate = nested[key];
      if (Array.isArray(candidate)) {
        return candidate;
      }
    }
  }

  return [];
};

export const buildLiveTradingStateRequestPayload = (
  scope: TradingRouteAccountScope,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...extra,
  accountId: scope.accountId,
  account_id: scope.accountId,
  account: scope.login,
  login: scope.login,
  accountLogin: Number(scope.login),
  account_login: Number(scope.login),
  ...(scope.brokerId
    ? { brokerId: scope.brokerId, broker_id: scope.brokerId }
    : {}),
  force: true,
  refresh: true,
  live: true,
  bypassCache: true,
  cache: false,
  cacheFirst: false,
});
