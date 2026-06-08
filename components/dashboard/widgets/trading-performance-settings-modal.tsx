"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useTradingStore } from "@/store/trading-store";

interface TradingPerformanceSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedAccountIds?: string[];
    onSave?: (ids: string[]) => void;
}

export function TradingPerformanceSettingsModal({
    isOpen,
    onClose,
    selectedAccountIds: initialSelectedIds,
    onSave
}: TradingPerformanceSettingsModalProps) {
    const { tradingAccounts } = useTradingStore();
    const [mounted, setMounted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>(
        initialSelectedIds || []
    );

    const demoAccounts = tradingAccounts.filter(a => a.type === "Demo");
    const liveAccounts = tradingAccounts.filter(a => a.type === "Live");

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setSelectedIds(initialSelectedIds || tradingAccounts.map(a => a.id));
            setIsExpanded(true);
        }
    }, [isOpen, initialSelectedIds, tradingAccounts]);

    if (!mounted) return null;

    const handleSelectAll = () => {
        setSelectedIds(tradingAccounts.map(a => a.id));
    };

    const handleClear = () => {
        setSelectedIds([]);
    };

    const toggleAccount = (id: string) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9998] bg-slate-900/60 backdrop-blur-[2px]"
                    />
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="w-full max-w-[600px] rounded-md bg-card shadow-2xl pointer-events-auto overflow-hidden flex flex-col pt-0"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between p-6 pb-2">
                                <div className="flex gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                                        <Settings className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold tracking-tight text-foreground">Trading Performance Settings</h2>
                                        <p className="text-sm text-muted-foreground mt-1">Choose which accounts to include in statistics</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {/* Accordion Trigger */}
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-4 py-3 rounded-md border transition-all duration-200",
                                        isExpanded
                                            ? "border-success bg-white dark:bg-card text-foreground shadow-[0_0_0_1px_rgba(23,198,102,1)]"
                                            : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/50"
                                    )}
                                >
                                    <span className="font-medium text-sm">Select accounts (showing all)</span>
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>

                                {/* Expanded Content */}
                                <AnimatePresence>
                                    {isExpanded && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pt-2 rounded-md border border-border/50 bg-card shadow-sm">
                                                {/* Action Header */}
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
                                                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SELECT ACCOUNTS</span>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={handleSelectAll}
                                                            className="text-[11px] font-bold text-foreground hover:text-success transition-colors"
                                                        >
                                                            Select All
                                                        </button>
                                                        <div className="h-3 w-px bg-border" />
                                                        <button
                                                            onClick={handleClear}
                                                            className="text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                                                        >
                                                            Clear
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Account List */}
                                                <div className="p-2 max-h-[300px] overflow-y-auto">
                                                    {/* Demo Accounts Group */}
                                                    {demoAccounts.length > 0 && (
                                                        <div className="mb-2">
                                                            <div
                                                                className="px-4 py-2 text-[11px] font-bold uppercase text-primary tracking-wider flex items-center justify-between cursor-pointer hover:bg-muted/30 rounded-md transition-colors"
                                                                onClick={() => {
                                                                    const allDemoIds = demoAccounts.map(a => a.id);
                                                                    const allSelected = allDemoIds.every(id => selectedIds.includes(id));
                                                                    if (allSelected) {
                                                                        setSelectedIds(selectedIds.filter(id => !allDemoIds.includes(id)));
                                                                    } else {
                                                                        const newIds = [...selectedIds];
                                                                        allDemoIds.forEach(id => {
                                                                            if (!newIds.includes(id)) newIds.push(id);
                                                                        });
                                                                        setSelectedIds(newIds);
                                                                    }
                                                                }}
                                                            >
                                                                <span>DEMO ACCOUNTS ({demoAccounts.length})</span>
                                                                <span className="text-[10px] bg-primary/10 px-2 py-0.5 rounded-md text-primary">
                                                                    {demoAccounts.filter(a => selectedIds.includes(a.id)).length}/{demoAccounts.length}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1 mt-1">
                                                                {demoAccounts.map(account => (
                                                                    <div
                                                                        key={account.id}
                                                                        onClick={() => toggleAccount(account.id)}
                                                                        className="flex items-center gap-3 px-4 py-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
                                                                    >
                                                                        <div onClick={(e) => e.stopPropagation()}>
                                                                            <Checkbox
                                                                                checked={selectedIds.includes(account.id)}
                                                                                onCheckedChange={() => toggleAccount(account.id)}
                                                                                className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-sm text-foreground group-hover:text-success transition-colors">#{account.accountNumber}</div>
                                                                            <div className="text-xs text-muted-foreground">{account.name} • {account.currency}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Live Accounts Group */}
                                                    {liveAccounts.length > 0 && (
                                                        <div className="mb-2">
                                                            <div
                                                                className="px-4 py-2 text-[11px] font-bold uppercase text-success tracking-wider mt-2 flex items-center justify-between cursor-pointer hover:bg-muted/30 rounded-md transition-colors"
                                                                onClick={() => {
                                                                    const allLiveIds = liveAccounts.map(a => a.id);
                                                                    const allSelected = allLiveIds.every(id => selectedIds.includes(id));
                                                                    if (allSelected) {
                                                                        setSelectedIds(selectedIds.filter(id => !allLiveIds.includes(id)));
                                                                    } else {
                                                                        const newIds = [...selectedIds];
                                                                        allLiveIds.forEach(id => {
                                                                            if (!newIds.includes(id)) newIds.push(id);
                                                                        });
                                                                        setSelectedIds(newIds);
                                                                    }
                                                                }}
                                                            >
                                                                <span>LIVE ACCOUNTS ({liveAccounts.length})</span>
                                                                <span className="text-[10px] bg-success/10 px-2 py-0.5 rounded-md text-success">
                                                                    {liveAccounts.filter(a => selectedIds.includes(a.id)).length}/{liveAccounts.length}
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1 mt-1">
                                                                {liveAccounts.map(account => (
                                                                    <div
                                                                        key={account.id}
                                                                        onClick={() => toggleAccount(account.id)}
                                                                        className="flex items-center gap-3 px-4 py-3 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
                                                                    >
                                                                        <div onClick={(e) => e.stopPropagation()}>
                                                                            <Checkbox
                                                                                checked={selectedIds.includes(account.id)}
                                                                                onCheckedChange={() => toggleAccount(account.id)}
                                                                                className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <div className="font-bold text-sm text-foreground group-hover:text-success transition-colors">#{account.accountNumber}</div>
                                                                            <div className="text-xs text-muted-foreground">{account.name} • {account.currency}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Footer Stats */}
                                                <div className="border-t border-border/50 px-4 py-3 bg-muted/20 text-center">
                                                    <span className="text-xs text-muted-foreground font-medium">
                                                        {selectedIds.length} of {tradingAccounts.length} accounts selected
                                                    </span>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="p-6 pt-2">
                                <Button
                                    onClick={() => {
                                        onSave?.(selectedIds);
                                        onClose();
                                    }}
                                    className="w-full h-12 rounded-md font-bold text-[15px] bg-success hover:bg-success/90 text-white shadow-md shadow-success/20 transition-all active:scale-[0.98]"
                                >
                                    Save Changes
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
