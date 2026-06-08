'use client';

import { X, Info, Check } from 'lucide-react';
import { useState } from 'react';

interface SaveIndicatorTemplateModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SaveIndicatorTemplateModal({ isOpen, onClose }: SaveIndicatorTemplateModalProps) {
    const [templateName, setTemplateName] = useState('');
    const [rememberSymbol, setRememberSymbol] = useState(false);
    const [rememberInterval, setRememberInterval] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[1px]" onClick={onClose}>
            <div 
                className="bg-card border border-border rounded-[8px] shadow-none-2xl w-[360px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between relative flex-shrink-0">
                    <span className="text-[16px] font-bold text-foreground tracking-wide">Save indicator template</span>
                    <button 
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X size={20} className="font-light" strokeWidth={1} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 flex flex-col gap-4 border-b border-border">
                    <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Template Name</label>
                        <input 
                            type="text" 
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            className="w-full bg-background border border-primary rounded-[4px] px-3 py-2 text-[14px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                            autoFocus
                        />
                    </div>

                    <div className="flex flex-col gap-3 mt-1">
                        <label className="flex items-center gap-2 cursor-pointer group w-fit">
                            <div className={`w-4 h-4 rounded-[2px] border ${rememberSymbol ? 'bg-primary border-primary' : 'border-border group-hover:border-foreground/50'} flex items-center justify-center transition-colors`}>
                                {rememberSymbol && <Check size={12} className="text-primary-foreground" strokeWidth={3} />}
                            </div>
                            <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors select-none">Remember Symbol</span>
                            <Info size={14} className="text-muted-foreground group-hover:text-foreground/80 ml-1 transition-colors" />
                            <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={rememberSymbol}
                                onChange={(e) => setRememberSymbol(e.target.checked)} 
                            />
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer group w-fit">
                            <div className={`w-4 h-4 rounded-[2px] border ${rememberInterval ? 'bg-primary border-primary' : 'border-border group-hover:border-foreground/50'} flex items-center justify-center transition-colors`}>
                                {rememberInterval && <Check size={12} className="text-primary-foreground" strokeWidth={3} />}
                            </div>
                            <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground transition-colors select-none">Remember Interval</span>
                            <Info size={14} className="text-muted-foreground group-hover:text-foreground/80 ml-1 transition-colors" />
                            <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={rememberInterval}
                                onChange={(e) => setRememberInterval(e.target.checked)} 
                            />
                        </label>
                    </div>

                    <div className="mt-4 pb-2">
                        <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Saved Indicators</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-4 flex items-center justify-end gap-3 bg-card">
                    <button 
                        onClick={onClose}
                        className="px-5 py-2 rounded-[4px] border border-border text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        disabled={!templateName.trim()}
                        className={`px-5 py-2 rounded-[4px] text-[13px] font-medium transition-colors ${templateName.trim() ? 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

