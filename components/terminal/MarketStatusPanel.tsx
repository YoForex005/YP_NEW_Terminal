'use client';

import { X, RefreshCw, Search, CheckCircle2, AlertTriangle, XCircle, Activity } from 'lucide-react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';
import { formatMt5TimeOnly } from '@/lib/mt5-time';

// ── Types ──────────────────────────────────────────────────────────────────

type MarketTradeMode = 'full' | 'longonly' | 'shortonly' | 'closeonly' | 'disabled';

interface MarketSymbolStatus {
    symbol: string;
    description: string;
    category: string;
    tradeMode: MarketTradeMode;
    isOpen: boolean;
    isClosing: boolean;
    isClosed: boolean;
}

interface MarketStatusData {
    checkedAt: string;
    total: number;
    openCount: number;
    closingCount: number;
    closedCount: number;
    symbols: MarketSymbolStatus[];
}

interface MarketStatusPanelProps {
    accountId: string;
    onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const TRADE_MODE_LABELS: Record<MarketTradeMode, string> = {
    full: 'Full Trading',
    longonly: 'Long Only',
    shortonly: 'Short Only',
    closeonly: 'Close Only',
    disabled: 'Disabled',
};

const CategoryDot = ({ category }: { category: string }) => {
    const colors: Record<string, string> = {
        forex: 'bg-blue-500',
        crypto: 'bg-orange-500',
        commodity: 'bg-yellow-500',
        index: 'bg-purple-500',
        metals: 'bg-yellow-400',
        energies: 'bg-red-400',
    };
    return (
        <span
            className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[category] ?? 'bg-muted-foreground/50'}`}
        />
    );
};

// ── Main Component ────────────────────────────────────────────────────────

export default function MarketStatusPanel({ accountId, onClose }: MarketStatusPanelProps) {
    const [data, setData] = useState<MarketStatusData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [filterTab, setFilterTab] = useState<'all' | 'open' | 'closing' | 'closed'>('all');
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchStatus = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);

        if (abortRef.current) {
            abortRef.current.abort();
        }
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch(
                `/api/trading/symbols/market-status?accountId=${encodeURIComponent(accountId)}`,
                { signal: controller.signal, cache: 'no-store' },
            );
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json.error ?? `HTTP ${res.status}`);
            }
            setData(json as MarketStatusData);
            setLastRefreshed(new Date());
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return;
            setError(err instanceof Error ? err.message : 'Failed to fetch market status');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [accountId]);

    // Initial fetch + auto-refresh every 30s
    useEffect(() => {
        void fetchStatus();
        intervalRef.current = setInterval(() => { void fetchStatus(true); }, 30_000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            abortRef.current?.abort();
        };
    }, [fetchStatus]);

    const filteredSymbols = useMemo(() => {
        if (!data) return [];
        const q = search.trim().toLowerCase();
        return data.symbols.filter((s) => {
            const matchesFilter =
                filterTab === 'all' ||
                (filterTab === 'open' && s.isOpen) ||
                (filterTab === 'closing' && s.isClosing) ||
                (filterTab === 'closed' && s.isClosed);
            const matchesSearch =
                !q ||
                s.symbol.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q) ||
                s.category.toLowerCase().includes(q);
            return matchesFilter && matchesSearch;
        });
    }, [data, filterTab, search]);

    const formatTime = (iso: string) => {
        try {
            return formatMt5TimeOnly(new Date(iso).getTime()) || iso;
        } catch {
            return iso;
        }
    };

    const StatusBadge = ({ sym }: { sym: MarketSymbolStatus }) => {
        if (sym.isOpen) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-[2px] text-[9px] font-bold tracking-widest uppercase bg-success/15 text-success border border-success/20">
                    <span className="w-1 h-1 rounded-full bg-success animate-pulse" />
                    OPEN
                </span>
            );
        }
        if (sym.isClosing) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-[2px] text-[9px] font-bold tracking-widest uppercase bg-warning/15 text-warning border border-warning/20">
                    <AlertTriangle size={8} />
                    CLOSING
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-[2px] rounded-[2px] text-[9px] font-bold tracking-widest uppercase bg-destructive/10 text-destructive border border-destructive/20">
                <XCircle size={8} />
                CLOSED
            </span>
        );
    };

    const tabs: { key: typeof filterTab; label: string; count?: number }[] = [
        { key: 'all', label: 'All', count: data?.total },
        { key: 'open', label: 'Open', count: data?.openCount },
        { key: 'closing', label: 'Closing', count: data?.closingCount },
        { key: 'closed', label: 'Closed', count: data?.closedCount },
    ];

    return (
        <div className="flex flex-col h-full w-full select-none bg-background text-foreground font-sans overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-3 h-[42px] flex-shrink-0 border-b border-border">
                <div className="flex items-center gap-2">
                    <Activity size={13} className="text-primary" />
                    <span className="text-[11px] font-bold text-foreground/85 tracking-widest uppercase">Market Status</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => fetchStatus()}
                        disabled={loading}
                        className="w-[24px] h-[24px] flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all disabled:opacity-40"
                        title="Refresh"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={onClose}
                        className="w-[24px] h-[24px] flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {data && (
                <div className="grid grid-cols-3 gap-2 px-3 py-2 flex-shrink-0 border-b border-border">
                    <div className="flex flex-col items-center justify-center py-2 rounded-[3px] bg-success/10 border border-success/20">
                        <CheckCircle2 size={13} className="text-success mb-1" />
                        <span className="text-[18px] font-bold text-success tabular-nums">{data.openCount}</span>
                        <span className="text-[9px] text-success/70 font-semibold tracking-widest uppercase">Open</span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-2 rounded-[3px] bg-warning/10 border border-warning/20">
                        <AlertTriangle size={13} className="text-warning mb-1" />
                        <span className="text-[18px] font-bold text-warning tabular-nums">{data.closingCount}</span>
                        <span className="text-[9px] text-warning/70 font-semibold tracking-widest uppercase">Closing</span>
                    </div>
                    <div className="flex flex-col items-center justify-center py-2 rounded-[3px] bg-destructive/10 border border-destructive/20">
                        <XCircle size={13} className="text-destructive mb-1" />
                        <span className="text-[18px] font-bold text-destructive tabular-nums">{data.closedCount}</span>
                        <span className="text-[9px] text-destructive/70 font-semibold tracking-widest uppercase">Closed</span>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="px-3 py-2 flex-shrink-0 border-b border-border">
                <div className="relative group/search">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 group-focus-within/search:text-foreground/70 transition-colors" size={13} />
                    <input
                        type="text"
                        placeholder="Search symbol, description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-[26px] pl-8 pr-3 rounded-[3px] bg-accent/30 border border-border text-foreground placeholder:text-muted-foreground/50 text-[11px] focus:outline-none focus:border-primary/40 transition-all"
                    />
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center px-3 gap-1 flex-shrink-0 border-b border-border py-1.5">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setFilterTab(tab.key)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-[3px] text-[10px] font-semibold transition-all ${
                            filterTab === tab.key
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 border border-transparent'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className={`tabular-nums px-1 rounded-sm text-[9px] ${filterTab === tab.key ? 'bg-primary/20 text-primary' : 'bg-muted/30 text-muted-foreground'}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Last refreshed */}
            {lastRefreshed && (
                <div className="px-3 py-1 flex-shrink-0">
                    <span className="text-[9px] text-muted-foreground/50 font-mono">
                        Live from MT5 · Updated {formatTime(lastRefreshed.toISOString())} · auto-refresh 30s
                    </span>
                </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {loading && !data && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/60">
                        <RefreshCw size={20} className="animate-spin" />
                        <span className="text-[12px]">Fetching live data from MT5...</span>
                    </div>
                )}

                {error && (
                    <div className="mx-3 mt-4 p-3 rounded-[4px] bg-destructive/10 border border-destructive/20">
                        <p className="text-[11px] font-semibold text-destructive mb-1">Failed to load market status</p>
                        <p className="text-[10px] text-destructive/70 font-mono break-all">{error}</p>
                        <button
                            onClick={() => fetchStatus()}
                            className="mt-2 text-[10px] text-primary hover:underline font-semibold"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && data && filteredSymbols.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground/50">
                        <Search size={18} />
                        <span className="text-[11px]">No symbols match your filter</span>
                    </div>
                )}

                {filteredSymbols.length > 0 && (
                    <table className="w-full border-collapse text-[11px]">
                        <thead className="sticky top-0 bg-card z-10 border-b border-border select-none text-muted-foreground/70 uppercase tracking-wider text-[9px]">
                            <tr>
                                <th className="text-left font-semibold py-[5px] px-3">Symbol</th>
                                <th className="text-center font-semibold py-[5px] px-2 w-[80px]">Status</th>
                                <th className="text-left font-semibold py-[5px] px-2 hidden sm:table-cell">Mode</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSymbols.map((sym) => (
                                <tr
                                    key={sym.symbol}
                                    className={`border-b border-border/40 transition-colors hover:bg-accent/30 ${
                                        sym.isClosed ? 'opacity-60' : ''
                                    }`}
                                >
                                    <td className="py-[5px] px-3">
                                        <div className="flex items-center gap-2">
                                            <CategoryDot category={sym.category} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-semibold text-foreground/90 truncate">
                                                    {formatTerminalDisplaySymbol(sym.symbol)}
                                                </span>
                                                {sym.description && sym.description !== sym.symbol && (
                                                    <span className="text-[9px] text-muted-foreground/60 truncate max-w-[120px]">
                                                        {sym.description}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-[5px] px-2 text-center">
                                        <StatusBadge sym={sym} />
                                    </td>
                                    <td className="py-[5px] px-2 hidden sm:table-cell">
                                        <span className="text-[9px] text-muted-foreground/60 font-mono">
                                            {TRADE_MODE_LABELS[sym.tradeMode]}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
