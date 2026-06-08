"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, TrendingUp, Users, Calendar, DollarSign, BarChart2 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { SocialStrategy } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

interface StrategyDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    strategy: SocialStrategy | null;
    onViewFullAnalysis?: (strategy: SocialStrategy) => void;
}

export function StrategyDetailsModal({ isOpen, onClose, strategy, onViewFullAnalysis }: StrategyDetailsModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && strategy && (
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
                        className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between p-4 sm:p-6 pb-2">
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0",
                                    strategy.riskLevel === "High" ? "bg-rose-500" :
                                        strategy.riskLevel === "Medium" ? "bg-primary" : "bg-blue-500"
                                )}>
                                    {strategy.avatar}
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                                            {strategy.name}
                                        </h2>
                                        <Badge
                                            className={cn(
                                                "uppercase text-[10px] font-bold tracking-wider px-2 py-0.5 border h-5",
                                                strategy.riskLevel === "High" ? "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20" :
                                                    strategy.riskLevel === "Medium" ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20" :
                                                        "bg-primary/10 text-primary border-primary/20 dark:bg-primary/10 dark:text-primary dark:border-primary/20"
                                            )}
                                        >
                                            {strategy.riskLevel} RISK
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                        {strategy.description}
                                    </p>
                                </div>
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

                        {/* Content Scrollable Area */}
                        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar-y p-4 sm:p-6 pt-2 space-y-6">

                            {/* Key Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                                <StatsCard
                                    label="TOTAL RETURN"
                                    value={`${strategy.totalProfit > 0 ? "+" : ""}${strategy.totalProfit.toFixed(2)}%`}
                                    valueColor={strategy.totalProfit >= 0 ? "text-rose-500" : "text-slate-900"}
                                // Note: In screenshot -22.95% is RED (Rose). Usually positive is green, negative is red. 
                                // Screenshot shows negative profit as red. Let's stick to standard logic: Green for profit, Red for loss.
                                // Wait, screenshot shows -22.95% in RED. +1205% in Green.
                                // Logic: Profit >= 0 ? Green : Red.
                                />
                                <StatsCard
                                    label="WIN RATE"
                                    value={`${strategy.winRate.toFixed(2)}%`}
                                    valueColor="text-slate-900 dark:text-white"
                                />
                                <StatsCard
                                    label="PROFIT FACTOR"
                                    value={strategy.profitFactor.toFixed(2)}
                                    valueColor="text-slate-900 dark:text-white"
                                />
                                <StatsCard
                                    label="MAX DRAWDOWN"
                                    value={`${strategy.maxDrawdown.toFixed(2)}%`}
                                    valueColor="text-slate-900 dark:text-white"
                                />
                            </div>

                            {/* Equity Curve */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-slate-500" />
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Equity Curve (30 Days)</h3>
                                </div>
                                <div className="h-[200px] w-full bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={strategy.chartData}>
                                            <defs>
                                                <linearGradient id={`gradient-modal-${strategy.id}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={strategy.totalProfit >= 0 ? "hsl(var(--primary))" : "#f43f5e"} stopOpacity={0.2} />
                                                    <stop offset="100%" stopColor={strategy.totalProfit >= 0 ? "hsl(var(--primary))" : "#f43f5e"} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis
                                                dataKey="date"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 10, fill: '#94a3b8' }}
                                                dy={10}
                                            />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                                itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                                labelStyle={{ fontSize: '10px', color: '#64748b', marginBottom: '4px' }}
                                                formatter={(value: number) => [`$${value}`, "Equity"]}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="value"
                                                stroke={strategy.totalProfit >= 0 ? "hsl(var(--primary))" : "#f43f5e"}
                                                strokeWidth={2}
                                                fill={`url(#gradient-modal-${strategy.id})`}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Detailed Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
                                <DetailedStat label="Total Trades" value={strategy.trades.toString()} />
                                <DetailedStat label="Sharpe Ratio" value={strategy.sharpeRatio.toFixed(2)} />
                                <DetailedStat
                                    label="Avg Trade P&L"
                                    value={`$${strategy.avgTradePnl.toFixed(2)}`}
                                    valueColor={strategy.avgTradePnl >= 0 ? "text-primary" : "text-rose-500"}
                                />

                                <DetailedStat
                                    label="Best Trade"
                                    value={`+$${strategy.bestTrade.toFixed(2)}`}
                                    valueColor="text-primary"
                                />
                                <DetailedStat
                                    label="Worst Trade"
                                    value={`-$${Math.abs(strategy.worstTrade).toFixed(2)}`}
                                    valueColor="text-rose-500"
                                />
                                <DetailedStat label="Active Followers" value={strategy.followers.toString()} />

                                <DetailedStat label="Master Equity" value={`$${strategy.masterEquity.toLocaleString()}`} />
                                {/* Empty slots if needed, or fill with other data */}
                            </div>

                            <Button
                                variant="outline"
                                className="w-full border-slate-200 dark:border-slate-800 font-bold text-slate-600 dark:text-slate-300"
                                onClick={() => {
                                    if (strategy && onViewFullAnalysis) {
                                        onViewFullAnalysis(strategy);
                                    }
                                }}
                            >
                                <BarChart2 className="w-4 h-4 mr-2" />
                                View Full Analysis
                            </Button>

                            {/* Footer Info (Inside Scrollable) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <DollarSign className="h-4 w-4 text-slate-400" />
                                    <span>Performance Fee: <span className="font-bold text-slate-900 dark:text-white">{strategy.performanceFee}%</span></span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <Calendar className="h-4 w-4 text-slate-400" />
                                    <span>Active since {new Date(strategy.joinedAt).toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <Users className="h-4 w-4 text-slate-400" />
                                    <span>Min Balance: <span className="font-bold text-slate-900 dark:text-white">${strategy.minBalance}</span></span>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex justify-end gap-3">
                            <Button variant="outline" onClick={onClose} className="font-bold">
                                Close
                            </Button>
                            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20">
                                Subscribe to this Strategy
                            </Button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body
    );
}

function StatsCard({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
    return (
        <div className="bg-white dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 rounded-xl p-4 text-center shadow-sm">
            <div className={cn("text-xl font-bold mb-1", valueColor === "text-rose-500" ? "text-rose-500" : valueColor === "text-emerald-500" ? "text-primary" : valueColor)}>
                {value}
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {label}
            </div>
        </div>
    );
}

function DetailedStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <div className="flex flex-col">
            <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</span>
            <span className={cn("text-lg font-bold text-slate-900 dark:text-white", valueColor)}>
                {value}
            </span>
        </div>
    );
}
