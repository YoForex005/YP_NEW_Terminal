import React from 'react';
import { X } from 'lucide-react';

interface DepositModalProps {
    onClose: () => void;
    onTopUpDemo: () => void;
}

export function DepositModal({ onClose, onTopUpDemo }: DepositModalProps) {
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200">
            <div className="bg-card border border-border rounded-[8px] shadow-none-2xl w-[520px] max-w-[90vw] overflow-hidden animate-in zoom-in-[0.98] duration-200">
                <div className="flex items-center justify-between p-6 pb-4">
                    <h2 className="text-[18px] font-bold text-foreground">Make a deposit</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex px-6 pb-6 gap-6">
                    {/* Demo Column */}
                    <div className="flex-1 flex flex-col gap-4 relative">
                        {/* Divider Line */}
                        <div className="absolute top-0 bottom-0 -right-3 w-[1px] bg-border" />
                        
                        <h3 className="text-[14px] font-bold text-foreground">Demo</h3>
                        <ul className="flex flex-col gap-2.5 flex-1">
                            <li className="flex items-start gap-2.5">
                                <span className="w-1.5 h-1.5 rounded-none bg-foreground mt-1.5 flex-shrink-0" />
                                <span className="text-[13px] text-foreground/90">Virtual money</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="w-1.5 h-1.5 rounded-none bg-foreground mt-1.5 flex-shrink-0" />
                                <span className="text-[13px] text-foreground/90">Full access to the terminal</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="w-1.5 h-1.5 rounded-none bg-destructive mt-1.5 flex-shrink-0" />
                                <span className="text-[13px] text-destructive">No withdrawals</span>
                            </li>
                        </ul>
                        <button 
                            onClick={() => { onTopUpDemo(); onClose(); }}
                            className="h-[40px] w-full mt-auto bg-muted hover:bg-accent text-foreground font-bold text-[13px] rounded-[6px] transition-colors shadow-none-sm"
                        >
                            Top up demo account
                        </button>
                    </div>

                    {/* Real Column */}
                    <div className="flex-1 flex flex-col gap-4 pl-2">
                        <h3 className="text-[14px] font-bold text-foreground">Real</h3>
                        <ul className="flex flex-col gap-2.5 flex-1">
                            <li className="flex items-start gap-2.5">
                                <span className="w-1.5 h-1.5 rounded-none bg-success mt-1.5 flex-shrink-0" />
                                <span className="text-[13px] text-foreground/90">Full access to the terminal</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="w-1.5 h-1.5 rounded-none bg-success mt-1.5 flex-shrink-0" />
                                <span className="text-[13px] text-success">Instant, automated withdrawals</span>
                            </li>
                        </ul>
                        <button 
                            onClick={onClose}
                            className="h-[40px] w-full mt-auto bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-[13px] rounded-[6px] transition-colors shadow-none-sm"
                        >
                            Deposit on real account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

