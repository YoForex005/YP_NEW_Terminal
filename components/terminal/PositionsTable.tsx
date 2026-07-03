'use client';

import type { Position, ClosedTrade } from '@/lib/terminal/types';
import type { Order } from '@/types/webtrader';
import dynamic from 'next/dynamic';
import { X, Layers, MoreVertical, Briefcase, XCircle, Droplet, Edit2, Database, GripVertical, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { memo, useCallback, useState, useEffect, useRef, useMemo, type Dispatch, type SetStateAction } from 'react';
import { usePriceBySymbol } from '@/store/webtrader-store';
import { SymbolIcon } from './SymbolIcon';
import { getSafePriceDigits } from '@/lib/terminal/price-digits';
import { formatMt5DateTimeShort } from '@/lib/mt5-time';

interface PositionsTableProps {
    openPositions: Position[];
    pendingOrders?: Order[];
    closedTrades: ClosedTrade[];
    positionsLoading?: boolean;
    positionsError?: string | null;
    positionsWarning?: string | null;
    closedHistoryLoading?: boolean;
    closedHistoryLoaded?: boolean;
    closedHistoryError?: string | null;
    onClosePosition: (id: string) => void;
    onUpdatePosition?: (id: string, updates: Partial<Position>) => void;
    onCloseAll?: () => void;
    onRetryPositions?: () => void;
    onOpenClosedTab?: () => void;
    onRetryClosedHistory?: () => void;
    onShowToast?: (type: 'success' | 'info' | 'topup' | 'warning' | 'error', title: string, message?: string) => void;
}

type DisplayPosition = Position & {
    isAggregated: boolean;
    aggregatedCount: number;
    isHedged: boolean;
    positions: Position[];
};

const ModifyPositionModal = dynamic(() => import('./ModifyPositionModal'), {
    ssr: false,
    loading: () => null,
});

function LoadingState({ title, message }: { title: string; message: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-[200px] gap-2 border border-dashed border-border/40 rounded-[6px] m-4 bg-card/10 select-none animate-in fade-in-50 duration-300">
            <Loader2 size={34} strokeWidth={1.4} className="text-primary/70 animate-spin" />
            <p className="text-[11px] font-bold text-muted-foreground/70 tracking-wider uppercase">{title}</p>
            <p className="text-[10px] text-muted-foreground/50 max-w-[240px] text-center">{message}</p>
        </div>
    );
}

function BackgroundRefreshState({
    title,
    message,
    onRetry,
}: {
    title: string;
    message: string;
    onRetry?: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center h-[200px] gap-2 border border-dashed border-primary/35 rounded-[6px] m-4 bg-primary/5 select-none animate-in fade-in-50 duration-300">
            <Loader2 size={34} strokeWidth={1.4} className="text-primary/75 animate-spin" />
            <p className="text-[11px] font-bold text-primary/80 tracking-wider uppercase">{title}</p>
            <p className="text-[10px] text-muted-foreground/65 max-w-[280px] text-center">{message}</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground hover:bg-accent"
                >
                    <RefreshCw size={12} />
                    Refresh now
                </button>
            )}
        </div>
    );
}

function RetryableErrorState({
    title,
    message,
    onRetry,
}: {
    title: string;
    message: string;
    onRetry?: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center h-[200px] gap-2 border border-dashed border-destructive/35 rounded-[6px] m-4 bg-destructive/5 select-none animate-in fade-in-50 duration-300">
            <AlertTriangle size={34} strokeWidth={1.4} className="text-destructive/75" />
            <p className="text-[11px] font-bold text-destructive/80 tracking-wider uppercase">{title}</p>
            <p className="text-[10px] text-muted-foreground/65 max-w-[280px] text-center">{message}</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-background px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground hover:bg-accent"
                >
                    <RefreshCw size={12} />
                    Retry
                </button>
            )}
        </div>
    );
}

function RetryableErrorBanner({
    message,
    onRetry,
}: {
    message: string;
    onRetry?: () => void;
}) {
    return (
        <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="min-w-0 truncate">
                <span className="font-bold text-destructive/80">Refresh failed:</span> {message}
            </span>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="flex-shrink-0 rounded-sm border border-border/60 bg-background px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground hover:bg-accent"
                >
                    Retry
                </button>
            )}
        </div>
    );
}

export default function PositionsTable({
    openPositions,
    pendingOrders = [],
    closedTrades,
    positionsLoading = false,
    positionsError = null,
    positionsWarning = null,
    closedHistoryLoading = false,
    closedHistoryLoaded = false,
    closedHistoryError = null,
    onClosePosition,
    onUpdatePosition,
    onCloseAll,
    onRetryPositions,
    onOpenClosedTab,
    onRetryClosedHistory,
    onShowToast,
}: PositionsTableProps) {
    const [activeTab, setActiveTab] = useState<'open' | 'pending' | 'closed'>('open');
    const [editingCell, setEditingCell] = useState<{ id: string, field: 'tp' | 'sl', value: string } | null>(null);
    const [modifyingPosition, setModifyingPosition] = useState<Position | null>(null);
    const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
    const [isGrouped, setIsGrouped] = useState(false);
    const columnsMenuRef = useRef<HTMLDivElement>(null);

    const [columns, setColumns] = useState(() => [
        { id: 'type', label: 'Type', visible: true },
        { id: 'volume', label: 'Volume', visible: true },
        { id: 'openPrice', label: 'Open price', visible: true },
        { id: 'currentPrice', label: 'Current price', visible: true },
        { id: 'tp', label: 'Take profit', visible: true },
        { id: 'sl', label: 'Stop loss', visible: true },
        { id: 'ticket', label: 'Order / Position ID', visible: true },
        { id: 'openTime', label: 'Open time', visible: true },
        { id: 'swap', label: 'Swap', visible: true },
        { id: 'marketCloses', label: 'Market closes in', visible: false },
    ]);

    const toggleColumn = useCallback((id: string) => {
        setColumns(cols => cols.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
    }, []);

    const visibleColumns = useMemo(
        () => new Set(columns.filter((column) => column.visible).map((column) => column.id)),
        [columns],
    );

    const isVisible = useCallback((id: string) => visibleColumns.has(id), [visibleColumns]);

    const handleTabChange = useCallback((tabId: 'open' | 'pending' | 'closed') => {
        setActiveTab(tabId);
        if (tabId === 'closed' && !closedHistoryLoaded) {
            onOpenClosedTab?.();
        }
    }, [closedHistoryLoaded, onOpenClosedTab]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (columnsMenuRef.current && !columnsMenuRef.current.contains(event.target as Node)) {
                setIsColumnsMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (
            activeTab === 'closed' &&
            !closedHistoryLoaded &&
            !closedHistoryLoading &&
            !closedHistoryError
        ) {
            onOpenClosedTab?.();
        }
    }, [activeTab, closedHistoryError, closedHistoryLoaded, closedHistoryLoading, onOpenClosedTab]);

    const handleEditComplete = useCallback((id: string, field: 'tp' | 'sl', value: string) => {
        if (!onUpdatePosition) return;
        const numValue = value === '' ? null : parseFloat(value);
        if (value !== '' && isNaN(numValue as number)) return; // Invalid input

        onUpdatePosition(id, { [field]: numValue });
        setEditingCell(null);
    }, [onUpdatePosition]);

    const displayPositions = useMemo<DisplayPosition[]>(() => {
        if (!isGrouped) {
            return openPositions.map((position) => ({
                ...position,
                isAggregated: false,
                aggregatedCount: 1,
                isHedged: false,
                positions: [position],
            }));
        }

        return Object.values(openPositions.reduce((accumulator, position) => {
            if (accumulator[position.symbol]) {
                const existing = accumulator[position.symbol];
                existing.isAggregated = true;
                existing.aggregatedCount += 1;
                existing.volume += position.volume;
                existing.profit += position.profit;
                existing.swap += position.swap;
                if (existing.type !== position.type) existing.isHedged = true;
                existing.tp = null;
                existing.sl = null;
                existing.ticket = '';
                existing.positions.push(position);
            } else {
                accumulator[position.symbol] = {
                    ...position,
                    isAggregated: false,
                    aggregatedCount: 1,
                    isHedged: false,
                    positions: [position],
                };
            }

            return accumulator;
        }, {} as Record<string, DisplayPosition>));
    }, [isGrouped, openPositions]);

    const tabs = useMemo(() => [
        { id: 'open' as const, label: 'Open', count: openPositions.length },
        { id: 'pending' as const, label: 'Pending', count: pendingOrders.length },
        { id: 'closed' as const, label: 'Closed', count: closedTrades.length },
    ], [closedTrades.length, openPositions.length, pendingOrders.length]);

    return (
        <div className="flex flex-col h-full text-[12px] bg-background">
            {/* Tab bar */}
            <div className="flex min-w-0 items-center overflow-hidden border-b border-border/40 flex-shrink-0 px-2 h-[34px] bg-background select-none">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`relative flex-shrink-0 px-3 h-full flex items-center gap-1.5 font-bold transition-colors ${activeTab === tab.id
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <span>{tab.label}</span>
                        {tab.count > 0 && (
                            <span className={`text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold transition-colors ${activeTab === tab.id
                                    ? 'bg-accent text-primary'
                                    : 'bg-transparent text-muted-foreground'
                                }`}>
                                {tab.count}
                            </span>
                        )}
                        {tab.id === 'open' && tab.count === 0 && (positionsLoading || positionsWarning) && (
                            <span className="w-[5px] h-[5px] rounded-full bg-primary/40 animate-pulse" />
                        )}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                        )}
                    </button>
                ))}

                {/* Spacer */}
                <div className="min-w-2 flex-1" />

                {/* Right action icons */}
                <div className="flex flex-shrink-0 items-center pl-3">
                {/* View Toggle */}
                    <div className="flex items-center rounded-[3px] bg-accent/30 border border-border/40 overflow-hidden p-[1px] mr-2">
                        <div className="relative group/toggle">
                            <button 
                                onClick={() => setIsGrouped(true)}
                                className={`w-[28px] h-[26px] flex items-center justify-center rounded-[2px] transition-colors ${isGrouped ? 'bg-accent text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'}`}
                            >
                                <Layers size={13} />
                            </button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/toggle:opacity-100 pointer-events-none z-50 transition-opacity border border-border shadow-md">
                                Group positions
                                <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 border-solid border-b-border border-b-[5px] border-x-transparent border-x-[5px] border-t-0" />
                            </div>
                        </div>
                        <div className="relative group/toggle">
                            <button 
                                onClick={() => setIsGrouped(false)}
                                className={`w-[28px] h-[26px] flex items-center justify-center rounded-[2px] transition-colors ${!isGrouped ? 'bg-accent text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'}`}
                            >
                                <Database size={13} />
                            </button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/toggle:opacity-100 pointer-events-none z-50 transition-opacity border border-border shadow-md">
                                Ungroup positions
                                <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 border-solid border-b-border border-b-[5px] border-x-transparent border-x-[5px] border-t-0" />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 border-r border-border/40 pr-1 relative" ref={columnsMenuRef}>
                        <button 
                            onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
                            className="w-[28px] h-[28px] flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <MoreVertical size={15} />
                        </button>
                        
                        {/* COLUMNS Dropdown Menu */}
                        {isColumnsMenuOpen && (
                            <div className="absolute right-0 bottom-full mb-2 w-[220px] bg-popover border border-border rounded-[4px] shadow-lg z-50 overflow-hidden py-2 flex flex-col cursor-default">
                                <div className="px-4 mb-1">
                                    <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">Columns</span>
                                </div>
                                <div className="flex flex-col">
                                    {columns.map(col => (
                                        <div key={col.id} className="flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <GripVertical size={13} className="text-muted-foreground opacity-50 cursor-grab group-hover:opacity-100 transition-opacity" />
                                                <span className="text-[12px] font-medium text-foreground">{col.label}</span>
                                            </div>
                                            <button 
                                                onClick={() => toggleColumn(col.id)}
                                                className={`w-7 h-[14px] rounded-none relative transition-colors ${col.visible ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                            >
                                                <div className={`absolute top-[1px] bottom-[1px] w-[12px] rounded-none bg-background shadow-[0_0_0_1px_hsl(var(--border))] transition-transform ${col.visible ? 'translate-x-[14px] left-0' : 'translate-x-[1px] left-0'}`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button 
                        onClick={() => onShowToast?.('warning', 'Action Unavailable', 'This panel cannot be closed while trades are active.')}
                        className="w-[28px] h-[28px] flex items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors ml-1"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="custom-scrollbar flex-1 overflow-auto bg-background">
                {activeTab === 'open' && (
                    openPositions.length === 0 ? (
                        positionsLoading ? (
                            <LoadingState
                                title="Loading open positions"
                                message="Fetching the active account positions from the trade server."
                            />
                        ) : positionsError ? (
                            <RetryableErrorState
                                title="Positions unavailable"
                                message={positionsError}
                                onRetry={onRetryPositions}
                            />
                        ) : positionsWarning ? (
                            <BackgroundRefreshState
                                title="Refreshing positions"
                                message={positionsWarning}
                                onRetry={onRetryPositions}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[200px] gap-2 border border-dashed border-border/40 rounded-[6px] m-4 bg-card/10 select-none">
                                <Briefcase size={36} strokeWidth={1.2} className="text-muted-foreground/40" />
                                <p className="text-[11px] font-bold text-muted-foreground/60 tracking-wider uppercase">No open positions</p>
                                <p className="text-[10px] text-muted-foreground/45 max-w-[200px] text-center">Your active trades will appear here when filled.</p>
                            </div>
                        )
                    ) : (
                        <>
                        {positionsError && (
                            <RetryableErrorBanner
                                message={positionsError}
                                onRetry={onRetryPositions}
                            />
                        )}
                        <table className="min-w-[1160px] w-full text-left border-collapse">
                            <thead>
                                <tr className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold sticky top-0 z-20 border-b border-border/40 bg-card select-none">
                                    <th className="pl-4 py-2 font-semibold w-[120px]">Symbol</th>
                                    {isVisible('type') && <th className="py-2 font-semibold w-[80px]">Type</th>}
                                    {isVisible('volume') && <th className="py-2 font-semibold w-[90px]">Volume, lot</th>}
                                    {isVisible('openPrice') && <th className="py-2 font-semibold w-[90px]">Open price</th>}
                                    {isVisible('currentPrice') && <th className="py-2 font-semibold w-[100px]">Current price</th>}
                                    {isVisible('tp') && <th className="py-2 font-semibold w-[70px]">T/P</th>}
                                    {isVisible('sl') && <th className="py-2 font-semibold w-[70px]">S/L</th>}
                                    {isVisible('ticket') && <th className="py-2 font-semibold w-[80px]">Position</th>}
                                    {isVisible('openTime') && <th className="py-2 font-semibold w-[160px] min-w-[160px]">Open time</th>}
                                    {isVisible('swap') && <th className="py-2 font-semibold w-[80px]">Swap</th>}
                                    {isVisible('marketCloses') && <th className="py-2 font-semibold w-[100px]">Market closes in</th>}
                                    <th className="text-right pr-3 py-2 font-semibold w-[100px] min-w-[100px] sticky right-[60px] z-30 bg-card">P/L, USD</th>
                                    <th className="w-[60px] min-w-[60px] sticky right-0 z-30 bg-card"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayPositions.map((pos) => (
                                    <OpenPositionRow
                                        key={pos.id}
                                        pos={pos}
                                        isVisible={isVisible}
                                        editingCell={editingCell}
                                        setEditingCell={setEditingCell}
                                        handleEditComplete={handleEditComplete}
                                        setModifyingPosition={setModifyingPosition}
                                        onClosePosition={onClosePosition}
                                    />
                                ))}
                            </tbody>
                        </table>
                        <div className="h-[2px]" />
                        </>
                    )
                )}

                {activeTab === 'pending' && (
                    pendingOrders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px] gap-2 border border-dashed border-border/40 rounded-[6px] m-4 bg-card/10 select-none animate-in fade-in-50 duration-300">
                            <Briefcase size={36} strokeWidth={1.2} className="text-muted-foreground/40 animate-pulse" />
                            <p className="text-[11px] font-bold text-muted-foreground/60 tracking-wider uppercase">No pending orders</p>
                            <p className="text-[10px] text-muted-foreground/45 max-w-[200px] text-center">Your limit or stop orders will show here.</p>
                        </div>
                    ) : (
                        <table className="min-w-[1160px] w-full text-left border-collapse">
                            <thead>
                                <tr className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold sticky top-0 z-20 border-b border-border/40 bg-card select-none">
                                    <th className="pl-4 py-2 font-semibold w-[120px]">Symbol</th>
                                    {isVisible('type') && <th className="py-2 font-semibold w-[80px]">Type</th>}
                                    {isVisible('volume') && <th className="py-2 font-semibold w-[90px]">Volume, lot</th>}
                                    {isVisible('openPrice') && <th className="py-2 font-semibold w-[90px]">Open price</th>}
                                    {isVisible('currentPrice') && <th className="py-2 font-semibold w-[100px]">Current price</th>}
                                    {isVisible('tp') && <th className="py-2 font-semibold w-[70px]">T/P</th>}
                                    {isVisible('sl') && <th className="py-2 font-semibold w-[70px]">S/L</th>}
                                    {isVisible('ticket') && <th className="py-2 font-semibold w-[80px]">Order</th>}
                                    {isVisible('openTime') && <th className="py-2 font-semibold w-[160px] min-w-[160px]">Open time</th>}
                                    {isVisible('swap') && <th className="py-2 font-semibold w-[80px]">State</th>}
                                    {isVisible('marketCloses') && <th className="py-2 font-semibold w-[100px]">Market closes in</th>}
                                    <th className="text-right pr-3 py-2 font-semibold w-[100px] min-w-[100px] sticky right-[60px] z-30 bg-card">P/L, USD</th>
                                    <th className="w-[60px] min-w-[60px] sticky right-0 z-30 bg-card"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingOrders.map((order) => (
                                    <PendingOrderRow
                                        key={order.ticket}
                                        order={order}
                                        isVisible={isVisible}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )
                )}

                {activeTab === 'closed' && (
                    closedHistoryLoading && closedTrades.length === 0 ? (
                        <LoadingState
                            title="Loading closed trades"
                            message="Fetching a bounded recent history window from the trading server."
                        />
                    ) : closedHistoryError && closedTrades.length === 0 ? (
                        <RetryableErrorState
                            title="Closed history unavailable"
                            message={closedHistoryError}
                            onRetry={onRetryClosedHistory}
                        />
                    ) : closedTrades.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[200px] gap-2 border border-dashed border-border/40 rounded-[6px] m-4 bg-card/10 select-none animate-in fade-in-50 duration-300">
                            <Briefcase size={36} strokeWidth={1.2} className="text-muted-foreground/40 animate-pulse" />
                            <p className="text-[11px] font-bold text-muted-foreground/60 tracking-wider uppercase">No closed trades</p>
                            <p className="text-[10px] text-muted-foreground/45 max-w-[220px] text-center">
                                {closedHistoryLoaded
                                    ? 'No recent closed trades were found for this account.'
                                    : 'Open the Closed tab to load recent trade history.'}
                            </p>
                        </div>
                    ) : (
                        <>
                        {closedHistoryError && (
                            <RetryableErrorBanner
                                message={closedHistoryError}
                                onRetry={onRetryClosedHistory}
                            />
                        )}
                        <table className="min-w-[860px] w-full text-left border-collapse bg-background">
                            <thead>
                                <tr className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold sticky top-0 z-20 border-b border-border/40 bg-card select-none">
                                    <th className="pl-4 py-2 font-semibold">Close Time</th>
                                    <th className="py-2 font-semibold">Symbol</th>
                                    <th className="py-2 font-semibold">Type</th>
                                    <th className="text-right py-2 font-semibold">Volume</th>
                                    <th className="text-right py-2 font-semibold">Open Price</th>
                                    <th className="text-right py-2 font-semibold">Close Price</th>
                                    <th className="text-right pr-4 py-2 font-semibold">Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {closedTrades.map((trade) => {
                                    const closeDateLabel = formatMt5DateTimeShort(trade.closeTime) || trade.closeTime;
                                    return (
                                    <tr key={trade.id} className="group hover:bg-accent/40 border-b border-border/40 text-foreground text-[11px] h-[30px]">
                                        <td className="pl-4 py-[4px] font-mono text-muted-foreground whitespace-nowrap">{closeDateLabel}</td>
                                        <td className="py-[4px] font-bold">{trade.symbol}</td>
                                        <td className={`py-[4px] font-bold ${trade.type.toLowerCase() === 'buy' ? 'text-success' : 'text-destructive'}`}>{trade.type.toUpperCase()}</td>
                                        <td className="text-right py-[4px] font-mono">{trade.volume.toFixed(2)}</td>
                                        <td className="text-right py-[4px] font-mono text-muted-foreground">{trade.openPrice > 0 ? trade.openPrice.toFixed(5) : '—'}</td>
                                        <td className="text-right py-[4px] font-mono">{trade.closePrice.toFixed(5)}</td>
                                        <td className={`text-right pr-4 py-[4px] font-mono font-bold ${trade.profit >= 0 ? 'text-success' : 'text-destructive'}`}>
                                            {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </>
                    )
                )}
            </div>

            {modifyingPosition ? (
                <ModifyPositionModal
                    isOpen={true}
                    onClose={() => setModifyingPosition(null)}
                    position={modifyingPosition}
                    onUpdate={(id: string, updates: { sl?: number | null; tp?: number | null }) => {
                        onUpdatePosition?.(id, updates);
                        setModifyingPosition(null);
                    }}
                    onClosePosition={(id: string) => {
                        onClosePosition(id);
                        setModifyingPosition(null);
                    }}
                />
            ) : null}
        </div>
    );
}

interface OpenPositionRowProps {
    pos: DisplayPosition;
    isVisible: (id: string) => boolean | undefined;
    editingCell: { id: string, field: 'tp' | 'sl', value: string } | null;
    setEditingCell: Dispatch<SetStateAction<{ id: string, field: 'tp' | 'sl', value: string } | null>>;
    handleEditComplete: (id: string, field: 'tp' | 'sl', value: string) => void;
    setModifyingPosition: Dispatch<SetStateAction<Position | null>>;
    onClosePosition: (id: string) => void;
    isChild?: boolean;
}

function OpenPositionRowComponent({
    pos,
    isVisible,
    editingCell,
    setEditingCell,
    handleEditComplete,
    setModifyingPosition,
    onClosePosition,
    isChild = false,
}: OpenPositionRowProps) {
    const rawLivePrice = usePriceBySymbol(pos.symbol);

    // Live closing price: bid for buy positions (you sell to close), ask for sell positions (you buy to close).
    // For hedged/aggregated rows where type is ambiguous, fall back to server currentPrice.
    const liveCurrentPrice = (!pos.isHedged && rawLivePrice)
        ? (pos.type === 'buy' ? rawLivePrice.bid : rawLivePrice.ask)
        : pos.currentPrice;

    // Client-side floating P&L when the server provides contractSize on the position.
    // swap is static tick-to-tick, so we include it from the last server value.
    const liveProfit = (!pos.isAggregated && pos.contractSize && rawLivePrice)
        ? ((pos.type === 'buy'
            ? (liveCurrentPrice - pos.openPrice) * pos.volume * pos.contractSize
            : (pos.openPrice - liveCurrentPrice) * pos.volume * pos.contractSize)
            + pos.swap)
        : pos.profit;

    const displayCurrentPrice = liveCurrentPrice;
    const displayProfit = liveProfit;
    const priceDigits = getSafePriceDigits(pos.digits);
    const priceFlashKey = `${pos.id}:${displayCurrentPrice}`;
    const prevPrice = useRef(displayCurrentPrice);
    const priceFlash = displayCurrentPrice > prevPrice.current
        ? 'up'
        : displayCurrentPrice < prevPrice.current
            ? 'down'
            : undefined;
    const isHedged = pos.isHedged;
    const isAggregated = pos.isAggregated;
    const isOptimistic = pos.id.startsWith('optimistic-') || pos.ticket === 'Syncing' || (pos as Position & { isOptimistic?: boolean }).isOptimistic === true;

    useEffect(() => {
        prevPrice.current = displayCurrentPrice;
    }, [displayCurrentPrice]);

    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <>
        <tr 
            onClick={() => { if (isAggregated) setIsExpanded(!isExpanded); }}
            className={`group hover:bg-accent/40 border-b border-border/40 text-foreground text-[11px] h-[30px] ${isAggregated ? 'cursor-pointer bg-accent/20' : 'bg-background'} ${isChild ? 'bg-accent/10' : ''}`}
        >
            <td className="pl-4 py-0 font-bold">
                <div className="flex items-center gap-1.5">
                    {isChild && <div className="w-[10px] h-[10px] border-l border-b border-muted-foreground/30 rounded-bl-[2px] ml-1 mr-[-2px] -mt-1" />}
                    {pos.symbol.includes('OIL') ? (
                        <div className="w-3 h-3 flex items-center justify-center"><Droplet size={10} className="fill-foreground text-foreground" /></div>
                    ) : (
                        <div className="flex h-3 w-[18px] items-center justify-center overflow-hidden">
                            <SymbolIcon symbol={pos.symbol} className="scale-[0.6]" />
                        </div>
                    )}
                    <span>{pos.symbol}</span>
                    {isAggregated && (
                        <span className="bg-accent text-primary text-[10px] px-1.5 rounded-[2px] font-bold ml-1">{pos.aggregatedCount}</span>
                    )}
                </div>
            </td>
            {isVisible('type') && (
                <td className="py-0 font-medium h-full">
                    <div className="flex items-center gap-1.5 h-full">
                        {isHedged ? (
                            <>
                                <div className="w-[6px] h-[6px] rounded-full" style={{ background: 'linear-gradient(to right, hsl(var(--success)) 50%, hsl(var(--destructive)) 50%)' }} />
                                <span className="text-foreground">Hedged</span>
                            </>
                        ) : (
                            <>
                                <div className={`w-[6px] h-[6px] rounded-full ${pos.type === 'buy' ? 'bg-success' : 'bg-destructive'}`} />
                                <span className="text-foreground">{pos.type === 'buy' ? 'Buy' : 'Sell'}</span>
                            </>
                        )}
                    </div>
                </td>
            )}
            {isVisible('volume') && (
                <td className="py-0 font-mono text-foreground">
                    {!isHedged ? (
                        <span className="border-b-[1px] border-dashed border-muted-foreground hover:border-foreground cursor-pointer pb-[1px]">{pos.volume.toFixed(2)}</span>
                    ) : (
                        <span className="text-foreground">{pos.volume.toFixed(2)}</span>
                    )}
                </td>
            )}
            {isVisible('openPrice') && (
                <td className="py-0 font-mono text-foreground">
                    {!isAggregated && pos.openPrice.toFixed(priceDigits)}
                </td>
            )}
            {isVisible('currentPrice') && (
                <td className="py-0 font-mono text-foreground relative">
                    {!isHedged && (
                        <>
                            {priceFlash && (
                                <div
                                    key={priceFlashKey}
                                    className={`quote-flash-overlay ${priceFlash === 'up' ? 'quote-flash-up' : 'quote-flash-down'} -mx-1 rounded-none`}
                                />
                            )}
                            <span className={`relative z-10 transition-colors duration-300 ${priceFlash === 'up' ? 'text-success' : priceFlash === 'down' ? 'text-destructive' : 'text-foreground'}`}>
                                {displayCurrentPrice > 0
                                    ? displayCurrentPrice.toFixed(priceDigits)
                                    : '--'}
                            </span>
                        </>
                    )}
                </td>
            )}
            
            {/* Take Profit */}
            {isVisible('tp') && (
                <td className="py-0 font-mono">
                    {isAggregated ? <span className="text-muted-foreground">--</span> : (
                        <div
                            className={`group/cell relative inline-block ${isOptimistic ? 'cursor-default' : 'cursor-pointer'}`}
                            onClick={() => {
                                if (!isOptimistic) setEditingCell({ id: pos.id, field: 'tp', value: pos.tp ? pos.tp.toString() : '' });
                            }}
                        >
                            {editingCell?.id === pos.id && editingCell?.field === 'tp' ? (
                                <input
                                    autoFocus
                                    className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-[60px] bg-popover text-foreground border border-primary rounded-none outline-none px-1 z-20 font-mono text-[11px] h-[22px]"
                                    value={editingCell?.value || ''}
                                    onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
                                    onBlur={() => handleEditComplete(pos.id, 'tp', editingCell?.value || '')}
                                    onKeyDown={(e) => e.key === 'Enter' && handleEditComplete(pos.id, 'tp', editingCell?.value || '')}
                                />
                            ) : (
                                <span className={`border-b-[1px] border-dashed border-muted-foreground hover:border-foreground pb-[1px] ${pos.tp ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {pos.tp ? pos.tp.toFixed(priceDigits) : 'Add'}
                                </span>
                            )}
                        </div>
                    )}
                </td>
            )}

            {/* Stop Loss */}
            {isVisible('sl') && (
                <td className="py-0 font-mono">
                    {isAggregated ? <span className="text-muted-foreground">--</span> : (
                        <div
                            className={`group/cell relative inline-block ${isOptimistic ? 'cursor-default' : 'cursor-pointer'}`}
                            onClick={() => {
                                if (!isOptimistic) setEditingCell({ id: pos.id, field: 'sl', value: pos.sl ? pos.sl.toString() : '' });
                            }}
                        >
                            {editingCell?.id === pos.id && editingCell?.field === 'sl' ? (
                                <input
                                    autoFocus
                                    className="absolute left-[-4px] top-1/2 -translate-y-1/2 w-[60px] bg-popover text-foreground border border-primary rounded-none outline-none px-1 z-20 font-mono text-[11px] h-[22px]"
                                    value={editingCell?.value || ''}
                                    onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
                                    onBlur={() => handleEditComplete(pos.id, 'sl', editingCell?.value || '')}
                                    onKeyDown={(e) => e.key === 'Enter' && handleEditComplete(pos.id, 'sl', editingCell?.value || '')}
                                />
                            ) : (
                                <span className={`border-b-[1px] border-dashed border-muted-foreground hover:border-foreground pb-[1px] ${pos.sl ? 'text-foreground' : 'text-muted-foreground'}`}>
                                    {pos.sl ? pos.sl.toFixed(priceDigits) : 'Add'}
                                </span>
                            )}
                        </div>
                    )}
                </td>
            )}

            {isVisible('ticket') && (
                <td className="py-0 font-mono text-foreground">
                    {!isAggregated && (isOptimistic ? <span className="text-muted-foreground">--</span> : pos.ticket)}
                </td>
            )}
            {isVisible('openTime') && (
                <td className="py-0 font-mono text-foreground whitespace-nowrap">
                    {formatMt5DateTimeShort(pos.openTime) || pos.openTime}
                </td>
            )}
            {isVisible('swap') && <td className="py-0 font-mono text-muted-foreground">{pos.swap.toFixed(2)}</td>}
            {isVisible('marketCloses') && <td className="py-0 font-mono text-muted-foreground">{typeof pos === 'object' ? '12h 45m' : '--'}</td>}
            
            <td className={`p-0 sticky right-[60px] z-10 bg-background border-b border-border/40 w-[100px] min-w-[100px]`}>
                <div className={`flex items-center justify-end w-full h-full min-h-[30px] pr-3 font-mono font-medium ${displayProfit >= 0 ? 'text-success' : 'text-destructive'} ${isChild ? 'bg-accent/10' : isAggregated ? 'bg-accent/20' : 'bg-transparent'} group-hover:bg-accent/40 transition-colors`}>
                    {displayProfit.toFixed(2)}
                </div>
            </td>

            {/* Action Icons */}
            <td className={`p-0 sticky right-0 z-20 bg-background border-b border-border/40 w-[60px] min-w-[60px]`}>
                <div className={`flex items-center justify-end gap-1 w-full h-full min-h-[30px] pr-2 ${isChild ? 'bg-accent/10' : isAggregated ? 'bg-accent/20' : 'bg-transparent'} group-hover:bg-accent/40 transition-colors`}>
                    {!isAggregated && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isOptimistic) setModifyingPosition(pos);
                            }}
                            className={`p-1 rounded-[2px] transition-all ${isOptimistic ? 'cursor-default text-muted-foreground/35' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                            aria-disabled={isOptimistic ? true : undefined}
                        >
                            <Edit2 size={12} strokeWidth={2} />
                        </button>
                    )}
                    <button
                        onClick={(e) => { 
                            e.stopPropagation();
                            if (!isOptimistic) {
                                if (isAggregated && pos.positions) {
                                    pos.positions.forEach(p => onClosePosition(p.id));
                                } else {
                                    onClosePosition(pos.id);
                                }
                            }
                        }}
                        className={`p-1 rounded-[2px] transition-all ${isOptimistic ? 'cursor-default text-muted-foreground/35' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
                        aria-disabled={isOptimistic ? true : undefined}
                    >
                        <XCircle size={13} strokeWidth={1.5} />
                    </button>
                </div>
            </td>
        </tr>
        {isExpanded && isAggregated && pos.positions.map(subPos => (
            <OpenPositionRow
                key={subPos.id}
                pos={{ ...subPos, isAggregated: false, aggregatedCount: 1, isHedged: false, positions: [subPos] } as DisplayPosition}
                isVisible={isVisible}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                handleEditComplete={handleEditComplete}
                setModifyingPosition={setModifyingPosition}
                onClosePosition={onClosePosition}
                isChild={true}
            />
        ))}
        </>
    );
}

const OpenPositionRow = memo(OpenPositionRowComponent);

interface PendingOrderRowProps {
    order: Order;
    isVisible: (id: string) => boolean | undefined;
}

const getPendingOrderSide = (type: Order['type']) => (
    String(type).toLowerCase().startsWith('sell') ? 'sell' : 'buy'
);

const formatPendingOrderType = (type: Order['type']) => (
    String(type)
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
);

function PendingOrderRowComponent({ order, isVisible }: PendingOrderRowProps) {
    const rawLivePrice = usePriceBySymbol(order.symbol);
    const side = getPendingOrderSide(order.type);
    const currentPrice = rawLivePrice
        ? (side === 'buy' ? rawLivePrice.ask : rawLivePrice.bid)
        : order.priceCurrent;
    const priceDigits = getSafePriceDigits(undefined);
    const openPrice = Number.isFinite(order.openPrice) ? order.openPrice : 0;
    const displayCurrentPrice = Number.isFinite(currentPrice) ? currentPrice : 0;
    const volume = Number.isFinite(order.volumeCurrent) && order.volumeCurrent > 0
        ? order.volumeCurrent
        : order.volume;

    return (
        <tr className="group hover:bg-accent/40 border-b border-border/40 text-foreground text-[11px] h-[30px] bg-background">
            <td className="pl-4 py-0 font-bold">
                <div className="flex items-center gap-1.5">
                    {order.symbol.includes('OIL') ? (
                        <div className="w-3 h-3 flex items-center justify-center"><Droplet size={10} className="fill-foreground text-foreground" /></div>
                    ) : (
                        <div className="flex h-3 w-[18px] items-center justify-center overflow-hidden">
                            <SymbolIcon symbol={order.symbol} className="scale-[0.6]" />
                        </div>
                    )}
                    <span>{order.symbol}</span>
                </div>
            </td>
            {isVisible('type') && (
                <td className="py-0 font-medium h-full">
                    <div className="flex items-center gap-1.5 h-full">
                        <div className={`w-[6px] h-[6px] rounded-full ${side === 'buy' ? 'bg-success' : 'bg-destructive'}`} />
                        <span className="text-foreground">{formatPendingOrderType(order.type)}</span>
                    </div>
                </td>
            )}
            {isVisible('volume') && (
                <td className="py-0 font-mono text-foreground">{volume.toFixed(2)}</td>
            )}
            {isVisible('openPrice') && (
                <td className="py-0 font-mono text-foreground">
                    {openPrice > 0 ? openPrice.toFixed(priceDigits) : '--'}
                </td>
            )}
            {isVisible('currentPrice') && (
                <td className="py-0 font-mono text-foreground">
                    {displayCurrentPrice > 0 ? displayCurrentPrice.toFixed(priceDigits) : '--'}
                </td>
            )}
            {isVisible('tp') && (
                <td className="py-0 font-mono text-muted-foreground">
                    {order.tp ? order.tp.toFixed(priceDigits) : '--'}
                </td>
            )}
            {isVisible('sl') && (
                <td className="py-0 font-mono text-muted-foreground">
                    {order.sl ? order.sl.toFixed(priceDigits) : '--'}
                </td>
            )}
            {isVisible('ticket') && (
                <td className="py-0 font-mono text-foreground">{order.ticket}</td>
            )}
            {isVisible('openTime') && (
                <td className="py-0 font-mono text-foreground whitespace-nowrap">
                    {formatMt5DateTimeShort(order.openTime) || String(order.openTime)}
                </td>
            )}
            {isVisible('swap') && (
                <td className="py-0 font-mono text-muted-foreground capitalize">{order.state}</td>
            )}
            {isVisible('marketCloses') && <td className="py-0 font-mono text-muted-foreground">--</td>}
            <td className="p-0 sticky right-[60px] z-10 bg-background border-b border-border/40 w-[100px] min-w-[100px]">
                <div className="flex items-center justify-end w-full h-full min-h-[30px] pr-3 font-mono font-medium text-muted-foreground group-hover:bg-accent/40 transition-colors">
                    --
                </div>
            </td>
            <td className="p-0 sticky right-0 z-20 bg-background border-b border-border/40 w-[60px] min-w-[60px]">
                <div className="flex items-center justify-end gap-1 w-full h-full min-h-[30px] pr-2 group-hover:bg-accent/40 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">Pending</span>
                </div>
            </td>
        </tr>
    );
}

const PendingOrderRow = memo(PendingOrderRowComponent);
