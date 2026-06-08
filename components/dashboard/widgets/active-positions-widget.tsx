"use client";

import { useEffect, useMemo, useState } from "react";
import { Crosshair, RefreshCw, Target } from "lucide-react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import { formatSignedCurrency, cn } from "@/lib/utils";
import { useTradingStore } from "@/store/trading-store";
import type { Position, TradingAccount } from "@/types/dashboard";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const extractMt5LoginFromAccount = (account: TradingAccount): string | null => {
    const candidates = [
        account.credentials?.login,
        account.accountNumber,
        /^mt5-(\d+)$/.exec(account.id)?.[1],
    ];

    for (const candidate of candidates) {
        const login = typeof candidate === "string" ? candidate.trim() : "";
        if (/^\d+$/.test(login)) {
            return login;
        }
    }

    return null;
};

const extractMt5LoginFromPosition = (position: Position): string | null => {
    const directLogin =
        typeof position.accountLogin === "string" ? position.accountLogin.trim() : "";
    if (/^\d+$/.test(directLogin)) {
        return directLogin;
    }

    return /^mt5-(\d+)-/.exec(position.id)?.[1] ?? null;
};

export function ActivePositionsWidget() {
    const { snapshot, syncLivePositions, isLiveSyncing, isLiveConnected } = useDashboardData();
    const {
        positions,
        pnlSeries,
        tradingAccounts,
        showUnrealizedPnl,
        setShowUnrealizedPnl,
    } = useTradingStore();
    const [selectedAccountLogin, setSelectedAccountLogin] = useState<string>("all");

    const accountOptions = useMemo(() => {
        const byLogin = new Map<string, string>();
        for (const account of tradingAccounts) {
            if (account.platform !== "mt5") {
                continue;
            }

            const login = extractMt5LoginFromAccount(account);
            if (!login) {
                continue;
            }

            const baseLabel = `${login}`;
            const nameLabel = account.name?.trim()
                ? `${login} - ${account.name.trim()}`
                : baseLabel;
            byLogin.set(login, byLogin.get(login) ?? nameLabel);
        }

        return [...byLogin.entries()]
            .map(([login, label]) => ({ login, label }))
            .sort((left, right) => left.login.localeCompare(right.login));
    }, [tradingAccounts]);

    useEffect(() => {
        if (selectedAccountLogin === "all") {
            return;
        }

        const exists = accountOptions.some(
            (entry) => entry.login === selectedAccountLogin,
        );
        if (!exists) {
            setSelectedAccountLogin("all");
        }
    }, [accountOptions, selectedAccountLogin]);

    const filteredPositions = useMemo(() => {
        if (selectedAccountLogin === "all") {
            return positions;
        }

        return positions.filter(
            (position) => extractMt5LoginFromPosition(position) === selectedAccountLogin,
        );
    }, [positions, selectedAccountLogin]);

    const effectivePnlSeries = useMemo(() => {
        if (selectedAccountLogin === "all") {
            return pnlSeries;
        }

        const accountSeries = snapshot?.accountPnlSeries?.[selectedAccountLogin];
        return Array.isArray(accountSeries) ? accountSeries : [];
    }, [pnlSeries, selectedAccountLogin, snapshot]);

    const summary = useMemo(() => {
        const count = filteredPositions.length;
        const totalVolume = filteredPositions.reduce((sum, position) => sum + position.volume, 0);
        const totalPnlRaw = filteredPositions.reduce((sum, position) => sum + position.pnl, 0);
        const totalPnl = showUnrealizedPnl ? totalPnlRaw : 0;
        return { count, totalVolume, totalPnl };
    }, [filteredPositions, showUnrealizedPnl]);

    const chartData = useMemo(
        () =>
            effectivePnlSeries.map((point) => ({
                ...point,
                value: showUnrealizedPnl ? point.value : 0,
            })),
        [effectivePnlSeries, showUnrealizedPnl],
    );

    return (
        <Card className="flex h-full flex-col overflow-hidden rounded-xl border-border dark:border-white/10 shadow-xl shadow-black/5 bg-gradient-to-br from-white to-slate-50 dark:from-card dark:to-muted/10">
            <CardHeader className="px-6 py-5 pb-2">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="w-full sm:w-auto">
                        <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/10">
                                <Crosshair className="h-4 w-4" strokeWidth={2.5} />
                            </div>
                            Active Positions
                        </CardTitle>
                        <p className="mt-1.5 pl-[48px] text-xs font-medium text-muted-foreground">
                            {summary.count} open positions &bull; Total P&L:{" "}
                            <span className={cn("font-bold tabular-nums", summary.totalPnl >= 0 ? "text-primary" : "text-rose-600")}>
                                {formatSignedCurrency(summary.totalPnl)}
                            </span>
                        </p>
                    </div>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
                        <Select value={selectedAccountLogin} onValueChange={setSelectedAccountLogin}>
                            <SelectTrigger className="h-8 w-full sm:w-[180px] rounded-full text-[10px] font-bold uppercase tracking-wider">
                                <SelectValue placeholder="All Accounts" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Accounts</SelectItem>
                                {accountOptions.map((entry) => (
                                    <SelectItem key={entry.login} value={entry.login}>
                                        {entry.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider", isLiveConnected ? "text-primary" : "text-muted-foreground")}>
                            {isLiveConnected ? "Live" : "Offline"}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                void syncLivePositions();
                            }}
                            disabled={isLiveSyncing}
                            className="h-8 gap-1.5 rounded-full px-3 text-[10px] font-bold uppercase tracking-wider"
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", isLiveSyncing && "animate-spin")} />
                            Sync
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="h-[calc(100%-80px)] overflow-y-auto px-6 pt-2">
                <div className="grid grid-cols-3 rounded-2xl border border-slate-100 bg-white/50 p-4 shadow-sm dark:bg-muted/10 dark:border-white/5">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Positions</p>
                        <p className="text-2xl font-black text-foreground tabular-nums tracking-tight mt-0.5">{summary.count}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Volume</p>
                        <p className="text-2xl font-black text-foreground tabular-nums tracking-tight mt-0.5">{summary.totalVolume.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Total P&L</p>
                        <p className={cn("text-2xl font-black tabular-nums tracking-tight mt-0.5", summary.totalPnl >= 0 ? "text-primary" : "text-rose-600")}>
                            {formatSignedCurrency(summary.totalPnl)}
                        </p>
                    </div>
                </div>

                <div className="mt-4 h-32 w-full rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent p-3 dark:from-primary/10 dark:border-primary/10">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                            <XAxis dataKey="t" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: 16,
                                    border: 'none',
                                    backgroundColor: 'hsl(var(--popover))',
                                    color: 'hsl(var(--popover-foreground))',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                    padding: '8px 12px',
                                }}
                                formatter={(value: number) => value.toFixed(2)}
                            />
                            <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#pnlFill)" strokeWidth={3} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {filteredPositions.length === 0 ? (
                    <div className="mt-5 flex min-h-[140px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-slate-50/50 text-center dark:border-white/10 dark:bg-white/5">
                        <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 text-slate-400 dark:bg-muted dark:ring-white/10">
                            <Target className="h-6 w-6" />
                        </span>
                        <p className="text-sm font-bold text-muted-foreground">No open positions</p>
                    </div>
                ) : (
                    <div className="mt-5 space-y-2.5">
                        {filteredPositions.map((position) => (
                            <article
                                key={position.id}
                                className="group flex items-center justify-between rounded-xl border border-transparent bg-white p-3 shadow-sm ring-1 ring-slate-100 transition-all hover:border-primary/20 hover:shadow-md hover:ring-primary/10 dark:bg-muted/20 dark:ring-white/5 dark:hover:ring-primary/20"
                            >
                                <div>
                                    <p className="text-sm font-bold text-foreground">{position.symbol}</p>
                                    <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/70">
                                        {position.side} &bull; {position.volume.toFixed(2)} lots
                                    </p>
                                </div>
                                <p className={cn(
                                    "font-black text-sm tabular-nums tracking-normal",
                                    position.pnl >= 0 ? "text-primary" : "text-rose-600"
                                )}>
                                    {formatSignedCurrency(showUnrealizedPnl ? position.pnl : 0)}
                                </p>
                            </article>
                        ))}
                    </div>
                )}

                <div className="mt-auto pt-4 pb-2">
                    <div className="flex items-center gap-2 justify-end">
                        <label htmlFor="show-unrealized-basic" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 cursor-pointer select-none">
                            Show unrealized P&L
                        </label>
                        <Switch checked={showUnrealizedPnl} onCheckedChange={setShowUnrealizedPnl} id="show-unrealized-basic" className="scale-75 origin-right" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
