"use client";

import { SocialStrategy } from "@/types/dashboard";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Users, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface StrategyCardProps {
    strategy: SocialStrategy;
    onDetailsClick?: (strategy: SocialStrategy) => void;
}

const riskConfig = {
    High: { color: "text-red-400", bg: "bg-red-500/15 border-red-500/20", avatar: "bg-red-500", gradient: "from-red-500/15 via-red-500/5" },
    Medium: { color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/20", avatar: "bg-primary", gradient: "from-amber-500/15 via-amber-500/5" },
    Low: { color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/20", avatar: "bg-blue-500", gradient: "from-blue-500/15 via-blue-500/5" },
};

export function StrategyCard({ strategy, onDetailsClick }: StrategyCardProps) {
    const isPositive = strategy.totalProfit >= 0;
    const risk = riskConfig[strategy.riskLevel] || riskConfig.Low;

    return (
        <Card className={`group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-border hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300`}>
            <CardContent className="p-0">
                {/* Gradient Header */}
                <div className={`h-14 bg-gradient-to-br ${risk.gradient} to-transparent relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                    <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full ${risk.bg.split(' ')[0]} blur-xl`} />
                </div>

                <div className="px-5 -mt-5 relative">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3">
                            <div className={cn(
                                "h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 border border-white/10 shadow-lg",
                                risk.avatar
                            )}>
                                {strategy.avatar}
                            </div>
                            <div>
                                <h3 className="font-bold line-clamp-1 text-sm">{strategy.name}</h3>
                                <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{strategy.description}</p>
                            </div>
                        </div>
                        <Badge className={cn(
                            "uppercase text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full h-auto border",
                            risk.bg, risk.color
                        )}>
                            {strategy.riskLevel}
                        </Badge>
                    </div>

                    {/* Chart */}
                    <div className="h-[60px] w-full mb-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={strategy.chartData}>
                                <defs>
                                    <linearGradient id={`gradient-${strategy.id}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={isPositive ? "hsl(var(--primary))" : "#f43f5e"} stopOpacity={0.2} />
                                        <stop offset="100%" stopColor={isPositive ? "hsl(var(--primary))" : "#f43f5e"} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={isPositive ? "hsl(var(--primary))" : "#f43f5e"}
                                    strokeWidth={2}
                                    fill={`url(#gradient-${strategy.id})`}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 py-4 border-t border-border/20">
                        <div className="text-center">
                            <p className={cn("text-sm font-bold", isPositive ? "text-primary" : "text-red-500")}>
                                {isPositive ? "+" : ""}{strategy.totalProfit.toFixed(2)}%
                            </p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Profit</p>
                        </div>
                        <div className="text-center border-l border-border/20">
                            <p className="text-sm font-bold">{strategy.winRate}%</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Win Rate</p>
                        </div>
                        <div className="text-center border-l border-border/20">
                            <p className="text-sm font-bold">{strategy.maxDrawdown.toFixed(2)}%</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Max DD</p>
                        </div>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="px-5 py-4 border-t border-border/20 flex flex-col gap-3">
                <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {strategy.trades} trades
                        </span>
                        <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {strategy.followers} followers
                        </span>
                    </div>
                    <div className="font-medium">
                        {strategy.performanceFee}% perf fee
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs font-bold rounded-lg border-border/40 hover:bg-muted"
                        onClick={() => onDetailsClick?.(strategy)}
                    >
                        Details
                    </Button>
                    <Button size="sm" className="flex-1 h-8 text-xs font-bold rounded-lg shadow-md shadow-primary/20">
                        Subscribe
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
