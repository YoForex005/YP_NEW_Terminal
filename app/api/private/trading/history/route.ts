import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import {
    AccountsBackendError,
    requestAccountsBackend,
    withBrokerContext,
} from "@/lib/server/accounts-backend";
import {
    getOwnedMt5Logins,
    resolveOwnedMt5Login,
} from "@/lib/server/mt5-account-scope";

const RETRYABLE_HISTORY_ERROR_CODES = new Set([
    "MT_RET_ERR_NETWORK",
    "MT_RET_ERR_TIMEOUT",
    "MT_RET_ERR_CONNECTION",
    "MT_RET_ERR_FREQUENT",
    "MT5_MANAGER_ERROR",
    "TRADING_HISTORY_FAILED",
]);

const parseIntegerFallback = (value: string, fallback: number): number => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const emptyHistoryPayload = (
    accountLogin: string,
    limit: string,
    offset: string,
    options?: { degraded?: boolean; warning?: string; source?: string },
) => ({
    accountLogin,
    trades: [],
    total: 0,
    limit: parseIntegerFallback(limit, 50),
    offset: parseIntegerFallback(offset, 0),
    source: options?.source ?? "mt5-manager-sdk",
    ...(options?.degraded === undefined ? {} : { degraded: options.degraded }),
    ...(options?.warning ? { warning: options.warning } : {}),
});

const isNoHistoryError = (error: AccountsBackendError): boolean => {
    const message = error.message.toLowerCase();
    return (
        error.code === "MT_RET_ERR_NOTFOUND" ||
        error.code === "MT_RET_OK_NONE" ||
        message.includes("no history") ||
        message.includes("no data") ||
        message.includes("code 13")
    );
};

const isRetryableHistoryError = (error: AccountsBackendError): boolean => {
    if (error.status === 502 || error.status === 503 || error.status === 504) {
        return true;
    }

    return Boolean(error.code && RETRYABLE_HISTORY_ERROR_CODES.has(error.code));
};

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const requestedAccountLogin =
        request.nextUrl.searchParams.get("accountLogin")?.trim() || "";
    const limit = request.nextUrl.searchParams.get("limit") || "50";
    const offset = request.nextUrl.searchParams.get("offset") || "0";
    let accountLogin = "";

    try {
        if (requestedAccountLogin && requestedAccountLogin.toLowerCase() !== "all") {
            const ownedLogin = await resolveOwnedMt5Login(auth.user, requestedAccountLogin);

            if (!ownedLogin) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: "Account not found.",
                        code: "ACCOUNT_NOT_FOUND",
                    },
                    { status: 404 },
                );
            }

            accountLogin = ownedLogin;
        } else {
            const ownedLogins = await getOwnedMt5Logins(auth.user);
            if (ownedLogins.length === 0) {
                return NextResponse.json({
                    ok: true,
                    data: emptyHistoryPayload("", limit, offset),
                });
            }

            if (ownedLogins.length > 1) {
                return NextResponse.json(
                    {
                        ok: false,
                        error:
                            "accountLogin is required until scoped multi-account history is supported.",
                        code: "ACCOUNT_LOGIN_REQUIRED",
                    },
                    { status: 400 },
                );
            }

            accountLogin = ownedLogins[0];
        }

        const data = await requestAccountsBackend("/trading/history", {
            query: withBrokerContext(
                { accountLogin, limit, offset, ownerId: auth.user.id },
                auth.user.brokerId,
            ),
        });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (error instanceof AccountsBackendError) {
            if (isNoHistoryError(error)) {
                return NextResponse.json({
                    ok: true,
                    data: emptyHistoryPayload(accountLogin, limit, offset),
                });
            }

            if (isRetryableHistoryError(error)) {
                return NextResponse.json({
                    ok: true,
                    data: emptyHistoryPayload(accountLogin, limit, offset, {
                        degraded: true,
                        source: "mt5-manager-sdk-degraded",
                        warning: "Trade history is temporarily unavailable. Showing an empty history until MT5/backend recovers.",
                    }),
                });
            }

            return NextResponse.json(
                {
                    ok: false,
                    error: {
                        code: error.code ?? "TRADING_HISTORY_FAILED",
                        message: error.message,
                        details: error.details,
                    },
                },
                { status: error.status },
            );
        }

        throw error;
    }
}
