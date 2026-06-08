"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Award,
    Clock,
    DollarSign,
    TrendingDown,
    TrendingUp,
    Target,
    Settings,
    LineChart
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TradingPerformanceSettingsModal } from "./trading-performance-settings-modal";
import { useTradingStore } from "@/store/trading-store";

export function TradingStatisticsWidget() {
    const { tradingAccounts, transactions } = useTradingStore();
    const [activeTab, setActiveTab] = useState<"Day" | "Week" | "Month">("Week");

    const timeframeConfig = {
        Day: {
            pnlLabel: "Today's P&L",
            periodLabel: "Today",
            performanceLabel: "Daily Performance",
        },
        Week: {
            pnlLabel: "This Week's P&L",
            periodLabel: "This Week",
            performanceLabel: "Weekly Performance",
        },
        Month: {
            pnlLabel: "This Month's P&L",
            periodLabel: "This Month",
            performanceLabel: "Monthly Performance",
        },
    };

    const config = timeframeConfig[activeTab];
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
        []
    );

    useEffect(() => {
        if (tradingAccounts.length > 0 && selectedAccountIds.length === 0) {
            setSelectedAccountIds(tradingAccounts.map((account) => account.id));
        }
    }, [selectedAccountIds.length, tradingAccounts]);

    const isCredit = (type: string) => type === "Deposit" || type.includes("from");

    const scopedTransactions = useMemo(() => {
        if (selectedAccountIds.length === 0) return [];
        return transactions;
    }, [selectedAccountIds.length, transactions]);

    const tradeCount = scopedTransactions.length;
    const winningTrades = scopedTransactions.filter((entry) => isCredit(entry.type)).length;
    const winRate = tradeCount > 0 ? (winningTrades / tradeCount) * 100 : 0;
    const totalPnl = scopedTransactions.reduce((sum, entry) => {
        const signed = isCredit(entry.type) ? entry.amount : -entry.amount;
        return sum + signed;
    }, 0);

    const handleSaveSettings = (ids: string[]) => {
        setSelectedAccountIds(ids);
        setIsSettingsOpen(false);
    };

    return (
        <>
            <Card className="flex h-full flex-col overflow-hidden rounded-xl border-border dark:border-white/10 shadow-xl shadow-black/5 bg-gradient-to-br from-white to-slate-50 dark:from-card dark:to-muted/10">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 py-5 pb-2">
                    <div className="flex flex-col gap-1">
                        <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
                                <TrendingUp className="h-4 w-4" strokeWidth={2.5} />
                            </div>
                            Trading Performance
                        </CardTitle>
                        <p className="text-xs font-medium text-muted-foreground pl-[48px]">
                            {selectedAccountIds.length} account{selectedAccountIds.length !== 1 ? 's' : ''} selected
                        </p>
                    </div>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-xl hover:bg-muted/50"
                    >
                        <Settings className="h-4 w-4" />
                    </button>
                </CardHeader>

                <CardContent className="flex-1 px-6 pt-2 pb-6 flex flex-col gap-5 overflow-y-auto">
                    {/* Tabs */}
                    <div className="flex bg-muted/40 w-fit rounded-xl p-1 shadow-inner">
                        {(["Day", "Week", "Month"] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "rounded-lg px-4 py-1.5 text-xs font-bold transition-all",
                                    activeTab === tab
                                        ? "bg-white text-primary shadow-sm ring-1 ring-black/5 dark:bg-background dark:ring-white/10"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1">
                        <StatCard
                            icon={Award}
                            title="Best Trade"
                            value="N/A"
                            subtext="No trades"
                        />
                        <StatCard
                            icon={TrendingDown}
                            title="Worst Trade"
                            value="N/A"
                            subtext="No trades"
                        />
                        <StatCard
                            icon={Clock}
                            title="Best Time"
                            value="N/A"
                            subtext="No data"
                        />
                        <StatCard
                            icon={Target}
                            title="Best Pair"
                            value="N/A"
                            subtext="No trades"
                        />
                        <StatCard
                            icon={DollarSign}
                            title={config.pnlLabel}
                            value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`}
                            subtext={`${tradeCount} trades`}
                            highlight={totalPnl >= 0}
                        />
                        <StatCard
                            icon={LineChart}
                            title={config.periodLabel}
                            value={`${winRate.toFixed(1)}%`}
                            subtext={`${winningTrades} profitable`}
                        />
                    </div>

                    {/* Footer Banner */}
                    <div className="rounded-3xl bg-gradient-to-r from-primary to-primary/90 text-primary-foreground p-5 flex items-center justify-between mt-auto shadow-lg shadow-primary/20 ring-1 ring-white/20">
                        <div>
                            <div className="font-bold text-sm tracking-tight">{config.performanceLabel}</div>
                            <div className="text-xs font-medium text-primary-foreground/80">{tradeCount} trades &middot; {winRate.toFixed(1)}% win rate</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-black tabular-nums tracking-tight">{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}</div>
                            <div className="text-xs font-medium text-primary-foreground/80">{winningTrades} winning</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <TradingPerformanceSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                selectedAccountIds={selectedAccountIds}
                onSave={handleSaveSettings}
            />
        </>
    );
}

function StatCard({
    icon: Icon,
    title,
    value,
    subtext,
    highlight
}: {
    icon: any;
    title: string;
    value: string;
    subtext: string;
    highlight?: boolean;
}) {
    return (
        <div className={cn(
            "group relative overflow-hidden rounded-2xl border p-4 flex flex-col gap-3 transition-all duration-300",
            highlight
                ? "bg-primary/10 border-primary/20 hover:bg-primary/10 hover:shadow-md hover:shadow-primary/5 dark:bg-primary/10 dark:border-primary/20"
                : "bg-white border-slate-100 hover:bg-slate-50 hover:shadow-md hover:shadow-slate-200/50 dark:bg-card dark:border-border/40 dark:hover:bg-muted/10"
        )}>
            <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                highlight ? "bg-primary/20 text-primary dark:bg-primary/20 dark:text-primary" : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-primary group-hover:shadow-sm dark:bg-muted dark:text-muted-foreground"
            )}>
                <Icon className="h-4 w-4" />
            </div>
            <div>
                <div className="text-[10px] text-muted-foreground/80 font-bold uppercase tracking-wider">{title}</div>
                <div className={cn(
                    "text-lg font-black mt-0.5 tabular-nums tracking-tight",
                    highlight ? "text-primary dark:text-primary" : "text-foreground"
                )}>{value}</div>
                <div className="text-[11px] font-medium text-muted-foreground/70">{subtext}</div>
            </div>
        </div>
    );
}
