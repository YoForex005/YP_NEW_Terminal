import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import {
  verifyTradingAccountCredentialsForUser,
} from "@/lib/server/dashboard-service";
import {
  Mt5AccountOperationError,
  type Mt5UserPasswordType,
} from "@/lib/server/mt5-manager";

interface VerifyBody {
  passwordType?: Mt5UserPasswordType;
  password?: string;
}

interface RouteContext {
  params: {
    accountId: string;
  };
}

const toMt5ErrorStatus = (error: Mt5AccountOperationError): number => {
  if (error.code === "MT_RET_AUTH_MANAGER_IPBLOCK") {
    return 503;
  }

  if (error.code === "MT_RET_ERR_NETWORK") {
    return 502;
  }

  if (error.stage === "user_request" && error.code === "MT_RET_ERR_NOTFOUND") {
    return 404;
  }

  if (error.stage === "verify_status") {
    return 403;
  }

  if (error.stage === "verify") {
    return 401;
  }

  return 502;
};

const toMt5ErrorMessage = (error: Mt5AccountOperationError): string => {
  if (error.code === "MT_RET_AUTH_MANAGER_IPBLOCK") {
    return "MT5 Manager access is blocked for this server IP. Ask broker support to whitelist your CRM public IP.";
  }

  if (error.code === "MT_RET_ERR_NETWORK") {
    return "Cannot reach MT5 manager endpoint. Verify MT5 server host/port and proxy settings.";
  }

  if (error.stage === "user_request" && error.code === "MT_RET_ERR_NOTFOUND") {
    return "MT5 account does not exist on broker server.";
  }

  if (error.stage === "verify_status" && error.code === "ACCOUNT_DISABLED") {
    return "MT5 account is disabled on broker server. Terminal login will fail until account is activated.";
  }

  if (error.stage === "verify_status" && error.code === "ACCOUNT_TRADE_DISABLED") {
    return "MT5 trading access is disabled for this account.";
  }

  if (error.stage === "verify") {
    return "Invalid MT5 login or password for terminal authentication.";
  }

  return (
    error.message ||
    "MT5 credentials verification failed due to a broker integration error."
  );
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: VerifyBody;
  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const passwordType = body.passwordType ?? "trading";
  if (passwordType !== "trading" && passwordType !== "investor") {
    return NextResponse.json(
      { error: "passwordType must be either 'trading' or 'investor'." },
      { status: 400 },
    );
  }

  try {
    const result = await verifyTradingAccountCredentialsForUser(
      auth.user.id,
      context.params.accountId,
      passwordType,
      body.password,
    );

    if (!result.ok) {
      const status = result.message === "Account not found." ? 404 : 400;
      return NextResponse.json(
        { error: result.message, snapshot: result.snapshot },
        { status },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        account: result.account,
        passwordType,
        server: result.server,
        serverHost: result.serverHost,
        serverPort: result.serverPort,
        snapshot: result.snapshot,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Mt5AccountOperationError) {
      console.error("[api/private/accounts/credentials/verify] MT5 verification failed", {
        userId: auth.user.id,
        accountId: context.params.accountId,
        stage: error.stage,
        code: error.code,
        message: error.message,
      });

      return NextResponse.json(
        {
          error: toMt5ErrorMessage(error),
          stage: error.stage,
          code: error.code,
        },
        { status: toMt5ErrorStatus(error) },
      );
    }

    return NextResponse.json(
      { error: "Failed to verify MT5 account credentials." },
      { status: 500 },
    );
  }
}
