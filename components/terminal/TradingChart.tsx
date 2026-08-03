'use client';

import type { Instrument } from '@/lib/terminal/types';
import dynamic from 'next/dynamic';
import { ChevronRight, ChevronLeft, Plus, Minus, ChevronDown, Settings, Square, Camera, Maximize } from 'lucide-react';
import { useTheme } from 'next-themes';
import { memo, useMemo, useState, useRef, useEffect, useCallback, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChartCandlesIcon, ChartHlcBarsIcon, ChartHollowCandlesIcon, ChartLineIcon } from './ChartIcons';
import { usePriceBySymbol } from '@/store/webtrader-store';
import { DEFAULT_CHART_TYPES, type ChartType } from '@/lib/terminal/chart-visual-config';

function ChartPaneLoadingFallback() {
    return (
        <div className="flex h-full min-h-[260px] flex-col overflow-hidden bg-card" aria-label="Loading chart">
            <style>{`
                @keyframes chartShimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @keyframes chartPulse {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.6; }
                }
                .chart-skel-bar {
                    background: hsl(var(--muted) / 0.4);
                    border-radius: 2px;
                }
                .chart-skel-shimmer {
                    background: linear-gradient(90deg, transparent 25%, hsl(var(--muted) / 0.15) 50%, transparent 75%);
                    background-size: 200% 100%;
                    animation: chartShimmer 2s ease-in-out infinite;
                }
                .chart-skel-pulse {
                    animation: chartPulse 2.5s ease-in-out infinite;
                }
            `}</style>
            {/* Toolbar */}
            <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-3">
                    <div className="h-5 w-5 chart-skel-bar chart-skel-shimmer" />
                    <div className="h-4 w-24 chart-skel-bar chart-skel-shimmer" />
                    <div className="h-3 w-14 chart-skel-bar" style={{ opacity: 0.3 }} />
                </div>
                <div className="hidden items-center gap-2 md:flex">
                    <div className="h-7 w-[72px] rounded border border-border chart-skel-bar" style={{ background: 'rgba(242,54,69,0.08)' }} />
                    <div className="h-3 w-6 chart-skel-bar" />
                    <div className="h-7 w-[72px] rounded border border-border chart-skel-bar" style={{ background: 'rgba(59,130,246,0.08)' }} />
                </div>
            </div>
            {/* Chart canvas */}
            <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
                {/* Grid */}
                <div className="absolute inset-0 opacity-[0.1]" style={{
                    backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
                    backgroundSize: '60px 44px',
                }} />
                {/* Faint uptrend candle silhouettes */}
                <svg
                    className="absolute chart-skel-pulse"
                    style={{ bottom: 36, left: 16, right: 52, height: '50%', width: 'calc(100% - 68px)' }}
                    viewBox="0 0 600 160"
                    preserveAspectRatio="none"
                >
                    {[
                        { x: 20, w: [85,50], b: [78,55] },
                        { x: 45, w: [80,45], b: [72,50] },
                        { x: 70, w: [70,38], b: [62,42] },
                        { x: 95, w: [65,40], b: [58,45] },
                        { x: 120, w: [58,30], b: [50,34] },
                        { x: 145, w: [52,25], b: [45,28] },
                        { x: 170, w: [48,20], b: [40,24] },
                        { x: 195, w: [42,22], b: [36,26] },
                        { x: 220, w: [38,15], b: [32,18] },
                        { x: 245, w: [35,10], b: [28,14] },
                        { x: 270, w: [30,12], b: [24,16] },
                        { x: 295, w: [32,8], b: [26,11] },
                        { x: 320, w: [25,5], b: [20,8] },
                        { x: 345, w: [22,8], b: [18,11] },
                        { x: 370, w: [18,3], b: [14,6] },
                        { x: 395, w: [20,0], b: [16,3] },
                        { x: 420, w: [15,2], b: [12,5] },
                        { x: 445, w: [12,0], b: [9,2] },
                        { x: 470, w: [10,0], b: [7,2] },
                        { x: 495, w: [8,0], b: [5,1] },
                        { x: 520, w: [6,0], b: [4,1] },
                        { x: 545, w: [5,0], b: [3,0] },
                        { x: 570, w: [3,0], b: [2,0] },
                    ].map((c, i) => (
                        <g key={i}>
                            <line x1={c.x} y1={160 - c.w[0]} x2={c.x} y2={160 - c.w[1]} stroke="currentColor" strokeWidth="1" opacity="0.12" />
                            <rect x={c.x - 4} y={160 - c.b[0]} width="8" height={Math.max(c.b[0] - c.b[1], 2)}
                                fill={c.b[0] > c.b[1] ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)'} rx="1" />
                        </g>
                    ))}
                </svg>
                {/* Price axis */}
                <div className="absolute right-0 top-0 bottom-9 w-12 border-l border-border/30 flex flex-col justify-around py-4 px-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-2.5 w-9 self-end chart-skel-bar" style={{ opacity: 0.2 }} />
                    ))}
                </div>
            </div>
            {/* Timeframe bar */}
            <div className="h-8 flex-shrink-0 border-t border-border bg-card flex items-center px-3 gap-1">
                {['1m','5m','15m','1h','4h','1D'].map((tf, i) => (
                    <span key={i} className="text-[11px] px-2 py-1 rounded" style={{
                        color: i === 0 ? 'hsl(var(--primary) / 0.4)' : 'hsl(var(--muted-foreground) / 0.2)',
                        fontWeight: i === 0 ? 600 : 400,
                    }}>{tf}</span>
                ))}
            </div>
        </div>
    );
}


const KlineChartContainer = dynamic(() => import('./KlineChartContainer'), {
    ssr: false,
    loading: () => <ChartPaneLoadingFallback />,
});

const IndicatorsModal = dynamic(() => import('./IndicatorsModal'), {
    ssr: false,
    loading: () => null,
});
const CompareSymbolModal = dynamic(() => import('./CompareSymbolModal'), {
    ssr: false,
    loading: () => null,
});
const ChartSettingsModal = dynamic(() => import('./ChartSettingsModal'), {
    ssr: false,
    loading: () => null,
});
const ChartContextMenu = dynamic(() => import('./ChartContextMenu'), {
    ssr: false,
    loading: () => null,
});

const CHART_RUNTIME_FALLBACK_DELAY_MS = 140;
const CHART_RUNTIME_IDLE_TIMEOUT_MS = 1_200;
const SECONDARY_PANE_HYDRATION_STAGGER_MS = 180;

function scheduleChartRuntimeMount(callback: () => void, delayMs = 0) {
    if (typeof window === 'undefined') {
        return () => {};
    }

    let cancelled = false;
    let frameId: number | null = null;
    let timeoutId: number | null = null;
    let idleId: number | null = null;
    const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
    };

    const run = () => {
        if (!cancelled) {
            callback();
        }
    };

    const queueRuntime = () => {
        if (cancelled) return;

        if (idleWindow.requestIdleCallback) {
            idleId = idleWindow.requestIdleCallback(run, { timeout: CHART_RUNTIME_IDLE_TIMEOUT_MS });
            return;
        }

        timeoutId = window.setTimeout(run, CHART_RUNTIME_FALLBACK_DELAY_MS);
    };

    frameId = window.requestAnimationFrame(() => {
        if (delayMs > 0) {
            timeoutId = window.setTimeout(queueRuntime, delayMs);
            return;
        }

        queueRuntime();
    });

    return () => {
        cancelled = true;
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (idleId !== null) idleWindow.cancelIdleCallback?.(idleId);
    };
}

export interface ChartHistoryStatus {
    symbol: string;
    timeframeMinutes: number;
    isLoading: boolean;
    hasCandles: boolean;
}

type DisplayInstrument = Instrument & {
    quoteSource?: 'live' | 'ohlc' | 'none';
    bidDirection?: 'up' | 'down' | 'same';
    askDirection?: 'up' | 'down' | 'same';
};

interface TradingChartProps {
    symbol: string;
    accountSessionScopeId?: string | null;
    instrument: DisplayInstrument;
    basePrice: number;
    positions?: any[];
    onClosePosition?: (id: string) => void;
    onUpdatePosition?: (id: string, updates: any) => void;
    onSell: () => void;
    onBuy: () => void;
    onOpenOrderPanel?: () => void;
    isOrderPanelOpen?: boolean;
    onToggleOrderPanel?: () => void;
    onHistoryStatusChange?: (status: ChartHistoryStatus) => void;
    timeframeMinutes?: number;
    onTimeframeChange?: (timeframeMinutes: number) => void;
    chartType?: ChartType;
    onChartTypeChange?: (chartType: ChartType) => void;
    layoutPanes?: ChartLayoutPanes;
    onLayoutPanesChange?: (layoutPanes: ChartLayoutPanes) => void;
    chartBarSpacing?: number | null;
    onChartBarSpacingChange?: (barSpacing: number) => void;
    /** Visible chart gets foreground hydration and interactive global controls. */
    isActive?: boolean;
    /** Staggers initial hydration for hidden keep-alive charts. */
    backgroundHydrationDelayMs?: number;
}

type ChartTypeOption = { id: string; label: ChartType; icon: JSX.Element };
type ChartLayoutPanes = 1 | 2 | 3 | 4 | 6;


const getQuoteFlashClass = (
    direction?: 'up' | 'down' | 'same',
    side?: 'bid' | 'ask',
) => {
    if (direction === 'up') return side === 'ask' ? 'quote-flash-buy' : 'quote-flash-up';
    if (direction === 'down') return 'quote-flash-down';
    return 'quote-flash-tick';
};

function TopQuoteActions({
    instrument,
    onSell,
    onBuy,
    onOpenOrderPanel,
    isOrderPanelOpen,
    onToggleOrderPanel,
}: {
    instrument: DisplayInstrument;
    onSell: () => void;
    onBuy: () => void;
    onOpenOrderPanel?: () => void;
    isOrderPanelOpen?: boolean;
    onToggleOrderPanel?: () => void;
}) {
    const rawLivePrice = usePriceBySymbol(instrument.symbol);

    const liveBid = (rawLivePrice?.bid ?? 0) > 0 ? rawLivePrice?.bid ?? 0 : 0;
    const liveAsk = (rawLivePrice?.ask ?? 0) > 0 ? rawLivePrice?.ask ?? 0 : 0;
    const hasLiveQuote = liveBid > 0 && liveAsk > 0;
    const isIndicativeQuote = !hasLiveQuote && instrument.quoteSource === 'ohlc';
    const bid = hasLiveQuote ? liveBid : instrument.bid;
    const ask = hasLiveQuote ? liveAsk : instrument.ask;
    const bidDir = hasLiveQuote ? rawLivePrice?.bidDirection : undefined;
    const askDir = hasLiveQuote ? rawLivePrice?.askDirection : undefined;
    const bidFlashClass = hasLiveQuote && bid > 0 ? getQuoteFlashClass(bidDir, 'bid') : '';
    const askFlashClass = hasLiveQuote && ask > 0 ? getQuoteFlashClass(askDir, 'ask') : '';
    const topQuoteTitle = isIndicativeQuote
        ? 'Indicative price from latest OHLC candle. Market orders require a live MT5 bid/ask.'
        : !hasLiveQuote
            ? 'Waiting for a live MT5 bid/ask.'
            : undefined;
    const formatQuote = (value: number) =>
        value > 0
            ? `${isIndicativeQuote ? '~' : ''}${value.toFixed(instrument.digits)}`
            : '--';

    return (
        <>
            {!isOrderPanelOpen && (
                <>
                    <button
                        className={`qa-btn qa-btn-sell ${!hasLiveQuote ? 'opacity-70' : ''}`}
                        disabled={!hasLiveQuote}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (hasLiveQuote) onSell(); }}
                        title={topQuoteTitle}
                    >
                        {bidFlashClass && (
                            <span
                                key={`bid-flash-${bidDir ?? 'none'}`}
                                className={`quote-flash-overlay ${bidFlashClass}`}
                            />
                        )}
                        <span className="qa-label quote-flash-content text-white/90 mr-[2px]">Sell</span>
                        <span className="qa-val quote-flash-content text-white">{formatQuote(bid)}</span>
                    </button>

                    <div className="mx-2 flex items-center justify-center text-[12px] font-medium text-muted-foreground tabular-nums">
                        {hasLiveQuote ? (Math.abs(ask - bid) * Math.pow(10, instrument.digits)).toFixed(2) : '--'}
                    </div>

                    <button
                        className={`qa-btn qa-btn-buy ${!hasLiveQuote ? 'opacity-70' : ''}`}
                        disabled={!hasLiveQuote}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (hasLiveQuote) onBuy(); }}
                        title={topQuoteTitle}
                    >
                        {askFlashClass && (
                            <span
                                key={`ask-flash-${askDir ?? 'none'}`}
                                className={`quote-flash-overlay ${askFlashClass}`}
                            />
                        )}
                        <span className="qa-label quote-flash-content text-white/90 mr-[2px]">Buy</span>
                        <span className="qa-val quote-flash-content text-white">{formatQuote(ask)}</span>
                    </button>
                </>
            )}

            <button className="qa-chevron ml-1" onClick={() => onToggleOrderPanel?.()}>
                {!isOrderPanelOpen ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
            </button>
        </>
    );
}

function ChartPaneWithPriceSeed({
    symbol,
    accountSessionScopeId,
    instrument,
    basePrice,
    tvTheme,
    selectedChartType,
    positions,
    onUpdatePosition,
    onClosePosition,
    controlRef,
    onHistoryStatusChange,
    headerActions,
    timeframeMinutes,
    onTimeframeChange,
    chartBarSpacing,
    onChartBarSpacingChange,
    showTitle,
    hydrationDelayMs = 0,
    isPrimaryPane = true,
    isForegroundChart = true,
}: {
    symbol: string;
    accountSessionScopeId?: string | null;
    instrument: DisplayInstrument;
    basePrice: number;
    tvTheme: 'Dark' | 'Light';
    selectedChartType: ChartType;
    positions?: any[];
    onUpdatePosition?: (id: string, updates: any) => void;
    onClosePosition?: (ticket: string) => void;
    controlRef?: MutableRefObject<any>;
    onHistoryStatusChange?: (status: ChartHistoryStatus) => void;
    headerActions?: ReactNode;
    timeframeMinutes?: number;
    onTimeframeChange?: (timeframeMinutes: number) => void;
    chartBarSpacing?: number | null;
    onChartBarSpacingChange?: (barSpacing: number) => void;
    showTitle?: boolean;
    hydrationDelayMs?: number;
    isPrimaryPane?: boolean;
    isForegroundChart?: boolean;
}) {
    const [isChartRuntimeReady, setIsChartRuntimeReady] = useState(
        () => isForegroundChart && isPrimaryPane !== false && !(hydrationDelayMs && hydrationDelayMs > 0),
    );

    useEffect(() => {
        if (isChartRuntimeReady) {
            return;
        }
        if (isForegroundChart) {
            setIsChartRuntimeReady(true);
            return;
        }

        return scheduleChartRuntimeMount(() => setIsChartRuntimeReady(true), hydrationDelayMs);
    }, [hydrationDelayMs, isChartRuntimeReady, isForegroundChart]);

    if (!isChartRuntimeReady) {
        return <ChartPaneLoadingFallback />;
    }

    return (
        <KlineFallbackChartPane
            symbol={symbol}
            accountSessionScopeId={accountSessionScopeId}
            instrument={instrument}
            basePrice={basePrice}
            tvTheme={tvTheme}
            selectedChartType={selectedChartType}
            positions={positions}
            onUpdatePosition={onUpdatePosition}
            onClosePosition={onClosePosition}
            controlRef={controlRef}
            onHistoryStatusChange={onHistoryStatusChange}
            headerActions={headerActions}
            timeframeMinutes={timeframeMinutes}
            onTimeframeChange={onTimeframeChange}
            chartBarSpacing={chartBarSpacing}
            onChartBarSpacingChange={onChartBarSpacingChange}
            showTitle={showTitle}
            isPrimaryPane={isPrimaryPane}
            isForegroundChart={isForegroundChart}
        />
    );
}

function KlineFallbackChartPane({
    symbol,
    accountSessionScopeId,
    instrument,
    basePrice,
    tvTheme,
    selectedChartType,
    positions,
    onUpdatePosition,
    onClosePosition,
    controlRef,
    onHistoryStatusChange,
    headerActions,
    timeframeMinutes,
    onTimeframeChange,
    chartBarSpacing,
    onChartBarSpacingChange,
    showTitle,
    isPrimaryPane = true,
    isForegroundChart = true,
}: {
    symbol: string;
    accountSessionScopeId?: string | null;
    instrument: DisplayInstrument;
    basePrice: number;
    tvTheme: 'Dark' | 'Light';
    selectedChartType: ChartType;
    positions?: any[];
    onUpdatePosition?: (id: string, updates: any) => void;
    onClosePosition?: (ticket: string) => void;
    controlRef?: MutableRefObject<any>;
    onHistoryStatusChange?: (status: ChartHistoryStatus) => void;
    headerActions?: ReactNode;
    timeframeMinutes?: number;
    onTimeframeChange?: (timeframeMinutes: number) => void;
    chartBarSpacing?: number | null;
    onChartBarSpacingChange?: (barSpacing: number) => void;
    showTitle?: boolean;
    isPrimaryPane?: boolean;
    isForegroundChart?: boolean;
}) {
    return (
        <KlineChartContainer
            symbol={symbol}
            accountSessionScopeId={accountSessionScopeId}
            symbolName={instrument.name}
            basePrice={basePrice}
            theme={tvTheme}
            chartType={selectedChartType}
            pricePrecision={instrument.digits}
            positions={positions}
            onUpdatePosition={onUpdatePosition}
            onClosePosition={onClosePosition}
            controlRef={controlRef}
            onHistoryStatusChange={onHistoryStatusChange}
            headerActions={headerActions}
            timeframeMinutes={timeframeMinutes}
            onTimeframeChange={onTimeframeChange}
            chartBarSpacing={chartBarSpacing}
            onChartBarSpacingChange={onChartBarSpacingChange}
            showTitle={showTitle}
            isPrimaryPane={isPrimaryPane}
            isForegroundChart={isForegroundChart}
        />
    );
}

function TradingChart({
    symbol,
    accountSessionScopeId,
    instrument,
    basePrice,
    positions,
    onUpdatePosition,
    onClosePosition,
    onSell,
    onBuy,
    onOpenOrderPanel,
    isOrderPanelOpen,
    onToggleOrderPanel,
    onHistoryStatusChange,
    timeframeMinutes,
    onTimeframeChange,
    chartType,
    onChartTypeChange,
    layoutPanes,
    onLayoutPanesChange,
    chartBarSpacing,
    onChartBarSpacingChange,
    isActive = true,
    backgroundHydrationDelayMs = 0,
}: TradingChartProps) {
    const { resolvedTheme, setTheme } = useTheme();
    const tvTheme = resolvedTheme === 'light' ? 'Light' : 'Dark';
    
    const [isIndicatorsOpen, setIsIndicatorsOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const uiPalette = useMemo(() => resolvedTheme === 'light'
        ? {
            divider: '#d7dde5',
            hover: '#e3e8ee',
            dropdownBg: '#ffffff',
            dropdownBorder: '#d7dde5',
            text: '#64748b',
            textStrong: '#1f2937',
            activeAccent: '#d4af37',
        }
        : {
            divider: '#2c3038',
            hover: '#2c3038',
            dropdownBg: '#272c33',
            dropdownBorder: '#2c3038',
            text: '#8a9099',
            textStrong: '#eaecef',
            activeAccent: '#facc15',
        }, [resolvedTheme]);
    
    const [isCompareOpen, setIsCompareOpen] = useState(false);
    
    // Layout Tools State
    const [isSaved, setIsSaved] = useState(true);
    const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
    const [layoutMenuCoords, setLayoutMenuCoords] = useState({ top: 0, left: 0 });
    const layoutButtonRef = useRef<HTMLButtonElement>(null);
    
    const [isLayoutGridOpen, setIsLayoutGridOpen] = useState(false);
    const [layoutGridCoords, setLayoutGridCoords] = useState({ top: 0, left: 0 });
    const layoutGridButtonRef = useRef<HTMLButtonElement>(null);
    const [internalLayoutPanes, setInternalLayoutPanes] = useState<ChartLayoutPanes>(1);
    const activeLayoutPanes = layoutPanes ?? internalLayoutPanes;
    const setActiveLayoutPanes = useCallback((nextLayoutPanes: ChartLayoutPanes) => {
        setInternalLayoutPanes(nextLayoutPanes);
        onLayoutPanesChange?.(nextLayoutPanes);
    }, [onLayoutPanesChange]);

    const [isCameraMenuOpen, setIsCameraMenuOpen] = useState(false);
    const [cameraMenuCoords, setCameraMenuCoords] = useState({ top: 0, left: 0 });
    const cameraButtonRef = useRef<HTMLButtonElement>(null);

    const chartControlRef = useRef<any>(null);

    const [isChartTypeOpen, setIsChartTypeOpen] = useState(false);
    const [internalChartType, setInternalChartType] = useState<ChartType>('Candles');
    const selectedChartType = chartType ?? internalChartType;
    const setSelectedChartType = useCallback((nextChartType: ChartType) => {
        setInternalChartType(nextChartType);
        onChartTypeChange?.(nextChartType);
    }, [onChartTypeChange]);
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
    const [dropdownCoords, setDropdownCoords] = useState({ top: 0, left: 0 });
    const dropdownRef = useRef<HTMLButtonElement>(null);
    const [iframeBody, setIframeBody] = useState<HTMLElement | null>(null);

    const handleDropdownToggle = useCallback(() => {
        if (!isChartTypeOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            setDropdownCoords({ top: rect.bottom + 8, left: rect.left });
            setIframeBody(dropdownRef.current.ownerDocument.body);
        }
        setIsChartTypeOpen(!isChartTypeOpen);
    }, [isChartTypeOpen]);

    const handleLayoutMenuToggle = useCallback(() => {
        if (!isLayoutMenuOpen && layoutButtonRef.current) {
            const rect = layoutButtonRef.current.getBoundingClientRect();
            setLayoutMenuCoords({ top: rect.bottom + 8, left: rect.left });
            setIframeBody(layoutButtonRef.current.ownerDocument.body);
        }
        setIsLayoutMenuOpen(!isLayoutMenuOpen);
    }, [isLayoutMenuOpen]);

    const handleLayoutGridToggle = useCallback(() => {
        if (!isLayoutGridOpen && layoutGridButtonRef.current) {
            const rect = layoutGridButtonRef.current.getBoundingClientRect();
            setLayoutGridCoords({ top: rect.bottom + 8, left: rect.left });
            setIframeBody(layoutGridButtonRef.current.ownerDocument.body);
        }
        setIsLayoutGridOpen(!isLayoutGridOpen);
    }, [isLayoutGridOpen]);

    const handleCameraMenuToggle = useCallback(() => {
        if (!isCameraMenuOpen && cameraButtonRef.current) {
            const rect = cameraButtonRef.current.getBoundingClientRect();
            setCameraMenuCoords({ top: rect.bottom + 8, left: rect.left });
            setIframeBody(cameraButtonRef.current.ownerDocument.body);
        }
        setIsCameraMenuOpen(!isCameraMenuOpen);
    }, [isCameraMenuOpen]);

    const handleSaveLayout = useCallback(() => {
        setIsSaved(false);
        setIsLayoutMenuOpen(false);
        setTimeout(() => setIsSaved(true), 800);
    }, []);

    useEffect(() => {
        if (!isActive) {
            return;
        }

        const handleClickOutside = () => {
            setIsChartTypeOpen(false);
            setIsLayoutMenuOpen(false);
            setIsLayoutGridOpen(false);
            setIsCameraMenuOpen(false);
        };
        const doc = document;
        doc.addEventListener('mousedown', handleClickOutside);
        return () => doc.removeEventListener('mousedown', handleClickOutside);
    }, [isActive]);

    useEffect(() => {
        if (isActive) {
            return;
        }

        setIsIndicatorsOpen(false);
        setIsCompareOpen(false);
        setIsSettingsOpen(false);
        setIsChartTypeOpen(false);
        setIsLayoutMenuOpen(false);
        setIsLayoutGridOpen(false);
        setIsCameraMenuOpen(false);
        setContextMenu((current) => current.visible ? { ...current, visible: false } : current);
    }, [isActive]);

    useEffect(() => {
        if (!isActive) {
            return;
        }

        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
            if (isEditable) return;
            if (e.key === 'F8') {
                e.preventDefault();
                setIsSettingsOpen((v) => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isActive]);

    const chartTypes = useMemo<ChartTypeOption[]>(() => {
        const chartTypeIcons: Record<ChartType, JSX.Element> = {
            Bars: <ChartHlcBarsIcon />,
            Candles: <ChartCandlesIcon />,
            'Hollow Candles': <ChartHollowCandlesIcon />,
            Line: <ChartLineIcon />,
        };

        return DEFAULT_CHART_TYPES.map((label, index) => ({
            id: String(index + 1),
            label,
            icon: chartTypeIcons[label],
        }));
    }, []);

    const currentType = useMemo(
        () => chartTypes.find(t => t.label === selectedChartType) || chartTypes[1],
        [chartTypes, selectedChartType],
    );

    const layoutGridClass = activeLayoutPanes === 1
        ? 'grid-cols-1 grid-rows-1'
        : activeLayoutPanes === 2
            ? 'grid-cols-2 grid-rows-1'
            : activeLayoutPanes === 3
                ? 'grid-cols-3 grid-rows-1'
                : activeLayoutPanes === 4
                    ? 'grid-cols-2 grid-rows-2'
                    : 'grid-cols-3 grid-rows-2';

    const paneIndices = useMemo(
        () => Array.from({ length: activeLayoutPanes }, (_, i) => i),
        [activeLayoutPanes],
    );

    return (
        <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 select-none flex-col overflow-hidden bg-card">
            <div
                className={`relative grid min-h-0 min-w-0 flex-1 gap-px overflow-hidden bg-card ${layoutGridClass}`}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
                }}
            >
                {paneIndices.map((paneIndex) => (
                <div key={paneIndex} className="relative min-w-0 min-h-0 overflow-hidden">
                <ChartPaneWithPriceSeed
                    symbol={symbol}
                    accountSessionScopeId={accountSessionScopeId}
                    instrument={instrument}
                    basePrice={basePrice}
                    tvTheme={tvTheme as 'Dark' | 'Light'}
                    selectedChartType={selectedChartType}
                    positions={positions}
                    onUpdatePosition={onUpdatePosition}
                    onClosePosition={onClosePosition}
                    controlRef={paneIndex === 0 ? chartControlRef : undefined}
                    onHistoryStatusChange={paneIndex === 0 ? onHistoryStatusChange : undefined}
                    isPrimaryPane={paneIndex === 0}
                    showTitle={false}
                    headerActions={paneIndex !== 0 ? undefined :
                        <div className="no-scrollbar" style={{ display: 'flex', alignItems: 'center', flexWrap: 'nowrap', justifyContent: 'flex-end', height: '32px', maxWidth: '100%', gap: '8px', overflowX: 'auto', overflowY: 'hidden', padding: '0 4px', pointerEvents: 'auto' }}>
                            <style>{`
                                .qa-tv-divider { width: 1px; height: 20px; background-color: ${uiPalette.divider}; }
                                .qa-btn {
                                    display: flex; align-items: center; justify-content: center;
                                    flex: 0 0 auto; min-width: 80px; padding: 0 10px; height: 32px; border-radius: 4px; outline: none;
                                    cursor: pointer; transition: all 0.15s; font-family: Inter, system-ui, sans-serif;
                                    position: relative; overflow: hidden;
                                }
                                .qa-btn:disabled { cursor: not-allowed; opacity: 0.6; }
                                .qa-btn-sell { 
                                    background-color: #f23645; 
                                    border: none;
                                    color: white; 
                                }
                                .qa-btn-sell:hover:not(:disabled) { background-color: #d02e3a; }
                                .qa-btn-sell .qa-label { color: rgba(255,255,255,0.9); }
                                
                                .qa-btn-buy { 
                                    background-color: #3b82f6; 
                                    border: none;
                                    color: white; 
                                }
                                .qa-btn-buy:hover:not(:disabled) { background-color: #2563eb; }
                                .qa-btn-buy .qa-label { color: rgba(255, 255, 255, 0.9); }
                                
                                .qa-label { font-size: 13px; font-weight: 500; margin-right: 4px; line-height: 1; }
                                .qa-val { 
                                    font-family: Inter, system-ui, sans-serif; 
                                    font-variant-numeric: tabular-nums; 
                                    font-size: 13px; font-weight: 700; line-height: 1;
                                }
                                .qa-qty {
                                    font-family: Inter, system-ui, sans-serif; 
                                    font-variant-numeric: tabular-nums; 
                                    flex: 0 0 auto; font-size: 12px; font-weight: 700; color: ${uiPalette.text}; padding: 0 8px;
                                }
                                .qa-chevron { color: ${uiPalette.text}; background: none; border: none; cursor: pointer; display: flex; flex: 0 0 auto; align-items: center; padding-right: 4px; transition: color 0.15s; }
                                .qa-chevron:hover { color: ${uiPalette.textStrong}; }
                                .qa-toolbar-btn {
                                    display: flex; align-items: center; justify-content: center; gap: 4px;
                                    flex: 0 0 auto; padding: 0 8px; height: 32px; border-radius: 4px; border: none; outline: none;
                                    cursor: pointer; transition: background 0.15s, color 0.15s;
                                    background: transparent; color: ${uiPalette.text};
                                }
                                .qa-toolbar-btn:hover { background-color: ${uiPalette.hover}; color: ${uiPalette.textStrong}; border-radius: 4px; }
                                .qa-toolbar-btn.active { background-color: ${uiPalette.hover}; color: ${uiPalette.textStrong}; border-radius: 4px; }
                                .qa-dropdown-item {
                                    display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
                                    padding: 8px 12px; font-size: 13px; color: ${uiPalette.text}; cursor: pointer;
                                    transition: background 0.15s, color 0.15s; border-radius: 4px;
                                    border: none !important;
                                    outline: none !important;
                                    background: transparent;
                                }
                                .qa-dropdown-item:hover { background-color: ${uiPalette.hover} !important; color: ${uiPalette.textStrong} !important; }
                                .qa-dropdown-item.active { background-color: ${uiPalette.hover} !important; color: ${uiPalette.activeAccent} !important; }
                                .qa-portal-dropdown {
                                    position: absolute;
                                    width: 180px;
                                    border-radius: 6px;
                                    display: flex;
                                    flex-direction: column;
                                    padding: 4px;
                                    z-index: 99999;
                                    box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5), 0 4px 6px -4px rgba(0,0,0,0.5);
                                }
                            `}</style>

                            {/* Custom Chart Type Dropdown */}
                            <div className="relative">
                                <button 
                                    ref={dropdownRef}
                                    className={`qa-toolbar-btn ${isChartTypeOpen ? 'active' : ''}`}
                                    onClick={handleDropdownToggle}
                                >
                                    {currentType.icon}
                                    <ChevronDown size={14} style={{ marginLeft: '4px' }} />
                                </button>
                                
                                {isActive && isChartTypeOpen && iframeBody && createPortal(
                                    <div
                                        className="qa-portal-dropdown qa-dropdown-portal-item"
                                        style={{ 
                                            backgroundColor: uiPalette.dropdownBg, 
                                            border: `1px solid ${uiPalette.dropdownBorder}`,
                                            top: `${dropdownCoords.top}px`,
                                            left: `${dropdownCoords.left}px`,
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        {chartTypes.map(t => (
                                            <button 
                                                key={t.id}
                                                className={`qa-dropdown-item ${selectedChartType === t.label ? 'active' : ''}`}
                                                onClick={() => {
                                                    setSelectedChartType(t.label);
                                                    setIsChartTypeOpen(false);
                                                }}
                                            >
                                                <span style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {t.icon}
                                                </span>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>,
                                    iframeBody
                                )}
                            </div>

                            <div className="qa-tv-divider" style={{ margin: '0 2px' }} />

                            {/* Indicators */}
                            <button className="qa-toolbar-btn" onClick={() => setIsIndicatorsOpen(true)}>
                                <span style={{ fontWeight: 'bold', fontSize: '13px', fontStyle: 'italic', fontFamily: 'serif' }}>ƒx</span>
                            </button>

                            {/* Compare Symbol */}
                            <button className="qa-toolbar-btn" onClick={() => setIsCompareOpen(true)}>
                                <Plus size={18} strokeWidth={2} />
                            </button>

                            <div className="qa-tv-divider" style={{ marginLeft: '6px', marginRight: '6px' }} />

                            {/* Layout Save Button Setup */}
                            <button 
                                ref={layoutGridButtonRef}
                                className={`qa-toolbar-btn ${isLayoutGridOpen ? 'active' : ''}`}
                                onClick={handleLayoutGridToggle}
                                title="Select Layout"
                            >
                                <Square size={16} strokeWidth={2} />
                            </button>

                            <button 
                                ref={layoutButtonRef}
                                className={`qa-toolbar-btn ${isLayoutMenuOpen ? 'active' : ''}`} 
                                style={{ padding: '0 8px 0 4px', gap: '2px' }}
                                onClick={handleLayoutMenuToggle}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
                                    <span style={{ fontSize: '13px' }}>{isSaved ? 'Save' : 'Save'}</span>
                                    {!isSaved && <span style={{ fontSize: '9px', color: 'hsl(var(--warning))', marginTop: '1px' }}>Save</span>}
                                </div>
                                <ChevronDown size={14} />
                            </button>

                            <div className="qa-tv-divider" style={{ margin: '0 2px' }} />

                            {/* Settings */}
                            <button className="qa-toolbar-btn" onClick={() => setIsSettingsOpen(true)}>
                                <Settings size={16} strokeWidth={2} />
                            </button>

                            {/* Camera with Dropdown */}
                            <button 
                                ref={cameraButtonRef}
                                className={`qa-toolbar-btn ${isCameraMenuOpen ? 'active' : ''}`}
                                onClick={handleCameraMenuToggle}
                            >
                                <Camera size={16} strokeWidth={2} />
                            </button>

                            <button className="qa-toolbar-btn" onClick={() => chartControlRef.current?.toggleFullscreen?.()}>
                                <Maximize size={16} strokeWidth={2} />
                            </button>

                            <div className="qa-tv-divider" style={{ marginLeft: '8px', marginRight: '6px' }} />

                            {/* Orders */}
                            <TopQuoteActions
                                instrument={instrument}
                                onSell={onSell}
                                onBuy={onBuy}
                                onOpenOrderPanel={onOpenOrderPanel}
                                isOrderPanelOpen={isOrderPanelOpen}
                                onToggleOrderPanel={onToggleOrderPanel}
                            />
                        </div>
                    }
                    timeframeMinutes={timeframeMinutes}
                    onTimeframeChange={onTimeframeChange}
                    chartBarSpacing={chartBarSpacing}
                    onChartBarSpacingChange={onChartBarSpacingChange}
                    hydrationDelayMs={
                        backgroundHydrationDelayMs +
                        paneIndex * SECONDARY_PANE_HYDRATION_STAGGER_MS
                    }
                    isForegroundChart={isActive}
                />
                </div>
                ))}
            </div>

            {isActive && isIndicatorsOpen ? <IndicatorsModal isOpen={isIndicatorsOpen} onClose={() => setIsIndicatorsOpen(false)} /> : null}
            {isActive && isCompareOpen ? <CompareSymbolModal isOpen={isCompareOpen} onClose={() => setIsCompareOpen(false)} /> : null}
            {isActive && isSettingsOpen ? <ChartSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} symbol={symbol} /> : null}

            {isActive && contextMenu.visible ? (
                <ChartContextMenu
                    visible={contextMenu.visible}
                    x={contextMenu.x}
                    y={contextMenu.y}
                    symbol={symbol}
                    currentChartType={selectedChartType}
                    onClose={() => setContextMenu((s) => ({ ...s, visible: false }))}
                    onChangeChartType={(type: ChartType) => setSelectedChartType(type)}
                    onOpenOrder={() => onOpenOrderPanel?.()}
                    onBuy={onBuy}
                    onSell={onSell}
                    onOpenIndicators={() => setIsIndicatorsOpen(true)}
                    onTakeScreenshot={() => chartControlRef.current?.takeScreenshot?.()}
                    onOpenProperties={() => setIsSettingsOpen(true)}
                />
            ) : null}

            {/* Layout Portal */}
            {isActive && isLayoutMenuOpen && iframeBody && createPortal(
                <div
                    className="qa-portal-dropdown qa-dropdown-portal-item"
                    style={{ 
                        backgroundColor: uiPalette.dropdownBg, 
                        border: `1px solid ${uiPalette.dropdownBorder}`,
                        top: `${layoutMenuCoords.top}px`,
                        left: `${layoutMenuCoords.left}px`,
                        width: '220px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="qa-dropdown-item" style={{ opacity: 0.5, fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, pointerEvents: 'none' }}>
                        Layout Options
                    </div>
                    <button 
                        className="qa-dropdown-item"
                        onClick={handleSaveLayout}
                    >
                        <Square size={16} /> Save layout
                    </button>
                    <button 
                        className="qa-dropdown-item"
                        onClick={() => setIsLayoutMenuOpen(false)}
                    >
                        Load layout...
                    </button>
                    <button 
                        className="qa-dropdown-item"
                        style={{ color: 'hsl(var(--destructive))' }}
                        onClick={() => setIsLayoutMenuOpen(false)}
                    >
                        Rename layout
                    </button>
                </div>,
                iframeBody
            )}

            {/* Layout Grid Portal */}
            {isActive && isLayoutGridOpen && iframeBody && createPortal(
                <div
                    className="qa-portal-dropdown qa-dropdown-portal-item p-3"
                    style={{ 
                        backgroundColor: uiPalette.dropdownBg, 
                        border: `1px solid ${uiPalette.dropdownBorder}`,
                        top: `${layoutGridCoords.top}px`,
                        left: `${layoutGridCoords.left}px`,
                        width: '240px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div style={{ opacity: 0.5, fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, pointerEvents: 'none', paddingLeft: '8px', paddingBottom: '8px' }}>
                        Select Layout
                    </div>
                    <div className="grid grid-cols-5 gap-2 px-2 pb-2">
                        {([
                            { panes: 1, title: 'Single Chart', cols: 1, rows: 1 },
                            { panes: 2, title: '2 Charts — Horizontal', cols: 2, rows: 1 },
                            { panes: 3, title: '3 Charts — Horizontal', cols: 3, rows: 1 },
                            { panes: 4, title: '4 Charts — 2x2 Grid', cols: 2, rows: 2 },
                            { panes: 6, title: '6 Charts — 3x2 Grid', cols: 3, rows: 2 },
                        ] as const).map((opt) => {
                            const active = activeLayoutPanes === opt.panes;
                            return (
                                <button
                                    key={opt.panes}
                                    onClick={() => { setActiveLayoutPanes(opt.panes); setIsLayoutGridOpen(false); }}
                                    className={`flex items-center justify-center p-2 rounded transition-colors ${active ? 'bg-primary/15 ring-1 ring-primary' : 'hover:bg-foreground/10'}`}
                                    title={opt.title}
                                >
                                    <div
                                        className="grid gap-[2px]"
                                        style={{
                                            gridTemplateColumns: `repeat(${opt.cols}, 1fr)`,
                                            gridTemplateRows: `repeat(${opt.rows}, 1fr)`,
                                            width: 22,
                                            height: 22,
                                        }}
                                    >
                                        {Array.from({ length: opt.panes }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={`rounded-[1px] ${active ? 'bg-primary' : 'bg-muted-foreground'}`}
                                            />
                                        ))}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>,
                iframeBody
            )}

            {/* Camera Options Portal */}
            {isActive && isCameraMenuOpen && iframeBody && createPortal(
                <div
                    className="qa-portal-dropdown qa-dropdown-portal-item"
                    style={{ 
                        backgroundColor: uiPalette.dropdownBg, 
                        border: `1px solid ${uiPalette.dropdownBorder}`,
                        top: `${cameraMenuCoords.top}px`,
                        left: `${cameraMenuCoords.left}px`,
                        width: '180px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="qa-dropdown-item" style={{ opacity: 0.5, fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, pointerEvents: 'none' }}>
                        Snapshot Image
                    </div>
                    <button 
                        className="qa-dropdown-item"
                        onClick={() => {
                            chartControlRef.current?.takeScreenshot?.();
                            setIsCameraMenuOpen(false);
                        }}
                    >
                        Save Image
                    </button>
                    <button 
                        className="qa-dropdown-item"
                        onClick={() => {
                            chartControlRef.current?.takeScreenshotPDF?.();
                            setIsCameraMenuOpen(false);
                        }}
                    >
                        Save PDF
                    </button>
                </div>,
                iframeBody
            )}
        </div>
    );
}

export default memo(TradingChart);
