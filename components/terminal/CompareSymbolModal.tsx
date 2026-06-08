'use client';

import { X, Search, Plus } from 'lucide-react';

interface CompareSymbolModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CompareSymbolModal({ isOpen, onClose }: CompareSymbolModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
            <div 
                className="bg-card border border-border rounded-[8px] shadow-none-2xl w-[480px] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header Sub-Component */}
                <div className="p-[18px] pb-4 border-b border-border/50 flex items-center justify-between relative">
                    <span className="text-[14px] font-bold text-foreground">Compare symbol</span>
                    <button 
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X size={18} strokeWidth={1.5} />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="border-b border-border/50 flex items-center h-12 px-4">
                    <Search size={16} strokeWidth={2} className="text-muted-foreground" />
                    <input 
                        type="text" 
                        placeholder="Search" 
                        className="w-full bg-transparent outline-none border-none text-[13px] text-foreground pl-3 placeholder:text-muted-foreground"
                    />
                </div>

                {/* Content Area (Empty State) */}
                <div className="h-[260px] flex flex-col items-center justify-center">
                    {/* Broken Dashed Circle Graphic */}
                    <div className="relative w-[60px] h-[60px] mb-4">
                        {/* Fake dashed circle using CSS */}
                        <div className="absolute inset-0 rounded-none border border-dashed border-muted-foreground opacity-50" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Search size={22} strokeWidth={1.5} className="text-muted-foreground" />
                        </div>
                        {/* Blue Plus Badge */}
                        <div className="absolute top-[8px] right-[4px] w-4 h-4 rounded-none bg-primary border border-card flex items-center justify-center">
                            <Plus size={10} strokeWidth={3} className="text-primary-foreground" />
                        </div>
                    </div>
                    
                    <span className="text-[13px] text-muted-foreground">
                        No symbols here yet — why not add some?
                    </span>
                </div>
            </div>
        </div>
    );
}

