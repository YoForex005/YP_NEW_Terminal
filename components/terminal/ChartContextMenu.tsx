'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    BarChart2,
    CandlestickChart,
    LineChart,
    ZoomIn,
    ZoomOut,
    Grid3X3,
    RefreshCw,
    Camera,
    ChevronRight,
    Activity,
    AlignJustify,
    Volume2,
    Layers,
    Trash2,
    FileText,
    TrendingUp,
    ArrowUpDown,
    Type,
    Shapes,
    MoveHorizontal,
    MoveVertical,
    Settings,
} from 'lucide-react';

import { useChartSettingsStore } from '@/store/chart-settings-store';

type ChartType = 'Bars' | 'Candles' | 'Hollow Candles' | 'Line';

interface ChartContextMenuProps {
    visible: boolean;
    x: number;
    y: number;
    symbol: string;
    currentChartType: ChartType;
    onClose: () => void;
    onChangeChartType: (type: ChartType) => void;
    onOpenOrder: () => void;
    onBuy: () => void;
    onSell: () => void;
    onOpenIndicators: () => void;
    onTakeScreenshot: () => void;
    onOpenProperties: () => void;
}

const MENU_FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
const C_BG = 'hsl(var(--popover))';
const C_BORDER = 'hsl(var(--border))';
const C_HOVER = 'hsl(var(--accent))';
const C_ACTIVE_BG = 'hsl(var(--primary))';
const C_ACTIVE_FG = 'hsl(var(--primary-foreground))';
const C_ITEM_ACTIVE_BG = 'hsla(var(--primary) / 0.15)';
const C_ITEM_ACTIVE_FG = 'hsl(var(--primary))';
const C_TEXT = 'hsl(var(--foreground))';
const C_HEADER = 'hsl(var(--muted-foreground))';
const C_DISABLED = 'hsla(var(--muted-foreground) / 0.5)';

const TIMEFRAMES: { label: string; minutes: number }[] = [
    { label: 'M1', minutes: 1 },
    { label: 'M5', minutes: 5 },
    { label: 'M15', minutes: 15 },
    { label: 'M30', minutes: 30 },
    { label: 'H1', minutes: 60 },
    { label: 'H4', minutes: 240 },
    { label: 'D1', minutes: 1440 },
    { label: 'W1', minutes: 10080 },
    { label: 'MN', minutes: 43200 },
    { label: 'Y1', minutes: 525600 },
];

const INDICATORS = [
    { name: 'Moving Average (SMA)', type: 'sma' },
    { name: 'Exponential MA (EMA)', type: 'ema' },
    { name: 'Bollinger Bands', type: 'bb' },
    { name: 'RSI', type: 'rsi' },
    { name: 'MACD', type: 'macd' },
    { name: 'Stochastic', type: 'stochastic' },
    { name: 'CCI', type: 'cci' },
    { name: 'Momentum', type: 'momentum' },
    { name: 'ATR', type: 'atr' },
    { name: 'Williams %R', type: 'williams' },
];

const DRAWING_TOOLS = [
    { name: 'Trend Line', tool: 'trendline', icon: <MoveHorizontal size={12} /> },
    { name: 'Horizontal Line', tool: 'hline', icon: <MoveHorizontal size={12} /> },
    { name: 'Vertical Line', tool: 'vline', icon: <MoveVertical size={12} /> },
    { name: 'Fibonacci Retracement', tool: 'fibonacci', icon: <Activity size={12} /> },
    { name: 'Equidistant Channel', tool: 'channel', icon: <AlignJustify size={12} /> },
    { name: 'Text / Annotation', tool: 'text', icon: <Type size={12} /> },
    { name: 'Rectangle', tool: 'rectangle', icon: <Shapes size={12} /> },
];

const Shortcut: React.FC<{ keys: string }> = ({ keys }) => (
    <span style={{ marginLeft: 'auto', paddingLeft: 20, fontSize: 11, color: C_HEADER, flexShrink: 0, opacity: 0.85, letterSpacing: '0.03em' }}>
        {keys}
    </span>
);

const MenuSeparator: React.FC = () => (
    <div style={{ height: 1, background: C_BORDER, margin: '2px 0' }} />
);

interface MenuItemProps {
    icon?: React.ReactNode;
    label: string;
    shortcut?: string;
    onClick?: () => void;
    hasSubmenu?: boolean;
    active?: boolean;
    checked?: boolean;
    disabled?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, shortcut, onClick, hasSubmenu, active, checked, disabled }) => {
    const bg = active ? C_ITEM_ACTIVE_BG : 'transparent';
    const fg = disabled ? C_DISABLED : active ? C_ITEM_ACTIVE_FG : C_TEXT;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '3px 14px 3px 12px',
                minHeight: 24,
                fontSize: 12,
                lineHeight: '16px',
                fontFamily: MENU_FONT,
                fontWeight: 450,
                letterSpacing: '0.015em',
                color: fg,
                background: bg,
                cursor: disabled ? 'default' : 'pointer',
                userSelect: 'none',
                pointerEvents: disabled ? 'none' : undefined,
                transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => { if (!active && !disabled) (e.currentTarget as HTMLDivElement).style.background = C_HOVER; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = active ? C_ITEM_ACTIVE_BG : 'transparent'; }}
            onClick={(e) => { e.stopPropagation(); if (!disabled && onClick) onClick(); }}
        >
            <span style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
                {checked !== undefined && !icon ? (
                    checked ? (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={C_ITEM_ACTIVE_FG} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2 6.5 4.5 9 10 3" />
                        </svg>
                    ) : null
                ) : icon}
            </span>
            <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
            {shortcut && <Shortcut keys={shortcut} />}
            {hasSubmenu && (
                <ChevronRight size={13} style={{ color: C_HEADER, flexShrink: 0, marginLeft: shortcut ? 6 : 'auto', opacity: 0.85 }} />
            )}
        </div>
    );
};

const Submenu: React.FC<{ children: React.ReactNode; label: string; icon?: React.ReactNode; disabled?: boolean }> = ({ children, label, icon, disabled }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const [submenuStyle, setSubmenuStyle] = useState<React.CSSProperties>({ left: '100%', top: 0 });

    const calcPosition = useCallback(() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const submenuWidth = 200;
        const submenuHeight = 320;

        let left: string | number = '100%';
        let right: string | number = 'auto';
        let top: number = 0;

        if (rect.right + submenuWidth > vw) { left = 'auto'; right = '100%'; }
        if (rect.top + submenuHeight > vh) { top = Math.max(0, vh - submenuHeight - rect.top); }

        setSubmenuStyle({ left, right, top });
    }, []);

    return (
        <div
            ref={ref}
            style={{ position: 'relative' }}
            onMouseEnter={() => { if (disabled) return; calcPosition(); setOpen(true); }}
            onMouseLeave={() => setOpen(false)}
        >
            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 14px 3px 12px', minHeight: 24,
                    fontSize: 12, lineHeight: '16px',
                    fontFamily: MENU_FONT, fontWeight: 450, letterSpacing: '0.015em',
                    color: disabled ? C_DISABLED : open ? C_ACTIVE_FG : C_TEXT,
                    background: open ? C_ACTIVE_BG : 'transparent',
                    cursor: disabled ? 'default' : 'pointer', userSelect: 'none',
                    pointerEvents: disabled ? 'none' : undefined,
                    transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                <span style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {icon}
                </span>
                <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
                <ChevronRight size={13} style={{ color: open ? C_ACTIVE_FG : C_HEADER, flexShrink: 0, opacity: 0.85 }} />
            </div>

            {open && (
                <div
                    style={{
                        position: 'absolute',
                        zIndex: 10002,
                        padding: '4px 0',
                        minWidth: 200,
                        background: C_BG,
                        backdropFilter: 'blur(16px) saturate(180%)',
                        border: `1px solid ${C_BORDER}`,
                        borderRadius: 8,
                        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                        ...submenuStyle,
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    );
};

export default function ChartContextMenu({
    visible,
    x,
    y,
    symbol,
    currentChartType,
    onClose,
    onChangeChartType,
    onOpenOrder,
    onBuy,
    onSell,
    onOpenIndicators,
    onTakeScreenshot,
    onOpenProperties,
}: ChartContextMenuProps) {
    const settings = useChartSettingsStore();

    useEffect(() => {
        if (!visible) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [visible, onClose]);

    useEffect(() => {
        if (!visible) return;
        const handler = () => onClose();
        window.addEventListener('wheel', handler, { passive: true });
        return () => window.removeEventListener('wheel', handler);
    }, [visible, onClose]);

    if (!visible || typeof document === 'undefined') return null;

    const MENU_W = 240;
    const MENU_H = 540;
    const clampedX = Math.min(x, window.innerWidth - MENU_W - 4);
    const clampedY = Math.min(y, window.innerHeight - MENU_H - 4);

    const dispatchResolution = (minutes: number) => {
        window.dispatchEvent(new CustomEvent('terminal:set-resolution', { detail: { minutes } }));
        onClose();
    };
    const dispatchRefresh = () => { window.dispatchEvent(new CustomEvent('terminal:chart-refresh')); onClose(); };
    const dispatchZoom = (direction: 'in' | 'out') => {
        window.dispatchEvent(new CustomEvent('terminal:chart-zoom', { detail: { direction } }));
        onClose();
    };
    const dispatchIndicator = (type: string) => {
        window.dispatchEvent(new CustomEvent('terminal:indicator-add', { detail: { type } }));
        onClose();
    };
    const dispatchDrawing = (tool: string) => {
        window.dispatchEvent(new CustomEvent('terminal:drawing-select', { detail: { tool } }));
        onClose();
    };
    const dispatchTemplate = (mode: 'save' | 'load') => {
        window.dispatchEvent(new CustomEvent('terminal:template', { detail: { mode } }));
        onClose();
    };
    const dispatchDOM = () => { window.dispatchEvent(new CustomEvent('terminal:open-dom')); onClose(); };
    const dispatchDeleteIndicators = () => { window.dispatchEvent(new CustomEvent('terminal:delete-indicators')); onClose(); };

    const menu = (
        <div
            style={{
                position: 'fixed',
                zIndex: 10000,
                top: clampedY,
                left: clampedX,
                minWidth: 230,
                padding: '4px 0',
                background: C_BG,
                backdropFilter: 'blur(16px) saturate(180%)',
                border: `1px solid ${C_BORDER}`,
                borderRadius: 10,
                boxShadow: '0 16px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
                fontFamily: MENU_FONT,
                overflow: 'visible',
            }}
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Symbol header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 14px 5px 12px',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: C_HEADER,
                borderBottom: `1px solid ${C_BORDER}`,
                marginBottom: 2,
            }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'hsl(var(--primary))', boxShadow: '0 0 8px hsla(var(--primary) / 0.6)' }} />
                {symbol}
            </div>

            {/* New Order */}
            <MenuItem
                icon={<FileText size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--destructive))' }} />}
                label="New Order"
                shortcut="F9"
                onClick={() => { onOpenOrder(); onClose(); }}
            />

            {/* Trading submenu */}
            <Submenu label="Trading" icon={<TrendingUp size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--info))' }} />}>
                <MenuItem label="Buy Market" onClick={() => { onBuy(); onClose(); }} />
                <MenuItem label="Sell Market" onClick={() => { onSell(); onClose(); }} />
                <MenuSeparator />
                <MenuItem label="Buy Limit" onClick={() => { onOpenOrder(); onClose(); }} />
                <MenuItem label="Sell Limit" onClick={() => { onOpenOrder(); onClose(); }} />
                <MenuItem label="Buy Stop" onClick={() => { onOpenOrder(); onClose(); }} />
                <MenuItem label="Sell Stop" onClick={() => { onOpenOrder(); onClose(); }} />
            </Submenu>

            <MenuSeparator />

            {/* Depth of Market */}
            <MenuItem
                icon={<ArrowUpDown size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                label="Depth Of Market"
                shortcut="Alt+B"
                onClick={dispatchDOM}
            />

            {/* One Click Trading */}
            <MenuItem
                icon={<Activity size={13} strokeWidth={1.5} style={{ color: settings.oneClickTrading ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground))' }} />}
                label="One Click Trading"
                shortcut="Alt+T"
                checked={settings.oneClickTrading}
                onClick={() => { settings.updateSettings({ oneClickTrading: !settings.oneClickTrading }); onClose(); }}
            />

            <MenuSeparator />

            {/* Indicator List (full submenu) + existing modal */}
            <Submenu
                label="Indicator List"
                icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2" width="13" height="12" rx="1" /><polyline points="3 11 5 7.5 7.5 9.5 10 5.5 13 7" strokeWidth="1.3" /></svg>}
            >
                <MenuItem label="Manage Indicators..." onClick={() => { onOpenIndicators(); onClose(); }} />
                <MenuSeparator />
                {INDICATORS.map((ind) => (
                    <MenuItem key={ind.type} label={ind.name} onClick={() => dispatchIndicator(ind.type)} />
                ))}
            </Submenu>

            {/* Object List (drawing tools) */}
            <Submenu
                label="Object List"
                icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeLinecap="round"><line x1="2.5" y1="13.5" x2="13.5" y2="2.5" /><circle cx="2.5" cy="13.5" r="1.5" fill="currentColor" stroke="none" /><circle cx="13.5" cy="2.5" r="1.5" fill="currentColor" stroke="none" /></svg>}
            >
                {DRAWING_TOOLS.map((tool) => (
                    <MenuItem key={tool.tool} icon={tool.icon} label={tool.name} onClick={() => dispatchDrawing(tool.tool)} />
                ))}
            </Submenu>

            <MenuSeparator />

            {/* Chart Types */}
            <MenuItem
                icon={<BarChart2 size={13} strokeWidth={1.5} style={{ color: currentChartType === 'Bars' ? C_ITEM_ACTIVE_FG : 'hsl(var(--muted-foreground))' }} />}
                label="Bar Chart"
                shortcut="Alt+1"
                checked={currentChartType === 'Bars'}
                active={currentChartType === 'Bars'}
                onClick={() => { onChangeChartType('Bars'); onClose(); }}
            />
            <MenuItem
                icon={<CandlestickChart size={13} strokeWidth={1.5} style={{ color: currentChartType === 'Candles' ? C_ITEM_ACTIVE_FG : 'hsl(var(--muted-foreground))' }} />}
                label="Candlesticks"
                shortcut="Alt+2"
                checked={currentChartType === 'Candles'}
                active={currentChartType === 'Candles'}
                onClick={() => { onChangeChartType('Candles'); onClose(); }}
            />
            <MenuItem
                icon={<LineChart size={13} strokeWidth={1.5} style={{ color: currentChartType === 'Line' ? C_ITEM_ACTIVE_FG : 'hsl(var(--muted-foreground))' }} />}
                label="Line Chart"
                shortcut="Alt+3"
                checked={currentChartType === 'Line'}
                active={currentChartType === 'Line'}
                onClick={() => { onChangeChartType('Line'); onClose(); }}
            />

            <MenuSeparator />

            {/* Timeframes */}
            <Submenu
                label="Timeframes"
                icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
            >
                {TIMEFRAMES.map((tf) => (
                    <MenuItem key={tf.label} label={tf.label} onClick={() => dispatchResolution(tf.minutes)} />
                ))}
            </Submenu>

            {/* Templates */}
            <Submenu label="Templates" icon={<Layers size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}>
                <MenuItem label="Save Template..." onClick={() => dispatchTemplate('save')} />
                <MenuItem label="Load Template..." onClick={() => dispatchTemplate('load')} />
            </Submenu>

            {/* Refresh */}
            <MenuItem
                icon={<RefreshCw size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                label="Refresh"
                onClick={dispatchRefresh}
            />

            <MenuSeparator />

            {/* Grid */}
            <MenuItem
                icon={<Grid3X3 size={13} strokeWidth={1.5} style={{ color: settings.showGridLines ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground))' }} />}
                label="Grid"
                shortcut="Ctrl+G"
                checked={settings.showGridLines}
                onClick={() => { settings.updateSettings({ showGridLines: !settings.showGridLines }); onClose(); }}
            />

            {/* Auto Scroll */}
            <MenuItem
                icon={<RefreshCw size={13} strokeWidth={1.5} style={{ color: settings.autoScroll ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground))' }} />}
                label="Auto Scroll"
                checked={settings.autoScroll}
                onClick={() => {
                    const next = !settings.autoScroll;
                    settings.updateSettings({ autoScroll: next });
                    if (next) window.dispatchEvent(new CustomEvent('terminal:chart-scroll-realtime'));
                    onClose();
                }}
            />

            {/* Chart Shift */}
            <MenuItem
                icon={<AlignJustify size={13} strokeWidth={1.5} style={{ color: settings.chartShift ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground))' }} />}
                label="Chart Shift"
                checked={settings.chartShift}
                onClick={() => { settings.updateSettings({ chartShift: !settings.chartShift }); onClose(); }}
            />

            <MenuSeparator />

            {/* Volumes */}
            <MenuItem
                icon={<Volume2 size={13} strokeWidth={1.5} style={{ color: settings.showVolume ? 'hsl(var(--info))' : 'hsl(var(--muted-foreground))' }} />}
                label="Volumes"
                shortcut="Ctrl+K"
                checked={settings.showVolume}
                onClick={() => { settings.updateSettings({ showVolume: !settings.showVolume }); onClose(); }}
            />

            <MenuSeparator />

            {/* Zoom */}
            <MenuItem
                icon={<ZoomIn size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                label="Zoom In"
                shortcut="+"
                onClick={() => dispatchZoom('in')}
            />
            <MenuItem
                icon={<ZoomOut size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                label="Zoom Out"
                shortcut="-"
                onClick={() => dispatchZoom('out')}
            />

            {/* Delete Indicators Window */}
            <MenuItem
                icon={<Trash2 size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                label="Delete Indicators Window"
                onClick={dispatchDeleteIndicators}
            />

            <MenuSeparator />

            {/* Save as Picture */}
            <MenuItem
                icon={<Camera size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                label="Save as Picture"
                onClick={() => { onTakeScreenshot(); onClose(); }}
            />

            <MenuSeparator />

            {/* Properties */}
            <MenuItem
                icon={<Settings size={13} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />}
                label="Properties"
                shortcut="F8"
                onClick={() => { onOpenProperties(); onClose(); }}
            />
        </div>
    );

    return createPortal(
        <>
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent' }}
                onMouseDown={onClose}
                onContextMenu={(e) => { e.preventDefault(); onClose(); }}
            />
            {menu}
        </>,
        document.body,
    );
}
