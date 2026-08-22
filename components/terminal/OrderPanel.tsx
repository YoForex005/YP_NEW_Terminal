import React, { memo, useRef, useState, useMemo, useEffect } from 'react';
import type { Instrument } from '@/lib/terminal/types';
import { ChevronDown, Minus, Plus, HelpCircle } from 'lucide-react';
import { getSafeLiveQuoteSnapshotBySymbol } from '@/lib/trading/terminal-symbols';
import { useWebtraderStore, subscribeToLivePriceBySymbol, getLivePriceSnapshotBySymbol } from '@/store/webtrader-store';

type TradeSide = 'buy' | 'sell';
type OrderTab = 'market' | 'pending';
type FormType = 'regular' | 'one-click';

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

const ORDER_PANEL_FLASH_CLASSES = [
    'quote-flash-up',
    'quote-flash-down',
    'quote-flash-buy',
    'quote-flash-sell',
    'quote-flash-tick',
] as const;

const DISPLAY_QUOTE_THROTTLE_MS = 200;
const MAX_IN_FLIGHT_ORDER_SUBMISSIONS = 5;

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

type LivePriceSnap = ReturnType<typeof getSafeOrderPanelLivePriceSnapshot>;

const restartFlashOnOverlay = (
    el: HTMLElement | null,
    direction?: 'up' | 'down' | 'same',
    side?: 'bid' | 'ask',
) => {
    if (!el) return;
    // Only restart directional flashes (match InstrumentsPanel). Neutral ticks skip.
    if (direction !== 'up' && direction !== 'down') return;
    const cls = getQuoteFlashClass(direction, side);
    if (!cls) return;
    el.classList.remove(...ORDER_PANEL_FLASH_CLASSES);
    requestAnimationFrame(() => {
        if (!el.isConnected) return;
        el.classList.add(cls);
    });
};

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

const formatSignedNumber = (value: number, decimals = 2) => {
    if (!Number.isFinite(value)) {
        return '--';
    }

    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${Math.abs(value).toFixed(decimals)}`;
};

const formatMoney = (value: number, currency = 'USD', decimals = 2) => {
    if (!Number.isFinite(value)) {
        return '--';
    }

    return `${formatSignedNumber(value, decimals)} ${currency}`;
};

const formatUnsignedMoney = (value: number, currency = 'USD', decimals = 2) => {
    if (!Number.isFinite(value)) {
        return '--';
    }

    return `${value.toFixed(decimals)} ${currency}`;
};

const classifyPendingOrderType = (
    side: TradeSide,
    price: number,
    liveBid: number,
    liveAsk: number,
): 'limit' | 'stop' | null => {
    if (!Number.isFinite(price) || price <= 0 || liveBid <= 0 || liveAsk <= 0) {
        return null;
    }
    if (side === 'buy') {
        if (price < liveAsk) return 'limit';
        if (price > liveAsk) return 'stop';
        return null;
    }
    if (price > liveBid) return 'limit';
    if (price < liveBid) return 'stop';
    return null;
};

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
    tone = 'default',
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
    tone?: 'default' | 'positive' | 'negative';
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
            {hint && (
                <div className={`text-[10px] pl-0.5 tabular-nums ${
                    tone === 'positive'
                        ? 'text-success/85'
                        : tone === 'negative'
                            ? 'text-destructive/85'
                            : 'text-muted-foreground/60'
                }`}>
                    {hint}
                </div>
            )}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────
function OrderPanel({ instrument, onClose, onPlaceOrder }: OrderPanelProps) {
    const accountInfo = useWebtraderStore((state) => state.accountInfo);
    const symbolSpec = useWebtraderStore((state) =>
        state.symbols.find((symbol) => symbol.name === instrument.symbol),
    );
    const activeAction = useWebtraderStore((state) => state.activeAction);
    const setActiveAction = useWebtraderStore((state) => state.setActiveAction);
    const updateOrderForm = useWebtraderStore((state) => state.updateOrderForm);

    const [tab, setTab] = useState<OrderTab>('market');
    const [formType, setFormType] = useState<FormType>('regular');
    const [selectedSide, setSelectedSideLocal] = useState<TradeSide>('buy');

    const setSelectedSide = (side: TradeSide) => {
        setSelectedSideLocal(side);
        // Market draft lines on the chart are driven by the store. Pending
        // side must stay local — the effect below clears the store draft
        // when the Pending tab is open, and must not wipe the chosen side.
        if (tab === 'market') {
            setActiveAction(side);
        }
    };

    // Hide the market draft when switching to Pending. Depend on `tab` only
    // so clicking Sell on Pending does not immediately reset the side to Buy.
    useEffect(() => {
        if (tab !== 'market') {
            setActiveAction(null);
        }
    }, [tab, setActiveAction]);

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
    const [inFlightOrderCount, setInFlightOrderCount] = useState(0);
    const inFlightOrderCountRef = useRef(0);
    const isAtOrderSubmissionCapacity =
        inFlightOrderCount >= MAX_IN_FLIGHT_ORDER_SUBMISSIONS;
    const [pendingPrice, setPendingPrice] = useState('');
    const [lastInitializedOrderKey, setLastInitializedOrderKey] = useState<string | null>(null);

    // Live quote readiness is boolean-only (not per-tick bid/ask) so React does not
    // re-render the full panel on every price tick. Price text + flash are DOM-driven.
    const [liveQuoteReady, setLiveQuoteReady] = useState(() => {
        const snap = getSafeOrderPanelLivePriceSnapshot(instrument.symbol);
        return (snap?.bid ?? 0) > 0 && (snap?.ask ?? 0) > 0;
    });
    // Throttled bid/ask for fee/margin/notional JSX (≤5 updates/sec).
    const [displayQuote, setDisplayQuote] = useState<{ bid: number; ask: number } | null>(() => {
        const snap = getSafeOrderPanelLivePriceSnapshot(instrument.symbol);
        const ready = (snap?.bid ?? 0) > 0 && (snap?.ask ?? 0) > 0;
        return ready && snap ? { bid: snap.bid ?? 0, ask: snap.ask ?? 0 } : null;
    });

    const sellPriceRef = useRef<HTMLSpanElement>(null);
    const buyPriceRef = useRef<HTMLSpanElement>(null);
    const bidFlashOverlayRef = useRef<HTMLSpanElement>(null);
    const askFlashOverlayRef = useRef<HTMLSpanElement>(null);
    const latestSnapRef = useRef<LivePriceSnap>(undefined);
    const liveQuoteReadyRef = useRef(false);
    const lastDisplayQuoteAtRef = useRef(0);
    const instrumentRef = useRef(instrument);
    instrumentRef.current = instrument;

    // Keep readiness ref in sync for the subscription callback.
    liveQuoteReadyRef.current = liveQuoteReady;

    const liveInstrumentBid = instrument.quoteSource === 'live' && instrument.hasExecutableQuote === true && instrument.bid > 0 ? instrument.bid : 0;
    const liveInstrumentAsk = instrument.quoteSource === 'live' && instrument.hasExecutableQuote === true && instrument.ask > 0 ? instrument.ask : 0;
    const hasInstrumentExecutableQuote = liveInstrumentBid > 0 && liveInstrumentAsk > 0;
    const hasLiveQuote = liveQuoteReady || hasInstrumentExecutableQuote;
    const liveBid = displayQuote && displayQuote.bid > 0
        ? displayQuote.bid
        : liveInstrumentBid;
    const liveAsk = displayQuote && displayQuote.ask > 0
        ? displayQuote.ask
        : liveInstrumentAsk;
    const bid = hasLiveQuote
        ? (liveBid > 0 ? liveBid : liveInstrumentBid)
        : instrument.bid;
    const ask = hasLiveQuote
        ? (liveAsk > 0 ? liveAsk : liveInstrumentAsk)
        : instrument.ask;
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

    // Single subscription: DOM price text + flash restart; React only for readiness / throttled display.
    useEffect(() => {
        // Force first displayQuote write after symbol switch (avoid stale throttled prices).
        lastDisplayQuoteAtRef.current = 0;

        const writeDisplayQuote = (snapBid: number, snapAsk: number) => {
            setDisplayQuote((prev) => {
                if (prev && prev.bid === snapBid && prev.ask === snapAsk) return prev;
                return { bid: snapBid, ask: snapAsk };
            });
        };

        const updateFromSnap = () => {
            const snap = getSafeOrderPanelLivePriceSnapshot(instrument.symbol);
            latestSnapRef.current = snap;

            const inst = instrumentRef.current;
            const fmt = (v: number) => (v > 0 ? v.toFixed(inst.digits) : '--');
            const snapBid = snap?.bid ?? 0;
            const snapAsk = snap?.ask ?? 0;
            const snapLast = snap?.last ?? 0;
            const ready = snapBid > 0 && snapAsk > 0;

            if (sellPriceRef.current) {
                sellPriceRef.current.textContent = fmt(getDisplayBid(snapBid, snapAsk, snapLast));
            }
            if (buyPriceRef.current) {
                buyPriceRef.current.textContent = fmt(getDisplayAsk(snapBid, snapAsk, snapLast));
            }

            if (ready && snap) {
                restartFlashOnOverlay(bidFlashOverlayRef.current, snap.bidDirection, 'bid');
                restartFlashOnOverlay(askFlashOverlayRef.current, snap.askDirection, 'ask');
            }

            if (ready !== liveQuoteReadyRef.current) {
                liveQuoteReadyRef.current = ready;
                setLiveQuoteReady(ready);
                if (ready) {
                    lastDisplayQuoteAtRef.current = Date.now();
                    writeDisplayQuote(snapBid, snapAsk);
                } else {
                    setDisplayQuote(null);
                }
                return;
            }

            if (ready) {
                const now = Date.now();
                if (now - lastDisplayQuoteAtRef.current >= DISPLAY_QUOTE_THROTTLE_MS) {
                    lastDisplayQuoteAtRef.current = now;
                    writeDisplayQuote(snapBid, snapAsk);
                }
            }
        };

        updateFromSnap();
        return subscribeToLivePriceBySymbol(instrument.symbol, updateFromSnap);
    }, [instrument.symbol]);

    // Auto-fill default SL and TP so the chart instantly shows all three lines.
    // Reads bid/ask from the latest snapshot ref — does NOT depend on per-tick prices.
    useEffect(() => {
        if (activeAction === null) {
            if (lastInitializedOrderKey !== null) {
                setLastInitializedOrderKey(null);
                setTp('');
                setSl('');
            }
            return;
        }

        if (!liveQuoteReady && !hasInstrumentExecutableQuote) {
            return;
        }

        const orderKey = `${instrument.symbol}:${selectedSide}`;
        if (orderKey !== lastInitializedOrderKey) {
            const snap = getSafeOrderPanelLivePriceSnapshot(instrument.symbol) ?? latestSnapRef.current;
            const snapBid = (snap?.bid ?? 0) > 0 ? (snap?.bid ?? 0) : liveInstrumentBid;
            const snapAsk = (snap?.ask ?? 0) > 0 ? (snap?.ask ?? 0) : liveInstrumentAsk;
            const entry = selectedSide === 'buy' ? snapAsk : snapBid;
            if (entry > 0) {
                const offset = entry * 0.003; // Default 0.3% offset
                const defaultTp = selectedSide === 'buy' ? entry + offset : entry - offset;
                const defaultSl = selectedSide === 'buy' ? entry - offset : entry + offset;

                setTp(defaultTp.toFixed(instrument.digits));
                setSl(defaultSl.toFixed(instrument.digits));
                setLastInitializedOrderKey(orderKey);
            }
        }
    }, [
        selectedSide,
        lastInitializedOrderKey,
        liveQuoteReady,
        hasInstrumentExecutableQuote,
        liveInstrumentBid,
        liveInstrumentAsk,
        instrument.symbol,
        instrument.digits,
        activeAction,
    ]);

    // Sync local state to store so the chart draft order instantly mirrors these values
    useEffect(() => {
        updateOrderForm({
            volume: normalizeVolumeToSpec(parseFloat(volume), volumeSpec),
            sl: sl ? parseFloat(sl) : null,
            tp: tp ? parseFloat(tp) : null,
        });
    }, [volume, sl, tp, updateOrderForm, volumeSpec]);

    const isIndicativeQuote = !hasLiveQuote && instrument.quoteSource === 'ohlc';
    const isOneClickForm = formType === 'one-click';
    const canSubmitSideOrder = (_side: TradeSide) => hasLiveQuote;
    const canSubmitOrder = canSubmitSideOrder(selectedSide);
    const formatQuote = (value: number) => (value > 0 ? `${isIndicativeQuote ? '~' : ''}${value.toFixed(instrument.digits)}` : '--');
    const pipStep = 1 / Math.pow(10, instrument.digits);
    const defaultPendingPrice = (() => {
        if (bid <= 0 || ask <= 0) return '';
        const ref = selectedSide === 'buy' ? bid : ask;
        const offset = Math.max(pipStep * 20, ref * 0.0003);
        const raw = selectedSide === 'buy' ? bid - offset : ask + offset;
        return raw > 0 ? raw.toFixed(instrument.digits) : '';
    })();
    const pendingPriceDisplay = pendingPrice || defaultPendingPrice;

    const spread = Math.abs(ask - bid);
    const leverageRatio = accountInfo?.leverage && accountInfo.leverage > 0 ? accountInfo.leverage : null;
    const accountCurrency = accountInfo?.currency || symbolSpec?.quoteCurrency || 'USD';
    const spreadLabel = spread > 0
        ? `${spread.toFixed(Math.min(Math.max(instrument.digits, 2), 5))} ${accountCurrency}`
        : '--';
    const tradeVolume = normalizeVolumeToSpec(parseFloat(volume), volumeSpec);
    const contractSize = toPositiveFinite(symbolSpec?.tradeContractSize, instrument.contractSize || 100000);
    const entryPrice = selectedSide === 'buy' ? ask : bid;
    const pendingEntryPrice = tab === 'pending'
        ? parseFloat(pendingPriceDisplay) || entryPrice
        : entryPrice;
    const effectiveEntryPrice = pendingEntryPrice > 0 ? pendingEntryPrice : entryPrice;
    const notionalValue = effectiveEntryPrice > 0
        ? effectiveEntryPrice * tradeVolume * contractSize
        : 0;
    const estimatedMargin = symbolSpec?.marginInitial && symbolSpec.marginInitial > 0
        ? symbolSpec.marginInitial * tradeVolume
        : leverageRatio && notionalValue > 0
            ? notionalValue / leverageRatio
            : 0;
    const estimatedFees = spread > 0
        ? spread * tradeVolume * contractSize
        : 0;

    // dynamic sentiment combining 24h change and throttled live-bid jitter
    const basePct = 50 + (instrument.changePercent * 10);
    const jitter = liveBid > 0 ? ((liveBid * 100000) % 24) - 12 : 0;
    const bullPct = Math.min(92, Math.max(8, basePct + jitter));
    const bearPct = 100 - bullPct;
    const sellSentiment = Math.round(bearPct);
    const buySentiment = Math.round(bullPct);

    const pendingType = useMemo<'limit' | 'stop'>(() => {
        const p = parseFloat(pendingPriceDisplay);
        return classifyPendingOrderType(selectedSide, p, bid, ask) ?? 'limit';
    }, [ask, bid, pendingPriceDisplay, selectedSide]);

    const adjustVolume = (delta: number) => {
        setVolume(formatVolume(parseFloat(volume) + delta, volumeSpec));
    };

    const pipSize = instrument.pipSize > 0
        ? instrument.pipSize
        : symbolSpec?.point && symbolSpec.point > 0
            ? symbolSpec.point
            : pipStep;

    const getOrderPriceMetrics = (rawPrice: string) => {
        const targetPrice = parseFloat(rawPrice);
        if (
            !Number.isFinite(targetPrice) ||
            targetPrice <= 0 ||
            !Number.isFinite(effectiveEntryPrice) ||
            effectiveEntryPrice <= 0 ||
            !Number.isFinite(tradeVolume) ||
            tradeVolume <= 0
        ) {
            return {
                hint: '',
                tone: 'default' as const,
            };
        }

        const priceDelta = selectedSide === 'buy'
            ? targetPrice - effectiveEntryPrice
            : effectiveEntryPrice - targetPrice;
        const pips = pipSize > 0 ? priceDelta / pipSize : 0;
        const estimatedProfit = priceDelta * tradeVolume * contractSize;
        const percent = effectiveEntryPrice > 0 ? (priceDelta / effectiveEntryPrice) * 100 : 0;
        const tone: 'default' | 'positive' | 'negative' =
            estimatedProfit > 0 ? 'positive' : estimatedProfit < 0 ? 'negative' : 'default';

        return {
            hint: `${formatSignedNumber(pips, 1)} pips  |  ${formatMoney(estimatedProfit, accountCurrency)}  |  ${formatSignedNumber(percent, 2)} %`,
            tone,
        };
    };

    const tpMetrics = getOrderPriceMetrics(tp);
    const slMetrics = getOrderPriceMetrics(sl);
    const pendingDistance = useMemo(() => {
        const targetPrice = parseFloat(pendingPriceDisplay);
        if (!Number.isFinite(targetPrice) || targetPrice <= 0 || entryPrice <= 0) {
            return '0.0 pips from market';
        }

        const pips = pipSize > 0 ? (targetPrice - entryPrice) / pipSize : 0;
        return `${formatSignedNumber(pips, 1)} pips from market`;
    }, [pendingPriceDisplay, entryPrice, pipSize]);

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

    const readLatestExecutableQuote = () => {
        const snap = getSafeOrderPanelLivePriceSnapshot(instrument.symbol) ?? latestSnapRef.current;
        const snapBid = snap?.bid ?? 0;
        const snapAsk = snap?.ask ?? 0;
        if (snapBid > 0 && snapAsk > 0) {
            return { bid: snapBid, ask: snapAsk, hasLive: true as const };
        }
        if (liveInstrumentBid > 0 && liveInstrumentAsk > 0) {
            return { bid: liveInstrumentBid, ask: liveInstrumentAsk, hasLive: true as const };
        }
        return { bid: instrument.bid, ask: instrument.ask, hasLive: false as const };
    };

    const adjustPrice = (type: 'tp' | 'sl' | 'pending', delta: number) => {
        const setters = { tp: setTp, sl: setSl, pending: setPendingPrice };
        const getters = { tp: tp, sl: sl, pending: pendingPrice };
        const quote = readLatestExecutableQuote();
        const base = type === 'tp' ? quote.ask : quote.bid;
        const current = getters[type] ? parseFloat(getters[type]) : base;
        const next = current + delta * pipStep;
        setters[type](next.toFixed(instrument.digits));
    };

    const limitPrice = parseFloat(pendingPriceDisplay);
    const canSubmitOneClickLimit = (side: TradeSide) => {
        if (!hasLiveQuote || isAtOrderSubmissionCapacity || !Number.isFinite(limitPrice) || limitPrice <= 0) {
            return false;
        }

        const quote = readLatestExecutableQuote();
        return classifyPendingOrderType(side, limitPrice, quote.bid, quote.ask) !== null;
    };

    const handlePlaceOrder = async (
        side: TradeSide,
        options: { orderType?: 'market' | 'limit' | 'stop'; price?: number; tp?: number | null; sl?: number | null } = {},
    ) => {
        // Hard gate: re-check live snapshot at submit time (do not trust stale React state).
        const quote = readLatestExecutableQuote();
        if (!quote.hasLive) {
            return;
        }
        if (!canSubmitSideOrder(side)) {
            return;
        }
        if (inFlightOrderCountRef.current >= MAX_IN_FLIGHT_ORDER_SUBMISSIONS) {
            return;
        }

        const vol = normalizeVolumeToSpec(parseFloat(volume), volumeSpec);
        if (!vol || vol <= 0) return;
        const resolvedPrice = options.price ?? parseFloat(pendingPriceDisplay);
        const classifiedPendingType = classifyPendingOrderType(
            side,
            resolvedPrice,
            quote.bid,
            quote.ask,
        );
        const resolvedOrderType = tab === 'market'
            ? 'market'
            : (classifiedPendingType ?? options.orderType ?? pendingType);
        if (
            resolvedOrderType !== 'market' &&
            (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0 || !classifiedPendingType)
        ) {
            return;
        }

        const nextOrder: PlaceOrderRequest = {
            symbol: instrument.symbol,
            type: side,
            orderType: resolvedOrderType,
            volume: vol,
            tp: options.tp ?? (tp ? parseFloat(tp) : null),
            sl: options.sl ?? (sl ? parseFloat(sl) : null),
            ...(resolvedOrderType !== 'market' ? { price: resolvedPrice } : {}),
        };

        inFlightOrderCountRef.current += 1;
        setInFlightOrderCount(inFlightOrderCountRef.current);
        try {
            await onPlaceOrder?.(nextOrder);
        } finally {
            inFlightOrderCountRef.current = Math.max(0, inFlightOrderCountRef.current - 1);
            setInFlightOrderCount(inFlightOrderCountRef.current);
        }
    };

    const formLabels: Record<FormType, string> = {
        regular: 'Regular form',
        'one-click': 'One-click form',
    };

    const renderFormTypeDropdown = () => (
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
    );

    const renderQuoteWarning = () => !hasLiveQuote ? (
        <div className="rounded-[3px] border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-200 mt-1">
            {isIndicativeQuote
                ? 'Showing an indicative chart price while live bid/ask warms up. Market orders stay blocked until the MT5 quote feed sends a real tick.'
                : 'No live bid/ask is available for this instrument yet. Market orders will stay blocked until the MT5 quote feed recovers.'}
        </div>
    ) : null;

    const renderOrderTabs = () => (
        <div className="flex h-[30px] bg-background rounded-[3px] border border-border p-[2px] gap-[2px] mt-1">
            {(['market', 'pending'] as OrderTab[]).map(t => (
                <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 rounded-[2px] transition-all duration-200 font-semibold text-[11px]
                        ${tab === t
                            ? 'bg-accent text-foreground font-bold'
                            : 'bg-transparent text-muted-foreground hover:text-foreground'
                        }`}
                >
                    {t === 'pending' && isOneClickForm ? 'Limit' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
            ))}
        </div>
    );

    const renderVolumeInput = () => (
        <StepInput
            label="Volume"
            value={volume}
            suffix="Lots"
            onChange={setVolume}
            onMinus={() => adjustVolume(-volumeSpec.step)}
            onPlus={() => adjustVolume(volumeSpec.step)}
        />
    );

    const renderSentimentBar = () => {
        if (isOneClickForm) {
            return (
                <div className="mt-[-4px] flex items-center gap-2 text-[12px] font-bold leading-none">
                    <span className="w-[32px] text-destructive">{sellSentiment}%</span>
                    <div className="relative flex h-[8px] flex-1 items-center">
                        <div className="flex h-[3px] w-full overflow-hidden rounded-full bg-accent">
                            <div className="h-full bg-destructive transition-all duration-700" style={{ width: `${sellSentiment}%` }} />
                            <div className="h-full bg-success transition-all duration-700" style={{ width: `${buySentiment}%` }} />
                        </div>
                        <div className="absolute left-1/2 top-[-2px] -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[6px] border-transparent border-b-success" />
                    </div>
                    <span className="w-[32px] text-right text-success">{buySentiment}%</span>
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-1 mt-1.5 mb-1">
                <div className="flex items-center gap-2 text-[12px] font-medium relative h-[16px]">
                    <span className="text-destructive font-bold text-[12px] w-[30px]">{sellSentiment}%</span>
                    <div className="flex-1 h-[4px] rounded-full flex bg-accent relative items-center">
                        <div className="h-full bg-destructive transition-all duration-700" style={{ width: `${sellSentiment}%` }} />
                        <div className="h-full bg-success transition-all duration-700" style={{ width: `${buySentiment}%` }} />
                        <div className="absolute top-[-4px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-b-[5px] border-transparent border-b-success" />
                    </div>
                    <span className="text-success font-bold text-[12px] w-[30px] text-right">{buySentiment}%</span>
                </div>
            </div>
        );
    };

    const renderTradeButtons = (mode: 'regular' | 'one-click-market' | 'one-click-limit') => {
        const isFilled = mode !== 'regular';
        const isLimit = mode === 'one-click-limit';
        const sellDisabled = mode === 'one-click-market'
            ? !hasLiveQuote || isAtOrderSubmissionCapacity
            : isLimit
                ? !canSubmitOneClickLimit('sell')
                : false;
        const buyDisabled = mode === 'one-click-market'
            ? !hasLiveQuote || isAtOrderSubmissionCapacity
            : isLimit
                ? !canSubmitOneClickLimit('buy')
                : false;
        const sellAction = () => {
            if (mode === 'regular') {
                setSelectedSide('sell');
                return;
            }

            void handlePlaceOrder('sell', {
                orderType: isLimit
                    ? (classifyPendingOrderType('sell', limitPrice, bid, ask) ?? 'limit')
                    : 'market',
                ...(isLimit ? { price: limitPrice } : {}),
                tp: null,
                sl: null,
            });
        };
        const buyAction = () => {
            if (mode === 'regular') {
                setSelectedSide('buy');
                return;
            }

            void handlePlaceOrder('buy', {
                orderType: isLimit
                    ? (classifyPendingOrderType('buy', limitPrice, bid, ask) ?? 'limit')
                    : 'market',
                ...(isLimit ? { price: limitPrice } : {}),
                tp: null,
                sl: null,
            });
        };
        const sellClass = isFilled
            ? `border-destructive/75 bg-card/15 text-destructive hover:border-destructive hover:bg-destructive/5 ${sellDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`
            : `${selectedSide === 'sell'
                ? 'border-destructive/80 bg-destructive/5'
                : 'border-destructive/40 bg-transparent hover:border-destructive/60'} cursor-pointer`;
        const buyClass = isFilled
            ? `border-success/75 bg-card/15 text-success hover:border-success hover:bg-success/5 ${buyDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`
            : `${selectedSide === 'buy'
                ? 'border-success/80 bg-success/5'
                : 'border-success/40 bg-transparent hover:border-success/60'} cursor-pointer`;
        const buttonHeight = isFilled ? (isLimit ? 'h-[72px]' : 'h-[58px]') : 'h-[60px]';

        return (
            <div className="relative">
                <div className={`flex gap-[2px] ${buttonHeight} min-w-0`}>
                    <button
                        type="button"
                        disabled={sellDisabled}
                        onClick={sellAction}
                        className={`min-w-0 flex-1 flex flex-col items-start justify-between px-2 py-2 pb-[13px] rounded-[4px] transition-all group relative border text-left ${sellClass}`}
                    >
                        <span ref={bidFlashOverlayRef} className="quote-flash-overlay" />
                        <span className={`quote-flash-content text-[10px] font-semibold leading-none tracking-[0.04em] ${isFilled ? 'text-destructive' : selectedSide === 'sell' ? 'text-destructive' : 'text-destructive/70'}`}>
                            {isLimit ? 'Sell Limit' : 'SELL'}
                        </span>
                        <span ref={sellPriceRef} className={`quote-flash-content w-full text-[16px] tabular-nums leading-none font-bold tracking-tight ${isFilled ? 'text-destructive' : selectedSide === 'sell' ? 'text-destructive' : 'text-destructive/90'}`}>
                            {formatQuote(bid)}
                        </span>
                        {isLimit && (
                            <span className="text-[11px] font-semibold leading-none text-destructive/85 tabular-nums">
                                {pendingPriceDisplay || '--'}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        disabled={buyDisabled}
                        onClick={buyAction}
                        className={`min-w-0 flex-1 flex flex-col items-end justify-between px-2 py-2 pb-[13px] rounded-[4px] transition-all group relative border text-right ${buyClass}`}
                    >
                        <span ref={askFlashOverlayRef} className="quote-flash-overlay" />
                        <span className={`quote-flash-content text-[10px] font-semibold leading-none tracking-[0.04em] ${isFilled ? 'text-success' : selectedSide === 'buy' ? 'text-success' : 'text-success/70'}`}>
                            {isLimit ? 'Buy Limit' : 'BUY'}
                        </span>
                        <span ref={buyPriceRef} className={`quote-flash-content w-full text-right text-[16px] tabular-nums leading-none font-bold tracking-tight ${isFilled ? 'text-success' : selectedSide === 'buy' ? 'text-success' : 'text-success/90'}`}>
                            {formatQuote(ask)}
                        </span>
                        {isLimit && (
                            <span className="text-[11px] font-semibold leading-none text-success/85 tabular-nums">
                                {pendingPriceDisplay || '--'}
                            </span>
                        )}
                    </button>
                </div>

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[18px] flex items-center justify-center z-10 px-1.5 min-w-[64px]" data-test="spread">
                    <div className={`absolute left-0 top-0 bottom-0 w-1/2 rounded-tl-[4px] border-t border-l bg-background ${isFilled || selectedSide === 'sell' ? 'border-destructive/80' : 'border-destructive/40'}`} />
                    <div className={`absolute right-0 top-0 bottom-0 w-1/2 rounded-tr-[4px] border-t border-r bg-background ${isFilled || selectedSide === 'buy' ? 'border-success/80' : 'border-success/40'}`} />
                    <span className="relative z-10 rounded-[3px] border border-success/70 bg-background px-1 text-[9px] font-bold text-foreground whitespace-nowrap tracking-wide" data-test="spread-tooltip">
                        {hasLiveQuote ? spreadLabel : '--'}
                    </span>
                </div>
            </div>
        );
    };

    const renderFooter = () => (
        <div className="mt-[-2px] flex flex-col gap-[3px] border-t border-border/60 pt-2 font-mono text-[10px] leading-tight text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
                <span>Fees:</span>
                <span className="text-foreground/85 tabular-nums">~ {formatUnsignedMoney(estimatedFees, accountCurrency)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
                <span>Leverage:</span>
                <span className="text-foreground/85 tabular-nums">{leverageRatio ? `1:${leverageRatio}` : '--'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
                <span>Margin:</span>
                <span className="text-foreground/85 tabular-nums">{formatUnsignedMoney(estimatedMargin, accountCurrency)}</span>
            </div>
            <button
                type="button"
                className="mt-[1px] inline-flex w-fit items-center gap-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
                More <ChevronDown size={10} />
            </button>
        </div>
    );

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background font-sans text-foreground select-none">

            {/* ── Form Body ─────────────────────────────────────── */}
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-4 py-4">

                {renderFormTypeDropdown()}

                {isOneClickForm ? (
                    <>
                        {renderOrderTabs()}
                        {tab === 'pending' && (
                            <StepInput
                                label="Open price"
                                value={pendingPriceDisplay}
                                onChange={setPendingPrice}
                                suffix="Price"
                                onMinus={() => adjustPrice('pending', -1)}
                                onPlus={() => adjustPrice('pending', 1)}
                                hint={pendingDistance}
                            />
                        )}
                        {renderVolumeInput()}
                        {renderTradeButtons(tab === 'pending' ? 'one-click-limit' : 'one-click-market')}
                        {renderQuoteWarning()}
                        {renderSentimentBar()}
                        {renderFooter()}
                    </>
                ) : (
                    <>
                {/* ── SELL / BUY Price Boxes (Exness-style transparent boxes) ─── */}
                <div className="relative">
                    <div className="flex gap-[2px] h-[60px] min-w-0">
                        {/* SELL box */}
                        <div className={`min-w-0 flex-1 flex flex-col items-start justify-between p-2 pb-[14px] rounded-[6px] cursor-pointer transition-all group relative border
                                ${selectedSide === 'sell'
                                    ? 'border-destructive/80 bg-destructive/5'
                                    : 'border-destructive/40 bg-transparent hover:border-destructive/60'}`}
                             onClick={() => setSelectedSide('sell')}>
                            <span ref={bidFlashOverlayRef} className="quote-flash-overlay" />
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
                             onClick={() => setSelectedSide('buy')}>
                            <span ref={askFlashOverlayRef} className="quote-flash-overlay" />
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
                        hint={pendingDistance}
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
                    hint={tpMetrics.hint}
                    tone={tpMetrics.tone}
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
                    hint={slMetrics.hint}
                    tone={slMetrics.tone}
                    icon={<HelpCircle size={13} />}
                />

                {/* ── Confirm button (Regular Form only) ─── */}
                {formType === 'regular' && (
                    <div className="pt-1 flex flex-col gap-[8px]">
                        <button
                            onClick={() => handlePlaceOrder(selectedSide)}
                            disabled={!canSubmitOrder || isAtOrderSubmissionCapacity}
                            className={`w-full h-[36px] flex items-center justify-center px-3 rounded-[3px] active:scale-[0.98] text-primary-foreground transition-all duration-300 text-[13px] font-bold tracking-wide
                                ${!canSubmitOrder || isAtOrderSubmissionCapacity ? 'cursor-not-allowed bg-accent border border-border text-muted-foreground' : selectedSide === 'sell' ? 'bg-destructive hover:bg-destructive/90' : 'bg-success hover:bg-success/90 text-background'}
                            `}
                        >
                            {isAtOrderSubmissionCapacity
                                ? `Processing ${inFlightOrderCount} orders...`
                                : `Confirm ${selectedSide === 'buy' ? 'Buy' : 'Sell'} ${volume} lots`}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full h-[34px] rounded-[3px] border border-border bg-accent/45 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent"
                        >
                            Cancel
                        </button>
                    </div>
                )}
                <div className="mt-[-2px] flex flex-col gap-[3px] border-t border-border/60 pt-2 font-mono text-[10px] leading-tight text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                        <span>Fees:</span>
                        <span className="text-foreground/85 tabular-nums">~ {formatUnsignedMoney(estimatedFees, accountCurrency)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span>Leverage:</span>
                        <span className="text-foreground/85 tabular-nums">{leverageRatio ? `1:${leverageRatio}` : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span>Margin:</span>
                        <span className="text-foreground/85 tabular-nums">{formatUnsignedMoney(estimatedMargin, accountCurrency)}</span>
                    </div>
                    <button
                        type="button"
                        className="mt-[1px] inline-flex w-fit items-center gap-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                        More <ChevronDown size={10} />
                    </button>
                </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default memo(OrderPanel);
