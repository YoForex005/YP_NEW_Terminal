'use client';

import { X, Activity } from 'lucide-react';

interface SignalsPanelProps {
    onClose: () => void;
}

export default function SignalsPanel({ onClose }: SignalsPanelProps) {
    return (
        <div className="flex h-full flex-col bg-card text-[13px] select-none">
            <div className="flex h-[50px] flex-shrink-0 items-center justify-between border-b border-border px-4">
                <span className="text-[13px] font-bold uppercase tracking-wider text-primary">Signals</span>
                <button
                    onClick={onClose}
                    className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <X size={16} />
                </button>
            </div>

            <div className="flex flex-1 items-center justify-center px-6 py-8">
                <div className="max-w-[280px] text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/70">
                        <Activity size={24} className="text-muted-foreground" />
                    </div>
                    <h4 className="mt-4 text-sm font-bold text-foreground">No live signal feed connected</h4>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                        The terminal no longer shows sample trade ideas here. Connect a real signals provider before populating this panel.
                    </p>
                </div>
            </div>
        </div>
    );
}
