'use client';

import { Position } from '@/lib/terminal/types';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { subscribeToLivePriceBySymbol } from '@/store/webtrader-store';
import { buildCloseAllLiveStats } from '@/lib/terminal/live-position-pnl';

interface CloseAllModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (type: string) => void;
    positions: Position[];
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

const formatLiveProfit = (profit: number) =>
    `${profit >= 0 ? '+' : ''}${profit.toFixed(2)}`;

export default function CloseAllModal({ isOpen, onClose, onConfirm, positions, buttonRef }: CloseAllModalProps) {
    const [selectedType, setSelectedType] = useState<string>('all');
    const modalRef = useRef<HTMLDivElement>(null);
    const executeRef = useRef<HTMLButtonElement>(null);
    const [coords, setCoords] = useState<{ bottom: number; right: number } | null>(null);
    const positionsRef = useRef(positions);
    const selectedTypeRef = useRef(selectedType);
    const statsRef = useRef(buildCloseAllLiveStats(positions));
    const stats = buildCloseAllLiveStats(positions);
    positionsRef.current = positions;
    selectedTypeRef.current = selectedType;
    statsRef.current = stats;

    useEffect(() => {
        if (isOpen && buttonRef?.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setCoords({
                bottom: window.innerHeight - rect.top + 8,
                right: window.innerWidth - rect.right,
            });
        }
    }, [isOpen, buttonRef]);

    useEffect(() => {
        if (!isOpen) return;

        const paint = () => {
            const stats = buildCloseAllLiveStats(positionsRef.current);
            statsRef.current = stats;

            const root = modalRef.current;
            if (root) {
                root.querySelectorAll<HTMLElement>('[data-close-type]').forEach((row) => {
                    const type = row.dataset.closeType;
                    if (!type) return;
                    const stat = stats[type];
                    if (!stat) return;

                    const disabled = stat.count === 0;
                    const selected = selectedTypeRef.current === type && !disabled;
                    row.classList.toggle('opacity-40', disabled);
                    row.classList.toggle('cursor-not-allowed', disabled);
                    row.classList.toggle('cursor-pointer', !disabled);
                    row.classList.toggle('hover:bg-accent/60', !disabled);
                    row.classList.toggle('bg-accent/40', selected);

                    const countEl = row.querySelector<HTMLElement>('[data-close-count]');
                    if (countEl) {
                        countEl.textContent = String(stat.count);
                        countEl.classList.toggle('hidden', disabled);
                    }

                    const profitEl = row.querySelector<HTMLElement>('[data-close-profit]');
                    if (profitEl) {
                        profitEl.textContent = disabled ? '—' : formatLiveProfit(stat.profit);
                        profitEl.classList.remove('text-muted-foreground/50', 'text-emerald-400', 'text-rose-400');
                        profitEl.classList.add(
                            disabled
                                ? 'text-muted-foreground/50'
                                : stat.profit >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400',
                        );
                    }
                });
            }

            const selected = stats[selectedTypeRef.current];
            if (executeRef.current) {
                executeRef.current.disabled = !selected || selected.count === 0;
            }
            if (!selected || selected.count === 0) {
                if (selectedTypeRef.current !== 'all') {
                    setSelectedType('all');
                }
            }
        };

        paint();
        const symbols = [...new Set(positions.map((position) => position.symbol).filter(Boolean))];
        const unsubs = symbols.map((symbol) => subscribeToLivePriceBySymbol(symbol, paint));
        return () => {
            unsubs.forEach((unsub) => unsub());
        };
    }, [isOpen, positions]);

    useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(event: MouseEvent) {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
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

    const symbolKeys = Object.keys(stats).filter((key) => key.startsWith('symbol-'));

    const renderOption = (type: string, label: string) => {
        const stat = stats[type];
        if (!stat) return null;
        const isDisabled = stat.count === 0;
        const isSelected = selectedType === type;

        return (
            <div
                data-close-type={type}
                className={`flex items-center justify-between py-1.5 px-2 rounded-[4px] transition-all duration-200 ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60'} ${isSelected && !isDisabled ? 'bg-accent/40' : ''}`}
                onClick={() => {
                    const live = statsRef.current[type];
                    if (!live || live.count === 0) return;
                    setSelectedType(type);
                }}
            >
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-primary ring-1 ring-primary ring-offset-1 ring-offset-card' : 'bg-transparent border border-muted-foreground/40'}`}>
                        {isSelected && <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full" />}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-medium tracking-wide ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
                        <span
                            data-close-count
                            className={`bg-accent/80 text-muted-foreground text-[9px] px-1.5 py-0.5 rounded-[2px] font-mono leading-none ${isDisabled ? 'hidden' : ''}`}
                        >
                            {stat.count}
                        </span>
                    </div>
                </div>
                <div
                    data-close-profit
                    className={`text-[11px] font-mono tracking-tight ${isDisabled ? 'text-muted-foreground/50' : stat.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                >
                    {isDisabled ? '—' : formatLiveProfit(stat.profit)}
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
                    {symbolKeys.map((key) => (
                        <div key={key}>{renderOption(key, `All ${key.substring(7)}`)}</div>
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
                        ref={executeRef}
                        onClick={() => {
                            const live = statsRef.current[selectedType];
                            if (!live || live.count === 0) return;
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
