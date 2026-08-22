import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/server/auth";
import { setTradingAccountStatusForUser } from "@/lib/server/dashboard-service";
import { resolveOwnedMt5Login } from "@/lib/server/mt5-account-scope";
import { Mt5AccountOperationError } from "@/lib/server/mt5-manager";
import { withBrokerContext } from "@/lib/server/accounts-backend";

interface StatusBody {
  status?: "Active" | "Archived";
}

interface RouteContext {
  params: Promise<{
    accountId: string;
  }>;
}

const toMt5ErrorStatus = (error: Mt5AccountOperationError): number => {
  if (error.code === "MT_RET_AUTH_MANAGER_IPBLOCK") {
    return 503;
  }

  if (error.code === "MT_RET_ERR_NETWORK") {
    return 502;
  }

  if (error.code === "MT_RET_ERR_PERMISSIONS") {
    return 403;
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

  if (error.code === "MT_RET_ERR_PERMISSIONS") {
    return "Manager login lacks permission to activate/deactivate this MT5 account. Request UserUpdate rights from broker.";
  }

  return (
    error.message ||
    "MT5 account status update failed due to a broker integration error."
  );
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { accountId } = await context.params;

  let body: StatusBody;
  try {
    body = (await request.json()) as StatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.status !== "Active" && body.status !== "Archived") {
    return NextResponse.json(
      { error: "Status must be 'Active' or 'Archived'." },
      { status: 400 },
    );
  }

  try {
    const result = await setTradingAccountStatusForUser(
      auth.user.id,
      accountId,
      body.status,
    );

    if (!result.ok && result.message === "Account not found.") {
      // It might be a NodeJS backend unified account (not stored in local NextJS SQLite).
      // Only proxy after proving the MT5 login belongs to the authenticated user.
      const login = await resolveOwnedMt5Login(auth.user, accountId);
      if (!login) {
        return NextResponse.json(
          { error: "Account not found." },
          { status: 404 },
        );
      }
      
      const { requestAccountsBackend } = await import("@/lib/server/accounts-backend");
      
      try {
        await requestAccountsBackend(`/accounts/${encodeURIComponent(login)}/status`, {
          method: "PATCH",
          body: withBrokerContext(
            { status: body.status, ownerId: auth.user.id },
            auth.user.brokerId,
          ),
        });
      } catch {
         return NextResponse.json(
          { error: "Account not found on backend either." },
          { status: 404 },
        );
      }
    } else if (!result.ok) {
      return NextResponse.json(
        { error: result.message, snapshot: result.snapshot },
        { status: 404 },
      );
    }
    
    // Refresh full frontend snapshot to pull from backend
    const { getSnapshotForUser } = await import("@/lib/server/dashboard-service");
    const localSnapshot = await getSnapshotForUser(auth.user.id);
    const { normalizeSnapshotTransactions } = await import("@/lib/server/snapshot-format");
    
    const mergedSnapshot = Object.assign({}, localSnapshot);
    
    try {
      const { fetchBackendDashboardSnapshot } = await import("@/lib/server/accounts-backend");
      const backendSnapshot = await fetchBackendDashboardSnapshot(
        auth.user.id,
        auth.user.brokerId,
      );
      const { extractMt5LoginFromAccount } = await import("@/lib/server/accounts-backend");
      
      if (backendSnapshot) {
        for (const backendAccount of backendSnapshot.tradingAccounts) {
          const backendLogin = extractMt5LoginFromAccount(backendAccount);
          const isDuplicate = mergedSnapshot.tradingAccounts.some((entry) => {
            if (entry.id === backendAccount.id) return true;
            const localLogin = extractMt5LoginFromAccount(entry);
            return backendLogin && localLogin && backendLogin === localLogin;
          });
          if (!isDuplicate) {
            mergedSnapshot.tradingAccounts.push(backendAccount);
          }
        }
      }
    } catch (e) {
      // best-effort
    }

    return NextResponse.json(
      {
        ok: true,
        message: `Account ${body.status === "Archived" ? "archived" : "restored"} successfully.`,
        snapshot: normalizeSnapshotTransactions(mergedSnapshot)
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Mt5AccountOperationError) {
      console.error("[api/private/accounts/status] MT5 account status update failed", {
        userId: auth.user.id,
        accountId,
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
      { error: "Failed to update account status." },
      { status: 500 },
    );
  }
}

