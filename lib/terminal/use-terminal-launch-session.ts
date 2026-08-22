'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TradingAccount as DashboardTradingAccount } from '@/types/dashboard';
import { useWebtraderStore } from '@/store/webtrader-store';
import { getPreferredTerminalSubscriptionSymbols } from '@/lib/trading/terminal-symbols';
import { buildOhlcSessionScopeId } from '@/lib/trading/use-auto-connect';
import { ohlcService } from '@/lib/terminal/ohlcWebSocketService';
import type { WebSocketTradingClient } from '@/lib/trading/websocket-client';
import {
  TerminalExchangeResponse,
  TerminalTicketRealtimeClient,
  createAndExchangeTerminalSession,
  exchangeTerminalLaunchCode,
  getTerminalApiBaseUrl,
  getTerminalWsBaseUrl,
} from '@/lib/terminal/ticket-terminal-client';

type LaunchStatus =
  | 'idle'
  | 'exchanging'
  | 'authenticating'
  | 'restoring'
  | 'connecting'
  | 'connected'
  | 'ready'
  | 'locked'
  | 'degraded'
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
  | { mode: 'launch-code'; launchCode: string }
  | { mode: 'account-login'; login: string };

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

const LAUNCH_CODE_PARAM_NAMES = ['launch', 'launch_code', 'launchCode', 'code'] as const;

const firstLaunchCodeFromParams = (params: URLSearchParams): string | null => {
  for (const name of LAUNCH_CODE_PARAM_NAMES) {
    const value = params.get(name)?.trim();
    if (value) return value;
  }
  return null;
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
    // The exchange is already ownership-gated and returns the immutable account
    // UUID. Preserve it so session-scoped OHLC work never starts under a temporary
    // login identity and then restarts when the dashboard catalog arrives.
    id: parseString(context?.account_id ?? context?.accountId, `terminal-launch-${accountNumber}`),
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

const readLaunchCodeFromLocation = (): string | null => {
  if (typeof window === 'undefined') return null;

  const searchCode = firstLaunchCodeFromParams(new URLSearchParams(window.location.search));
  if (searchCode) return searchCode;

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  return firstLaunchCodeFromParams(new URLSearchParams(hash));
};

const removeLaunchCodeFromLocation = (): void => {
  if (typeof window === 'undefined') return;
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  let removed = false;

  for (const name of LAUNCH_CODE_PARAM_NAMES) {
    if (searchParams.has(name)) {
      searchParams.delete(name);
      removed = true;
    }
    if (hashParams.has(name)) {
      hashParams.delete(name);
      removed = true;
    }
  }

  if (!removed) return;

  const nextSearch = searchParams.toString();
  const nextHash = hashParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`;
  window.history.replaceState(window.history.state, '', nextUrl);
};

const parseAccountLogin = (accountId: string | null | undefined): string | null => {
  const candidate = accountId?.trim().replace(/^mt5-/i, '') ?? '';
  if (!/^\d+$/.test(candidate) || Number(candidate) <= 0) return null;
  return candidate;
};

// React Strict Mode replays effects in development. Reuse the in-flight
// one-time-code exchange during that replay so the first request cannot consume
// the code and leave the second connection with an already-used ticket.
const pendingExchangeByKey = new Map<string, Promise<TerminalExchangeResponse>>();

const acquireTerminalExchange = (
  start: TerminalSessionStart,
): Promise<TerminalExchangeResponse> => {
  const key = start.mode === 'launch-code'
    ? `launch:${start.launchCode}`
    : `account:${start.login}`;
  const pending = pendingExchangeByKey.get(key);
  if (pending) return pending;

  const request = start.mode === 'launch-code'
    ? exchangeTerminalLaunchCode(start.launchCode, getTerminalApiBaseUrl())
    : createAndExchangeTerminalSession(start.login, getTerminalApiBaseUrl());
  pendingExchangeByKey.set(key, request);
  void request.then(
    () => pendingExchangeByKey.delete(key),
    () => pendingExchangeByKey.delete(key),
  );
  return request;
};

export const useTerminalLaunchSession = (
  requestedAccountId?: string | null,
  canonicalAccountId?: string | null,
): UseTerminalLaunchSessionResult => {
  const locationLaunchCode = useMemo(readLaunchCodeFromLocation, []);
  const accountLogin = useMemo(
    () => parseAccountLogin(requestedAccountId),
    [requestedAccountId],
  );
  const sessionStart = useMemo<TerminalSessionStart | null>(() => {
    if (locationLaunchCode) {
      return { mode: 'launch-code', launchCode: locationLaunchCode };
    }
    return accountLogin ? { mode: 'account-login', login: accountLogin } : null;
  }, [accountLogin, locationLaunchCode]);
  const ohlcSessionScopeId = useMemo(() => {
    const accountId = canonicalAccountId?.trim();
    return accountId ? buildOhlcSessionScopeId(accountId) : null;
  }, [canonicalAccountId]);
  const [exchange, setExchange] = useState<TerminalExchangeResponse | null>(null);
  const [status, setStatus] = useState<LaunchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<TerminalTicketRealtimeClient | null>(null);

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
    if (!sessionStart) {
      setExchange(null);
      setStatus('idle');
      setError(null);
      return;
    }

    let isCancelled = false;
    let didExchange = false;
    let initialAccountRefreshComplete = false;
    let terminalExpiryTimer: ReturnType<typeof setTimeout> | null = null;
    setExchange(null);
    setStatus('exchanging');
    setConnectionStatus('connecting');
    setError(null);
    setConnectionError(null);

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

    void acquireTerminalExchange(sessionStart)
      .then(async (payload) => {
        if (isCancelled) return;

        if (!payload.terminal_token || !payload.feed_ticket || !payload.trade_ticket) {
          throw new Error('Terminal launch exchange did not return a token and websocket tickets.');
        }

        didExchange = true;
        setExchange(payload);
        if (sessionStart.mode === 'launch-code') {
          removeLaunchCodeFromLocation();
        }
        ohlcService.setUseHistoryApi(false);
        const accountContext = getAccountContext(payload);
        const launchLogin = parseLogin(accountContext);
        const launchAccountId = launchLogin > 0 ? `mt5-${launchLogin}` : null;
        const launchCanonicalAccountId = parseString(
          accountContext?.account_id ?? accountContext?.accountId,
        );
        const resolvedOhlcSessionScopeId = ohlcSessionScopeId ?? (
          launchCanonicalAccountId
            ? buildOhlcSessionScopeId(launchCanonicalAccountId)
            : null
        );
        if (resolvedOhlcSessionScopeId) {
          setOhlcSessionScopeId(resolvedOhlcSessionScopeId);
          ohlcService.connect(resolvedOhlcSessionScopeId);
        }

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
            if (session && (resolvedOhlcSessionScopeId || launchAccountId)) {
              // Account hints provide the immutable UUID on the normal launch
              // path. Preserve the old server/group isolation only as a direct-
              // launch fallback when no account snapshot was available.
              const fallbackIdentity = [
                launchAccountId,
                Number.isFinite(session.login) ? String(session.login) : '',
                session.server.trim(),
                (session.group ?? '').trim().replace(/\//g, '\\'),
              ].filter(Boolean).join('|');
              const scopeId = resolvedOhlcSessionScopeId ?? buildOhlcSessionScopeId(fallbackIdentity);
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

        const sessionSymbols = await client.getSymbols();
        if (sessionSymbols.length === 0) {
          throw new Error(
            'No trading symbols are available for this account broker group. Reopen the terminal after the broker catalog is refreshed.',
          );
        }
        setSymbols(sessionSymbols);

        setStatus('connecting');
        await client.connect();
        if (isCancelled) return;

        const subscriptionSymbols = getPreferredTerminalSubscriptionSymbols(sessionSymbols);
        await client.subscribeSymbols(subscriptionSymbols).catch(() => undefined);
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
    ohlcSessionScopeId,
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
    isActive: Boolean(sessionStart),
    status,
    error,
    account,
    accountId,
    launchCode,
    isRestoring,
  };
};
