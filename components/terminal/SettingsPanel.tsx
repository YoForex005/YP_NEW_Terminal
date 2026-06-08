'use client';

import React, { useState } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';

interface SettingsPanelProps {
    onClose?: () => void;
    currentTheme?: string;
    onSetTheme?: (theme: string) => void;
}

const Toggle = ({ active, onChange }: { active: boolean; onChange: () => void }) => (
    <button
        onClick={onChange}
        className={`relative inline-flex h-[22px] w-[42px] flex-shrink-0 items-center rounded-none transition-colors duration-200 ease-in-out focus:outline-none ${active ? 'bg-primary' : 'bg-muted'}`}
    >
        <span
            className={`inline-block h-[16px] w-[16px] transform rounded-none shadow-none-sm transition duration-200 ease-in-out ${active ? 'translate-x-[22px] bg-primary-foreground' : 'translate-x-[3px] bg-muted-foreground'}`}
        />
    </button>
);

const Checkbox = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) => (
    <label className="flex items-center gap-3 cursor-pointer group py-0.5">
        <div className={`w-[16px] h-[16px] rounded-[4px] flex items-center justify-center border-[1.5px] transition-all duration-150 ${checked ? 'bg-primary border-primary' : 'border-muted-foreground/40 bg-transparent group-hover:border-muted-foreground'}`}>
            {checked && <Check size={10} className="text-primary-foreground" strokeWidth={3} />}
        </div>
        <span className="text-[13px] text-foreground">{label}</span>
    </label>
);

const Select = ({ value, options, onChange, direction = 'down' }: { value: string; options: string[]; onChange?: (v: string) => void, direction?: 'up' | 'down' }) => {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState(value);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={`w-full flex items-center justify-between px-3 h-[40px] transition-all duration-300 rounded-[10px] border outline-none text-[13px] ${open ? 'bg-background/80 backdrop-blur-md border-primary/50 shadow-none-[0_0_15px_rgba(var(--primary),0.15)] text-foreground' : 'bg-background border-input hover:border-muted-foreground text-foreground hover:bg-white/5'}`}
            >
                <span className="font-semibold tracking-wide">{selected}</span>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180 text-primary' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className={`absolute ${direction === 'up' ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'} left-0 w-full bg-popover/80 backdrop-blur-xl border border-white/10 rounded-[10px] shadow-none-[0_8px_32px_rgba(0,0,0,0.5)] z-50 p-1.5 overflow-hidden animate-dropdown-in flex flex-col gap-1`}>
                        {options.map(opt => (
                            <button
                                key={opt}
                                onClick={() => { setSelected(opt); setOpen(false); onChange?.(opt); }}
                                className={`w-full px-4 py-2.5 text-left text-[13px] transition-all duration-300 rounded-[6px] ${selected === opt ? 'bg-success text-success-foreground font-bold shadow-none-[0_2px_10px_rgba(46,189,133,0.3)]' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default function SettingsPanel({ onClose, onSetTheme }: SettingsPanelProps) {
    const [toggles, setToggles] = useState({
        signals: false,
        hmrPeriods: true,
        chartPriceAlerts: true,
        openPositions: true,
        tpSlStopLimit: false,
        ecCalendar: true,
        soundPriceAlerts: false,
        soundClosing: false,
        tpSlAuto: true,
    });

    const [impacts, setImpacts] = useState({
        high: true,
        middle: false,
        low: false,
        lowest: false,
    });

    const handleToggle = (key: keyof typeof toggles) => {
        setToggles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleImpact = (key: keyof typeof impacts) => {
        setImpacts(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="flex flex-col h-full text-[13px] bg-card">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 h-[50px] flex-shrink-0">
                <span className="text-[13px] font-bold text-primary uppercase tracking-wider">Settings</span>
                {onClose && (
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-[6px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-5 flex flex-col gap-7">

                {/* Show on chart */}
                <div className="flex flex-col gap-4">
                    <span className="text-[11px] font-bold text-primary/70 uppercase tracking-widest">Show on chart</span>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">Signals</span>
                        <Toggle active={toggles.signals} onChange={() => handleToggle('signals')} />
                    </div>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">HMR periods</span>
                        <Toggle active={toggles.hmrPeriods} onChange={() => handleToggle('hmrPeriods')} />
                    </div>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">Price alerts</span>
                        <Toggle active={toggles.chartPriceAlerts} onChange={() => handleToggle('chartPriceAlerts')} />
                    </div>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">Open positions</span>
                        <Toggle active={toggles.openPositions} onChange={() => handleToggle('openPositions')} />
                    </div>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">TP / SL / Stop / Limit</span>
                        <Toggle active={toggles.tpSlStopLimit} onChange={() => handleToggle('tpSlStopLimit')} />
                    </div>

                    {/* Economic Calendar Sub-section */}
                    <div className="flex flex-col gap-3 mt-1">
                        <div className="flex items-center justify-between py-0.5">
                            <span className="text-foreground">Economic calendar</span>
                            <Toggle active={toggles.ecCalendar} onChange={() => handleToggle('ecCalendar')} />
                        </div>

                        <div className="pl-6 flex flex-col gap-2.5 mt-0.5">
                            <Checkbox label="High impact" checked={impacts.high} onChange={() => handleImpact('high')} />
                            <Checkbox label="Middle impact" checked={impacts.middle} onChange={() => handleImpact('middle')} />
                            <Checkbox label="Low impact" checked={impacts.low} onChange={() => handleImpact('low')} />
                            <Checkbox label="Lowest impact" checked={impacts.lowest} onChange={() => handleImpact('lowest')} />
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* Sound effects */}
                <div className="flex flex-col gap-4">
                    <span className="text-[11px] font-bold text-primary/70 uppercase tracking-widest">Sound effects</span>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">Price alerts</span>
                        <Toggle active={toggles.soundPriceAlerts} onChange={() => handleToggle('soundPriceAlerts')} />
                    </div>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">Closing by TP / SL / SO</span>
                        <Toggle active={toggles.soundClosing} onChange={() => handleToggle('soundClosing')} />
                    </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* Trading settings */}
                <div className="flex flex-col gap-4">
                    <span className="text-[11px] font-bold text-primary/70 uppercase tracking-widest">Trading settings</span>

                    <div className="flex items-center justify-between py-0.5">
                        <span className="text-foreground">Set TP/SL automatically</span>
                        <Toggle active={toggles.tpSlAuto} onChange={() => handleToggle('tpSlAuto')} />
                    </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* Open order mode */}
                <div className="flex flex-col gap-2.5">
                    <span className="text-[11px] font-bold text-primary/70 uppercase tracking-widest">Open order mode</span>
                    <Select value="One-click form" options={['One-click form', 'Regular form']} />
                </div>

                {/* Price source */}
                <div className="flex flex-col gap-2.5">
                    <span className="text-[11px] font-bold text-primary/70 uppercase tracking-widest">Price source</span>
                    <Select value="Bid" options={['Bid', 'Ask']} />
                </div>

                <div className="flex flex-col gap-2.5">
                    <span className="text-[11px] font-bold text-primary/70 uppercase tracking-widest">Appearance</span>
                    <Select
                        value="Always dark"
                        options={['Always dark']}
                        onChange={(v) => {
                            if (onSetTheme) {
                                onSetTheme('dark');
                            }
                        }}
                        direction="up"
                    />
                </div>

                {/* Time zone */}
                <div className="flex flex-col gap-2.5 pb-6">
                    <span className="text-[11px] font-bold text-primary/70 uppercase tracking-widest">Time zone</span>
                    <Select value="UTC" options={['UTC', 'New York', 'London', 'Tokyo']} direction="up" />
                </div>

            </div>
        </div>
    );
}



