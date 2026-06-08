"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, CalendarDays, Inbox, Sparkles } from "lucide-react";
import { useTradingStore } from "@/store/trading-store";

interface Trade {
    id: string;
    accountLogin: string;
    symbol: string;
    side: string;
    volume: number;
    openPrice: number;
    closePrice: number | null;
    pnl: number;
    commission: number;
    swap: number;
    openTime: string;
    closeTime: string | null;
    status: string;
}

type ApiTrade = Partial<Trade> & {
    ticket?: string | number;
    orderTicket?: string | number;
    login?: string | number;
    type?: string;
    entry?: string;
    price?: string | number;
    profit?: string | number;
    time?: string | number;
    timeMsc?: string | number;
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeTradeTime = (value: unknown): string => {
    if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
        const parsed = Number(value);
        const millis = parsed > 10_000_000_000 ? parsed : parsed * 1000;
        return new Date(millis).toISOString();
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    }

    return new Date(0).toISOString();
};

const normalizeHistoryTrade = (trade: ApiTrade): Trade | null => {
    const rawSide = String(trade.side ?? trade.type ?? "").toLowerCase();
    if (rawSide !== "buy" && rawSide !== "sell") {
        return null;
    }

    const entry = String(trade.entry ?? "").toLowerCase();
    const status = trade.status ?? (entry === "out" || entry === "outby" ? "closed" : "open");
    const tradeTime = normalizeTradeTime(trade.closeTime ?? trade.openTime ?? trade.time ?? trade.timeMsc);
    const executionPrice = toFiniteNumber(trade.price);

    return {
        id: String(trade.id ?? trade.ticket ?? trade.orderTicket ?? `${trade.login ?? trade.accountLogin}:${tradeTime}:${rawSide}`),
        accountLogin: String(trade.accountLogin ?? trade.login ?? ""),
        symbol: String(trade.symbol ?? ""),
        side: rawSide,
        volume: toFiniteNumber(trade.volume),
        openPrice: toFiniteNumber(trade.openPrice, executionPrice),
        closePrice: status === "closed"
            ? toFiniteNumber(trade.closePrice, executionPrice)
            : trade.closePrice == null
                ? null
                : toFiniteNumber(trade.closePrice),
        pnl: toFiniteNumber(trade.pnl ?? trade.profit),
        commission: toFiniteNumber(trade.commission),
        swap: toFiniteNumber(trade.swap),
        openTime: trade.openTime ? normalizeTradeTime(trade.openTime) : tradeTime,
        closeTime: status === "closed"
            ? (trade.closeTime ? normalizeTradeTime(trade.closeTime) : tradeTime)
            : null,
        status,
    };
};

export function HistoryDashboard() {
    const { tradingAccounts } = useTradingStore();
    const [selectedAccount, setSelectedAccount] = useState("all");
    const [orderType, setOrderType] = useState("all");
    const [timePeriod, setTimePeriod] = useState("all_time");

    const [trades, setTrades] = useState<Trade[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const activeAccount = tradingAccounts.find(a => a.id === selectedAccount);
    const accountNumbersKey = useMemo(
        () => tradingAccounts.map((account) => account.accountNumber).filter(Boolean).join("|"),
        [tradingAccounts],
    );
    const accountsToFetch = useMemo(
        () => selectedAccount === "all"
            ? accountNumbersKey.split("|").filter(Boolean)
            : activeAccount?.accountNumber
                ? [activeAccount.accountNumber]
                : [],
        [accountNumbersKey, activeAccount?.accountNumber, selectedAccount],
    );

    const accountLabel = useMemo(() => {
        if (selectedAccount === "all") return "All accounts";
        if (activeAccount) return `${activeAccount.name} #${activeAccount.accountNumber}`;
        return "All accounts";
    }, [selectedAccount, activeAccount]);

    // Fetch trades when filters change
    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        if (accountsToFetch.length === 0) {
            setTrades([]);
            setIsLoading(false);
            return () => {
                cancelled = true;
            };
        }

        Promise.all(accountsToFetch.map(async (accountLogin) => {
            const params = new URLSearchParams({
                accountLogin,
                limit: "500",
            });
            const response = await fetch(`/api/private/trading/history?${params.toString()}`);
            const data = await response.json();
            if (!data.ok || !Array.isArray(data.data?.trades)) {
                return [];
            }

            return data.data.trades
                .map((entry: ApiTrade) => normalizeHistoryTrade(entry))
                .filter((entry: Trade | null): entry is Trade => Boolean(entry));
        }))
            .then((accountTrades) => {
                if (cancelled) return;
                setTrades(accountTrades.flat());
            })
            .catch((error) => {
                if (cancelled) return;
                console.error(error);
                setTrades([]);
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [accountsToFetch]);

    // Filter locally by order type and time period
    const filteredTrades = useMemo(() => {
        let filtered = orderType === "all"
            ? trades
            : trades.filter(t => t.status === orderType);

        if (timePeriod !== "all_time") {
            const now = new Date();
            const daysMap: Record<string, number> = {
                "last_365": 365,
                "last_90": 90,
                "last_30": 30,
                "last_7": 7,
                "today": 1
            };
            const days = daysMap[timePeriod] || 365;
            const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(t => new Date(t.openTime) >= cutoff);
        }

        return filtered;
    }, [trades, orderType, timePeriod]);

    return (
        <div className="space-y-6 overflow-hidden">
            {/* Hero Banner — Orange theme */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-orange-600/20 via-orange-500/10 to-transparent border border-orange-500/15 p-8 md:p-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-amber-500/5 rounded-full blur-2xl translate-y-1/2" />

                <div className="relative">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-3 py-1">
                                <Sparkles className="h-3 w-3" />
                                HISTORY
                            </div>
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                                History of <span className="text-orange-400">Orders</span>
                            </h1>
                            <p className="text-base text-muted-foreground max-w-md">
                                Review your closed and open orders across all trading accounts and time periods.
                            </p>
                        </div>

                        <div className="flex gap-3 shrink-0">
                            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                                <p className="text-xl font-bold text-orange-400">{tradingAccounts.length}</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Accounts</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Account Selector */}
            <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Account</label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger className="w-full sm:w-[300px] bg-background border-input hover:border-primary/50 transition-colors">
                        <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All accounts</SelectItem>
                        {tradingAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                                {account.platform === "mt5" ? "Standard" : "cTrader"} #{account.accountNumber}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Filters Row */}
            <Card className="border border-border/30 shadow-lg rounded-2xl overflow-hidden">
                <div className="h-1.5 w-full bg-gradient-to-r from-orange-500 to-amber-500" />
                <CardContent className="pt-6 pb-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                        {/* Left: Tabs + Time Period */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                            {/* Order Type Tabs */}
                            <Tabs value={orderType} onValueChange={setOrderType}>
                                <TabsList className="bg-muted/50 h-auto p-1 gap-0.5 rounded-xl">
                                    <TabsTrigger
                                        value="all"
                                        className="data-[state=active]:bg-foreground data-[state=active]:text-background px-4 py-2 text-sm rounded-lg font-medium"
                                    >
                                        All history
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="closed"
                                        className="data-[state=active]:bg-foreground data-[state=active]:text-background px-4 py-2 text-sm rounded-lg font-medium"
                                    >
                                        Closed orders
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="open"
                                        className="data-[state=active]:bg-foreground data-[state=active]:text-background px-4 py-2 text-sm rounded-lg font-medium"
                                    >
                                        Open orders
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            {/* Time Period */}
                            <Select value={timePeriod} onValueChange={setTimePeriod}>
                                <SelectTrigger className="w-full sm:w-[160px] bg-background border-border/50 hover:border-primary/50 transition-colors rounded-xl">
                                    <div className="flex items-center gap-2">
                                        <CalendarDays size={14} className="text-muted-foreground shrink-0" />
                                        <SelectValue placeholder="All time" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all_time">All time</SelectItem>
                                    <SelectItem value="last_365">Last 365 days</SelectItem>
                                    <SelectItem value="last_90">Last 90 days</SelectItem>
                                    <SelectItem value="last_30">Last 30 days</SelectItem>
                                    <SelectItem value="last_7">Last 7 days</SelectItem>
                                    <SelectItem value="today">Today</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Right: Download CSV */}
                        <Button variant="outline" size="sm" className="gap-2 shrink-0 rounded-xl border-border/50">
                            <Download size={14} />
                            Download CSV
                        </Button>
                    </div>

                    {/* Data List */}
                    {isLoading ? (
                        <div className="flex justify-center py-16 text-muted-foreground">Loading history...</div>
                    ) : filteredTrades.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <div className="h-20 w-20 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-5">
                                <Inbox size={36} className="text-orange-400" />
                            </div>
                            <p className="text-base font-semibold text-foreground">
                                {orderType === "all"
                                    ? "You don't have trading history in this account"
                                    : orderType === "closed"
                                    ? "You don't have closed orders in this account"
                                    : "You don't have open orders in this account"
                                }
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">Try selecting a different account or time period.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="min-w-[800px]">
                                <div className="grid grid-cols-8 gap-4 px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40">
                                    <div className="col-span-1">Symbol</div>
                                    <div className="col-span-1">Side / Vol</div>
                                    <div className="col-span-2">Open Time</div>
                                    <div className="col-span-1 text-right">Open Price</div>
                                    <div className="col-span-1 text-right">Close Price</div>
                                    <div className="col-span-1 text-right">Profit</div>
                                    <div className="col-span-1 text-right">Net PnL</div>
                                </div>
                                <div className="flex flex-col">
                                    {filteredTrades.map(trade => {
                                        const netPnl = trade.pnl + trade.commission + trade.swap;
                                        return (
                                            <div key={trade.id} className="grid grid-cols-8 gap-4 px-4 py-3.5 text-sm border-b border-border/20 hover:bg-muted/10 transition-colors items-center">
                                                <div className="col-span-1 font-bold">{trade.symbol}</div>
                                                <div className="col-span-1">
                                                    <span className={trade.side.toLowerCase() === 'buy' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>{trade.side}</span>
                                                    <span className="text-muted-foreground ml-2">{trade.volume}</span>
                                                </div>
                                                <div className="col-span-2 text-muted-foreground text-xs">{new Date(trade.openTime).toLocaleString()}</div>
                                                <div className="col-span-1 text-right tabular-nums">{trade.openPrice.toFixed(5)}</div>
                                                <div className="col-span-1 text-right tabular-nums">{trade.closePrice?.toFixed(5) || '-'}</div>
                                                <div className="col-span-1 text-right tabular-nums">{trade.pnl > 0 ? <span className="text-emerald-400">+${trade.pnl.toFixed(2)}</span> : <span className="text-rose-400">-${Math.abs(trade.pnl).toFixed(2)}</span>}</div>
                                                <div className="col-span-1 text-right tabular-nums font-bold">{netPnl > 0 ? <span className="text-emerald-400">+${netPnl.toFixed(2)}</span> : <span className="text-rose-400">-${Math.abs(netPnl).toFixed(2)}</span>}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
