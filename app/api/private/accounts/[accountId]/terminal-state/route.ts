import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import {
  AccountsBackendError,
  requestAccountsBackend,
  withBrokerContext,
} from "@/lib/server/accounts-backend";
import { resolveOwnedMt5Login } from "@/lib/server/mt5-account-scope";

interface RouteContext {
  params: {
    accountId: string;
  };
}

export const dynamic = "force-dynamic";

const TERMINAL_STATE_GET_BACKEND_TIMEOUT_MS = 800;
const TERMINAL_STATE_PUT_BACKEND_TIMEOUT_MS = 1_200;

const buildBackendPath = (login: string): string =>
  `/accounts/${encodeURIComponent(login)}/terminal-state`;

const parseRequestBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawBody) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Terminal state body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
};

const buildBackendErrorResponse = (error: unknown): NextResponse => {
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
      error: error instanceof Error ? error.message : "Terminal state request failed.",
    },
    { status: 502 },
  );
};

const isGracefulBackendUnavailable = (error: unknown): boolean => {
  if (!(error instanceof AccountsBackendError)) {
    return false;
  }

  return error.status >= 500 || /timed out|fetch failed|econnrefused/i.test(error.message);
};

const buildGracefulTerminalStateResponse = (): NextResponse =>
  NextResponse.json(
    { ok: true, data: null },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = context.params.accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required.", code: "ACCOUNT_ID_REQUIRED" },
      { status: 400 },
    );
  }

  const login = await resolveOwnedMt5Login(auth.user, accountId);
  if (!login) {
    return NextResponse.json(
      { error: "MT5 login not found for account.", code: "MT5_LOGIN_NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const data = await requestAccountsBackend(buildBackendPath(login), {
      query: withBrokerContext(
        {
          userId: auth.user.id,
          user_id: auth.user.id,
          accountId,
          account_id: accountId,
        },
        auth.user.brokerId,
      ),
      timeoutMs: TERMINAL_STATE_GET_BACKEND_TIMEOUT_MS,
    });

    return NextResponse.json({
      ok: true,
      accountId,
      account_id: accountId,
      login,
      ...(auth.user.brokerId
        ? { brokerId: auth.user.brokerId, broker_id: auth.user.brokerId }
        : {}),
      data,
    });
  } catch (error) {
    if (isGracefulBackendUnavailable(error)) {
      return buildGracefulTerminalStateResponse();
    }

    return buildBackendErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = context.params.accountId?.trim() ?? "";
  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required.", code: "ACCOUNT_ID_REQUIRED" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await parseRequestBody(request);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid JSON body.",
        code: "INVALID_JSON_BODY",
      },
      { status: 400 },
    );
  }

  const login = await resolveOwnedMt5Login(auth.user, accountId);
  if (!login) {
    return NextResponse.json(
      { error: "MT5 login not found for account.", code: "MT5_LOGIN_NOT_FOUND" },
      { status: 404 },
    );
  }

  try {
    const data = await requestAccountsBackend(buildBackendPath(login), {
      method: "PUT",
      body: withBrokerContext(
        {
          ...body,
          accountId,
          account_id: accountId,
          login,
          userId: auth.user.id,
          user_id: auth.user.id,
        },
        auth.user.brokerId,
      ),
      timeoutMs: TERMINAL_STATE_PUT_BACKEND_TIMEOUT_MS,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (isGracefulBackendUnavailable(error)) {
      return buildGracefulTerminalStateResponse();
    }

    return buildBackendErrorResponse(error);
  }
}
