import React, { useState } from 'react';
import { X, Search, ArrowDownAZ } from 'lucide-react';

interface LayoutsModalProps {
    onClose: () => void;
}

export function LayoutsModal({ onClose }: LayoutsModalProps) {
    const [search, setSearch] = useState('');
    const layouts: Array<{ id: number; name: string; desc: string }> = [];

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-transparent pointer-events-auto shadow-none-2xl">
            <div className="bg-card border border-border rounded-[8px] w-[500px] h-[600px] max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden shadow-none-[0_12px_48px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-4 border-b border-border">
                    <h2 className="text-[18px] font-bold text-foreground tracking-wide">Layouts</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Close">
                        <X size={20} />
                    </button>
                </div>

                {/* Search */}
                <div className="flex items-center px-5 h-[50px] border-b border-border flex-shrink-0 relative">
                    <Search size={18} className="text-muted-foreground absolute left-5" />
                    <input 
                        type="text" 
                        placeholder="Search" 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-full bg-transparent outline-none pl-9 text-[14px] text-foreground placeholder:text-muted-foreground/50 border-none"
                    />
                </div>

                {/* List Header */}
                <div className="flex items-center justify-between px-5 h-[40px] flex-shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">Layout Name</span>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowDownAZ size={16} />
                    </button>
                </div>

                {/* Layout List */}
                <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar pb-4 pt-1">
                    {layouts.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center px-6 text-center">
                            <p className="text-[13px] text-muted-foreground">
                                No saved layouts are available yet.
                            </p>
                        </div>
                    ) : (
                        layouts.map(layout => (
                            <button 
                                key={layout.id}
                                className="flex flex-col items-start px-5 py-3 hover:bg-accent transition-colors w-full text-left"
                                onClick={onClose}
                            >
                                <span className="text-[14px] font-semibold text-foreground mb-0.5">{layout.name}</span>
                                <span className="text-[13px] text-muted-foreground">{layout.desc}</span>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

