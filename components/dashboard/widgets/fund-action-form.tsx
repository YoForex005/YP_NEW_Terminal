"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/store/trading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FundActionFormProps {
    type: "deposit" | "withdraw";
    onSuccess?: () => void;
}

export function FundActionForm({ type, onSuccess }: FundActionFormProps) {
    const {
        wallets,
        selectedCurrency,
        paymentMethod,
        amountInput,
        setSelectedCurrency,
        setPaymentMethod,
        setAmountInput,
        submitFunds,
        setPaymentDetails,
        selectedCrypto,
        setSelectedCrypto,
    } = useTradingStore();

    const [statusMessage, setStatusMessage] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const isWithdraw = type === "withdraw";
    const hasInsufficientBalance = isWithdraw && wallets[selectedCurrency] < (parseFloat(amountInput) || 0);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsProcessing(true);
        setStatusMessage("");
        setPaymentDetails(null);

        const result = await submitFunds();
        setIsProcessing(false);

        if (result.ok) {
            if (result.paymentDetails) {
                // Gateway info is now handled by the store and global Dialog
            } else {
                setStatusMessage(result.message);
                if (onSuccess) onSuccess();
            }
        } else {
            setStatusMessage(result.message);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 p-4">
                <div className="grid grid-cols-[1fr_100px] gap-2">
                    <Input
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Enter amount"
                        className={cn(
                            "h-12 rounded-md border border-border bg-muted/20 px-4 font-medium transition-all focus:outline-none focus:ring-1",
                            selectedCurrency === "USD" ? "focus:ring-success/30 focus:border-success/50" : "focus:ring-primary/30 focus:border-primary/50"
                        )}
                    />
                    <div className="relative">
                        <select
                            value={selectedCurrency}
                            onChange={(e) => setSelectedCurrency(e.target.value as any)}
                            className={cn(
                                "h-12 w-full appearance-none rounded-md border border-border bg-card px-4 text-sm font-bold text-foreground shadow-sm transition-all focus:outline-none",
                                selectedCurrency === "USD" ? "focus:border-success/50 focus:ring-1 focus:ring-success/20" : "focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            )}
                        >
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 pb-4 space-y-5">
                <div className="space-y-2">
                    <span className="text-sm font-bold text-foreground">
                        {isWithdraw ? "Withdrawal" : "Payment"} Method
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setPaymentMethod("crypto")}
                            className={cn(
                                "flex flex-col items-center justify-center rounded-md border-2 p-3 transition-all duration-300",
                                paymentMethod === "crypto"
                                    ? selectedCurrency === "USD"
                                        ? "border-success bg-success/5 text-success ring-2 ring-success/10"
                                        : "border-primary bg-primary/5 text-primary ring-2 ring-primary/10"
                                    : "border-border/50 bg-card text-muted-foreground hover:border-border"
                            )}
                        >
                            <span className="text-xs font-bold">Cryptocurrency</span>
                            {isWithdraw && <span className="mt-0.5 text-[10px] opacity-60">Instant &bull; 0% Fee</span>}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaymentMethod("card")}
                            className={cn(
                                "flex flex-col items-center justify-center rounded-md border-2 p-3 transition-all duration-300",
                                paymentMethod === "card"
                                    ? selectedCurrency === "USD"
                                        ? "border-success bg-success/5 text-success ring-2 ring-success/10"
                                        : "border-primary bg-primary/5 text-primary ring-2 ring-primary/10"
                                    : "border-border/50 bg-card text-muted-foreground hover:border-border"
                            )}
                        >
                            <span className="text-xs font-bold">Credit/Debit Card</span>
                            {isWithdraw && <span className="mt-0.5 text-[10px] opacity-60">1-3 Days &bull; 0% Fee</span>}
                        </button>
                    </div>
                </div>

                {!isWithdraw && paymentMethod === "crypto" && (
                    <div className="space-y-2 animate-in fade-in duration-300">
                        <span className="text-sm font-bold text-foreground">Select Asset</span>
                        <div className="relative">
                            <select
                                value={selectedCrypto}
                                onChange={(e) => setSelectedCrypto(e.target.value)}
                                className="h-11 w-full appearance-none rounded-md border border-border bg-card px-4 text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all cursor-pointer"
                            >
                                <option value="BTC">Bitcoin (BTC)</option>
                                <option value="ETH">Ethereum (ETH)</option>
                                <option value="USDT.ERC20">Tether (USDT-ERC20)</option>
                                <option value="USDT.TRC20">Tether (USDT-TRC20)</option>
                                <option value="LTC">Litecoin (LTC)</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                                <ChevronDown className="h-4 w-4 text-muted-foreground opacity-50" />
                            </div>
                        </div>
                    </div>
                )}

                <div className="pt-2">
                    <Button
                        type="submit"
                        disabled={isProcessing || (isWithdraw && hasInsufficientBalance) || !amountInput}
                        className={cn(
                            "h-12 w-full gap-2 rounded-md font-bold shadow-lg transition-all",
                            isWithdraw
                                ? "bg-foreground text-background hover:bg-foreground/90"
                                : selectedCurrency === "USD"
                                    ? "bg-success text-white shadow-success/20 hover:bg-success/90"
                                    : "bg-primary text-white shadow-primary/20 hover:bg-primary/90"
                        )}
                    >
                        {isProcessing ? (
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : isWithdraw ? (
                            <>
                                <ArrowUpRight className="h-4 w-4" />
                                Request Withdrawal
                            </>
                        ) : (
                            <>
                                <ArrowDownToLine className="h-4 w-4" />
                                Submit Deposit
                            </>
                        )}
                    </Button>

                    {isWithdraw && hasInsufficientBalance && (
                        <p className="mt-3 text-center text-[10px] font-bold text-danger uppercase tracking-wider animate-pulse">
                            Insufficient Balance
                        </p>
                    )}

                    {statusMessage && (
                        <p className={cn(
                            "mt-3 text-center text-xs font-bold animate-in fade-in slide-in-from-top-1",
                            statusMessage.includes("success") || statusMessage.includes("initiated") ? "text-success" : "text-danger"
                        )}>
                            {statusMessage}
                        </p>
                    )}
                </div>
            </div>
        </form>
    );
}
