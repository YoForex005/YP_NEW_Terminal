"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, ArrowUpRight, ArrowDownRight, Activity, Percent } from "lucide-react";

interface StatProps {
    label: string;
    value: string;
    subValue?: string;
    trend?: "up" | "down" | "neutral";
    icon: React.ElementType;
    accentColor: string;
}

function StatCard({ label, value, subValue, trend, icon: Icon, accentColor }: StatProps) {
    return (
        <Card className="p-5 border border-[#1a1a1a] shadow-none bg-[#0a0a0a] rounded-xl hover:border-[#333] transition-all group">
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                    <div className="space-y-1">
                        <h3 className="text-2xl font-bold tracking-tight text-white">{value}</h3>
                        {subValue && (
                            <div className="flex items-center gap-1.5">
                                {trend === "up" && <ArrowUpRight className="h-3 w-3 text-[#00C853]" />}
                                {trend === "down" && <ArrowDownRight className="h-3 w-3 text-red-500" />}
                                <span className={cn(
                                    "text-xs font-medium",
                                    trend === "up" ? "text-[#00C853]" :
                                        trend === "down" ? "text-red-500" : "text-muted-foreground"
                                )}>
                                    {subValue}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className={`p-3 rounded-xl transition-colors`} style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </Card>
    );
}

interface JournalStatsProps {
    stats?: {
        profit: number;
        deposits: number;
        winRate: number;
        totalTrades: number;
    };
}

export function JournalStats({ stats }: JournalStatsProps) {
    const profit = stats?.profit ?? 0;
    const deposits = stats?.deposits ?? 0;
    const winRate = stats?.winRate ?? 0;
    const totalTrades = stats?.totalTrades ?? 0;

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
                label="Trading Profit"
                value={`$${profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subValue={profit >= 0 ? "Profitable" : "Loss"}
                trend={profit >= 0 ? "up" : "down"}
                icon={TrendingUp}
                accentColor="#00C853"
            />
            <StatCard
                label="Net Deposits"
                value={`$${deposits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subValue="Total funding"
                trend="up"
                icon={ArrowUpRight}
                accentColor="#3B82F6"
            />
            <StatCard
                label="Win Rate"
                value={`${winRate.toFixed(1)}%`}
                subValue={winRate > 50 ? "Good standing" : "Needs work"}
                trend={winRate > 50 ? "up" : "neutral"}
                icon={Percent}
                accentColor="#F59E0B"
            />
            <StatCard
                label="Total Trades"
                value={totalTrades.toString()}
                subValue="Executed"
                trend="neutral"
                icon={Activity}
                accentColor="#8B5CF6"
            />
        </div>
    );
}
