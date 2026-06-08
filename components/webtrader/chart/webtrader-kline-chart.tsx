/**
 * Webtrader KlineChart Integration
 * Uses the globally consistent KlineChartContainer.
 */

'use client';

import { useCallback, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  Settings,
  Camera,
  LineChart,
  CandlestickChart,
  BarChart3,
  Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWebtraderStore } from '@/store/webtrader-store';
import { cn } from '@/lib/utils';
import { TIMEFRAMES, CHART_TYPES } from '@/lib/trading/constants';
import type { ChartType } from '@/lib/terminal/chart-visual-config';
import dynamic from 'next/dynamic';

const KlineChartContainer = dynamic(
  () => import('@/components/terminal/KlineChartContainer'),
  { ssr: false }
);

interface WebtraderKlineChartProps {
  className?: string;
}

// Map Webtrader store types to Terminal ChartType
function mapChartType(wtType: string): ChartType {
  switch (wtType) {
    case 'bar':
      return 'Bars';
    case 'line':
    case 'area':
      return 'Line';
    case 'candlestick':
    default:
      return 'Candles';
  }
}

function mapTimeframeToMinutes(tf: string): number {
  const upper = tf.toUpperCase();
  const num = parseInt(upper.replace(/^[A-Z]+/, ''), 10);
  if (upper.startsWith('MN')) return num * 43200;
  if (upper.startsWith('W')) return num * 10080;
  if (upper.startsWith('D')) return num * 1440;
  if (upper.startsWith('H')) return num * 60;
  return num; // M prefix = minutes
}

export function WebtraderKlineChart({ className }: WebtraderKlineChartProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // All hooks must be called unconditionally before any early returns.
  const selectedSymbol = useWebtraderStore((s) => s.selectedSymbol);
  const selectedTimeframe = useWebtraderStore((s) => s.selectedTimeframe);
  const chartType = useWebtraderStore((s) => s.chartType);
  const setTimeframe = useWebtraderStore((s) => s.setTimeframe);
  const setChartType = useWebtraderStore((s) => s.setChartType);
  const symbols = useWebtraderStore((s) => s.symbols);
  const prices = useWebtraderStore((s) => s.prices);
  const activeAction = useWebtraderStore((s) => s.activeAction);
  const orderForm = useWebtraderStore((s) => s.orderForm);
  const allPositions = useWebtraderStore((s) => s.positions);
  const updateOrderForm = useWebtraderStore((s) => s.updateOrderForm);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const getChartTypeIcon = useCallback((type: string) => {
    switch (type) {
      case 'candlestick':
        return <CandlestickChart className="w-4 h-4" />;
      case 'bar':
        return <BarChart3 className="w-4 h-4" />;
      case 'line':
        return <LineChart className="w-4 h-4" />;
      case 'area':
        return <Activity className="w-4 h-4" />;
      default:
        return <CandlestickChart className="w-4 h-4" />;
    }
  }, []);

  const handleUpdatePosition = useCallback(
    (id: string, updates: Partial<{ sl: number | null; tp: number | null }>) => {
      if (id === 'draft-order') {
        updateOrderForm({
          ...(updates.sl !== undefined ? { sl: updates.sl } : {}),
          ...(updates.tp !== undefined ? { tp: updates.tp } : {}),
        });
      }
    },
    [updateOrderForm],
  );

  if (!selectedSymbol) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-card">
        <div className="text-muted-foreground text-center">
          <LineChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">Select a symbol to view chart</p>
        </div>
      </div>
    );
  }

  const terminalChartType = mapChartType(chartType);
  const timeframeMinutes = mapTimeframeToMinutes(selectedTimeframe);
  const symbolInfo = symbols.find((s) => s.name === selectedSymbol);
  const currentPrice = prices[selectedSymbol] ?? null;

  const chartPositions: React.ComponentProps<typeof KlineChartContainer>['positions'] = allPositions
    .filter((p) => p.symbol === selectedSymbol)
    .map((p) => ({
      id: String(p.ticket),
      symbol: p.symbol,
      type: p.type === 'buy' ? 'buy' : 'sell',
      openPrice: p.openPrice,
      volume: p.volume,
      sl: p.sl ?? null,
      tp: p.tp ?? null,
    }));

  if (activeAction && currentPrice) {
    const isBuy = activeAction === 'buy';
    const draftOpenPrice = isBuy ? currentPrice.ask : currentPrice.bid;
    const contractSize = symbolInfo?.tradeContractSize || 100000;

    let slLabel: string | undefined;
    let tpLabel: string | undefined;

    if (orderForm.sl) {
      const diff = orderForm.sl - draftOpenPrice;
      const usd = diff * contractSize * orderForm.volume * (isBuy ? 1 : -1);
      slLabel = `${orderForm.volume} ${usd > 0 ? '+' : ''}${usd.toFixed(2)} USD`;
    }

    if (orderForm.tp) {
      const diff = orderForm.tp - draftOpenPrice;
      const usd = diff * contractSize * orderForm.volume * (isBuy ? 1 : -1);
      tpLabel = `${orderForm.volume} ${usd > 0 ? '+' : ''}${usd.toFixed(2)} USD`;
    }

    chartPositions.push({
      id: 'draft-order',
      symbol: selectedSymbol,
      type: isBuy ? 'buy' : 'sell',
      openPrice: draftOpenPrice,
      openLabel: isBuy ? `${orderForm.volume}` : `-${orderForm.volume}`,
      volume: orderForm.volume,
      sl: orderForm.sl,
      slLabel,
      tp: orderForm.tp,
      tpLabel,
    });
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-card transition-all duration-300',
        isFullscreen && 'fixed inset-0 z-50',
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b border-border flex-shrink-0 h-[48px]">
        {/* Left: Symbol Info */}
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-semibold">{selectedSymbol}</h3>
            <p className="text-xs text-muted-foreground">Kline Chart</p>
          </div>
        </div>

        {/* Center: Timeframe & Chart Type */}
        <div className="flex items-center gap-2">
          {/* Timeframe Selector */}
          <Select value={selectedTimeframe} onValueChange={(v) => setTimeframe(v as any)}>
            <SelectTrigger className="w-[80px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEFRAMES.map((tf) => (
                <SelectItem key={tf.value} value={tf.value} className="text-xs">
                  {tf.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Chart Type */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8">
                {getChartTypeIcon(chartType)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {CHART_TYPES.map((type) => (
                <DropdownMenuItem
                  key={type.value}
                  onClick={() => setChartType(type.value as any)}
                  className="flex items-center gap-2"
                >
                  {getChartTypeIcon(type.value)}
                  {type.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Indicators */}
          <Button variant="outline" size="icon" className="h-8 w-8">
            <Activity className="w-4 h-4" />
          </Button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Camera className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 relative min-h-0">
        <KlineChartContainer
          symbol={selectedSymbol}
          symbolName={selectedSymbol}
          theme="Dark"
          chartType={terminalChartType}
          timeframeMinutes={timeframeMinutes}
          positions={chartPositions}
          onUpdatePosition={handleUpdatePosition}
        />
      </div>
    </div>
  );
}

export default WebtraderKlineChart;
