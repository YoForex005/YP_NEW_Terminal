import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MarketInstrument } from "@/types/dashboard";

interface MarketOverviewSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedIds: string[];
    onSave: (ids: string[]) => void;
    availableSymbols: MarketInstrument[];
}

export function MarketOverviewSettingsModal({
    isOpen,
    onClose,
    selectedIds,
    onSave,
    availableSymbols,
}: MarketOverviewSettingsModalProps) {
    const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(selectedIds);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Reset local state when modal opens to match the current selection
    useEffect(() => {
        if (isOpen) {
            setTempSelectedIds(selectedIds);
        }
    }, [isOpen, selectedIds]);

    const toggleSymbol = (id: string) => {
        setTempSelectedIds((prev) => {
            if (prev.includes(id)) {
                return prev.filter((i) => i !== id);
            }
            if (prev.length >= 6) return prev; // Limit to 6
            return [...prev, id];
        });
    };

    const handleSelectExact6 = () => {
        setTempSelectedIds(availableSymbols.slice(0, 6).map(i => i.id));
    };

    const handleClear = () => {
        setTempSelectedIds([]);
    };

    const handleSave = () => {
        onSave(tempSelectedIds);
        onClose();
    };

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
                        className="fixed inset-0 z-[9998] bg-slate-900/60 backdrop-blur-[6px]"
                    />
                    {/* Modal Container */}
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="w-full max-w-[620px] rounded-md bg-card border border-border/50 shadow-2xl pointer-events-auto overflow-hidden flex flex-col"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between p-8 pb-4">
                                <div className="flex gap-5">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-success/10 text-success border border-success/20">
                                        <Settings className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <h2 className="text-[22px] font-bold tracking-tight text-foreground">Market Overview Settings</h2>
                                        <p className="text-[15px] text-muted-foreground mt-1">Choose which symbols to display in your market overview</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-all active:scale-95"
                                >
                                    <X className="h-6 w-6" />
                                </button>
                            </div>

                            {/* Selection Section Header */}
                            <div className="px-10 flex items-center justify-between pt-6 pb-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
                                    SELECT UP TO 6 SYMBOLS
                                </span>
                                <div className="flex items-center gap-5">
                                    <button
                                        onClick={handleSelectExact6}
                                        className="text-[12px] font-bold text-success hover:text-success/80 transition-colors"
                                    >
                                        Select 6
                                    </button>
                                    <button
                                        onClick={handleClear}
                                        className="text-[12px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            {/* Symbols Grid Area */}
                            <div className="px-10 py-6 overflow-y-auto max-h-[440px] custom-scrollbar">
                                <div className="grid grid-cols-3 gap-4">
                                    {availableSymbols.map((symbol) => {
                                        const isSelected = tempSelectedIds.includes(symbol.id);
                                        return (
                                            <button
                                                key={symbol.id}
                                                onClick={() => toggleSymbol(symbol.id)}
                                                className={`group relative flex items-center justify-center px-4 py-4 rounded-md border text-[14px] font-bold transition-all duration-300 ${isSelected
                                                    ? "border-success bg-success/10 text-success shadow-md shadow-success/20"
                                                    : "border-border bg-background/50 text-muted-foreground hover:border-muted hover:bg-card"
                                                    }`}
                                            >
                                                {symbol.label}
                                                <div className={`absolute top-3 right-3 h-2.5 w-2.5 rounded-full transition-all duration-500 ${isSelected ? "bg-success scale-100 shadow-[0_0_8px_rgba(34,197,94,0.45)]" : "bg-transparent scale-0 border border-border"
                                                    }`} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Selection Status & Footer Actions */}
                            <div className="pt-2 pb-10 flex flex-col items-center">
                                <p className="text-[13px] font-medium text-muted-foreground mb-8">
                                    <span className="text-foreground font-bold">{tempSelectedIds.length}</span> of 6 selected
                                </p>
                                <div className="flex items-center gap-5">
                                    <Button
                                        variant="ghost"
                                        onClick={onClose}
                                        className="h-14 w-36 rounded-md font-bold text-[15px] text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleSave}
                                        className="h-14 w-56 rounded-md bg-success text-white hover:bg-success/90 font-bold text-[15px] shadow-md shadow-success/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        <Check className="h-4 w-4 stroke-[3px]" />
                                        Save Preferences
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
