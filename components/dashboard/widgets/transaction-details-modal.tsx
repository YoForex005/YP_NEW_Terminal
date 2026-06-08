"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Clock, XCircle, AlertCircle, ArrowDownToLine, ArrowUpRight, ArrowRightLeft, Wallet, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { Transaction } from "@/types/dashboard";
import { useToastStore } from "@/store/toast-store";

interface TransactionDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction | null;
}

export function TransactionDetailsModal({ isOpen, onClose, transaction }: TransactionDetailsModalProps) {
    const [mounted, setMounted] = useState(false);
    const { addToast } = useToastStore();

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !transaction) return null;

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        addToast(`${label} copied to clipboard`, "success");
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "Completed":
                return {
                    bg: "bg-success/10",
                    border: "border-success/20",
                    text: "text-success",
                    icon: CheckCircle2,
                    label: "Completed",
                    description: "Successfully completed"
                };
            case "Pending":
            case "Processing":
                return {
                    bg: "bg-warning/10",
                    border: "border-warning/20",
                    text: "text-warning",
                    icon: Clock,
                    label: status,
                    description: "Processing your request"
                };
            case "Rejected":
                return {
                    bg: "bg-danger/10",
                    border: "border-danger/20",
                    text: "text-danger",
                    icon: XCircle,
                    label: "Rejected",
                    description: "Transaction was rejected"
                };
            default:
                return {
                    bg: "bg-muted/30",
                    border: "border-border/50",
                    text: "text-muted-foreground",
                    icon: AlertCircle,
                    label: status,
                    description: "Unknown status"
                };
        }
    };

    const getTypeIcon = (type: string) => {
        if (type === "Deposit") return ArrowDownToLine;
        if (type === "Withdrawal") return ArrowUpRight;
        if (type.includes("Transfer")) return ArrowRightLeft;
        return Wallet;
    };

    const statusConfig = getStatusConfig(transaction.status);
    const TypeIcon = getTypeIcon(transaction.type);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
                    />
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="w-full max-w-[600px] rounded-md bg-card border border-border/50 shadow-2xl pointer-events-auto overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-5 border-b border-border/30">
                                <h2 className="text-lg font-bold tracking-tight text-foreground">Transaction Details</h2>
                                <button
                                    onClick={onClose}
                                    className="rounded-md p-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-6 overflow-y-auto">
                                {/* Status Banner */}
                                <div className={cn(
                                    "rounded-md border p-5 mb-6 flex items-center gap-4",
                                    statusConfig.bg,
                                    statusConfig.border
                                )}>
                                    <div className={cn(
                                        "h-12 w-12 rounded-md flex items-center justify-center shrink-0 bg-white/50 dark:bg-black/20",
                                        statusConfig.text
                                    )}>
                                        <statusConfig.icon className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className={cn("text-base font-bold", statusConfig.text)}>
                                            {statusConfig.label}
                                        </h3>
                                        <p className={cn("text-sm font-medium opacity-70", statusConfig.text)}>
                                            {statusConfig.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Basic Information */}
                                <div className="space-y-5">
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Basic Information</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Transaction Number</span>
                                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => copyToClipboard(transaction.id, "Transaction ID")}>
                                                <p className="font-mono text-sm font-semibold text-foreground truncate" title={transaction.id}>
                                                    {transaction.id}
                                                </p>
                                                <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </div>

                                        <div className="space-y-1.5 md:text-right">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Type</span>
                                            <div className="flex items-center gap-2 md:justify-end">
                                                <TypeIcon className="h-4 w-4 text-muted-foreground" />
                                                <p className="font-bold text-sm text-foreground">{transaction.type}</p>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Amount</span>
                                            <p className="text-2xl font-black tracking-tight text-foreground flex items-baseline gap-1 tabular-nums">
                                                {formatCurrency(transaction.amount, transaction.currency)}
                                                <span className="text-sm font-bold text-muted-foreground">{transaction.currency}</span>
                                            </p>
                                        </div>

                                        <div className="space-y-1.5 md:text-right">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Created</span>
                                            <p className="font-bold text-sm text-foreground">
                                                {transaction.createdAt}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Show target MT5 account for transfer transactions */}
                                    {transaction.targetAccount && (
                                        <div className="mt-4 pt-4 border-t border-border/20 space-y-1.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">MT5 Account</span>
                                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => copyToClipboard(transaction.targetAccount!, "MT5 Account")}>
                                                <p className="font-mono text-sm font-semibold text-foreground">{transaction.targetAccount}</p>
                                                <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Notes Section */}
                                <div className="mt-6 pt-6 border-t border-border/30 space-y-3">
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notes</h3>
                                    <div className="rounded-md bg-muted/20 border border-border/30 p-4 text-sm font-medium text-muted-foreground">
                                        {(() => {
                                            const noteMap: Record<string, string> = {
                                                "Deposit": `Funds deposited into your wallet via ${transaction.method === 'card' ? 'Credit Card' : 'Crypto'} network.`,
                                                "Withdrawal": `Funds withdrawn from your wallet via ${transaction.method === 'card' ? 'Credit Card' : 'Crypto'} network.`,
                                                "Transfer to MT5": `Internal transfer: funds moved from your Wallet to MT5 account ${transaction.targetAccount ?? "(unknown)"}.`,
                                                "Transfer from MT5": `Internal transfer: funds moved from MT5 account ${transaction.targetAccount ?? "(unknown)"} back to your Wallet.`,
                                                "Transfer to cTrader": "Internal transfer: funds moved from your Wallet to your cTrader Live account.",
                                                "Transfer from cTrader": "Internal transfer: funds moved from your cTrader Live account back to your Wallet.",
                                                "Transfer to cTrader Demo": "Internal transfer: funds moved from your Wallet to your cTrader Demo account.",
                                                "Transfer from cTrader Demo": "Internal transfer: funds moved from your cTrader Demo account back to your Wallet.",
                                                "Admin Adjustment": "Balance adjustment applied manually by an administrator.",
                                            };
                                            return noteMap[transaction.type] ?? `Transaction type: ${transaction.type}`;
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-5 border-t border-border/30 bg-muted/5">
                                <Button
                                    onClick={onClose}
                                    className="w-full h-11 rounded-md text-sm font-bold bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
                                >
                                    Close
                                </Button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
