"use client";

import { useEffect, useState } from "react";
import { useToastStore } from "@/store/toast-store";
import { useNotificationStore } from "@/store/notification-store";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link"; // Import Link
import { X, ArrowRightLeft, Info, Wallet, ChevronDown, Check, Plus } from "lucide-react"; // Import Plus
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectSeparator, // Import SelectSeparator
} from "@/components/ui/select";
import { useTradingStore } from "@/store/trading-store";
import { cn } from "@/lib/utils";

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function TransferModal({ isOpen, onClose }: TransferModalProps) {
    const { tradingAccounts, transferFunds } = useTradingStore();
    const [mounted, setMounted] = useState(false);
    const [direction, setDirection] = useState<"wallet-to-mt5" | "mt5-to-wallet">("wallet-to-mt5");
    const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [amount, setAmount] = useState<string>("100");
    const [isTransferring, setIsTransferring] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const { addToast } = useToastStore();
    const { addNotification } = useNotificationStore();

    useEffect(() => {
        setMounted(true);
    }, []);

    // Set a default account once data is loaded or modal opens
    useEffect(() => {
        if (isOpen && tradingAccounts.length > 0 && !selectedAccountId) {
            setSelectedAccountId(tradingAccounts[0].id);
        }
    }, [isOpen, tradingAccounts, selectedAccountId]);

    // Update if the current selection becomes invalid (e.g. store cleared)
    useEffect(() => {
        if (selectedAccountId && !tradingAccounts.find(a => a.id === selectedAccountId)) {
            setSelectedAccountId(tradingAccounts.length > 0 ? tradingAccounts[0].id : "");
        }
    }, [tradingAccounts, selectedAccountId]);


    const handleTransfer = async () => {
        if (!selectedAccountId || !amount || parseFloat(amount) <= 0) return;

        setIsTransferring(true);

        // Use the store action instead of simulation
        const result = await transferFunds(
            parseFloat(amount),
            direction === "wallet-to-mt5" ? "wallet" : "mt5",
            direction === "wallet-to-mt5" ? "mt5" : "wallet",
            selectedAccountId
        );

        // Still keep a small delay for better UX
        await new Promise(resolve => setTimeout(resolve, 800));

        setIsTransferring(false);

        if (!result.ok) {
            addToast(result.message, "error");
            return;
        }

        setIsSuccess(true);

        const formattedAmount = parseFloat(amount).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
        const source = direction === "wallet-to-mt5" ? "Wallet" : "MT5 Account";
        const destination = direction === "wallet-to-mt5" ? "MT5 Account" : "Wallet";

        addToast("Transfer successful!", "success");
        addNotification({
            title: "Funds Transferred",
            message: `Successfully transferred ${formattedAmount} from ${source} to ${destination}.`,
            type: "success"
        });

        // Wait a moment to show success state
        setTimeout(() => {
            onClose();
            // Reset state after closing
            setIsSuccess(false);
            setAmount("100");
        }, 1000);
    };

    const selectedAccount = tradingAccounts.find(a => a.id === selectedAccountId);
    const isDemo = selectedAccount?.type === "Demo";
    const isValid = selectedAccountId && amount && parseFloat(amount) > 0;

    useEffect(() => {
        if (selectedAccount?.type === "Demo" && direction === "mt5-to-wallet") {
            setDirection("wallet-to-mt5");
        }
    }, [selectedAccount, direction]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9998] bg-slate-900/40 backdrop-blur-sm"
                    />
                    {/* Modal */}
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="w-full max-w-[580px] rounded-2xl bg-card border border-border/40 shadow-2xl shadow-black/30 pointer-events-auto overflow-hidden flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-8 py-6 border-b border-border/30">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                                        <ArrowRightLeft className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold tracking-tight text-foreground">Transfer Funds</h2>
                                        <p className="text-xs text-muted-foreground">Move funds between wallet and MT5</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 text-primary rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ring-primary/20">
                                        USD
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="rounded-xl p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-8 space-y-7">
                                {isDemo && (
                                    <div className="rounded-md bg-warning/5 border border-warning/10 p-5 mb-1">
                                        <div className="text-[14px] leading-relaxed text-warning-foreground opacity-90">
                                            <span className="font-extrabold text-warning-foreground">Demo Account:</span> You can add up to $100,000,000 in demo funds for practice trading. Demo funds are virtual and cannot be withdrawn to your wallet.
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Transfer Direction</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setDirection("wallet-to-mt5")}
                                            className={cn(
                                                "flex flex-col items-center justify-center gap-1 h-[80px] rounded-xl border transition-all outline-none",
                                                direction === "wallet-to-mt5"
                                                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                                                    : "border-border/40 bg-muted/10 hover:bg-muted/30 text-muted-foreground"
                                            )}
                                        >
                                            <Wallet className="h-4 w-4 opacity-70" />
                                            <span className="text-sm font-bold">Wallet → MT5</span>
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isDemo}
                                            onClick={() => setDirection("mt5-to-wallet")}
                                            className={cn(
                                                "flex flex-col items-center justify-center gap-1 h-[80px] rounded-xl border transition-all relative outline-none",
                                                isDemo
                                                    ? "border-border/20 bg-muted/5 text-muted-foreground/30 cursor-not-allowed"
                                                    : direction === "mt5-to-wallet"
                                                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                                                        : "border-border/40 bg-muted/10 hover:bg-muted/30 text-muted-foreground"
                                            )}
                                        >
                                            <Wallet className="h-4 w-4 opacity-70" />
                                            <span className="text-sm font-bold">MT5 → Wallet</span>
                                            {isDemo && <span className="text-[10px] font-bold absolute bottom-1.5 opacity-50">Not Available</span>}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Trading Account</label>
                                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                                        <SelectTrigger className="h-14 rounded-xl border border-border/40 bg-muted/10 font-medium text-sm p-0 focus:ring-1 focus:ring-primary/20 flex items-stretch overflow-hidden select-none [&>span]:line-clamp-1 [&>svg]:hidden">
                                            <div className="flex-1 flex items-center px-5 truncate text-left select-none pointer-events-none">
                                                <SelectValue placeholder="Select Account" />
                                            </div>
                                            <div className="flex items-center justify-center w-14 border-l border-border/30 pointer-events-none">
                                                <ChevronDown className="h-4 w-4 opacity-40" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent
                                            position="popper"
                                            sideOffset={2}
                                            className="z-[10000] rounded-xl border border-border/40 shadow-2xl shadow-black/30 overflow-hidden p-0 w-[var(--radix-select-trigger-width)]"
                                        >
                                            <div className="flex flex-col select-none">
                                                {tradingAccounts.map((account) => (
                                                    <SelectItem
                                                        key={account.id}
                                                        value={account.id}
                                                        className="cursor-pointer py-3 pl-10 pr-5 text-sm focus:bg-primary/10 focus:text-primary data-[state=checked]:bg-primary/10 data-[state=checked]:text-primary transition-none border-none outline-none rounded-none relative"
                                                    >
                                                        <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center opacity-0 data-[state=checked]:opacity-100">
                                                            <Check className="h-4 w-4" />
                                                        </span>
                                                        <span>
                                                            [MT5] {account.name} ({account.type.toUpperCase()}) - {account.accountNumber}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </div>
                                            <SelectSeparator />
                                            <div className="p-1">
                                                <Link
                                                    href="/accounts"
                                                    className="flex w-full cursor-pointer select-none items-center rounded-lg py-2.5 pl-3 pr-2 text-sm font-semibold outline-none hover:bg-primary/10 text-primary transition-colors group"
                                                    onClick={onClose}
                                                >
                                                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 mr-2 transition-colors">
                                                        <Plus className="h-4 w-4 text-primary" />
                                                    </div>
                                                    Add Trading Account
                                                </Link>
                                            </div>
                                        </SelectContent>
                                    </Select>
                                    {selectedAccount && (
                                        <div className="flex items-center gap-2 px-1">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                                            <p className="text-xs text-muted-foreground font-medium">
                                                MT5 Balance: <span className="text-foreground font-bold">${selectedAccount.balance.toLocaleString()} USD</span>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Amount (USD)</label>
                                    <div className="relative">
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-bold text-lg">$</div>
                                        <Input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="h-14 pl-10 pr-5 rounded-xl border border-border/40 bg-muted/10 font-bold text-lg focus:border-primary/50 transition-all focus:ring-1 focus:ring-primary/20"
                                            placeholder="100"
                                        />
                                    </div>
                                    {isDemo && (
                                        <p className="text-xs text-muted-foreground font-medium opacity-60 px-1">
                                            Demo Funds: Add up to $100,000,000 for practice trading
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-8 pb-8 pt-2 flex items-center gap-3 border-t border-border/20 mt-2">
                                <Button
                                    variant="outline"
                                    onClick={onClose}
                                    className="flex-1 h-12 rounded-xl font-bold text-sm border-border/40 hover:bg-muted/30 active:scale-[0.98] transition-all"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    disabled={!isValid || isTransferring || isSuccess}
                                    onClick={handleTransfer}
                                    className={cn(
                                        "flex-1 h-12 rounded-xl font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                                        isSuccess
                                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                            : "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                    )}
                                >
                                    {isTransferring ? (
                                        <div className="flex items-center gap-2">
                                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            <span>Processing...</span>
                                        </div>
                                    ) : isSuccess ? (
                                        <div className="flex items-center gap-2">
                                            <Check className="h-4 w-4" />
                                            <span>Transfer Successful!</span>
                                        </div>
                                    ) : (
                                        "Transfer Funds"
                                    )}
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
