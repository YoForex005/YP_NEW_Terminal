'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Edit3,
  X,
} from 'lucide-react';

import { SymbolIcon } from '@/components/terminal/SymbolIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';
import { cn, formatCurrency, formatSignedCurrency } from '@/lib/utils';
import { useWebtraderStore } from '@/store/webtrader-store';
import type { Position } from '@/types/webtrader';

interface PositionsTableProps {
  className?: string;
}

const TERMINAL_TABLE_FONT = 'Tahoma, Arial, sans-serif';

function EmptyState() {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center text-[#7f8795]">
      <div className="rounded-full border border-[#2a2d36] p-4">
        <Briefcase className="h-9 w-9" strokeWidth={1.5} />
      </div>
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-[#c7ced9]">No open positions</p>
        <p className="text-[12px]">Open trades will appear here once an order is filled.</p>
      </div>
    </div>
  );
}

export function PositionsTable({ className }: PositionsTableProps) {
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showModifyDialog, setShowModifyDialog] = useState(false);
  const [closeVolume, setCloseVolume] = useState('');
  const [newSL, setNewSL] = useState('');
  const [newTP, setNewTP] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const positions = useWebtraderStore((state) => state.positions);
  const symbols = useWebtraderStore((state) => state.symbols);
  const wsClient = useWebtraderStore((state) => state.wsClient);
  const prices = useWebtraderStore((state) => state.prices);
  const removePosition = useWebtraderStore((state) => state.removePosition);
  const updatePosition = useWebtraderStore((state) => state.updatePosition);
  const setIsClosingPosition = useWebtraderStore((state) => state.setIsClosingPosition);

  const stats = useMemo(() => {
    const totalProfit = positions.reduce((sum, position) => sum + position.profit, 0);
    const totalSwap = positions.reduce((sum, position) => sum + position.swap, 0);
    const totalVolume = positions.reduce((sum, position) => sum + position.volume, 0);

    return {
      count: positions.length,
      totalProfit,
      totalSwap,
      totalVolume,
      buyCount: positions.filter((position) => position.type === 'buy').length,
      sellCount: positions.filter((position) => position.type === 'sell').length,
    };
  }, [positions]);

  const getSymbolInfo = useCallback(
    (symbolName: string) => symbols.find((symbol) => symbol.name === symbolName),
    [symbols],
  );

  const formatPrice = useCallback(
    (price: number, symbolName: string) =>
      price.toFixed(getSymbolInfo(symbolName)?.digits || 5),
    [getSymbolInfo],
  );

  const handleClosePosition = useCallback(async () => {
    if (!wsClient || !selectedPosition) return;

    setIsProcessing(true);
    setIsClosingPosition(true);
    setActionError(null);

    try {
      const volume = closeVolume ? parseFloat(closeVolume) : undefined;
      const result = await wsClient.closePosition(selectedPosition.ticket, volume);

      if (result.retcode === 10009 || result.retcode === 10008) {
        if (!volume || volume >= selectedPosition.volume) {
          removePosition(selectedPosition.ticket);
        } else {
          updatePosition({
            ...selectedPosition,
            volume: selectedPosition.volume - volume,
          });
        }
        setShowCloseDialog(false);
        setSelectedPosition(null);
      } else {
        setActionError(result.comment || `Trade server rejected the request (code ${result.retcode}).`);
      }
    } catch (error) {
      console.error('Close position failed:', error);
      setActionError(error instanceof Error ? error.message : 'Close position failed.');
    } finally {
      setIsProcessing(false);
      setIsClosingPosition(false);
      setCloseVolume('');
    }
  }, [
    closeVolume,
    removePosition,
    selectedPosition,
    setIsClosingPosition,
    updatePosition,
    wsClient,
  ]);

  const handleModifyPosition = useCallback(async () => {
    if (!wsClient || !selectedPosition) return;

    setIsProcessing(true);
    setActionError(null);

    try {
      const sl = newSL ? parseFloat(newSL) : undefined;
      const tp = newTP ? parseFloat(newTP) : undefined;
      const result = await wsClient.modifyOrder(selectedPosition.ticket, {
        sl,
        tp,
      });

      if (result.retcode === 10009 || result.retcode === 10008) {
        updatePosition({
          ...selectedPosition,
          sl: sl ?? selectedPosition.sl,
          tp: tp ?? selectedPosition.tp,
        });
        setShowModifyDialog(false);
        setSelectedPosition(null);
      } else {
        setActionError(result.comment || `Modification rejected by trade server (code ${result.retcode}).`);
      }
    } catch (error) {
      console.error('Modify position failed:', error);
      setActionError(error instanceof Error ? error.message : 'Modify position failed.');
    } finally {
      setIsProcessing(false);
      setNewSL('');
      setNewTP('');
    }
  }, [newSL, newTP, selectedPosition, updatePosition, wsClient]);

  const openCloseDialog = useCallback((position: Position) => {
    setSelectedPosition(position);
    setCloseVolume(position.volume.toString());
    setActionError(null);
    setShowCloseDialog(true);
  }, []);

  const openModifyDialog = useCallback((position: Position) => {
    setSelectedPosition(position);
    setNewSL(position.sl ? position.sl.toString() : '');
    setNewTP(position.tp ? position.tp.toString() : '');
    setActionError(null);
    setShowModifyDialog(true);
  }, []);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-[#111317] text-white', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#2a2d36] bg-[#15181e] px-4 py-2 text-[11px]">
        <div className="rounded-sm border border-[#2a2d36] bg-[#111317] px-2.5 py-1 text-[#c8cfda]">
          {stats.count} open
        </div>
        <div className="rounded-sm border border-[#2a2d36] bg-[#111317] px-2.5 py-1 text-[#c8cfda]">
          {stats.totalVolume.toFixed(2)} lots
        </div>
        <div
          className={cn(
            'rounded-sm border border-[#2a2d36] bg-[#111317] px-2.5 py-1 font-semibold',
            stats.totalProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]',
          )}
        >
          Net {formatSignedCurrency(stats.totalProfit)}
        </div>
        <div className="rounded-sm border border-[#2a2d36] bg-[#111317] px-2.5 py-1 text-[#a4acba]">
          Swap {formatCurrency(stats.totalSwap)}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[#8a93a3]">
          <span className="rounded-sm border border-[#2a2d36] px-2 py-1">{stats.buyCount} buy</span>
          <span className="rounded-sm border border-[#2a2d36] px-2 py-1">{stats.sellCount} sell</span>
        </div>
      </div>

      {positions.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollArea className="flex-1">
          <div style={{ fontFamily: TERMINAL_TABLE_FONT }}>
            <table className="min-w-[980px] w-full border-collapse text-[12px]">
              <thead className="sticky top-0 z-10 bg-[#1a1d24] text-[10px] uppercase tracking-[0.16em] text-[#7b8393]">
                <tr>
                  <th className="px-4 py-[7px] text-left font-medium">Symbol</th>
                  <th className="px-3 py-[7px] text-left font-medium">Type</th>
                  <th className="px-3 py-[7px] text-right font-medium">Volume</th>
                  <th className="px-3 py-[7px] text-right font-medium">Open price</th>
                  <th className="px-3 py-[7px] text-right font-medium">Current</th>
                  <th className="px-3 py-[7px] text-right font-medium">S/L</th>
                  <th className="px-3 py-[7px] text-right font-medium">T/P</th>
                  <th className="px-3 py-[7px] text-right font-medium">Swap</th>
                  <th className="px-3 py-[7px] text-right font-medium">P/L</th>
                  <th className="px-4 py-[7px] text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {positions.map((position) => {
                    const livePrice = prices[position.symbol];
                    const currentPriceValue =
                      position.type === 'buy'
                        ? livePrice?.bid || position.priceCurrent
                        : livePrice?.ask || position.priceCurrent;

                    // Client-side live P&L: (priceDelta / tickSize) * tickValue * volume
                    const symInfo = getSymbolInfo(position.symbol);
                    const priceDelta = position.type === 'buy'
                      ? currentPriceValue - position.openPrice
                      : position.openPrice - currentPriceValue;
                    const liveProfit = (symInfo?.tickSize && symInfo?.tickValue && currentPriceValue)
                      ? (priceDelta / symInfo.tickSize) * symInfo.tickValue * position.volume
                      : position.profit;

                    return (
                      <motion.tr
                        key={position.ticket}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="group border-b border-[#2a2d36] bg-[#111317] transition-colors hover:bg-white/5"
                      >
                        <td className="px-4 py-[9px]">
                          <div className="flex items-center gap-2">
                            <SymbolIcon symbol={position.symbol} />
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-white">
                                {formatTerminalDisplaySymbol(position.symbol)}
                              </div>
                              <div className="text-[10px] text-[#78808f]">#{position.ticket}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-[9px]">
                          <div
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-sm px-2 py-[3px] text-[11px] font-semibold',
                              position.type === 'buy'
                                ? 'bg-[#089981]/12 text-[#089981]'
                                : 'bg-[#f23645]/12 text-[#f23645]',
                            )}
                          >
                            {position.type === 'buy' ? (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5" />
                            )}
                            <span>{position.type === 'buy' ? 'Buy' : 'Sell'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-[9px] text-right font-mono text-white">
                          {position.volume.toFixed(2)}
                        </td>
                        <td className="px-3 py-[9px] text-right font-mono text-white">
                          {formatPrice(position.openPrice, position.symbol)}
                        </td>
                        <td className="px-3 py-[9px] text-right font-mono text-white">
                          {currentPriceValue
                            ? formatPrice(currentPriceValue, position.symbol)
                            : '--'}
                        </td>
                        <td className="px-3 py-[9px] text-right font-mono text-[#aab2c1]">
                          {position.sl ? formatPrice(position.sl, position.symbol) : '--'}
                        </td>
                        <td className="px-3 py-[9px] text-right font-mono text-[#aab2c1]">
                          {position.tp ? formatPrice(position.tp, position.symbol) : '--'}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-[9px] text-right font-mono',
                            position.swap > 0
                              ? 'text-[#089981]'
                              : position.swap < 0
                                ? 'text-[#f23645]'
                                : 'text-[#aab2c1]',
                          )}
                        >
                          {formatCurrency(position.swap)}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-[9px] text-right font-mono font-semibold',
                            liveProfit >= 0 ? 'text-[#089981]' : 'text-[#f23645]',
                          )}
                        >
                          {formatSignedCurrency(liveProfit)}
                        </td>
                        <td className="px-4 py-[9px]">
                          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => openModifyDialog(position)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#8a93a3] transition-colors hover:bg-white/5 hover:text-white"
                              title="Modify stop loss / take profit"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openCloseDialog(position)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#f23645] transition-colors hover:bg-[#f23645]/10 hover:text-[#ff6b78]"
                              title="Close position"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}

      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="border-[#2a2d36] bg-[#15181e] text-white">
          <DialogHeader>
            <DialogTitle>Close Position</DialogTitle>
            <DialogDescription className="text-[#8a93a3]">
              Close position #{selectedPosition?.ticket} on {selectedPosition?.symbol}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between text-sm">
              <span className="text-[#8a93a3]">Type</span>
              <span
                className={cn(
                  'font-semibold',
                  selectedPosition?.type === 'buy' ? 'text-[#089981]' : 'text-[#f23645]',
                )}
              >
                {selectedPosition?.type?.toUpperCase()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8a93a3]">Volume</span>
              <span>{selectedPosition?.volume.toFixed(2)} lots</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#8a93a3]">Current P/L</span>
              <span
                className={cn(
                  'font-semibold',
                  (selectedPosition?.profit || 0) >= 0 ? 'text-[#089981]' : 'text-[#f23645]',
                )}
              >
                {formatSignedCurrency(selectedPosition?.profit || 0)}
              </span>
            </div>
            <div className="space-y-2">
              <Label className="text-[#c8cfda]">Volume to close (lots)</Label>
              <Input
                type="number"
                value={closeVolume}
                onChange={(event) => setCloseVolume(event.target.value)}
                min={0.01}
                max={selectedPosition?.volume}
                step={0.01}
                placeholder="Enter volume or leave empty for full close"
                className="border-[#3a404c] bg-[#111317] text-white"
              />
              <p className="text-xs text-[#8a93a3]">
                Leave empty to close the entire position.
              </p>
            </div>
            {actionError ? <p className="text-sm text-[#f23645]">{actionError}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCloseDialog(false)}
              className="border-[#3a404c] bg-transparent text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClosePosition}
              disabled={isProcessing}
              className="bg-[#f23645] text-white hover:bg-[#d82f3d]"
            >
              {isProcessing ? 'Closing...' : 'Close Position'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModifyDialog} onOpenChange={setShowModifyDialog}>
        <DialogContent className="border-[#2a2d36] bg-[#15181e] text-white">
          <DialogHeader>
            <DialogTitle>Modify Position</DialogTitle>
            <DialogDescription className="text-[#8a93a3]">
              Update stop loss and take profit for position #{selectedPosition?.ticket}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[#c8cfda]">Stop Loss</Label>
              <Input
                type="number"
                value={newSL}
                onChange={(event) => setNewSL(event.target.value)}
                step={getSymbolInfo(selectedPosition?.symbol || '')?.point || 0.00001}
                placeholder="Enter stop loss price"
                className="border-[#3a404c] bg-[#111317] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[#c8cfda]">Take Profit</Label>
              <Input
                type="number"
                value={newTP}
                onChange={(event) => setNewTP(event.target.value)}
                step={getSymbolInfo(selectedPosition?.symbol || '')?.point || 0.00001}
                placeholder="Enter take profit price"
                className="border-[#3a404c] bg-[#111317] text-white"
              />
            </div>
            {actionError ? <p className="text-sm text-[#f23645]">{actionError}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowModifyDialog(false)}
              className="border-[#3a404c] bg-transparent text-white hover:bg-white/5"
            >
              Cancel
            </Button>
            <Button
              onClick={handleModifyPosition}
              disabled={isProcessing}
              className="bg-[#3b82f6] text-white hover:bg-[#2563eb]"
            >
              {isProcessing ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PositionsTable;
