"use client";

import { useState } from "react";
import { ArrowRightLeft, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/store/trading-store";
import { TransferModal } from "./transfer-modal";

export function AccountOverviewWidget() {
    const { tradingAccounts } = useTradingStore();
    const [activeTab, setActiveTab] = useState<"All" | "Live" | "Demo">("All");
    const [marginSortOrder, setMarginSortOrder] = useState<"asc" | "desc" | null>(null);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

    const filteredAccounts = [...tradingAccounts]
        .filter(account => activeTab === "All" || account.type === activeTab)
        .sort((a, b) => {
            if (!marginSortOrder) return 0;
            const valA = typeof a.margin === "number" ? a.margin : -1;
            const valB = typeof b.margin === "number" ? b.margin : -1;
            return marginSortOrder === "asc" ? valA - valB : valB - valA;
        });

    const toggleMarginSort = () => {
        setMarginSortOrder(prev => prev === "desc" ? "asc" : "desc");
    };

    return (
        <Card className="flex h-full flex-col overflow-hidden rounded-xl border-border dark:border-white/10 shadow-xl shadow-black/5 bg-gradient-to-br from-white to-slate-50 dark:from-card dark:to-muted/10">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0 px-6 py-5 pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
                            <Wallet className="h-4 w-4" strokeWidth={2.5} />
                        </div>
                        Account Overview
                    </CardTitle>
                    <p className="pl-[48px] text-xs font-medium text-muted-foreground">
                        {filteredAccounts.length} trading account{filteredAccounts.length !== 1 ? 's' : ''}
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-start">
                    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-muted/50">
                        {(["All", "Live", "Demo"] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200",
                                    activeTab === tab
                                        ? "bg-white text-primary shadow-sm ring-1 ring-black/5 dark:bg-background dark:ring-white/10"
                                        : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="h-6 w-px bg-slate-200 dark:bg-white/10" />

                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                            "h-8 text-xs font-semibold gap-1.5 rounded-xl border-border px-3 transition-all hover:bg-slate-50 hover:border-slate-300 dark:border-white/10 dark:hover:bg-white/5",
                            marginSortOrder && "bg-primary/5 border-primary/20 text-primary dark:bg-primary/10 dark:border-primary/20 dark:text-primary"
                        )}
                        onClick={toggleMarginSort}
                    >
                        Margin
                        <span className={cn(
                            "text-[10px] ml-0.5 transition-transform duration-300 inline-block shrink-0",
                            marginSortOrder === "asc" ? "rotate-180" : "rotate-0"
                        )}>
                            ↑
                        </span>
                    </Button>

                    <Button
                        size="sm"
                        onClick={() => setIsTransferModalOpen(true)}
                        className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 rounded-xl px-3 text-xs font-bold transition-all hover:scale-105 active:scale-95"
                    >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Transfer
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="flex-1 px-6 pt-3 pb-6 space-y-4 overflow-y-auto">
                {filteredAccounts.length > 0 ? (
                    filteredAccounts.map((account) => (
                        <div key={account.id} className="group rounded-3xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-primary/20 hover:shadow-md hover:shadow-primary/5 dark:bg-muted/10 dark:border-white/5 dark:hover:border-primary/20">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 shadow-inner dark:from-muted dark:to-muted/50">
                                    <span className="text-xs font-black">MT5</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm text-foreground">{account.name}</h3>
                                        <Badge className={cn(
                                            "border-border dark:border-white/10 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider shadow-none rounded-md",
                                            account.type === "Live"
                                                ? "bg-primary/20 text-primary dark:bg-primary/10 dark:text-primary"
                                                : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                                        )}>
                                            {account.type}
                                        </Badge>
                                    </div>
                                    <span className="text-xs font-medium text-muted-foreground/80 font-mono">#{account.accountNumber}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100 transition-colors group-hover:bg-primary/5 group-hover:border-primary/20 dark:bg-muted/30 dark:border-white/5">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Balance</span>
                                    <span className="text-lg font-black block tabular-nums tracking-tight text-foreground">${account.balance.toLocaleString()}</span>
                                </div>
                                <div className="rounded-2xl bg-primary/5 p-3 border border-primary/20 transition-colors group-hover:bg-primary/10 group-hover:border-primary/30 dark:bg-primary/5 dark:border-primary/10">
                                    <span className="text-[10px] text-primary/80 font-bold uppercase tracking-wider block mb-1">Equity</span>
                                    <span className="text-lg font-black block text-primary tabular-nums tracking-tight">
                                        ${account.equity.toLocaleString()}
                                    </span>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100 transition-colors group-hover:bg-primary/5 group-hover:border-primary/20 dark:bg-muted/30 dark:border-white/5">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Free</span>
                                    <span className="text-lg font-black block tabular-nums tracking-tight text-foreground">${account.freeMargin.toLocaleString()}</span>
                                </div>
                                <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100 transition-colors group-hover:bg-primary/5 group-hover:border-primary/20 dark:bg-muted/30 dark:border-white/5">
                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block mb-1">Margin</span>
                                    <span className={cn(
                                        "text-lg font-black block tabular-nums tracking-tight",
                                        account.margin === "N/A" || account.margin === 0 ? "text-muted-foreground/50" : "text-rose-600"
                                    )}>
                                        {typeof account.margin === "number" ? `$${account.margin.toLocaleString()}` : account.margin}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground rounded-3xl border border-dashed border-border bg-slate-50/50 mt-4 dark:border-white/10 dark:bg-white/5">
                        <div className="h-16 w-16 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 flex items-center justify-center mb-4 dark:bg-muted dark:ring-white/5">
                            <Wallet className="h-8 w-8 text-slate-300 dark:text-muted-foreground/40" strokeWidth={1.5} />
                        </div>
                        <p className="text-sm font-bold text-foreground/80">No trading accounts found</p>
                    </div>
                )}
            </CardContent>
            <TransferModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
            />
        </Card>
    );
}
