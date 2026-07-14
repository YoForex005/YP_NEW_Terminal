'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TradingAccount as DashboardTradingAccount } from '@/types/dashboard';
import type { SymbolInfo, TradingSession } from '@/types/webtrader';
import { useWebtraderStore } from '@/store/webtrader-store';
import { DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS } from '@/lib/trading/terminal-symbols';
import { ohlcService } from '@/lib/terminal/ohlcWebSocketService';
import type { WebSocketTradingClient } from '@/lib/trading/websocket-client';
import {
  TerminalExchangeResponse,
  TerminalTicketRealtimeClient,
  exchangeTerminalLaunchCode,
  getTerminalApiBaseUrl,
  getTerminalWsBaseUrl,
} from '@/lib/terminal/ticket-terminal-client';

type LaunchStatus =
  | 'idle'
  | 'exchanging'
  | 'restoring'
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'reconnecting'
  | 'error'
  | 'disconnected';

interface UseTerminalLaunchSessionResult {
  isActive: boolean;
  status: LaunchStatus;
  error: string | null;
  account: DashboardTradingAccount | null;
  accountId: string | null;
  launchCode: string | null;
  isRestoring: boolean;
}

type TerminalSessionStart =
  { mode: 'launch-code'; launchCode: string };

const TERMINAL_EXPIRY_SAFETY_WINDOW_MS = 5_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const parseNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const parseLogin = (context: Record<string, unknown> | undefined): number => {
  if (!context) return 0;
  return Math.trunc(parseNumber(
    context.login ??
      context.mt5_login ??
      context.account_login ??
      context.accountLogin ??
      context.account,
  ));
};

const hasAccountIdQueryParam = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('accountId');
};

const getAccountContext = (
  exchange: TerminalExchangeResponse | null,
): Record<string, unknown> | undefined =>
  isRecord(exchange?.account_context) ? exchange.account_context : undefined;

const buildLaunchAccount = (
  exchange: TerminalExchangeResponse | null,
): DashboardTradingAccount | null => {
  const context = getAccountContext(exchange);
  const login = parseLogin(context);
  if (!context && !login) return null;

  const accountNumber = login > 0 ? String(login) : parseString(context?.accountNumber ?? context?.account_number, 'terminal');
  const balance = parseNumber(context?.balance);
  const equity = parseNumber(context?.equity, balance);
  const currency = parseString(context?.currency, 'USD');

  return {
    id: `terminal-launch-${accountNumber}`,
    accountNumber,
    name: parseString(context?.name, `MT5 ${accountNumber}`),
    platform: 'mt5',
    type: parseString(context?.type ?? context?.mode).toLowerCase() === 'live' ? 'Live' : 'Demo',
    leverage: Math.trunc(parseNumber(context?.leverage)),
    serverIp: parseString(context?.server ?? context?.serverIp),
    currency,
    balance,
    equity,
    freeMargin: parseNumber(context?.freeMargin ?? context?.marginFree ?? context?.margin_free),
    margin: parseNumber(context?.margin),
    status: 'Active',
    credentials: {
      login: accountNumber,
      server: parseString(context?.server),
      tradingPassword: '',
      investorPassword: '',
      generatedAt: new Date().toISOString(),
      source: 'broker',
    },
  };
};

const buildFallbackSymbols = (): SymbolInfo[] =>
  DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS.map((name) => ({
    name,
    description: name,
    baseCurrency: name.slice(0, 3),
    quoteCurrency: name.slice(3, 6) || 'USD',
    digits: name.includes('JPY') ? 3 : 5,
    point: name.includes('JPY') ? 0.001 : 0.00001,
    tickSize: name.includes('JPY') ? 0.001 : 0.00001,
    tickValue: 1,
    tradeContractSize: 100000,
    tradeMode: 'full',
    calcMode: 'forex',
    volumeMin: 0.01,
    volumeMax: 100,
    volumeStep: 0.01,
    marginInitial: 0,
    marginMaintenance: 0,
    swapLong: 0,
    swapShort: 0,
  }));

const normalizeOhlcSessionGroup = (group?: string): string =>
  (group ?? '').trim().replace(/\//g, '\\');

const buildLaunchOhlcSessionScopeId = (
  accountId: string,
  session: TradingSession,
): string =>
  [
    accountId.trim(),
    Number.isFinite(session.login) ? String(session.login) : '',
    session.server.trim(),
    normalizeOhlcSessionGroup(session.group),
  ].filter(Boolean).join('|');

const readLaunchCodeFromHash = (): string | null => {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  return params.get('launch')?.trim() || null;
};

const removeLaunchCodeFromHash = (): void => {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  if (!params.has('launch')) return;

  params.delete('launch');
  const nextHash = params.toString();
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`;
  window.history.replaceState(window.history.state, '', nextUrl);
};

export const useTerminalLaunchSession = (): UseTerminalLaunchSessionResult => {
  const [sessionStart, setSessionStart] = useState<TerminalSessionStart | null>(null);
  const [exchange, setExchange] = useState<TerminalExchangeResponse | null>(null);
  const [status, setStatus] = useState<LaunchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<TerminalTicketRealtimeClient | null>(null);
  const initializedRef = useRef(false);

  const setConnectionStatus = useWebtraderStore((state) => state.setConnectionStatus);
  const setConnectionError = useWebtraderStore((state) => state.setConnectionError);
  const setSession = useWebtraderStore((state) => state.setSession);
  const setAccountInfo = useWebtraderStore((state) => state.setAccountInfo);
  const setPositions = useWebtraderStore((state) => state.setPositions);
  const setOrders = useWebtraderStore((state) => state.setOrders);
  const setSymbols = useWebtraderStore((state) => state.setSymbols);
  const updatePrice = useWebtraderStore((state) => state.updatePrice);
  const setWsClient = useWebtraderStore((state) => state.setWsClient);
  const setMarketWsClient = useWebtraderStore((state) => state.setMarketWsClient);
  const setOhlcWsClient = useWebtraderStore((state) => state.setOhlcWsClient);
  const setOhlcSessionScopeId = useWebtraderStore((state) => state.setOhlcSessionScopeId);

  useEffect(() => {
    if (initializedRef.current) return;

    const nextLaunchCode = readLaunchCodeFromHash();
    if (nextLaunchCode) {
      initializedRef.current = true;
      setSessionStart({ mode: 'launch-code', launchCode: nextLaunchCode });
      return;
    }

    // The legacy accountId autoconnect path owns normal /terminal?accountId=...
    // visits. Ticket-session restore is only for launched terminal views.
    if (hasAccountIdQueryParam()) {
      initializedRef.current = true;
      return;
    }

    initializedRef.current = true;
  }, []);

  useEffect(() => {
    if (!sessionStart) return;

    let isCancelled = false;
    let didExchange = false;
    let initialAccountRefreshComplete = false;
    let terminalExpiryTimer: ReturnType<typeof setTimeout> | null = null;
    setStatus(sessionStart.mode === 'launch-code' ? 'exchanging' : 'restoring');
    setConnectionStatus('connecting');
    setError(null);
    setConnectionError(null);

    const buildPayload = async (): Promise<TerminalExchangeResponse> => {
      return exchangeTerminalLaunchCode(sessionStart.launchCode, getTerminalApiBaseUrl());
    };

    const expireTerminalSession = (message: string): void => {
      if (isCancelled) return;
      if (terminalExpiryTimer) {
        clearTimeout(terminalExpiryTimer);
        terminalExpiryTimer = null;
      }
      clientRef.current?.expireSession();
      clientRef.current = null;
      setExchange(null);
      setStatus('error');
      setError(message);
      setConnectionStatus('disconnected');
      setConnectionError(message);
      setWsClient(null);
      setMarketWsClient(null);
      setOhlcWsClient(null);
      setOhlcSessionScopeId(null);
      ohlcService.setUseHistoryApi(true);
    };

    void buildPayload()
      .then(async (payload) => {
        if (isCancelled) return;

        if (!payload.terminal_token || !payload.feed_ticket || !payload.trade_ticket) {
          throw new Error('Terminal launch exchange did not return a token and websocket tickets.');
        }

        didExchange = true;
        setExchange(payload);
        removeLaunchCodeFromHash();
        ohlcService.setUseHistoryApi(false);
        const accountContext = getAccountContext(payload);
        const launchLogin = parseLogin(accountContext);
        const launchAccountId = launchLogin > 0 ? `mt5-${launchLogin}` : null;

        const client = new TerminalTicketRealtimeClient({
          terminalToken: payload.terminal_token,
          feedTicket: payload.feed_ticket,
          tradeTicket: payload.trade_ticket,
          accountContext,
          apiBaseUrl: getTerminalApiBaseUrl(),
          wsBaseUrl: getTerminalWsBaseUrl(),
          onStatus: (nextStatus, message) => {
            if (isCancelled) return;
            const mappedStatus =
              nextStatus === 'connected'
                ? initialAccountRefreshComplete ? 'ready' : 'restoring' :
                nextStatus === 'reconnecting' ? 'reconnecting' :
                  nextStatus === 'error' ? 'error' :
                    nextStatus;
            setStatus(mappedStatus);
            setConnectionStatus(
              nextStatus === 'connected'
                ? 'connected'
                : nextStatus === 'reconnecting'
                  ? 'reconnecting'
                  : nextStatus === 'error'
                    ? 'error'
                    : nextStatus === 'connecting'
                      ? 'connecting'
                      : 'disconnected',
            );
            if (message) setConnectionError(message);
          },
          onError: (nextError) => {
            if (isCancelled) return;
            const message = nextError.message || 'Terminal websocket error.';
            setError(message);
            setConnectionError(message);
          },
          onTerminalAuthExpired: () => {
            expireTerminalSession('Terminal session expired. Reopen it from the dashboard.');
          },
          onSession: (session) => {
            if (isCancelled) return;
            setSession(session);
            if (session && launchAccountId) {
              const scopeId = buildLaunchOhlcSessionScopeId(launchAccountId, session);
              setOhlcSessionScopeId(scopeId);
              ohlcService.connect(scopeId);
            }
          },
          onTick: (tick) => {
            if (isCancelled) return;
            updatePrice(tick);
            ohlcService.ingestTick(
              tick.symbol,
              tick.bid,
              tick.ask,
              tick.last,
              tick.volume,
              tick.mt5_time_msc ?? tick.mt5TimeMsc ?? tick.time,
            );
          },
          onAccountSummary: ({ account, positions, orders }) => {
            if (isCancelled) return;
            if (account) setAccountInfo(account);
            setPositions(positions);
            setOrders(orders);
          },
        });

        clientRef.current = client;

        const expiresInSeconds = Number(payload.expires_in);
        if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
          const expiryDelayMs = Math.max(
            0,
            expiresInSeconds * 1_000 - TERMINAL_EXPIRY_SAFETY_WINDOW_MS,
          );
          terminalExpiryTimer = setTimeout(() => {
            expireTerminalSession('Terminal session expired. Reopen it from the dashboard.');
          }, expiryDelayMs);
        }

        const storeClient = client as unknown as WebSocketTradingClient;
        setWsClient(storeClient);
        setMarketWsClient(storeClient);
        setOhlcWsClient(storeClient);

        if (useWebtraderStore.getState().symbols.length === 0) {
          setSymbols(buildFallbackSymbols());
        }

        setStatus('connecting');
        await client.connect();
        if (isCancelled) return;

        await client.subscribeSymbols([...DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS]).catch(() => undefined);
        setStatus('restoring');
        setConnectionStatus('connected');

        await client.getAccountInfo();
        if (isCancelled) return;
        initialAccountRefreshComplete = true;
        setStatus('ready');
        setConnectionStatus('connected');
      })
      .catch((nextError) => {
        if (isCancelled) return;

        const message = nextError instanceof Error ? nextError.message : String(nextError);
        setStatus('error');
        setError(message);
        if (!didExchange) {
          setExchange(null);
          setConnectionStatus('disconnected');
          setConnectionError(message);
          return;
        }
        setConnectionStatus('error');
        setConnectionError(message);
      });

    return () => {
      isCancelled = true;
      if (terminalExpiryTimer) clearTimeout(terminalExpiryTimer);
      clientRef.current?.disconnect();
      clientRef.current = null;
      setWsClient(null);
      setMarketWsClient(null);
      setOhlcWsClient(null);
      setOhlcSessionScopeId(null);
      ohlcService.setUseHistoryApi(true);
    };
  }, [
    sessionStart,
    setAccountInfo,
    setConnectionError,
    setConnectionStatus,
    setMarketWsClient,
    setOhlcWsClient,
    setOhlcSessionScopeId,
    setOrders,
    setPositions,
    setSession,
    setSymbols,
    setWsClient,
    updatePrice,
  ]);

  const account = useMemo(() => buildLaunchAccount(exchange), [exchange]);
  const accountId = account ? `mt5-${account.accountNumber}` : null;
  const launchCode = sessionStart?.mode === 'launch-code' ? sessionStart.launchCode : null;
  const isRestoring = status === 'exchanging' || status === 'restoring' || status === 'connecting' || status === 'reconnecting';

  return {
    isActive: Boolean(exchange || sessionStart),
    status,
    error,
    account,
    accountId,
    launchCode,
    isRestoring,
  };
};
