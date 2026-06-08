'use client';

import React, { useState } from 'react';
import { useChartSettingsStore, type ColorScheme, type Mt5ChartType, type Mt5Colors } from '@/store/chart-settings-store';

interface ChartSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    symbol?: string;
    timeframe?: string;
}

type Tab = 'Common' | 'Show' | 'Colors';

export default function ChartSettingsModal({ isOpen, onClose, symbol = 'EURUSD', timeframe = 'M1' }: ChartSettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('Common');
    const settings = useChartSettingsStore();

    if (!isOpen) return null;

    const setField = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
        settings.updateSettings({ [key]: value } as any);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div
                className="relative bg-card border border-border rounded shadow-2xl flex flex-col pointer-events-auto select-none"
                style={{ width: 680, height: 420 }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                    <span className="text-xs font-medium text-foreground">Properties of {symbol},{timeframe}</span>
                    <div className="flex items-center gap-1">
                        <button className="w-6 h-6 flex items-center justify-center hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors">
                            <span className="text-xs font-serif">?</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="w-6 h-6 flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground rounded text-muted-foreground transition-colors"
                        >
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M11 1L1 11M1 1L11 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-1 overflow-hidden p-3 gap-4">
                    {/* Preview */}
                    <div className="w-[310px] border border-border bg-black rounded flex flex-col p-1 pl-0">
                        <div className="flex-1 border border-border relative m-1 rounded-sm overflow-hidden" style={{ backgroundColor: settings.colors.background }}>
                            <span className="absolute top-1 left-1 text-[10px] font-mono z-10 px-1" style={{ color: settings.colors.foreground, background: 'rgba(0,0,0,0.6)' }}>
                                {symbol},{timeframe}: Demo Asset
                            </span>
                            <div className="absolute inset-0 flex items-end pointer-events-none">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="flex-1 h-full border-r border-dashed" style={{ borderColor: settings.colors.grid }}></div>
                                ))}
                            </div>
                            {/* Mock candles */}
                            <div className="absolute inset-0 flex items-end justify-around px-3 pb-6 gap-1">
                                {[
                                    { up: true, h: 60 }, { up: false, h: 40 }, { up: true, h: 75 }, { up: true, h: 50 },
                                    { up: false, h: 65 }, { up: true, h: 55 }, { up: false, h: 45 }, { up: true, h: 70 },
                                ].map((c, i) => (
                                    <div key={i} style={{ height: `${c.h}%`, width: 10, backgroundColor: c.up ? settings.colors.bullCandle : settings.colors.bearCandle, border: `1px solid ${c.up ? settings.colors.barUp : settings.colors.barDown}` }} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tabs area */}
                    <div className="flex-1 flex flex-col pt-1 pr-1">
                        <div className="flex gap-4 border-b border-transparent mb-1 pl-1">
                            {(['Common', 'Show', 'Colors'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-1 py-0.5 text-xs transition-colors ${activeTab === tab ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto pl-1 pr-2 no-scrollbar">
                            {activeTab === 'Common' && (
                                <div className="flex gap-2 h-full pt-1 pr-1">
                                    <div className="flex flex-col gap-2 flex-1">
                                        <div className="flex flex-col gap-[3px] p-2 border border-border rounded-sm mt-2">
                                            {(['Bar', 'Candlesticks', 'Line'] as Mt5ChartType[]).map((t) => (
                                                <label key={t} className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="radio"
                                                        name="chartType"
                                                        className="accent-primary bg-muted border-border"
                                                        checked={settings.mt5ChartType === t}
                                                        onChange={() => setField('mt5ChartType', t)}
                                                    />
                                                    <span className="text-[12px] text-foreground">{t === 'Bar' ? 'Bar chart' : t === 'Line' ? 'Line chart' : 'Candlesticks'}</span>
                                                </label>
                                            ))}
                                        </div>
                                        <div className="flex flex-col gap-[3px] p-2 py-3 border border-border rounded-sm mt-1">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" className="accent-primary bg-muted border-border" checked={settings.chartOnForeground} onChange={(e) => setField('chartOnForeground', e.target.checked)} />
                                                <span className="text-[12px] text-foreground">Chart on foreground</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" className="accent-primary bg-muted border-border" checked={settings.chartShift} onChange={(e) => setField('chartShift', e.target.checked)} />
                                                <span className="text-[12px] text-foreground">Chart shift</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" className="accent-primary bg-muted border-border" checked={settings.autoScroll} onChange={(e) => setField('autoScroll', e.target.checked)} />
                                                <span className="text-[12px] text-foreground">Chart auto scroll</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 flex-[1.2] border border-border rounded p-3 pt-4 relative mt-2">
                                        <span className="absolute -top-[7px] left-3 bg-card px-1 text-[11px] font-medium text-foreground">Scale</span>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="accent-primary bg-muted border-border" checked={settings.scaleFixOneToOne} onChange={(e) => setField('scaleFixOneToOne', e.target.checked)} />
                                            <span className="text-[12px] text-foreground">Scale fix one to one</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="accent-primary bg-muted border-border" checked={settings.scaleFix} onChange={(e) => setField('scaleFix', e.target.checked)} />
                                            <span className="text-[12px] text-foreground">Scale fix</span>
                                        </label>

                                        <div className={`flex flex-col gap-[6px] pl-[26px] mt-1 transition-opacity ${!settings.scaleFix ? 'opacity-30 pointer-events-none' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={settings.fixedMaximum}
                                                    onChange={(e) => setField('fixedMaximum', Number(e.target.value))}
                                                    className="w-[80px] bg-muted border border-border rounded-sm px-1.5 py-[1px] text-[12px] text-foreground focus:outline-none focus:border-primary"
                                                />
                                                <span className="text-[12px] text-foreground">Fixed maximum</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={settings.fixedMinimum}
                                                    onChange={(e) => setField('fixedMinimum', Number(e.target.value))}
                                                    className="w-[80px] bg-muted border border-border rounded-sm px-1.5 py-[1px] text-[12px] text-foreground focus:outline-none focus:border-primary"
                                                />
                                                <span className="text-[12px] text-foreground">Fixed minimum</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'Show' && (
                                <div className="grid grid-cols-1 gap-1.5 py-2">
                                    {([
                                        { key: 'showTicker', label: 'Show ticker' },
                                        { key: 'showOHLC', label: 'Show OHLC' },
                                        { key: 'showQuickTradingButtons', label: 'Show quick trading buttons' },
                                        { key: 'showBidPriceLine', label: 'Show bid price line' },
                                        { key: 'showAskPriceLine', label: 'Show ask price line' },
                                        { key: 'showLastPriceLine', label: 'Show last price line' },
                                        { key: 'showPeriodSeparators', label: 'Show period separators' },
                                        { key: 'showGridLines', label: 'Show grid' },
                                        { key: 'showTickVolumes', label: 'Show tick volumes' },
                                        { key: 'showRealVolumes', label: 'Show real volumes' },
                                        { key: 'showObjectDescriptions', label: 'Show object descriptions' },
                                        { key: 'showTradeLevels', label: 'Show trade levels' },
                                        { key: 'showTradeHistory', label: 'Show trade history' },
                                    ] as const).map(({ key, label }) => {
                                        const checked = settings[key] as boolean;
                                        return (
                                            <div
                                                key={key}
                                                className="flex items-center gap-2 cursor-pointer group hover:bg-accent px-2 py-0.5 -mx-2 rounded transition-colors"
                                                onClick={() => setField(key, !checked as any)}
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="accent-primary bg-muted border-border cursor-pointer w-3.5 h-3.5"
                                                    checked={checked}
                                                    onChange={(e) => { e.stopPropagation(); setField(key, e.target.checked as any); }}
                                                />
                                                <span className="text-[13px] text-foreground group-hover:text-foreground transition-colors">{label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {activeTab === 'Colors' && (
                                <div className="grid grid-cols-[100px_1fr] items-center gap-y-[5px] gap-x-2 py-2">
                                    <span className="text-[12px] text-foreground text-right">Scheme:</span>
                                    <select
                                        value={settings.colorScheme}
                                        onChange={(e) => settings.applyPresetScheme(e.target.value as ColorScheme)}
                                        className="bg-muted border border-border text-[12px] px-2 py-0.5 rounded w-full text-foreground outline-none focus:border-primary"
                                    >
                                        <option value="Green on Black">Green on Black</option>
                                        <option value="Black on White">Black on White</option>
                                        <option value="Yellow on Black">Yellow on Black</option>
                                        <option value="Custom">Custom</option>
                                    </select>

                                    <div className="col-span-2 h-[1px] bg-border my-1"></div>

                                    {([
                                        { label: 'Background', key: 'background' },
                                        { label: 'Foreground', key: 'foreground' },
                                        { label: 'Grid', key: 'grid' },
                                        { label: 'Bar up', key: 'barUp' },
                                        { label: 'Bar down', key: 'barDown' },
                                        { label: 'Bull candle', key: 'bullCandle' },
                                        { label: 'Bear candle', key: 'bearCandle' },
                                        { label: 'Line chart', key: 'lineChart' },
                                        { label: 'Volumes', key: 'volumes' },
                                        { label: 'Bid price line', key: 'bidPriceLine' },
                                        { label: 'Ask price line', key: 'askPriceLine' },
                                        { label: 'Last price line', key: 'lastPriceLine' },
                                        { label: 'Stop levels', key: 'stopLevels' },
                                    ] as const).map((c) => {
                                        const colorVal = settings.colors[c.key as keyof Mt5Colors];
                                        const isRgba = typeof colorVal === 'string' && colorVal.startsWith('rgba');
                                        return (
                                            <React.Fragment key={c.label}>
                                                <span className="text-[12px] text-foreground text-right">{c.label}:</span>
                                                <label className="flex items-center gap-2 bg-muted border border-border rounded px-1.5 py-[2px] cursor-pointer hover:border-foreground/50 relative">
                                                    <input
                                                        type="color"
                                                        value={isRgba ? '#ffffff' : colorVal}
                                                        onChange={(e) => settings.updateColor(c.key as keyof Mt5Colors, e.target.value)}
                                                        className="absolute opacity-0 w-0 h-0"
                                                    />
                                                    <div className="w-3.5 h-3.5 rounded-sm border border-border shadow-sm flex-shrink-0" style={{ backgroundColor: colorVal }}></div>
                                                    <span className="text-[12px] text-foreground w-full truncate">{colorVal}</span>
                                                    <svg width="8" height="5" viewBox="0 0 10 6" fill="none" className="ml-0.5 text-muted-foreground flex-shrink-0">
                                                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </label>
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 px-3 py-2 border-t border-border rounded-b-lg">
                    <button
                        onClick={onClose}
                        className="px-6 py-1 text-xs bg-muted hover:bg-accent border border-border hover:border-foreground/50 text-foreground hover:text-foreground rounded-sm transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onClose}
                        className="px-7 py-1 text-xs bg-muted hover:bg-accent border border-border hover:border-foreground/50 text-foreground hover:text-foreground rounded-sm transition-colors"
                    >
                        OK
                    </button>
                    <button
                        className="px-5 py-1 text-xs bg-muted border border-border text-muted-foreground rounded-sm ml-1 opacity-50 cursor-not-allowed"
                        disabled
                    >
                        Help
                    </button>
                </div>
            </div>
        </div>
    );
}
