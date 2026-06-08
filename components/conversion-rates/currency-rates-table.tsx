"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, TrendingUp, TrendingDown, ArrowRight, ArrowLeftRight } from "lucide-react";
import { getCurrency } from "@/lib/currencies";

export interface CurrencyPair {
    id: string;
    number: string;
    from: string;
    to: string;
    rate: string;
    change: string;
}

interface CurrencyRatesTableProps {
    title?: string;
    pairs: CurrencyPair[];
    className?: string;
}

const getCurrencyIcon = (code: string, size: "xs" | "sm" | "lg" = "sm") => {
    const meta = getCurrency(code);
    const dim =
        size === "xs" ? "w-7 h-7 text-xs" :
        size === "sm" ? "w-8 h-8 text-sm" :
                        "w-10 h-10 text-lg sm:w-12 sm:h-12 sm:text-xl";
    return (
        <div className={`${dim} rounded-full bg-gradient-to-br ${meta.gradient} flex items-center justify-center border border-white/10 leading-none shrink-0`}>
            {meta.flag}
        </div>
    );
};

const getChangeBars = (change: string) => {
    const isPositive = change.startsWith("+");
    const value = Math.abs(parseFloat(change));
    const filledBars = Math.min(10, Math.max(1, Math.round((value / 0.4) * 10)));
    return (
        <div className="flex items-center gap-2.5">
            <div className="flex gap-[3px]">
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className={`w-1.5 h-5 rounded-full transition-all duration-500 ${i >= filledBars ? "bg-muted/40 border border-border/30" : isPositive ? "bg-emerald-500/70" : "bg-rose-500/70"}`} />
                ))}
            </div>
            <span className={`text-sm font-mono font-semibold min-w-[3.5rem] ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                {change}
            </span>
        </div>
    );
};

const getChangeGradient = (change: string) =>
    change.startsWith("+") ? "from-emerald-500/10 to-transparent" : "from-rose-500/10 to-transparent";

const getChangeBadge = (change: string) => {
    const isPositive = change.startsWith("+");
    return (
        <div className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border text-xs font-semibold ${isPositive ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-rose-500/10 border-rose-500/30 text-rose-400"}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {change}
        </div>
    );
};

// Directional variants: FROM crosses right→left, TO crosses left→right
const fromVariants = {
    initial: { opacity: 0, x: 20  },
    animate: { opacity: 1, x: 0   },
    exit:    { opacity: 0, x: -20 },
};
const toVariants = {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0   },
    exit:    { opacity: 0, x: 20  },
};
const rateVariants = {
    initial: { opacity: 0, y: 6  },
    animate: { opacity: 1, y: 0  },
    exit:    { opacity: 0, y: -6 },
};
const swapTransition = { duration: 0.18, ease: "easeInOut" as const };

// Shared flip button to avoid duplication
function FlipButton({ pairId, rotation, onFlip }: { pairId: string; rotation: number; onFlip: (id: string, e: React.MouseEvent) => void }) {
    return (
        <motion.button
            animate={{ rotate: rotation }}
            transition={{ type: "spring", stiffness: 280, damping: 18 }}
            onClick={(e) => onFlip(pairId, e)}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-muted/60 hover:bg-primary/15 border border-border/40 hover:border-primary/30 text-muted-foreground hover:text-primary transition-colors duration-150 shrink-0"
            title="Flip conversion direction"
        >
            <ArrowLeftRight className="w-3.5 h-3.5" />
        </motion.button>
    );
}

export function CurrencyRatesTable({ title = "Live Rates", pairs, className = "" }: CurrencyRatesTableProps) {
    const [flippedRows, setFlippedRows]         = useState<Set<string>>(new Set());
    const [rotations, setRotations]             = useState<Record<string, number>>({});
    const [selectedPair, setSelectedPair]       = useState<CurrencyPair | null>(null);
    const [selectedFlipped, setSelectedFlipped] = useState(false);
    useReducedMotion(); // respect user preference (framer-motion uses this globally)

    const posCount = pairs.filter(p => p.change.startsWith("+")).length;
    const negCount = pairs.length - posCount;

    const handleFlip = (pairId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setFlippedRows(prev => {
            const next = new Set(prev);
            next.has(pairId) ? next.delete(pairId) : next.add(pairId);
            return next;
        });
        setRotations(prev => ({ ...prev, [pairId]: (prev[pairId] ?? 0) + 180 }));
    };

    const getDisplay = (pair: CurrencyPair, flipped: boolean) => {
        const from   = flipped ? pair.to   : pair.from;
        const to     = flipped ? pair.from : pair.to;
        const rate   = flipped ? (1 / parseFloat(pair.rate)).toFixed(5) : pair.rate;
        const change = flipped
            ? pair.change.startsWith("+") ? pair.change.replace("+", "-") : pair.change.replace("-", "+")
            : pair.change;
        return { from, to, rate, change };
    };

    return (
        <div className={`w-full ${className}`}>
            <div className="relative border border-border/30 rounded-2xl p-4 sm:p-6 bg-card overflow-hidden">

                {/* Card header */}
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap mb-4 sm:mb-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <h2 className="text-base sm:text-xl font-medium text-foreground">{title}</h2>
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                        {posCount} Gaining · {negCount} Declining
                    </div>
                </div>

                {/* Column labels — desktop only */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    <div className="col-span-1">No</div>
                    <div className="col-span-3">From</div>
                    <div className="col-span-1" />
                    <div className="col-span-2">To</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-3">24h Change</div>
                </div>

                {/* Rows */}
                <motion.div
                    className="space-y-2"
                    variants={{ visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
                    initial="hidden"
                    animate="visible"
                >
                    {pairs.map((pair) => {
                        const flipped = flippedRows.has(pair.id);
                        const { from: displayFrom, to: displayTo, rate: displayRate, change: displayChange } = getDisplay(pair, flipped);
                        const fromMeta = getCurrency(displayFrom);
                        const toMeta   = getCurrency(displayTo);

                        return (
                            <motion.div
                                key={pair.id}
                                variants={{
                                    hidden:  { opacity: 0, x: -25, scale: 0.95, filter: "blur(4px)" },
                                    visible: { opacity: 1, x: 0,   scale: 1,    filter: "blur(0px)", transition: { type: "spring", stiffness: 400, damping: 28, mass: 0.6 } },
                                }}
                                className="relative cursor-pointer"
                                onClick={() => { setSelectedPair(pair); setSelectedFlipped(flipped); }}
                            >
                                <motion.div
                                    className="relative bg-muted/50 border border-border/50 rounded-xl p-3 sm:p-4 overflow-hidden"
                                    whileHover={{ y: -1, transition: { type: "spring", stiffness: 400, damping: 25 } }}
                                >
                                    <div
                                        className={`absolute inset-0 bg-gradient-to-l ${getChangeGradient(displayChange)} pointer-events-none transition-colors duration-300`}
                                        style={{ backgroundSize: "30% 100%", backgroundPosition: "right", backgroundRepeat: "no-repeat" }}
                                    />

                                    {/* ── Mobile layout (< md) ── */}
                                    {/*
                                        < 450px : flex-col — pair row on top, rate+change row below
                                        450px–md: flex-row — pair left, rate+change stacked right
                                        Icons hidden at < 450px
                                    */}
                                    <div className="relative flex flex-col gap-1.5 min-[450px]:flex-row min-[450px]:items-center min-[450px]:gap-2 md:hidden">

                                        {/* From + flip + To */}
                                        <div className="flex items-center gap-2 flex-1 min-w-0">

                                            {/* From */}
                                            <div className="overflow-hidden relative min-w-0 flex-1">
                                                <AnimatePresence mode="popLayout" initial={false}>
                                                    <motion.div
                                                        key={`mob-from-${pair.id}-${displayFrom}`}
                                                        variants={fromVariants} initial="initial" animate="animate" exit="exit"
                                                        transition={swapTransition}
                                                        className="flex items-center gap-2 min-w-0"
                                                    >
                                                        <span className="hidden min-[450px]:block shrink-0">
                                                            {getCurrencyIcon(displayFrom, "xs")}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-sm text-foreground leading-tight">{fromMeta.symbol}</div>
                                                            <div className="text-[10px] text-muted-foreground truncate leading-tight">{fromMeta.name}</div>
                                                        </div>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>

                                            <FlipButton pairId={pair.id} rotation={rotations[pair.id] ?? 0} onFlip={handleFlip} />

                                            {/* To */}
                                            <div className="overflow-hidden relative min-w-0 flex-1">
                                                <AnimatePresence mode="popLayout" initial={false}>
                                                    <motion.div
                                                        key={`mob-to-${pair.id}-${displayTo}`}
                                                        variants={toVariants} initial="initial" animate="animate" exit="exit"
                                                        transition={swapTransition}
                                                        className="flex items-center gap-2 min-w-0"
                                                    >
                                                        <span className="hidden min-[450px]:block shrink-0">
                                                            {getCurrencyIcon(displayTo, "xs")}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-sm text-foreground leading-tight">{toMeta.symbol}</div>
                                                            <div className="text-[10px] text-muted-foreground truncate leading-tight">{toMeta.name}</div>
                                                        </div>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>

                                        </div>

                                        {/* Rate + Change
                                            < 450px : flex-row full-width space-between
                                            ≥ 450px : flex-col right-aligned fixed-width
                                        */}
                                        <div className="flex items-center justify-between w-full min-[450px]:flex-col min-[450px]:items-end min-[450px]:w-auto min-[450px]:shrink-0 min-[450px]:ml-1 min-[450px]:min-w-[4.5rem]">
                                            <div className="overflow-hidden relative">
                                                <AnimatePresence mode="popLayout" initial={false}>
                                                    <motion.div
                                                        key={`mob-rate-${pair.id}-${displayRate}`}
                                                        variants={rateVariants} initial="initial" animate="animate" exit="exit"
                                                        transition={swapTransition}
                                                    >
                                                        <span className="text-sm font-bold font-mono tabular-nums text-foreground">{displayRate}</span>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>
                                            <div className="overflow-hidden relative">
                                                <AnimatePresence mode="popLayout" initial={false}>
                                                    <motion.div
                                                        key={`mob-change-${pair.id}-${displayChange}`}
                                                        variants={rateVariants} initial="initial" animate="animate" exit="exit"
                                                        transition={swapTransition}
                                                    >
                                                        <span className={`text-[11px] font-semibold font-mono ${displayChange.startsWith("+") ? "text-emerald-400" : "text-rose-400"}`}>
                                                            {displayChange}
                                                        </span>
                                                    </motion.div>
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                    </div>

                                    {/* ── Desktop layout (md+) ── */}
                                    <div className="relative hidden md:grid grid-cols-12 gap-4 items-center">

                                        {/* Number */}
                                        <div className="col-span-1">
                                            <span className="text-2xl font-bold text-muted-foreground">{pair.number}</span>
                                        </div>

                                        {/* FROM */}
                                        <div className="col-span-3 overflow-hidden relative min-w-0">
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                <motion.div
                                                    key={`from-${pair.id}-${displayFrom}`}
                                                    variants={fromVariants} initial="initial" animate="animate" exit="exit"
                                                    transition={swapTransition}
                                                    className="flex items-center gap-3 min-w-0"
                                                >
                                                    {getCurrencyIcon(displayFrom)}
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-sm text-foreground">{fromMeta.symbol}</div>
                                                        <div className="text-[11px] text-muted-foreground truncate">{fromMeta.name}</div>
                                                    </div>
                                                </motion.div>
                                            </AnimatePresence>
                                        </div>

                                        {/* Flip */}
                                        <div className="col-span-1 flex justify-center">
                                            <FlipButton pairId={pair.id} rotation={rotations[pair.id] ?? 0} onFlip={handleFlip} />
                                        </div>

                                        {/* TO */}
                                        <div className="col-span-2 overflow-hidden relative min-w-0">
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                <motion.div
                                                    key={`to-${pair.id}-${displayTo}`}
                                                    variants={toVariants} initial="initial" animate="animate" exit="exit"
                                                    transition={swapTransition}
                                                    className="flex items-center gap-2 min-w-0"
                                                >
                                                    {getCurrencyIcon(displayTo)}
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-sm text-foreground">{toMeta.symbol}</div>
                                                        <div className="text-[11px] text-muted-foreground truncate">{toMeta.name}</div>
                                                    </div>
                                                </motion.div>
                                            </AnimatePresence>
                                        </div>

                                        {/* Rate */}
                                        <div className="col-span-2 text-right overflow-hidden relative">
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                <motion.span
                                                    key={`rate-${pair.id}-${displayRate}`}
                                                    variants={rateVariants} initial="initial" animate="animate" exit="exit"
                                                    transition={swapTransition}
                                                    className="inline-block text-sm font-bold tracking-tight font-mono tabular-nums text-foreground"
                                                >
                                                    {displayRate}
                                                </motion.span>
                                            </AnimatePresence>
                                        </div>

                                        {/* Change bars */}
                                        <div className="col-span-3 overflow-hidden relative">
                                            <AnimatePresence mode="popLayout" initial={false}>
                                                <motion.div
                                                    key={`change-${pair.id}-${displayChange}`}
                                                    variants={rateVariants} initial="initial" animate="animate" exit="exit"
                                                    transition={swapTransition}
                                                >
                                                    {getChangeBars(displayChange)}
                                                </motion.div>
                                            </AnimatePresence>
                                        </div>

                                    </div>
                                </motion.div>
                            </motion.div>
                        );
                    })}
                </motion.div>

                {/* ── Detail overlay ── */}
                <AnimatePresence>
                    {selectedPair && (() => {
                        const { from: displayFrom, to: displayTo, rate: displayRate, change: displayChange } = getDisplay(selectedPair, selectedFlipped);
                        const fromMeta = getCurrency(displayFrom);
                        const toMeta   = getCurrency(displayTo);
                        const rateNum  = parseFloat(displayRate);
                        const bid      = (rateNum - 0.00015).toFixed(5);
                        const ask      = (rateNum + 0.00015).toFixed(5);

                        return (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="absolute inset-0 bg-background/60 backdrop-blur-sm flex flex-col rounded-2xl z-10 overflow-hidden"
                            >
                                {/* Overlay header */}
                                <div className="relative bg-gradient-to-r from-muted/50 to-transparent p-3 sm:p-4 border-b border-border/30 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                                    <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
                                        {getCurrencyIcon(displayFrom, "sm")}
                                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                                        {getCurrencyIcon(displayTo, "sm")}
                                        <div className="min-w-0">
                                            <h3 className="text-base sm:text-lg font-bold leading-tight">
                                                {displayFrom} / {displayTo}
                                            </h3>
                                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                                {fromMeta.symbol} {fromMeta.name} → {toMeta.symbol} {toMeta.name}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {getChangeBadge(displayChange)}
                                        <motion.button
                                            className="w-8 h-8 bg-background/80 hover:bg-background rounded-full flex items-center justify-center border border-border/50"
                                            onClick={() => setSelectedPair(null)}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                        >
                                            <X className="w-4 h-4" />
                                        </motion.button>
                                    </div>
                                </div>

                                {/* Overlay body */}
                                <div className="flex-1 p-3 sm:p-4 space-y-3 overflow-y-auto">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                        {[
                                            { label: "Rate",   value: displayRate },
                                            { label: "Bid",    value: bid         },
                                            { label: "Ask",    value: ask         },
                                            { label: "Spread", value: "0.0003"    },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="bg-muted/40 rounded-lg p-2.5 sm:p-3 border border-border/30">
                                                <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</label>
                                                <div className="text-sm font-mono font-bold mt-1 text-foreground">{value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="bg-muted/40 rounded-lg p-2.5 sm:p-3 border border-border/30">
                                        <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">24h Movement</label>
                                        <div className="overflow-x-auto">{getChangeBars(displayChange)}</div>
                                    </div>

                                    <div className="bg-muted/40 rounded-lg p-2.5 sm:p-3 border border-border/30">
                                        <label className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Recent Activity</label>
                                        <div className="font-mono text-[11px] sm:text-xs space-y-1 overflow-x-auto">
                                            <div className="text-emerald-400">[{new Date().toLocaleTimeString()}] Rate updated: {displayRate}</div>
                                            <div className="text-blue-400">[{new Date(Date.now() - 60000).toLocaleTimeString()}] Market data sync completed</div>
                                            <div className={displayChange.startsWith("+") ? "text-emerald-400" : "text-rose-400"}>
                                                [{new Date(Date.now() - 120000).toLocaleTimeString()}] 24h change: {displayChange}
                                            </div>
                                            <div className="text-muted-foreground">[{new Date(Date.now() - 300000).toLocaleTimeString()}] Liquidity check passed</div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })()}
                </AnimatePresence>

            </div>
        </div>
    );
}
