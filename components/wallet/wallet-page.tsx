"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowDownToLine,
    ArrowUpRight,
    ArrowRightLeft,
    Wallet,
    Filter,
    Download,
    DollarSign,
    Euro,
    ChevronLeft,
    ChevronRight,
    Search,
    RefreshCw,
    Sparkles,
    FileText,
    Check,
    AlertCircle,
    XCircle,
    QrCode,
    ExternalLink,
    Copy,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";

import { cn, formatCurrency } from "@/lib/utils";
import { useTradingStore } from "@/store/trading-store";
import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { Skeleton } from "../ui/skeleton";
import { CurrencyCode } from "@/types/dashboard";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlippingCard } from "@/components/ui/flipping-card";
import { Badge } from "@/components/ui/badge";
import { TransferModal } from "@/components/dashboard/widgets/transfer-modal";
import { FundActionForm } from "../dashboard/widgets/fund-action-form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { TransactionDetailsModal } from "@/components/dashboard/widgets/transaction-details-modal";
import { Transaction } from "@/types/dashboard";

type HistoryFilter = "all" | "Deposit" | "Withdrawal" | "Transfer to MT5" | "Transfer from MT5" | "Transfer to cTrader" | "Transfer to cTrader Demo" | "Transfer from cTrader" | "Transfer from cTrader Demo" | "Admin Adjustment";

const getTransactionLabel = (type: string): { label: string; subtitle: string } => {
    switch (type) {
        case "Deposit": return { label: "Deposit", subtitle: "To Wallet" };
        case "Withdrawal": return { label: "Withdrawal", subtitle: "From Wallet" };
        case "Transfer to MT5": return { label: "Transfer to MT5", subtitle: "Wallet → MT5 Account" };
        case "Transfer from MT5": return { label: "Transfer from MT5", subtitle: "MT5 Account → Wallet" };
        case "Transfer to cTrader": return { label: "Transfer to cTrader", subtitle: "Wallet → cTrader Account" };
        case "Transfer from cTrader": return { label: "Transfer from cTrader", subtitle: "cTrader Account → Wallet" };
        case "Transfer to cTrader Demo": return { label: "Transfer to cTrader Demo", subtitle: "Wallet → cTrader Demo" };
        case "Transfer from cTrader Demo": return { label: "Transfer from cTrader Demo", subtitle: "cTrader Demo → Wallet" };
        case "Admin Adjustment": return { label: "Admin Adjustment", subtitle: "By Administrator" };
        default: return { label: type, subtitle: "" };
    }
};

export function WalletPageContent() {
    const {
        wallets,
        transactions,
        fundsTab,
        tradingAccounts,
        setFundsTab,
        setSelectedCurrency,
        selectedCurrency,
        paymentDetails,
        setPaymentDetails,
        selectedCrypto,
    } = useTradingStore();

    const { isLoading } = useDashboardData();

    const [isTransferOpen, setIsTransferOpen] = useState(false);
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const handleTransactionClick = (transaction: Transaction) => {
        setSelectedTransaction(transaction);
        setIsDetailsOpen(true);
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            setIsRefreshing(false);
        }, 1500);
    };

    const handleExport = () => {
        const headers = ["ID", "Date", "Type", "Amount", "Currency", "Status", "Method"];
        const rows = transactions.map(t => [
            t.id,
            t.createdAt,
            t.type,
            t.amount,
            t.currency,
            t.status,
            t.method
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "transactions.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredTransactions = useMemo(() => {
        let result = transactions;

        if (historyFilter !== "all") {
            result = result.filter((t) => t.type === historyFilter);
        }

        if (statusFilter !== "all") {
            result = result.filter((t) => t.status === statusFilter);
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter((t) =>
                t.id.toLowerCase().includes(query) ||
                t.amount.toString().includes(query) ||
                t.type.toLowerCase().includes(query)
            );
        }

        return result;
    }, [transactions, historyFilter, statusFilter, searchQuery]);

    const handleActionClick = (tab: "deposit" | "withdraw", currency: CurrencyCode = "USD") => {
        setSelectedCurrency(currency);
        if (fundsTab === tab) {
            setFundsTab("history");
        } else {
            setFundsTab(tab);
        }
    };

    if (isLoading && tradingAccounts.length === 0) {
        return (
            <div className="space-y-8 animate-in fade-in duration-500">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-48 rounded-3xl" />
                    <Skeleton className="h-48 rounded-3xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        Billing & Wallets
                    </h1>
                    <p className="text-base text-muted-foreground/80 max-w-2xl">
                        Manage your funds, track subscriptions, and view your billing history across all accounts.
                    </p>
                </div>
                <Button
                    onClick={() => setIsTransferOpen(true)}
                    className="h-12 px-6 rounded-xl bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98]"
                >
                    <ArrowRightLeft className="mr-2 h-5 w-5" /> Transfer Funds
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* USD Wallet Card */}
                <FlippingCard
                    height={290}
                    className="w-full border border-border shadow-md rounded-xl"
                    frontContent={
                        <div className="relative flex flex-col h-full p-6 overflow-hidden bg-gradient-to-br from-card to-muted/40 dark:from-card dark:to-muted/10 rounded-[inherit]">
                            {/* Watermark icon */}
                            <div className="absolute top-0 right-0 p-6 opacity-[0.04] scale-150 rotate-12 pointer-events-none">
                                <DollarSign className="w-36 h-36 text-primary" />
                            </div>
                            {/* Header */}
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-inset ring-primary/10 shrink-0">
                                    <DollarSign className="w-6 h-6" strokeWidth={2.5} />
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-lg font-bold leading-tight">USD Wallet</p>
                                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">Primary Account</p>
                                </div>
                            </div>
                            {/* Balance */}
                            <div className="flex flex-col gap-1 mt-auto pt-6">
                                <span className="text-sm font-medium text-muted-foreground/80">Available Balance</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl text-primary font-bold">$</span>
                                    <span className="text-5xl font-bold tracking-tighter text-foreground tabular-nums">
                                        {wallets.USD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    }
                    backContent={
                        <div className="flex flex-col items-center justify-center h-full p-6 gap-5 bg-gradient-to-br from-card to-muted/40 dark:from-card dark:to-muted/10 rounded-[inherit]">
                            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary ring-1 ring-inset ring-primary/10">
                                <DollarSign className="w-6 h-6" strokeWidth={2.5} />
                            </div>
                            <p className="text-sm text-muted-foreground text-center leading-relaxed">
                                Deposit funds into or withdraw from your <span className="font-semibold text-foreground">USD Wallet</span>
                            </p>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <Button
                                    onClick={() => handleActionClick("deposit", "USD")}
                                    className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20 active:scale-[0.98] transition-all"
                                >
                                    <ArrowDownToLine className="mr-2 h-4 w-4" /> Deposit
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleActionClick("withdraw", "USD")}
                                    className="h-11 rounded-xl border-primary/20 hover:bg-primary/5 hover:text-primary hover:border-primary/30 dark:border-border dark:hover:bg-muted/30 font-bold transition-all"
                                >
                                    <ArrowUpRight className="mr-2 h-4 w-4" /> Withdraw
                                </Button>
                            </div>
                        </div>
                    }
                />

                {/* EUR Wallet Card */}
                <FlippingCard
                    height={290}
                    className="w-full border border-border shadow-md rounded-xl"
                    frontContent={
                        <div className="relative flex flex-col h-full p-6 overflow-hidden bg-gradient-to-br from-card to-muted/40 dark:from-card dark:to-muted/10 rounded-[inherit]">
                            {/* Watermark icon */}
                            <div className="absolute top-0 right-0 p-6 opacity-[0.04] scale-150 rotate-12 pointer-events-none">
                                <Euro className="w-36 h-36 text-blue-600" />
                            </div>
                            {/* Header */}
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-600/10 shrink-0">
                                    <Euro className="w-6 h-6" strokeWidth={2.5} />
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-lg font-bold leading-tight">EUR Wallet</p>
                                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">Secondary Account</p>
                                </div>
                            </div>
                            {/* Balance */}
                            <div className="flex flex-col gap-1 mt-auto pt-6">
                                <span className="text-sm font-medium text-muted-foreground/80">Available Balance</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl text-blue-600 dark:text-blue-400 font-bold">€</span>
                                    <span className="text-5xl font-bold tracking-tighter text-foreground tabular-nums">
                                        {wallets.EUR.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    }
                    backContent={
                        <div className="flex flex-col items-center justify-center h-full p-6 gap-5 bg-gradient-to-br from-card to-muted/40 dark:from-card dark:to-muted/10 rounded-[inherit]">
                            <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 ring-1 ring-inset ring-blue-600/10">
                                <Euro className="w-6 h-6" strokeWidth={2.5} />
                            </div>
                            <p className="text-sm text-muted-foreground text-center leading-relaxed">
                                Deposit funds into or withdraw from your <span className="font-semibold text-foreground">EUR Wallet</span>
                            </p>
                            <div className="grid grid-cols-2 gap-3 w-full">
                                <Button
                                    onClick={() => handleActionClick("deposit", "EUR")}
                                    className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
                                >
                                    <ArrowDownToLine className="mr-2 h-4 w-4" /> Deposit
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => handleActionClick("withdraw", "EUR")}
                                    className="h-11 rounded-xl border-blue-200/50 hover:bg-blue-50/50 hover:text-blue-700 hover:border-blue-200 dark:border-border dark:hover:bg-muted/30 font-bold transition-all"
                                >
                                    <ArrowUpRight className="mr-2 h-4 w-4" /> Withdraw
                                </Button>
                            </div>
                        </div>
                    }
                />
            </div>

            {/* Inline Deposit / Withdraw Form */}
            <AnimatePresence mode="wait">
                {(fundsTab === "deposit" || fundsTab === "withdraw") && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -20, height: 0 }}
                        transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                        className="overflow-hidden"
                    >
                        <Card className={cn(
                            "rounded-xl border shadow-md transition-all duration-500",
                            selectedCurrency === "USD"
                                ? "border-primary/20 shadow-primary/5"
                                : "border-blue-500/20 shadow-blue-500/5"
                        )}>
                            <CardHeader className="pb-3 px-8 pt-6 flex flex-row items-center justify-between border-b border-border/40 bg-muted/20">
                                <CardTitle className="flex items-center gap-3 text-lg font-bold">
                                    <div className={cn(
                                        "flex h-8 w-8 items-center justify-center rounded-lg shadow-sm",
                                        selectedCurrency === "USD" ? "bg-background text-primary ring-1 ring-primary/20" : "bg-background text-blue-600 ring-1 ring-blue-100 dark:text-blue-400 dark:ring-blue-400/20"
                                    )}>
                                        {fundsTab === "deposit" ? (
                                            <ArrowDownToLine className="h-4 w-4" />
                                        ) : (
                                            <ArrowUpRight className="h-4 w-4" />
                                        )}
                                    </div>
                                    <span className={cn(
                                        selectedCurrency === "USD" ? "text-primary dark:text-primary" : "text-blue-950 dark:text-blue-400"
                                    )}>
                                        {fundsTab === "deposit" ? "Deposit Funds" : "Withdraw Funds"}
                                    </span>
                                </CardTitle>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFundsTab("history")}
                                    className="rounded-full hover:bg-muted text-muted-foreground"
                                >
                                    <XCircle className="h-5 w-5" />
                                    <span className="sr-only">Close</span>
                                </Button>
                            </CardHeader>
                            <CardContent className="px-8 py-6">
                                <FundActionForm type={fundsTab as "deposit" | "withdraw"} />
                            </CardContent>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Transaction History */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="px-8 pt-8 pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">Transaction History</h2>
                            <p className="text-sm text-muted-foreground/80">Track and manage your financial activity</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-full px-4 text-xs font-bold border border-border bg-background hover:bg-muted transition-colors"
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                            >
                                <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                                {isRefreshing ? "Refreshing..." : "Refresh"}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-full px-4 text-xs font-bold border border-border bg-background hover:bg-muted transition-colors"
                                onClick={handleExport}
                            >
                                <Download className="mr-2 h-3.5 w-3.5" /> Export
                            </Button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="grid gap-4 md:grid-cols-4 items-center pt-6 pb-2">
                        <div className="space-y-1.5">
                            <Select value={historyFilter} onValueChange={(v) => setHistoryFilter(v as HistoryFilter)}>
                                <SelectTrigger className="h-10 rounded-xl bg-background border border-border hover:bg-muted transition-colors">
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-border/50">
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="Deposit">Deposit</SelectItem>
                                    <SelectItem value="Withdrawal">Withdrawal</SelectItem>
                                    <SelectItem value="Transfer to MT5">Transfer to MT5</SelectItem>
                                    <SelectItem value="Admin Adjustment">Admin Adjustment</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-10 rounded-xl bg-background border border-border hover:bg-muted transition-colors">
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-border/50">
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="Completed">Completed</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-2 space-y-1.5">
                            <div className="relative group">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <Input
                                    placeholder="Search by ID, amount..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 h-10 rounded-xl bg-background border border-border hover:bg-muted focus-visible:ring-primary/20 transition-all font-medium"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden">
                    {/* Header */}
                    <div className="hidden md:grid grid-cols-[1.5fr_1fr_1.5fr_1fr_1fr_1fr] gap-4 px-8 py-4 text-[12px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/50 border-y border-border">
                        <span>Date & Time</span>
                        <span>Transaction ID</span>
                        <span>Type</span>
                        <span>Amount</span>
                        <span>Status</span>
                        <span className="text-right">Method</span>
                    </div>

                    {/* Body */}
                    <div className="divide-y divide-border/60">
                        {filteredTransactions.length === 0 ? (
                            <div className="h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                <div className="p-3 rounded-full bg-muted/30">
                                    <Search className="h-6 w-6 opacity-40" />
                                </div>
                                <p className="text-sm font-medium">No transactions found</p>
                                <p className="text-[13px] text-muted-foreground/80">Try adjusting your filters</p>
                            </div>
                        ) : (
                            filteredTransactions.map((txn) => {
                                const { label, subtitle } = getTransactionLabel(txn.type);
                                return (
                                    <div
                                        key={txn.id}
                                        onClick={() => handleTransactionClick(txn)}
                                        className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1.5fr_1fr_1fr_1fr] gap-4 px-8 py-4 items-center hover:bg-muted/30 transition-colors group cursor-pointer"
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-[14px] text-foreground/90 group-hover:text-primary transition-colors tracking-wide">{txn.createdAt.split(',')[0]}</span>
                                            <span className="text-[12px] opacity-70 text-muted-foreground">{txn.createdAt.split(',')[1]}</span>
                                        </div>
                                        <div className="font-mono text-[13px] text-muted-foreground">
                                            #{txn.id}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "p-2 rounded-full shrink-0",
                                                txn.type === "Deposit" ? "bg-primary/10 text-primary" :
                                                    txn.type === "Withdrawal" ? "bg-rose-500/10 text-rose-400" :
                                                        "bg-blue-500/10 text-blue-400"
                                            )}>
                                                {txn.type === "Deposit" ? (
                                                    <ArrowDownToLine className="h-3.5 w-3.5" />
                                                ) : txn.type === "Withdrawal" ? (
                                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                                ) : (
                                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                                )}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-[13px] text-foreground leading-tight">{label}</span>
                                                {subtitle && (
                                                    <span className="text-[11px] text-muted-foreground/70 leading-tight mt-0.5">{subtitle}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "text-[14px] font-bold tracking-tight",
                                            txn.type === "Deposit" || txn.type.includes("from") ? "text-primary dark:text-primary" : "text-foreground"
                                        )}>
                                            {txn.type === "Deposit" || txn.type.includes("from") ? "+" : "-"}{formatCurrency(txn.amount, txn.currency)}
                                        </div>
                                        <div>
                                            <Badge
                                                variant="secondary"
                                                className={cn(
                                                    "rounded-[4px] px-2.5 py-1 font-medium text-[10px] uppercase tracking-widest border-0 inline-flex items-center justify-center",
                                                    txn.status === "Completed" && "bg-primary/10 text-primary border border-primary/20",
                                                    txn.status === "Pending" && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                                                    txn.status === "Rejected" && "bg-rose-500/10 text-rose-400 border border-rose-500/20",
                                                )}
                                            >
                                                {txn.status}
                                            </Badge>
                                        </div>
                                        <div className="hidden md:block text-right text-muted-foreground text-[13px] font-mono capitalize">
                                            {txn.method || "System"}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
                {filteredTransactions.length > 0 && (
                    <div className="border-t border-border/60 px-8 py-4 flex items-center justify-between bg-muted/20">
                        <p className="text-[12px] text-muted-foreground font-medium">
                            Showing <span className="text-foreground">{filteredTransactions.length}</span> most recent transactions
                        </p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" disabled className="h-8 w-8 rounded-lg p-0 border-border bg-muted/30">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" className="h-8 w-8 rounded-lg p-0 border-border bg-muted/30 hover:bg-muted">
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <TransferModal
                isOpen={isTransferOpen}
                onClose={() => setIsTransferOpen(false)}
            />

            <TransactionDetailsModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                transaction={selectedTransaction}
            />


        </div>
    );
}
