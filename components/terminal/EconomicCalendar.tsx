'use client';

import React from 'react';
import { CalendarClock, X } from 'lucide-react';

interface EconomicCalendarProps {
    onClose?: () => void;
}

export default function EconomicCalendar({ onClose }: EconomicCalendarProps) {
    return (
        <div className="flex h-full flex-col bg-card select-none">
            <div className="flex h-[50px] flex-shrink-0 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-2.5">
                    <span className="text-[13px] font-bold uppercase tracking-wider text-primary">Economic Calendar</span>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            <div className="flex flex-1 items-center justify-center px-6 py-8">
                <div className="max-w-[280px] text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/70">
                        <CalendarClock size={24} className="text-muted-foreground" />
                    </div>
                    <h4 className="mt-4 text-sm font-bold text-foreground">No live calendar feed connected</h4>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                        This panel no longer uses sample macro events. Connect a real economic calendar source before showing releases here.
                    </p>
                </div>
            </div>
        </div>
    );
}
