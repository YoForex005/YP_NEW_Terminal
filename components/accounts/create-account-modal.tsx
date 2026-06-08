"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useTradingStore } from "@/store/trading-store";
import { useToastStore } from "@/store/toast-store";
import { cn } from "@/lib/utils";
import type { TradingAccount } from "@/types/dashboard";

interface CreateAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAccountCreated?: (account: TradingAccount) => void;
    defaultPlatform?: Platform;
    defaultMode?: AccountMode;
    defaultCurrency?: "USD" | "EUR";
    defaultInitialBalance?: number;
}

type Platform = "mt5" | "ctrader";
type AccountMode = "demo" | "live";
type AccountTypeValue =
    | "demo-std-usd"
    | "demo-std-eur"
    | "demo-pro-usd"
    | "demo-pro-eur"
    | "demo-ecn-usd"
    | "demo-ecn-eur"
    | "demo-usd"
    | "demo-eur"
    | "std-usd"
    | "std-eur"
    | "pro-usd"
    | "pro-eur"
    | "ecn-usd"
    | "ecn-eur";

const isBrokerGroup = (value: string): boolean => value.includes("\\");

const filterBrokerGroups = (
    groups: string[],
    mode: AccountMode,
): string[] =>
    groups.filter((group) =>
        mode === "demo"
            ? group.trim().toLowerCase().startsWith("demo\\")
            : !group.trim().toLowerCase().startsWith("demo\\")
    );

const parseLeverageValue = (value: string): number => {
    const normalized = value.trim();
    if (!/^1:\d+$/.test(normalized)) {
        return 100;
    }
    const parsed = Number.parseInt(normalized.slice(2), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
};

export function CreateAccountModal({
    isOpen,
    onClose,
    onAccountCreated,
    defaultPlatform = "mt5",
    defaultMode = "demo",
    defaultCurrency = "USD",
    defaultInitialBalance = 10000,
}: CreateAccountModalProps) {
    const resolveDefaultAccountType = (
        nextMode: AccountMode,
        nextCurrency: "USD" | "EUR",
    ): AccountTypeValue =>
        nextMode === "demo"
            ? (nextCurrency === "EUR" ? "demo-std-eur" : "demo-std-usd")
            : (nextCurrency === "EUR" ? "std-eur" : "std-usd");

    const [platform, setPlatform] = useState<Platform>("mt5");
    const [mode, setMode] = useState<AccountMode>("demo");
    const [currency, setCurrency] = useState<"USD" | "EUR">("USD");
    const [accountType, setAccountType] = useState<string>("demo-std-usd");
    const [leverage, setLeverage] = useState("1:100");
    const [initialBalance, setInitialBalance] = useState("10000");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [availableGroups, setAvailableGroups] = useState<string[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const { addAccount } = useTradingStore();
    const { addToast } = useToastStore();

    // Hydration fix for createPortal
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        setPlatform(defaultPlatform);
        setMode(defaultMode);
        setCurrency(defaultCurrency);
        setAccountType(resolveDefaultAccountType(defaultMode, defaultCurrency));
        setLeverage("1:100");
        setInitialBalance(String(defaultInitialBalance));
    }, [defaultCurrency, defaultInitialBalance, defaultMode, defaultPlatform, isOpen]);

    useEffect(() => {
        if (!isOpen || platform !== "mt5") {
            return;
        }

        let cancelled = false;
        setIsLoadingGroups(true);

        void fetch("/api/private/accounts/groups", { cache: "no-store" })
            .then(async (response) => {
                const payload = (await response.json()) as {
                    ok?: boolean;
                    groups?: string[];
                    error?: string;
                };

                if (!response.ok || !payload.ok) {
                    throw new Error(payload.error || "Failed to load MT5 groups.");
                }

                if (!cancelled) {
                    setAvailableGroups(
                        Array.isArray(payload.groups)
                            ? payload.groups.filter((group) => typeof group === "string" && group.trim())
                            : [],
                    );
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setAvailableGroups([]);
                    addToast(
                        error instanceof Error ? error.message : "Failed to load MT5 groups.",
                        "error",
                    );
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoadingGroups(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [addToast, isOpen, platform]);

    useEffect(() => {
        const brokerGroups = filterBrokerGroups(availableGroups, mode);
        if (platform === "mt5" && brokerGroups.length > 0) {
            setAccountType((current) =>
                brokerGroups.includes(current) ? current : brokerGroups[0]
            );
            return;
        }

        const currencySuffix = currency === "EUR" ? "eur" : "usd";
        setAccountType((current) => {
            if (isBrokerGroup(current)) {
                return resolveDefaultAccountType(mode, currency);
            }
            if (mode === "demo") {
                if (current.startsWith("demo-pro-")) {
                    return (`demo-pro-${currencySuffix}`) as AccountTypeValue;
                }
                if (current.startsWith("demo-ecn-")) {
                    return (`demo-ecn-${currencySuffix}`) as AccountTypeValue;
                }
                return (`demo-std-${currencySuffix}`) as AccountTypeValue;
            }

            if (current.startsWith("pro-")) {
                return (`pro-${currencySuffix}`) as AccountTypeValue;
            }

            if (current.startsWith("ecn-")) {
                return (`ecn-${currencySuffix}`) as AccountTypeValue;
            }

            return (`std-${currencySuffix}`) as AccountTypeValue;
        });
    }, [availableGroups, currency, mode, platform]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const result = await addAccount({
            platform,
            mode,
            currency: currency === "EUR" ? "EUR" : "USD",
            initialBalance: Number.parseFloat(initialBalance) || 0,
            leverage: parseLeverageValue(leverage),
            group: platform === "mt5" ? accountType : undefined,
        });

        if (!result.ok) {
            addToast(result.message, "error");
            setIsSubmitting(false);
            return;
        }

        addToast("Trading account created. Open the credentials section to view login and passwords.", "success");

        setIsSubmitting(false);
        onClose();

        if (result.account && onAccountCreated) {
            onAccountCreated(result.account);
        }
    };

    if (!mounted) return null;

    const brokerGroupOptions = filterBrokerGroups(availableGroups, mode);

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                        exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                        className="fixed left-1/2 top-1/2 w-full max-w-md max-h-[85vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl z-50 overflow-hidden border border-slate-200 dark:border-slate-800"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                Create Trading Account
                            </h2>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                                onClick={onClose}
                            >
                                <X className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar-y">
                            <form id="create-account-form" onSubmit={handleSubmit} className="p-5 space-y-4">
                                {/* Platform */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Platform <span className="text-red-500">*</span>
                                    </Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setPlatform("mt5")}
                                            className={cn(
                                                "h-11 text-sm font-bold rounded-lg border transition-all",
                                                platform === "mt5"
                                                    ? "bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400"
                                            )}
                                        >
                                            MetaTrader 5
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPlatform("ctrader")}
                                            className={cn(
                                                "h-11 text-sm font-bold rounded-lg border transition-all",
                                                platform === "ctrader"
                                                    ? "bg-blue-50 border-blue-500 text-blue-600 dark:bg-blue-500/20 dark:border-blue-500 dark:text-blue-400"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400"
                                            )}
                                        >
                                            cTrader
                                        </button>
                                    </div>
                                </div>

                                {/* Mode */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Account Mode <span className="text-red-500">*</span>
                                    </Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setMode("demo")}
                                            className={cn(
                                                "h-11 text-sm font-bold rounded-lg border transition-all",
                                                mode === "demo"
                                                    ? "bg-primary/5 border-primary text-primary dark:bg-primary/10 dark:border-primary dark:text-primary"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400"
                                            )}
                                        >
                                            Demo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMode("live")}
                                            className={cn(
                                                "h-11 text-sm font-bold rounded-lg border transition-all",
                                                mode === "live"
                                                    ? "bg-primary/5 border-primary text-primary dark:bg-primary/10 dark:border-primary dark:text-primary"
                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-400"
                                            )}
                                        >
                                            Live
                                        </button>
                                    </div>
                                </div>

                                {/* Currency */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Currency <span className="text-red-500">*</span>
                                    </Label>
                                    <Select value={currency} onValueChange={(value) => setCurrency(value as "USD" | "EUR")}>
                                        <SelectTrigger className="h-11 rounded-lg bg-white border-slate-200 focus:ring-primary dark:bg-slate-950 dark:border-slate-800 text-sm font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USD">$ USD</SelectItem>
                                            <SelectItem value="EUR">€ EUR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-1">
                                        Select the currency for your trading account
                                    </p>
                                </div>

                                {/* Account Type */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        {brokerGroupOptions.length > 0 ? "Broker Group" : "Account Type"} <span className="text-red-500">*</span>
                                    </Label>
                                    <Select value={accountType} onValueChange={setAccountType}>
                                        <SelectTrigger className="h-11 rounded-lg bg-white border-slate-200 focus:ring-primary dark:bg-slate-950 dark:border-slate-800 text-sm font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {brokerGroupOptions.length > 0 ? (
                                                <>
                                                    {brokerGroupOptions.map((group) => (
                                                        <SelectItem key={group} value={group}>
                                                            {group}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            ) : (
                                                <>
                                                    {mode === "demo" ? (
                                                        <>
                                                            <SelectItem value={currency === "EUR" ? "demo-std-eur" : "demo-std-usd"}>Demo STD - {currency}</SelectItem>
                                                            <SelectItem value={currency === "EUR" ? "demo-pro-eur" : "demo-pro-usd"}>Demo PRO - {currency}</SelectItem>
                                                            <SelectItem value={currency === "EUR" ? "demo-ecn-eur" : "demo-ecn-usd"}>Demo ECN - {currency}</SelectItem>
                                                        </>
                                                    ) : null}
                                                    {mode === "live" && (
                                                        <SelectItem value={currency === "EUR" ? "std-eur" : "std-usd"}>Standard Account - {currency}</SelectItem>
                                                    )}
                                                    {mode === "live" && (
                                                        <SelectItem value={currency === "EUR" ? "pro-eur" : "pro-usd"}>Pro Account - {currency}</SelectItem>
                                                    )}
                                                    {mode === "live" && (
                                                        <SelectItem value={currency === "EUR" ? "ecn-eur" : "ecn-usd"}>ECN Account - {currency}</SelectItem>
                                                    )}
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {platform === "mt5" ? (
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-1">
                                            {brokerGroupOptions.length > 0
                                                ? "Available groups are loaded directly from the MT5 backend."
                                                : isLoadingGroups
                                                    ? "Loading broker groups..."
                                                    : "Falling back to local account-type aliases because broker groups are unavailable."}
                                        </p>
                                    ) : null}
                                </div>

                                {/* Info Box */}
                                <div className="rounded-lg bg-white border border-slate-200 dark:bg-slate-950 dark:border-slate-800 p-4 space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500 dark:text-slate-400">Minimum Deposit:</span>
                                        <span className="font-bold text-slate-900 dark:text-slate-100">$0.00</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500 dark:text-slate-400">Max Leverage:</span>
                                        <span className="font-bold text-slate-900 dark:text-slate-100">1:100</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500 dark:text-slate-400">Max Accounts:</span>
                                        <span className="font-bold text-slate-900 dark:text-slate-100">10</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500 dark:text-slate-400">Server IP:</span>
                                        <span className="font-bold text-slate-900 dark:text-slate-100">Auto-assigned</span>
                                    </div>
                                </div>

                                {/* Leverage */}
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                        Leverage <span className="text-red-500">*</span>
                                    </Label>
                                    <Select value={leverage} onValueChange={setLeverage}>
                                        <SelectTrigger className="h-11 rounded-lg bg-white border-slate-200 focus:ring-primary dark:bg-slate-950 dark:border-slate-800 text-sm font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1:100">1:100</SelectItem>
                                            <SelectItem value="1:50">1:50</SelectItem>
                                            <SelectItem value="1:30">1:30</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <div className="space-y-0.5 pl-1">
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                            Leverage cannot be changed after account creation
                                        </p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                            Maximum allowed: 1:100
                                        </p>
                                    </div>
                                </div>

                                {/* Initial Balance */}
                                <AnimatePresence>
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-2 overflow-hidden"
                                    >
                                        <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                            Initial Balance <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            type="number"
                                            value={initialBalance}
                                            onChange={(e) => setInitialBalance(e.target.value)}
                                            className="h-11 rounded-lg bg-white border-slate-200 focus:ring-primary dark:bg-slate-950 dark:border-slate-800 text-sm font-medium"
                                            min="0"
                                            max="1000000"
                                        />
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 pl-1">
                                            {currency}
                                        </p>
                                    </motion.div>
                                </AnimatePresence>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0 bg-white dark:bg-slate-900">
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1 h-9 rounded-xl font-bold border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-xs"
                                onClick={onClose}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                form="create-account-form"
                                className="flex-1 h-9 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 text-xs"
                                disabled={isSubmitting || (platform === "mt5" && !accountType)}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    "Create Account"
                                )}
                            </Button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
