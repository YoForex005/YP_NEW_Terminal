"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EMPTY_DASHBOARD_SNAPSHOT } from "@/lib/dashboard/default-state";
import { createDashboardProvider } from "@/lib/dashboard/provider-factory";
import type { DashboardDataProvider } from "@/lib/dashboard/provider";
import type { DashboardSnapshot, PnlPoint, Position } from "@/types/dashboard";
import { useTradingStore } from "@/store/trading-store";
import {
  ApiError,
  ApiErrorType,
  getUserFriendlyErrorMessage,
} from "@/lib/dashboard/api-provider";

interface DashboardDataContextValue {
  snapshot: DashboardSnapshot | null;
  isLoading: boolean;
  errorMessage: string | null;
  errorType: ApiErrorType | null;
  reload: () => Promise<void>;
  lastRefreshAt: Date | null;
  retryCount: number;
  isRetrying: boolean;
  syncLivePositions: () => Promise<void>;
  isLiveSyncing: boolean;
  isLiveConnected: boolean;
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

interface DashboardDataProviderProps {
  children: React.ReactNode;
  provider?: DashboardDataProvider;
}

interface AdminPositionsSnapshotPayload {
  positions?: unknown;
  pnlSeries?: unknown;
  accountPnlSeries?: unknown;
  generatedAt?: unknown;
}

interface DashboardServerEnvelope {
  event?: string;
  requestId?: string;
  data?: unknown;
  error?:
    | string
    | {
        code?: string;
        message?: string;
        details?: unknown;
      };
}

interface PendingLiveRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: number;
}

const DASHBOARD_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "/ws";
const DASHBOARD_LIVE_WS_ENABLED = false;
const LIVE_SYNC_TIMEOUT_MS = 15_000;
const LIVE_RECONNECT_DELAY_MS = 3_000;

const isRecord = (input: unknown): input is Record<string, unknown> =>
  Boolean(input) && typeof input === "object" && !Array.isArray(input);

const normalizeDashboardWebSocketUrl = (url: string): string => {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`;
  }

  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`;
  }

  return url;
};

const getEnvelopeErrorMessage = (envelope: DashboardServerEnvelope): string => {
  if (typeof envelope.error === "string" && envelope.error.trim()) {
    return envelope.error;
  }

  if (isRecord(envelope.error) && typeof envelope.error.message === "string") {
    const message = envelope.error.message.trim();
    if (message) {
      return message;
    }
  }

  return "Dashboard live websocket request failed.";
};

const extractLiveSnapshot = (
  input: unknown,
): AdminPositionsSnapshotPayload | null => {
  if (!isRecord(input)) {
    return null;
  }

  if (isRecord(input.snapshot)) {
    return input.snapshot as AdminPositionsSnapshotPayload;
  }

  if (isRecord(input.data)) {
    const nestedSnapshot = extractLiveSnapshot(input.data);
    if (nestedSnapshot) {
      return nestedSnapshot;
    }
  }

  if (
    "positions" in input ||
    "pnlSeries" in input ||
    "accountPnlSeries" in input
  ) {
    return input as AdminPositionsSnapshotPayload;
  }

  return null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toNumericString = (value: unknown): string | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }

  if (typeof value === "string" && value.trim()) {
    return Number.isFinite(Number(value)) ? value.trim() : undefined;
  }

  return undefined;
};

const normalizeLivePositions = (input: unknown): Position[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const positions: Position[] = [];
  for (const item of input) {
    if (!isRecord(item)) {
      continue;
    }

    const id =
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : typeof item.ticket === "string" && item.ticket.trim()
          ? item.ticket.trim()
          : typeof item.ticket === "number" && Number.isFinite(item.ticket)
            ? String(item.ticket)
            : undefined;
    if (!id) {
      continue;
    }

    if (typeof item.symbol !== "string" || !item.symbol.trim()) {
      continue;
    }

    const side = item.side === "Sell" ||
      (typeof item.side === "string" && item.side.trim().toLowerCase() === "sell") ||
      (typeof item.type === "string" && item.type.trim().toLowerCase() === "sell")
      ? "Sell"
      : "Buy";
    const volume = toFiniteNumber(item.volume) ?? 0;
    const pnl = toFiniteNumber(item.pnl) ?? toFiniteNumber(item.profit) ?? 0;
    const accountLogin =
      toNumericString(item.accountLogin) ?? toNumericString(item.login);

    positions.push({
      id,
      symbol: item.symbol.trim(),
      side,
      volume,
      pnl,
      ...(accountLogin ? { accountLogin } : {}),
    });
  }

  return positions;
};

const normalizePnlSeries = (input: unknown): PnlPoint[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  const points: PnlPoint[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Partial<PnlPoint>;
    if (typeof row.t !== "string" || !row.t.trim()) {
      continue;
    }
    if (typeof row.value !== "number" || !Number.isFinite(row.value)) {
      continue;
    }
    points.push({
      t: row.t,
      value: row.value,
    });
  }

  return points;
};

const normalizeAccountPnlSeries = (
  input: unknown,
): Record<string, PnlPoint[]> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const result: Record<string, PnlPoint[]> = {};
  for (const [rawLogin, series] of Object.entries(input as Record<string, unknown>)) {
    const login = rawLogin.trim();
    if (!/^\d+$/.test(login)) {
      continue;
    }
    result[login] = normalizePnlSeries(series);
  }

  return result;
};

/**
 * Parse error and determine if it's a retryable network error
 */
const parseDashboardError = (error: unknown): { message: string; type: ApiErrorType; retryable: boolean } => {
  if (error instanceof ApiError) {
    return {
      message: getUserFriendlyErrorMessage(error),
      type: error.type,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for 401 unauthorized
    if (message.includes("401") || message.includes("unauthorized")) {
      return {
        message: "Your session has expired. Please log in again.",
        type: ApiErrorType.UNAUTHORIZED,
        retryable: false,
      };
    }

    // Connection refused
    if (
      message.includes("connection refused") ||
      message.includes("err_connection_refused") ||
      message.includes("failed to fetch")
    ) {
      return {
        message: "Unable to connect to the server. Please check your internet connection and try again.",
        type: ApiErrorType.CONNECTION_REFUSED,
        retryable: true,
      };
    }

    // Network errors
    if (message.includes("network") || message.includes("offline")) {
      return {
        message: "Network connection issue detected. Please check your internet connection.",
        type: ApiErrorType.NETWORK_ERROR,
        retryable: true,
      };
    }

    // Timeout
    if (message.includes("timeout") || message.includes("timed out")) {
      return {
        message: "The request timed out. Please try again.",
        type: ApiErrorType.TIMEOUT,
        retryable: true,
      };
    }
  }

  return {
    message: "Failed to load dashboard data. Please try again.",
    type: ApiErrorType.UNKNOWN,
    retryable: false,
  };
};

export function DashboardDataProvider({
  children,
  provider,
}: DashboardDataProviderProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ApiErrorType | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isLiveSyncing, setIsLiveSyncing] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const liveRequestCounterRef = useRef(0);
  const pendingLiveRequestsRef = useRef(new Map<string, PendingLiveRequest>());
  const reconnectTimerRef = useRef<number | null>(null);

  const selectedProvider = useMemo(
    () => provider ?? createDashboardProvider(),
    [provider]
  );

  const loadSnapshot = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setErrorType(null);

    try {
      const nextSnapshot = await selectedProvider.getSnapshot();
      setSnapshot(nextSnapshot);
      setLastRefreshAt(new Date());
      setRetryCount(0);
      useTradingStore.getState().hydrateFromSnapshot(nextSnapshot);
    } catch (error) {
      const parsedError = parseDashboardError(error);

      // Handle unauthorized errors - redirect to login
      if (parsedError.type === ApiErrorType.UNAUTHORIZED) {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
          return;
        }
      }

      // Log error for debugging
      console.error("Dashboard data load failed:", {
        type: parsedError.type,
        message: parsedError.message,
        originalError: error,
      });

      setErrorMessage(parsedError.message);
      setErrorType(parsedError.type);
    } finally {
      setIsLoading(false);
      setIsRetrying(false);
    }
  }, [selectedProvider]);

  /**
   * Manual retry with loading state
   */
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    setRetryCount((prev) => prev + 1);
    await loadSnapshot();
  }, [loadSnapshot]);

  const applyLiveSnapshot = useCallback((payload: AdminPositionsSnapshotPayload) => {
    const nextPositions = normalizeLivePositions(payload.positions);
    const nextPnlSeries = normalizePnlSeries(payload.pnlSeries);
    const nextAccountPnlSeries = normalizeAccountPnlSeries(payload.accountPnlSeries);

    useTradingStore.setState((state) => ({
      ...state,
      positions: nextPositions,
      pnlSeries: nextPnlSeries.length > 0 ? nextPnlSeries : state.pnlSeries,
    }));

    setSnapshot((prev) => {
      const base = prev ?? EMPTY_DASHBOARD_SNAPSHOT;

      return {
        ...base,
        positions: nextPositions,
        pnlSeries: nextPnlSeries.length > 0 ? nextPnlSeries : base.pnlSeries,
        accountPnlSeries:
          Object.keys(nextAccountPnlSeries).length > 0
            ? nextAccountPnlSeries
            : base.accountPnlSeries,
      };
    });

    setLastRefreshAt(new Date());
  }, []);

  const syncLiveViaHttp = useCallback(async () => {
    await handleRetry();
  }, [handleRetry]);

  const nextLiveRequestId = useCallback((action: string) => {
    liveRequestCounterRef.current += 1;
    return `${action}:${Date.now()}:${liveRequestCounterRef.current}`;
  }, []);

  const rejectPendingLiveRequests = useCallback((error: Error) => {
    pendingLiveRequestsRef.current.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
    pendingLiveRequestsRef.current.clear();
  }, []);

  const sendLiveRequest = useCallback(
    (
      action: string,
      data: unknown = {},
      timeoutMs = LIVE_SYNC_TIMEOUT_MS,
    ): Promise<unknown> => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("Dashboard live websocket is not connected."));
      }

      const requestId = nextLiveRequestId(action);

      return new Promise<unknown>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          pendingLiveRequestsRef.current.delete(requestId);
          reject(new Error(`${action} timed out`));
        }, timeoutMs);

        pendingLiveRequestsRef.current.set(requestId, {
          resolve,
          reject,
          timeout,
        });

        socket.send(
          JSON.stringify({
            action,
            requestId,
            data,
          }),
        );
      });
    },
    [nextLiveRequestId],
  );

  const syncLivePositions = useCallback(async () => {
    setIsLiveSyncing(true);

    try {
      await syncLiveViaHttp();
    } finally {
      setIsLiveSyncing(false);
    }
  }, [syncLiveViaHttp]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    let disposed = false;

    if (!DASHBOARD_LIVE_WS_ENABLED) {
      setIsLiveConnected(false);
      return () => {
        disposed = true;
        rejectPendingLiveRequests(
          new Error("Dashboard live websocket is disabled."),
        );
      };
    }

    function resolvePendingRequest(
      requestId: string | undefined,
      payload: unknown,
    ) {
      if (!requestId) {
        return;
      }

      const pending = pendingLiveRequestsRef.current.get(requestId);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      pendingLiveRequestsRef.current.delete(requestId);
      pending.resolve(payload);
    }

    function rejectPendingRequest(
      requestId: string | undefined,
      error: Error,
    ) {
      if (!requestId) {
        return;
      }

      const pending = pendingLiveRequestsRef.current.get(requestId);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      pendingLiveRequestsRef.current.delete(requestId);
      pending.reject(error);
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimerRef.current) {
        return;
      }

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        connectSocket();
      }, LIVE_RECONNECT_DELAY_MS);
    }

    function connectSocket() {
      if (disposed) {
        return;
      }

      const socket = new WebSocket(
        normalizeDashboardWebSocketUrl(DASHBOARD_WS_URL),
      );
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current !== socket) {
          return;
        }

        setIsLiveConnected(true);
      };

      socket.onmessage = (event: MessageEvent) => {
        if (typeof event.data !== "string") {
          return;
        }

        try {
          const envelope = JSON.parse(event.data) as DashboardServerEnvelope;

          if (envelope.event === "ack") {
            resolvePendingRequest(envelope.requestId, envelope.data);
            return;
          }

          if (envelope.event === "error") {
            rejectPendingRequest(
              envelope.requestId,
              new Error(getEnvelopeErrorMessage(envelope)),
            );
            return;
          }

        } catch (error) {
          console.warn(
            "Failed to parse dashboard live websocket message:",
            error instanceof Error ? error.message : String(error),
          );
        }
      };

      socket.onerror = () => {
        if (socketRef.current === socket) {
          setIsLiveConnected(false);
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        setIsLiveConnected(false);
        rejectPendingLiveRequests(new Error("Dashboard live websocket closed."));
        scheduleReconnect();
      };
    }

    connectSocket();

    return () => {
      disposed = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const socket = socketRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;

        if (
          socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN
        ) {
          socket.close();
        }
      }

      socketRef.current = null;
      rejectPendingLiveRequests(new Error("Dashboard live websocket disposed."));
      setIsLiveConnected(false);
    };
  }, [
    applyLiveSnapshot,
    nextLiveRequestId,
    rejectPendingLiveRequests,
    sendLiveRequest,
  ]);

  const value = useMemo<DashboardDataContextValue>(
    () => ({
      snapshot,
      isLoading,
      errorMessage,
      errorType,
      reload: handleRetry,
      lastRefreshAt,
      retryCount,
      isRetrying,
      syncLivePositions,
      isLiveSyncing,
      isLiveConnected,
    }),
    [
      errorMessage,
      errorType,
      isLoading,
      isRetrying,
      handleRetry,
      snapshot,
      lastRefreshAt,
      retryCount,
      syncLivePositions,
      isLiveSyncing,
      isLiveConnected,
    ]
  );

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export const useDashboardData = () => {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new Error("useDashboardData must be used within DashboardDataProvider.");
  }
  return context;
};
