import { createHash, randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import type { AuthContext } from "@/lib/server/auth";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_REPLAYED_HEADER = "Idempotency-Replayed";

type WalletOperation = "funds" | "transfer";

interface WalletIdempotencyInput {
  auth: AuthContext;
  request: NextRequest;
  operation: WalletOperation;
  payload: Record<string, unknown>;
  requestBody: Record<string, unknown>;
}

export interface WalletRouteIdempotency {
  key: string;
  clientProvided: boolean;
  generatedForRequest: boolean;
}

const KEY_PREFIX = "next-wallet-v1";
const SAFE_MINTED_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const normalizeClientKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

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

const readClientKey = (
  request: NextRequest,
  requestBody: Record<string, unknown>,
): string | undefined =>
  normalizeClientKey(request.headers.get(IDEMPOTENCY_KEY_HEADER)) ??
  normalizeClientKey(requestBody.idempotencyKey) ??
  normalizeClientKey(requestBody.idempotency_key);

const isReturnedWalletKey = (
  operation: WalletOperation,
  key: string,
): boolean =>
  key.startsWith(`${KEY_PREFIX}.${operation}.`) &&
  SAFE_MINTED_KEY_PATTERN.test(key);

export const resolveWalletIdempotency = ({
  auth,
  request,
  operation,
  payload,
  requestBody,
}: WalletIdempotencyInput): WalletRouteIdempotency => {
  const clientKey = readClientKey(request, requestBody);

  if (clientKey && isReturnedWalletKey(operation, clientKey)) {
    return {
      key: clientKey,
      clientProvided: true,
      generatedForRequest: false,
    };
  }

  // Stable client keys are the preferred path: bind them to the authenticated
  // session and normalized wallet payload before forwarding to the C++ store.
  // If no client key is present, the request nonce below is only a per-request
  // fallback. A browser retry without the original client key is a new command.
  const material = {
    version: 1,
    operation,
    userId: auth.user.id,
    session: sha256Hex(
      stableStringify({
        token: auth.token,
        userId: auth.session.userId,
        createdAt: auth.session.createdAt,
        expiresAt: auth.session.expiresAt,
      }),
    ),
    payload: sortJsonValue(payload),
    clientKey: clientKey ?? null,
    requestNonce: clientKey ? null : randomUUID(),
  };

  const source = clientKey ? "client" : "request";

  return {
    key: `${KEY_PREFIX}.${operation}.${source}.${sha256Hex(stableStringify(material))}`,
    clientProvided: Boolean(clientKey),
    generatedForRequest: !clientKey,
  };
};

export const walletIdempotencyResponseHeaders = (
  idempotency: WalletRouteIdempotency,
  replayed?: boolean,
): HeadersInit => {
  const headers: Record<string, string> = {
    [IDEMPOTENCY_KEY_HEADER]: idempotency.key,
  };

  if (typeof replayed === "boolean") {
    headers[IDEMPOTENCY_REPLAYED_HEADER] = replayed ? "true" : "false";
  }

  return headers;
};
