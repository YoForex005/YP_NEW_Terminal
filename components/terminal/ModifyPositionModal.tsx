'use client';

import { X, Droplet, ChevronDown, Minus, Plus } from 'lucide-react';
import { useState, useEffect as import_react_useEffect } from 'react';

// Represents basic position data needed for the modal
export interface PositionData {
    id: string;
    symbol: string;
    type: 'buy' | 'sell';
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    tp: number | null;
    sl: number | null;
}

interface ModifyPositionModalProps {
    isOpen: boolean;
    onClose: () => void;
    position: PositionData | null;
    onUpdate?: (id: string, updates: { sl?: number | null; tp?: number | null }) => void;
    onClosePosition?: (id: string) => void;
}

export default function ModifyPositionModal({ isOpen, onClose, position, onUpdate, onClosePosition }: ModifyPositionModalProps) {
    const [activeTab, setActiveTab] = useState<'modify' | 'partial' | 'close'>('modify');
    
    // Form state
    const [tpValue, setTpValue] = useState('');
    const [tpUnit, setTpUnit] = useState('Price');
    const [slValue, setSlValue] = useState('');
    const [slUnit, setSlUnit] = useState('Price');

    // Sync initial values when modal opens
    import_react_useEffect(() => {
        if (position) {
            setTpValue(position.tp ? position.tp.toString() : '');
            setSlValue(position.sl ? position.sl.toString() : '');
            setActiveTab('modify');
        }
    }, [position]);

    if (!isOpen || !position) return null;

    const isBuy = position.type === 'buy';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <div 
                className="bg-card border border-border rounded-[8px] shadow-none-2xl w-[360px] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Sub-Component */}
                <div className="p-4 border-b border-border/50 flex flex-col gap-2 relative">
                    {/* Close Button */}
                    <button 
                        onClick={onClose}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X size={16} />
                    </button>

                    {/* Top Row: Symbol & P/L */}
                    <div className="flex items-center justify-between pr-6">
                        <div className="flex items-center gap-1.5">
                            <Droplet size={12} className="text-foreground" /> {/* Custom icon based on symbol usually, Droplet for USOIL */}
                            <span className="text-[13px] font-bold text-foreground">{position.symbol}</span>
                            <span className="text-[13px] text-muted-foreground">{position.volume} lots</span>
                        </div>
                        <span className={`text-[13px] font-mono font-medium ${position.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {position.profit > 0 ? '+' : ''}{position.profit.toFixed(2)} USD
                        </span>
                    </div>

                    {/* Bottom Row: Open/Current Price */}
                    <div className="flex items-center justify-between">
                        <span className="text-[12px]">
                            <span className={isBuy ? 'text-success' : 'text-destructive'}>{isBuy ? 'Buy' : 'Sell'}</span>
                            <span className="text-muted-foreground"> at </span>
                            <span className="text-muted-foreground font-mono">{position.openPrice.toFixed(3)}</span>
                        </span>
                        <span className="text-[12px] font-mono text-muted-foreground">{position.currentPrice.toFixed(3)}</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-4 pt-4">
                    <div className="bg-muted rounded-[6px] p-[2px] flex">
                        <button 
                            onClick={() => setActiveTab('modify')}
                            className={`flex-[1.2] py-1.5 text-[12px] rounded-[4px] transition-colors ${activeTab === 'modify' ? 'bg-accent text-foreground shadow-none-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Modify
                        </button>
                        <button 
                            onClick={() => setActiveTab('partial')}
                            className={`flex flex-1 items-center justify-center py-1.5 text-[12px] rounded-[4px] transition-colors ${activeTab === 'partial' ? 'bg-accent text-foreground shadow-none-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Partial close
                        </button>
                        <button 
                            onClick={() => setActiveTab('close')}
                            className={`flex flex-1 items-center justify-center py-1.5 text-[12px] rounded-[4px] transition-colors ${activeTab === 'close' ? 'bg-accent text-foreground shadow-none-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Close by
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="p-4 flex flex-col gap-4">
                    {activeTab === 'modify' && (
                        <>
                            {/* Take Profit Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] text-muted-foreground font-medium">Take Profit</label>
                                <div className="flex items-center justify-between bg-muted border border-border rounded-[4px] h-9 p-1 focus-within:border-foreground/50 transition-colors overflow-hidden">
                                    <input 
                                        type="text"
                                        placeholder="Not set"
                                        value={tpValue}
                                        onChange={(e) => setTpValue(e.target.value)}
                                        className="bg-transparent text-[13px] text-foreground font-mono outline-none pl-2 w-full placeholder:text-muted-foreground/50"
                                    />
                                    <div className="flex items-center shrink-0">
                                        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 transition-colors">
                                            {tpUnit}
                                            <ChevronDown size={12} />
                                        </button>
                                        <div className="w-[1px] h-4 bg-border mx-1" />
                                        <button className="w-7 h-7 flex items-center justify-center rounded-none text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                            <Minus size={14} />
                                        </button>
                                        <button className="w-7 h-7 flex items-center justify-center rounded-none text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Stop Loss Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] text-muted-foreground font-medium">Stop Loss</label>
                                <div className="flex items-center justify-between bg-muted border border-border rounded-[4px] h-9 p-1 focus-within:border-foreground/50 transition-colors overflow-hidden">
                                    <input 
                                        type="text"
                                        placeholder="Not set"
                                        value={slValue}
                                        onChange={(e) => setSlValue(e.target.value)}
                                        className="bg-transparent text-[13px] text-foreground font-mono outline-none pl-2 w-full placeholder:text-muted-foreground/50"
                                    />
                                    <div className="flex items-center shrink-0">
                                        <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 transition-colors">
                                            {slUnit}
                                            <ChevronDown size={12} />
                                        </button>
                                        <div className="w-[1px] h-4 bg-border mx-1" />
                                        <button className="w-7 h-7 flex items-center justify-center rounded-none text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                            <Minus size={14} />
                                        </button>
                                        <button className="w-7 h-7 flex items-center justify-center rounded-none text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Action Button */}
                            <button
                                onClick={() => {
                                    if (onUpdate && position) {
                                        const sl = slValue.trim() === '' ? null : parseFloat(slValue);
                                        const tp = tpValue.trim() === '' ? null : parseFloat(tpValue);
                                        onUpdate(position.id, {
                                            sl: slValue.trim() === '' ? null : (isNaN(sl as number) ? undefined : sl),
                                            tp: tpValue.trim() === '' ? null : (isNaN(tp as number) ? undefined : tp),
                                        });
                                    }
                                    onClose();
                                }}
                                className="w-full h-10 mt-2 bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground text-[13px] font-bold rounded-[4px] transition-all"
                            >
                                Modify position
                            </button>
                        </>
                    )}

                    {activeTab === 'partial' && (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[12px] text-foreground font-bold">Volume to close</label>
                                <div className="flex items-center justify-between bg-transparent border border-border rounded-[4px] h-[40px] px-1 focus-within:border-foreground/50 transition-colors">
                                    <input 
                                        type="text"
                                        value={position.volume.toFixed(2)}
                                        readOnly
                                        className="bg-transparent text-[13px] text-foreground font-mono outline-none pl-2 w-full"
                                    />
                                    <div className="flex items-center shrink-0">
                                        <span className="text-[11px] text-muted-foreground px-2 uppercase tracking-wide">Lots</span>
                                        <div className="w-[1px] h-5 bg-border mx-1" />
                                        <button className="w-8 h-8 flex items-center justify-center rounded-none text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                            <Minus size={15} />
                                        </button>
                                        <button className="w-8 h-8 flex items-center justify-center rounded-none text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                                            <Plus size={15} />
                                        </button>
                                    </div>
                                </div>
                                <span className="text-[11px] text-muted-foreground font-medium leading-tight mt-0.5">0.01 - 0.01</span>
                            </div>

                            <div className="flex flex-col items-center gap-2 mt-4">
                                <button
                                    onClick={() => {
                                        if (onClosePosition && position) {
                                            onClosePosition(position.id);
                                        }
                                        onClose();
                                    }}
                                    className="w-full h-10 bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground text-[13px] font-bold rounded-[4px] transition-all"
                                >
                                    Close position
                                </button>
                                <span className="text-[12px] font-medium text-muted-foreground">
                                    Estimated {position.profit >= 0 ? 'profit' : 'loss'}: <span className={position.profit >= 0 ? 'text-success' : 'text-destructive'}>{position.profit < 0 ? '-' : ''}{Math.abs(position.profit).toFixed(2)} USD</span>
                                </span>
                            </div>
                        </div>
                    )}

                    {activeTab === 'close' && (
                        <div className="py-6 flex flex-col items-center justify-center text-center px-4">
                            <span className="text-[15px] font-bold text-foreground mb-2">No opposite orders</span>
                            <span className="text-[13px] text-muted-foreground leading-relaxed mx-2">
                                The &quot;Close by&quot; feature allows traders to close two hedged orders by cancelling each other out.
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


