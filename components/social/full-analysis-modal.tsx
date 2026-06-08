"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SocialStrategy } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface FullAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
    strategy: SocialStrategy | null;
}

export function FullAnalysisModal({ isOpen, onClose, strategy }: FullAnalysisModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && strategy && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
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
                        <div className="p-4 sm:p-6 pb-0 flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                                    {strategy.name}
                                </h2>
                                <p className="text-slate-500 dark:text-slate-400">
                                    Comprehensive performance analysis
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                onClick={onClose}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Tabs */}
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
                                <div className="px-6 border-b border-slate-100 dark:border-slate-800">
                                    <TabsList className="bg-transparent h-auto p-0 gap-6">
                                        <TabsTrigger
                                            value="overview"
                                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-4 text-slate-500 data-[state=active]:text-primary font-bold"
                                        >
                                            Overview
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="trades"
                                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-4 text-slate-500 data-[state=active]:text-primary font-bold"
                                        >
                                            Trades
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="instruments"
                                            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-4 text-slate-500 data-[state=active]:text-primary font-bold"
                                        >
                                            Instruments
                                        </TabsTrigger>
                                    </TabsList>
                                </div>

                                <TabsContent value="overview" className="flex-1 overflow-y-auto custom-scrollbar-y p-6 space-y-6">
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                                        <AnalysisCard label="Total Return" value={`${strategy.totalProfit > 0 ? "+" : ""}${strategy.totalProfit.toFixed(2)}%`} isMain />
                                        <AnalysisCard label="Win Rate" value={`${strategy.winRate.toFixed(2)}%`} isMain />
                                        <AnalysisCard label="Profit Factor" value={strategy.profitFactor.toFixed(2)} isMain />
                                        <AnalysisCard label="Max Drawdown" value={`${strategy.maxDrawdown.toFixed(2)}%`} isMain />

                                        <AnalysisCard label="Sharpe Ratio" value={strategy.sharpeRatio.toFixed(2)} />
                                        <AnalysisCard label="Recovery Factor" value={strategy.recoveryFactor.toFixed(2)} />
                                        <AnalysisCard label="Expected Payoff" value={`$${strategy.expectedPayoff.toFixed(2)}`} />
                                        <AnalysisCard label="Total Trades" value={strategy.trades.toString()} />
                                    </div>

                                    {/* Equity Curve */}
                                    <div className="bg-white dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 rounded-xl p-4 sm:p-6">
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4 sm:gap-0">
                                            <div>
                                                <h3 className="font-bold text-slate-900 dark:text-white">Equity Curve</h3>
                                                <p className="text-xs text-slate-500">Account balance over time</p>
                                            </div>
                                            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                                {["7D", "30D", "90D", "1Y"].map((range) => (
                                                    <button
                                                        key={range}
                                                        className={cn(
                                                            "px-3 py-1 rounded-md text-xs font-bold transition-all",
                                                            range === "30D" ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                                                        )}
                                                    >
                                                        {range}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="h-[200px] sm:h-[300px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={strategy.chartData}>
                                                    <defs>
                                                        <linearGradient id={`gradient-full-${strategy.id}`} x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor={strategy.totalProfit >= 0 ? "hsl(var(--primary))" : "#f43f5e"} stopOpacity={0.1} />
                                                            <stop offset="100%" stopColor={strategy.totalProfit >= 0 ? "hsl(var(--primary))" : "#f43f5e"} stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                    <XAxis
                                                        dataKey="date"
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                                        dy={10}
                                                    />
                                                    <YAxis
                                                        axisLine={false}
                                                        tickLine={false}
                                                        tick={{ fontSize: 12, fill: '#64748b' }}
                                                        tickFormatter={(val) => `$${val}`}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                                        formatter={(value: number) => [`$${value}`, "Equity"]}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="value"
                                                        stroke={strategy.totalProfit >= 0 ? "hsl(var(--primary))" : "#f43f5e"}
                                                        strokeWidth={3}
                                                        fill={`url(#gradient-full-${strategy.id})`}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Monthly Returns Table */}
                                    <div className="bg-white dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 rounded-xl p-6 overflow-hidden">
                                        <h3 className="font-bold text-slate-900 dark:text-white mb-4">Monthly Returns</h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-center">
                                                <thead>
                                                    <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                                                        <th className="py-2 text-left pl-2">Year</th>
                                                        {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(m => (
                                                            <th key={m} className="py-2 min-w-[50px]">{m}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {strategy.monthlyReturns.map((yearData) => (
                                                        <tr key={yearData.year} className="border-b border-slate-50/50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                            <td className="py-3 text-left pl-2 font-bold">{yearData.year}</td>
                                                            {[
                                                                yearData.jan, yearData.feb, yearData.mar, yearData.apr,
                                                                yearData.may, yearData.jun, yearData.jul, yearData.aug,
                                                                yearData.sep, yearData.oct, yearData.nov, yearData.dec
                                                            ].map((val, i) => (
                                                                <td key={i} className="py-3">
                                                                    {val !== undefined ? (
                                                                        <span className={cn(
                                                                            val >= 0 ? "text-primary" : "text-slate-900 dark:text-slate-300"
                                                                        )}>
                                                                            {val >= 0 ? "" : ""}{val}%
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-300">-</span>
                                                                    )}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Long/Short Stats */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <TradeStatsCard
                                            title="Long Trades"
                                            icon={<TrendingUp className="h-4 w-4" />}
                                            stats={strategy.longTradesStats}
                                        />
                                        <TradeStatsCard
                                            title="Short Trades"
                                            icon={<TrendingDown className="h-4 w-4" />} // Assuming short means down trending or distinct icon
                                            stats={strategy.shortTradesStats}
                                        />
                                    </div>

                                </TabsContent>

                                <TabsContent value="trades" className="flex-1 p-6">
                                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                        <RefreshCcw className="h-10 w-10 mb-2 opacity-20" />
                                        <p>Trade history not available in demo view</p>
                                    </div>
                                </TabsContent>

                                <TabsContent value="instruments" className="flex-1 p-6">
                                    <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                        <RefreshCcw className="h-10 w-10 mb-2 opacity-20" />
                                        <p>Instrument breakdown not available in demo view</p>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

function AnalysisCard({ label, value, isMain = false }: { label: string; value: string; isMain?: boolean }) {
    return (
        <div className={cn(
            "bg-white dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm",
            isMain && "bg-white dark:bg-slate-950/50" // Keep consistent
        )}>
            <div className="text-xs text-slate-500 font-medium mb-2">{label}</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
        </div>
    );
}

function TradeStatsCard({ title, icon, stats }: { title: string; icon: React.ReactNode; stats: any }) {
    const winRate = (stats.won / stats.total) * 100;

    return (
        <div className="bg-white dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
                {icon}
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{title}</h3>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-sm">Total Trades</span>
                    <span className="font-bold text-slate-900 dark:text-white">{stats.total}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-sm">Won</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                        {stats.won} ({winRate.toFixed(1)}%)
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-sm">Avg Profit</span>
                    <span className="font-bold text-primary">${stats.avgProfit.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-slate-500 text-sm">Avg Loss</span>
                    <span className="font-bold text-slate-900 dark:text-white">${stats.avgLoss.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
}
