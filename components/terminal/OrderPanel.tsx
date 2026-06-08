import React, { memo, useRef, useState, useMemo, useEffect, useSyncExternalStore } from 'react';
import type { Instrument } from '@/lib/terminal/types';
import { ChevronDown, Minus, Plus, HelpCircle } from 'lucide-react';
import { formatTerminalDisplaySymbol, getSafeLiveQuoteSnapshotBySymbol } from '@/lib/trading/terminal-symbols';
import { useWebtraderStore, subscribeToLivePriceBySymbol, getLivePriceSnapshotBySymbol } from '@/store/webtrader-store';

type TradeSide = 'buy' | 'sell';
type OrderTab = 'market' | 'pending';
type FormType = 'regular' | 'one-click' | 'risk-calculator';

type QuoteSource = 'live' | 'ohlc' | 'none';

interface OrderPanelProps {
    instrument: Instrument & {
        quoteSource?: QuoteSource;
        hasExecutableQuote?: boolean;
        bidDirection?: 'up' | 'down' | 'same';
        askDirection?: 'up' | 'down' | 'same';
    };
    onClose: () => void;
    onPlaceOrder?: (order: {
        symbol: string;
        type: TradeSide;
        orderType: 'market' | 'limit' | 'stop';
        volume: number;
        price?: number;
        tp: number | null;
        sl: number | null;
    }) => Promise<void> | void;
}

type PlaceOrderRequest = Parameters<NonNullable<OrderPanelProps['onPlaceOrder']>>[0];

// Quote flash is CSS-driven so hot tick updates do not create timer churn.
const getQuoteFlashClass = (
    direction?: 'up' | 'down' | 'same',
    side?: 'bid' | 'ask',
) => {
    if (direction === 'up') return side === 'ask' ? 'quote-flash-buy' : 'quote-flash-up';
    if (direction === 'down') return 'quote-flash-down';
    return 'quote-flash-tick';
};

const getQuoteFlashKey = (symbol: string, side: 'bid' | 'ask', value: number, time: unknown) => {
    const tickTime = time instanceof Date
        ? time.getTime()
        : typeof time === 'string' || typeof time === 'number'
            ? time
            : '';
    return `${symbol}:${side}:${value}:${tickTime}`;
};

const getDisplayBid = (bid: number, ask: number, last: number) =>
    bid > 0 ? bid : bid <= 0 && ask <= 0 && last > 0 ? last : 0;

const getDisplayAsk = (bid: number, ask: number, last: number) =>
    ask > 0 ? ask : bid <= 0 && ask <= 0 && last > 0 ? last : 0;

const getSafeOrderPanelLivePriceSnapshot = (symbol: string) =>
    getSafeLiveQuoteSnapshotBySymbol(
        symbol,
        getLivePriceSnapshotBySymbol,
        useWebtraderStore.getState().prices,
    );

// ─── Stepper Input Component ────────────────────────────────────────────────
const toPositiveFinite = (value: unknown, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getVolumeDecimals = (step: number) => {
    if (!Number.isFinite(step) || step <= 0) return 2;
    const normalized = step.toString().toLowerCase();
    if (normalized.includes('e-')) {
        return Math.min(8, Number.parseInt(normalized.split('e-')[1] ?? '2', 10) || 2);
    }
    const [, fraction = ''] = normalized.split('.');
    return Math.min(8, fraction.replace(/0+$/, '').length);
};

const normalizeVolumeToSpec = (
    value: number,
    spec: { min: number; max: number; step: number; decimals: number },
) => {
    if (!Number.isFinite(value) || value <= 0) {
        return spec.min;
    }

    const capped = Math.min(spec.max, Math.max(spec.min, value));
    const base = spec.min > 0 ? spec.min : 0;
    const steps = Math.round((capped - base) / spec.step);
    const aligned = base + steps * spec.step;
    const fixed = Number(aligned.toFixed(spec.decimals));
    return Math.min(spec.max, Math.max(spec.min, fixed));
};

const formatVolume = (
    value: number,
    spec: { min: number; max: number; step: number; decimals: number },
) => normalizeVolumeToSpec(value, spec).toFixed(spec.decimals);

function StepInput({
    label,
    value,
    placeholder,
    suffix,
    suffixOptions,
    onMinus,
    onPlus,
    onChange,
    hint,
    icon,
}: {
    label?: string;
    value: string;
    placeholder?: string;
    suffix?: string;
    suffixOptions?: string[];
    onMinus: () => void;
    onPlus: () => void;
    onChange?: (v: string) => void;
    hint?: string;
    icon?: React.ReactNode;
}) {
    const [localSuffix, setLocalSuffix] = useState(suffix || '');
    const [showSuffixDrop, setShowSuffixDrop] = useState(false);
    const activeSuffix = suffixOptions ? localSuffix || (suffixOptions[0] ?? '') : suffix;

    return (
        <div className="space-y-[4px]">
            {label && (
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
                    {icon && <span className="text-muted-foreground/75 cursor-help hover:text-foreground transition-colors">{icon}</span>}
                </div>
            )}
            <div className="flex items-stretch h-[30px] rounded-[3px] border border-border bg-transparent focus-within:border-primary/60 transition-colors relative overflow-hidden">
                {/* Text input area */}
                <input
                    type="text"
                    value={value}
                    placeholder={placeholder ?? 'Not set'}
                    onChange={(e) => onChange?.(e.target.value)}
                    className="flex-1 min-w-0 bg-transparent px-2 text-[12px] text-foreground focus:outline-none font-medium tabular-nums placeholder:text-muted-foreground/50"
                />
                
                {/* Right side items: Suffix + Stepper */}
                <div className="flex items-center flex-shrink-0 h-full">
                    {suffixOptions ? (
                        <div className="relative h-full border-l border-border">
                            <button
                                onClick={() => setShowSuffixDrop(p => !p)}
                                className="flex items-center h-full gap-0.5 px-2 bg-transparent text-muted-foreground text-[11px] font-semibold hover:text-foreground transition-colors"
                            >
                                {activeSuffix}
                                <ChevronDown size={10} className="text-muted-foreground" />
                            </button>
                            {showSuffixDrop && (
                                <>
                                    <div className="fixed inset-0 z-[199]" onClick={() => setShowSuffixDrop(false)} />
                                    <div className="absolute right-0 top-full mt-1 w-[80px] bg-popover border border-border rounded-[3px] shadow-lg py-1 z-[200] text-[11px]">
                                        {suffixOptions.map(opt => (
                                            <div
                                                key={opt}
                                                onClick={() => { setLocalSuffix(opt); setShowSuffixDrop(false); }}
                                                className={`px-2.5 py-1.5 cursor-pointer hover:bg-background transition-colors ${localSuffix === opt ? 'text-primary font-semibold' : 'text-foreground'}`}
                                            >
                                                {opt}
                                            </div>
                                        ))}
                                    </div>
                                </>
                             )}
                        </div>
                    ) : activeSuffix ? (
                        <span className="text-muted-foreground text-[11px] font-semibold px-2 h-full flex items-center border-l border-border">{activeSuffix}</span>
                    ) : null}

                    {/* Stepper buttons (Minus and Plus) */}
                    <div className="flex items-center h-full gap-0 border-l border-border">
                        <button
                            type="button"
                            onClick={onMinus}
                            className="w-[24px] h-full flex items-center justify-center bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent transition-all border-r border-border"
                        >
                            <Minus size={11} strokeWidth={2.5} />
                        </button>
                        <button
                            type="button"
                            onClick={onPlus}
                            className="w-[24px] h-full flex items-center justify-center bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                        >
                            <Plus size={11} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>
            </div>
            {hint && <div className="text-[10px] text-muted-foreground/60 pl-0.5">{hint}</div>}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
function OrderPanel({ instrument, onClose, onPlaceOrder }: OrderPanelProps) {
    const accountInfo = useWebtraderStore((state) => state.accountInfo);
    const symbolSpec = useWebtraderStore((state) =>
        state.symbols.find((symbol) => symbol.name === instrument.symbol),
    );
    const rawLivePrice = useSyncExternalStore(
        (listener) => subscribeToLivePriceBySymbol(instrument.symbol, listener),
        () => getSafeOrderPanelLivePriceSnapshot(instrument.symbol),
        () => getSafeOrderPanelLivePriceSnapshot(instrument.symbol),
    );
    const activeAction = useWebtraderStore((state) => state.activeAction);
    const setActiveAction = useWebtraderStore((state) => state.setActiveAction);
    const updateOrderForm = useWebtraderStore((state) => state.updateOrderForm);

    const [tab, setTab] = useState<OrderTab>('market');
    const [formType, setFormType] = useState<FormType>('regular');
    
    // Instead of local state, initialize to whatever activeAction is or 'buy'
    const selectedSide = activeAction || 'buy';
    const setSelectedSide = (side: TradeSide) => {
        setSelectedSideInStore(side);
    };

    const setSelectedSideInStore = (side: TradeSide) => {
        setActiveAction(side);
    };

    // When the order panel unmounts or tab changes to pending, clear the draft
    useEffect(() => {
        if (tab !== 'market' && activeAction !== null) {
            setActiveAction(null);
        }
    }, [tab, activeAction, setActiveAction]);

    useEffect(() => {
        return () => setActiveAction(null);
    }, [setActiveAction]);

    useEffect(() => {
        const handler = () => setActiveAction(null);
        window.addEventListener('terminal:cancel-draft-order', handler);
        return () => window.removeEventListener('terminal:cancel-draft-order', handler);
    }, [setActiveAction]);

    const [isFormDropOpen, setIsFormDropOpen] = useState(false);
    const [volume, setVolume] = useState('0.01');
    const [tp, setTp] = useState('');
    const [sl, setSl] = useState('');
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [pendingPrice, setPendingPrice] = useState('');
    const [lastInitializedSide, setLastInitializedSide] = useState<TradeSide | null>(null);

    const liveInstrumentBid = instrument.quoteSource === 'live' && instrument.hasExecutableQuote === true && instrument.bid > 0 ? instrument.bid : 0;
    const liveInstrumentAsk = instrument.quoteSource === 'live' && instrument.hasExecutableQuote === true && instrument.ask > 0 ? instrument.ask : 0;
    const liveBid = (rawLivePrice?.bid ?? 0) > 0 ? rawLivePrice?.bid ?? 0 : liveInstrumentBid;
    const liveAsk = (rawLivePrice?.ask ?? 0) > 0 ? rawLivePrice?.ask ?? 0 : liveInstrumentAsk;
    const hasLiveQuote = liveBid > 0 && liveAsk > 0;
    const bid = hasLiveQuote ? liveBid : instrument.bid;
    const ask = hasLiveQuote ? liveAsk : instrument.ask;
    const volumeSpec = useMemo(() => {
        const min = toPositiveFinite(symbolSpec?.volumeMin, 0.01);
        const step = toPositiveFinite(symbolSpec?.volumeStep, min);
        const max = toPositiveFinite(symbolSpec?.volumeMax, Number.MAX_SAFE_INTEGER);
        const decimals = getVolumeDecimals(step);
        return { min, max: Math.max(min, max), step, decimals };
    }, [symbolSpec?.volumeMin, symbolSpec?.volumeMax, symbolSpec?.volumeStep]);

    useEffect(() => {
        setVolume((current) => formatVolume(parseFloat(current), volumeSpec));
    }, [instrument.symbol, volumeSpec]);

    // Auto-fill default SL and TP so the chart instantly shows all three lines
    useEffect(() => {
        if (!hasLiveQuote || activeAction === null) {
            if (activeAction === null && lastInitializedSide !== null) {
                setLastInitializedSide(null);
                setTp('');
                setSl('');
            }
            return;
        }

        if (selectedSide !== lastInitializedSide) {
            const entry = selectedSide === 'buy' ? ask : bid;
            if (entry > 0) {
                const offset = entry * 0.003; // Default 0.3% offset
                const defaultTp = selectedSide === 'buy' ? entry + offset : entry - offset;
                const defaultSl = selectedSide === 'buy' ? entry - offset : entry + offset;
                
                setTp(defaultTp.toFixed(instrument.digits));
                setSl(defaultSl.toFixed(instrument.digits));
                setLastInitializedSide(selectedSide);
            }
        }
    }, [selectedSide, lastInitializedSide, hasLiveQuote, ask, bid, instrument.digits, activeAction]);

    // Sync local state to store so the chart draft order instantly mirrors these values
    useEffect(() => {
        updateOrderForm({
            volume: normalizeVolumeToSpec(parseFloat(volume), volumeSpec),
            sl: sl ? parseFloat(sl) : null,
            tp: tp ? parseFloat(tp) : null,
        });
    }, [volume, sl, tp, updateOrderForm, volumeSpec]);

    // Refs for zero-overhead bid/ask text updates — written directly in the
    // subscription callback, bypassing React's render cycle entirely.
    const sellPriceRef = useRef<HTMLSpanElement>(null);
    const buyPriceRef = useRef<HTMLSpanElement>(null);
    const instrumentRef = useRef(instrument);
    instrumentRef.current = instrument;

    useEffect(() => {
        const updateFromSnap = () => {
            const snap = getSafeOrderPanelLivePriceSnapshot(instrument.symbol);
            if (!snap) return;
            const inst = instrumentRef.current;
            const fmt = (v: number) => v > 0 ? v.toFixed(inst.digits) : '--';
            const snapBid = snap.bid ?? 0;
            const snapAsk = snap.ask ?? 0;
            const snapLast = snap.last ?? 0;
            if (sellPriceRef.current) sellPriceRef.current.textContent = fmt(getDisplayBid(snapBid, snapAsk, snapLast));
            if (buyPriceRef.current) buyPriceRef.current.textContent = fmt(getDisplayAsk(snapBid, snapAsk, snapLast));
        };
        updateFromSnap();
        return subscribeToLivePriceBySymbol(instrument.symbol, updateFromSnap);
    }, [instrument.symbol]);

    const isIndicativeQuote = !hasLiveQuote && instrument.quoteSource === 'ohlc';
    const canSubmitSideOrder = (_side: TradeSide) => hasLiveQuote;
    const canSubmitOrder = canSubmitSideOrder(selectedSide);
    const formatQuote = (value: number) => (value > 0 ? `${isIndicativeQuote ? '~' : ''}${value.toFixed(instrument.digits)}` : '--');
    const bidDir = hasLiveQuote ? rawLivePrice?.bidDirection ?? instrument.bidDirection : undefined;
    const askDir = hasLiveQuote ? rawLivePrice?.askDirection ?? instrument.askDirection : undefined;
    const rawBidIsLive = (rawLivePrice?.bid ?? 0) > 0;
    const rawAskIsLive = (rawLivePrice?.ask ?? 0) > 0;
    const bidFlashClass = rawBidIsLive && bid > 0 ? getQuoteFlashClass(rawLivePrice?.bidDirection, 'bid') : '';
    const askFlashClass = rawAskIsLive && ask > 0 ? getQuoteFlashClass(rawLivePrice?.askDirection, 'ask') : '';
    const quoteFlashTickKey = rawLivePrice?.receivedSequence ?? rawLivePrice?.receivedAtMs ?? rawLivePrice?.time;

    const spread = Math.abs(ask - bid);
    const pointSize = symbolSpec?.point && symbolSpec.point > 0
        ? symbolSpec.point
        : instrument.pipSize > 0
            ? instrument.pipSize
            : 1 / Math.pow(10, instrument.digits);
    const spreadPoints = pointSize > 0 ? spread / pointSize : 0;
    const spreadLabel = Number.isFinite(spreadPoints)
        ? `${spreadPoints.toFixed(spreadPoints >= 10 ? 1 : 2)} pts`
        : spread.toFixed(Math.min(instrument.digits, 4));
    const leverageRatio = accountInfo?.leverage && accountInfo.leverage > 0 ? accountInfo.leverage : null;
    const quoteStatusLabel = hasLiveQuote
        ? 'Live server quote'
        : isIndicativeQuote
            ? 'Indicative chart price'
            : 'Awaiting live quote';

    // dynamic sentiment combining 24h change and real-time tick jitter
    const basePct = 50 + (instrument.changePercent * 10);
    // Use the live bid price to create a fluctuating +/- 12% jitter
    const jitter = liveBid > 0 ? ((liveBid * 100000) % 24) - 12 : 0;
    const bullPct = Math.min(92, Math.max(8, basePct + jitter));
    const bearPct = 100 - bullPct;
    const sellSentiment = Math.round(bearPct);
    const buySentiment = Math.round(bullPct);

    const pendingType = useMemo<'limit' | 'stop'>(() => {
        if (!pendingPrice) return 'limit';
        const p = parseFloat(pendingPrice);
        // Buy: limit if price is below ask (buy cheaper), stop if above (buy on breakout).
        // Sell: limit if price is above bid (sell higher), stop if below (sell on breakdown).
        return selectedSide === 'buy' ? (p < ask ? 'limit' : 'stop') : (p > bid ? 'limit' : 'stop');
    }, [pendingPrice, ask, bid, selectedSide]);

    const adjustVolume = (delta: number) => {
        setVolume(formatVolume(parseFloat(volume) + delta, volumeSpec));
    };

    const pipStep = 1 / Math.pow(10, instrument.digits);

    // ── Listen for drag-set-sl-tp events dispatched by the chart live-price drag. ──
    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent<{ symbol: string; type: 'TP' | 'SL'; price: number | null; digits: number }>).detail;
            if (!detail) return;
            const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            if (normalize(detail.symbol) !== normalize(instrument.symbol)) return;

            if (detail.price === null) {
                if (detail.type === 'TP') setTp('');
                else if (detail.type === 'SL') setSl('');
                return;
            }

            const digits = Number.isFinite(detail.digits) ? detail.digits : instrument.digits;
            const formatted = detail.price.toFixed(digits);
            if (detail.type === 'TP') {
                setTp(formatted);
            } else {
                setSl(formatted);
            }
        };
        window.addEventListener('terminal:drag-set-sl-tp', handler as EventListener);
        return () => window.removeEventListener('terminal:drag-set-sl-tp', handler as EventListener);
    }, [instrument.symbol, instrument.digits]);

    const adjustPrice = (type: 'tp' | 'sl' | 'pending', delta: number) => {
        const setters = { tp: setTp, sl: setSl, pending: setPendingPrice };
        const getters = { tp: tp, sl: sl, pending: pendingPrice };
        const base = type === 'tp' ? ask : bid;
        const current = getters[type] ? parseFloat(getters[type]) : base;
        const next = current + delta * pipStep;
        setters[type](next.toFixed(instrument.digits));
    };

    const handlePlaceOrder = async (side: TradeSide) => {
        if (!canSubmitSideOrder(side)) {
            return;
        }
        if (formType !== 'one-click' && isPlacingOrder) {
            return;
        }

        const vol = normalizeVolumeToSpec(parseFloat(volume), volumeSpec);
        if (!vol || vol <= 0) return;
        const orderPrice = tab === 'market'
            ? undefined
            : (parseFloat(pendingPrice) || (side === 'buy' ? ask : bid));
        const nextOrder: PlaceOrderRequest = {
            symbol: instrument.symbol,
            type: side,
            orderType: tab === 'market' ? 'market' : pendingType,
            volume: vol,
            tp: tp ? parseFloat(tp) : null,
            sl: sl ? parseFloat(sl) : null,
            ...(orderPrice !== undefined ? { price: orderPrice } : {}),
        };

        setIsPlacingOrder(true);
        try {
            await onPlaceOrder?.(nextOrder);
        } finally {
            setIsPlacingOrder(false);
        }
    };

    const formLabels: Record<FormType, string> = {
        regular: 'Regular form',
        'one-click': 'One-click form',
        'risk-calculator': 'Risk calculator',
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background font-sans text-foreground select-none">

            {/* ── Form Body ─────────────────────────────────────── */}
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-4 py-4">

                {/* ── Form Type Dropdown ─── */}
                <div className="relative z-[60]">
                    <button
                        onClick={() => setIsFormDropOpen(p => !p)}
                        className={`w-full flex items-center justify-between px-3 h-[30px] text-[12px] rounded-[3px] border transition-all duration-200
                            ${isFormDropOpen
                                ? 'bg-accent border-border text-foreground'
                                : 'bg-card border-border text-foreground hover:border-border/80 hover:bg-accent/40'
                            }`}
                    >
                        <span>{formLabels[formType]}</span>
                        <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${isFormDropOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isFormDropOpen && (
                        <>
                            <div className="fixed inset-0 z-[99]" onClick={() => setIsFormDropOpen(false)} />
                            <div className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-[3px] shadow-lg z-[100] p-1 flex flex-col gap-0.5 animate-in fade-in slide-in-from-top-2 duration-150">
                                {(Object.entries(formLabels) as [FormType, string][]).map(([key, label]) => (
                                    <button
                                        key={key}
                                        onClick={() => { setFormType(key); setIsFormDropOpen(false); }}
                                        className={`px-3 py-1.5 text-left text-[12px] rounded-[2px] transition-colors w-full
                                            ${formType === key
                                                ? 'bg-background text-foreground font-bold'
                                                : 'text-muted-foreground hover:bg-background hover:text-foreground'
                                            }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ── SELL / BUY Price Boxes (Exness-style transparent boxes) ─── */}
                <div className="relative">
                    <div className="flex gap-[2px] h-[60px] min-w-0">
                        {/* SELL box */}
                        <div className={`min-w-0 flex-1 flex flex-col items-start justify-between p-2 pb-[14px] rounded-[6px] cursor-pointer transition-all group relative border
                                ${selectedSide === 'sell'
                                    ? 'border-destructive/80 bg-destructive/5'
                                    : 'border-destructive/40 bg-transparent hover:border-destructive/60'}`}
                             onClick={() => formType === 'one-click' && canSubmitSideOrder('sell') ? handlePlaceOrder('sell') : setSelectedSide('sell')}>
                            {bidFlashClass && (
                                <span key={getQuoteFlashKey(instrument.symbol, 'bid', bid, quoteFlashTickKey)} className={`quote-flash-overlay ${bidFlashClass}`} />
                            )}
                            <span className={`quote-flash-content text-[11px] font-medium leading-none tracking-wide uppercase ${selectedSide === 'sell' ? 'text-destructive' : 'text-destructive/70'}`}>Sell</span>
                            <span ref={sellPriceRef} className={`quote-flash-content w-full text-[15px] tabular-nums leading-none font-bold tracking-tight ${selectedSide === 'sell' ? 'text-destructive' : 'text-destructive/90'}`}>
                                {formatQuote(bid)}
                            </span>
                        </div>

                        {/* BUY box */}
                        <div className={`min-w-0 flex-1 flex flex-col items-end justify-between p-2 pb-[14px] rounded-[6px] cursor-pointer transition-all group relative border
                                ${selectedSide === 'buy'
                                    ? 'border-success/80 bg-success/5'
                                    : 'border-success/40 bg-transparent hover:border-success/60'}`}
                             onClick={() => formType === 'one-click' && canSubmitSideOrder('buy') ? handlePlaceOrder('buy') : setSelectedSide('buy')}>
                            {askFlashClass && (
                                <span key={getQuoteFlashKey(instrument.symbol, 'ask', ask, quoteFlashTickKey)} className={`quote-flash-overlay ${askFlashClass}`} />
                            )}
                            <span className={`quote-flash-content text-[11px] font-medium leading-none tracking-wide uppercase ${selectedSide === 'buy' ? 'text-success' : 'text-success/70'}`}>Buy</span>
                            <span ref={buyPriceRef} className={`quote-flash-content w-full text-right text-[15px] tabular-nums leading-none font-bold tracking-tight ${selectedSide === 'buy' ? 'text-success' : 'text-success/90'}`}>
                                {formatQuote(ask)}
                            </span>
                        </div>
                    </div>
                    
                    {/* Spread badge placed exactly between Buy and Sell */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[18px] flex items-center justify-center z-10 px-1.5 min-w-[64px]" data-test="spread">
                        {/* Background layers to cover the borders underneath and provide the cutout borders */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1/2 rounded-tl-[4px] border-t border-l bg-background ${selectedSide === 'sell' ? 'border-destructive/80' : 'border-destructive/40'}`}></div>
                        <div className={`absolute right-0 top-0 bottom-0 w-1/2 rounded-tr-[4px] border-t border-r bg-background ${selectedSide === 'buy' ? 'border-success/80' : 'border-success/40'}`}></div>
                        
                        {/* Content */}
                        <span className="relative z-10 text-[9px] font-bold text-foreground whitespace-nowrap tracking-wide" data-test="spread-tooltip">
                            {hasLiveQuote ? spreadLabel : '--'}
                        </span>
                    </div>
                </div>

                {!hasLiveQuote && (
                    <div className="rounded-[3px] border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-200 mt-1">
                        {isIndicativeQuote
                            ? 'Showing an indicative chart price while live bid/ask warms up. Market orders stay blocked until the MT5 quote feed sends a real tick.'
                            : 'No live bid/ask is available for this instrument yet. Market orders will stay blocked until the MT5 quote feed recovers.'}
                    </div>
                )}

                {/* ── Sentiment bar ─── */}
                <div className="flex flex-col gap-1 mt-1.5 mb-1">
                    <div className="flex items-center gap-2 text-[12px] font-medium relative h-[16px]">
                        <span className="text-destructive font-bold text-[12px] w-[30px]">{sellSentiment}%</span>
                        <div className="flex-1 h-[4px] rounded-full flex bg-accent relative items-center">
                            <div className="h-full bg-destructive transition-all duration-700" style={{ width: `${sellSentiment}%` }} />
                            <div className="h-full bg-success transition-all duration-700" style={{ width: `${buySentiment}%` }} />
                            {/* Triangle pointing up toward the spread box */}
                            <div className="absolute top-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-transparent border-b-success" />
                        </div>
                        <span className="text-success font-bold text-[12px] w-[30px] text-right">{buySentiment}%</span>
                    </div>
                </div>

                {/* ── Market | Pending Tabs ─── */}
                <div className="flex h-[30px] bg-background rounded-[3px] border border-border p-[2px] gap-[2px] mt-1">
                    {(['market', 'pending'] as OrderTab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`flex-1 rounded-[2px] transition-all duration-200 capitalize font-semibold text-[11px]
                                ${tab === t
                                    ? 'bg-accent text-foreground font-bold'
                                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {/* ── Pending Price (only on Pending tab) ─── */}
                {tab === 'pending' && (
                    <StepInput
                        label="Open price"
                        value={pendingPrice || (ask).toFixed(instrument.digits)}
                        onChange={setPendingPrice}
                        suffix={pendingType.charAt(0).toUpperCase() + pendingType.slice(1)}
                        onMinus={() => adjustPrice('pending', -1)}
                        onPlus={() => adjustPrice('pending', 1)}
                        hint={`-0.0 pips from market`}
                    />
                )}

                {/* ── Volume ─── */}
                <StepInput
                    label="Volume"
                    value={volume}
                    suffix="Lots"
                    onChange={setVolume}
                    onMinus={() => adjustVolume(-volumeSpec.step)}
                    onPlus={() => adjustVolume(volumeSpec.step)}
                />

                {/* ── Take Profit ─── */}
                <StepInput
                    label="Take Profit"
                    value={tp}
                    placeholder="Not set"
                    suffixOptions={['Price', 'Pips', 'USD']}
                    onChange={setTp}
                    onMinus={() => adjustPrice('tp', -1)}
                    onPlus={() => adjustPrice('tp', 1)}
                    icon={<HelpCircle size={13} />}
                />

                {/* ── Stop Loss ─── */}
                <StepInput
                    label="Stop Loss"
                    value={sl}
                    placeholder="Not set"
                    suffixOptions={['Price', 'Pips', 'USD']}
                    onChange={setSl}
                    onMinus={() => adjustPrice('sl', -1)}
                    onPlus={() => adjustPrice('sl', 1)}
                    icon={<HelpCircle size={13} />}
                />

                {/* ── Confirm button (Regular Form only) ─── */}
                {(formType === 'regular' || formType === 'risk-calculator') && (
                    <div className="pt-1 flex flex-col gap-[6px]">
                        <button
                            onClick={() => handlePlaceOrder(selectedSide)}
                            disabled={!canSubmitOrder || isPlacingOrder}
                            className={`w-full h-[36px] flex items-center justify-center px-3 rounded-[3px] active:scale-[0.98] text-primary-foreground transition-all duration-300 text-[13px] font-bold tracking-wide
                                ${!canSubmitOrder || isPlacingOrder ? 'cursor-not-allowed bg-accent border border-border text-muted-foreground' : selectedSide === 'sell' ? 'bg-destructive hover:bg-destructive/90' : 'bg-success hover:bg-success/90 text-background'}
                            `}
                        >
                            {isPlacingOrder
                                ? 'Placing order...'
                                : `Confirm ${selectedSide === 'buy' ? 'Buy' : 'Sell'} ${volume} lots`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default memo(OrderPanel);
