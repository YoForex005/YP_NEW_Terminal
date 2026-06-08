'use client';

import { X, Search } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface IndicatorsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const INDICATORS_LIST = [
    "52 Week High/Low",
    "Accelerator Oscillator",
    "Accumulation/Distribution",
    "Accumulative Swing Index",
    "Advance/Decline",
    "Arnaud Legoux Moving Average",
    "Aroon",
    "Average Directional Index",
    "Average Price",
    "Average True Range",
    "Awesome Oscillator",
    "Balance of Power",
    "Bollinger Bands",
    "Bollinger Bands %B"
];

export default function IndicatorsModal({ isOpen, onClose }: IndicatorsModalProps) {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef({ startX: 0, startY: 0, currentX: 0, currentY: 0 });
    const modalRef = useRef<HTMLDivElement>(null);

    // Reset position when opened
    useEffect(() => {
        if (isOpen) {
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen]);

    // Handle click outside to close
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Use a small timeout to prevent the button click that opened the modal from immediately closing it
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 10);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            currentX: position.x,
            currentY: position.y
        };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPosition({
            x: dragRef.current.currentX + dx,
            y: dragRef.current.currentY + dy
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center">
            <div 
                ref={modalRef}
                className="bg-card border border-border rounded-[8px] shadow-none-2xl w-[340px] h-[560px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100 pointer-events-auto"
                style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Sub-Component (Draggable) */}
                <div 
                    className="px-5 py-4 border-b border-border flex items-center justify-between relative flex-shrink-0 cursor-grab active:cursor-grabbing"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    <span className="text-[16px] font-bold text-foreground tracking-wide select-none">Indicators</span>
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking the close button
                        className="text-muted-foreground hover:text-foreground transition-colors z-10 cursor-pointer"
                    >
                        <X size={20} className="font-light" strokeWidth={1} />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="border-b border-border flex items-center h-12 px-5 flex-shrink-0">
                    <Search size={18} strokeWidth={1.5} className="text-muted-foreground" />
                    <input 
                        type="text" 
                        placeholder="Search" 
                        className="w-full bg-transparent outline-none border-none text-[14px] text-foreground pl-3 placeholder:text-muted-foreground"
                    />
                </div>

                {/* Content Area (Scrollable) */}
                <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar py-2">
                    <div className="px-5 py-3">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Script Name</span>
                    </div>

                    <div className="flex flex-col pb-2">
                        {INDICATORS_LIST.map((indicator) => (
                            <button
                                key={indicator}
                                className="w-full text-left px-5 py-[10px] text-[13px] text-foreground hover:bg-accent hover:text-foreground transition-colors focus:bg-accent focus:outline-none font-medium"
                            >
                                {indicator}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

