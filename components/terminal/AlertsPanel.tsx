'use client';

import React from 'react';
import { X, Bell } from 'lucide-react';
import type { PriceAlert } from '@/lib/terminal/types';

interface AlertsPanelProps {
    alerts?: PriceAlert[];
    onToggleAlert?: (id: string) => void;
    onDeleteAlert?: (id: string) => void;
    onClose?: () => void;
}

const describeCondition = (condition: PriceAlert['condition']) => {
    if (condition === 'greater_than') return 'above';
    if (condition === 'less_than') return 'below';
    return 'crosses';
};

export default function AlertsPanel({
    alerts = [],
    onToggleAlert,
    onDeleteAlert,
    onClose,
}: AlertsPanelProps) {
    return (
        <div className="group/panel relative flex h-full flex-col overflow-hidden border-l border-border bg-background text-xs">
            <div className="flex h-11 flex-shrink-0 items-center justify-between border-b border-border bg-card px-4">
                <div className="flex items-center gap-2 font-semibold tracking-wide text-foreground">
                    <div className="relative">
                        <Bell size={16} className="text-success" />
                        <div className="absolute inset-0 -z-10 rounded-none bg-success opacity-40 mix-blend-screen blur-[8px]" />
                    </div>
                    <span>Price Alerts</span>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 items-center justify-center rounded-none text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto p-2">
                {alerts.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
                        <Bell size={44} strokeWidth={1.25} className="text-muted-foreground" />
                        <p className="text-sm font-medium tracking-wide text-muted-foreground">No price alerts created yet</p>
                        <p className="max-w-[240px] text-[12px] text-muted-foreground">
                            Create one from the header bell menu or the instruments list after a live market loads.
                        </p>
                    </div>
                ) : (
                    alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className="group flex flex-col rounded-none border border-transparent p-3 transition-all duration-300 hover:border-border hover:bg-accent"
                        >
                            <div className="mb-2 flex items-start justify-between">
                                <div className="flex items-center gap-2.5">
                                    <span
                                        className={`text-[13px] font-bold tracking-wide transition-colors duration-300 ${
                                            alert.active
                                                ? 'text-foreground drop-shadow-none-[0_0_10px_rgba(255,255,255,0.1)]'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {alert.symbol}
                                    </span>
                                    <span
                                        className={`rounded-none border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest transition-colors duration-300 ${
                                            alert.active
                                                ? 'border-success/20 bg-success/10 text-success'
                                                : 'border-border bg-card text-muted-foreground'
                                        }`}
                                    >
                                        {describeCondition(alert.condition)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => onToggleAlert?.(alert.id)}
                                        className={`relative inline-flex h-[18px] w-8 items-center rounded-none transition-colors duration-300 shadow-none-inner ${
                                            alert.active
                                                ? 'bg-success shadow-none-success/20'
                                                : 'bg-muted'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-3.5 w-3.5 transform rounded-none bg-background transition-transform duration-300 shadow-none-md ${
                                                alert.active ? 'translate-x-[15px]' : 'translate-x-[2px]'
                                            }`}
                                        />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteAlert?.(alert.id);
                                        }}
                                        className="opacity-0 -mr-1 rounded-none p-1 text-muted-foreground transition-all duration-300 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2 pl-[1px]">
                                <span
                                    className={`font-mono text-[17px] font-bold tracking-tight transition-colors duration-300 ${
                                        alert.active ? 'text-foreground' : 'text-muted-foreground'
                                    }`}
                                >
                                    {alert.price.toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 5,
                                    })}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
