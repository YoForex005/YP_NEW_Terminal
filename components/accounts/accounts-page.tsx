"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTradingStore } from "@/store/trading-store";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, ExternalLink, Activity, DollarSign, BarChart3, TrendingUp, MonitorPlay, Wallet, Lock, Key, Trash2, RefreshCw, Sparkles, Terminal, Archive, ArchiveRestore, ArrowUpCircle, Loader2, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateAccountModal } from "./create-account-modal";
import { AccountPreviewModal } from "./account-preview-modal";
import { ChangePasswordModal } from "./change-password-modal";
import { AccountCredentialsModal } from "./account-credentials-modal";
import type { TradingAccount } from "@/types/dashboard";
import type { TradingAccountInfo } from "@/types/webtrader";
import {
    extractTerminalLaunchPositionsPayload,
    extractTerminalLaunchSymbolsPayload,
    writeTerminalFrontendLaunchSnapshot,
} from "@/lib/terminal/terminal-launch-cache";

const TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY = "terminal:last-account:global";
const TERMINAL_LAUNCH_ACCOUNT_HINT_STORAGE_KEY = "terminal:launch-account-hint:v1";
const TERMINAL_LAUNCH_ACCOUNT_HINT_TTL_MS = 2 * 60 * 1000;
const TERMINAL_LAUNCH_WARMUP_TIMEOUT_MS = 6_500;
const terminalLaunchWarmupsInFlight = new Set<string>();

const getTerminalAccountLogin = (account: TradingAccount): string => {
    const login = account.credentials?.login?.trim() || account.accountNumber?.trim() || "";
    return /^\d+$/.test(login) ? login : "";
};

const getTerminalSessionAccountId = (account: TradingAccount): string => {
    const login = getTerminalAccountLogin(account);
    return login ? `mt5-${login}` : account.id;
};

const getTerminalHref = (account: TradingAccount): string =>
    `/terminal?accountId=${encodeURIComponent(getTerminalSessionAccountId(account))}`;

const toFiniteAccountNumber = (value: unknown, fallback = 0): number => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const buildTerminalAccountInfoSnapshot = (account: TradingAccount): TradingAccountInfo | null => {
    const login = Number.parseInt(getTerminalAccountLogin(account), 10);
    if (!Number.isFinite(login)) {
        return null;
    }

    const balance = toFiniteAccountNumber(account.balance);
    const equity = toFiniteAccountNumber(account.equity, balance);
    const margin = toFiniteAccountNumber(account.margin);
    const marginFree = toFiniteAccountNumber(account.freeMargin, Math.max(0, equity - margin));
    const marginLevel = margin > 0 ? (equity / margin) * 100 : 0;

    return {
        login,
        name: account.name || account.accountNumber || `MT5 ${login}`,
        server: account.serverIp || account.credentials?.server || "",
        currency: account.currency || "USD",
        leverage: toFiniteAccountNumber(account.leverage, 100),
        balance,
        equity,
        margin,
        marginFree,
        marginLevel,
        marginInitial: margin,
        marginMaintenance: margin,
        profit: equity - balance,
        swap: 0,
        commission: 0,
        credit: 0,
        limitOrders: 0,
        availableMargin: marginFree,
    };
};

const rememberTerminalLaunchHint = (account: TradingAccount) => {
    if (typeof window === "undefined") {
        return;
    }

    const login = getTerminalAccountLogin(account);
    const terminalAccountId = getTerminalSessionAccountId(account);
    const now = Date.now();
    const hint = {
        accountId: terminalAccountId,
        createdAtMs: now,
        expiresAtMs: now + TERMINAL_LAUNCH_ACCOUNT_HINT_TTL_MS,
        account: {
            id: account.id,
            accountNumber: account.accountNumber || login || account.id,
            name: account.name,
            platform: account.platform || "mt5",
            type: account.type,
            leverage: account.leverage,
            serverIp: account.serverIp || account.credentials?.server,
            currency: account.currency,
            balance: account.balance,
            equity: account.equity,
            freeMargin: account.freeMargin,
            margin: account.margin,
            status: account.status,
            createdAt: account.createdAt,
        },
    };

    try {
        window.localStorage.setItem(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY, terminalAccountId);
        window.localStorage.setItem(TERMINAL_LAUNCH_ACCOUNT_HINT_STORAGE_KEY, JSON.stringify(hint));
    } catch {
        // Best-effort only. The terminal can still fall back to URL/account hydration.
    }
};

const fetchTerminalWarmupJson = async (url: string): Promise<unknown | null> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TERMINAL_LAUNCH_WARMUP_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
            headers: { Accept: "application/json" },
        });
        if (!response.ok) {
            return null;
        }
        return await response.json().catch(() => null);
    } catch {
        return null;
    } finally {
        window.clearTimeout(timeout);
    }
};

const warmTerminalLaunch = (account: TradingAccount, router?: ReturnType<typeof useRouter>) => {
    if (typeof window === "undefined") {
        return;
    }

    const terminalAccountId = getTerminalSessionAccountId(account);
    const terminalHref = getTerminalHref(account);
    rememberTerminalLaunchHint(account);
    writeTerminalFrontendLaunchSnapshot(terminalAccountId, {
        source: "accounts-prefetch",
        accountInfo: buildTerminalAccountInfoSnapshot(account),
    });
    router?.prefetch(terminalHref);

    if (terminalLaunchWarmupsInFlight.has(terminalAccountId)) {
        return;
    }

    terminalLaunchWarmupsInFlight.add(terminalAccountId);
    void (async () => {
        const encodedAccountId = encodeURIComponent(terminalAccountId);
        const [positionsPayload, symbolsPayload] = await Promise.all([
            fetchTerminalWarmupJson(`/api/trading/positions?accountId=${encodedAccountId}`),
            fetchTerminalWarmupJson(`/api/trading/symbols?accountId=${encodedAccountId}`),
            fetchTerminalWarmupJson("/api/auth/me"),
            fetchTerminalWarmupJson("/api/private/dashboard/snapshot"),
            fetchTerminalWarmupJson(`/api/private/accounts/${encodedAccountId}/terminal-session`),
        ]);

        const positions = extractTerminalLaunchPositionsPayload(positionsPayload);
        if (positions.length > 0) {
            writeTerminalFrontendLaunchSnapshot(terminalAccountId, {
                source: "accounts-prefetch",
                positions,
            });
        }

        const symbols = extractTerminalLaunchSymbolsPayload(symbolsPayload);
        if (symbols.length > 0) {
            writeTerminalFrontendLaunchSnapshot(terminalAccountId, {
                source: "accounts-prefetch",
                symbols,
            });
        }
    })().finally(() => {
        window.setTimeout(() => terminalLaunchWarmupsInFlight.delete(terminalAccountId), 10_000);
    });
};

const getAccountLoginSortValue = (account: TradingAccount): number | null => {
    const login = account.credentials?.login?.trim() || account.accountNumber?.trim() || "";
    if (!/^\d+$/.test(login)) {
        return null;
    }

    return Number(login);
};

const compareAccountsByLogin = (a: TradingAccount, b: TradingAccount) => {
    const aLogin = getAccountLoginSortValue(a);
    const bLogin = getAccountLoginSortValue(b);

    if (aLogin !== null && bLogin !== null && aLogin !== bLogin) {
        return aLogin - bLogin;
    }

    if (aLogin !== null && bLogin === null) {
        return -1;
    }

    if (aLogin === null && bLogin !== null) {
        return 1;
    }

    return (
        a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true }) ||
        a.id.localeCompare(b.id)
    );
};

const getAccountCardTitle = (account: TradingAccount) => {
    return account.name?.trim() || `${account.type} Account`;
};

export function AccountsPageContent() {
    const router = useRouter();
    const { tradingAccounts, archiveAccount, unarchiveAccount, deleteAccount, syncAccountBalance } = useTradingStore();
    const { isLoading, reload } = useDashboardData();
    const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [isCredentialsOpen, setIsCredentialsOpen] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<TradingAccount | null>(null);
    const [selectedCredentialAccount, setSelectedCredentialAccount] = useState<TradingAccount | null>(null);
    const [isSyncingAll, setIsSyncingAll] = useState(false);
    const [syncingAccountIds, setSyncingAccountIds] = useState<Set<string>>(new Set());
    const [convertingAccountId, setConvertingAccountId] = useState<string | null>(null);
    const [configuringLiveGroup, setConfiguringLiveGroup] = useState(false);
    const [liveGroupConfigured, setLiveGroupConfigured] = useState(false);

    const handleConvertMode = useCallback(async (account: TradingAccount, targetMode: "live" | "demo") => {
        setConvertingAccountId(account.id);
        try {
            const res = await fetch(`/api/private/accounts/${encodeURIComponent(account.id)}/mode`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: targetMode }),
            });
            const payload = await res.json() as { ok?: boolean; error?: string; message?: string };
            if (!res.ok) {
                alert(payload.error ?? "Failed to convert account.");
                return;
            }
            await reload();
        } catch {
            alert("Failed to convert account. Is the backend running?");
        } finally {
            setConvertingAccountId(null);
        }
    }, [reload]);

    const handleConfigureLiveSymbols = useCallback(async () => {
        setConfiguringLiveGroup(true);
        try {
            // Enable BTCUSD in the live group (Flexy\YOFXP)
            const res = await fetch("/api/private/admin/groups/Flexy%5CYOFXP/symbols", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ symbol: "BTCUSD" }),
            });
            const payload = await res.json() as { ok?: boolean; error?: string };
            if (res.ok) {
                setLiveGroupConfigured(true);
            } else {
                alert(payload.error ?? "Failed to configure live group symbols.");
            }
        } catch {
            alert("Failed to configure live group. Is the backend running?");
        } finally {
            setConfiguringLiveGroup(false);
        }
    }, []);

    const handleSyncAllBalances = useCallback(async () => {
        setIsSyncingAll(true);
        try {
            await fetch('/api/private/accounts/sync-all-balances', { method: 'POST' });
            await reload();
        } catch {
            // best-effort
        } finally {
            setIsSyncingAll(false);
        }
    }, [reload]);

    const handleSyncSingleBalance = useCallback(async (account: TradingAccount) => {
        setSyncingAccountIds(prev => new Set(prev).add(account.id));
        try {
            await syncAccountBalance(account.id);
        } catch {
            // best-effort
        } finally {
            setSyncingAccountIds(prev => {
                const next = new Set(prev);
                next.delete(account.id);
                return next;
            });
        }
    }, [syncAccountBalance]);

    // Auto-sync balances on first load
    const hasAutoSynced = useRef(false);
    useEffect(() => {
        if (hasAutoSynced.current || tradingAccounts.length === 0) return;
        hasAutoSynced.current = true;
        // Small delay to avoid blocking initial render
        const timer = setTimeout(() => {
            void handleSyncAllBalances();
        }, 1500);
        return () => clearTimeout(timer);
    }, [tradingAccounts.length, handleSyncAllBalances]);


    // Filter State
    const [filterType, setFilterType] = useState<"all" | "Live" | "Demo">("all");
    const [filterPlatform, setFilterPlatform] = useState<"all" | "mt5" | "ctrader">("all");
    const [viewStatus, setViewStatus] = useState<"Active" | "Archived">("Active");

    // Format account date dynamically
    const formatAccountDate = (account: TradingAccount, status: "Active" | "Archived"): string => {
        if (status === "Archived" && account.archivedAt) {
            return `Archived ${new Date(account.archivedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
        }
        if (account.createdAt) {
            return `Created ${new Date(account.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
        }
        return status === "Archived" ? "Archived" : "Active Account";
    };

    // Compute Counts
    const counts = {
        all: tradingAccounts.filter(a => a.status === viewStatus).length,
        live: tradingAccounts.filter(a => a.type === "Live" && a.status === viewStatus).length,
        demo: tradingAccounts.filter(a => a.type === "Demo" && a.status === viewStatus).length,
        allPlatforms: tradingAccounts.filter(a => a.status === viewStatus).length,
        mt5: tradingAccounts.filter(a => (a.platform === 'mt5' || !a.platform) && a.status === viewStatus).length,
        ctrader: tradingAccounts.filter(a => a.platform === 'ctrader' && a.status === viewStatus).length
    };

    // Filter Logic
    const filteredAccounts = tradingAccounts
        .filter(account => {
            const matchesType = filterType === "all" || account.type === filterType;
            const matchesPlatform = filterPlatform === "all" || account.platform === filterPlatform || (!account.platform && filterPlatform === 'mt5');
            const matchesStatus = account.status === viewStatus;

            return matchesType && matchesPlatform && matchesStatus;
        })
        .sort(compareAccountsByLogin);

    const primaryTerminalWarmupAccount = filteredAccounts.find(
        (account) => account.status !== "Archived" && (account.platform === "mt5" || !account.platform),
    );

    useEffect(() => {
        if (isLoading || !primaryTerminalWarmupAccount) {
            return;
        }

        const timeout = window.setTimeout(() => {
            warmTerminalLaunch(primaryTerminalWarmupAccount, router);
        }, 800);

        return () => window.clearTimeout(timeout);
    }, [isLoading, primaryTerminalWarmupAccount, router]);

    if (isLoading && tradingAccounts.length === 0) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-10 w-40" />
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[300px] rounded-[2rem]" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 font-sans animate-in fade-in duration-700">
            {/* Hero Banner — Support Hub Style */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600/20 via-blue-500/10 to-transparent border border-blue-500/15 p-8 md:p-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-cyan-500/5 rounded-full blur-2xl translate-y-1/2" />

                <div className="relative">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8 mb-6">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1">
                                <Sparkles className="h-3 w-3" />
                                {viewStatus === 'Active' ? 'MY ACCOUNTS' : 'ARCHIVED ACCOUNTS'}
                            </div>
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                                {viewStatus === 'Active' ? <>Trading <span className="text-blue-400">Accounts</span></> : <>Archived <span className="text-blue-400">Accounts</span></>}
                            </h1>
                            <p className="text-base text-muted-foreground max-w-md">
                                {viewStatus === 'Active'
                                    ? "Manage your MT5 and cTrader trading accounts, sync balances, and create new ones."
                                    : "View and restore your archived trading accounts."}
                            </p>
                        </div>

                        <div className="flex gap-3 shrink-0">
                            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                                <p className="text-xl font-bold text-blue-400">{counts.all}</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Total</p>
                            </div>
                            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                                <p className="text-xl font-bold text-emerald-400">{counts.live}</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Live</p>
                            </div>
                            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                                <p className="text-xl font-bold">{counts.demo}</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Demo</p>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                        <Button
                            variant="outline"
                            onClick={handleSyncAllBalances}
                            disabled={isSyncingAll}
                            className="gap-2 rounded-xl font-bold border-border/50 bg-card/60 backdrop-blur-sm h-10 px-4 hover:border-emerald-500/30 hover:text-emerald-400 transition-all"
                            title="Sync live balances for all MT5 accounts"
                        >
                            <RefreshCw className={`h-4 w-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
                            {isSyncingAll ? 'Syncing...' : 'Sync Balances'}
                        </Button>
                        {counts.live > 0 && !liveGroupConfigured && (
                            <Button
                                variant="outline"
                                onClick={() => void handleConfigureLiveSymbols()}
                                disabled={configuringLiveGroup}
                                className="gap-2 rounded-xl font-bold border-amber-500/30 bg-amber-500/5 text-amber-400 backdrop-blur-sm h-10 px-4 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all"
                                title="Enable BTCUSD trading in the live MT5 group"
                            >
                                {configuringLiveGroup
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Zap className="h-4 w-4" />}
                                {configuringLiveGroup ? 'Enabling...' : 'Enable BTCUSD'}
                            </Button>
                        )}
                        {liveGroupConfigured && (
                            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 h-10 px-4 text-xs font-bold">
                                <Zap className="h-4 w-4" />
                                BTCUSD Enabled
                            </div>
                        )}
                        <Button
                            variant="outline"
                            onClick={() => setViewStatus(viewStatus === 'Active' ? 'Archived' : 'Active')}
                            className="gap-2 rounded-xl font-bold border-border/50 bg-card/60 backdrop-blur-sm h-10 px-4 transition-all"
                        >
                            <Archive className="h-4 w-4" />
                            {viewStatus === 'Active' ? 'Archived' : 'Active'}
                        </Button>
                        <Link href="/open-account">
                            <Button className="bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/25 rounded-xl h-10 px-5 active:scale-95 transition-all">
                                <Plus className="mr-2 h-4 w-4" /> Create Account
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center bg-card rounded-2xl border border-border/30 shadow-sm overflow-x-auto p-1 max-w-full">
                    <button
                        onClick={() => setFilterType("all")}
                        className={`min-w-[80px] h-[40px] px-4 rounded-xl text-[14px] font-bold transition-all ${filterType === "all" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        All ({counts.all})
                    </button>
                    <button
                        onClick={() => setFilterType("Live")}
                        className={`min-w-[80px] h-[40px] px-4 rounded-xl text-[14px] font-bold transition-all ${filterType === "Live" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        Live ({counts.live})
                    </button>
                    <button
                        onClick={() => setFilterType("Demo")}
                        className={`min-w-[80px] h-[40px] px-4 rounded-xl text-[14px] font-bold transition-all ${filterType === "Demo" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        Demo ({counts.demo})
                    </button>
                </div>

                <div className="flex items-center bg-card rounded-2xl border border-border/30 shadow-sm overflow-x-auto p-1 max-w-full">
                    <button
                        onClick={() => setFilterPlatform("all")}
                        className={`h-[40px] px-5 rounded-xl text-[14px] font-bold transition-all ${filterPlatform === "all" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        All Platforms
                    </button>
                    <button
                        onClick={() => setFilterPlatform("mt5")}
                        className={`h-[40px] px-5 rounded-xl text-[14px] font-bold transition-all ${filterPlatform === "mt5" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        MT5 ({counts.mt5})
                    </button>
                    <button
                        onClick={() => setFilterPlatform("ctrader")}
                        className={`h-[40px] px-5 rounded-xl text-[14px] font-bold transition-all ${filterPlatform === "ctrader" ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted/50"}`}
                    >
                        cTrader ({counts.ctrader})
                    </button>
                </div>
            </div>

            {/* Accounts Grid */}
            {filteredAccounts.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredAccounts.map((account) => {
                        const isLive = account.type === 'Live';
                        const isArchived = account.status === 'Archived';
                        const gradientColor = isArchived
                            ? 'from-orange-500 to-amber-500'
                            : isLive
                                ? 'from-emerald-500 to-teal-500'
                                : 'from-blue-500 to-indigo-500';
                        const glowColor = isArchived
                            ? 'hover:shadow-orange-500/10'
                            : isLive
                                ? 'hover:shadow-emerald-500/10'
                                : 'hover:shadow-blue-500/10';
                        const accountCardTitle = getAccountCardTitle(account);

                        return (
                            <Card
                                key={account.id}
                                className={`relative overflow-hidden border border-border/30 shadow-lg transition-all duration-300 rounded-2xl group hover:shadow-xl hover:translate-y-[-3px] ${glowColor} ${isArchived
                                    ? 'opacity-75'
                                    : 'bg-card'
                                    }`}
                            >
                                {/* Gradient Top Strip */}
                                <div className={`h-1.5 w-full bg-gradient-to-r ${gradientColor}`} />

                                {/* Hover Glow */}
                                <div className={`absolute inset-0 bg-gradient-to-br ${isLive ? 'from-emerald-500/3' : 'from-blue-500/3'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

                                <CardHeader className="pb-3 pt-5 px-6 relative z-10">
                                    {/* Header Badges */}
                                    <div className="flex items-center gap-2 mb-4">
                                        <Badge className={`rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider border-0 ${isLive
                                            ? 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-400'
                                            : 'bg-blue-500/15 text-blue-500 dark:text-blue-400'
                                            }`}>
                                            {account.type.toUpperCase()}
                                        </Badge>
                                        <Badge className={`rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider border-0 ${account.platform === 'ctrader'
                                            ? 'bg-sky-500/15 text-sky-500 dark:text-sky-400'
                                            : 'bg-violet-500/15 text-violet-500 dark:text-violet-400'
                                            }`}>
                                            {account.platform === 'ctrader' ? 'cTrader' : 'MT5'}
                                        </Badge>
                                        
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            {isArchived ? (
                                                <>
                                                    <Badge className="rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-500/15 text-orange-500 dark:text-orange-400 border-0 mr-1 hidden sm:inline-flex">
                                                        ARCHIVED
                                                    </Badge>
                                                    <Button
                                                        variant="default"
                                                        size="icon"
                                                        className="h-7 w-7 rounded-xl bg-orange-500 hover:bg-orange-600 text-white shadow-md shadow-orange-500/20"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            void unarchiveAccount(account.id);
                                                        }}
                                                        title="Unarchive Account"
                                                    >
                                                        <ArchiveRestore className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 rounded-xl text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            void deleteAccount(account.id);
                                                        }}
                                                        title="Delete from CRM"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 rounded-xl text-orange-500 hover:text-orange-600 hover:bg-orange-500/15 transition-all"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        void archiveAccount(account.id);
                                                    }}
                                                    title="Archive Account"
                                                >
                                                    <Archive className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Title */}
                                    <h3 className="text-lg font-bold text-foreground mb-3">
                                        {accountCardTitle} <span className="text-muted-foreground font-medium">— {account.currency}</span>
                                    </h3>

                                    {/* Login Info */}
                                    <div className="bg-muted/30 px-4 py-3 rounded-xl border border-border/30 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{account.platform === 'ctrader' ? 'cTrader' : 'MT5'} Login</span>
                                            <span className="text-sm font-bold text-foreground font-mono">{account.accountNumber}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Server</span>
                                            <span className="text-xs font-medium text-foreground font-mono">{account.serverIp ?? "Not assigned"}</span>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="px-6 pb-4 pt-1 relative z-10">
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="rounded-xl bg-muted/20 border border-border/20 p-3 text-center">
                                            <TrendingUp className={`h-4 w-4 mx-auto mb-1.5 ${isLive ? 'text-emerald-400' : 'text-blue-400'}`} />
                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Leverage</p>
                                            <p className="text-base font-bold text-foreground">1:{account.leverage ?? 100}</p>
                                        </div>
                                        <div className="rounded-xl bg-muted/20 border border-border/20 p-3 text-center relative group/balance">
                                            <div className="flex items-center justify-center gap-1.5 mb-1.5">
                                                <Wallet className={`h-4 w-4 ${isLive ? 'text-emerald-400' : 'text-blue-400'}`} />
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        void handleSyncSingleBalance(account);
                                                    }}
                                                    disabled={syncingAccountIds.has(account.id) || isSyncingAll}
                                                    title="Refresh balance from MT5"
                                                    className="opacity-0 group-hover/balance:opacity-100 transition-opacity disabled:cursor-not-allowed"
                                                >
                                                    <RefreshCw className={`h-3 w-3 text-muted-foreground hover:text-foreground transition-colors ${
                                                        syncingAccountIds.has(account.id) || isSyncingAll ? 'animate-spin opacity-100' : ''
                                                    }`} />
                                                </button>
                                            </div>
                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">Balance</p>
                                            {syncingAccountIds.has(account.id) || isSyncingAll ? (
                                                <div className="h-6 w-20 mx-auto rounded bg-muted/50 animate-pulse" />
                                            ) : (
                                                <p className="text-base font-bold text-foreground">{formatCurrency(account.balance, account.currency as any)}</p>
                                            )}
                                        </div>
                                    </div>

                                    <p className="text-[11px] font-medium text-muted-foreground mt-3">
                                        {formatAccountDate(account, viewStatus)}
                                    </p>
                                </CardContent>

                                <CardFooter className="px-4 sm:px-5 py-3 border-t border-border/20 flex flex-wrap sm:flex-nowrap items-center gap-2 relative z-10">
                                    {/* Open Terminal — only for active MT5 accounts */}
                                    {!isArchived && (account.platform === 'mt5' || !account.platform) && (
                                        <a
                                            href={getTerminalHref(account)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onPointerEnter={() => warmTerminalLaunch(account, router)}
                                            onFocus={() => warmTerminalLaunch(account, router)}
                                            onTouchStart={() => warmTerminalLaunch(account, router)}
                                            onClick={() => warmTerminalLaunch(account, router)}
                                        >
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-9 px-3 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-500 transition-all flex-1 sm:flex-none justify-center w-full sm:w-auto"
                                                title="Open MT5 Terminal"
                                            >
                                                <Terminal className="h-3.5 w-3.5 mr-1.5" />
                                                Terminal
                                            </Button>
                                        </a>
                                    )}

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 px-3 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-1 sm:flex-none justify-center"
                                        onClick={() => {
                                            setSelectedAccount(account);
                                            setIsPreviewOpen(true);
                                        }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1.5 text-current"><path d="M8 3.5C4.5 3.5 1.5 6 0.5 8C1.5 10 4.5 12.5 8 12.5C11.5 12.5 14.5 10 15.5 8C14.5 6 11.5 3.5 8 3.5ZM8 11C6.35 11 5 9.65 5 8C5 6.35 6.35 5 8 5C9.65 5 11 6.35 11 8C11 9.65 9.65 11 8 11ZM8 6.5C7.17 6.5 6.5 7.17 6.5 8C6.5 8.83 7.17 9.5 8 9.5C8.83 9.5 9.5 8.83 9.5 8C9.5 7.17 8.83 6.5 8 6.5Z" fill="currentColor" /></svg>
                                        Preview
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-9 px-3 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-1 sm:flex-none justify-center"
                                        title="View Credentials"
                                        onClick={() => {
                                            setSelectedCredentialAccount(account);
                                            setIsCredentialsOpen(true);
                                        }}
                                    >
                                        <Key className="h-3.5 w-3.5 mr-1.5" />
                                        Credentials
                                    </Button>

                                    {account.type === "Demo" && account.platform === "mt5" && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-9 px-3 rounded-xl text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-900/20 transition-all flex-1 sm:flex-none justify-center"
                                            title="Convert to Live Account"
                                            disabled={convertingAccountId === account.id}
                                            onClick={() => void handleConvertMode(account, "live")}
                                        >
                                            {convertingAccountId === account.id
                                                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                                : <ArrowUpCircle className="h-3.5 w-3.5 mr-1.5" />}
                                            Go Live
                                        </Button>
                                    )}

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                                        onClick={() => {
                                            setSelectedAccount(account);
                                            setIsChangePasswordOpen(true);
                                        }}
                                        title="Change Password"
                                    >
                                        <Lock className="h-3.5 w-3.5" />
                                    </Button>

                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <Card className="border border-dashed border-border/50 rounded-2xl bg-card/50">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="h-20 w-20 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-5">
                            <MonitorPlay className="h-10 w-10 text-blue-400" />
                        </div>
                        <h3 className="text-xl font-bold text-foreground">No Trading Accounts Found</h3>
                        <p className="text-sm text-muted-foreground max-w-[280px] mt-2 mb-6">
                            Try adjusting your filters or create a new account to get started.
                        </p>
                        <Link href="/open-account">
                            <Button className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20 h-11 px-6">
                                <Plus className="mr-2 h-4 w-4" /> Open New Account
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}

            <CreateAccountModal
                isOpen={isCreateAccountOpen}
                onClose={() => setIsCreateAccountOpen(false)}
                onAccountCreated={(account) => {
                    setSelectedCredentialAccount(account);
                    setIsCredentialsOpen(true);
                }}
            />

            <AccountPreviewModal
                isOpen={isPreviewOpen}
                onClose={() => {
                    setIsPreviewOpen(false);
                    setSelectedAccount(null);
                }}
                account={selectedAccount}
            />

            <ChangePasswordModal
                isOpen={isChangePasswordOpen}
                onClose={() => {
                    setIsChangePasswordOpen(false);
                    setSelectedAccount(null);
                }}
                account={selectedAccount}
            />

            <AccountCredentialsModal
                isOpen={isCredentialsOpen}
                onClose={() => {
                    setIsCredentialsOpen(false);
                    setSelectedCredentialAccount(null);
                }}
                account={selectedCredentialAccount}
                onChangePassword={(account) => {
                    setIsCredentialsOpen(false);
                    setSelectedCredentialAccount(null);
                    setSelectedAccount(account);
                    setIsChangePasswordOpen(true);
                }}
            />
        </div>
    );
}
