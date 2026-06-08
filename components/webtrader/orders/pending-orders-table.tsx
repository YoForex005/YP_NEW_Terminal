'use client';

import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, Clock, Edit3, X } from 'lucide-react';

import { SymbolIcon } from '@/components/terminal/SymbolIcon';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ORDER_TYPE_LABELS } from '@/lib/trading/constants';
import { formatTerminalDisplaySymbol } from '@/lib/trading/terminal-symbols';
import { cn } from '@/lib/utils';
import { useWebtraderStore } from '@/store/webtrader-store';
import type { Order } from '@/types/webtrader';

interface PendingOrdersTableProps {
  className?: string;
}

const TERMINAL_TABLE_FONT = 'Tahoma, Arial, sans-serif';

const getOrderTypeColor = (type: string) => {
  if (type.startsWith('buy')) return 'bg-[#089981]/12 text-[#089981]';
  if (type.startsWith('sell')) return 'bg-[#f23645]/12 text-[#f23645]';
  return 'bg-[#232831] text-[#a4acba]';
};

const getOrderLabel = (type: Order['type']) => ORDER_TYPE_LABELS[type] || type;

function EmptyState() {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 px-6 text-center text-[#7f8795]">
      <div className="rounded-full border border-[#2a2d36] p-4">
        <Briefcase className="h-9 w-9" strokeWidth={1.5} />
      </div>
      <div className="space-y-1">
        <p className="text-[14px] font-medium text-[#c7ced9]">No pending orders</p>
        <p className="text-[12px]">Limit and stop orders will appear here.</p>
      </div>
    </div>
  );
}

export function PendingOrdersTable({ className }: PendingOrdersTableProps) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showModifyDialog, setShowModifyDialog] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [newSL, setNewSL] = useState('');
  const [newTP, setNewTP] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const orders = useWebtraderStore((state) => state.orders);
  const symbols = useWebtraderStore((state) => state.symbols);
  const wsClient = useWebtraderStore((state) => state.wsClient);
  const removeOrder = useWebtraderStore((state) => state.removeOrder);
  const updateOrder = useWebtraderStore((state) => state.updateOrder);
  const setIsCancellingOrder = useWebtraderStore((state) => state.setIsCancellingOrder);

  const pendingOrders = useMemo(
    () =>
      orders.filter((order) =>
        ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop'].includes(order.type),
      ),
    [orders],
  );

  const getSymbolInfo = useCallback(
    (symbolName: string) => symbols.find((symbol) => symbol.name === symbolName),
    [symbols],
  );

  const formatPrice = useCallback(
    (price: number, symbolName: string) =>
      price.toFixed(getSymbolInfo(symbolName)?.digits || 5),
    [getSymbolInfo],
  );

  const handleCancelOrder = useCallback(async () => {
    if (!wsClient || !selectedOrder) return;

    setIsProcessing(true);
    setIsCancellingOrder(true);

    try {
      const result = await wsClient.cancelOrder(selectedOrder.ticket);
      if (result.retcode === 10009 || result.retcode === 10008) {
        removeOrder(selectedOrder.ticket);
        setShowCancelDialog(false);
        setSelectedOrder(null);
      }
    } catch (error) {
      console.error('Cancel order failed:', error);
    } finally {
      setIsProcessing(false);
      setIsCancellingOrder(false);
    }
  }, [removeOrder, selectedOrder, setIsCancellingOrder, wsClient]);

  const handleModifyOrder = useCallback(async () => {
    if (!wsClient || !selectedOrder) return;

    setIsProcessing(true);

    try {
      const price = newPrice ? parseFloat(newPrice) : undefined;
      const sl = newSL ? parseFloat(newSL) : undefined;
      const tp = newTP ? parseFloat(newTP) : undefined;

      const result = await wsClient.modifyOrder(selectedOrder.ticket, {
        price,
        sl,
        tp,
        isPosition: false,
      });

      if (result.retcode === 10009 || result.retcode === 10008) {
        updateOrder({
          ...selectedOrder,
          openPrice: price || selectedOrder.openPrice,
          sl: sl || selectedOrder.sl,
          tp: tp || selectedOrder.tp,
        });
        setShowModifyDialog(false);
        setSelectedOrder(null);
      }
    } catch (error) {
      console.error('Modify order failed:', error);
    } finally {
      setIsProcessing(false);
      setNewPrice('');
      setNewSL('');
      setNewTP('');
    }
  }, [newPrice, newSL, newTP, selectedOrder, updateOrder, wsClient]);

  const openCancelDialog = useCallback((order: Order) => {
    setSelectedOrder(order);
    setShowCancelDialog(true);
  }, []);

  const openModifyDialog = useCallback((order: Order) => {
    setSelectedOrder(order);
    setNewPrice(order.openPrice.toString());
    setNewSL(order.sl ? order.sl.toString() : '');
    setNewTP(order.tp ? order.tp.toString() : '');
    setShowModifyDialog(true);
  }, []);

  const getTimeRemaining = (expiration?: Date) => {
    if (!expiration) return null;
    const diff = expiration.getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return '< 1h';
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const buyCount = pendingOrders.filter((order) => order.type.startsWith('buy')).length;
  const sellCount = pendingOrders.filter((order) => order.type.startsWith('sell')).length;

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-[#111317] text-white', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#2a2d36] bg-[#15181e] px-4 py-2 text-[11px]">
        <div className="rounded-sm border border-[#2a2d36] bg-[#111317] px-2.5 py-1 text-[#c8cfda]">
          {pendingOrders.length} pending
        </div>
        <div className="rounded-sm border border-[#2a2d36] bg-[#111317] px-2.5 py-1 text-[#089981]">
          {buyCount} buy
        </div>
        <div className="rounded-sm border border-[#2a2d36] bg-[#111317] px-2.5 py-1 text-[#f23645]">
          {sellCount} sell
        </div>
        <div className="ml-auto text-[#8a93a3]">
          GTC and expiring orders are listed here.
        </div>
      </div>

      {pendingOrders.length === 0 ? (
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
                  <th className="px-3 py-[7px] text-right font-medium">Entry</th>
                  <th className="px-3 py-[7px] text-right font-medium">S/L</th>
                  <th className="px-3 py-[7px] text-right font-medium">T/P</th>
                  <th className="px-3 py-[7px] text-right font-medium">Placed</th>
                  <th className="px-3 py-[7px] text-right font-medium">Expiry</th>
                  <th className="px-4 py-[7px] text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {pendingOrders.map((order) => (
                    <motion.tr
                      key={order.ticket}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="group border-b border-[#2a2d36] bg-[#111317] transition-colors hover:bg-white/5"
                    >
                      <td className="px-4 py-[9px]">
                        <div className="flex items-center gap-2">
                          <SymbolIcon symbol={order.symbol} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-white">
                              {formatTerminalDisplaySymbol(order.symbol)}
                            </div>
                            <div className="text-[10px] text-[#78808f]">#{order.ticket}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-[9px]">
                        <span className={cn('inline-flex rounded-sm px-2 py-[3px] text-[11px] font-semibold', getOrderTypeColor(order.type))}>
                          {getOrderLabel(order.type)}
                        </span>
                      </td>
                      <td className="px-3 py-[9px] text-right font-mono text-white">
                        {order.volume.toFixed(2)}
                      </td>
                      <td className="px-3 py-[9px] text-right font-mono text-white">
                        {formatPrice(order.openPrice, order.symbol)}
                      </td>
                      <td className="px-3 py-[9px] text-right font-mono text-[#aab2c1]">
                        {order.sl ? formatPrice(order.sl, order.symbol) : '--'}
                      </td>
                      <td className="px-3 py-[9px] text-right font-mono text-[#aab2c1]">
                        {order.tp ? formatPrice(order.tp, order.symbol) : '--'}
                      </td>
                      <td className="px-3 py-[9px] text-right text-[11px] text-[#aab2c1]">
                        {order.openTime.toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-[9px] text-right text-[11px]">
                        {order.expiration ? (
                          <span className="font-semibold text-amber-300">
                            {getTimeRemaining(order.expiration)}
                          </span>
                        ) : (
                          <span className="text-[#8a93a3]">GTC</span>
                        )}
                      </td>
                      <td className="px-4 py-[9px]">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => openModifyDialog(order)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#8a93a3] transition-colors hover:bg-white/5 hover:text-white"
                            title="Modify order"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openCancelDialog(order)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-[#f23645] transition-colors hover:bg-[#f23645]/10 hover:text-[#ff6b78]"
                            title="Cancel order"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="border-[#2a2d36] bg-[#15181e] text-white">
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
            <DialogDescription className="text-[#8a93a3]">
              Are you sure you want to cancel order #{selectedOrder?.ticket}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4 text-sm">
            <div className="flex justify-between">
              <span className="text-[#8a93a3]">Type</span>
              <span className={cn('rounded-sm px-2 py-[2px] text-[11px] font-semibold', getOrderTypeColor(selectedOrder?.type || ''))}>
                {selectedOrder ? getOrderLabel(selectedOrder.type) : '--'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a93a3]">Symbol</span>
              <span>{selectedOrder?.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a93a3]">Volume</span>
              <span>{selectedOrder?.volume.toFixed(2)} lots</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8a93a3]">Entry price</span>
              <span className="font-mono">
                {selectedOrder
                  ? formatPrice(selectedOrder.openPrice, selectedOrder.symbol)
                  : '--'}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              className="border-[#3a404c] bg-transparent text-white hover:bg-white/5"
            >
              Keep Order
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelOrder}
              disabled={isProcessing}
              className="bg-[#f23645] text-white hover:bg-[#d82f3d]"
            >
              {isProcessing ? 'Cancelling...' : 'Cancel Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModifyDialog} onOpenChange={setShowModifyDialog}>
        <DialogContent className="border-[#2a2d36] bg-[#15181e] text-white">
          <DialogHeader>
            <DialogTitle>Modify Order</DialogTitle>
            <DialogDescription className="text-[#8a93a3]">
              Update order #{selectedOrder?.ticket} parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-[#c8cfda]">Entry Price</Label>
              <Input
                type="number"
                value={newPrice}
                onChange={(event) => setNewPrice(event.target.value)}
                step={getSymbolInfo(selectedOrder?.symbol || '')?.point || 0.00001}
                className="border-[#3a404c] bg-[#111317] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[#c8cfda]">Stop Loss</Label>
              <Input
                type="number"
                value={newSL}
                onChange={(event) => setNewSL(event.target.value)}
                step={getSymbolInfo(selectedOrder?.symbol || '')?.point || 0.00001}
                placeholder="No stop loss"
                className="border-[#3a404c] bg-[#111317] text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[#c8cfda]">Take Profit</Label>
              <Input
                type="number"
                value={newTP}
                onChange={(event) => setNewTP(event.target.value)}
                step={getSymbolInfo(selectedOrder?.symbol || '')?.point || 0.00001}
                placeholder="No take profit"
                className="border-[#3a404c] bg-[#111317] text-white"
              />
            </div>
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
              onClick={handleModifyOrder}
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

export default PendingOrdersTable;
