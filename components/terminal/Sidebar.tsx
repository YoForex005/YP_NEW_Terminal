'use client';

import {
    List,
    Calendar,
    Settings,
    Sun,
    Moon,
    Bell,
    TrendingUp,
    Activity
} from 'lucide-react';
import { useTheme } from 'next-themes';

interface SidebarProps {
    activePanel: 'instruments' | 'calendar' | 'alerts' | 'settings' | 'signals' | 'positions' | 'more' | 'market-status' | null;
    onTogglePanel: (panel: 'instruments' | 'calendar' | 'alerts' | 'settings' | 'signals' | 'positions' | 'more' | 'market-status') => void;
}

export default function Sidebar({ activePanel, onTogglePanel }: SidebarProps) {
    const { setTheme } = useTheme();

    const getButtonClass = (panel: 'instruments' | 'calendar' | 'alerts' | 'settings' | 'signals' | 'positions' | 'more' | 'market-status') => {
        const isActive = activePanel === panel;
        return `relative w-8 h-8 flex items-center justify-center rounded-[4px] transition-all duration-200 outline-none border ${
            isActive
                ? 'text-foreground bg-accent border-border/80'
                : 'text-muted-foreground hover:text-foreground bg-transparent hover:bg-accent/40 border-border/30 hover:border-border/60'
        }`;
    };

    return (
        <aside className="w-[44px] h-full flex flex-col items-center py-4 bg-card z-[90] flex-shrink-0 border-r border-border">
            {/* Top Menu Icon - Toggles the Panel */}
            <div className="relative group/sidebarbtn flex-shrink-0 mb-2">
                <button
                    onClick={() => onTogglePanel('instruments')}
                    className={getButtonClass('instruments')}
                >
                        {activePanel === 'instruments' && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-[4px]" />
                        )}
                    <List size={18} strokeWidth={1.5} />
                </button>
                <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-none font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/sidebarbtn:opacity-100 transition-opacity z-[9999] shadow-md border border-border [transition-delay:400ms]">
                    <div className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-2 h-2 bg-popover border-t border-l border-border -rotate-45 pointer-events-none"></div>
                    <span className="relative z-10">Instruments</span>
                </div>
            </div>

            {/* Navigation Icons */}
            <div className="flex flex-col items-center gap-2 w-full">
                {/* Calendar */}
                <div className="relative group/sidebarbtn flex-shrink-0">
                    <button 
                        onClick={() => onTogglePanel('calendar')}
                        className={getButtonClass('calendar')}
                    >
                        {activePanel === 'calendar' && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-[4px]" />
                        )}
                        <Calendar size={18} strokeWidth={1.5} />
                    </button>
                    <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-[4px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/sidebarbtn:opacity-100 transition-opacity z-[9999] shadow-md border border-border [transition-delay:400ms]">
                        <div className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-2 h-2 bg-popover border-t border-l border-border -rotate-45 pointer-events-none"></div>
                        <span className="relative z-10">Economic calendar</span>
                    </div>
                </div>

                {/* Alerts */}
                <div className="relative group/sidebarbtn flex-shrink-0">
                    <button 
                        onClick={() => onTogglePanel('alerts')}
                        className={getButtonClass('alerts')}
                    >
                        {activePanel === 'alerts' && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-[4px]" />
                        )}
                        <Bell size={18} strokeWidth={1.5} />
                    </button>
                    <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-[4px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/sidebarbtn:opacity-100 transition-opacity z-[9999] shadow-md border border-border [transition-delay:400ms]">
                        <div className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-2 h-2 bg-popover border-t border-l border-border -rotate-45 pointer-events-none"></div>
                        <span className="relative z-10">Price Alerts</span>
                    </div>
                </div>

                {/* Signals */}
                <div className="relative group/sidebarbtn flex-shrink-0">
                    <button 
                        onClick={() => onTogglePanel('signals')}
                        className={getButtonClass('signals')}
                    >
                        {activePanel === 'signals' && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-[4px]" />
                        )}
                        <TrendingUp size={18} strokeWidth={1.5} />
                    </button>
                    <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-[4px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/sidebarbtn:opacity-100 transition-opacity z-[9999] shadow-md border border-border [transition-delay:400ms]">
                        <div className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-2 h-2 bg-popover border-t border-l border-border -rotate-45 pointer-events-none"></div>
                        <span className="relative z-10">Signals</span>
                    </div>
                </div>

                {/* Market Status */}
                <div className="relative group/sidebarbtn flex-shrink-0">
                    <button
                        onClick={() => onTogglePanel('market-status')}
                        className={getButtonClass('market-status')}
                    >
                        {activePanel === 'market-status' && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-[4px]" />
                        )}
                        <Activity size={18} strokeWidth={1.5} />
                    </button>
                    <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-[4px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/sidebarbtn:opacity-100 transition-opacity z-[9999] shadow-md border border-border [transition-delay:400ms]">
                        <div className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-2 h-2 bg-popover border-t border-l border-border -rotate-45 pointer-events-none"></div>
                        <span className="relative z-10">Market Status</span>
                    </div>
                </div>

                <div className="relative group/sidebarbtn flex-shrink-0">
                    <button 
                        onClick={() => onTogglePanel('settings')}
                        className={getButtonClass('settings')}
                    >
                        {activePanel === 'settings' && (
                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-l-[4px]" />
                        )}
                        <Settings size={18} strokeWidth={1.5} />
                    </button>
                    <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-[4px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/sidebarbtn:opacity-100 transition-opacity z-[9999] shadow-md border border-border [transition-delay:400ms]">
                        <div className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-2 h-2 bg-popover border-t border-l border-border -rotate-45 pointer-events-none"></div>
                        <span className="relative z-10">Settings</span>
                    </div>
                </div>

                {/* Theme is locked dark to prevent light fallback surfaces. */}
                <div className="relative group/sidebarbtn flex-shrink-0 mt-2">
                    <button
                        onClick={() => setTheme('dark')}
                        className="w-8 h-8 flex items-center justify-center rounded-[4px] border border-border/30 hover:border-border/60 text-muted-foreground hover:text-foreground bg-transparent hover:bg-accent/40 transition-all outline-none"
                    >
                        <div className="relative w-5 h-5 flex items-center justify-center">
                            {/* Sun Icon */}
                            <Sun
                                size={16}
                                strokeWidth={1.5}
                                className="absolute rotate-0 scale-100 opacity-100 transition-all duration-300"
                            />
                            {/* Moon Icon */}
                            <Moon
                                size={16}
                                strokeWidth={1.5}
                                className="absolute -rotate-90 scale-0 opacity-0 transition-all duration-300"
                            />
                        </div>
                    </button>
                    <div className="absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-[4px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/sidebarbtn:opacity-100 transition-opacity z-[9999] shadow-md border border-border [transition-delay:400ms]">
                        <div className="absolute top-1/2 -translate-y-1/2 left-[-5px] w-2 h-2 bg-popover border-t border-l border-border -rotate-45 pointer-events-none"></div>
                        <span className="relative z-10">Dark mode locked</span>
                    </div>
                </div>
            </div>

            <div className="flex-1" />
        </aside>
    );
}
