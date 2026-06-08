'use client';

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Minus,
  Plus,
  X,
} from 'lucide-react';

import { SymbolIcon } from '@/components/terminal/SymbolIcon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePriceBySymbol, useWebtraderStore } from '@/store/webtrader-store';
import type { OrderFillingMode, OrderType } from '@/types/webtrader';
import {
  DEVIATION_CONFIG,
  FILLING_MODES,
  LOT_CONFIG,
  ORDER_TYPE_LABELS,
} from '@/lib/trading/constants';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';
import { cn, formatCurrency } from '@/lib/utils';

interface TradingPanelProps {
  className?: string;
}

type FormMode = 'regular' | 'one-click' | 'risk-calculator';
type Side = 'buy' | 'sell';
type PriceUnit = 'Price' | 'Pips' | 'USD';

interface TicketFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  suffix?: string;
  suffixOptions?: readonly string[];
  onSuffixSelect?: (value: string) => void;
  onChange?: (value: string) => void;
  onMinus: () => void;
  onPlus: () => void;
  hint?: string | null;
  subText?: ReactNode;
  headerAction?: ReactNode;
  onClear?: () => void;
}

const FORM_LABELS: Record<FormMode, string> = {
  regular: 'Regular form',
  'one-click': 'One-click form',
  'risk-calculator': 'Risk calculator',
};

const formatValue = (value: number, digits: number) =>
  Number.isFinite(value) && value > 0 ? value.toFixed(digits) : '--';

const getQuoteFlashClass = (
  direction?: 'up' | 'down' | 'same',
  side?: 'bid' | 'ask',
) => {
  if (direction === 'up') return side === 'ask' ? 'quote-flash-buy' : 'quote-flash-up';
  if (direction === 'down') return 'quote-flash-down';
  return '';
};

const getQuoteFlashKey = (
  symbol: string,
  side: 'bid' | 'ask',
  value: number,
  time: unknown,
) => {
  const tickTime =
    time instanceof Date
      ? time.getTime()
      : typeof time === 'string' || typeof time === 'number'
        ? time
        : '';
  return `${symbol}:${side}:${value}:${tickTime}`;
};

function TicketField({
  label,
  value,
  placeholder = 'Not set',
  suffix,
  suffixOptions,
  onSuffixSelect,
  onChange,
  onMinus,
  onPlus,
  hint,
  headerAction,
  onClear,
  subText,
}: TicketFieldProps) {
  return (
    <div className="space-y-[6px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold text-white">{label}</span>
        {headerAction}
      </div>
      <div className="flex h-[40px] overflow-hidden rounded-md border border-[#3a404c] bg-transparent transition-colors focus-within:border-[#3b82f6]/60">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <input
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange?.(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium tabular-nums text-white outline-none placeholder:text-[#697282]"
          />
          {value && onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[#8a93a3] transition-colors hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {suffixOptions && onSuffixSelect ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex flex-shrink-0 items-center gap-1 text-[12px] font-semibold text-[#9aa3b2] transition-colors hover:text-white">
                  <span>{suffix}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="rounded-md border-[#2a2d36] bg-[#1a1d24] text-white"
              >
                {suffixOptions.map((option) => (
                  <DropdownMenuItem key={option} onClick={() => onSuffixSelect(option)}>
                    {option}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : suffix ? (
            <span className="flex-shrink-0 text-[12px] font-semibold text-[#9aa3b2]">
              {suffix}
            </span>
          ) : null}
        </div>
        <div className="flex border-l border-[#3a404c] bg-transparent">
          <button
            type="button"
            onClick={onMinus}
            className="inline-flex w-9 items-center justify-center text-[#8a93a3] transition-colors hover:bg-white/5 hover:text-white"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="w-px bg-[#3a404c]" />
          <button
            type="button"
            onClick={onPlus}
            className="inline-flex w-9 items-center justify-center text-[#8a93a3] transition-colors hover:bg-white/5 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {subText ?? (hint ? (
        <p className="text-[11px] text-[#6e7686]">{hint}</p>
      ) : null)}
    </div>
  );
}

export function TradingPanel({ className }: TradingPanelProps) {
  const [formMode, setFormMode] = useState<FormMode>('regular');
  const [tpUnit, setTpUnit] = useState<PriceUnit>('Price');
  const [slUnit, setSlUnit] = useState<PriceUnit>('Price');
  const [pendingPrice, setPendingPrice] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Use hoisted state to track if a side is actively selected for confirmation
  const activeAction = useWebtraderStore((state) => state.activeAction);
  const setActiveAction = useWebtraderStore((state) => state.setActiveAction);

  const selectedSymbol = useWebtraderStore((state) => state.selectedSymbol);
  const symbols = useWebtraderStore((state) => state.symbols);
  const quoteStatuses = useWebtraderStore((state) => state.quoteStatuses);
  const accountInfo = useWebtraderStore((state) => state.accountInfo);
  const wsClient = useWebtraderStore((state) => state.wsClient);
  const orderForm = useWebtraderStore((state) => state.orderForm);
  const updateOrderForm = useWebtraderStore((state) => state.updateOrderForm);
  const setIsPlacingOrder = useWebtraderStore((state) => state.setIsPlacingOrder);

  const symbolInfo = useMemo(
    () => symbols.find((symbol) => symbol.name === selectedSymbol),
    [selectedSymbol, symbols],
  );

  const currentPrice = usePriceBySymbol(selectedSymbol ?? '') ?? null;
  const quoteStatus = selectedSymbol ? quoteStatuses[selectedSymbol] : undefined;
  const hasLiveBidAsk = Boolean(
    currentPrice &&
      Number.isFinite(currentPrice.bid) &&
      Number.isFinite(currentPrice.ask) &&
      currentPrice.bid > 0 &&
      currentPrice.ask > 0,
  );
  const quoteUnavailableMessage =
    quoteStatus?.message ||
    'No live broker bid/ask is available for this symbol. Chart candles are indicative only and cannot be used for market execution.';
  const digits = symbolInfo?.digits ?? 5;
  const pointSize = symbolInfo?.point && symbolInfo.point > 0 ? symbolInfo.point : 1 / Math.pow(10, digits);
  const selectedSide: Side = orderForm.type.startsWith('buy') ? 'buy' : 'sell';
  const isPendingOrder = useMemo(
    () =>
      ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'].includes(orderForm.type),
    [orderForm.type],
  );
  const pendingKind = orderForm.type.includes('stop') ? 'stop' : 'limit';
  const defaultPendingPrice = useMemo(() => {
    if (!currentPrice) return '';
    const quote = selectedSide === 'buy' ? currentPrice.ask : currentPrice.bid;
    return quote > 0 ? quote.toFixed(digits) : '';
  }, [currentPrice, digits, selectedSide]);

  useEffect(() => {
    if (!pendingPrice && defaultPendingPrice) {
      setPendingPrice(defaultPendingPrice);
    }
  }, [defaultPendingPrice, pendingPrice]);

  const bidFlashClass = hasLiveBidAsk
    ? getQuoteFlashClass(currentPrice?.bidDirection, 'bid')
    : '';
  const askFlashClass = hasLiveBidAsk
    ? getQuoteFlashClass(currentPrice?.askDirection, 'ask')
    : '';

  const spreadPoints = useMemo(() => {
    if (!currentPrice || !hasLiveBidAsk) return '--';
    const spread = Math.abs(currentPrice.ask - currentPrice.bid);
    return `${(spread / pointSize).toFixed(1)} pts`;
  }, [currentPrice, hasLiveBidAsk, pointSize]);

  const changePercent = useMemo(() => {
    if (!currentPrice?.last || currentPrice.last <= 0 || !currentPrice.bid) return 0;
    return ((currentPrice.bid - currentPrice.last) / currentPrice.last) * 100;
  }, [currentPrice]);

  const buySentiment = useMemo(
    () => Math.round(Math.min(92, Math.max(8, 50 + changePercent * 5))),
    [changePercent],
  );
  const sellSentiment = 100 - buySentiment;

  const marginRequired = useMemo(() => {
    if (!symbolInfo || !currentPrice || !accountInfo || !hasLiveBidAsk) return 0;

    const contractSize = symbolInfo.tradeContractSize || 100000;
    const leverage = accountInfo.leverage || 1;
    const price = currentPrice.ask;

    return (orderForm.volume * contractSize * price) / leverage;
  }, [accountInfo, currentPrice, hasLiveBidAsk, orderForm.volume, symbolInfo]);

  const hasSufficientMargin = useMemo(() => {
    if (!accountInfo) return false;
    return accountInfo.marginFree >= marginRequired;
  }, [accountInfo, marginRequired]);

  const calculatePips = useCallback(
    (targetPrice: number | null) => {
      if (!targetPrice || !currentPrice) return null;
      const entryPrice = selectedSide === 'buy' ? currentPrice.ask : currentPrice.bid;
      const pips = Math.abs(targetPrice - entryPrice) / pointSize;
      return Math.round(pips);
    },
    [currentPrice, pointSize, selectedSide],
  );

  const renderTpSlSubtext = useCallback(
    (price: number | null, isTp: boolean) => {
      if (!price || !currentPrice || !symbolInfo) return null;
      // Use activeAction so subtext is correct immediately when user clicks Buy/Sell
      const side = activeAction ?? selectedSide;
      const entryPrice = side === 'buy' ? currentPrice.ask : currentPrice.bid;
      
      const diff = price - entryPrice;
      const directionMult = side === 'buy' ? 1 : -1;
      
      const pips = (diff / pointSize) * directionMult;
      const usd = diff * (symbolInfo.tradeContractSize || 100000) * orderForm.volume * directionMult;
      const percent = (diff / entryPrice) * 100 * directionMult;

      const sign = pips > 0 ? '+' : '';
      const colorClass = pips > 0 ? 'text-[#089981]' : 'text-[#f23645]';

      return (
        <div className={cn('text-[11px]', colorClass)}>
          {sign}{pips.toFixed(1)} pips\u00a0|\u00a0{sign}{usd.toFixed(2)} USD\u00a0|\u00a0{sign}{percent.toFixed(2)} %
        </div>
      );
    },
    [activeAction, currentPrice, orderForm.volume, pointSize, selectedSide, symbolInfo],
  );

  const handleActionClick = useCallback(
    (side: 'buy' | 'sell') => {
      setActiveAction(side);
      if (isPendingOrder) {
        const nextType =
          side === 'buy'
            ? pendingKind === 'stop'
              ? 'buy_stop'
              : 'buy_limit'
            : pendingKind === 'stop'
              ? 'sell_stop'
              : 'sell_limit';
        updateOrderForm({ type: nextType });
        return;
      }

      updateOrderForm({ type: side });
    },
    [isPendingOrder, pendingKind, updateOrderForm],
  );

  const setMarketMode = useCallback(
    (mode: 'market' | 'pending') => {
      if (mode === 'market') {
        updateOrderForm({ type: selectedSide });
        return;
      }

      updateOrderForm({
        type: selectedSide === 'buy' ? 'buy_limit' : 'sell_limit',
      });
    },
    [selectedSide, updateOrderForm],
  );

  const setPendingOrderKind = useCallback(
    (kind: 'limit' | 'stop') => {
      updateOrderForm({
        type:
          selectedSide === 'buy'
            ? kind === 'stop'
              ? 'buy_stop'
              : 'buy_limit'
            : kind === 'stop'
              ? 'sell_stop'
              : 'sell_limit',
      });
    },
    [selectedSide, updateOrderForm],
  );

  const handleVolumeChange = useCallback(
    (value: string) => {
      const volume = parseFloat(value);
      if (!Number.isNaN(volume) && volume >= 0) {
        updateOrderForm({ volume: Math.min(volume, LOT_CONFIG.MAX) });
      }
    },
    [updateOrderForm],
  );

  const adjustVolume = useCallback(
    (delta: number) => {
      const nextVolume = Math.max(
        LOT_CONFIG.MIN,
        Math.min(LOT_CONFIG.MAX, orderForm.volume + delta),
      );
      updateOrderForm({ volume: Math.round(nextVolume * 100) / 100 });
    },
    [orderForm.volume, updateOrderForm],
  );

  const adjustPriceField = useCallback(
    (field: 'pending' | 'sl' | 'tp', delta: number) => {
      const basePrice =
        selectedSide === 'buy' ? currentPrice?.ask ?? 0 : currentPrice?.bid ?? 0;
      if (!basePrice) return;

      if (field === 'pending') {
        const currentPending = parseFloat(pendingPrice || defaultPendingPrice);
        const nextPrice = (Number.isFinite(currentPending) ? currentPending : basePrice) + delta * pointSize;
        setPendingPrice(nextPrice.toFixed(digits));
        return;
      }

      const currentTarget = field === 'sl' ? orderForm.sl : orderForm.tp;
      const nextPrice = (currentTarget ?? basePrice) + delta * pointSize;
      if (field === 'sl') {
        updateOrderForm({ sl: Number(nextPrice.toFixed(digits)) });
      } else {
        updateOrderForm({ tp: Number(nextPrice.toFixed(digits)) });
      }
    },
    [
      currentPrice?.ask,
      currentPrice?.bid,
      defaultPendingPrice,
      digits,
      orderForm.sl,
      orderForm.tp,
      pendingPrice,
      pointSize,
      selectedSide,
      updateOrderForm,
    ],
  );

  const handleCancel = useCallback(() => {
    setActiveAction(null);
  }, []);

  const placeOrder = useCallback(async () => {
    if (!wsClient || !selectedSymbol || !hasLiveBidAsk) return;

    setIsSubmitting(true);
    setIsPlacingOrder(true);

    try {
      // Use activeAction as the definitive side — it's what the user confirmed
      const executionSide = activeAction ?? selectedSide;
      const executionType = isPendingOrder ? orderForm.type : (executionSide as typeof orderForm.type);
      const marketPrice = executionSide === 'buy' ? currentPrice?.ask : currentPrice?.bid;
      const pendingOpenPrice =
        parseFloat(pendingPrice || defaultPendingPrice) ||
        (executionSide === 'buy' ? currentPrice?.ask : currentPrice?.bid);

      const result = await wsClient.placeOrder({
        symbol: selectedSymbol,
        type: executionType,
        volume: orderForm.volume,
        price: isPendingOrder ? pendingOpenPrice : marketPrice,
        sl: orderForm.sl || undefined,
        tp: orderForm.tp || undefined,
        deviation: orderForm.useDeviation ? orderForm.deviation : undefined,
        fillingMode: orderForm.fillingMode,
      });

      if (result.retcode === 10009 || result.retcode === 10008) {
        updateOrderForm({ sl: null, tp: null });
      }
    } catch (error) {
      console.error('Order failed:', error);
    } finally {
      setIsSubmitting(false);
      setIsPlacingOrder(false);
      setActiveAction(null);
    }
  }, [
    currentPrice?.ask,
    currentPrice?.bid,
    defaultPendingPrice,
    hasLiveBidAsk,
    isPendingOrder,
    orderForm.deviation,
    orderForm.fillingMode,
    orderForm.sl,
    orderForm.tp,
    orderForm.type,
    orderForm.useDeviation,
    orderForm.volume,
    pendingPrice,
    selectedSide,
    selectedSymbol,
    setIsPlacingOrder,
    updateOrderForm,
    wsClient,
  ]);

  if (!selectedSymbol) {
    return (
      <div
        className={cn(
          'flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-[#111317] px-6 text-center text-[#7f8795]',
          className,
        )}
      >
        <div className="rounded-full border border-[#2a2d36] p-4">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-1">
          <p className="text-[14px] font-medium text-[#c7ced9]">Select a symbol to trade</p>
          <p className="text-[12px]">The order ticket will mirror the active instrument.</p>
        </div>
      </div>
    );
  }

  const actionLabel = isPendingOrder
    ? `Review ${ORDER_TYPE_LABELS[orderForm.type]}`
    : `Review ${selectedSide === 'buy' ? 'Buy' : 'Sell'} order`;

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden border-l border-[#2a2d36] bg-[#111317] text-white',
        className,
      )}
    >
      <div className="flex h-[52px] items-center justify-between border-b border-[#2a2d36] px-4">
        <div className="flex min-w-0 items-center gap-3">
          <SymbolIcon symbol={selectedSymbol} />
          <div className="min-w-0">
            <div className="truncate text-[12px] font-bold uppercase tracking-[0.16em] text-white">
              {formatTerminalDisplaySymbol(selectedSymbol)}
            </div>
            <div className="truncate text-[11px] text-[#7b8393]">
              {symbolInfo?.description || 'Trading ticket'}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-[#7b8393]">Leverage</div>
          <div className="text-[13px] font-semibold text-[#c8cfda]">
            {accountInfo?.leverage ? `1:${accountInfo.leverage}` : '1:100'}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="space-y-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-[40px] w-full items-center justify-between rounded-md border border-[#3a404c] bg-[#151a21] px-3 text-[13px] font-semibold text-white transition-colors hover:border-white/20">
                <span>{FORM_LABELS[formMode]}</span>
                <ChevronDown className="h-4 w-4 text-[#8a93a3]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[220px] rounded-md border-[#2a2d36] bg-[#1a1d24] text-white"
            >
              {(Object.entries(FORM_LABELS) as Array<[FormMode, string]>).map(([key, label]) => (
                <DropdownMenuItem key={key} onClick={() => setFormMode(key)}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="relative">
            <div className="flex h-[84px] gap-2">
              <button
                type="button"
                onClick={() => handleActionClick('sell')}
                className={cn(
                  'quote-flash-cell relative flex flex-1 flex-col items-start justify-between overflow-hidden rounded-md border px-3 py-3 text-left transition-all',
                  activeAction === 'sell'
                    ? 'border-[#f23645] bg-[#f23645] text-white'
                    : 'border-[#f23645] bg-transparent text-[#f23645] hover:bg-[#f23645]/10',
                )}
              >
                {bidFlashClass && currentPrice ? (
                  <span
                    key={getQuoteFlashKey(selectedSymbol, 'bid', currentPrice.bid, currentPrice.time)}
                    className={`quote-flash-overlay ${bidFlashClass}`}
                  />
                ) : null}
                <span
                  className={cn(
                    'quote-flash-content text-[11px] font-bold uppercase tracking-[0.16em]',
                    activeAction === 'sell' ? 'text-white/80' : 'text-[#f23645]',
                  )}
                >
                  Sell
                </span>
                <span
                  className={cn(
                    'quote-flash-content text-[26px] font-extrabold leading-none tabular-nums',
                    activeAction === 'sell'
                      ? 'text-white'
                      : currentPrice?.bidDirection === 'up'
                        ? 'text-[#089981]'
                        : currentPrice?.bidDirection === 'down'
                          ? 'text-[#f23645]'
                          : 'text-white',
                  )}
                >
                  {formatValue(currentPrice?.bid ?? 0, digits)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleActionClick('buy')}
                className={cn(
                  'quote-flash-cell relative flex flex-1 flex-col items-end justify-between overflow-hidden rounded-md border px-3 py-3 text-right transition-all',
                  activeAction === 'buy'
                    ? 'border-[#3b82f6] bg-[#3b82f6] text-white'
                    : 'border-[#3b82f6] bg-transparent text-[#3b82f6] hover:bg-[#3b82f6]/10',
                )}
              >
                {askFlashClass && currentPrice ? (
                  <span
                    key={getQuoteFlashKey(selectedSymbol, 'ask', currentPrice.ask, currentPrice.time)}
                    className={`quote-flash-overlay ${askFlashClass}`}
                  />
                ) : null}
                <span
                  className={cn(
                    'quote-flash-content text-[11px] font-bold uppercase tracking-[0.16em]',
                    activeAction === 'buy' ? 'text-white/80' : 'text-[#3b82f6]',
                  )}
                >
                  Buy
                </span>
                <span
                  className={cn(
                    'quote-flash-content text-[26px] font-extrabold leading-none tabular-nums',
                    activeAction === 'buy'
                      ? 'text-white'
                      : currentPrice?.askDirection === 'up'
                        ? 'text-[#3b82f6]'
                        : currentPrice?.askDirection === 'down'
                          ? 'text-[#f23645]'
                          : 'text-white',
                  )}
                >
                  {formatValue(currentPrice?.ask ?? 0, digits)}
                </span>
              </button>
            </div>

            <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2">
              <div className="rounded-sm bg-[#2a2d36] px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                {spreadPoints}
              </div>
            </div>
          </div>

          {!hasLiveBidAsk ? (
            <div className="rounded-none border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              <div className="font-semibold uppercase tracking-[0.14em]">Indicative quote</div>
              <div className="mt-1">{quoteUnavailableMessage}</div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 px-0.5 text-[11px] font-semibold">
            <span className="text-[#f23645]">{sellSentiment}%</span>
            <div className="flex h-[4px] flex-1 overflow-hidden rounded-full bg-[#2a2d36]">
              <div className="bg-[#f23645] transition-all duration-500" style={{ width: `${sellSentiment}%` }} />
              <div className="bg-[#3b82f6] transition-all duration-500" style={{ width: `${buySentiment}%` }} />
            </div>
            <span className="text-[#3b82f6]">{buySentiment}%</span>
          </div>

          <div className="flex h-[40px] gap-1 rounded-md border border-[#3a404c] bg-[#151a21] p-1">
            {(['market', 'pending'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setMarketMode(mode)}
                className={cn(
                  'flex-1 rounded-sm text-[12px] font-bold capitalize transition-colors',
                  (mode === 'market' && !isPendingOrder) || (mode === 'pending' && isPendingOrder)
                    ? 'bg-[#111317] text-white shadow-sm'
                    : 'text-[#8a93a3] hover:text-white',
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          {isPendingOrder ? (
            <>
              <TicketField
                label="Open price"
                value={pendingPrice || defaultPendingPrice}
                suffix={pendingKind === 'limit' ? 'Limit' : 'Stop'}
                onChange={setPendingPrice}
                onMinus={() => adjustPriceField('pending', -1)}
                onPlus={() => adjustPriceField('pending', 1)}
                headerAction={
                  <Select value={pendingKind} onValueChange={(value) => setPendingOrderKind(value as 'limit' | 'stop')}>
                    <SelectTrigger className="h-8 w-[88px] rounded-md border-[#3a404c] bg-[#151a21] px-2 text-[11px] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-md border-[#2a2d36] bg-[#1a1d24] text-white">
                      <SelectItem value="limit">Limit</SelectItem>
                      <SelectItem value="stop">Stop</SelectItem>
                    </SelectContent>
                  </Select>
                }
              />
            </>
          ) : null}

          <TicketField
            label="Volume"
            value={orderForm.volume.toFixed(2)}
            suffix="Lots"
            onChange={handleVolumeChange}
            onMinus={() => adjustVolume(-LOT_CONFIG.STEP)}
            onPlus={() => adjustVolume(LOT_CONFIG.STEP)}
            hint={`${LOT_CONFIG.MIN.toFixed(2)} - ${LOT_CONFIG.MAX.toFixed(2)} lots`}
          />

          <TicketField
            label="Take Profit"
            value={orderForm.tp ? orderForm.tp.toFixed(digits) : ''}
            suffix={tpUnit}
            suffixOptions={['Price', 'Pips', 'USD']}
            onSuffixSelect={(value) => setTpUnit(value as PriceUnit)}
            onChange={(value) =>
              updateOrderForm({ tp: value === '' ? null : parseFloat(value) || null })
            }
            onMinus={() => adjustPriceField('tp', -1)}
            onPlus={() => adjustPriceField('tp', 1)}
            onClear={() => updateOrderForm({ tp: null })}
            hint={!orderForm.tp ? 'Optional profit target' : null}
            subText={orderForm.tp ? renderTpSlSubtext(orderForm.tp, true) : null}
            headerAction={<CircleHelp className="h-3.5 w-3.5 text-[#6e7686]" />}
          />

          <TicketField
            label="Stop Loss"
            value={orderForm.sl ? orderForm.sl.toFixed(digits) : ''}
            suffix={slUnit}
            suffixOptions={['Price', 'Pips', 'USD']}
            onSuffixSelect={(value) => setSlUnit(value as PriceUnit)}
            onChange={(value) =>
              updateOrderForm({ sl: value === '' ? null : parseFloat(value) || null })
            }
            onMinus={() => adjustPriceField('sl', -1)}
            onPlus={() => adjustPriceField('sl', 1)}
            onClear={() => updateOrderForm({ sl: null })}
            hint={!orderForm.sl ? 'Optional risk protection' : null}
            subText={orderForm.sl ? renderTpSlSubtext(orderForm.sl, false) : null}
            headerAction={<CircleHelp className="h-3.5 w-3.5 text-[#6e7686]" />}
          />

          <button
            type="button"
            onClick={() => setShowAdvanced((previous) => !previous)}
            className="flex w-full items-center justify-between rounded-md border border-[#2a2d36] bg-[#151a21] px-3 py-2 text-[12px] font-semibold text-[#c8cfda] transition-colors hover:border-white/20"
          >
            <span>Advanced settings</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[#8a93a3] transition-transform',
                showAdvanced && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence initial={false}>
            {showAdvanced ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 border border-[#2a2d36] bg-[#15181e] p-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[12px] font-semibold text-white">Price deviation</div>
                      <div className="text-[11px] text-[#6e7686]">
                        Allow a manual slippage tolerance.
                      </div>
                    </div>
                    <Switch
                      checked={orderForm.useDeviation}
                      onCheckedChange={(checked) => updateOrderForm({ useDeviation: checked })}
                    />
                  </div>

                  {orderForm.useDeviation ? (
                    <TicketField
                      label="Deviation"
                      value={String(orderForm.deviation)}
                      suffix="pts"
                      onChange={(value) =>
                        updateOrderForm({
                          deviation: Math.max(
                            DEVIATION_CONFIG.MIN,
                            Math.min(DEVIATION_CONFIG.MAX, parseInt(value, 10) || 0),
                          ),
                        })
                      }
                      onMinus={() =>
                        updateOrderForm({
                          deviation: Math.max(
                            DEVIATION_CONFIG.MIN,
                            orderForm.deviation - DEVIATION_CONFIG.STEP,
                          ),
                        })
                      }
                      onPlus={() =>
                        updateOrderForm({
                          deviation: Math.min(
                            DEVIATION_CONFIG.MAX,
                            orderForm.deviation + DEVIATION_CONFIG.STEP,
                          ),
                        })
                      }
                    />
                  ) : null}

                  <div className="space-y-2">
                    <div className="text-[12px] font-semibold text-white">Execution mode</div>
                    <Select
                      value={orderForm.fillingMode}
                      onValueChange={(value) =>
                        updateOrderForm({ fillingMode: value as OrderFillingMode })
                      }
                    >
                      <SelectTrigger className="h-[40px] rounded-md border-[#3a404c] bg-[#111317] text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-md border-[#2a2d36] bg-[#1a1d24] text-white">
                        {FILLING_MODES.map((mode) => (
                          <SelectItem key={mode.value} value={mode.value}>
                            {mode.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div className="space-y-2 border border-[#2a2d36] bg-[#15181e] px-3 py-2 text-[12px]">
            {[
              ['Margin required', formatCurrency(marginRequired)],
              ['Free margin', formatCurrency(accountInfo?.marginFree || 0)],
              ['Margin level', accountInfo?.marginLevel ? `${accountInfo.marginLevel.toFixed(2)}%` : '--'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-[#242a33] py-1.5 last:border-b-0">
                <span className="text-[#7b8393]">{label}</span>
                <span
                  className={cn(
                    'font-semibold tabular-nums text-white',
                    label === 'Margin required' && !hasSufficientMargin && 'text-[#f23645]',
                    label === 'Margin level' &&
                      (accountInfo?.marginLevel ?? 0) > 0 &&
                      (accountInfo?.marginLevel ?? 0) < 100 &&
                      'text-[#f23645]',
                  )}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[#2a2d36] bg-[#15181e] p-3">
        <AnimatePresence>
          {activeAction && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 space-y-2 overflow-hidden"
            >
              <Button
                onClick={placeOrder}
                disabled={isSubmitting || !hasLiveBidAsk}
                className={cn(
                  'h-[44px] w-full rounded-md text-[15px] font-semibold text-white',
                  activeAction === 'buy'
                    ? 'bg-[#3b82f6] hover:bg-[#2563eb]'
                    : 'bg-[#f23645] hover:bg-[#d82f3d]',
                )}
              >
                {isSubmitting ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Check className="h-4 w-4" />
                  </motion.div>
                ) : (
                  `Confirm ${activeAction === 'buy' ? 'Buy' : 'Sell'} ${orderForm.volume.toFixed(2)} lots`
                )}
              </Button>
              <Button
                onClick={handleCancel}
                className="h-[44px] w-full rounded-md bg-[#2a2d36] text-[15px] font-semibold text-white hover:bg-[#3a404c]"
              >
                Cancel
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-1 text-[12px]">
          <div className="flex items-center justify-between text-[#7b8393]">
            <span className="flex items-center gap-1">Fees:</span>
            <span className="flex items-center gap-1 text-white">
              {marginRequired > 0 ? `≈ ${(marginRequired * 0.0001).toFixed(2)} USD` : '≈ --'}
              <CircleHelp className="h-3 w-3 text-[#6e7686]" />
            </span>
          </div>
          <div className="flex items-center justify-between text-[#7b8393]">
            <span className="flex items-center gap-1">Leverage:</span>
            <span className="flex items-center gap-1 text-white">
              {accountInfo?.leverage ? `1:${accountInfo.leverage}` : '1:100'}
              <CircleHelp className="h-3 w-3 text-[#6e7686]" />
            </span>
          </div>
          <div className="flex items-center justify-between text-[#7b8393]">
            <span>Margin:</span>
            <span className={cn('text-white', !hasSufficientMargin && 'text-[#f23645]')}>
              {formatCurrency(marginRequired)}
            </span>
          </div>
          <button type="button" className="mt-1 flex w-full items-center justify-between rounded-sm border border-[#2a2d36] bg-[#1a1d24] px-2 py-1 text-left text-[#7b8393] hover:bg-[#2a2d36]/50">
            <span>More</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default TradingPanel;
