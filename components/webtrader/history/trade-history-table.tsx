'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Briefcase, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';
import { cn, formatSignedCurrency } from '@/lib/utils';
import { useWebtraderStore } from '@/store/webtrader-store';
import type { Deal } from '@/types/webtrader';

interface TradeHistoryTableProps {
  className?: string;
}

const HISTORY_LOOKBACK_DAYS = 30;
const TERMINAL_TABLE_FONT = 'Tahoma, Arial, sans-serif';

function EmptyState({ title, message, warning = false }: { title: string; message: string; warning?: boolean }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center text-[#7f8795]">
      <div className="rounded-full border border-[#2a2d36] p-4">
        {warning ? (
          <AlertCircle className="h-9 w-9 text-amber-300" strokeWidth={1.5} />
        ) : (
          <Briefcase className="h-9 w-9" strokeWidth={1.5} />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-[#c7ced9]">{title}</p>
        <p className="text-[12px]">{message}</p>
      </div>
    </div>
  );
}

export function TradeHistoryTable({ className }: TradeHistoryTableProps) {
  const wsClient = useWebtraderStore((state) => state.wsClient);
  const session = useWebtraderStore((state) => state.session);
  const [history, setHistory] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    return { from, to };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!wsClient || !session || !wsClient.isAuthenticated) {
      setHistory([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const deals = await wsClient.getTradeHistory(dateRange.from, dateRange.to);
      setHistory(
        deals
          .slice()
          .sort(
            (left, right) =>
              new Date(right.time).getTime() - new Date(left.time).getTime(),
          ),
      );
    } catch (loadError) {
      setHistory([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load trade history.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [dateRange.from, dateRange.to, session, wsClient]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (!session) {
    return (
      <div className={cn('flex h-full min-h-0 flex-col bg-[#111317] text-white', className)}>
        <EmptyState title="No trading session" message="Reconnect your account to load historical deals." warning />
      </div>
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-[#111317] text-white', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-[#2a2d36] bg-[#15181e] px-4 py-2 text-[11px]">
        <div>
          <p className="font-semibold uppercase tracking-[0.16em] text-[#c8cfda]">
            Last {HISTORY_LOOKBACK_DAYS} days
          </p>
          <p className="mt-1 text-[#7b8393]">
            {dateRange.from.toLocaleDateString()} - {dateRange.to.toLocaleDateString()}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadHistory()}
          disabled={isLoading}
          className="h-8 rounded-none border-[#3a404c] bg-transparent text-white hover:bg-white/5"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {error ? (
        <EmptyState title="History unavailable" message={error} warning />
      ) : history.length === 0 && !isLoading ? (
        <EmptyState title="No closed trades" message="Closed trades will appear here once positions are settled." />
      ) : (
        <ScrollArea className="flex-1">
          <div style={{ fontFamily: TERMINAL_TABLE_FONT }}>
            <table className="min-w-[860px] w-full border-collapse text-[12px]">
              <thead className="sticky top-0 z-10 bg-[#1a1d24] text-[10px] uppercase tracking-[0.16em] text-[#7b8393]">
                <tr>
                  <th className="px-4 py-[7px] text-left font-medium">Time</th>
                  <th className="px-3 py-[7px] text-left font-medium">Symbol</th>
                  <th className="px-3 py-[7px] text-left font-medium">Side</th>
                  <th className="px-3 py-[7px] text-right font-medium">Volume</th>
                  <th className="px-3 py-[7px] text-right font-medium">Price</th>
                  <th className="px-3 py-[7px] text-right font-medium">Swap</th>
                  <th className="px-4 py-[7px] text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {history.map((deal) => (
                  <tr
                    key={deal.ticket}
                    className="border-b border-[#2a2d36] bg-[#111317] transition-colors hover:bg-white/5"
                  >
                    <td className="px-4 py-[9px] text-[11px] text-[#aab2c1]">
                      {new Date(deal.time).toLocaleString()}
                    </td>
                    <td className="px-3 py-[9px] font-semibold text-white">
                      {deal.symbol ? formatTerminalDisplaySymbol(deal.symbol) : '--'}
                    </td>
                    <td className="px-3 py-[9px]">
                      <span
                        className={cn(
                          'inline-flex rounded-sm px-2 py-[3px] text-[11px] font-semibold uppercase',
                          deal.type === 'buy'
                            ? 'bg-[#089981]/12 text-[#089981]'
                            : deal.type === 'sell'
                              ? 'bg-[#f23645]/12 text-[#f23645]'
                              : 'bg-[#232831] text-[#aab2c1]',
                        )}
                      >
                        {deal.type}
                      </span>
                    </td>
                    <td className="px-3 py-[9px] text-right font-mono text-white">
                      {deal.volume.toFixed(2)}
                    </td>
                    <td className="px-3 py-[9px] text-right font-mono text-white">
                      {deal.price.toFixed(5)}
                    </td>
                    <td className="px-3 py-[9px] text-right font-mono text-[#aab2c1]">
                      {deal.swap.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-[9px] text-right font-mono font-semibold',
                        deal.profit >= 0 ? 'text-[#089981]' : 'text-[#f23645]',
                      )}
                    >
                      {formatSignedCurrency(deal.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export default TradeHistoryTable;
