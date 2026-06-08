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

export async function GET(request: NextRequest) {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const requestedAccountLogin =
        request.nextUrl.searchParams.get("accountLogin")?.trim() || "";

    try {
        let accountLogin: string;

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
            if (ownedLogins.length !== 1) {
                return NextResponse.json(
                    {
                        ok: false,
                        error:
                            "accountLogin is required until scoped multi-account performance is supported.",
                        code: "ACCOUNT_LOGIN_REQUIRED",
                    },
                    { status: 400 },
                );
            }

            accountLogin = ownedLogins[0];
        }

        const data = await requestAccountsBackend("/trading/performance", {
            query: withBrokerContext(
                { accountLogin, ownerId: auth.user.id },
                auth.user.brokerId,
            ),
        });
        return NextResponse.json({ ok: true, data });
    } catch (error) {
        if (error instanceof AccountsBackendError) {
            return NextResponse.json(
                {
                    ok: false,
                    error: {
                        code: error.code ?? "TRADING_PERFORMANCE_FAILED",
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
