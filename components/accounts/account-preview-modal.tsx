"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, TrendingUp, Wallet, Banknote, PieChart, ArrowUpRight, ArrowDownRight, Award, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TradingAccount } from "@/types/dashboard";
import { formatCurrency } from "@/lib/utils";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface AccountPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: TradingAccount | null;
}

import { useTradingStore } from "@/store/trading-store";

// Helper: compute human-readable account age from createdAt
function computeAccountAge(createdAt?: string): string {
    if (!createdAt) return "—";
    const created = new Date(createdAt);
    if (isNaN(created.getTime())) return "—";
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day";
    if (diffDays < 30) return `${diffDays} days`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return "1 month";
    if (diffMonths < 12) return `${diffMonths} months`;
    const diffYears = Math.floor(diffMonths / 12);
    return diffYears === 1 ? "1 year" : `${diffYears} years`;
}

// Helper: format date for display
function formatDisplayDate(dateStr?: string): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function AccountPreviewModal({ isOpen, onClose, account }: AccountPreviewModalProps) {
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<"analytics" | "financials">("analytics");
    const [timeRange, setTimeRange] = useState<"7D" | "30D" | "90D" | "ALL">("ALL");
    const [chartData, setChartData] = useState<any[]>([]);
    const [isSyncingBalance, setIsSyncingBalance] = useState(false);

    const { accountPnlSeries, syncAccountBalance } = useTradingStore();

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Reset tab when account changes
    useEffect(() => {
        if (account) setActiveTab("analytics");
    }, [account?.id]);

    const handleRefreshBalance = useCallback(async () => {
        if (!account) return;
        setIsSyncingBalance(true);
        try {
            await syncAccountBalance(account.id);
        } catch {
            // best-effort
        } finally {
            setIsSyncingBalance(false);
        }
    }, [account, syncAccountBalance]);

    useEffect(() => {
        if (!account) return;

        const series = accountPnlSeries[account.id] || [];
        let filteredSeries = series;

        if (timeRange !== "ALL") {
            const now = new Date();
            let days = 30;
            if (timeRange === "7D") days = 7;
            if (timeRange === "90D") days = 90;

            const cutoffDate = new Date();
            cutoffDate.setDate(now.getDate() - days);

            filteredSeries = series.filter(pt => new Date(pt.t) >= cutoffDate);
        }

        const data = filteredSeries.map(pt => ({
            date: new Date(pt.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: pt.value,
        }));

        setChartData(data);
    }, [account, timeRange, accountPnlSeries]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && account && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between p-6 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                    {account.name}
                                </h2>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                                    <span className="uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">{account.platform === 'mt5' ? 'MT5' : 'cTrader'}: <span className="text-slate-900 dark:text-slate-200">{account.accountNumber}</span></span>
                                    <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                    <Badge className={cn(
                                        "capitalize border-0",
                                        account.type === 'Demo' ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                                    )}>
                                        {account.type}
                                    </Badge>
                                    <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                    {account.status === 'Archived' ? (
                                        <span className="text-muted-foreground font-bold">Archived</span>
                                    ) : (
                                        <span className="text-primary font-bold">Active</span>
                                    )}
                                </div>
                                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                    Server IP: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{account.serverIp ?? "Not assigned"}</span>
                                    {account.createdAt && (
                                        <span className="ml-3">Created: <span className="font-bold text-slate-700 dark:text-slate-300">{formatDisplayDate(account.createdAt)}</span></span>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Refresh Balance Button */}
                                {account.platform !== 'ctrader' && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 rounded-xl text-xs font-semibold border-border/50 h-8 px-3"
                                        onClick={() => void handleRefreshBalance()}
                                        disabled={isSyncingBalance}
                                        title="Refresh balance from MT5"
                                    >
                                        <RefreshCw className={`h-3.5 w-3.5 ${isSyncingBalance ? 'animate-spin' : ''}`} />
                                        {isSyncingBalance ? 'Syncing...' : 'Refresh'}
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                    onClick={onClose}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Content Scrollable Area */}
                        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar-y p-6 space-y-8">

                            {/* Controls */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                {/* Tabs */}
                                <div className="flex bg-slate-100 dark:bg-slate-950/50 p-1 rounded-xl">
                                    <button
                                        onClick={() => setActiveTab("analytics")}
                                        className={cn(
                                            "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                                            activeTab === "analytics"
                                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                        )}
                                    >
                                        Analytics
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("financials")}
                                        className={cn(
                                            "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                                            activeTab === "financials"
                                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                        )}
                                    >
                                        Financials
                                    </button>
                                </div>

                                {/* Time Range - Only visible in Analytics */}
                                {activeTab === 'analytics' && (
                                    <div className="flex bg-slate-100 dark:bg-slate-950/50 p-1 rounded-xl">
                                        {["7D", "30D", "90D", "ALL"].map((range) => (
                                            <button
                                                key={range}
                                                onClick={() => setTimeRange(range as any)}
                                                className={cn(
                                                    "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                                                    timeRange === range
                                                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                                        : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                                )}
                                            >
                                                {range}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {activeTab === 'analytics' ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    {/* Stat Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <Card className="bg-primary border-0 text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden relative">
                                            <CardContent className="p-6 relative z-10">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                                                        <DollarSignIcon className="h-4 w-4 text-white" />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-wider opacity-90">BALANCE</span>
                                                </div>
                                                {isSyncingBalance ? (
                                                    <div className="h-8 w-28 rounded bg-white/20 animate-pulse" />
                                                ) : (
                                                    <div className="text-2xl font-bold tracking-tight">
                                                        {formatCurrency(account.balance, account.currency as any)}
                                                    </div>
                                                )}
                                            </CardContent>
                                            {/* Decorative BG */}
                                            <div className="absolute -right-6 -bottom-6 h-24 w-24 bg-white/10 rounded-full blur-2xl" />
                                        </Card>

                                        <Card className="bg-primary border-0 text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden relative">
                                            <CardContent className="p-6 relative z-10">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                                                        <Activity className="h-4 w-4 text-white" />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-wider opacity-90">EQUITY</span>
                                                </div>
                                                {isSyncingBalance ? (
                                                    <div className="h-8 w-28 rounded bg-white/20 animate-pulse" />
                                                ) : (
                                                    <div className="text-2xl font-bold tracking-tight">
                                                        {formatCurrency(account.equity, account.currency as any)}
                                                    </div>
                                                )}
                                            </CardContent>
                                            <div className="absolute -right-6 -bottom-6 h-24 w-24 bg-white/10 rounded-full blur-2xl" />
                                        </Card>

                                        <Card className="bg-primary border-0 text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden relative">
                                            <CardContent className="p-6 relative z-10">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                                                        <PieChart className="h-4 w-4 text-white" />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-wider opacity-90">MARGIN LEVEL</span>
                                                </div>
                                                {isSyncingBalance ? (
                                                    <div className="h-8 w-20 rounded bg-white/20 animate-pulse" />
                                                ) : (
                                                    <div className="text-2xl font-bold tracking-tight">
                                                        {typeof account.margin === 'number' && account.margin > 0
                                                            ? `${((account.equity / account.margin) * 100).toFixed(2)}%`
                                                            : "0.00%"}
                                                    </div>
                                                )}
                                            </CardContent>
                                            <div className="absolute -right-6 -bottom-6 h-24 w-24 bg-white/10 rounded-full blur-2xl" />
                                        </Card>

                                        <Card className="bg-primary border-0 text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden relative">
                                            <CardContent className="p-6 relative z-10">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                                                        <Wallet className="h-4 w-4 text-white" />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-wider opacity-90">FREE MARGIN</span>
                                                </div>
                                                {isSyncingBalance ? (
                                                    <div className="h-8 w-28 rounded bg-white/20 animate-pulse" />
                                                ) : (
                                                    <div className="text-2xl font-bold tracking-tight">
                                                        {formatCurrency(account.freeMargin, account.currency as any)}
                                                    </div>
                                                )}
                                            </CardContent>
                                            <div className="absolute -right-6 -bottom-6 h-24 w-24 bg-white/10 rounded-full blur-2xl" />
                                        </Card>
                                    </div>

                                    {/* Main Chart */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="h-5 w-5 text-primary" />
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Equity Curve</h3>
                                        </div>
                                        <div className="h-[300px] w-full bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={chartData}>
                                                    <defs>
                                                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <XAxis
                                                        dataKey="date"
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                                                        dy={10}
                                                        minTickGap={30}
                                                    />
                                                    <YAxis
                                                        hide={false}
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                                                        domain={['auto', 'auto']}
                                                        tickFormatter={(value) => `$${value}`}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{
                                                            backgroundColor: 'white',
                                                            borderRadius: '12px',
                                                            border: 'none',
                                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                                        }}
                                                        itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                                                        labelStyle={{ color: '#64748b', marginBottom: '4px', fontSize: '12px' }}
                                                        formatter={(value: number) => [formatCurrency(value, account.currency as any), "Equity"]}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="value"
                                                        stroke="hsl(var(--primary))"
                                                        strokeWidth={3}
                                                        fillOpacity={1}
                                                        fill="url(#colorValue)"
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Trading Statistics Grid */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Banknote className="h-5 w-5 text-primary" />
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Trading Statistics</h3>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {[
                                                { label: "Total Trades", value: account.stats?.totalTrades.toString() || "0" },
                                                { label: "Win Rate", value: `${account.stats?.winRate || 0}%`, color: "text-primary" },
                                                { label: "Profit Factor", value: account.stats?.profitFactor.toFixed(2) || "0.00", color: "text-rose-500" },
                                                { label: "Total Volume", value: `${account.stats?.totalVolume.toFixed(2) || "0.00"} lots` },

                                                { label: "Winning Trades", value: account.stats?.winningTrades.toString() || "0", color: "text-primary" },
                                                { label: "Losing Trades", value: account.stats?.losingTrades.toString() || "0", color: "text-rose-500" },
                                                { label: "Average Win", value: formatCurrency(account.stats?.averageWin || 0, account.currency as any), color: "text-primary" },
                                                { label: "Average Loss", value: formatCurrency(account.stats?.averageLoss || 0, account.currency as any), color: "text-rose-500" },

                                                { label: "Largest Win", value: formatCurrency(account.stats?.largestWin || 0, account.currency as any), color: "text-primary" },
                                                { label: "Largest Loss", value: formatCurrency(account.stats?.largestLoss || 0, account.currency as any), color: "text-rose-500" },
                                                { label: "Consecutive Wins", value: account.stats?.consecutiveWins.toString() || "0" },
                                                { label: "Consecutive Losses", value: account.stats?.consecutiveLosses.toString() || "0" },
                                            ].map((stat, i) => (
                                                <Card key={i} className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                                                    <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full">
                                                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{stat.label}</span>
                                                        <span className={cn("text-lg font-bold text-slate-900 dark:text-white", stat.color)}>{stat.value}</span>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Symbols Traded */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <PieChart className="h-5 w-5 text-primary" />
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Symbols Traded</h3>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                                            {/* Header */}
                                            <div className="grid grid-cols-6 gap-4 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/50">
                                                {["Symbol", "Trades", "Win Rate", "Volume", "Avg P/L", "Total P/L"].map((header) => (
                                                    <div key={header} className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center first:text-left last:text-right">
                                                        {header}
                                                    </div>
                                                ))}
                                            </div>
                                            {/* Rows (Empty for now based on screenshot) */}
                                            <div className="p-8 text-center text-sm text-muted-foreground">
                                                No symbols traded yet.
                                            </div>
                                        </div>
                                    </div>

                                    {/* Additional Metrics */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Award className="h-5 w-5 text-primary" />
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Additional Metrics</h3>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {[
                                                { label: "Total Commission", value: account.stats?.totalCommission !== undefined ? formatCurrency(account.stats.totalCommission, account.currency as any) : "—", color: "text-rose-500" },
                                                { label: "Total Swap", value: account.stats?.totalSwap !== undefined ? formatCurrency(account.stats.totalSwap, account.currency as any) : "—", color: "text-primary" },
                                                { label: "Account Age", value: computeAccountAge(account.createdAt) },
                                                { label: "Leverage", value: `1:${account.leverage ?? 100}` },
                                            ].map((stat, i) => (
                                                <Card key={i} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                                                    <CardContent className="p-6 flex flex-col items-start justify-center h-full">
                                                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">{stat.label}</span>
                                                        <span className={cn("text-xl font-bold text-slate-900 dark:text-white", stat.color)}>{stat.value}</span>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <FinancialsContent account={account} />
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

// Financials Tab Content
function FinancialsContent({ account }: { account: TradingAccount }) {
    const transactions = account.transactions || [];

    // Calculate Totals
    const totalDeposited = transactions
        .filter(t => t.type === 'Deposit' && t.status === 'Completed')
        .reduce((sum, t) => sum + t.amount, 0);

    const totalWithdrawn = transactions
        .filter(t => t.type === 'Withdrawal' && t.status === 'Completed')
        .reduce((sum, t) => sum + t.amount, 0);

    const lastActivity = transactions.length > 0 ? transactions[0] : null;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Controls (Just Tabs for now in Financials to allow switching back) */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                {/* Tabs - Need to duplicate this to keep it selectable, or lift state up properly (we are inside the component so it's fine but we need the setter) */}
                {/* Actually, I need to pass setActiveTab to FinancialsContent or render it inside the main component condition. 
                   Refactoring structure slightly to avoid duplicating the tab rendering logic is better, but for now let's keep the tabs OUTSIDE the conditional render or just render the content conditionally.
                   Ah, I replaced the WHOLE content in the previous edit. I should have kept the controls outside.
                   Let me re-structure in the next edit. For now, let's implement the internal UI.
                */}
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <ArrowDownRight className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Funding Activity</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/20">
                        <CardContent className="p-6">
                            <p className="text-[11px] font-bold text-primary dark:text-primary uppercase tracking-widest mb-1">TOTAL DEPOSITED</p>
                            <p className="text-2xl font-bold text-primary dark:text-primary">+{formatCurrency(totalDeposited, account.currency as any)}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/20">
                        <CardContent className="p-6">
                            <p className="text-[11px] font-bold text-primary dark:text-primary uppercase tracking-widest mb-1">TOTAL WITHDRAWN</p>
                            <p className="text-2xl font-bold text-primary dark:text-primary">{formatCurrency(totalWithdrawn, account.currency as any)}</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-primary/5 dark:bg-primary/10 border-primary/20 dark:border-primary/20">
                        <CardContent className="p-6">
                            <p className="text-[11px] font-bold text-primary dark:text-primary uppercase tracking-widest mb-1">LAST ACTIVITY</p>
                            {lastActivity ? (
                                <div>
                                    <p className="text-lg font-bold text-primary dark:text-primary">
                                        {new Date(lastActivity.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    <p className="text-xs font-medium text-primary/80 mt-1">
                                        {lastActivity.type} • +{formatCurrency(lastActivity.amount, account.currency as any)}
                                        {/* TODO: Handle withdrawal color / minus sign logic dynamically if needed */}
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-primary/60 dark:text-primary/60">No activity yet</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase font-bold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                            <tr>
                                <th className="px-6 py-4 tracking-widest">Date</th>
                                <th className="px-6 py-4 tracking-widest">Type</th>
                                <th className="px-6 py-4 tracking-widest text-right">Amount</th>
                                <th className="px-6 py-4 tracking-widest text-center">Wallet Balance</th>
                                <th className="px-6 py-4 tracking-widest text-center">Status</th>
                                <th className="px-6 py-4 tracking-widest">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {transactions.length > 0 ? (
                                transactions.map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                            <div className="flex flex-col">
                                                <span>{new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                <span className="text-xs font-normal text-slate-400">{new Date(t.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <Badge variant="secondary" className="bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary border-0 uppercase text-[10px] font-bold tracking-wider rounded-md px-2 py-1">
                                                {t.type.toUpperCase().replace('TRANSFER TO ', '').replace('TRANSFER FROM ', '')}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-primary dark:text-primary">
                                            {formatCurrency(t.amount, t.currency || account.currency as any)}
                                        </td>
                                        <td className="px-6 py-4 text-center text-slate-400 font-mono">
                                            —
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <Badge variant="secondary" className={cn("text-[10px] font-bold tracking-wider uppercase border",
                                                t.status === "Completed" ? "border-emerald-500/20 text-emerald-600 bg-emerald-500/10" :
                                                    t.status === "Pending" ? "border-amber-500/20 text-amber-600 bg-amber-500/10" :
                                                        "border-rose-500/20 text-rose-600 bg-rose-500/10"
                                            )}>
                                                {t.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 capitalize">
                                            {t.method || "System"}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        No transactions found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}



// Icon helper
function DollarSignIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="12" x2="12" y1="2" y2="22" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    )
}

function Activity(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    )
}
