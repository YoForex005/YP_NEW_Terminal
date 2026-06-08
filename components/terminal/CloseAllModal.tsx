'use client';

import { Position } from '@/lib/terminal/types';
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface CloseAllModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (type: string) => void;
    positions: Position[];
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function CloseAllModal({ isOpen, onClose, onConfirm, positions, buttonRef }: CloseAllModalProps) {
    const [selectedType, setSelectedType] = useState<string>('all');
    const modalRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<{ bottom: number; right: number } | null>(null);

    useEffect(() => {
        if (isOpen && buttonRef?.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setCoords({
                bottom: window.innerHeight - rect.top + 8,
                right: window.innerWidth - rect.right,
            });
        }
    }, [isOpen, buttonRef]);

    // Calculate stats for each option
    const stats = useMemo<Record<string, { count: number, profit: number }>>(() => {
        const baseStats: Record<string, { count: number, profit: number }> = {
            all: { count: 0, profit: 0 },
            profitable: { count: 0, profit: 0 },
            losing: { count: 0, profit: 0 },
            buy: { count: 0, profit: 0 },
            sell: { count: 0, profit: 0 },
        };
        const symbolStats: Record<string, { count: number, profit: number }> = {};

        positions.forEach(pos => {
            baseStats.all.count++;
            baseStats.all.profit += pos.profit;
            
            if (pos.profit >= 0) {
                baseStats.profitable.count++;
                baseStats.profitable.profit += pos.profit;
            } else {
                baseStats.losing.count++;
                baseStats.losing.profit += pos.profit;
            }

            if (pos.type === 'buy') {
                baseStats.buy.count++;
                baseStats.buy.profit += pos.profit;
            } else if (pos.type === 'sell') {
                baseStats.sell.count++;
                baseStats.sell.profit += pos.profit;
            }
            
            if (!symbolStats[pos.symbol]) {
                symbolStats[pos.symbol] = { count: 0, profit: 0 };
            }
            symbolStats[pos.symbol].count++;
            symbolStats[pos.symbol].profit += pos.profit;
        });

        return {
            ...baseStats,
            ...Object.fromEntries(Object.entries(symbolStats).map(([sym, stat]) => [`symbol-${sym}`, stat]))
        };
    }, [positions]);

    useEffect(() => {
        // Reset selection if the currently selected option becomes disabled
        if (isOpen && (!stats[selectedType] || stats[selectedType].count === 0)) {
            setSelectedType('all');
        }
    }, [isOpen, positions, stats, selectedType]);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;
        
        function handleClickOutside(event: MouseEvent) {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                // Also check if the click was on the trigger button to prevent immediate reopen
                if (buttonRef?.current && buttonRef.current.contains(event.target as Node)) {
                    return;
                }
                onClose();
            }
        }
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, buttonRef]);

    if (!isOpen || !coords) return null;

    const renderOption = (type: string, label: string) => {
        const stat = stats[type];
        if (!stat) return null;
        const isDisabled = stat.count === 0;
        const isSelected = selectedType === type;

        return (
            <div 
                className={`flex items-center justify-between py-1.5 px-2 rounded-[4px] transition-all duration-200 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60'} ${isSelected && !isDisabled ? 'bg-accent/40' : ''}`}
                onClick={() => !isDisabled && setSelectedType(type)}
            >
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-primary ring-1 ring-primary ring-offset-1 ring-offset-card' : 'bg-transparent border border-muted-foreground/40'}`}>
                        {isSelected && <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />}
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-medium tracking-wide ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                        {!isDisabled && (
                            <span className="bg-accent/80 text-muted-foreground text-[9px] px-1.5 py-0.5 rounded-[2px] font-mono leading-none">
                                {stat.count}
                            </span>
                        )}
                    </div>
                </div>
                <div className={`text-[11px] font-mono tracking-tight ${isDisabled ? 'text-muted-foreground/50' : stat.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isDisabled ? '—' : `${stat.profit >= 0 ? '+' : ''}${stat.profit.toFixed(2)}`}
                </div>
            </div>
        );
    };

    const modalContent = (
        <div 
            ref={modalRef}
            className="fixed w-[240px] bg-[#111114]/95 backdrop-blur-md border border-border/40 rounded-[6px] shadow-[0_8px_30px_rgb(0,0,0,0.4)] z-[9999] flex flex-col pointer-events-auto font-sans ring-1 ring-white/5"
            style={{ 
                bottom: `${coords.bottom}px`,
                right: `${coords.right}px`,
            }}
        >
            <div className="p-2 flex flex-col gap-2">
                <div className="px-2 pt-1 pb-1 flex items-center justify-between border-b border-border/30">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Close Multiple
                    </h3>
                </div>
                
                <div className="flex flex-col gap-[1px]">
                    {renderOption('all', 'Close all')}
                    {renderOption('profitable', 'Profitable only')}
                    {renderOption('losing', 'Losing only')}
                    {renderOption('buy', 'All Buy')}
                    {renderOption('sell', 'All Sell')}
                    {Object.keys(stats).filter(k => k.startsWith('symbol-')).map(k => (
                        <div key={k}>{renderOption(k, `All ${k.substring(7)}`)}</div>
                    ))}
                </div>

                <div className="flex items-center gap-2 mt-1 pt-2 border-t border-border/30">
                    <button 
                        onClick={onClose}
                        className="flex-1 h-7 rounded-[3px] bg-accent/40 hover:bg-accent/80 text-muted-foreground hover:text-foreground text-[10px] font-semibold transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => {
                            onConfirm(selectedType);
                            onClose();
                        }}
                        className="flex-1 h-7 rounded-[3px] bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-bold transition-colors shadow-sm"
                        disabled={!stats[selectedType] || stats[selectedType].count === 0}
                    >
                        Execute
                    </button>
                </div>
            </div>
        </div>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(modalContent, document.body);
}
