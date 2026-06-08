"use client";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FundProps {
    id: string;
    name: string;
    manager: string;
    risk: "LOW" | "MEDIUM" | "HIGH";
    totalReturn: number;
    maxDrawdown: number;
    investors: number;
    aum: number;
    performanceFee: number;
    managementFee: number;
    minInvestment: number;
    lockInPeriod: string;
    nav: number;
}

interface FundCardProps {
    fund: FundProps;
    onInvest?: (fund: FundProps) => void;
    onClick?: (fund: FundProps) => void;
}

const riskConfig = {
    LOW:    { label: "LOW",    color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/20", gradient: "from-emerald-500/15 via-emerald-500/5", hoverBorder: "hover:border-emerald-500/30 hover:shadow-emerald-500/5" },
    MEDIUM: { label: "MEDIUM", color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/20",     gradient: "from-amber-500/15 via-amber-500/5",     hoverBorder: "hover:border-amber-500/30 hover:shadow-amber-500/5"   },
    HIGH:   { label: "HIGH",   color: "text-red-400",     bg: "bg-red-500/15 border-red-500/20",         gradient: "from-red-500/15 via-red-500/5",         hoverBorder: "hover:border-red-500/30 hover:shadow-red-500/5"       },
};

export function FundCard({ fund, onInvest, onClick }: FundCardProps) {
    const risk = riskConfig[fund.risk];

    return (
        <Card
            className={`group overflow-hidden rounded-2xl border-border/40 bg-card cursor-pointer ${risk.hoverBorder} hover:shadow-xl transition-all duration-300 flex flex-col`}
            onClick={() => onClick?.(fund)}
        >
            {/* Gradient Header */}
            <div className={`h-20 sm:h-28 bg-gradient-to-br ${risk.gradient} to-transparent relative overflow-hidden flex items-center justify-center`}>
                <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                <div className={`absolute -top-6 -right-6 w-20 h-20 sm:w-24 sm:h-24 rounded-full ${risk.bg.split(" ")[0]} blur-xl`} />
                <div className={`relative flex items-center justify-center h-10 w-10 sm:h-14 sm:w-14 rounded-xl sm:rounded-2xl ${risk.bg} group-hover:scale-110 group-hover:shadow-lg transition-all duration-300`}>
                    <TrendingUp className={`h-5 w-5 sm:h-7 sm:w-7 ${risk.color}`} />
                </div>
                {/* Risk badge */}
                <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
                    <Badge variant="secondary" className={cn("text-[9px] sm:text-[10px] font-bold uppercase tracking-wider border rounded-full px-1.5 sm:px-2 py-0.5", risk.bg, risk.color)}>
                        {fund.risk}
                    </Badge>
                </div>
            </div>

            {/* Content */}
            <CardContent className="p-3 sm:p-5 flex flex-col flex-grow">
                <div className="mb-2 sm:mb-3">
                    <h3 className="font-bold text-xs sm:text-sm leading-tight">{fund.name}</h3>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">by {fund.manager}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
                    <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-muted/10 border border-border/30 text-center">
                        <span className={cn("text-sm sm:text-lg font-bold", fund.totalReturn >= 0 ? "text-primary" : "text-red-500")}>
                            {fund.totalReturn > 0 ? "+" : ""}{fund.totalReturn.toFixed(2)}%
                        </span>
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Return</p>
                    </div>
                    <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-muted/10 border border-border/30 text-center">
                        <span className="text-sm sm:text-lg font-bold">{fund.maxDrawdown.toFixed(2)}%</span>
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">Max DD</p>
                    </div>
                </div>

                <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        <span>{fund.investors}</span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                        <DollarSign className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                            {fund.aum >= 1_000_000
                                ? `${(fund.aum / 1_000_000).toFixed(1)}M`
                                : fund.aum >= 1_000
                                  ? `${(fund.aum / 1_000).toFixed(1)}K`
                                  : fund.aum.toFixed(0)}
                        </span>
                    </div>
                </div>
            </CardContent>

            <CardFooter className="p-3 sm:p-5 pt-0 border-t border-border/20 mt-auto flex items-center justify-between gap-2">
                <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium leading-tight min-w-0">
                    <span className="text-foreground font-semibold">{fund.performanceFee.toFixed(0)}%</span>
                    <span className="text-muted-foreground"> perf / </span>
                    <span className="text-foreground font-semibold">{fund.managementFee.toFixed(0)}%</span>
                    <span className="text-muted-foreground"> mgmt</span>
                </p>
                {onInvest && (
                    <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); onInvest(fund); }}
                        className="h-7 sm:h-8 px-2.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-semibold shadow-md shadow-primary/20 shrink-0"
                    >
                        Invest
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
