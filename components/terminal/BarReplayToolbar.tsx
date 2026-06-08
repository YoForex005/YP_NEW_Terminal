'use client';

import { Play, StepForward, FastForward, X, GripVertical } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BarReplayToolbarProps {
    isOpen: boolean;
    onClose: () => void;
    anchorRef?: React.RefObject<HTMLDivElement | null>;
}

export function BarReplayToolbar({ isOpen, onClose, anchorRef }: BarReplayToolbarProps) {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    useEffect(() => {
        if (isOpen) {
            if (anchorRef?.current) {
                const rect = anchorRef.current.getBoundingClientRect();
                setPosition({ 
                    x: rect.left - 30, // shift slightly left to look aligned
                    y: rect.bottom + 8 
                });
            } else {
                setPosition({ x: window.innerWidth / 2 + 100, y: 110 });
            }
        }
    }, [isOpen, anchorRef]);

    if (!isOpen) return null;

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    // SVG for Jump To (Candles + Left Arrow)
    const JumpToIcon = () => (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 5v14" />
            <rect width="4" height="6" x="12" y="9" rx="1" />
            <path d="M20 3v18" />
            <rect width="4" height="8" x="18" y="7" rx="1" />
            <path d="M8 12h7" />
            <path d="M5 9l-3 3 3 3" />
        </svg>
    );

    return (
        <div 
            className="fixed z-[100] flex items-center bg-card border border-border rounded-[6px] shadow-none-2xl select-none"
            style={{ 
                left: `${position.x}px`, 
                top: `${position.y}px`,
            }}
        >
            <div className="flex items-center h-[38px] px-1 pointer-events-auto">
                {/* Jump To */}
                <button className="w-8 h-8 mx-[2px] rounded-none hover:bg-accent flex items-center justify-center transition-colors bg-background border border-border">
                    <div className="flex items-center text-primary">
                        <JumpToIcon />
                    </div>
                </button>
                
                {/* Play */}
                <button className="w-8 h-8 mx-[2px] rounded-none hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground">
                    <Play size={16} strokeWidth={1.5} />
                </button>
                
                {/* Step Forward */}
                <button className="w-8 h-8 mx-[2px] rounded-none hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground">
                    <StepForward size={16} strokeWidth={1.5} />
                </button>
                
                {/* Skip Forward */}
                <button className="w-8 h-8 mx-[2px] rounded-none hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground">
                    <FastForward size={16} strokeWidth={1.5} />
                </button>
                
                {/* Close */}
                <button 
                    onClick={onClose}
                    className="w-8 h-8 mx-[2px] rounded-none hover:bg-accent flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
                >
                    <X size={16} strokeWidth={1.5} />
                </button>
                
                {/* Divider */}
                <div className="w-[1px] h-[24px] bg-border mx-1" />

                {/* Drag Handle */}
                <div 
                    className="w-6 h-full flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    <GripVertical size={14} />
                </div>
            </div>
        </div>
    );
}


