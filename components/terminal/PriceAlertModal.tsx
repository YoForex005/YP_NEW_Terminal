'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, Minus, Plus } from 'lucide-react';
import { SymbolIcon } from './SymbolIcon';

interface PriceAlertModalProps {
    symbol: string;
    currentBid?: number;
    currentAsk?: number;
    digits?: number;
    onClose: () => void;
    onSubmit?: (symbol: string, price: number) => void;
}

export function PriceAlertModal({
    symbol,
    currentBid,
    currentAsk,
    digits = 5,
    onClose,
    onSubmit,
}: PriceAlertModalProps) {
    const [position, setPosition] = useState({
        x: typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 100,
        y: typeof window !== 'undefined' ? window.innerHeight / 2 - 250 : 100,
    });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const [alertPrice, setAlertPrice] = useState('');
    const [recurring, setRecurring] = useState(false);
    const pipStep = 1 / Math.pow(10, digits);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) {
                return;
            }

            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y,
            });
        };
        const handleMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    useEffect(() => {
        const referencePrice =
            typeof currentBid === 'number' && Number.isFinite(currentBid) && currentBid > 0
                ? currentBid
                : typeof currentAsk === 'number' && Number.isFinite(currentAsk) && currentAsk > 0
                    ? currentAsk
                    : null;

        setAlertPrice(referencePrice === null ? '' : referencePrice.toFixed(digits));
    }, [currentAsk, currentBid, digits, symbol]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        };
    };

    const adjustAlertPrice = (direction: -1 | 1) => {
        const current = Number.parseFloat(alertPrice) || currentBid || currentAsk || 0;
        if (!Number.isFinite(current) || current <= 0) {
            return;
        }

        setAlertPrice((current + pipStep * direction).toFixed(digits));
    };

    const submitPrice = Number.parseFloat(alertPrice);
    const quoteLabel =
        typeof currentBid === 'number' &&
        Number.isFinite(currentBid) &&
        currentBid > 0 &&
        typeof currentAsk === 'number' &&
        Number.isFinite(currentAsk)
        &&
        currentAsk > 0
            ? `${currentBid.toFixed(digits)} / ${currentAsk.toFixed(digits)}`
            : 'No live quote available';
    const distanceLabel =
        typeof currentBid === 'number' &&
        Number.isFinite(currentBid) &&
        currentBid > 0 &&
        Number.isFinite(submitPrice)
            ? `${((submitPrice - currentBid) / pipStep).toFixed(1)} pips from bid`
            : 'Waiting for a live quote';

    return (
        <div
            className="fixed z-[9999] flex w-[300px] flex-col rounded-[8px] border border-border bg-card shadow-none-[0_12px_48px_rgba(0,0,0,0.8)]"
            style={{ left: position.x, top: position.y }}
        >
            <div
                className="flex cursor-grab items-start justify-between p-4 select-none active:cursor-grabbing"
                onMouseDown={handleMouseDown}
            >
                <div className="pointer-events-none flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <div className="-ml-1 flex h-5 w-5 items-center justify-center scale-75">
                            <SymbolIcon symbol={symbol} />
                        </div>
                        <span className="text-[16px] font-bold text-foreground">{symbol}</span>
                    </div>
                    <span className="text-[13px] text-muted-foreground">{quoteLabel}</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex flex-col gap-4 px-4 pb-4">
                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-foreground">Alert price</span>
                    <div className="flex h-[40px] overflow-hidden rounded-[4px] border border-border bg-background transition-colors focus-within:border-primary/50">
                        <input
                            type="text"
                            value={alertPrice}
                            onChange={(e) => setAlertPrice(e.target.value)}
                            className="w-full flex-1 border-none bg-transparent px-3 text-[15px] text-foreground outline-none"
                        />
                        <div className="flex">
                            <button
                                onClick={() => adjustAlertPrice(-1)}
                                className="flex h-full w-[40px] items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <Minus size={14} strokeWidth={2.5} />
                            </button>
                            <button
                                onClick={() => adjustAlertPrice(1)}
                                className="flex h-full w-[40px] items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <Plus size={14} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                    <span className="mt-0.5 text-[12px] text-muted-foreground">{distanceLabel}</span>
                </div>

                <div className="flex flex-col gap-3">
                    <button className="flex h-[40px] items-center justify-between rounded-[4px] border border-border bg-background px-3 transition-colors hover:bg-accent">
                        <span className="text-[14px] font-medium text-foreground">For Bid price</span>
                        <ChevronDown size={16} className="text-muted-foreground" />
                    </button>

                    <button className="flex h-[40px] items-center justify-between rounded-[4px] border border-border bg-background px-3 transition-colors hover:bg-accent">
                        <span className="text-[14px] font-medium text-foreground">Expire in 7 days</span>
                        <ChevronDown size={16} className="text-muted-foreground" />
                    </button>
                </div>

                <input
                    type="text"
                    placeholder="Note"
                    className="mt-2 h-[40px] rounded-[4px] border border-border bg-background px-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
                />

                <div className="mt-2 flex items-center gap-3">
                    <button
                        onClick={() => setRecurring(!recurring)}
                        className={`relative h-5 w-9 rounded-none transition-colors ${recurring ? 'bg-primary' : 'bg-muted'}`}
                    >
                        <div className={`absolute top-[2px] h-4 w-4 rounded-none bg-foreground transition-transform ${recurring ? 'left-[18px]' : 'left-[2px] bg-muted-foreground'}`} />
                    </button>
                    <span className="text-[14px] font-medium text-foreground">Recurring alert</span>
                </div>

                <button
                    onClick={() => {
                        if (onSubmit && Number.isFinite(submitPrice)) {
                            onSubmit(symbol, submitPrice);
                        }
                        onClose();
                    }}
                    disabled={!Number.isFinite(submitPrice)}
                    className="mt-2 h-[44px] w-full rounded-[4px] bg-primary text-[14px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Add price alert
                </button>
            </div>
        </div>
    );
}
