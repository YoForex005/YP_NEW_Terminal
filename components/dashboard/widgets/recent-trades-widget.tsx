"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/store/trading-store";

export function RecentTradesWidget() {
    const { tradingAccounts, transactions } = useTradingStore();
    const [activeFilter, setActiveFilter] = useState<"All Trades" | "Profitable" | "Losing">("All Trades");
    const hasInitializedAccountSelection = useRef(false);

    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
        []
    );

    const accountIds = useMemo(
        () => tradingAccounts.map((account) => account.id),
        [tradingAccounts],
    );

    useEffect(() => {
        if (accountIds.length === 0) {
            setSelectedAccountIds((current) => current.length === 0 ? current : []);
            return;
        }

        if (!hasInitializedAccountSelection.current) {
            hasInitializedAccountSelection.current = true;
            setSelectedAccountIds(accountIds);
            return;
        }

        setSelectedAccountIds((current) => {
            const validAccountIds = new Set(accountIds);
            const next = current.filter((id) => validAccountIds.has(id));

            return next.length === current.length ? current : next;
        });
    }, [accountIds]);

    const toggleAccount = (id: string) => {
        if (selectedAccountIds.includes(id)) {
            setSelectedAccountIds(selectedAccountIds.filter(i => i !== id));
        } else {
            setSelectedAccountIds([...selectedAccountIds, id]);
        }
    };

    const handleSelectAll = () => {
        if (selectedAccountIds.length === tradingAccounts.length) {
            setSelectedAccountIds([]);
        } else {
            setSelectedAccountIds(accountIds);
        }
    };

    const isAllSelected = selectedAccountIds.length === tradingAccounts.length;

    const isCredit = (type: string) => type === "Deposit" || type.includes("from");

    const selectedTransactionAccountKeys = useMemo(() => {
        const selectedIds = new Set(selectedAccountIds);

        return new Set(
            tradingAccounts
                .filter((account) => selectedIds.has(account.id))
                .flatMap((account) => [
                    account.id,
                    account.accountNumber,
                    account.credentials?.login,
                ])
                .filter((key): key is string => Boolean(key)),
        );
    }, [selectedAccountIds, tradingAccounts]);

    const visibleTransactions = useMemo(() => {
        const bySelection = selectedAccountIds.length === 0
            ? []
            : transactions.filter((entry) => {
                const accountId = (entry as { accountId?: unknown }).accountId;
                const accountKey = typeof accountId === "string" && accountId.length > 0
                    ? accountId
                    : entry.targetAccount;

                return accountKey ? selectedTransactionAccountKeys.has(accountKey) : true;
            });
        if (activeFilter === "All Trades") return bySelection;
        if (activeFilter === "Profitable") return bySelection.filter((entry) => isCredit(entry.type));
        return bySelection.filter((entry) => !isCredit(entry.type));
    }, [activeFilter, selectedAccountIds, selectedTransactionAccountKeys, transactions]);

    const totalPnl = useMemo(
        () =>
            visibleTransactions.reduce((sum, entry) => {
                const signed = isCredit(entry.type) ? entry.amount : -entry.amount;
                return sum + signed;
            }, 0),
        [visibleTransactions],
    );

    const profitableCount = useMemo(
        () => visibleTransactions.filter((entry) => isCredit(entry.type)).length,
        [visibleTransactions],
    );

    const winRate = visibleTransactions.length > 0
        ? (profitableCount / visibleTransactions.length) * 100
        : 0;

    return (
        <Card className="flex h-full flex-col overflow-visible relative z-10 rounded-xl border-border shadow-xl shadow-black/5 bg-gradient-to-br from-card to-muted/30 dark:from-card dark:to-muted/10">
            <CardHeader className="flex flex-col sm:flex-row items-start justify-between gap-4 space-y-0 px-6 py-5 pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 ring-1 ring-inset ring-blue-500/10">
                            <History className="h-4 w-4" strokeWidth={2.5} />
                        </div>
                        Recent Trades
                    </CardTitle>
                    <p className="pl-[48px] text-xs font-medium text-muted-foreground">
                        {visibleTransactions.length} trades &middot; {winRate.toFixed(1)}% win rate &middot; P&L: <span className={cn("font-bold tracking-tight", totalPnl >= 0 ? "text-primary" : "text-rose-600")}>{totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}</span>
                    </p>
                </div>

                {/* Account Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className="flex w-full min-w-0 items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold shadow-sm transition-all active:scale-95 hover:bg-muted/50 hover:border-border/80 dark:hover:bg-muted/80 sm:w-[150px]"
                    >
                        <span className="truncate">
                            {selectedAccountIds.length === 0
                                ? "Select Accounts"
                                : selectedAccountIds.length === tradingAccounts.length
                                    ? "All Accounts"
                                    : `${selectedAccountIds.length} Accounts`}
                        </span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground ml-2 transition-transform duration-200", isFilterOpen && "rotate-180")} />
                    </button>

                    {isFilterOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-40 bg-transparent"
                                onClick={() => setIsFilterOpen(false)}
                            />
                            <div className="absolute right-0 top-full mt-2 z-[100] w-[260px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-border bg-popover shadow-xl shadow-black/10 animate-in zoom-in-95 duration-200 dark:shadow-black/20">
                                <div className="p-2">
                                    <div
                                        className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-muted/60 cursor-pointer transition-colors dark:hover:bg-muted/20"
                                        onClick={handleSelectAll}
                                    >
                                        <Checkbox
                                            checked={isAllSelected}
                                            onCheckedChange={() => { }}
                                            className="h-4 w-4 rounded-[4px] border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                        />
                                        <span className="font-bold text-foreground">All Accounts</span>
                                    </div>
                                    <div className="h-px bg-border my-1 mx-1" />

                                    <div className="max-h-[220px] overflow-y-auto px-1">
                                        {tradingAccounts.map(account => (
                                            <div
                                                key={account.id}
                                                className="flex items-start gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-muted/60 cursor-pointer group transition-colors dark:hover:bg-muted/20"
                                                onClick={() => toggleAccount(account.id)}
                                            >
                                                <Checkbox
                                                    checked={selectedAccountIds.includes(account.id)}
                                                    onCheckedChange={() => { }}
                                                    className="h-4 w-4 mt-0.5 rounded-[4px] border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                />
                                                <div className="flex flex-col gap-0.5 leading-none">
                                                    <span className="font-bold text-foreground/90">{account.name}</span>
                                                    <span className="text-[10px] font-medium text-muted-foreground">
                                                        #{account.accountNumber}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </CardHeader>

            <CardContent className="flex-1 px-6 pt-2 pb-6 flex flex-col gap-5 overflow-y-auto">
                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="group rounded-2xl bg-muted/30 p-4 border border-border flex flex-col items-center hover:bg-muted/50 hover:shadow-md hover:shadow-black/5 transition-all duration-300 dark:bg-muted/20 dark:hover:bg-muted/30">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Trades</span>
                        <span className="text-xl font-black mt-1 tabular-nums tracking-tight">{visibleTransactions.length}</span>
                    </div>
                    <div className="group rounded-2xl bg-primary/10 p-4 border border-primary/20 flex flex-col items-center hover:bg-primary/10 hover:shadow-md hover:shadow-primary/20 transition-all duration-300 dark:bg-primary/10 dark:border-primary/20">
                        <span className="text-[10px] text-primary/80 font-bold uppercase tracking-wider">Win Rate</span>
                        <span className="text-xl font-black mt-1 text-primary tabular-nums tracking-tight">{winRate.toFixed(1)}%</span>
                    </div>
                    <div className="group rounded-2xl bg-muted/30 p-4 border border-border flex flex-col items-center hover:bg-muted/50 hover:shadow-md hover:shadow-black/5 transition-all duration-300 dark:bg-muted/20 dark:hover:bg-muted/30">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Avg Duration</span>
                        <span className="text-xl font-black mt-1 tabular-nums tracking-tight">--</span>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                    {(["All Trades", "Profitable", "Losing"] as const).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setActiveFilter(filter)}
                            className={cn(
                                "flex-1 sm:flex-none rounded-xl px-4 py-2 text-xs font-bold transition-all duration-200",
                                activeFilter === filter
                                    ? filter === "Losing"
                                        ? "bg-destructive text-destructive-foreground shadow-md shadow-destructive/20 ring-1 ring-destructive"
                                        : filter === "Profitable"
                                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-primary"
                                            : "bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-primary"
                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-foreground dark:bg-muted/50 dark:text-muted-foreground dark:hover:bg-muted"
                            )}
                        >
                            {filter}
                        </button>
                    ))}
                </div>

                {/* Empty State */}
                <div className="flex-1 flex flex-col items-center justify-center min-h-[160px] text-muted-foreground rounded-3xl border border-dashed border-border bg-muted/30 m-1 dark:bg-muted/20">
                    <div className="h-16 w-16 rounded-2xl bg-card shadow-sm ring-1 ring-border flex items-center justify-center mb-4 dark:bg-muted">
                        <History className="h-8 w-8 text-slate-300 dark:text-muted-foreground/40" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-bold text-foreground/80">
                        {visibleTransactions.length === 0 ? "No trades yet" : `${visibleTransactions.length} trades loaded`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Select accounts to view trade history</p>
                </div>

                {/* Footer */}
                <div className="bg-muted/40 -mx-6 -mb-6 p-5 border-t border-border rounded-b-xl dark:bg-muted/30">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Trades to show</label>
                        <Select defaultValue="10">
                            <SelectTrigger className="w-full sm:w-[140px] bg-card border-border rounded-xl h-9 text-xs font-bold dark:bg-popover">
                                <SelectValue placeholder="10 trades" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-border">
                                <SelectItem value="5" className="rounded-lg text-xs font-medium cursor-pointer">5 trades</SelectItem>
                                <SelectItem value="10" className="rounded-lg text-xs font-medium cursor-pointer">10 trades</SelectItem>
                                <SelectItem value="20" className="rounded-lg text-xs font-medium cursor-pointer">20 trades</SelectItem>
                                <SelectItem value="50" className="rounded-lg text-xs font-medium cursor-pointer">50 trades</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
