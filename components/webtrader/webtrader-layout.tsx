/**
 * WebTrader Layout
 * Main layout component for the WebTrader interface
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useWebtraderStore } from '@/store/webtrader-store';
import { MarketWatchPanel } from './market-watch/market-watch-panel';
import { TradingPanel } from './trading/trading-panel';
import WebtraderKlineChart from './chart/webtrader-kline-chart';
import { AccountInfoBar } from './dashboard/account-info-bar';
import { PositionsTable } from './positions/positions-table';
import { PendingOrdersTable } from './orders/pending-orders-table';
import { TradeHistoryTable } from './history/trade-history-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getPreferredTerminalSubscriptionSymbols } from '@/lib/trading/terminal-symbols';
import { fetchMt5Session, prefetchSymbol } from '@/lib/terminal/mt5Datafeed';
import { cn } from '@/lib/utils';

interface WebtraderLayoutProps {
  className?: string;
}

export function WebtraderLayout({ className }: WebtraderLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // When accountId is in the URL the webtrader page is auto-connecting;
  // suppress the redirect guard so we don't race to /webtrader/login.
  const isAutoConnecting = Boolean(searchParams.get('accountId'));

  // Store state
  const session = useWebtraderStore((state) => state.session);
  const wsClient = useWebtraderStore((state) => state.wsClient);
  const setSession = useWebtraderStore((state) => state.setSession);
  const setConnectionStatus = useWebtraderStore((state) => state.setConnectionStatus);
  const setConnectionError = useWebtraderStore((state) => state.setConnectionError);
  const updatePrice = useWebtraderStore((state) => state.updatePrice);
  const updateQuoteStatus = useWebtraderStore((state) => state.updateQuoteStatus);
  const addPosition = useWebtraderStore((state) => state.addPosition);
  const updatePosition = useWebtraderStore((state) => state.updatePosition);
  const removePosition = useWebtraderStore((state) => state.removePosition);
  const addOrder = useWebtraderStore((state) => state.addOrder);
  const updateOrder = useWebtraderStore((state) => state.updateOrder);
  const removeOrder = useWebtraderStore((state) => state.removeOrder);
  const setAccountInfo = useWebtraderStore((state) => state.setAccountInfo);
  const selectedSymbol = useWebtraderStore((state) => state.selectedSymbol);
  const setSelectedSymbol = useWebtraderStore((state) => state.setSelectedSymbol);
  const setSymbols = useWebtraderStore((state) => state.setSymbols);
  const setPositions = useWebtraderStore((state) => state.setPositions);
  const setOrders = useWebtraderStore((state) => state.setOrders);
  const activeBottomTab = useWebtraderStore((state) => state.activeBottomTab);
  const setActiveBottomTab = useWebtraderStore((state) => state.setActiveBottomTab);

  // Load initial data
  const loadInitialData = useCallback(async (client: NonNullable<typeof wsClient>) => {
    try {
      const bootstrap = await client.getBootstrapState();

      // Commit store state immediately — don't block on subscriptions
      setSymbols(bootstrap.symbols);
      setPositions(bootstrap.positions);
      setOrders(bootstrap.orders);
      if (bootstrap.accountInfo) {
        setAccountInfo(bootstrap.accountInfo);
      }

      // Select first symbol now so chart starts loading immediately
      const firstSymbol = selectedSymbol ?? bootstrap.symbols[0]?.name ?? null;
      if (!selectedSymbol && firstSymbol) {
        setSelectedSymbol(firstSymbol);
      }

      const subscriptionSymbols = getPreferredTerminalSubscriptionSymbols(bootstrap.symbols);
      if (subscriptionSymbols.length > 0) {
        // 1. Subscribe to the selected symbol alone first — single small request
        //    that returns the first bid/ask tick in one round-trip.
        const prioritySymbols = firstSymbol
          ? subscriptionSymbols.filter((s) => s === firstSymbol)
          : [];
        const restSymbols =
          prioritySymbols.length > 0
            ? subscriptionSymbols.filter((s) => s !== firstSymbol)
            : subscriptionSymbols;

        if (prioritySymbols.length > 0) {
          void client.subscribeSymbols(prioritySymbols).catch(() => {});
        }
        // 2. All remaining symbols fire in parallel batches — non-blocking
        if (restSymbols.length > 0) {
          void client.subscribeSymbols(restSymbols).catch(() => {});
        }
      }

      void fetchMt5Session()
        .then(() => {
          const commonTf = [1, 5, 15, 60, 240, 1440];
          const topSymbols = subscriptionSymbols.slice(0, 10);
          if (firstSymbol && !topSymbols.includes(firstSymbol)) {
            topSymbols.unshift(firstSymbol);
          }
          return Promise.allSettled(
            topSymbols.map((sym) => prefetchSymbol(sym, commonTf)),
          );
        })
        .catch(() => null);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }, [
    selectedSymbol,
    setAccountInfo,
    setOrders,
    setPositions,
    setSelectedSymbol,
    setSymbols,
  ]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!session) {
      return;
    }

    // Don't redirect if auto-connect is still completing.
    if (!wsClient || !wsClient.isAuthenticated || !wsClient.isConnected) {
      if (isAutoConnecting) return; // wait â€” webtrader page is handling auth
      setConnectionStatus('disconnected');
      setConnectionError('Trading session is not active. Please log in again.');
      router.push('/webtrader/login');
      return;
    }

    wsClient.setCallbacks({
      onConnect: () => {
        setConnectionStatus('connected');
      },
      onDisconnect: (reason) => {
        setConnectionStatus('disconnected');
        console.log('WebSocket disconnected:', reason);
      },
      onError: (error) => {
        setConnectionError(error.message);
        setConnectionStatus('error');
      },
      onAuthenticated: (newSession) => {
        setSession(newSession);
        setConnectionStatus('connected');
      },
      onTick: (tick) => {
        updatePrice(tick);
      },
      onMarketStatus: (status) => {
        updateQuoteStatus(status);
      },
      onPositionUpdate: (payload) => {
        if (payload.action === 'added') {
          addPosition(payload.position);
        } else if (payload.action === 'modified') {
          updatePosition(payload.position);
        } else if (payload.action === 'deleted') {
          removePosition(payload.position.ticket);
        }
      },
      onPositionsSnapshot: (positions) => {
        setPositions(positions);
      },
      onOrderUpdate: (payload) => {
        if (payload.action === 'added') {
          addOrder(payload.order);
        } else if (payload.action === 'modified') {
          updateOrder(payload.order);
        } else if (payload.action === 'deleted') {
          removeOrder(payload.order.ticket);
        }
      },
      onOrdersSnapshot: (orders) => {
        setOrders(orders);
      },
      onAccountUpdate: (payload) => {
        setAccountInfo(payload.account);
      },
      onTradeResult: (payload) => {
        console.log('Trade result:', payload);
        void Promise.allSettled([
          wsClient.getAccountInfo(),
          wsClient.getPositions(),
          wsClient.getOrders(),
        ]).then(([accountInfoResult, positionsResult, ordersResult]) => {
          if (accountInfoResult.status === 'fulfilled' && accountInfoResult.value) {
            setAccountInfo(accountInfoResult.value);
          }
          if (positionsResult.status === 'fulfilled') {
            setPositions(positionsResult.value);
          }
          if (ordersResult.status === 'fulfilled') {
            setOrders(ordersResult.value);
          }
        });
      },
      onConnectionStatus: (status) => {
        setConnectionStatus(status.status as any);
      },
    });

    setConnectionError(null);
    setConnectionStatus('connected');

    void loadInitialData(wsClient);

    return () => {
      wsClient.setCallbacks({});
    };
  }, [
    session,
    wsClient,
    isAutoConnecting,
    router,
    setSession,
    setConnectionStatus,
    setConnectionError,
    updatePrice,
    updateQuoteStatus,
    addPosition,
    updatePosition,
    removePosition,
    addOrder,
    updateOrder,
    removeOrder,
    setOrders,
    setPositions,
    setAccountInfo,
    loadInitialData,
  ]);

  useEffect(() => {
    if (!session || !wsClient || !wsClient.isAuthenticated || !selectedSymbol) {
      return;
    }

    void wsClient.subscribeSymbols([selectedSymbol]);
  }, [session, wsClient, selectedSymbol]);

  const subscribeSelectedSymbol = useCallback((symbol: string) => {
    const nextSymbol = symbol.trim();
    if (!nextSymbol || !session || !wsClient || !wsClient.isAuthenticated) {
      return;
    }

    void wsClient.subscribeSymbols([nextSymbol]);
  }, [session, wsClient]);

  // Handle symbol selection
  const handleSymbolSelect = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    subscribeSelectedSymbol(symbol);
  }, [setSelectedSymbol, subscribeSelectedSymbol]);

  if (!session) {
    if (isAutoConnecting) return null;
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl font-bold mb-2">No Trading Session</h1>
          <p className="text-muted-foreground mb-4">
            Please log in to your MT5 account to start trading
          </p>
          <button
            onClick={() => router.push('/webtrader/login')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Login to WebTrader
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-screen flex-col overflow-hidden bg-[#111317]', className)}>
      {/* Account Info Bar */}
      <AccountInfoBar />

      {/* Main Content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* Market Watch Panel */}
        <ResizablePanel defaultSize={20} minSize={0} maxSize={50} collapsible>
          <MarketWatchPanel onSymbolSelect={handleSymbolSelect} />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center Panel: Chart + Bottom Panel */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <ResizablePanelGroup direction="vertical">
            {/* Chart — h-full propagated via className */}
            <ResizablePanel defaultSize={65} minSize={30}>
              <WebtraderKlineChart className="h-full" />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom Panel: Positions / Orders / History */}
            <ResizablePanel defaultSize={35} minSize={20}>
              <div className="flex h-full flex-col bg-[#111317]">
                <Tabs
                  value={activeBottomTab}
                  onValueChange={(value) =>
                    setActiveBottomTab(value as 'positions' | 'orders' | 'history')
                  }
                  className="flex h-full min-h-0 flex-col"
                >
                  <div className="flex-shrink-0 border-b border-[#2a2d36] bg-[#15181e] px-3 pt-2">
                    <TabsList className="h-8 gap-1 bg-transparent p-0">
                      {(['positions', 'orders', 'history'] as const).map((tab) => (
                        <TabsTrigger
                          key={tab}
                          value={tab}
                          className={cn(
                            'h-7 rounded-sm px-3 text-[12px] font-semibold capitalize',
                            'data-[state=active]:bg-[#23272f] data-[state=active]:text-white',
                            'data-[state=inactive]:text-[#6b7280] data-[state=inactive]:hover:text-[#c8cfda]',
                          )}
                        >
                          {tab}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <TabsContent
                    value="positions"
                    className="m-0 min-h-0 flex-1 overflow-auto p-0"
                  >
                    <PositionsTable />
                  </TabsContent>

                  <TabsContent
                    value="orders"
                    className="m-0 min-h-0 flex-1 overflow-auto p-0"
                  >
                    <PendingOrdersTable />
                  </TabsContent>

                  <TabsContent
                    value="history"
                    className="m-0 min-h-0 flex-1 overflow-auto p-0"
                  >
                    <TradeHistoryTable />
                  </TabsContent>
                </Tabs>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Trading Panel */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={25}>
          <TradingPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

export default WebtraderLayout;

