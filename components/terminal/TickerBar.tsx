'use client';

import type { Instrument } from '@/lib/terminal/types';
import { X } from 'lucide-react';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';

interface TickerBarProps {
    instruments: Instrument[];
    selectedSymbol: string;
    openTabs: string[];
    onSelect: (symbol: string) => void;
    onCloseTab: (symbol: string) => void;
}

export default function TickerBar({
    instruments,
    selectedSymbol,
    openTabs,
    onSelect,
    onCloseTab,
}: TickerBarProps) {
    return (
        <div className="flex items-center gap-0 border-b border-border bg-background overflow-x-auto no-scrollbar">
            {openTabs.map((symbol) => {
                const inst = instruments.find((i) => i.symbol === symbol);
                if (!inst) return null;
                const isActive = symbol === selectedSymbol;

                return (
                    <div
                        key={symbol}
                        onClick={() => onSelect(symbol)}
                        className={`flex items-center gap-3 px-4 py-2 border-r border-border cursor-pointer transition-all duration-200 group relative min-w-[180px] ${isActive
                                ? 'bg-accent'
                                : 'hover:bg-accent/50'
                            }`}
                    >
                        {isActive && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
                        )}

                        <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs font-semibold text-foreground">{inst.icon}</span>
                            <span className={`text-xs font-semibold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {formatTerminalDisplaySymbol(inst.symbol)}
                            </span>
                            <span className="font-mono text-xs text-foreground tabular-nums">
                                {inst.bid.toFixed(inst.digits)}
                            </span>
                            <span
                                className={`text-[10px] font-mono tabular-nums ${inst.changePercent >= 0 ? 'text-success' : 'text-destructive'
                                    }`}
                            >
                                {inst.changePercent >= 0 ? '+' : ''}
                                {inst.changePercent.toFixed(2)}%
                            </span>
                        </div>

                        {openTabs.length > 1 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCloseTab(symbol);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 rounded-none hover:bg-background text-muted-foreground hover:text-foreground transition-all"
                            >
                                <X size={10} />
                            </button>
                        )}
                    </div>
                );
            })}

            {/* Add tab button */}
            <button className="px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-all">
                <span className="text-sm">+</span>
            </button>
        </div>
    );
}

