'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, Suspense, startTransition } from 'react';
import type { CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useRouter, useSearchParams } from 'next/navigation';
import { Clock, CheckCircle2, X, AlarmClock, Server, Wifi, ChevronDown, ChevronRight, Menu, TrendingUp, Briefcase, Globe, Settings, Bell, Calendar } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import Header from '@/components/terminal/Header';
import Sidebar from '@/components/terminal/Sidebar';
import { SymbolIcon } from '@/components/terminal/SymbolIcon';
import type { ChartHistoryStatus } from '@/components/terminal/TradingChart';
import { getCanonicalSymbol, isBoundedShortSymbolPrefixAlias, symbolsMatch } from '@/lib/market-symbols';
import {
    compareBrokerSymbolVariantSuffixes,
    DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS,
    DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS,
    formatTerminalDisplaySymbol,
    getInitialTerminalSubscriptionSymbols,
    getSafeLiveQuoteSnapshotBySymbol,
    getTerminalDisplaySymbols,
    getTerminalFallbackSymbolInfos,
    stripExecutionSuffix,
} from '@/lib/trading/terminal-symbols';
import { useGroupActiveSymbols } from '@/lib/trading/use-group-active-symbols';
import type { Instrument, Position, PriceAlert, ClosedTrade } from '@/lib/terminal/types';
import { useTradingStore } from '@/store/trading-store';
import { getLivePriceSnapshotBySymbol, useLivePriceUniverse, useWebtraderStore } from '@/store/webtrader-store';
import { buildOhlcSessionScopeId, useAutoConnectTrading } from '@/lib/trading/use-auto-connect';
import type { WebSocketTradingClient } from '@/lib/trading/websocket-client';
import type { TradingAccount as DashboardTradingAccount } from '@/types/dashboard';
import type { Order as WebtraderOrder, OrderType as WebtraderOrderType, Position as WebtraderPosition, SymbolInfo, TradeRequest, TradeResult, TradingAccountInfo } from '@/types/webtrader';
import {
    isContinuityBar,
    ohlcService,
    type OHLCBar,
    type OhlcHistoryDiagnosticsSnapshot,
} from '@/lib/terminal/ohlcWebSocketService';
import {
    fetchTerminalPreferences,
    saveTerminalPreferences,
    type TerminalPreferences,
} from '@/lib/terminal/terminal-preferences';
import { useTerminalLaunchSession } from '@/lib/terminal/use-terminal-launch-session';
import {
    readTerminalFrontendLaunchSnapshot,
    reviveTerminalLaunchPositions,
    writeTerminalFrontendLaunchSnapshot,
} from '@/lib/terminal/terminal-launch-cache';
import { DEFAULT_CHART_TYPES, type ChartType as TerminalChartType } from '@/lib/terminal/chart-visual-config';
import {
    precomputeTerminalChartSwitchSeed,
    TERMINAL_CHART_SWITCH_SEED_LIMIT,
} from '@/lib/terminal/chart-switch-seed-cache';
import { getMt5ServerTimeMs, toMt5IsoString } from '@/lib/mt5-time';

export interface ToastNotificationData {
    id: number;
    type: 'success' | 'info' | 'topup' | 'warning' | 'error';
    title?: string;
    message?: string;
    amount?: number;
}

type TerminalPostTradeReconciliationOptions = {
    beforePositions: WebtraderPosition[];
    beforeAccountInfo: TradingAccountInfo | null;
    expectPositions?: (positions: WebtraderPosition[]) => boolean;
    isExpectedTradeResult?: (payload: unknown) => boolean;
    resolveOnTradeResult?: boolean;
    timeoutMs?: number;
    refreshDelaysMs?: readonly number[];
};

type TerminalPostTradeReconciliationResult = {
    positionsSettled: boolean;
    positionsChanged: boolean;
    accountInfoUpdated: boolean;
    tradeResultSucceeded: boolean;
    timedOut: boolean;
    lastRefreshError: unknown;
};

const PositionsTable = dynamic(() => import('@/components/terminal/PositionsTable'), {
    ssr: false,
    loading: () => <div className="flex-1 bg-card" />,
});
const TradingChart = dynamic(() => import('@/components/terminal/TradingChart'), {
    ssr: false,
    loading: () => <TerminalChartLoadingShell />,
});
const OrderPanel = dynamic(() => import('@/components/terminal/OrderPanel'), {
    ssr: false,
    loading: () => <TerminalOrderPanelLoadingShell />,
});
const InstrumentsPanel = dynamic(() => import('@/components/terminal/InstrumentsPanel'), {
    ssr: false,
});
const EconomicCalendar = dynamic(() => import('@/components/terminal/EconomicCalendar'), {
    ssr: false,
});
const AlertsPanel = dynamic(() => import('@/components/terminal/AlertsPanel'), {
    ssr: false,
});
const SettingsPanel = dynamic(() => import('@/components/terminal/SettingsPanel'), {
    ssr: false,
});
const SignalsPanel = dynamic(() => import('@/components/terminal/SignalsPanel'), {
    ssr: false,
});
const MarketStatusPanel = dynamic(() => import('@/components/terminal/MarketStatusPanel'), {
    ssr: false,
});
const CloseAllModal = dynamic(() => import('@/components/terminal/CloseAllModal'), {
    ssr: false,
});

const SIDEBAR_WIDTH = 44;
const SNAP_PERCENT = [0.25, 0.50, 0.75];
const SNAP_THRESHOLD = 30;
const LEFT_MIN = 280;
const RIGHT_MIN = 260;
const CENTER_CHART_MIN_WIDTH = 360;
const CENTER_CHART_MIN_HEIGHT = 240;
const TERMINAL_VERTICAL_CHROME_HEIGHT = 96;
const POSITIONS_MIN_HEIGHT = 180;
const LAYOUT_STORAGE_VERSION = 'v2';
const LAYOUT_STORAGE_VERSION_KEY = 'term_layout_version';
const LEFT_PANEL_STORAGE_KEY = 'term_left_w';
const RIGHT_PANEL_STORAGE_KEY = 'term_right_w';
const POSITIONS_HEIGHT_STORAGE_KEY = 'term_positions_h';
const LIVE_QUOTE_INITIAL_WAIT_MS = 6000;
// Hold the black "opening terminal" overlay until first chart candles (or this timeout).
// Prefer a longer open wait over revealing a blank chart section.
// Soft fail-open only: after this, show terminal chrome + chart loading shell.
// Full reveal still requires hasCandles (never open an empty chart grid).
const INITIAL_TERMINAL_CHART_GATE_TIMEOUT_MS = 20_000;
const INITIAL_TERMINAL_ACCOUNT_DATA_GATE_TIMEOUT_MS = 600;
const FIRST_TICK_NOTICE_MESSAGE =
    'Waiting for the first MT5 tick. Chart history can load independently while bid/ask prices initialize.';
const DEFAULT_HOT_QUOTE_SUBSCRIPTION_LIMIT = DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.length;
const MARKET_QUOTE_SUBSCRIPTION_LIMIT = DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS.length;
const ACTIVE_LIVE_QUOTE_SUBSCRIPTION_LIMIT = DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS.length;
const SELECTED_QUOTE_SUBSCRIPTION_LIMIT = 1;
const READY_STATE_REFRESH_RETRY_DELAYS_MS = [0, 1000, 2500, 5000] as const;
const TERMINAL_POSITIONS_REFRESH_SETTLE_MS = 8_000;
const TERMINAL_POSITIONS_BACKGROUND_RETRY_DELAYS_MS = [1000, 2500, 5000, 10_000, 15_000, 30_000] as const;
const TERMINAL_POSITIONS_BACKGROUND_RETRY_MESSAGE =
    'Open positions are taking longer than expected to refresh. The terminal will keep retrying in the background.';
const TERMINAL_TRADE_SUCCESS_RETCODES = new Set([10009, 10008, 10010]);
const TERMINAL_TRADE_UNKNOWN_OUTCOME_RETCODES = new Set([10012]);
const TERMINAL_ORDER_VOLUME_DELTA_TOLERANCE = 1e-8;
const TERMINAL_POST_TRADE_RECONCILE_TIMEOUT_MS = 12_000;
const TERMINAL_POST_TRADE_FAST_RECONCILE_TIMEOUT_MS = 4_000;
const TERMINAL_POST_TRADE_FAST_RECONCILE_REFRESH_DELAYS_MS = [0, 300, 800, 1_600, 3_000] as const;
const TERMINAL_POST_TRADE_SUCCESS_REFRESH_DELAYS_MS = [250, 1_000, 2_500] as const;
const TERMINAL_POST_CLOSE_RECONCILE_TIMEOUT_MS = 5_000;
const TERMINAL_POST_TRADE_RECONCILE_REFRESH_DELAYS_MS = [0, 500, 1_200, 2_500, 5_000, 9_000] as const;
const TERMINAL_OPTIMISTIC_POSITION_TTL_MS = 30_000;
const TERMINAL_CLOSED_HISTORY_LOOKBACK_DAYS = 30;
const TERMINAL_CLOSED_HISTORY_MAX_ROWS = 500;
const TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT = 200;
const TERMINAL_SELECTED_OHLC_HISTORY_BACKFILL_LIMIT = 200;
const TERMINAL_BOOTSTRAP_OHLC_HISTORY_PRIME_LIMIT = 200;
const TERMINAL_BOOTSTRAP_OHLC_HISTORY_SYMBOL_LIMIT = DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS.length + 1;
const TERMINAL_SELECTED_OHLC_HISTORY_BACKFILL_DELAY_MS = 700;
const TERMINAL_OHLC_HISTORY_WARMUP_STAGGER_MS = 1_200;
const TERMINAL_BOOTSTRAP_QUOTE_PREWARM_DELAY_MS = 250;
const TERMINAL_BOOTSTRAP_OHLC_HISTORY_PREWARM_DELAY_MS = 1_500;
const TERMINAL_REACTIVE_OHLC_HISTORY_PREWARM_DELAY_MS = 2_500;
const TERMINAL_BACKGROUND_OHLC_PREWARM_LIMIT = 100;
const TERMINAL_SYMBOL_HOVER_OHLC_PREWARM_DELAY_MS = 90;
const TERMINAL_CHART_KEEP_ALIVE_LIMIT = 5;
const TERMINAL_DEFAULT_TIMEFRAME_MINUTES = 1;
const TERMINAL_OHLC_REPAIR_FETCH_TIMEOUT_MS = 17_000;
const TERMINAL_OHLC_REPAIR_REQUEST_DEDUPE_MS = 15_000;
// Exponential backoff for consecutive repair failures (e.g. upstream down).
// Cooldown = min(BASE_MS * 2^failures, MAX_MS). Hard stop after MAX_FAILURES.
const TERMINAL_OHLC_REPAIR_BACKOFF_BASE_MS = 10_000;
const TERMINAL_OHLC_REPAIR_BACKOFF_MAX_MS = 120_000;   // 2 min ceiling
const TERMINAL_OHLC_REPAIR_MAX_FAILURES = 4;            // ~4 tries, then auto-reset after recovery
const TERMINAL_OHLC_REPAIR_FAILURE_RESET_MS = 5 * 60_000; // reset failures after 5 min of quiet
const TERMINAL_PREFERENCES_PERSIST_DEBOUNCE_MS = 600;
const TERMINAL_LAST_ACCOUNT_STORAGE_KEY_PREFIX = 'terminal:last-account';
const TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY = `${TERMINAL_LAST_ACCOUNT_STORAGE_KEY_PREFIX}:global`;
const TERMINAL_LAUNCH_ACCOUNT_HINT_STORAGE_KEY = 'terminal:launch-account-hint:v1';
const TERMINAL_BOOT_DEBUG_STORAGE_KEY = 'terminal:boot-debug';
const TERMINAL_OHLC_HISTORY_DEBUG_STORAGE_KEY = 'terminal:ohlc-history-debug';
const TERMINAL_OHLC_HISTORY_CONSOLE_DEBUG_STORAGE_KEY = 'terminal:ohlc-history-console-debug';
const TERMINAL_BOOT_DEBUG_QUERY_FLAGS = [
    'terminalBootDebug',
    'terminalDebug',
    'bootDebug',
] as const;
const TERMINAL_OHLC_HISTORY_DEBUG_QUERY_FLAGS = [
    'ohlcHistoryDebug',
    'terminalHistoryDebug',
    'terminalOhlcDebug',
] as const;
const TERMINAL_OHLC_HISTORY_CONSOLE_DEBUG_QUERY_FLAGS = [
    'ohlcHistoryConsoleDebug',
    'terminalHistoryConsoleDebug',
    'terminalOhlcConsoleDebug',
] as const;
const buildTerminalPreferencesStateKey = (input: {
    accountId: string | null | undefined;
    selectedSymbol: string | null | undefined;
    openTabs: string[];
    watchlistSymbols: string[];
    chartTimeframeMinutes: number;
    chartType: TerminalChartType;
    chartLayoutPanes: TerminalChartLayoutPanes;
    chartBarSpacing: number | null;
}): string =>
    JSON.stringify({
        accountId: input.accountId ?? '',
        selectedSymbol: input.selectedSymbol ?? '',
        openTabs: input.openTabs,
        watchlistSymbols: input.watchlistSymbols,
        chartTimeframeMinutes: input.chartTimeframeMinutes,
        chartType: input.chartType,
        chartLayoutPanes: input.chartLayoutPanes,
        chartBarSpacing: input.chartBarSpacing,
    });
const TERMINAL_OHLC_HISTORY_DEBUG_ENV = isTruthyTerminalDebugFlag(
    process.env.NEXT_PUBLIC_TERMINAL_OHLC_HISTORY_DEBUG,
);
const TERMINAL_OHLC_HISTORY_CONSOLE_DEBUG_ENV = isTruthyTerminalDebugFlag(
    process.env.NEXT_PUBLIC_TERMINAL_OHLC_HISTORY_CONSOLE_DEBUG,
);
// Default watchlist shown when the user has no persisted preferences.
const PREFERRED_TERMINAL_SYMBOLS = DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS;
const PREFERRED_TERMINAL_SYMBOL_RANK = new Map<string, number>(
    PREFERRED_TERMINAL_SYMBOLS.map((symbol, index) => [getTerminalSymbolKey(symbol), index]),
);
type TerminalChartLayoutPanes = 1 | 2 | 3 | 4 | 6;
const TERMINAL_CHART_LAYOUT_PANES: TerminalChartLayoutPanes[] = [1, 2, 3, 4, 6];

function clampValue(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampLeftPanelWidth(width: number, viewportWidth: number) {
    const usableWidth = Math.max(0, viewportWidth - getTerminalHorizontalChromeWidth(viewportWidth));
    const maxWidth = viewportWidth >= 768
        ? Math.max(LEFT_MIN, Math.floor(usableWidth * 0.42))
        : usableWidth;
    const adjustedWidth = width < LEFT_MIN ? Math.min(360, maxWidth) : width;
    return clampValue(adjustedWidth, LEFT_MIN, maxWidth);
}

function clampRightPanelWidth(width: number, viewportWidth: number) {
    const usableWidth = Math.max(0, viewportWidth - getTerminalHorizontalChromeWidth(viewportWidth));
    const maxWidth = viewportWidth >= 768
        ? Math.max(RIGHT_MIN, Math.floor(usableWidth * 0.38))
        : usableWidth;
    return clampValue(width, RIGHT_MIN, maxWidth);
}

function clampPositionsPanelHeight(height: number, viewportHeight: number) {
    const maxHeight = Math.min(
        Math.floor(viewportHeight * 0.34),
        Math.max(POSITIONS_MIN_HEIGHT, viewportHeight - CENTER_CHART_MIN_HEIGHT - TERMINAL_VERTICAL_CHROME_HEIGHT),
    );
    return clampValue(height, POSITIONS_MIN_HEIGHT, maxHeight);
}

function getTerminalHorizontalChromeWidth(viewportWidth: number) {
    return viewportWidth >= 768 ? SIDEBAR_WIDTH : 0;
}

function getTerminalCenterSafeWidth(viewportWidth: number) {
    return Math.max(0, viewportWidth - getTerminalHorizontalChromeWidth(viewportWidth));
}

function getPanelMaxWidthForCenter(
    _minWidth: number,
    oppositePanelWidth: number,
    viewportWidth: number,
    isOppositePanelOpen: boolean,
) {
    const reservedOppositeWidth = isOppositePanelOpen ? oppositePanelWidth : 0;
    const availableWidth = getTerminalCenterSafeWidth(viewportWidth) - reservedOppositeWidth - CENTER_CHART_MIN_WIDTH;
    return Math.max(0, availableWidth);
}

function getAvailablePanelWidthForCenter(viewportWidth: number) {
    return Math.max(0, getTerminalCenterSafeWidth(viewportWidth) - CENTER_CHART_MIN_WIDTH);
}

function clampPanelWidthWithinAvailable(width: number, preferredMinWidth: number, availableWidth: number) {
    if (availableWidth <= 0) {
        return 0;
    }

    return clampValue(width, Math.min(preferredMinWidth, availableWidth), availableWidth);
}

function constrainTerminalPanelWidths(
    layout: { left: number; right: number },
    viewportWidth: number,
    openPanels: { left: boolean; right: boolean },
) {
    let left = clampLeftPanelWidth(layout.left, viewportWidth);
    let right = clampRightPanelWidth(layout.right, viewportWidth);
    const availablePanelWidth = getAvailablePanelWidthForCenter(viewportWidth);

    if (openPanels.left && !openPanels.right) {
        left = clampPanelWidthWithinAvailable(left, LEFT_MIN, availablePanelWidth);
    } else if (!openPanels.left && openPanels.right) {
        right = clampPanelWidthWithinAvailable(right, RIGHT_MIN, availablePanelWidth);
    } else if (openPanels.left && openPanels.right && left + right > availablePanelWidth) {
        if (availablePanelWidth <= 0) {
            left = 0;
            right = 0;
        } else {
            const totalPanelWidth = left + right;
            const scale = availablePanelWidth / totalPanelWidth;
            left = Math.floor(left * scale);
            right = Math.max(0, availablePanelWidth - left);
        }
    }

    return { left, right };
}

function getDefaultTerminalLayout(viewportWidth: number, viewportHeight: number) {
    return {
        left: clampLeftPanelWidth(Math.max(360, Math.round(viewportWidth * 0.19)), viewportWidth),
        right: clampRightPanelWidth(Math.round(viewportWidth * 0.18), viewportWidth),
        bottom: clampPositionsPanelHeight(Math.round(viewportHeight * 0.24), viewportHeight),
    };
}

function getStoredDimension(key: string, fallback: number) {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
}

function formatTerminalDate(value: string | Date | null | undefined) {
    if (!value) {
        return toMt5IsoString(getMt5ServerTimeMs());
    }

    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return typeof value === 'string'
            ? value.replace('T', ' ').slice(0, 19)
            : toMt5IsoString(getMt5ServerTimeMs());
    }

    return parsed.toISOString().replace('T', ' ').slice(0, 19);
}

function toFiniteNumber(value: unknown, fallback = 0) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function asTerminalRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function normalizeTerminalString(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return null;
}

function getTerminalLastAccountStorageKey(userId: string | null | undefined) {
    const normalizedUserId = userId?.trim();
    return normalizedUserId ? `${TERMINAL_LAST_ACCOUNT_STORAGE_KEY_PREFIX}:${normalizedUserId}` : null;
}

function readLastTerminalAccountId(storageKey: string | null) {
    if (!storageKey || typeof window === 'undefined') {
        return null;
    }

    return window.localStorage.getItem(storageKey);
}

function readFirstLastTerminalAccountId(...storageKeys: Array<string | null | undefined>) {
    if (typeof window === 'undefined') {
        return null;
    }

    for (const storageKey of storageKeys) {
        const value = readLastTerminalAccountId(storageKey ?? null);
        if (value?.trim()) {
            return value.trim();
        }
    }

    return null;
}

function writeLastTerminalAccountId(storageKey: string | null, accountId: string) {
    if (!storageKey || typeof window === 'undefined' || !accountId.trim()) {
        return;
    }

    window.localStorage.setItem(storageKey, accountId.trim());
}

function normalizeTerminalLaunchHintLookup(value: string | null | undefined): string {
    return value?.trim().replace(/^mt5-/i, '') ?? '';
}

function terminalLaunchHintMatchesAccount(
    account: DashboardTradingAccount,
    accountId: string | null | undefined,
) {
    const normalizedAccountId = normalizeTerminalLaunchHintLookup(accountId);
    if (!normalizedAccountId) {
        return true;
    }

    return [
        account.id,
        account.accountNumber,
        account.credentials?.login,
    ].some((value) => normalizeTerminalLaunchHintLookup(value) === normalizedAccountId);
}

function mapTerminalLaunchHintAccount(value: unknown): DashboardTradingAccount | null {
    const source = asTerminalRecord(value);
    if (!source) {
        return null;
    }

    const id = normalizeTerminalString(source.id);
    const accountNumber = normalizeTerminalString(source.accountNumber);
    if (!id || !accountNumber) {
        return null;
    }

    const platformValue = normalizeTerminalString(source.platform)?.toLowerCase();
    const typeValue = normalizeTerminalString(source.type);
    const statusValue = normalizeTerminalString(source.status);

    return {
        id,
        accountNumber,
        name: normalizeTerminalString(source.name) ?? 'MT5 Account',
        platform: platformValue === 'ctrader' ? 'ctrader' : 'mt5',
        type: typeValue === 'Live' ? 'Live' : 'Demo',
        leverage: toFiniteNumber(source.leverage),
        serverIp: normalizeTerminalString(source.serverIp) ?? '',
        currency: normalizeTerminalString(source.currency) ?? 'USD',
        balance: toFiniteNumber(source.balance),
        equity: toFiniteNumber(source.equity, toFiniteNumber(source.balance)),
        freeMargin: toFiniteNumber(source.freeMargin),
        margin: toFiniteNumber(source.margin),
        status: statusValue === 'Archived' ? 'Archived' : 'Active',
        createdAt: normalizeTerminalString(source.createdAt) ?? undefined,
    };
}

function readTerminalLaunchAccountHint(accountId: string | null | undefined): DashboardTradingAccount | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(TERMINAL_LAUNCH_ACCOUNT_HINT_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const payload = JSON.parse(raw) as unknown;
        const record = asTerminalRecord(payload);
        if (!record) {
            return null;
        }

        const expiresAtMs = toFiniteNumber(record.expiresAtMs);
        if (expiresAtMs > 0 && expiresAtMs < Date.now()) {
            window.localStorage.removeItem(TERMINAL_LAUNCH_ACCOUNT_HINT_STORAGE_KEY);
            return null;
        }

        const account = mapTerminalLaunchHintAccount(record.account);
        if (!account || !terminalLaunchHintMatchesAccount(account, accountId)) {
            return null;
        }

        return account;
    } catch {
        return null;
    }
}

function isRestorableTerminalAccount(account: DashboardTradingAccount | null | undefined) {
    return Boolean(
        account &&
        (account.platform === 'mt5' || !account.platform) &&
        account.status !== 'Archived',
    );
}

function getTerminalAccountCreatedAtMs(account: DashboardTradingAccount) {
    const parsed = account.createdAt ? Date.parse(account.createdAt) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
}

function isTruthyTerminalDebugFlag(value: string | null | undefined) {
    if (value === null || value === undefined) {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return true;
    }

    return !['0', 'false', 'no', 'off'].includes(normalized);
}

function readTerminalOhlcHistoryDebugPreference() {
    if (typeof window === 'undefined') {
        return false;
    }

    return isTruthyTerminalDebugFlag(
        window.localStorage.getItem(TERMINAL_OHLC_HISTORY_DEBUG_STORAGE_KEY),
    );
}

function readTerminalOhlcHistoryConsoleDebugPreference() {
    if (typeof window === 'undefined') {
        return false;
    }

    return isTruthyTerminalDebugFlag(
        window.localStorage.getItem(TERMINAL_OHLC_HISTORY_CONSOLE_DEBUG_STORAGE_KEY),
    );
}

function writeTerminalOhlcHistoryDebugPreference(enabled: boolean) {
    if (typeof window === 'undefined') {
        return;
    }

    if (enabled) {
        window.localStorage.setItem(TERMINAL_OHLC_HISTORY_DEBUG_STORAGE_KEY, '1');
        return;
    }

    window.localStorage.removeItem(TERMINAL_OHLC_HISTORY_DEBUG_STORAGE_KEY);
}

function formatHistoryDiagnosticValue(value: string | number | null | undefined) {
    if (value === null || value === undefined) {
        return '--';
    }

    return String(value);
}

function formatHistoryDiagnosticBoolean(value: boolean | undefined) {
    if (value === undefined) {
        return '--';
    }

    return value ? 'yes' : 'no';
}

function formatHistoryDiagnosticList(values: string[] | undefined) {
    return values && values.length > 0 ? values.join(', ') : '--';
}

function formatHistoryDiagnosticUpdateTime(value: number | undefined) {
    if (!value || !Number.isFinite(value)) {
        return '--';
    }

    return formatTerminalDate(new Date(value));
}

function normalizeTerminalTimeframeMinutes(value: number | null | undefined) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : TERMINAL_DEFAULT_TIMEFRAME_MINUTES;
}

function isMatchingTerminalChartHistoryStatus(
    status: ChartHistoryStatus | null | undefined,
    symbol: string | null | undefined,
    timeframeMinutes: number | null | undefined,
) {
    return Boolean(
        status &&
        symbol &&
        symbolsMatch(status.symbol, symbol) &&
        status.timeframeMinutes === normalizeTerminalTimeframeMinutes(timeframeMinutes)
    );
}

function normalizeTerminalChartType(value: string | null | undefined): TerminalChartType {
    return DEFAULT_CHART_TYPES.includes(value as TerminalChartType)
        ? value as TerminalChartType
        : 'Candles';
}

function normalizeTerminalChartLayoutPanes(value: number | null | undefined): TerminalChartLayoutPanes {
    const parsed = Number(value);
    return TERMINAL_CHART_LAYOUT_PANES.includes(parsed as TerminalChartLayoutPanes)
        ? parsed as TerminalChartLayoutPanes
        : 1;
}

function normalizeTerminalChartBarSpacing(value: number | null | undefined) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getTerminalOhlcHistoryRequestKey(
    accountId: string | null | undefined,
    symbol: string,
    timeframeMinutes: number,
) {
    const symbolKey = getTerminalSymbolKey(symbol) || symbol.trim();
    return [
        accountId?.trim() || 'terminal',
        symbolKey,
        normalizeTerminalTimeframeMinutes(timeframeMinutes),
    ].join(':');
}

function isUsableTerminalOhlcHistoryBar(bar: OHLCBar) {
    if (isContinuityBar(bar)) {
        return false;
    }

    return [bar.open, bar.high, bar.low, bar.close].every((value) =>
        Number.isFinite(value) && value > 0,
    );
}

function getUsableTerminalOhlcHistoryBarCount(bars: OHLCBar[]) {
    return bars.filter(isUsableTerminalOhlcHistoryBar).length;
}

function terminalHistoryDiagnosticsIndicatesRetryable(
    snapshot: OhlcHistoryDiagnosticsSnapshot | null | undefined,
    requestedLimit: number,
    usableBarCount: number,
) {
    const returnedBarCount = snapshot?.returnedBarCount ?? usableBarCount;
    const realBarCount = snapshot?.realBarCount ?? usableBarCount;
    const metadataStatusText = [
        snapshot?.status,
        snapshot?.message,
        snapshot?.source,
    ].filter(Boolean).join(' ');

    return Boolean(
        usableBarCount === 0 &&
        returnedBarCount === 0 &&
        realBarCount === 0 &&
        (
            snapshot?.managerFetchDeferred ||
            snapshot?.managerFetchPending ||
            isTransientTerminalOhlcPrimeStatus(metadataStatusText)
        ),
    );
}

function terminalOhlcHistoryDiagnosticsNeedsRepair(
    snapshot: OhlcHistoryDiagnosticsSnapshot | null | undefined,
) {
    if (!snapshot) {
        return false;
    }

    if (snapshot.managerFetchDeferred || snapshot.managerFetchPending) {
        return false;
    }

    const statusText = [
        snapshot.status,
        snapshot.message,
        snapshot.source,
    ].filter(Boolean).join(' ');

    return Boolean(
        snapshot.historyGapped ||
        snapshot.historySparse ||
        snapshot.historyStale ||
        (
            (snapshot.returnedBarCount ?? 0) === 0 &&
            (snapshot.realBarCount ?? 0) === 0 &&
            isTransientTerminalOhlcPrimeStatus(statusText)
        ),
    );
}

function getTerminalOhlcRepairUrl(accountId: string) {
    return `/api/private/accounts/${encodeURIComponent(accountId)}/terminal-ohlc-repair`;
}

function getTerminalOhlcGapFillUrl(accountId: string) {
    return `/api/private/accounts/${encodeURIComponent(accountId)}/ohlc-gap-fill`;
}

const TERMINAL_LEFT_WIDTH_CSS_VAR = '--terminal-left-width';
const TERMINAL_RIGHT_WIDTH_CSS_VAR = '--terminal-right-width';
const TERMINAL_POSITIONS_HEIGHT_CSS_VAR = '--terminal-positions-height';

function getTerminalSymbolKey(symbol: string) {
    for (const preferredSymbol of PREFERRED_TERMINAL_SYMBOLS) {
        if (symbolsMatch(symbol, preferredSymbol)) {
            return preferredSymbol;
        }
    }

    return getCanonicalSymbol(symbol);
}

function getDefaultTerminalSymbolRank(symbol: string) {
    return PREFERRED_TERMINAL_SYMBOL_RANK.get(getTerminalSymbolKey(symbol)) ?? Number.MAX_SAFE_INTEGER;
}

function getTradeModeRank(mode: SymbolInfo['tradeMode'] | undefined) {
    switch (mode) {
        case 'full':
            return 0;
        case 'longonly':
        case 'shortonly':
            return 1;
        case 'closeonly':
            return 2;
        case 'disabled':
            return 3;
        default:
            return 1;
    }
}

function getNormalizedBrokerBase(symbol: string) {
    return stripExecutionSuffix(symbol).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function compareBrokerSymbolVariants(
    left: SymbolInfo,
    right: SymbolInfo,
    prices: Record<string, { bid?: number; ask?: number }>,
    targetCanonical = getTerminalSymbolKey(left.name),
) {
    const leftHasLivePrice = hasLivePriceForSymbol(prices, left.name);
    const rightHasLivePrice = hasLivePriceForSymbol(prices, right.name);
    if (leftHasLivePrice !== rightHasLivePrice) {
        return leftHasLivePrice ? -1 : 1;
    }

    const leftTradeRank = getTradeModeRank(left.tradeMode);
    const rightTradeRank = getTradeModeRank(right.tradeMode);
    if (leftTradeRank !== rightTradeRank) {
        return leftTradeRank - rightTradeRank;
    }

    const leftIsExactCanonical = getNormalizedBrokerBase(left.name) === targetCanonical;
    const rightIsExactCanonical = getNormalizedBrokerBase(right.name) === targetCanonical;
    if (leftIsExactCanonical !== rightIsExactCanonical) {
        return leftIsExactCanonical ? -1 : 1;
    }

    const leftDefaultRank = getDefaultTerminalSymbolRank(left.name);
    const rightDefaultRank = getDefaultTerminalSymbolRank(right.name);
    if (leftDefaultRank !== rightDefaultRank) {
        return leftDefaultRank - rightDefaultRank;
    }

    const suffixCompare = compareBrokerSymbolVariantSuffixes(left.name, right.name);
    if (suffixCompare !== 0) {
        return suffixCompare;
    }

    if (left.name.length !== right.name.length) {
        return left.name.length - right.name.length;
    }

    return left.name.localeCompare(right.name);
}

function getCappedMarketSubscriptionSymbols(
    symbols: SymbolInfo[],
    selectedSymbol: string,
    extraSymbols: string[] = [],
    prices: Record<string, { bid?: number; ask?: number }> = {},
    options: { allowInputFallback?: boolean } = {},
) {
    const subscriptions: string[] = [];
    const seen = new Set<string>();

    const append = (symbol: string) => {
        if (subscriptions.length >= MARKET_QUOTE_SUBSCRIPTION_LIMIT) {
            return false;
        }

        const normalized = resolveQuoteSubscriptionSymbolName(symbols, symbol, prices, options)?.trim() ?? '';
        if (!normalized || seen.has(normalized) || symbolListIncludes(subscriptions, normalized)) {
            return false;
        }

        seen.add(normalized);
        subscriptions.push(normalized);
        return true;
    };

    append(selectedSymbol);
    extraSymbols.forEach(append);

    return withDefaultQuoteHydrationSymbols(subscriptions, MARKET_QUOTE_SUBSCRIPTION_LIMIT);
}

function getSymbolListKey(symbols: string[]) {
    return symbols.join('\u0001');
}

function getSymbolsFromListKey(symbolsKey: string) {
    return symbolsKey.length > 0 ? symbolsKey.split('\u0001').filter(Boolean) : [];
}

function symbolListIncludes(symbols: string[], symbol: string) {
    return symbols.some((entry) => symbolsMatch(entry, symbol));
}

function getRemovedSubscriptionSymbols(
    previousSymbols: string[],
    nextSymbols: string[],
    protectedSymbols: string[] = [],
) {
    return previousSymbols.filter(
        (symbol) =>
            !symbolListIncludes(nextSymbols, symbol) &&
            !symbolListIncludes(protectedSymbols, symbol),
    );
}

function getUncoveredSubscriptionSymbols(
    symbols: string[],
    coveredSymbols: string[],
) {
    return symbols.filter((symbol) => !symbolListIncludes(coveredSymbols, symbol));
}

function areSymbolListsEqual(left: string[], right: string[]) {
    return left.length === right.length && left.every((symbol, index) => symbol === right[index]);
}

function appendUniqueTerminalSymbol(symbols: string[], symbol: string) {
    const normalized = symbol.trim();
    if (!normalized || symbols.some((entry) => symbolsMatch(entry, normalized))) {
        return symbols;
    }

    return [...symbols, normalized];
}

function upsertUniqueTerminalSymbol(symbols: string[], symbol: string) {
    const normalized = symbol.trim();
    if (!normalized) {
        return symbols;
    }

    const existingIndex = symbols.findIndex((entry) => symbolsMatch(entry, normalized));
    if (existingIndex < 0) {
        return [...symbols, normalized];
    }

    if (symbols[existingIndex] === normalized) {
        return symbols;
    }

    return symbols.map((entry, index) => index === existingIndex ? normalized : entry);
}

function uniqueTerminalSymbols(symbols: readonly string[]) {
    return symbols.reduce<string[]>((accumulator, symbol) => (
        appendUniqueTerminalSymbol(accumulator, symbol)
    ), []);
}

function reconcileTerminalChartKeepAliveSymbols(
    currentSymbols: readonly string[],
    openTabs: readonly string[],
    selectedSymbol: string | null | undefined,
    limit = TERMINAL_CHART_KEEP_ALIVE_LIMIT,
) {
    const normalizedSelectedSymbol = selectedSymbol?.trim() ?? '';
    const isStillOpen = (symbol: string) =>
        openTabs.some((tabSymbol) => symbolsMatch(tabSymbol, symbol)) ||
        Boolean(normalizedSelectedSymbol && symbolsMatch(normalizedSelectedSymbol, symbol));
    let nextSymbols = uniqueTerminalSymbols(currentSymbols.filter(isStillOpen));

    // Restore a bounded set of persisted tabs on first mount. Afterwards the
    // existing order is true LRU order and evicted open tabs stay cold until clicked.
    if (nextSymbols.length === 0) {
        nextSymbols = uniqueTerminalSymbols(openTabs).slice(-limit);
    }

    if (normalizedSelectedSymbol) {
        nextSymbols = nextSymbols.filter((symbol) => !symbolsMatch(symbol, normalizedSelectedSymbol));
        nextSymbols.push(normalizedSelectedSymbol);
    }

    return nextSymbols.slice(-Math.max(1, limit));
}

function getTerminalChartHistoryStatusKey(symbol: string, timeframeMinutes: number) {
    return `${getTerminalSymbolKey(symbol)}:${normalizeTerminalTimeframeMinutes(timeframeMinutes)}`;
}

function appendExactQuoteSubscriptionSymbol(symbols: string[], symbol: string) {
    const normalized = symbol.trim();
    if (!normalized || symbols.includes(normalized)) {
        return symbols;
    }

    return [...symbols, normalized];
}

function uniqueQuoteSubscriptionSymbols(symbols: string[]) {
    return symbols.reduce<string[]>((accumulator, symbol) => (
        appendExactQuoteSubscriptionSymbol(accumulator, symbol)
    ), []);
}

function getQuoteSubscriptionFamilyKey(symbol: string) {
    return getTerminalSymbolKey(symbol);
}

function withDefaultQuoteHydrationSymbols(symbols: string[], limit = Number.MAX_SAFE_INTEGER) {
    const subscriptionLimit = Number.isFinite(limit)
        ? Math.max(0, Math.floor(limit))
        : Number.MAX_SAFE_INTEGER;
    const subscriptions: string[] = [];
    const seenFamilies = new Set<string>();

    if (subscriptionLimit === 0) {
        return subscriptions;
    }

    for (const symbol of uniqueQuoteSubscriptionSymbols(symbols)) {
        if (subscriptions.length >= subscriptionLimit) {
            break;
        }

        const normalizedSymbol = symbol.trim();
        const familyKey = getQuoteSubscriptionFamilyKey(normalizedSymbol);
        if (!normalizedSymbol || seenFamilies.has(familyKey)) {
            continue;
        }

        seenFamilies.add(familyKey);
        subscriptions.push(normalizedSymbol);
    }

    return subscriptions;
}

function getCatalogSymbolSelection(
    symbols: SymbolInfo[],
    symbol: string,
    prices: Record<string, { bid?: number; ask?: number }> = {},
) {
    const trimmed = symbol.trim();
    const catalogSymbols = getTerminalDisplaySymbols(symbols);
    const exact = catalogSymbols.find((entry) => entry.name === trimmed) ?? null;

    if (!trimmed) {
        return {
            exact,
            sortedCandidates: [] as SymbolInfo[],
            bestCandidate: null as SymbolInfo | null,
        };
    }

    const targetCanonical = getTerminalSymbolKey(trimmed);
    const sortedCandidates = [...catalogSymbols.filter((entry) => symbolsMatch(entry.name, trimmed))]
        .sort((left, right) => compareBrokerSymbolVariants(left, right, prices, targetCanonical));

    return {
        exact,
        sortedCandidates,
        bestCandidate: sortedCandidates[0] ?? exact,
    };
}

function resolveCatalogSymbolName(
    symbols: SymbolInfo[],
    symbol: string,
    prices: Record<string, { bid?: number; ask?: number }> = {},
    options: { preserveExact?: boolean } = {},
): string | null {
    const trimmed = symbol.trim();
    if (!trimmed) {
        return null;
    }

    const { exact, bestCandidate } = getCatalogSymbolSelection(symbols, trimmed, prices);
    if (!bestCandidate) {
        return exact?.name ?? null;
    }

    if (options.preserveExact && exact) {
        return exact.name;
    }

    return bestCandidate.name;
}

function resolveCatalogSymbolList(
    symbols: SymbolInfo[],
    candidates: string[],
    prices: Record<string, { bid?: number; ask?: number }> = {},
    options: { preserveExact?: boolean } = { preserveExact: true },
) {
    return uniqueTerminalSymbols(
        candidates
            .map((candidate) => resolveCatalogSymbolName(symbols, candidate, prices, options))
            .filter((symbol): symbol is string => Boolean(symbol)),
    );
}

function isWeakerQuoteSubscriptionAlias(candidate: string, preferredCandidate: string) {
    return isBoundedShortSymbolPrefixAlias(candidate, preferredCandidate);
}

function getDominantQuoteSubscriptionCandidates(
    catalogSymbols: SymbolInfo[],
    symbol: string,
    prices: Record<string, { bid?: number; ask?: number }> = {},
) {
    const trimmed = symbol.trim();
    if (!trimmed) {
        return [] as SymbolInfo[];
    }

    const strongerCandidates = catalogSymbols.filter((entry) => (
        isWeakerQuoteSubscriptionAlias(trimmed, entry.name)
    ));

    return strongerCandidates
        .filter((candidate) => (
            !strongerCandidates.some((preferredCandidate) => (
                preferredCandidate.name !== candidate.name &&
                isWeakerQuoteSubscriptionAlias(candidate.name, preferredCandidate.name)
            ))
        ))
        .sort((left, right) => (
            compareBrokerSymbolVariants(left, right, prices, getTerminalSymbolKey(trimmed))
        ));
}

interface QuoteSubscriptionResolutionOptions {
    allowInputFallback?: boolean;
    limit?: number;
}

function resolveQuoteSubscriptionSymbolName(
    symbols: SymbolInfo[],
    symbol: string,
    prices: Record<string, { bid?: number; ask?: number }> = {},
    options: QuoteSubscriptionResolutionOptions = {},
) {
    const trimmed = symbol.trim();
    if (!trimmed) {
        return null;
    }

    const catalogSymbols = getTerminalDisplaySymbols(symbols);
    const exact = catalogSymbols.find((entry) => entry.name === trimmed) ?? null;
    if (exact) {
        return getDominantQuoteSubscriptionCandidates(catalogSymbols, exact.name, prices)[0]?.name ?? exact.name;
    }

    const { bestCandidate } = getCatalogSymbolSelection(symbols, trimmed, prices);
    if (bestCandidate) {
        return getDominantQuoteSubscriptionCandidates(catalogSymbols, bestCandidate.name, prices)[0]?.name ?? bestCandidate.name;
    }

    return getDominantQuoteSubscriptionCandidates(catalogSymbols, trimmed, prices)[0]?.name
        ?? (options.allowInputFallback ? trimmed : null);
}

function resolveQuoteSubscriptionSymbolList(
    symbols: SymbolInfo[],
    candidates: string[],
    prices: Record<string, { bid?: number; ask?: number }> = {},
    options: QuoteSubscriptionResolutionOptions = {},
) {
    const limit = options.limit === undefined
        ? Number.MAX_SAFE_INTEGER
        : Math.max(0, Math.floor(options.limit));
    if (limit === 0) {
        return [];
    }

    return withDefaultQuoteHydrationSymbols(uniqueTerminalSymbols(
        candidates
            .map((candidate) => resolveQuoteSubscriptionSymbolName(symbols, candidate, prices, options))
            .filter((symbol): symbol is string => Boolean(symbol)),
    ).slice(0, limit), limit);
}

function resolveCatalogSymbolInfo(
    symbols: SymbolInfo[],
    symbol: string,
    prices: Record<string, { bid?: number; ask?: number }> = {},
    options: { preserveExact?: boolean } = { preserveExact: true },
): SymbolInfo | null {
    const resolvedName = resolveCatalogSymbolName(symbols, symbol, prices, options);
    if (!resolvedName) {
        return null;
    }

    return symbols.find((entry) => entry.name === resolvedName) ?? null;
}

function resolveDefaultTerminalSymbols(
    symbols: SymbolInfo[],
    prices: Record<string, { bid?: number; ask?: number }> = {},
) {
    const preferredSymbols = resolveCatalogSymbolList(
        symbols,
        [...PREFERRED_TERMINAL_SYMBOLS],
        prices,
        { preserveExact: false },
    );

    if (preferredSymbols.length > 0) {
        return preferredSymbols;
    }

    return getTerminalFallbackSymbolInfos().map((symbol) => symbol.name);
}

type TerminalBootstrapState = {
    hasPersistedSymbols: boolean;
    historyPrewarmSymbols: string[];
    nextSymbol: string;
    nextTabs: string[];
    nextWatchlist: string[];
    quotePrewarmSymbols: string[];
};

function buildTerminalBootstrapState(
    symbols: SymbolInfo[],
    prices: Record<string, { bid?: number; ask?: number }> = {},
    options: {
        terminalPreferences: TerminalPreferences | null;
        terminalPreferencesLoaded: boolean;
    },
): TerminalBootstrapState {
    const { terminalPreferences, terminalPreferencesLoaded } = options;
    const defaultSymbols = resolveDefaultTerminalSymbols(symbols, prices);
    const defaultHotSymbols = resolveCatalogSymbolList(
        symbols,
        [...DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS],
        prices,
        { preserveExact: false },
    ).slice(0, TERMINAL_BOOTSTRAP_OHLC_HISTORY_SYMBOL_LIMIT);
    const persistedRawWatchlist = uniqueTerminalSymbols(
        terminalPreferencesLoaded ? terminalPreferences?.watchlistSymbols ?? [] : [],
    );
    const persistedRawOpenTabs = uniqueTerminalSymbols(
        terminalPreferencesLoaded ? terminalPreferences?.openTabs ?? [] : [],
    );
    const persistedRawSelectedSymbol = terminalPreferencesLoaded
        ? terminalPreferences?.selectedSymbol?.trim() ?? ''
        : '';
    const persistedWatchlist = resolveCatalogSymbolList(
        symbols,
        persistedRawWatchlist,
        prices,
        { preserveExact: true },
    );
    const persistedOpenTabs = resolveCatalogSymbolList(
        symbols,
        persistedRawOpenTabs,
        prices,
        { preserveExact: true },
    );
    const persistedSelectedSymbol = persistedRawSelectedSymbol
        ? resolveCatalogSymbolName(
            symbols,
            persistedRawSelectedSymbol,
            prices,
            { preserveExact: true },
        )
        : null;
    const hasPersistedWatchlist = persistedWatchlist.length > 0;
    const hasPersistedOpenTabs = persistedOpenTabs.length > 0;
    const hasPersistedSelectedSymbol = Boolean(persistedSelectedSymbol);
    const hasPersistedSymbols =
        persistedWatchlist.length > 0 ||
        persistedOpenTabs.length > 0 ||
        hasPersistedSelectedSymbol;
    const nextWatchlist = hasPersistedWatchlist
        ? persistedWatchlist
        : hasPersistedSymbols
            ? uniqueTerminalSymbols([
                ...persistedOpenTabs,
                ...(persistedSelectedSymbol ? [persistedSelectedSymbol] : []),
            ])
            : defaultSymbols;
    const nextSymbol =
        persistedSelectedSymbol && nextWatchlist.some((symbol) => symbolsMatch(symbol, persistedSelectedSymbol))
            ? persistedSelectedSymbol
            : persistedOpenTabs[0] ?? nextWatchlist[0] ?? '';
    const baseTabs = hasPersistedOpenTabs
        ? persistedOpenTabs
        : hasPersistedSymbols && nextSymbol
            ? [nextSymbol]
            : defaultSymbols;
    const nextTabs = nextSymbol
        ? appendUniqueTerminalSymbol(baseTabs, nextSymbol)
        : baseTabs;
    const quotePrewarmSymbols = resolveQuoteSubscriptionSymbolList(
        symbols,
        defaultHotSymbols,
        prices,
        {
            allowInputFallback: true,
            limit: DEFAULT_HOT_QUOTE_SUBSCRIPTION_LIMIT,
        },
    );
    const historyPrewarmSymbols = uniqueTerminalSymbols([
        nextSymbol,
        ...defaultHotSymbols,
    ]).slice(0, TERMINAL_BOOTSTRAP_OHLC_HISTORY_SYMBOL_LIMIT);

    return {
        hasPersistedSymbols,
        historyPrewarmSymbols,
        nextSymbol,
        nextTabs,
        nextWatchlist,
        quotePrewarmSymbols,
    };
}

function hasLivePriceForSymbol(prices: Record<string, { symbol?: string; bid?: number; ask?: number; last?: number }>, symbol: string) {
    const price = getSafeLiveQuoteSnapshotBySymbol(symbol, getLivePriceSnapshotBySymbol, prices);
    return Boolean(price && ((price.bid ?? 0) > 0 || (price.ask ?? 0) > 0 || (price.last ?? 0) > 0));
}

function isSoftQuoteFeedNotice(message?: string | null) {
    return /waiting for the first mt5 tick|chart history can load/i.test(message ?? '');
}

function isReadyRealtimeClient(
    client: WebSocketTradingClient | null | undefined,
): client is WebSocketTradingClient {
    return Boolean(client?.isConnected && client.isAuthenticated);
}

function isReadyOhlcHistoryClient(
    client: WebSocketTradingClient | null | undefined,
): client is WebSocketTradingClient {
    return Boolean(client?.isConnected && client.isAuthenticated && client.supportsOhlcActions);
}

function getPreferredQuoteWsClient(
    marketClient: WebSocketTradingClient | null | undefined,
    ownerClient: WebSocketTradingClient | null | undefined,
) {
    if (isReadyRealtimeClient(marketClient)) {
        return marketClient;
    }

    if (isReadyRealtimeClient(ownerClient)) {
        return ownerClient;
    }

    return marketClient ?? ownerClient ?? null;
}

function isQuoteFeedDegradedWarning(message?: string | null) {
    return /no live (mt5 )?(quote|price|ohlc|market data) server|live quote|cached bootstrap/i.test(message ?? '');
}

function isNonBlockingTerminalWarningMessage(message?: string | null) {
    const normalizedMessage = message?.trim() ?? '';
    if (!normalizedMessage) {
        return false;
    }

    if (/bootstrap failed|mt5 unavailable|terminal unavailable/i.test(normalizedMessage)) {
        return false;
    }

    return /cached|cache|stale|deferred|notes?\b|bootstrap note|cached bootstrap/i.test(normalizedMessage);
}

function isSymbolRefreshWarningMessage(message?: string | null) {
    return /broker symbols.*refreshing|market watch.*update automatically|market watch.*cached/i.test(message ?? '');
}

function isTransientTerminalSymbolRefreshError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /not connected|websocket disconnected|websocket transport closed|connection lost; reconnecting|upstream closed|requires an authenticated websocket session|timed out waiting for websocket authentication|get_symbols timed out|request_bootstrap_state timed out/i.test(message);
}

function isTransientTerminalPositionRefreshError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const source = error && typeof error === 'object' ? error as Record<string, unknown> : null;
    const details = source?.details && typeof source.details === 'object'
        ? source.details as Record<string, unknown>
        : null;
    const directCode = source?.code;
    const detailCode = details?.code;
    const code = (
        typeof directCode === 'string' ? directCode :
        typeof detailCode === 'string' ? detailCode :
        ''
    ).toLowerCase();
    const retryable = source?.retryable === true || details?.retryable === true;

    if (code === 'session_query_error' && !retryable) {
        return false;
    }

    if (/not connected|websocket disconnected|websocket transport closed|transport closed|websocket connection closed|websocket connection error|connection lost|reconnecting|upstream closed|requires an authenticated websocket session|timed out waiting for websocket authentication|request_positions timed out|request_positions was superseded/i.test(message)) {
        return true;
    }

    if (
        code === 'mt5_manager_lane_busy' ||
        code === 'mt5_manager_query_deferred' ||
        code === 'session_query_deferred' ||
        code === 'mt5_positions_sdk_call_stale' ||
        code === 'request_positions_snapshot_pending' ||
        (code === 'session_query_error' && retryable)
    ) {
        return true;
    }

    if (code === 'mt5_manager_request_failed' && retryable) {
        return true;
    }

    if (code === 'request_positions_rest_fallback_failed' && retryable) {
        return true;
    }

    return /mt5 manager.*busy|trade command is active|retry request_positions|terminal state query worker capacity is full|request_positions is still deferred by the mt5 manager|positions call exceeded the watchdog|positions.*stale/i.test(message);
}

function formatTerminalRequestError(error: unknown, fallback: string) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return message.trim() || fallback;
}

type TerminalPositionsLoadState = {
    isLoading: boolean;
    error: string | null;
    warning?: string | null;
};

type TerminalFrontendLaunchRestoreState = {
    accountId: string | null;
    hasAccountInfo: boolean;
    hasPositions: boolean;
    hasSymbols: boolean;
    hasSelectedSymbol: boolean;
};

type TerminalPositionsRefreshOptions = {
    showPositionsLoading?: boolean;
    forcePositionsRefresh?: boolean;
    coalescePositionsRefresh?: boolean;
};

type TerminalOrderSide = 'buy' | 'sell';

type OptimisticTerminalPosition = Position & {
    isOptimistic: true;
    createdAtMs: number;
    expiresAtMs: number;
};

type PendingTerminalOrderCorrelation = {
    symbol: string;
    side: TerminalOrderSide;
    tradeType: WebtraderOrderType;
    orderType: 'market' | 'limit' | 'stop';
    volume: number;
    price?: number;
    resultRequestId?: string;
    resultOrder?: number;
    resultDeal?: number;
};

type PendingTerminalOrderConfirmation = {
    id: number;
    message: string;
    expiresAtMs: number;
    confirmed: boolean;
    correlation: PendingTerminalOrderCorrelation;
};

function getTerminalPositionPriceTolerance(price: number, digits?: number) {
    const point = typeof digits === 'number' && Number.isFinite(digits)
        ? 1 / Math.pow(10, Math.max(0, digits))
        : 0.00001;
    return Math.max(point * 50, Math.abs(price) * 0.0005, 1e-8);
}

function nullablePositionPricesMatch(
    left: number | null | undefined,
    right: number | null | undefined,
    tolerance: number,
) {
    const leftIsSet = typeof left === 'number' && Number.isFinite(left) && left > 0;
    const rightIsSet = typeof right === 'number' && Number.isFinite(right) && right > 0;

    if (!leftIsSet && !rightIsSet) {
        return true;
    }

    if (!leftIsSet || !rightIsSet) {
        return false;
    }

    return Math.abs(left - right) <= tolerance;
}

function optimisticTerminalPositionMatchesReal(
    optimisticPosition: OptimisticTerminalPosition,
    realPosition: Position,
) {
    if (
        !symbolsMatch(optimisticPosition.symbol, realPosition.symbol) ||
        optimisticPosition.type !== realPosition.type ||
        Math.abs(optimisticPosition.volume - realPosition.volume) > 1e-9
    ) {
        return false;
    }

    const tolerance = getTerminalPositionPriceTolerance(
        optimisticPosition.openPrice,
        optimisticPosition.digits ?? realPosition.digits,
    );

    return (
        Math.abs(optimisticPosition.openPrice - realPosition.openPrice) <= tolerance &&
        nullablePositionPricesMatch(optimisticPosition.sl, realPosition.sl, tolerance) &&
        nullablePositionPricesMatch(optimisticPosition.tp, realPosition.tp, tolerance)
    );
}

function mergeTerminalPositionsWithOptimistic(
    realPositions: Position[],
    optimisticPositions: OptimisticTerminalPosition[],
) {
    const now = Date.now();
    const activeOptimisticPositions = optimisticPositions.filter((optimisticPosition) =>
        optimisticPosition.expiresAtMs > now &&
        !realPositions.some((realPosition) =>
            optimisticTerminalPositionMatchesReal(optimisticPosition, realPosition),
        ),
    );

    return [...realPositions, ...activeOptimisticPositions];
}

function getTerminalPositionsTransientSettledState(): TerminalPositionsLoadState {
    return {
        isLoading: false,
        error: null,
        warning: TERMINAL_POSITIONS_BACKGROUND_RETRY_MESSAGE,
    };
}

function getTerminalPositionsRefreshFailureState(
    error: unknown,
): TerminalPositionsLoadState {
    if (isTransientTerminalPositionRefreshError(error)) {
        return getTerminalPositionsTransientSettledState();
    }

    return {
        isLoading: false,
        error: formatTerminalRequestError(
            error,
            'Unable to load open positions. Please retry in a moment.',
        ),
        warning: null,
    };
}

type TerminalRestPositionsResponse = {
    success?: unknown;
    accountId?: unknown;
    account_id?: unknown;
    login?: unknown;
    pending?: unknown;
    cacheMiss?: unknown;
    code?: unknown;
    positions?: unknown;
    data?: {
        accountId?: unknown;
        account_id?: unknown;
        login?: unknown;
        source?: unknown;
        pending?: unknown;
        cacheMiss?: unknown;
        positions?: unknown;
    };
};

type TerminalRestPositionsFetchOptions = {
    force?: boolean;
};

function terminalRestPositionsResponseMatchesAccount(
    payload: TerminalRestPositionsResponse,
    accountId: string,
): boolean {
    const requestedLogin = normalizeTerminalAccountLogin(accountId);
    if (!requestedLogin) {
        return false;
    }

    const responseLogins = [
        payload.accountId,
        payload.account_id,
        payload.login,
        payload.data?.accountId,
        payload.data?.account_id,
        payload.data?.login,
    ]
        .map(normalizeTerminalAccountLogin)
        .filter((value): value is string => Boolean(value));

    return responseLogins.length === 0 ||
        responseLogins.every((login) => login === requestedLogin);
}

function isTerminalRestPositionsPendingCacheMiss(
    payload: TerminalRestPositionsResponse,
): boolean {
    return (
        payload.code === 'TERMINAL_STATE_POSITIONS_PENDING' ||
        payload.cacheMiss === true ||
        payload.data?.cacheMiss === true ||
        payload.data?.source === 'terminal_state_pending'
    ) && (payload.pending === true || payload.data?.pending === true);
}

function toTerminalPositionNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
}

function toTerminalPositionInteger(value: unknown): number {
    const parsed = Math.trunc(toTerminalPositionNumber(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

function toTerminalPositionDate(value: unknown): Date {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }

    const numericValue =
        typeof value === 'number' && Number.isFinite(value)
            ? value
            : typeof value === 'string' && value.trim() && Number.isFinite(Number(value.trim()))
                ? Number(value.trim())
                : null;
    if (numericValue !== null) {
        const epochMs = numericValue > 10_000_000_000 ? numericValue : numericValue * 1000;
        const date = new Date(epochMs);
        return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    if (typeof value === 'string' && value.trim()) {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    return new Date();
}

function normalizeTerminalRestPositionType(value: unknown): WebtraderPosition['type'] {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'sell' || normalized === 'short' || normalized === '1'
        ? 'sell'
        : 'buy';
}

function mapTerminalRestPosition(payload: unknown): WebtraderPosition | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    const source = payload as Record<string, unknown>;
    const accountId =
        typeof (source.accountId ?? source.account_id ?? source.account) === 'string' &&
        String(source.accountId ?? source.account_id ?? source.account).trim()
            ? String(source.accountId ?? source.account_id ?? source.account).trim()
            : undefined;
    const accountLogin = toTerminalPositionInteger(
        source.accountLogin ??
        source.account_login ??
        source.mt5Login ??
        source.mt5_login ??
        source.login,
    );
    return {
        ...(accountId ? { accountId } : {}),
        ...(accountLogin > 0 ? { accountLogin, login: accountLogin } : {}),
        ticket: toTerminalPositionInteger(source.ticket ?? source.id ?? source.positionId),
        symbol: typeof source.symbol === 'string' ? source.symbol : '',
        type: normalizeTerminalRestPositionType(source.type ?? source.side),
        volume: toTerminalPositionNumber(source.volume),
        openPrice: toTerminalPositionNumber(source.openPrice ?? source.open_price),
        priceCurrent: toTerminalPositionNumber(source.priceCurrent ?? source.currentPrice ?? source.price_current),
        sl: toTerminalPositionNumber(source.sl),
        tp: toTerminalPositionNumber(source.tp),
        profit: toTerminalPositionNumber(source.profit),
        swap: toTerminalPositionNumber(source.swap),
        commission: toTerminalPositionNumber(source.commission),
        comment: typeof source.comment === 'string' && source.comment.trim() ? source.comment : undefined,
        externalId: typeof source.externalId === 'string' && source.externalId.trim() ? source.externalId : undefined,
        openTime: toTerminalPositionDate(source.openTime ?? source.openTimeMsc ?? source.open_time),
    };
}

async function fetchTerminalRestPositions(accountId: string, options?: TerminalRestPositionsFetchOptions): Promise<WebtraderPosition[]> {
    const query = `accountId=${encodeURIComponent(accountId)}${options?.force ? '&force=1' : ''}`;
    const response = await fetch(`/api/trading/positions?${query}`, {
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unable to load open positions.'}`);
    }

    const payload = await response.json() as TerminalRestPositionsResponse;
    if (payload.success !== true) {
        throw new Error(
            typeof (payload as { error?: unknown }).error === 'string'
                ? (payload as { error: string }).error
                : 'REST positions refresh did not return a successful snapshot.',
        );
    }
    if (!terminalRestPositionsResponseMatchesAccount(payload, accountId)) {
        throw new Error('REST positions refresh returned a snapshot for a different account.');
    }

    const rawPositions = Array.isArray(payload.positions)
        ? payload.positions
        : payload.data && Array.isArray(payload.data.positions)
            ? payload.data.positions
            : null;
    if (!rawPositions) {
        throw new Error('REST positions refresh did not return a positions array.');
    }
    if (rawPositions.length === 0 && isTerminalRestPositionsPendingCacheMiss(payload)) {
        throw new Error('REST positions refresh is still waiting for the account-scoped cache.');
    }

    return rawPositions
        .map((position) => mapTerminalRestPosition(position))
        .filter((position): position is WebtraderPosition => Boolean(position));
}

function createTerminalPositionsRestFallbackError(error: unknown) {
    const message = formatTerminalRequestError(
        error,
        'REST positions refresh failed after an empty websocket snapshot.',
    );
    return Object.assign(
        new Error(`REST positions refresh failed after an empty websocket snapshot: ${message}`),
        {
            code: 'request_positions_rest_fallback_failed',
            retryable: true,
            details: {
                code: 'request_positions_rest_fallback_failed',
                retryable: true,
                message,
            },
        },
    );
}

type EmptyTerminalPositionsStreamSnapshotInput = {
    incomingPositions: readonly unknown[];
    currentPositions: readonly unknown[];
    positionsRefreshInFlight: { accountId: string | null; wsClient: unknown } | null;
    accountId: string | null;
    wsClient: unknown;
    terminalConnectionStatus: string;
};

function shouldDeferEmptyTerminalPositionsStreamSnapshot(
    input: EmptyTerminalPositionsStreamSnapshotInput,
): boolean {
    const {
        incomingPositions,
        currentPositions,
        positionsRefreshInFlight,
        accountId,
        wsClient,
        terminalConnectionStatus,
    } = input;

    return (
        incomingPositions.length === 0 &&
        currentPositions.length > 0 &&
        Boolean(accountId) &&
        positionsRefreshInFlight?.accountId === accountId &&
        positionsRefreshInFlight.wsClient === wsClient &&
        (terminalConnectionStatus === 'ready' || terminalConnectionStatus === 'locked')
    );
}

function hasRecoverableTerminalPositionsStoreSnapshot({
    positions,
    wsClient,
    connectionStatus,
}: {
    positions: WebtraderPosition[];
    wsClient: WebSocketTradingClient | null | undefined;
    connectionStatus: string;
}): boolean {
    if (positions.length > 0) {
        return true;
    }

    return Boolean(wsClient?.isConnected && wsClient.isAuthenticated) || connectionStatus === 'connected';
}

function canRefreshTerminalPositions({
    accountId,
    wsClient,
    terminalConnectionStatus,
}: {
    accountId: string | null | undefined;
    wsClient: WebSocketTradingClient | null | undefined;
    terminalConnectionStatus: string;
}): boolean {
    if (!accountId || !wsClient?.isConnected || !wsClient.isAuthenticated) {
        return false;
    }

    // A UI-level locked state can lag behind an authenticated recovered MT5 session.
    return terminalConnectionStatus === 'ready' || terminalConnectionStatus === 'locked';
}

function isTransientTerminalOhlcPrimeError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return isTransientTerminalOhlcPrimeStatus(message);
}

const TERMINAL_OHLC_PRIME_HARD_FAILURE_STATUS_PATTERNS = [
    /\bbootstrap\s+failed\b/i,
    /\bmt5\s+(?:terminal\s+)?unavailable\b/i,
    /\bterminal\s+unavailable\b/i,
    /\bnot\s+configured\b/i,
    /\bmissing\s+(?:config(?:uration)?|secret|credential)s?\b/i,
    /\bconfig(?:uration)?\s+(?:missing|invalid|failed|error|required)\b/i,
    /\bcredential(?:s)?\s+(?:missing|invalid|failed|required)\b/i,
    /\b(?:authentication|authorization|auth)\s+(?:failed|failure|invalid|error|required)\b/i,
    /\b(?:unauthorized|forbidden|access denied)\b/i,
] as const;

const TERMINAL_OHLC_PRIME_TRANSIENT_STATUS_PATTERNS = [
    /request_ohlc_history timed out/i,
    /timed out waiting for websocket authentication/i,
    /requires an authenticated websocket session/i,
    /websocket disconnected|websocket transport closed|transport closed/i,
    /connection lost; reconnecting|upstream closed/i,
    /\bnot authenticated\b|\bnot connected\b/i,
    /no live ohlc session is connected|no authenticated realtime client was attached for ohlc history/i,
    /\btimed?\s*out\b|\btimeout\b/i,
    /\bdefer(?:red)?\b|\bpending\b|\bqueued\b|\bloading\b/i,
    /\bnot[_\s-]?ready\b|initiali[sz](?:ing|ation)|\bstarting\b|\bwarming\b|\bstartup\b/i,
    /\bbootstrap(?:\s+(?:not[_\s-]?ready|initiali[sz](?:ing|ation)|starting|warming|startup|defer(?:red)?|pending|queued|loading|retry(?:ing)?))\b/i,
    /temporar(?:y|ily) unavailable/i,
    /\bno bars yet\b|\bno history yet\b|\bno data yet\b/i,
    /\bohlc history not available yet\b/i,
    /\bretry later\b|\btry again\b/i,
] as const;

function isTerminalOhlcPrimeHardFailureStatus(message: string) {
    return TERMINAL_OHLC_PRIME_HARD_FAILURE_STATUS_PATTERNS.some((pattern) =>
        pattern.test(message),
    );
}

function isTransientTerminalOhlcPrimeStatus(message: string) {
    if (isTerminalOhlcPrimeHardFailureStatus(message)) {
        return false;
    }

    return TERMINAL_OHLC_PRIME_TRANSIENT_STATUS_PATTERNS.some((pattern) =>
        pattern.test(message),
    );
}

function shouldWarnTerminalOhlcPrimeFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (!message.trim()) {
        return false;
    }

    return !isTransientTerminalOhlcPrimeError(error);
}

function resolveExactInstrumentForSymbol<T extends Instrument>(
    instruments: T[],
    prices: Record<string, { bid?: number; ask?: number }>,
    symbol: string,
) {
    const exact = instruments.find((instrument) => instrument.symbol === symbol) ?? null;
    const variants = instruments.filter((instrument) => symbolsMatch(instrument.symbol, symbol));
    const liveVariant = variants.find((instrument) => hasLivePriceForSymbol(prices, instrument.symbol));

    return exact ?? liveVariant ?? variants[0] ?? null;
}

function resolveExactSymbolName(
    symbols: SymbolInfo[],
    prices: Record<string, { bid?: number; ask?: number }>,
    symbol: string,
) {
    const trimmed = symbol.trim();
    return resolveCatalogSymbolName(symbols, trimmed, prices, { preserveExact: false }) ?? trimmed;
}

function getMarketWatchSymbols(
    symbols: SymbolInfo[],
    prices: Record<string, { bid?: number; ask?: number }>,
    selectedSymbol: string,
) {
    const marketSymbols = getTerminalDisplaySymbols(symbols);
    const chosenByCanonical = new Map<string, SymbolInfo>();

    for (const symbol of marketSymbols) {
        const canonical = getTerminalSymbolKey(symbol.name);
        const current = chosenByCanonical.get(canonical);
        if (
            !current ||
            compareBrokerSymbolVariants(symbol, current, prices, canonical) < 0
        ) {
            chosenByCanonical.set(canonical, symbol);
        }
    }

    return [...chosenByCanonical.values()].sort((left, right) => {
        if (selectedSymbol) {
            const leftIsSelected = symbolsMatch(left.name, selectedSymbol);
            const rightIsSelected = symbolsMatch(right.name, selectedSymbol);
            if (leftIsSelected !== rightIsSelected) {
                return leftIsSelected ? -1 : 1;
            }
        }

        const leftRank = getDefaultTerminalSymbolRank(left.name);
        const rightRank = getDefaultTerminalSymbolRank(right.name);
        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }

        const leftBase = stripExecutionSuffix(left.name);
        const rightBase = stripExecutionSuffix(right.name);
        const baseCompare = leftBase.localeCompare(rightBase);
        if (baseCompare !== 0) {
            return baseCompare;
        }

        const leftHasLivePrice = hasLivePriceForSymbol(prices, left.name);
        const rightHasLivePrice = hasLivePriceForSymbol(prices, right.name);
        if (leftHasLivePrice !== rightHasLivePrice) {
            return leftHasLivePrice ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
    });
}

type TerminalInstrument = Instrument & {
    quoteSource: 'live' | 'none';
    hasExecutableQuote?: boolean;
    bidDirection?: 'up' | 'down' | 'same';
    askDirection?: 'up' | 'down' | 'same';
};

type TerminalInstrumentMeta = Pick<
    Instrument,
    'symbol' | 'name' | 'category' | 'digits' | 'pipSize' | 'contractSize' | 'icon' | 'tradeMode'
>;

interface DashboardAccountSummary {
    balance: number;
    profit: number;
    equity: number;
    margin: number;
    freeMargin: number;
    marginLevel: number;
    leverage: number;
    currency: string;
}

function hasUsefulAccountCurrency(currency: unknown): currency is string {
    return typeof currency === 'string' && currency.trim().length > 0;
}

function normalizeTerminalAccountLogin(value: unknown): string | null {
    const normalized =
        typeof value === 'number' && Number.isFinite(value)
            ? String(Math.trunc(value))
            : typeof value === 'string'
                ? value.trim().replace(/^mt5-/i, '')
                : '';

    return /^\d+$/.test(normalized) ? normalized : null;
}

function getTerminalPositionsAccountCacheKey(accountId: string | null | undefined): string | null {
    return normalizeTerminalAccountLogin(accountId);
}

function getTerminalPositionLogin(position: WebtraderPosition): string | null {
    return normalizeTerminalAccountLogin(position.accountLogin ?? position.login);
}

function terminalPositionMatchesAccount(position: WebtraderPosition, accountId: string | null | undefined): boolean {
    const requestedLogin = normalizeTerminalAccountLogin(accountId);
    // No active account scope → keep rows (boot / pre-select).
    if (!requestedLogin) return true;
    const positionLogin = getTerminalPositionLogin(position);
    // Fail-closed: untagged positions must not appear under a selected account.
    if (!positionLogin) return false;
    return positionLogin === requestedLogin;
}

function filterTerminalPositionsForAccount(
    positions: readonly WebtraderPosition[],
    accountId: string | null | undefined,
): WebtraderPosition[] {
    const requestedLogin = normalizeTerminalAccountLogin(accountId);
    return positions.filter((position) => terminalPositionMatchesAccount(position, requestedLogin));
}

function getTerminalPositionExecutionSignature(positions: readonly WebtraderPosition[]): string {
    return positions
        .map((position) => [
            position.ticket,
            position.symbol,
            position.type,
            toFiniteNumber(position.volume),
            toFiniteNumber(position.openPrice),
            toFiniteNumber(position.sl),
            toFiniteNumber(position.tp),
            position.openTime instanceof Date && !Number.isNaN(position.openTime.getTime())
                ? position.openTime.getTime()
                : String(position.openTime ?? ''),
        ].join(':'))
        .sort()
        .join('|');
}

function getTerminalAccountInfoSignature(accountInfo: TradingAccountInfo | null | undefined): string {
    if (!accountInfo) {
        return '';
    }

    return [
        accountInfo.login,
        accountInfo.currency,
        toFiniteNumber(accountInfo.balance),
        toFiniteNumber(accountInfo.equity),
        toFiniteNumber(accountInfo.margin),
        toFiniteNumber(accountInfo.marginFree),
        toFiniteNumber(accountInfo.availableMargin),
        toFiniteNumber(accountInfo.marginLevel),
        toFiniteNumber(accountInfo.profit),
        toFiniteNumber(accountInfo.swap),
        toFiniteNumber(accountInfo.commission),
        toFiniteNumber(accountInfo.credit),
    ].join(':');
}

function getTerminalSymbolSignedExposure(
    positions: readonly WebtraderPosition[],
    symbol: string,
): number {
    return positions.reduce((exposure, position) => {
        if (!symbolsMatch(position.symbol, symbol)) {
            return exposure;
        }

        const volume = toFiniteNumber(position.volume, Number.NaN);
        if (!Number.isFinite(volume) || volume <= 0) {
            return exposure;
        }

        if (position.type === 'buy') {
            return exposure + volume;
        }

        if (position.type === 'sell') {
            return exposure - volume;
        }

        return exposure;
    }, 0);
}

function terminalSubmittedOrderExposureDeltaMatches(
    beforePositions: readonly WebtraderPosition[],
    positions: readonly WebtraderPosition[],
    symbol: string,
    side: TerminalOrderSide,
    volume: number,
): boolean {
    const expectedDelta = side === 'sell' ? -volume : volume;
    if (!Number.isFinite(expectedDelta) || Math.abs(expectedDelta) <= 0) {
        return false;
    }

    const beforeExposure = getTerminalSymbolSignedExposure(beforePositions, symbol);
    const afterExposure = getTerminalSymbolSignedExposure(positions, symbol);
    const actualDelta = afterExposure - beforeExposure;
    const tolerance = Math.max(
        TERMINAL_ORDER_VOLUME_DELTA_TOLERANCE,
        Math.abs(expectedDelta) * 1e-6,
    );

    return Math.abs(actualDelta - expectedDelta) <= tolerance;
}

function parseTerminalTradeRetcode(retcode: unknown): number | null {
    const parsed = typeof retcode === 'number'
        ? Math.trunc(retcode)
        : typeof retcode === 'string' && retcode.trim()
            ? Number.parseInt(retcode.trim(), 10)
            : Number.NaN;

    return Number.isFinite(parsed) ? parsed : null;
}

function isSuccessfulTerminalTradeRetcode(retcode: unknown): boolean {
    const parsed = parseTerminalTradeRetcode(retcode);

    return parsed !== null && TERMINAL_TRADE_SUCCESS_RETCODES.has(parsed);
}

function isUnknownOutcomeTerminalTradeResult(result: TradeResult): boolean {
    const parsed = parseTerminalTradeRetcode(result.retcode);

    return (
        result.pending === true ||
        result.outcomeUnknown === true ||
        (parsed !== null && TERMINAL_TRADE_UNKNOWN_OUTCOME_RETCODES.has(parsed))
    );
}

function getTerminalTradeResultRetcode(payload: unknown): unknown {
    if (!payload || typeof payload !== 'object') {
        return undefined;
    }

    const source = payload as { retcode?: unknown; success?: unknown; result?: { retcode?: unknown; success?: unknown; status?: unknown } };
    const retcode = source.result?.retcode ?? source.retcode;
    if (retcode !== undefined && retcode !== null) {
        return retcode;
    }

    const success = source.result?.success ?? source.success;
    if (success === true) {
        return 10009;
    }

    if (success === false) {
        return 10006;
    }

    return undefined;
}

function getTerminalTradeResultRecord(payload: unknown): Record<string, unknown> | null {
    const source = asTerminalRecord(payload);
    if (!source) {
        return null;
    }

    return asTerminalRecord(source.result) ?? source;
}

function getTerminalTradeRequestRecord(payload: unknown): Record<string, unknown> | null {
    const source = asTerminalRecord(payload);
    if (!source) {
        return null;
    }

    const result = asTerminalRecord(source.result);
    return (
        asTerminalRecord(source.request) ??
        asTerminalRecord(source.tradeRequest) ??
        asTerminalRecord(source.data) ??
        asTerminalRecord(result?.request) ??
        asTerminalRecord(result?.tradeRequest)
    );
}

function getTerminalTradeExecutionAction(payload: unknown): string | null {
    const source = asTerminalRecord(payload);
    if (!source) {
        return null;
    }

    const result = asTerminalRecord(source.result);
    return normalizeTerminalString(
        source.action ??
        source.command ??
        source.operation ??
        result?.action ??
        result?.command ??
        result?.operation,
    )?.toLowerCase() ?? null;
}

function getTerminalTradeExecutionRequestId(payload: unknown): string | null {
    const source = asTerminalRecord(payload);
    const result = getTerminalTradeResultRecord(payload);

    return normalizeTerminalString(
        source?.requestId ??
        source?.request_id ??
        result?.requestId ??
        result?.request_id,
    );
}

function getTerminalTradeResultNumber(payload: unknown, key: string): number | null {
    const result = getTerminalTradeResultRecord(payload);
    if (!result) {
        return null;
    }

    const aliases = key === 'order'
        ? [result.order, result.mt5_order_id, result.order_id]
        : key === 'deal'
            ? [result.deal, result.mt5_deal_id, result.deal_id]
            : [result[key]];
    const parsed = toFiniteNumber(
        aliases.find((value) => value !== undefined && value !== null),
        Number.NaN,
    );
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTerminalTradeSide(value: unknown): TerminalOrderSide | null {
    const normalized = normalizeTerminalString(value)?.toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized.startsWith('buy')) {
        return 'buy';
    }

    if (normalized.startsWith('sell')) {
        return 'sell';
    }

    return null;
}

function terminalTradeExecutionMatchesPendingOrder(
    payload: unknown,
    correlation: PendingTerminalOrderCorrelation,
): boolean {
    const retcode = getTerminalTradeResultRetcode(payload);
    if (
        parseTerminalTradeRetcode(retcode) !== null &&
        !isSuccessfulTerminalTradeRetcode(retcode)
    ) {
        return false;
    }

    const requestId = getTerminalTradeExecutionRequestId(payload);
    if (correlation.resultRequestId && requestId) {
        return correlation.resultRequestId === requestId;
    }

    const resultOrder = getTerminalTradeResultNumber(payload, 'order');
    if (
        correlation.resultOrder !== undefined &&
        resultOrder !== null &&
        Math.trunc(correlation.resultOrder) === Math.trunc(resultOrder)
    ) {
        return true;
    }

    const resultDeal = getTerminalTradeResultNumber(payload, 'deal');
    if (
        correlation.resultDeal !== undefined &&
        resultDeal !== null &&
        Math.trunc(correlation.resultDeal) === Math.trunc(resultDeal)
    ) {
        return true;
    }

    const action = getTerminalTradeExecutionAction(payload);
    if (action && action !== 'place_order') {
        return false;
    }

    const request = getTerminalTradeRequestRecord(payload);
    if (!request) {
        return false;
    }

    const requestSymbol = normalizeTerminalString(request.symbol ?? request.Symbol);
    if (!requestSymbol || !symbolsMatch(requestSymbol, correlation.symbol)) {
        return false;
    }

    const requestSide = normalizeTerminalTradeSide(request.type ?? request.side ?? request.orderType);
    if (requestSide !== correlation.side) {
        return false;
    }

    const requestType = normalizeTerminalString(request.type)?.toLowerCase();
    if (requestType && requestType !== correlation.tradeType) {
        return false;
    }

    const requestVolume = toFiniteNumber(request.volume, Number.NaN);
    if (
        !Number.isFinite(requestVolume) ||
        Math.abs(requestVolume - correlation.volume) > 1e-9
    ) {
        return false;
    }

    if (correlation.price !== undefined) {
        const requestPrice = toFiniteNumber(request.price, Number.NaN);
        if (
            Number.isFinite(requestPrice) &&
            Math.abs(requestPrice - correlation.price) > 1e-9
        ) {
            return false;
        }
    }

    return true;
}

function applyTerminalTradeResultCorrelation(
    correlation: PendingTerminalOrderCorrelation,
    payload: unknown,
) {
    const requestId = getTerminalTradeExecutionRequestId(payload);
    if (requestId) {
        correlation.resultRequestId = requestId;
    }

    const resultOrder = getTerminalTradeResultNumber(payload, 'order');
    if (resultOrder !== null) {
        correlation.resultOrder = resultOrder;
    }

    const resultDeal = getTerminalTradeResultNumber(payload, 'deal');
    if (resultDeal !== null) {
        correlation.resultDeal = resultDeal;
    }
}

function getActiveTradingAccountLogin(activeTradingAccount: DashboardTradingAccount | null) {
    return normalizeTerminalAccountLogin(
        activeTradingAccount?.accountNumber ?? activeTradingAccount?.credentials?.login,
    );
}

function terminalAccountInfoMatchesActiveAccount(
    activeTradingAccount: DashboardTradingAccount | null,
    storeAccountInfo: TradingAccountInfo | null | undefined,
): storeAccountInfo is TradingAccountInfo {
    const activeLogin = getActiveTradingAccountLogin(activeTradingAccount);
    if (!activeLogin || !storeAccountInfo) {
        return false;
    }

    return normalizeTerminalAccountLogin(storeAccountInfo.login) === activeLogin;
}

function buildDashboardAccountSummary(
    activeTradingAccount: DashboardTradingAccount | null,
    storeAccountInfo?: TradingAccountInfo | null,
): DashboardAccountSummary {
    const fallbackCurrency =
        hasUsefulAccountCurrency(storeAccountInfo?.currency)
            ? storeAccountInfo.currency
            : activeTradingAccount?.currency || 'USD';
    const balance = toFiniteNumber(activeTradingAccount?.balance);
    const equity = toFiniteNumber(activeTradingAccount?.equity, balance);
    const margin = toFiniteNumber(activeTradingAccount?.margin);
    const freeMargin = toFiniteNumber(activeTradingAccount?.freeMargin);
    const baseSummary: DashboardAccountSummary = {
        balance,
        profit: 0,
        equity,
        margin,
        freeMargin,
        marginLevel: 0,
        leverage: toFiniteNumber(activeTradingAccount?.leverage),
        currency: fallbackCurrency,
    };

    if (!activeTradingAccount && storeAccountInfo) {
        return {
            balance: toFiniteNumber(storeAccountInfo.balance, baseSummary.balance),
            profit: toFiniteNumber(storeAccountInfo.profit, baseSummary.profit),
            equity: toFiniteNumber(
                storeAccountInfo.equity,
                toFiniteNumber(storeAccountInfo.balance, baseSummary.equity),
            ),
            margin: toFiniteNumber(storeAccountInfo.margin, baseSummary.margin),
            freeMargin: toFiniteNumber(
                storeAccountInfo.marginFree,
                toFiniteNumber(storeAccountInfo.availableMargin, baseSummary.freeMargin),
            ),
            marginLevel: toFiniteNumber(storeAccountInfo.marginLevel, baseSummary.marginLevel),
            leverage: toFiniteNumber(storeAccountInfo.leverage, baseSummary.leverage),
            currency: fallbackCurrency,
        };
    }

    if (!terminalAccountInfoMatchesActiveAccount(activeTradingAccount, storeAccountInfo)) {
        return baseSummary;
    }

    const matchedStoreAccountInfo = storeAccountInfo;
    if (!matchedStoreAccountInfo) {
        return baseSummary;
    }

    const currency = hasUsefulAccountCurrency(matchedStoreAccountInfo.currency)
        ? matchedStoreAccountInfo.currency
        : baseSummary.currency;

    return {
        balance: toFiniteNumber(matchedStoreAccountInfo.balance, baseSummary.balance),
        profit: toFiniteNumber(matchedStoreAccountInfo.profit, baseSummary.profit),
        equity: toFiniteNumber(matchedStoreAccountInfo.equity, baseSummary.equity),
        margin: toFiniteNumber(matchedStoreAccountInfo.margin, baseSummary.margin),
        freeMargin: toFiniteNumber(
            matchedStoreAccountInfo.marginFree,
            toFiniteNumber(matchedStoreAccountInfo.availableMargin, baseSummary.freeMargin),
        ),
        marginLevel: toFiniteNumber(matchedStoreAccountInfo.marginLevel, baseSummary.marginLevel),
        leverage: toFiniteNumber(matchedStoreAccountInfo.leverage, baseSummary.leverage),
        currency,
    };
}

function scheduleTerminalIdleTask(callback: () => void, delayMs = 0) {
    if (typeof window === 'undefined') {
        return undefined;
    }

    const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
    };
    let isCancelled = false;
    let frameId: number | null = null;
    let idleId: number | null = null;
    const timeoutId = window.setTimeout(() => {
        const runCallback = () => {
            if (isCancelled) {
                return;
            }

            callback();
        };

        if (idleWindow.requestIdleCallback) {
            idleId = idleWindow.requestIdleCallback(runCallback, { timeout: 2500 });
            return;
        }

        frameId = window.requestAnimationFrame(runCallback);
    }, delayMs);

    return () => {
        isCancelled = true;
        window.clearTimeout(timeoutId);
        if (idleId !== null) {
            idleWindow.cancelIdleCallback?.(idleId);
        }
        if (frameId !== null) {
            window.cancelAnimationFrame(frameId);
        }
    };
}

function isTerminalChartPerfDebugEnabled(): boolean {
    if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
        return false;
    }

    try {
        return new URLSearchParams(window.location.search).get('chartPerfDebug') === '1';
    } catch {
        return false;
    }
}

function markTerminalChartSwitchPerf(label: string, detail?: Record<string, unknown>) {
    if (!isTerminalChartPerfDebugEnabled() || typeof window === 'undefined' || !window.performance?.mark) {
        return;
    }

    const markName = `yopips:chart-switch:${label}`;
    try {
        window.performance.mark(markName, detail ? { detail } : undefined);
    } catch {
        window.performance.mark(markName);
    }
    console.debug('[ChartPerf]', label, detail ?? {});
}

function prewarmTerminalChartSwitchSeed(input: {
    accountSessionScopeId?: string | null;
    symbol: string;
    timeframeMinutes: number;
}) {
    const bars = ohlcService
        .getSyncBars(input.symbol, input.timeframeMinutes, input.accountSessionScopeId)
        .filter((bar) =>
            !isContinuityBar(bar) &&
            Number.isFinite(bar.time) &&
            Number.isFinite(bar.open) &&
            Number.isFinite(bar.high) &&
            Number.isFinite(bar.low) &&
            Number.isFinite(bar.close) &&
            bar.close > 0,
        );
    const seed = precomputeTerminalChartSwitchSeed({
        accountSessionScopeId: input.accountSessionScopeId,
        symbol: input.symbol,
        timeframeMinutes: input.timeframeMinutes,
        bars,
        limit: TERMINAL_CHART_SWITCH_SEED_LIMIT,
    });

    markTerminalChartSwitchPerf('prewarm-seed', {
        symbol: input.symbol,
        timeframeMinutes: input.timeframeMinutes,
        bars: seed?.bars.length ?? 0,
    });

    return seed;
}

function resolveOrderType(
    side: 'buy' | 'sell',
    orderType: 'market' | 'limit' | 'stop',
): WebtraderOrderType {
    if (orderType === 'limit') {
        return side === 'buy' ? 'buy_limit' : 'sell_limit';
    }

    if (orderType === 'stop') {
        return side === 'buy' ? 'buy_stop' : 'sell_stop';
    }

    return side;
}

function formatNetworkStatusAccountLabel(account: DashboardTradingAccount | null): string {
    if (!account) {
        return 'No account selected';
    }

    const accountName = account.name?.trim() ?? '';
    const accountNumber = account.accountNumber?.trim() ?? '';

    if (!accountNumber) {
        return accountName || 'No account selected';
    }

    const accountNameDigits = accountName.replace(/\D/g, '');
    const accountNumberDigits = accountNumber.replace(/\D/g, '');

    if (accountName && accountNumberDigits && accountNameDigits.includes(accountNumberDigits)) {
        return accountName;
    }

    return accountName ? `${accountName} #${accountNumber}` : `#${accountNumber}`;
}

function NetworkStatusMenu({
    status,
    error,
    activeAccount,
    wsClient,
}: {
    status: string;
    error?: string | null;
    activeAccount: DashboardTradingAccount | null;
    wsClient: WebSocketTradingClient | null;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [lastTradeRoundTripMs, setLastTradeRoundTripMs] = useState<number | null>(null);

    useEffect(() => {
        setLastTradeRoundTripMs(null);
        if (!wsClient) return;

        return wsClient.addStreamListener('trade.execution', (message) => {
            const payload = asTerminalRecord(message.payload);
            const clientTiming = asTerminalRecord(payload?.clientTiming);
            const roundTripMs = toFiniteNumber(clientTiming?.roundTripMs, Number.NaN);
            if (Number.isFinite(roundTripMs) && roundTripMs >= 0) {
                setLastTradeRoundTripMs(roundTripMs);
            }
        });
    }, [wsClient]);

    const isConnected = status === 'ready' || status === 'connected';
    const serverLabel =
        activeAccount?.credentials?.server?.trim() ||
        activeAccount?.serverIp?.trim() ||
        'No live server';
    const accountLabel = formatNetworkStatusAccountLabel(activeAccount);
    const statusLabel = status.replace(/_/g, ' ');
    const statusDotClass = isConnected
        ? 'bg-emerald-400'
        : status === 'error'
            ? 'bg-rose-400'
            : status === 'locked' || status === 'connecting' || status === 'reconnecting' || status === 'degraded'
                ? 'bg-amber-300'
                : 'bg-slate-400';

    return (
        <div className="relative flex items-center h-full">
            {isOpen && <div className="fixed inset-0 z-[299]" onClick={() => setIsOpen(false)} />}
            
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex flex-col items-center justify-center gap-[2px] px-2 py-0 rounded-sm hover:bg-accent/40 transition-colors ml-2 mr-1 group h-full"
            >
                <div className="flex items-end gap-[1.5px] h-[10px] mt-[3px]">
                    <div className={`w-[2px] h-[4px] rounded-none transition-colors ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
                    <div className={`w-[2px] h-[6px] rounded-none transition-colors ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
                    <div className={`w-[2px] h-[8px] rounded-none transition-colors ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`} />
                    <div className={`w-[2px] h-[10px] rounded-none transition-colors ${isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                </div>
                <span className={`text-[8px] leading-none font-mono font-bold mt-[2px] mb-[1px] transition-colors ${isConnected ? 'text-emerald-500' : 'text-muted-foreground/50'}`}>
                    {isConnected
                        ? lastTradeRoundTripMs === null ? 'LIVE' : `${Math.round(lastTradeRoundTripMs)}ms`
                        : '---'}
                </span>
            </button>

            {isOpen && (
                <div className="absolute bottom-full right-0 mb-1.5 w-[240px] bg-popover border border-border/80 shadow-[0_8px_30px_rgba(0,0,0,0.8)] rounded-md z-[300] py-1.5 text-sm flex flex-col font-sans backdrop-blur-xl">
                    <div className="px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Connection</p>
                        <p className="mt-1 text-[12px] font-semibold text-foreground capitalize">{statusLabel}</p>
                    </div>
                    <div className="h-px bg-border/60 my-1" />
                    <div className="px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Account</p>
                        <p className="mt-1 text-[12px] font-semibold text-foreground">
                            {accountLabel}
                        </p>
                    </div>
                    <div className="px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Server</p>
                        <p className="mt-1 break-all text-[12px] font-medium text-foreground">{serverLabel}</p>
                    </div>
                    <div className="px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Last trade RTT</p>
                        <p className={`mt-1 break-all text-[12px] font-medium ${isConnected ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                            {isConnected
                                ? lastTradeRoundTripMs === null ? 'Place a trade to measure' : `${Math.round(lastTradeRoundTripMs)} ms`
                                : 'Disconnected'}
                        </p>
                    </div>
                    {error ? (
                        <div className="px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300">Error</p>
                            <p className="mt-1 text-[12px] font-medium text-rose-300">{error}</p>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function TerminalChartLoadingShell() {
    return (
        <div
            className="flex h-full min-h-[320px] flex-col overflow-hidden bg-card"
            aria-label="Loading terminal chart"
        >
            <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-none bg-muted/60" />
                    <div className="h-4 w-24 rounded-none bg-muted/70" />
                    <div className="h-3 w-16 rounded-none bg-muted/50" />
                </div>
                <div className="hidden items-center gap-2 md:flex">
                    <div className="h-8 w-16 rounded-none border border-border bg-muted/40" />
                    <div className="h-8 w-16 rounded-none bg-primary/20" />
                </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
                <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(hsl(var(--border))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border))_1px,transparent_1px)] [background-size:64px_48px]" />
                <div className="absolute inset-x-8 top-1/2 h-px bg-primary/25" />
                <div className="absolute bottom-10 left-8 right-8 h-24">
                    <div className="h-full w-full rounded-none bg-gradient-to-t from-primary/10 to-transparent" />
                </div>
            </div>

            <div className="flex h-10 flex-shrink-0 items-center gap-2 border-t border-border px-3">
                {['1m', '5m', '15m', '1h', '1d'].map((label) => (
                    <div
                        key={label}
                        className="h-6 w-10 rounded-none bg-muted/50"
                        aria-hidden="true"
                    />
                ))}
            </div>
        </div>
    );
}

function TerminalOrderPanelLoadingShell() {
    return (
        <div className="flex h-full flex-col gap-4 px-4 py-5" aria-label="Loading trade ticket">
            <div className="grid grid-cols-2 gap-3">
                <div className="h-14 rounded-none border border-border bg-muted/30" />
                <div className="h-14 rounded-none bg-primary/15" />
            </div>
            <div className="space-y-3">
                <div className="h-9 rounded-none bg-muted/45" />
                <div className="h-9 rounded-none bg-muted/35" />
                <div className="h-9 rounded-none bg-muted/35" />
            </div>
            <div className="mt-auto h-10 rounded-none bg-muted/40" />
        </div>
    );
}

function TerminalPageLoadingShell() {
    return (
        <div className="flex h-[100dvh] w-full min-w-0 max-w-[100dvw] flex-col overflow-hidden bg-background p-0" aria-hidden="true">
            {/* Header Skeleton */}
            <div className="flex h-[60px] flex-shrink-0 items-center justify-between border-b border-border bg-card px-4">
                <div className="h-8 w-32 rounded-md bg-muted/40" />
                <div className="h-8 w-8 rounded-full bg-muted/40" />
            </div>

            {/* Main Content Area Skeleton */}
            <div className="relative flex min-w-0 flex-1 overflow-hidden">
                {/* Sidebar Skeleton (hidden on mobile) */}
                <div className="flex-shrink-0 w-[44px] h-full bg-card hidden md:flex flex-col items-center py-4 gap-4 border-r-[6px] border-border z-50 relative">
                    <div className="h-6 w-6 rounded-md bg-muted/30" />
                    <div className="h-6 w-6 rounded-md bg-muted/30" />
                    <div className="h-6 w-6 rounded-md bg-muted/30" />
                </div>

                {/* Chart Area Skeleton */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden relative">
                    <div className="flex min-w-0 flex-1 overflow-hidden">
                        <TerminalChartLoadingShell />
                    </div>
                </div>
            </div>
        </div>
    );
}

function TerminalLaunchLoadingOverlay({ error }: { error?: string | null }) {
    const hasError = Boolean(error);

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#0e0f11]"
            role={hasError ? 'alert' : 'status'}
            aria-label={hasError ? 'Terminal launch failed' : 'Opening terminal'}
        >
            <style>{`
                .terminal-launch-loading-dots {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    width: min(220px, 52vw);
                    height: 72px;
                }
                .terminal-launch-loading-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 999px;
                    background: #ffffff;
                    opacity: 0.28;
                    transform: translateY(0) scale(0.72);
                    animation: terminalLaunchDotWave 1.15s ease-in-out infinite;
                }
                .terminal-launch-loading-dot:nth-child(2) {
                    animation-delay: 0.12s;
                }
                .terminal-launch-loading-dot:nth-child(3) {
                    animation-delay: 0.24s;
                }
                .terminal-launch-loading-dot:nth-child(4) {
                    animation-delay: 0.36s;
                }
                .terminal-launch-loading-dot:nth-child(5) {
                    animation-delay: 0.48s;
                }
                @keyframes terminalLaunchDotWave {
                    0%, 72%, 100% {
                        opacity: 0.28;
                        transform: translateY(0) scale(0.72);
                    }
                    28% {
                        opacity: 1;
                        transform: translateY(-2px) scale(1.45);
                    }
                }
            `}</style>

            {hasError ? (
                <div className="mx-6 flex max-w-[420px] flex-col items-center text-center">
                    <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
                        <X className="h-6 w-6 text-destructive" strokeWidth={2.5} />
                    </div>
                    <p className="text-[17px] font-bold tracking-tight text-white">Terminal Connection Error</p>
                    <p className="mt-3 text-[14px] leading-relaxed text-white/70">
                        {error || 'The terminal connection failed to establish.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-8 rounded-[8px] bg-white px-6 py-2.5 text-[13px] font-bold tracking-wide text-[#0e0f11] shadow-sm transition-all hover:scale-[1.02] hover:bg-white/90 active:scale-[0.98]"
                    >
                        Reload Terminal
                    </button>
                </div>
            ) : (
                <div className="terminal-launch-loading-dots" aria-hidden="true">
                    <span className="terminal-launch-loading-dot" />
                    <span className="terminal-launch-loading-dot" />
                    <span className="terminal-launch-loading-dot" />
                    <span className="terminal-launch-loading-dot" />
                    <span className="terminal-launch-loading-dot" />
                </div>
            )}
        </div>
    );
}


function TerminalOhlcHistoryDebugPanel({
    isAvailable,
    isOpen,
    isPersistent,
    snapshot,
    selectedSymbol,
    timeframeMinutes,
    onToggleOpen,
    onTogglePersistent,
}: {
    isAvailable: boolean;
    isOpen: boolean;
    isPersistent: boolean;
    snapshot: OhlcHistoryDiagnosticsSnapshot | null;
    selectedSymbol: string | null;
    timeframeMinutes: number | null;
    onToggleOpen: () => void;
    onTogglePersistent: () => void;
}) {
    if (!isAvailable) {
        return null;
    }

    const rows = [
        ['symbol', formatHistoryDiagnosticValue(snapshot?.symbol ?? selectedSymbol)],
        ['requestedSym', formatHistoryDiagnosticValue(snapshot?.requestedSymbol)],
        ['timeframe', formatHistoryDiagnosticValue(timeframeMinutes)],
        ['session', formatHistoryDiagnosticValue(snapshot?.sessionId)],
        ['requestType', formatHistoryDiagnosticValue(snapshot?.requestType)],
        ['requested', formatHistoryDiagnosticValue(snapshot?.requestedLimit)],
        ['returned', formatHistoryDiagnosticValue(snapshot?.returnedBarCount)],
        ['real', formatHistoryDiagnosticValue(snapshot?.realBarCount)],
        ['status', formatHistoryDiagnosticValue(snapshot?.status)],
        ['source', formatHistoryDiagnosticValue(snapshot?.source)],
        ['cacheOnly', formatHistoryDiagnosticBoolean(snapshot?.cacheOnly)],
        ['before', formatHistoryDiagnosticValue(snapshot?.before)],
        ['nextBefore', formatHistoryDiagnosticValue(snapshot?.nextBefore)],
        ['hasMore', formatHistoryDiagnosticBoolean(snapshot?.hasMore)],
        ['broker', formatHistoryDiagnosticValue(snapshot?.brokerSymbol)],
        ['attempted', formatHistoryDiagnosticValue(snapshot?.attemptedBrokerSymbol)],
        ['resolved', formatHistoryDiagnosticValue(snapshot?.resolvedBrokerSymbol)],
        ['message', formatHistoryDiagnosticValue(snapshot?.message)],
        ['candidates', formatHistoryDiagnosticList(snapshot?.brokerSymbolCandidates)],
        ['sparse', formatHistoryDiagnosticBoolean(snapshot?.historySparse)],
        ['gapped', formatHistoryDiagnosticBoolean(snapshot?.historyGapped)],
        ['stale', formatHistoryDiagnosticBoolean(snapshot?.historyStale)],
        ['mgrDeferred', formatHistoryDiagnosticBoolean(snapshot?.managerFetchDeferred)],
        ['mgrSuccess', formatHistoryDiagnosticBoolean(snapshot?.managerFetchSucceeded)],
        ['fromUnixMs', formatHistoryDiagnosticValue(snapshot?.fromUnixMs)],
        ['toUnixMs', formatHistoryDiagnosticValue(snapshot?.toUnixMs)],
        ['updated', formatHistoryDiagnosticUpdateTime(snapshot?.updatedAtMs)],
    ] as const;

    return (
        <div className="pointer-events-none fixed bottom-[38px] right-3 z-[360] flex max-w-[92vw] flex-col items-end gap-2">
            <button
                type="button"
                onClick={onToggleOpen}
                className="pointer-events-auto rounded-sm border border-border/70 bg-card/95 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground shadow-[0_10px_24px_rgba(0,0,0,0.45)] transition-colors hover:text-foreground"
            >
                {isOpen ? 'OHLC dbg on' : 'OHLC dbg'}
            </button>

            {isOpen ? (
                <div className="pointer-events-auto w-[min(92vw,360px)] overflow-hidden rounded-md border border-border/80 bg-background/95 shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur">
                    <div className="flex items-center justify-between border-b border-border/80 px-3 py-2">
                        <div className="min-w-0">
                            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                OHLC history
                            </p>
                            <p className="truncate font-mono text-[11px] text-foreground">
                                {selectedSymbol || 'No active symbol'}
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={onTogglePersistent}
                                className="rounded-sm border border-border/70 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {isPersistent ? 'persist:on' : 'persist:off'}
                            </button>
                            <button
                                type="button"
                                onClick={onToggleOpen}
                                className="rounded-sm border border-border/70 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                            >
                                hide
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-[92px,1fr] gap-x-3 gap-y-1 px-3 py-2 font-mono text-[10px] leading-4">
                        {rows.map(([label, value]) => (
                            <div key={label} className="contents">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="break-words text-foreground">{value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function TradingDashboardInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountIdFromUrl = searchParams.get('accountId');
    const { theme: currentTheme, setTheme } = useTheme();
    const { user, isLoading: isAuthLoading } = useAuth();
    const historyDebugQueryEnabled = useMemo(
        () => TERMINAL_OHLC_HISTORY_DEBUG_QUERY_FLAGS.some((flag) => {
            if (!searchParams.has(flag)) {
                return false;
            }

            return isTruthyTerminalDebugFlag(searchParams.get(flag));
        }),
        [searchParams],
    );
    const historyConsoleDebugQueryEnabled = useMemo(
        () => TERMINAL_OHLC_HISTORY_CONSOLE_DEBUG_QUERY_FLAGS.some((flag) => {
            if (!searchParams.has(flag)) {
                return false;
            }

            return isTruthyTerminalDebugFlag(searchParams.get(flag));
        }),
        [searchParams],
    );
    const isTerminalBootDebugEnabled = useMemo(() => {
        const enabledByQuery = TERMINAL_BOOT_DEBUG_QUERY_FLAGS.some((flag) => {
            if (!searchParams.has(flag)) {
                return false;
            }

            return isTruthyTerminalDebugFlag(searchParams.get(flag));
        });

        if (enabledByQuery || isTruthyTerminalDebugFlag(process.env.NEXT_PUBLIC_TERMINAL_BOOT_DEBUG)) {
            return true;
        }

        if (typeof window === 'undefined') {
            return false;
        }

        return isTruthyTerminalDebugFlag(window.localStorage.getItem(TERMINAL_BOOT_DEBUG_STORAGE_KEY));
    }, [searchParams]);
    const terminalBootStartedAtRef = useRef(Date.now());
    const terminalBootMilestonesRef = useRef<Set<string>>(new Set());
    const markTerminalBootMilestone = useCallback((key: string, details?: Record<string, unknown>) => {
        if (!isTerminalBootDebugEnabled || terminalBootMilestonesRef.current.has(key)) {
            return;
        }

        terminalBootMilestonesRef.current.add(key);
        console.info('[Terminal boot]', {
            milestone: key,
            elapsedMs: Date.now() - terminalBootStartedAtRef.current,
            ...(details ?? {}),
        });
    }, [isTerminalBootDebugEnabled]);

    const hydrateFromSnapshot = useTradingStore((state) => state.hydrateFromSnapshot);
    const tradingAccounts = useTradingStore((state) => state.tradingAccounts);

    const storeSymbols = useWebtraderStore(state => state.symbols);
    const storeSession = useWebtraderStore(state => state.session);
    const storeAccountInfo = useWebtraderStore(state => state.accountInfo);
    const storePositions = useWebtraderStore(state => state.positions);
    const storeOrders = useWebtraderStore(state => state.orders);
    const storeConnectionStatus = useWebtraderStore(state => state.connectionStatus);
    const storeConnectionError = useWebtraderStore(state => state.connectionError);
    const storeWsClient = useWebtraderStore(state => state.wsClient);
    const storeMarketWsClient = useWebtraderStore(state => state.marketWsClient);
    const storeOhlcWsClient = useWebtraderStore(state => state.ohlcWsClient);
    const storeSymbolCount = useWebtraderStore((state) => state.symbols.length);
    const livePriceUniverse = useLivePriceUniverse();
    const storePriceCount = livePriceUniverse.count;
    const livePriceSymbolKey = livePriceUniverse.symbolKey;
    const hasStoreAccountInfo = useWebtraderStore((state) => Boolean(state.accountInfo));
    const storePositionCount = useWebtraderStore((state) => state.positions.length);
    const setStoreAccountInfo = useWebtraderStore(state => state.setAccountInfo);
    const setStoreConnectionError = useWebtraderStore(state => state.setConnectionError);
    const setStorePositions = useWebtraderStore(state => state.setPositions);
    const setStoreOrders = useWebtraderStore(state => state.setOrders);
    const setStoreSymbols = useWebtraderStore(state => state.setSymbols);
    const setStoreIsLoadingSymbols = useWebtraderStore(state => state.setIsLoadingSymbols);
    const terminalLaunchSession = useTerminalLaunchSession();
    const [isOhlcHistoryDebugPersistent, setIsOhlcHistoryDebugPersistent] = useState(false);
    const [isOhlcHistoryConsoleDebugPersistent, setIsOhlcHistoryConsoleDebugPersistent] = useState(false);
    const [isOhlcHistoryDebugPanelOpen, setIsOhlcHistoryDebugPanelOpen] = useState(false);
    const [selectedHistoryDiagnostics, setSelectedHistoryDiagnostics] =
        useState<OhlcHistoryDiagnosticsSnapshot | null>(null);
    const [lastTerminalAccountId, setLastTerminalAccountId] = useState<string | null>(
        () => readLastTerminalAccountId(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY),
    );
    const [isLastTerminalAccountLoaded, setIsLastTerminalAccountLoaded] = useState(
        () => Boolean(readLastTerminalAccountId(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY)),
    );
    const [lastTerminalAccountLoadedKey, setLastTerminalAccountLoadedKey] = useState<string | null>(
        () => (
            readLastTerminalAccountId(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY)
                ? TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY
                : null
        ),
    );
    const [terminalLaunchAccountHint, setTerminalLaunchAccountHint] = useState<DashboardTradingAccount | null>(
        () => readTerminalLaunchAccountHint(accountIdFromUrl),
    );
    const lastTerminalAccountStorageKey = useMemo(
        () => getTerminalLastAccountStorageKey(user?.id),
        [user?.id],
    );
    const isLastTerminalAccountReady =
        isLastTerminalAccountLoaded &&
        (
            lastTerminalAccountLoadedKey === lastTerminalAccountStorageKey ||
            lastTerminalAccountLoadedKey === TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY
        );

    const normalizeAccountLookup = useCallback((value: string | null | undefined): string => {
        const trimmed = value?.trim() ?? '';
        return trimmed.replace(/^mt5-/i, '');
    }, []);

    const findTradingAccountByLookup = useCallback((accountId: string | null | undefined) => {
        if (!accountId?.trim()) {
            return null;
        }

        const normalizedAccountId = normalizeAccountLookup(accountId);
        const requestedIsMt5SessionId = /^mt5-/i.test(accountId.trim());

        const isRestorableMt5 = (account: DashboardTradingAccount) =>
            (account.platform === 'mt5' || !account.platform) && account.status !== 'Archived';

        const matchesLookup = (account: DashboardTradingAccount) => {
            const normalizedId = normalizeAccountLookup(account.id);
            const normalizedAccountNumber = normalizeAccountLookup(account.accountNumber);
            const normalizedCredentialsLogin = normalizeAccountLookup(account.credentials?.login);
            return (
                account.id === accountId ||
                account.accountNumber === accountId ||
                normalizedId === normalizedAccountId ||
                normalizedAccountNumber === normalizedAccountId ||
                normalizedCredentialsLogin === normalizedAccountId
            );
        };

        if (requestedIsMt5SessionId) {
            const mt5Match = tradingAccounts.find((account) => isRestorableMt5(account) && matchesLookup(account));
            if (mt5Match) return mt5Match;
        }

        const storeMatch = tradingAccounts.find(matchesLookup);
        if (storeMatch) {
            return storeMatch;
        }

        if (terminalLaunchAccountHint && matchesLookup(terminalLaunchAccountHint)) {
            return terminalLaunchAccountHint;
        }

        return null;
    }, [normalizeAccountLookup, terminalLaunchAccountHint, tradingAccounts]);

    const getTerminalSessionAccountId = useCallback((account: DashboardTradingAccount): string => {
        const login = normalizeAccountLookup(account.accountNumber || account.credentials?.login);
        if (/^\d+$/.test(login)) {
            return `mt5-${login}`;
        }

        return account.id;
    }, [normalizeAccountLookup]);
    const normalizeTerminalSessionAccountId = useCallback((value: string | null | undefined): string | null => {
        const trimmed = value?.trim() ?? '';
        if (!trimmed) {
            return null;
        }

        const normalizedLogin = normalizeAccountLookup(trimmed);
        if (/^\d+$/.test(normalizedLogin)) {
            return `mt5-${normalizedLogin}`;
        }

        // Account DB ids can still be resolved by the terminal-session API once
        // the backend snapshot is available. Keep only URL/path-safe values here.
        return /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : null;
    }, [normalizeAccountLookup]);

    const defaultMt5Account = useMemo<DashboardTradingAccount | null>(() => {
        const activeMt5Accounts = tradingAccounts.filter(
            (account) => (account.platform === 'mt5' || !account.platform) && account.status !== 'Archived',
        );

        if (activeMt5Accounts.length > 0) {
            return [...activeMt5Accounts].sort((left, right) => {
                const createdAtDelta = getTerminalAccountCreatedAtMs(right) - getTerminalAccountCreatedAtMs(left);
                if (createdAtDelta !== 0) {
                    return createdAtDelta;
                }

                const rightLogin = Number.parseInt(normalizeAccountLookup(right.accountNumber || right.credentials?.login || right.id), 10);
                const leftLogin = Number.parseInt(normalizeAccountLookup(left.accountNumber || left.credentials?.login || left.id), 10);
                if (Number.isFinite(rightLogin) && Number.isFinite(leftLogin) && rightLogin !== leftLogin) {
                    return rightLogin - leftLogin;
                }

                return right.id.localeCompare(left.id);
            })[0];
        }

        const anyMt5Account = tradingAccounts.find((account) => account.platform === 'mt5' || !account.platform);
        return anyMt5Account ?? tradingAccounts[0] ?? null;
    }, [normalizeAccountLookup, tradingAccounts]);

    useEffect(() => {
        const rememberedAccountId = readLastTerminalAccountId(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY);
        if (rememberedAccountId?.trim()) {
            setLastTerminalAccountId(rememberedAccountId.trim());
        }
        setLastTerminalAccountLoadedKey(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY);
        setIsLastTerminalAccountLoaded(true);
    }, []);

    useEffect(() => {
        setTerminalLaunchAccountHint(readTerminalLaunchAccountHint(accountIdFromUrl));
    }, [accountIdFromUrl]);

    useEffect(() => {
        if (isAuthLoading) {
            return;
        }

        const scopedAccountId = readLastTerminalAccountId(lastTerminalAccountStorageKey);
        const rememberedAccountId = readFirstLastTerminalAccountId(
            lastTerminalAccountStorageKey,
            TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY,
        );

        setLastTerminalAccountId(rememberedAccountId);
        setLastTerminalAccountLoadedKey(
            scopedAccountId?.trim()
                ? lastTerminalAccountStorageKey
                : TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY,
        );
        setIsLastTerminalAccountLoaded(true);
    }, [isAuthLoading, lastTerminalAccountStorageKey]);

    const activeTradingAccount = useMemo<DashboardTradingAccount | null>(() => {
        if (terminalLaunchSession.account) {
            return terminalLaunchSession.account;
        }

        if (accountIdFromUrl) {
            return findTradingAccountByLookup(accountIdFromUrl);
        }

        if (tradingAccounts.length === 0) {
            return isRestorableTerminalAccount(terminalLaunchAccountHint)
                ? terminalLaunchAccountHint
                : null;
        }

        if (!isLastTerminalAccountReady) {
            return null;
        }

        const lastAccount = findTradingAccountByLookup(lastTerminalAccountId);
        if (isRestorableTerminalAccount(lastAccount)) {
            return lastAccount;
        }

        return defaultMt5Account;
    }, [
        accountIdFromUrl,
        defaultMt5Account,
        findTradingAccountByLookup,
        isLastTerminalAccountReady,
        lastTerminalAccountId,
        terminalLaunchAccountHint,
        terminalLaunchSession.account,
        tradingAccounts.length,
    ]);

    const activeAccountId = activeTradingAccount?.id ?? '';
    const connectAccountId =
        terminalLaunchSession.accountId ??
        (activeTradingAccount &&
        (activeTradingAccount.platform === 'mt5' || !activeTradingAccount.platform) &&
        activeTradingAccount.status !== 'Archived'
            ? getTerminalSessionAccountId(activeTradingAccount)
            : null) ??
        (!terminalLaunchSession.isActive
            ? normalizeTerminalSessionAccountId(accountIdFromUrl) ??
                (isLastTerminalAccountReady
                    ? normalizeTerminalSessionAccountId(lastTerminalAccountId)
                    : null)
            : null);
    const persistLastTerminalAccount = useCallback((account: DashboardTradingAccount | null | undefined) => {
        if (!account || !isRestorableTerminalAccount(account)) {
            return;
        }

        const terminalAccountId = getTerminalSessionAccountId(account);
        writeLastTerminalAccountId(lastTerminalAccountStorageKey, terminalAccountId);
        writeLastTerminalAccountId(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY, terminalAccountId);
        setLastTerminalAccountId(terminalAccountId);
        setLastTerminalAccountLoadedKey(lastTerminalAccountStorageKey);
        setIsLastTerminalAccountLoaded(true);
    }, [getTerminalSessionAccountId, lastTerminalAccountStorageKey]);

    useEffect(() => {
        if (terminalLaunchSession.isActive) {
            return;
        }

        persistLastTerminalAccount(activeTradingAccount);
    }, [activeTradingAccount, persistLastTerminalAccount, terminalLaunchSession.isActive]);

    useEffect(() => {
        if (terminalLaunchSession.isActive || !connectAccountId) {
            return;
        }

        writeLastTerminalAccountId(lastTerminalAccountStorageKey, connectAccountId);
        writeLastTerminalAccountId(TERMINAL_LAST_ACCOUNT_GLOBAL_STORAGE_KEY, connectAccountId);
    }, [connectAccountId, lastTerminalAccountStorageKey, terminalLaunchSession.isActive]);

    useEffect(() => {
        if (terminalLaunchSession.isActive) {
            return;
        }

        if (!accountIdFromUrl || !connectAccountId) {
            return;
        }

        if (normalizeAccountLookup(accountIdFromUrl) === normalizeAccountLookup(connectAccountId)) {
            return;
        }

        router.replace(`/terminal?accountId=${encodeURIComponent(connectAccountId)}`);
    }, [accountIdFromUrl, connectAccountId, normalizeAccountLookup, router, terminalLaunchSession.isActive]);

    const {
        status: legacyConnectStatus,
        error: legacyConnectError,
    } = useAutoConnectTrading(terminalLaunchSession.isActive ? null : connectAccountId);
    const connectStatus = terminalLaunchSession.isActive
        ? terminalLaunchSession.status
        : legacyConnectStatus;
    const connectError = terminalLaunchSession.isActive
        ? terminalLaunchSession.error
        : legacyConnectError;
    const shouldUseTerminalRestPositions = !terminalLaunchSession.isActive;
    const accountSessionScopeId = useMemo(
        () => (
            connectAccountId && storeSession
                ? buildOhlcSessionScopeId(connectAccountId, storeSession)
                : null
        ),
        [connectAccountId, storeSession],
    );

    const terminalConnectionStatus = useMemo(() => {
        const storeClientAuthenticated = Boolean(
            storeWsClient?.isConnected && storeWsClient.isAuthenticated,
        );
        const hasLiveOrCachedTerminalData =
            storeSymbolCount > 0 ||
            storePriceCount > 0 ||
            hasStoreAccountInfo ||
            storePositionCount > 0;

        if (connectStatus === 'locked') {
            return 'locked';
        }

        if (connectStatus === 'error') {
            return 'error';
        }

        if (storeConnectionStatus === 'error') {
            return 'error';
        }

        if (
            (storeConnectionStatus === 'connected' || storeClientAuthenticated) &&
            hasLiveOrCachedTerminalData
        ) {
            return 'ready';
        }

        if (connectStatus === 'degraded') {
            return 'ready';
        }

        if (
            connectStatus === 'ready' ||
            connectStatus === 'connected'
        ) {
            return 'ready';
        }

        if (
            connectStatus === 'authenticating' ||
            connectStatus === 'connecting'
        ) {
            return 'connecting';
        }

        if (connectStatus === 'reconnecting' || storeConnectionStatus === 'reconnecting') {
            return 'reconnecting';
        }

        if (connectAccountId) {
            return 'connecting';
        }

        return 'disconnected';
    }, [
        connectAccountId,
        connectStatus,
        storeConnectionStatus,
        hasStoreAccountInfo,
        storePositionCount,
        storePriceCount,
        storeSymbolCount,
        storeWsClient,
    ]);

    const activeGroupSymbolsState = useGroupActiveSymbols(connectAccountId, {
        disabled: terminalLaunchSession.isActive || !connectAccountId || terminalConnectionStatus !== 'ready',
    });
    const activeGroupDisplaySymbols = useMemo(
        () => getTerminalDisplaySymbols(activeGroupSymbolsState.symbols),
        [activeGroupSymbolsState.symbols],
    );
    const activeGroupCatalogSettled = activeGroupSymbolsState.hasLoaded && !activeGroupSymbolsState.isLoading;
    const priceHistoryCache = useRef<Record<string, number[]>>({});
    const connectionToastKeyRef = useRef<string | null>(null);
    const connectionErrorKeyRef = useRef<string | null>(null);
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [selectedSymbolAccountId, setSelectedSymbolAccountId] = useState<string | null>(null);
    const [openTabs, setOpenTabs] = useState<string[]>([]);
    const [chartKeepAliveSymbols, setChartKeepAliveSymbols] = useState<string[]>([]);

    const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);
    const [visibleMarketSearchSymbols, setVisibleMarketSearchSymbols] = useState<string[]>([]);
    const [terminalPreferences, setTerminalPreferences] = useState<TerminalPreferences | null>(null);
    const [terminalPreferencesLoaded, setTerminalPreferencesLoaded] = useState(false);
    const [chartTimeframeMinutes, setChartTimeframeMinutes] = useState(TERMINAL_DEFAULT_TIMEFRAME_MINUTES);
    const [chartType, setChartType] = useState<TerminalChartType>('Candles');
    const [chartLayoutPanes, setChartLayoutPanes] = useState<TerminalChartLayoutPanes>(1);
    const [chartBarSpacing, setChartBarSpacing] = useState<number | null>(null);

    const terminalStoreFallbackSymbols = useMemo(
        () => getTerminalFallbackSymbolInfos(terminalPreferences ?? undefined),
        [terminalPreferences],
    );
    const currentIsFallback = storeSymbols.length > 0 &&
        storeSymbols.every((s) => terminalStoreFallbackSymbols.some((f) => f.name === s.name));
    const hasInitializedTerminalSymbolsRef = useRef(false);
    const initializedTerminalStateKeyRef = useRef<string | null>(null);
    const persistedTerminalStateKeyRef = useRef<string | null>(null);
    const terminalPreferencesPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const terminalBootstrapQuotePrewarmKeyRef = useRef<string | null>(null);
    const terminalBootstrapHistoryPrewarmKeyRef = useRef<string | null>(null);
    const watchlistOhlcPrewarmKeyRef = useRef<string | null>(null);
    const symbolHoverHistoryPrewarmTimeoutRef = useRef<number | null>(null);
    const lastHoveredHistoryPrewarmKeyRef = useRef<string | null>(null);
    const selectedSymbolMarketPrimeCancelRef = useRef<(() => void) | undefined>(undefined);
    const latestStorePricesRef = useRef(useWebtraderStore.getState().prices);
    const latestStoreSymbolsRef = useRef(storeSymbols);
    const requestedOhlcHistoryRef = useRef<Map<string, number>>(new Map());
    const requestedOhlcRepairRef = useRef<Map<string, {
        lastAt: number;
        failures: number;
        retryAfterUntil?: number;
    }>>(new Map());
    const ohlcHistoryWarmupRetryTimeoutsRef = useRef<Set<number>>(new Set());
    const selectedOhlcHistoryBackfillTimerRef = useRef<{
        key: string;
        timeoutId: number;
    } | null>(null);
    const symbolCatalogRefreshInFlightRef = useRef(false);
    const hasAnyLiveQuote = livePriceSymbolKey.length > 0;
    const clearOhlcWarmupTimers = useCallback(() => {
        if (symbolHoverHistoryPrewarmTimeoutRef.current !== null) {
            window.clearTimeout(symbolHoverHistoryPrewarmTimeoutRef.current);
            symbolHoverHistoryPrewarmTimeoutRef.current = null;
        }
        selectedSymbolMarketPrimeCancelRef.current?.();
        selectedSymbolMarketPrimeCancelRef.current = undefined;
        ohlcHistoryWarmupRetryTimeoutsRef.current.forEach((timeoutId) => {
            window.clearTimeout(timeoutId);
        });
        ohlcHistoryWarmupRetryTimeoutsRef.current.clear();
    }, []);
    useEffect(() => {
        markTerminalBootMilestone('mounted', {
            accountIdFromUrl: accountIdFromUrl ?? null,
            hasRememberedAccount: Boolean(lastTerminalAccountId),
        });
    }, [accountIdFromUrl, lastTerminalAccountId, markTerminalBootMilestone]);
    useEffect(() => {
        if (!isAuthLoading) {
            markTerminalBootMilestone('auth-ready', {
                hasUser: Boolean(user),
                userScopedLastAccountKey: Boolean(lastTerminalAccountStorageKey),
            });
        }
    }, [isAuthLoading, lastTerminalAccountStorageKey, markTerminalBootMilestone, user]);
    useEffect(() => {
        if (isLastTerminalAccountReady) {
            markTerminalBootMilestone('last-account-ready', {
                accountId: lastTerminalAccountId ?? null,
                source: lastTerminalAccountLoadedKey,
            });
        }
    }, [
        isLastTerminalAccountReady,
        lastTerminalAccountId,
        lastTerminalAccountLoadedKey,
        markTerminalBootMilestone,
    ]);
    useEffect(() => {
        if (connectAccountId) {
            markTerminalBootMilestone('connect-account-ready', {
                accountId: connectAccountId,
                hasHydratedAccount: Boolean(activeTradingAccount),
            });
        }
    }, [activeTradingAccount, connectAccountId, markTerminalBootMilestone]);
    useEffect(() => {
        markTerminalBootMilestone(`terminal-status:${terminalConnectionStatus}`, {
            connectStatus,
            storeConnectionStatus,
            storeSymbolCount,
            storePriceCount,
            storePositionCount,
        });
    }, [
        connectStatus,
        markTerminalBootMilestone,
        storeConnectionStatus,
        storePositionCount,
        storePriceCount,
        storeSymbolCount,
        terminalConnectionStatus,
    ]);
    useEffect(() => {
        if (storeSymbolCount > 0) {
            markTerminalBootMilestone('symbols-ready', {
                count: storeSymbolCount,
            });
        }
    }, [markTerminalBootMilestone, storeSymbolCount]);
    useEffect(() => {
        if (hasAnyLiveQuote) {
            markTerminalBootMilestone('quotes-ready', {
                count: storePriceCount,
            });
        }
    }, [hasAnyLiveQuote, markTerminalBootMilestone, storePriceCount]);
    useEffect(() => {
        if (storePositionCount > 0) {
            markTerminalBootMilestone('positions-ready', {
                count: storePositionCount,
            });
        }
    }, [markTerminalBootMilestone, storePositionCount]);
    latestStorePricesRef.current = useWebtraderStore.getState().prices;
    const selectedBrokerSymbol = useMemo(
        () => resolveExactSymbolName(
            storeSymbols,
            latestStorePricesRef.current,
            selectedSymbol,
        ),
        [livePriceSymbolKey, selectedSymbol, storeSymbols],
    );
    const renderedChartKeepAliveSymbols = useMemo(
        () => reconcileTerminalChartKeepAliveSymbols(
            chartKeepAliveSymbols,
            openTabs,
            selectedBrokerSymbol,
        ),
        [chartKeepAliveSymbols, openTabs, selectedBrokerSymbol],
    );
    useEffect(() => {
        if (!selectedBrokerSymbol && openTabs.length === 0) {
            setChartKeepAliveSymbols((current) => current.length === 0 ? current : []);
            return;
        }

        setChartKeepAliveSymbols((current) => {
            const next = reconcileTerminalChartKeepAliveSymbols(current, openTabs, selectedBrokerSymbol);
            return areSymbolListsEqual(current, next) ? current : next;
        });
    }, [openTabs, selectedBrokerSymbol]);
    useEffect(() => {
        const unsubscribe = useWebtraderStore.subscribe((state, previousState) => {
            if (state.prices !== previousState.prices) {
                latestStorePricesRef.current = state.prices;
            }
        });

        return unsubscribe;
    }, []);
    useEffect(() => {
        latestStoreSymbolsRef.current = storeSymbols;
    }, [storeSymbols]);
    const storeSymbolCatalogKey = useMemo(
        () => getSymbolListKey(storeSymbols.map((symbol) => symbol.name)),
        [storeSymbols],
    );
    const marketSubscriptionExtraSymbols = useMemo(
        () => uniqueTerminalSymbols([
            ...DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS,
            ...(visibleMarketSearchSymbols.length > 0 ? visibleMarketSearchSymbols : []),
        ]),
        [visibleMarketSearchSymbols],
    );
    const visibleMarketSymbols = useMemo(
        () => uniqueTerminalSymbols(marketSubscriptionExtraSymbols),
        [marketSubscriptionExtraSymbols],
    );
    const openPositionSubscriptionSymbols = useMemo(
        () => resolveQuoteSubscriptionSymbolList(
            storeSymbols,
            uniqueTerminalSymbols(storePositions.map((position) => position.symbol)),
            latestStorePricesRef.current,
            { allowInputFallback: true },
        ),
        [livePriceSymbolKey, storePositions, storeSymbols],
    );
    const catalogMarketSymbols = useMemo(
        () => getMarketWatchSymbols(storeSymbols, latestStorePricesRef.current, selectedBrokerSymbol),
        [livePriceSymbolKey, selectedBrokerSymbol, storeSymbols],
    );
    const marketWatchSymbols = useMemo(
        () => {
            const latestPrices = latestStorePricesRef.current;
            const sourceSymbols = watchlistSymbols.length > 0
                ? watchlistSymbols
                : resolveDefaultTerminalSymbols(storeSymbols, latestPrices);
            const selectedSourceSymbols = selectedBrokerSymbol
                ? appendUniqueTerminalSymbol(sourceSymbols, selectedBrokerSymbol)
                : sourceSymbols;
            const resolvedWatchlist = resolveCatalogSymbolList(
                storeSymbols,
                selectedSourceSymbols,
                latestPrices,
                { preserveExact: true },
            );

            return resolvedWatchlist
                .map((symbol) => resolveCatalogSymbolInfo(
                    storeSymbols,
                    symbol,
                    latestPrices,
                    { preserveExact: true },
                ))
                .filter((symbol): symbol is SymbolInfo => symbol !== null);
        },
        [livePriceSymbolKey, selectedBrokerSymbol, storeSymbols, watchlistSymbols],
    );
    const liveSubscriptionSymbols = useMemo(
        () => getCappedMarketSubscriptionSymbols(
            storeSymbols,
            '',
            visibleMarketSymbols,
            latestStorePricesRef.current,
            { allowInputFallback: true },
        ),
        [livePriceSymbolKey, storeSymbols, visibleMarketSymbols],
    );
    const selectedSubscriptionSymbols = useMemo(
        () => {
            // Priority/cap policy: the selected chart symbol gets its own lane.
            const prioritizedSymbols = uniqueTerminalSymbols([
                selectedBrokerSymbol,
            ]).slice(0, SELECTED_QUOTE_SUBSCRIPTION_LIMIT);

            return resolveQuoteSubscriptionSymbolList(
                storeSymbols,
                prioritizedSymbols,
                latestStorePricesRef.current,
                {
                    allowInputFallback: true,
                    limit: SELECTED_QUOTE_SUBSCRIPTION_LIMIT,
                },
            );
        },
        [livePriceSymbolKey, selectedBrokerSymbol, storeSymbols],
    );
    const quoteWsClient = getPreferredQuoteWsClient(storeMarketWsClient, storeWsClient);
    const isRealtimeClientReady = isReadyRealtimeClient(storeWsClient);
    const isQuoteClientReady = isReadyRealtimeClient(quoteWsClient);
    const isOhlcHistoryClientReady =
        isReadyOhlcHistoryClient(storeOhlcWsClient) ||
        isReadyOhlcHistoryClient(storeWsClient);
    const marketQuoteSubscriptionsRef = useRef<{
        client: typeof quoteWsClient;
        symbols: string[];
    } | null>(null);
    const selectedQuoteSubscriptionsRef = useRef<{
        client: typeof quoteWsClient;
        symbols: string[];
    } | null>(null);

    const createTerminalInstrument = useCallback((
        s: SymbolInfo,
        immediateLivePrice?: ReturnType<typeof getLivePriceSnapshotBySymbol>,
    ): TerminalInstrument => {
            const livePrice =
                immediateLivePrice ??
                getSafeLiveQuoteSnapshotBySymbol(
                    s.name,
                    getLivePriceSnapshotBySymbol,
                    latestStorePricesRef.current,
                );
            const liveBid = livePrice?.bid ?? 0;
            const liveAsk = livePrice?.ask ?? 0;
            const liveLast = livePrice?.last ?? 0;
            const hasAnyBidAsk = liveBid > 0 || liveAsk > 0;
            const hasExecutableBidAsk = liveBid > 0 && liveAsk > 0;
            const hasLivePrice = Boolean(livePrice && (liveBid > 0 || liveAsk > 0 || liveLast > 0));
            const price = hasLivePrice ? livePrice : undefined;
            const quoteSource: TerminalInstrument['quoteSource'] = hasLivePrice ? 'live' : 'none';
            const bid = liveBid > 0 ? liveBid : (!hasAnyBidAsk && liveLast > 0 ? liveLast : 0);
            const ask = liveAsk > 0 ? liveAsk : (!hasAnyBidAsk && liveLast > 0 ? liveLast : 0);
            const spread = price?.spread ?? (bid > 0 && ask > 0 ? Math.abs(ask - bid) : 0);
            
            if (!priceHistoryCache.current[s.name]) {
                priceHistoryCache.current[s.name] = [];
            }

            const change = 0;
            const changePercent = 0;
            
            return {
                symbol: s.name,
                name: s.description || s.name,
                category: (s.category || 'forex').toLowerCase(),
                bid,
                ask,
                change,
                changePercent,
                high: bid,
                low: bid,
                spread,
                digits: s.digits,
                pipSize: Math.pow(10, -s.digits),
                contractSize: s.tradeContractSize || 100000,
                isUp: hasLivePrice && livePrice?.bidDirection === 'up',
                isDown: hasLivePrice && livePrice?.bidDirection === 'down',
                bidDirection: hasLivePrice ? livePrice?.bidDirection ?? 'same' : 'same',
                askDirection: hasLivePrice ? livePrice?.askDirection ?? 'same' : 'same',
                icon: s.name.includes('XAU') ? '≡ƒÑç' : s.name.includes('BTC') ? 'Γé┐' : '≡ƒÆ▒',
                priceHistory: [...priceHistoryCache.current[s.name]],
                quoteSource,
                hasExecutableQuote: hasExecutableBidAsk,
            };
    }, []);

    const createTerminalInstrumentMeta = useCallback((s: SymbolInfo): TerminalInstrumentMeta => ({
        symbol: s.name,
        name: s.description || s.name,
        category: (s.category || 'forex').toLowerCase(),
        digits: s.digits,
        pipSize: Math.pow(10, -s.digits),
        contractSize: s.tradeContractSize || 100000,
        icon: s.name.includes('XAU') ? '≡ƒÑç' : s.name.includes('BTC') ? 'Γé┐' : '≡ƒÆ▒',
        tradeMode: s.tradeMode,
    }), []);

    const instruments = useMemo<TerminalInstrumentMeta[]>(() => {
        return marketWatchSymbols.map((symbol) => createTerminalInstrumentMeta(symbol));
    }, [createTerminalInstrumentMeta, marketWatchSymbols]);
    const catalogInstruments = useMemo<TerminalInstrumentMeta[]>(() => {
        return catalogMarketSymbols.map((symbol) => createTerminalInstrumentMeta(symbol));
    }, [catalogMarketSymbols, createTerminalInstrumentMeta]);
    const instrumentLookup = useMemo(() => {
        const byExactSymbol = new Map<string, SymbolInfo>();
        const byTerminalKey = new Map<string, SymbolInfo>();

        getTerminalDisplaySymbols(storeSymbols).forEach((instrument) => {
            byExactSymbol.set(instrument.name, instrument);
            const terminalKey = getTerminalSymbolKey(instrument.name);
            if (!byTerminalKey.has(terminalKey)) {
                byTerminalKey.set(terminalKey, instrument);
            }
        });

        return { byExactSymbol, byTerminalKey };
    }, [storeSymbols]);
    const getSymbolInfoForInstrumentSymbol = useCallback((symbol: string) => {
        const exactMatch = instrumentLookup.byExactSymbol.get(symbol);
        if (exactMatch) {
            return exactMatch;
        }

        return instrumentLookup.byTerminalKey.get(getTerminalSymbolKey(symbol)) ?? null;
    }, [instrumentLookup]);
    const getInstrumentForSymbol = useCallback((symbol: string) => {
        const matchedSymbolInfo = getSymbolInfoForInstrumentSymbol(symbol);
        return matchedSymbolInfo ? createTerminalInstrument(matchedSymbolInfo) : null;
    }, [createTerminalInstrument, getSymbolInfoForInstrumentSymbol]);

    const [activePanel, setActivePanel] = useState<'instruments' | 'calendar' | 'alerts' | 'settings' | 'signals' | 'positions' | 'more' | 'market-status' | null>(null);
    const [toasts, setToasts] = useState<ToastNotificationData[]>([]);
    const [isOrderPanelOpen, setIsOrderPanelOpen] = useState(true);
    // Only block on snapshot for fresh sessions ΓÇö if tradingAccounts already in store
    // (same-session navigation from dashboard), skip the full-page loader entirely.
    const [isSnapshotLoading, setIsSnapshotLoading] = useState(
        () => useTradingStore.getState().tradingAccounts.length === 0,
    );
    // Keep hard refreshes feeling instant: give snapshot/local account lookup a
    // short grace period, then mount the terminal and let data hydrate in-panel.
    const [loadingTimedOut, setLoadingTimedOut] = useState(false);
    useEffect(() => {
        const t = setTimeout(
            () => setLoadingTimedOut(true),
            INITIAL_TERMINAL_ACCOUNT_DATA_GATE_TIMEOUT_MS,
        );
        return () => clearTimeout(t);
    }, []);
    const [releasedInitialTerminalGateKey, setReleasedInitialTerminalGateKey] = useState<string | null>(null);
    const [timedOutInitialTerminalGateKey, setTimedOutInitialTerminalGateKey] = useState<string | null>(null);
    const [pendingPositionActions, setPendingPositionActions] = useState<Set<string>>(new Set());
    const isInitialOhlcPrimedRef = useRef(false);
    const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
    const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
    const [positionsLoadState, setPositionsLoadState] = useState<TerminalPositionsLoadState>({
        isLoading: false,
        error: null,
        warning: null,
    });
    const [optimisticOpenPositions, setOptimisticOpenPositions] = useState<OptimisticTerminalPosition[]>([]);
    const hasResolvedOpenPositionsRef = useRef(false);
    const hasShownInitialPositionsLoadingRef = useRef(false);
    const positionsRefreshRequestSeqRef = useRef(0);
    const positionsRefreshInFlightRef = useRef<{
        promise: Promise<WebtraderPosition[]>;
        accountId: string | null;
        wsClient: WebSocketTradingClient;
        requestSeq: number;
    } | null>(null);
    const immediatePositionsRequestSourceRef = useRef<{
        accountId: string | null;
        wsClient: WebSocketTradingClient | null;
    }>({ accountId: null, wsClient: null });
    const positionsRefreshSettleTimeoutRef = useRef<number | null>(null);
    const positionsRefreshSettleDeadlineRef = useRef<number | null>(null);
    const isTerminalMountedRef = useRef(true);
    const delayedPostTradeRefreshTimeoutsRef = useRef<Set<number>>(new Set());
    const activeOrderMutationCountRef = useRef(0);
    const pendingOrderConfirmationsRef = useRef<Map<number, PendingTerminalOrderConfirmation>>(new Map());
    const pendingOrderConfirmationTimeoutsRef = useRef<Map<number, number>>(new Map());
    const pendingOrderConfirmationSeqRef = useRef(0);
    const [closedHistoryState, setClosedHistoryState] = useState<{
        isLoading: boolean;
        isLoaded: boolean;
        error: string | null;
    }>({ isLoading: false, isLoaded: false, error: null });
    const latestPositionsRefreshSourceRef = useRef<{
        accountId: string | null;
        wsClient: WebSocketTradingClient | null;
    }>({ accountId: connectAccountId, wsClient: storeWsClient });
    const activePositionsAccountKey = useMemo(
        () => getTerminalPositionsAccountCacheKey(connectAccountId),
        [connectAccountId],
    );
    const activePositionsAccountKeyRef = useRef<string | null>(activePositionsAccountKey);
    const restoredFrontendLaunchCacheKeyRef = useRef<string | null>(null);
    const positionsByAccountRef = useRef<Map<string, WebtraderPosition[]>>(new Map());
    const suppressNextEmptyPositionsCacheRef = useRef(false);
    const [frontendLaunchCacheRestoreState, setFrontendLaunchCacheRestoreState] = useState<TerminalFrontendLaunchRestoreState>({
        accountId: null,
        hasAccountInfo: false,
        hasPositions: false,
        hasSymbols: false,
        hasSelectedSymbol: false,
    });
    const applyPositionsForActiveAccount = useCallback((positions: WebtraderPosition[]) => {
        if (activePositionsAccountKey) {
            positionsByAccountRef.current.set(activePositionsAccountKey, positions);
        }
        setStorePositions(positions);
    }, [activePositionsAccountKey, setStorePositions]);
    const removeClosedPositionsFromActiveAccount = useCallback((tickets: readonly number[]) => {
        const ticketSet = new Set(
            tickets.filter((ticket) => Number.isFinite(ticket) && ticket > 0),
        );
        if (ticketSet.size === 0) return;

        for (const ticket of ticketSet) {
            useWebtraderStore.getState().removePosition(ticket);
        }

        const nextPositions = useWebtraderStore
            .getState()
            .positions
            .filter((position) => !ticketSet.has(position.ticket));

        if (activePositionsAccountKey) {
            positionsByAccountRef.current.set(activePositionsAccountKey, nextPositions);
        }

        hasResolvedOpenPositionsRef.current = true;
        setPositionsLoadState({ isLoading: false, error: null, warning: null });
    }, [activePositionsAccountKey]);
    const latestClosedHistoryAccountIdRef = useRef(connectAccountId);
    const latestClosedHistoryClientRef = useRef(storeWsClient);
    const closedHistoryRequestSeqRef = useRef(0);

    useEffect(() => {
        activePositionsAccountKeyRef.current = activePositionsAccountKey;
    }, [activePositionsAccountKey]);

    useEffect(() => {
        if (!connectAccountId) {
            return;
        }

        const restoreKey = `${connectAccountId}:${activePositionsAccountKey ?? 'pending-login'}`;
        if (restoredFrontendLaunchCacheKeyRef.current === restoreKey) {
            return;
        }

        restoredFrontendLaunchCacheKeyRef.current = restoreKey;
        const snapshot = readTerminalFrontendLaunchSnapshot(connectAccountId);
        if (!snapshot) {
            setFrontendLaunchCacheRestoreState({
                accountId: connectAccountId,
                hasAccountInfo: false,
                hasPositions: false,
                hasSymbols: false,
                hasSelectedSymbol: false,
            });
            return;
        }

        const cachedSymbols = snapshot.symbols ?? [];
        const cachedPositionsPayload = snapshot.positions ?? [];
        const hasCachedSymbols = cachedSymbols.length > 0;
        const hasCachedPositions = Array.isArray(snapshot.positions);
        const hasCachedSelectedSymbol = Boolean(snapshot.selectedSymbol);

        setFrontendLaunchCacheRestoreState({
            accountId: connectAccountId,
            hasAccountInfo: Boolean(snapshot.accountInfo),
            hasPositions: hasCachedPositions,
            hasSymbols: hasCachedSymbols,
            hasSelectedSymbol: hasCachedSelectedSymbol,
        });

        if (snapshot.accountInfo) {
            setStoreAccountInfo(snapshot.accountInfo);
        }

        if (hasCachedSymbols) {
            setStoreSymbols(cachedSymbols);
            setStoreIsLoadingSymbols(false);
        }

        if (hasCachedPositions) {
            const cachedPositions = filterTerminalPositionsForAccount(
                reviveTerminalLaunchPositions(cachedPositionsPayload),
                connectAccountId,
            );
            if (activePositionsAccountKey) {
                positionsByAccountRef.current.set(activePositionsAccountKey, cachedPositions);
            }
            setStorePositions(cachedPositions);
            hasResolvedOpenPositionsRef.current = true;
            setPositionsLoadState({ isLoading: false, error: null, warning: null });
        }

        if (
            snapshot.selectedSymbol &&
            !selectedSymbol &&
            (!selectedSymbolAccountId || selectedSymbolAccountId === connectAccountId)
        ) {
            setSelectedSymbol(snapshot.selectedSymbol);
            setSelectedSymbolAccountId(connectAccountId);
            setOpenTabs((current) => upsertUniqueTerminalSymbol(current, snapshot.selectedSymbol ?? ''));
            setWatchlistSymbols((current) => upsertUniqueTerminalSymbol(current, snapshot.selectedSymbol ?? ''));
        }

        markTerminalBootMilestone('frontend-launch-cache-restored', {
            accountId: connectAccountId,
            symbolCount: cachedSymbols.length,
            positionCount: cachedPositionsPayload.length,
            ageMs: Date.now() - snapshot.updatedAtMs,
        });
    }, [
        activePositionsAccountKey,
        connectAccountId,
        markTerminalBootMilestone,
        selectedSymbol,
        selectedSymbolAccountId,
        setStoreAccountInfo,
        setStoreIsLoadingSymbols,
        setStorePositions,
        setStoreSymbols,
    ]);

    const frontendLaunchCachePositions = useMemo(
        () => filterTerminalPositionsForAccount(storePositions, connectAccountId),
        [connectAccountId, storePositions],
    );
    const frontendLaunchCachePositionSignature = useMemo(
        () => getTerminalPositionExecutionSignature(frontendLaunchCachePositions),
        [frontendLaunchCachePositions],
    );
    const frontendLaunchCacheAccountInfoSignature = useMemo(
        () => getTerminalAccountInfoSignature(storeAccountInfo),
        [storeAccountInfo],
    );

    useEffect(() => {
        if (!connectAccountId) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            writeTerminalFrontendLaunchSnapshot(connectAccountId, {
                source: 'terminal-runtime',
                accountInfo: storeAccountInfo ?? undefined,
                positions: hasResolvedOpenPositionsRef.current || frontendLaunchCachePositions.length > 0
                    ? frontendLaunchCachePositions
                    : undefined,
                symbols: storeSymbols.length > 0 ? storeSymbols : undefined,
                selectedSymbol: selectedSymbol || undefined,
            });
        }, 250);

        return () => window.clearTimeout(timeoutId);
    }, [
        connectAccountId,
        frontendLaunchCacheAccountInfoSignature,
        frontendLaunchCachePositionSignature,
        frontendLaunchCachePositions,
        selectedSymbol,
        storeAccountInfo,
        storeSymbolCatalogKey,
        storeSymbols,
    ]);

    useEffect(() => {
        const previousSource = latestPositionsRefreshSourceRef.current;
        const sourceChanged =
            previousSource.accountId !== connectAccountId ||
            previousSource.wsClient !== storeWsClient;

        latestPositionsRefreshSourceRef.current = {
            accountId: connectAccountId,
            wsClient: storeWsClient,
        };

        if (!sourceChanged) {
            return;
        }

        positionsRefreshRequestSeqRef.current += 1;
        positionsRefreshInFlightRef.current = null;
        if (positionsRefreshSettleTimeoutRef.current !== null) {
            window.clearTimeout(positionsRefreshSettleTimeoutRef.current);
            positionsRefreshSettleTimeoutRef.current = null;
        }
        positionsRefreshSettleDeadlineRef.current = null;
        hasResolvedOpenPositionsRef.current = false;
        hasShownInitialPositionsLoadingRef.current = false;
        const cachedPositions = activePositionsAccountKey
            ? positionsByAccountRef.current.get(activePositionsAccountKey)
            : undefined;
        const hasCachedPositions = cachedPositions !== undefined;
        if (hasCachedPositions) {
            hasResolvedOpenPositionsRef.current = true;
            const scopedCachedPositions = filterTerminalPositionsForAccount(cachedPositions, connectAccountId);
            setStorePositions(scopedCachedPositions);
        } else if (useWebtraderStore.getState().positions.length > 0) {
            suppressNextEmptyPositionsCacheRef.current = true;
            setStorePositions([]);
        }
        setPositionsLoadState({
            isLoading: Boolean(connectAccountId) && !hasCachedPositions,
            error: null,
            warning: null,
        });
    }, [activePositionsAccountKey, connectAccountId, setStorePositions, storeWsClient]);

    useEffect(() => {
        if (!connectAccountId || !shouldUseTerminalRestPositions) {
            return;
        }

        const requestAccountKey = getTerminalPositionsAccountCacheKey(connectAccountId);
        let isCancelled = false;
        let retryTimeoutId: number | null = null;
        let retryIndex = 0;

        const applyRestPositionsForCurrentAccount = (positions: WebtraderPosition[]) => {
            if (
                isCancelled ||
                activePositionsAccountKeyRef.current !== requestAccountKey
            ) {
                return false;
            }

            applyPositionsForActiveAccount(positions);
            setPositionsLoadState({ isLoading: false, error: null, warning: null });
            hasResolvedOpenPositionsRef.current = true;
            return true;
        };

        const loadCachedPositions = async () => {
            try {
                const positions = await fetchTerminalRestPositions(connectAccountId);
                applyRestPositionsForCurrentAccount(positions);
            } catch (error) {
                if (
                    isCancelled ||
                    activePositionsAccountKeyRef.current !== requestAccountKey
                ) {
                    return;
                }

                const delayMs = TERMINAL_POSITIONS_BACKGROUND_RETRY_DELAYS_MS[retryIndex];
                retryIndex += 1;
                if (delayMs === undefined) {
                    return;
                }
                retryTimeoutId = window.setTimeout(loadCachedPositions, delayMs);
            }
        };

        void loadCachedPositions();

        return () => {
            isCancelled = true;
            if (retryTimeoutId !== null) {
                window.clearTimeout(retryTimeoutId);
            }
        };
    }, [applyPositionsForActiveAccount, connectAccountId, shouldUseTerminalRestPositions]);

    useEffect(() => {
        latestClosedHistoryAccountIdRef.current = connectAccountId;
        latestClosedHistoryClientRef.current = storeWsClient;
    }, [connectAccountId, storeWsClient]);
    useEffect(() => {
        if (storeConnectionStatus !== 'reconnecting') {
            return;
        }

        setPositionsLoadState((current) => {
            if (!current.error || !isTransientTerminalPositionRefreshError(current.error)) {
                return current;
            }

            return getTerminalPositionsTransientSettledState();
        });
    }, [storeConnectionStatus]);
    useEffect(() => {
        const unsubscribe = useWebtraderStore.subscribe((state, previousState) => {
            if (state.positions === previousState.positions) {
                return;
            }

            const activeCacheKey = activePositionsAccountKeyRef.current;
            if (activeCacheKey) {
                const scopedPositions = filterTerminalPositionsForAccount(state.positions, activeCacheKey);
                if (state.positions.length > scopedPositions.length) {
                    const cachedPositions = positionsByAccountRef.current.get(activeCacheKey) ?? [];
                    setStorePositions(scopedPositions.length > 0 ? scopedPositions : cachedPositions);
                    positionsByAccountRef.current.set(activeCacheKey, scopedPositions);
                } else if (state.positions.length > 0) {
                    positionsByAccountRef.current.set(activeCacheKey, scopedPositions);
                } else if (suppressNextEmptyPositionsCacheRef.current) {
                    suppressNextEmptyPositionsCacheRef.current = false;
                } else {
                    positionsByAccountRef.current.set(activeCacheKey, []);
                }
            }

            if (!hasRecoverableTerminalPositionsStoreSnapshot({
                positions: state.positions,
                wsClient: state.wsClient,
                connectionStatus: state.connectionStatus,
            })) {
                return;
            }

            positionsRefreshRequestSeqRef.current += 1;
            if (positionsRefreshSettleTimeoutRef.current !== null) {
                window.clearTimeout(positionsRefreshSettleTimeoutRef.current);
                positionsRefreshSettleTimeoutRef.current = null;
            }
            positionsRefreshSettleDeadlineRef.current = null;
            hasResolvedOpenPositionsRef.current = true;
            setPositionsLoadState((current) => {
                if (!current.isLoading && !current.warning && !current.error) {
                    return current;
                }

                const canRecoverHardError = state.positions.length > 0;
                if (
                    current.error &&
                    !isTransientTerminalPositionRefreshError(current.error) &&
                    !canRecoverHardError
                ) {
                    return current;
                }

                return { isLoading: false, error: null, warning: null };
            });
        });

        return unsubscribe;
    }, []);
    useEffect(() => {
        isTerminalMountedRef.current = true;
        const delayedPostTradeRefreshTimeouts = delayedPostTradeRefreshTimeoutsRef.current;
        const pendingOrderConfirmationTimeouts = pendingOrderConfirmationTimeoutsRef.current;
        const pendingOrderConfirmations = pendingOrderConfirmationsRef.current;

        return () => {
            isTerminalMountedRef.current = false;
            positionsRefreshRequestSeqRef.current += 1;
            positionsRefreshInFlightRef.current = null;
            delayedPostTradeRefreshTimeouts.forEach((timeoutId) => {
                window.clearTimeout(timeoutId);
            });
            delayedPostTradeRefreshTimeouts.clear();
            pendingOrderConfirmationTimeouts.forEach((timeoutId) => {
                window.clearTimeout(timeoutId);
            });
            pendingOrderConfirmationTimeouts.clear();
            pendingOrderConfirmations.clear();
            activeOrderMutationCountRef.current = 0;
            if (positionsRefreshSettleTimeoutRef.current !== null) {
                window.clearTimeout(positionsRefreshSettleTimeoutRef.current);
                positionsRefreshSettleTimeoutRef.current = null;
            }
            positionsRefreshSettleDeadlineRef.current = null;
            clearOhlcWarmupTimers();
        };
    }, [clearOhlcWarmupTimers]);
    const [quoteFeedWarning, setQuoteFeedWarning] = useState<string | null>(null);
    const [chartHistoryStatus, setChartHistoryStatus] = useState<ChartHistoryStatus | null>(null);
    const chartHistoryStatusCacheRef = useRef<Map<string, ChartHistoryStatus>>(new Map());
    /** Symbols/TFs that have actually painted candles in this session (keep-alive warm path). */
    const confirmedChartPaintRef = useRef<Map<string, true>>(new Map());
    const activeChartSymbolRef = useRef(selectedBrokerSymbol);
    activeChartSymbolRef.current = selectedBrokerSymbol;
    const activeChartTimeframeRef = useRef(normalizeTerminalTimeframeMinutes(chartTimeframeMinutes));
    activeChartTimeframeRef.current = normalizeTerminalTimeframeMinutes(chartTimeframeMinutes);
    const hasObservedLiveMarketDataRef = useRef(false);
    const selectedChartTimeframeMinutes = normalizeTerminalTimeframeMinutes(chartTimeframeMinutes);
    useEffect(() => {
        if (!selectedBrokerSymbol) {
            setChartHistoryStatus(null);
            return;
        }

        const statusKey = getTerminalChartHistoryStatusKey(
            selectedBrokerSymbol,
            selectedChartTimeframeMinutes,
        );
        setChartHistoryStatus((current) => {
            // Already tracking this symbol/TF (handleSelectSymbol / TF handler set it).
            if (
                isMatchingTerminalChartHistoryStatus(
                    current,
                    selectedBrokerSymbol,
                    selectedChartTimeframeMinutes,
                )
            ) {
                return current;
            }

            // Warm keep-alive: this symbol already painted in-session and is still mounted.
            const keepAliveWarm = renderedChartKeepAliveSymbols.some((symbol) =>
                symbolsMatch(symbol, selectedBrokerSymbol),
            );
            if (keepAliveWarm && confirmedChartPaintRef.current.has(statusKey)) {
                const warmStatus = {
                    symbol: selectedBrokerSymbol,
                    timeframeMinutes: selectedChartTimeframeMinutes,
                    isLoading: false,
                    hasCandles: true,
                };
                chartHistoryStatusCacheRef.current.set(statusKey, warmStatus);
                return warmStatus;
            }

            const pending = {
                symbol: selectedBrokerSymbol,
                timeframeMinutes: selectedChartTimeframeMinutes,
                isLoading: true,
                hasCandles: false,
            };
            chartHistoryStatusCacheRef.current.set(statusKey, pending);
            return pending;
        });
    }, [renderedChartKeepAliveSymbols, selectedBrokerSymbol, selectedChartTimeframeMinutes]);
    const selectedBrokerChartHasCandles = Boolean(
        selectedBrokerSymbol &&
        chartHistoryStatus?.hasCandles &&
        isMatchingTerminalChartHistoryStatus(
            chartHistoryStatus,
            selectedBrokerSymbol,
            selectedChartTimeframeMinutes,
        ),
    );
    // Reveal chart section only when real candles exist for active symbol/TF.
    // Never treat "settled empty" as ready — that shows a blank chart grid.
    const selectedChartSectionReady = selectedBrokerChartHasCandles;
    const selectedHistoryTimeframeMinutes = selectedBrokerSymbol ? selectedChartTimeframeMinutes : null;
    const selectedOhlcHistoryBackfillTarget = useMemo<{
        key: string;
        symbol: string;
        timeframeMinutes: number;
    } | null>(() => {
        if (
            !selectedBrokerSymbol ||
            !selectedHistoryTimeframeMinutes ||
            selectedHistoryTimeframeMinutes <= 0 ||
            !chartHistoryStatus ||
            chartHistoryStatus.isLoading ||
            chartHistoryStatus.hasCandles ||
            !isMatchingTerminalChartHistoryStatus(
                chartHistoryStatus,
                selectedBrokerSymbol,
                selectedChartTimeframeMinutes,
            )
        ) {
            return null;
        }

        return {
            key: `${getTerminalOhlcHistoryRequestKey(
                connectAccountId,
                selectedBrokerSymbol,
                selectedHistoryTimeframeMinutes,
            )}:selected-backfill`,
            symbol: selectedBrokerSymbol,
            timeframeMinutes: selectedHistoryTimeframeMinutes,
        };
    }, [
        chartHistoryStatus,
        connectAccountId,
        selectedBrokerSymbol,
        selectedHistoryTimeframeMinutes,
        selectedChartTimeframeMinutes,
    ]);
    const isOhlcHistoryDebugAvailable =
        TERMINAL_OHLC_HISTORY_DEBUG_ENV ||
        historyDebugQueryEnabled ||
        isOhlcHistoryDebugPersistent;
    const isOhlcHistoryConsoleDebugEnabled =
        TERMINAL_OHLC_HISTORY_CONSOLE_DEBUG_ENV ||
        historyConsoleDebugQueryEnabled ||
        isOhlcHistoryConsoleDebugPersistent;
    const selectedFirstLoadSymbols = useMemo(
        () => selectedBrokerSymbol
            ? [selectedBrokerSymbol]
            : resolveDefaultTerminalSymbols(
                storeSymbols,
                latestStorePricesRef.current,
            ).slice(0, 1),
        [livePriceSymbolKey, selectedBrokerSymbol, storeSymbols],
    );
    const activeLiveSubscriptionSymbols = useMemo(
        () => {
            // Priority/cap policy: keep the default hot set first, then fill spare slots with
            // visible/search and open-position quotes. Selected/open-tab quotes use their own lane.
            return uniqueQuoteSubscriptionSymbols([
                ...liveSubscriptionSymbols,
                ...openPositionSubscriptionSymbols,
            ]).slice(0, ACTIVE_LIVE_QUOTE_SUBSCRIPTION_LIMIT);
        },
        [liveSubscriptionSymbols, openPositionSubscriptionSymbols],
    );
    const activeLiveSubscriptionSymbolsKey = useMemo(
        () => getSymbolListKey(activeLiveSubscriptionSymbols),
        [activeLiveSubscriptionSymbols],
    );
    const selectedSubscriptionSymbolsKey = useMemo(
        () => getSymbolListKey(selectedSubscriptionSymbols),
        [selectedSubscriptionSymbols],
    );
    const terminalPreferencesBootstrapKey = useMemo(
        () => terminalPreferencesLoaded
            ? JSON.stringify(terminalPreferences ?? {})
            : 'pending-preferences-defaults',
        [terminalPreferences, terminalPreferencesLoaded],
    );
    const terminalBootstrapState = useMemo(
        () => buildTerminalBootstrapState(
            storeSymbols,
            latestStorePricesRef.current,
            {
                terminalPreferences,
                terminalPreferencesLoaded,
            },
        ),
        [livePriceSymbolKey, storeSymbols, terminalPreferences, terminalPreferencesLoaded],
    );
    const bootstrapQuotePrewarmSymbols = useMemo(
        () => terminalBootstrapState.quotePrewarmSymbols.length > 0
            ? terminalBootstrapState.quotePrewarmSymbols
            : withDefaultQuoteHydrationSymbols(getInitialTerminalSubscriptionSymbols(
                storeSymbols,
                {
                    preferredSymbols: uniqueTerminalSymbols([
                        ...terminalBootstrapState.historyPrewarmSymbols,
                    ]),
                    limit: DEFAULT_HOT_QUOTE_SUBSCRIPTION_LIMIT,
                },
            ), DEFAULT_HOT_QUOTE_SUBSCRIPTION_LIMIT),
        [
            storeSymbols,
            terminalBootstrapState.historyPrewarmSymbols,
            terminalBootstrapState.quotePrewarmSymbols,
        ],
    );

    const handleShowToast = useCallback((type: ToastNotificationData['type'], title: string, message?: string) => {
        const newToast: ToastNotificationData = { id: Date.now() + Math.random(), type, title, message };
        setToasts(prev => [...prev, newToast]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== newToast.id)), 4000);
    }, []);

    const clearNonBlockingConnectionWarning = useCallback(() => {
        const currentConnectionError = useWebtraderStore.getState().connectionError;
        if (isNonBlockingTerminalWarningMessage(currentConnectionError)) {
            setStoreConnectionError(null);
        }
    }, [setStoreConnectionError]);

    const markLiveMarketDataAvailable = useCallback(() => {
        hasObservedLiveMarketDataRef.current = true;
        setQuoteFeedWarning(null);
        clearNonBlockingConnectionWarning();
    }, [clearNonBlockingConnectionWarning]);

    const handleChartHistoryStatusChange = useCallback((nextStatus: ChartHistoryStatus) => {
        const statusKey = getTerminalChartHistoryStatusKey(
            nextStatus.symbol,
            nextStatus.timeframeMinutes,
        );
        const alreadyConfirmed = confirmedChartPaintRef.current.has(statusKey);
        // Readiness is monotonic for a mounted symbol/timeframe. Background retries
        // may report loading again while upgrading cache history, but replacing an
        // already-painted chart with the loading shell causes visible first-open shake.
        const stableStatus = alreadyConfirmed && !nextStatus.hasCandles
            ? {
                ...nextStatus,
                isLoading: false,
                hasCandles: true,
            }
            : nextStatus;
        chartHistoryStatusCacheRef.current.set(statusKey, stableStatus);

        // Track in-session painted symbols for instant keep-alive switches.
        if (stableStatus.hasCandles) {
            confirmedChartPaintRef.current.set(statusKey, true);
            // Refresh switch-seed so the next open of this symbol paints without network.
            prewarmTerminalChartSwitchSeed({
                accountSessionScopeId,
                symbol: nextStatus.symbol,
                timeframeMinutes: nextStatus.timeframeMinutes,
            });
        } else if (!stableStatus.isLoading) {
            // Settled without candles — do not treat as warm.
            confirmedChartPaintRef.current.delete(statusKey);
        }

        const activeChartSymbol = activeChartSymbolRef.current;
        if (
            (activeChartSymbol && !symbolsMatch(nextStatus.symbol, activeChartSymbol)) ||
            nextStatus.timeframeMinutes !== activeChartTimeframeRef.current
        ) {
            // Still cache for later warm switch; do not drive the active gate.
            return;
        }

        // Always sync for the active symbol (no transition lag on unlock or lock).
        setChartHistoryStatus(stableStatus);
    }, [accountSessionScopeId]);

    useEffect(() => {
        setIsOhlcHistoryDebugPersistent(readTerminalOhlcHistoryDebugPreference());
        setIsOhlcHistoryConsoleDebugPersistent(readTerminalOhlcHistoryConsoleDebugPreference());
    }, []);

    useEffect(() => {
        if (!isOhlcHistoryDebugAvailable) {
            setIsOhlcHistoryDebugPanelOpen(false);
        }
    }, [isOhlcHistoryDebugAvailable]);

    useEffect(() => {
        ohlcService.setHistoryDiagnosticsDebugEnabled(isOhlcHistoryConsoleDebugEnabled);

        return () => {
            ohlcService.setHistoryDiagnosticsDebugEnabled(false);
        };
    }, [isOhlcHistoryConsoleDebugEnabled]);

    useEffect(() => {
        if (!selectedBrokerSymbol || !selectedHistoryTimeframeMinutes || selectedHistoryTimeframeMinutes <= 0) {
            setSelectedHistoryDiagnostics(null);
            return;
        }

        setSelectedHistoryDiagnostics(
            ohlcService.getHistoryDiagnostics(
                selectedBrokerSymbol,
                selectedHistoryTimeframeMinutes,
            ) ?? null,
        );

        return ohlcService.addOhlcHistoryDiagnosticsListener((symbol, timeframe, snapshot) => {
            if (
                timeframe !== selectedHistoryTimeframeMinutes ||
                !symbolsMatch(symbol, selectedBrokerSymbol)
            ) {
                return;
            }

            setSelectedHistoryDiagnostics(snapshot);
        });
    }, [
        connectAccountId,
        selectedBrokerSymbol,
        selectedHistoryTimeframeMinutes,
    ]);

    const handleToggleOhlcHistoryDebugPersistence = useCallback(() => {
        setIsOhlcHistoryDebugPersistent((current) => {
            const next = !current;
            writeTerminalOhlcHistoryDebugPreference(next);

            if (
                !next &&
                !TERMINAL_OHLC_HISTORY_DEBUG_ENV &&
                !historyDebugQueryEnabled
            ) {
                setIsOhlcHistoryDebugPanelOpen(false);
            }

            return next;
        });
    }, [historyDebugQueryEnabled]);

    useEffect(() => {
        hasObservedLiveMarketDataRef.current = false;
        setQuoteFeedWarning(null);
    }, [connectAccountId]);

    useEffect(() => {
        hasInitializedTerminalSymbolsRef.current = false;
        isInitialOhlcPrimedRef.current = false;
        initializedTerminalStateKeyRef.current = null;
        persistedTerminalStateKeyRef.current = null;
        clearOhlcWarmupTimers();
        requestedOhlcHistoryRef.current.clear();
        requestedOhlcRepairRef.current.clear();
        if (selectedOhlcHistoryBackfillTimerRef.current) {
            clearTimeout(selectedOhlcHistoryBackfillTimerRef.current.timeoutId);
            selectedOhlcHistoryBackfillTimerRef.current = null;
        }
        priceHistoryCache.current = {};
        chartHistoryStatusCacheRef.current.clear();
        confirmedChartPaintRef.current.clear();
        setChartHistoryStatus(null);
        setSelectedHistoryDiagnostics(null);
        ohlcService.disconnect();
        setTerminalPreferences(null);
        setTerminalPreferencesLoaded(false);
        setSelectedSymbol((current) => current === '' ? current : '');
        setSelectedSymbolAccountId(null);
        setOpenTabs((current) => current.length === 0 ? current : []);
        setChartKeepAliveSymbols((current) => current.length === 0 ? current : []);
        setWatchlistSymbols((current) => current.length === 0 ? current : []);
        setOptimisticOpenPositions((current) => current.length === 0 ? current : []);
        terminalBootstrapQuotePrewarmKeyRef.current = null;
        terminalBootstrapHistoryPrewarmKeyRef.current = null;
        watchlistOhlcPrewarmKeyRef.current = null;

        if (terminalPreferencesPersistTimerRef.current !== null) {
            clearTimeout(terminalPreferencesPersistTimerRef.current);
            terminalPreferencesPersistTimerRef.current = null;
        }

        if (!connectAccountId || terminalLaunchSession.isActive) {
            setTerminalPreferencesLoaded(true);
            return;
        }

        let isCancelled = false;

        void fetchTerminalPreferences(connectAccountId)
            .then((preferences) => {
                if (!isCancelled) {
                    setTerminalPreferences(preferences);
                    setChartTimeframeMinutes(normalizeTerminalTimeframeMinutes(preferences?.timeframeMinutes));
                    setChartType(normalizeTerminalChartType(preferences?.chartType));
                    setChartLayoutPanes(normalizeTerminalChartLayoutPanes(preferences?.chartLayoutPanes));
                    setChartBarSpacing(normalizeTerminalChartBarSpacing(preferences?.chartBarSpacing));
                }
            })
            .finally(() => {
                if (!isCancelled) {
                    setTerminalPreferencesLoaded(true);
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [clearOhlcWarmupTimers, connectAccountId, terminalLaunchSession.isActive]);

    useEffect(() => {
        if (terminalConnectionStatus !== 'ready' || !hasAnyLiveQuote) {
            return;
        }

        markLiveMarketDataAvailable();
    }, [hasAnyLiveQuote, markLiveMarketDataAvailable, terminalConnectionStatus]);

    const [notifications, setNotifications] = useState<Array<{
        id: string;
        groupLabel?: string;
        title: string;
        message: string;
        date: string;
        isRead: boolean;
    }>>([]);

    const handleMarkNotificationsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }, []);

    useEffect(() => {
        const hasLaunchCodeInUrl = (() => {
            if (typeof window === 'undefined') {
                return false;
            }

            try {
                const launchCodeParamNames = ['launch', 'launch_code', 'launchCode', 'code'];
                const searchParams = new URLSearchParams(window.location.search);
                if (launchCodeParamNames.some((name) => searchParams.has(name))) {
                    return true;
                }

                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                return launchCodeParamNames.some((name) => hashParams.has(name));
            } catch {
                return false;
            }
        })();

        if (terminalLaunchSession.isActive || hasLaunchCodeInUrl) {
            setIsSnapshotLoading(false);
            return;
        }

        let isCancelled = false;

        const loadSnapshot = async () => {
            setIsSnapshotLoading(true);
            const startedAt = Date.now();

            try {
                const response = await fetch('/api/private/dashboard/snapshot', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error(`Snapshot request failed with status ${response.status}.`);
                }

                const payload = await response.json() as unknown;
                if (!isCancelled && payload && typeof payload === 'object' && !Array.isArray(payload)) {
                    const p = payload as Record<string, unknown>;
                    const safeSnapshot = Array.isArray(p.tradingAccounts) ? p : { tradingAccounts: [], ...p };
                    hydrateFromSnapshot(safeSnapshot as unknown as Parameters<typeof hydrateFromSnapshot>[0]);
                    markTerminalBootMilestone('snapshot-ready', {
                        elapsedMs: Date.now() - startedAt,
                        accountCount: Array.isArray(safeSnapshot.tradingAccounts)
                            ? safeSnapshot.tradingAccounts.length
                            : 0,
                    });
                }
            } catch (error) {
                if (!isCancelled) {
                    markTerminalBootMilestone('snapshot-failed', {
                        elapsedMs: Date.now() - startedAt,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    handleShowToast(
                        'error',
                        'Snapshot unavailable',
                        error instanceof Error ? error.message : 'Failed to load account snapshot.',
                    );
                }
            } finally {
                if (!isCancelled) {
                    setIsSnapshotLoading(false);
                }
            }
        };

        void loadSnapshot();

        return () => {
            isCancelled = true;
        };
    }, [handleShowToast, hydrateFromSnapshot, markTerminalBootMilestone, terminalLaunchSession.isActive]);

    useEffect(() => {
        if (!connectAccountId) {
            return;
        }

        if (terminalConnectionStatus === 'ready') {
            const nextKey = `${connectAccountId}:ready`;
            if (connectionToastKeyRef.current !== nextKey) {
                handleShowToast(
                    'success',
                    'Terminal connected',
                    `Live trading is ready for account ${activeTradingAccount?.accountNumber ?? connectAccountId}.`,
                );
                connectionToastKeyRef.current = nextKey;
                connectionErrorKeyRef.current = null;
            }
        }

        if (terminalConnectionStatus === 'error' && connectError) {
            const nextKey = `${connectAccountId}:${connectError}`;
            if (connectionErrorKeyRef.current !== nextKey) {
                handleShowToast('error', 'Terminal connection failed', connectError);
                connectionErrorKeyRef.current = nextKey;
            }
        }
    }, [activeTradingAccount?.accountNumber, connectAccountId, connectError, handleShowToast, terminalConnectionStatus]);

    useEffect(() => {
        if (!activeTradingAccount || activeTradingAccount.status === 'Archived') {
            setIsOrderPanelOpen(true);
        }
    }, [activeTradingAccount]);

    useEffect(() => {
        const checkMobile = () => {
            if (window.innerWidth >= 768) {
                setActivePanel('instruments');
            } else {
                setActivePanel(null);
            }
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);
    // ΓöÇΓöÇΓöÇ Professional Resize System ΓöÇΓöÇΓöÇ
    const initialLayout = typeof window === 'undefined'
        ? { left: 360, right: 330, bottom: 250 }
        : (() => {
            const defaults = getDefaultTerminalLayout(window.innerWidth, window.innerHeight);
            const shouldResetStoredLayout = window.localStorage.getItem(LAYOUT_STORAGE_VERSION_KEY) !== LAYOUT_STORAGE_VERSION;

            if (shouldResetStoredLayout) {
                return defaults;
            }

            return {
                left: clampLeftPanelWidth(getStoredDimension(LEFT_PANEL_STORAGE_KEY, defaults.left), window.innerWidth),
                right: clampRightPanelWidth(getStoredDimension(RIGHT_PANEL_STORAGE_KEY, defaults.right), window.innerWidth),
                bottom: clampPositionsPanelHeight(getStoredDimension(POSITIONS_HEIGHT_STORAGE_KEY, defaults.bottom), window.innerHeight),
            };
        })();

    const [panelWidth, setPanelWidth] = useState<number>(initialLayout.left);
    const [rightPanelWidth, setRightPanelWidth] = useState<number>(initialLayout.right);
    const [positionsHeight, setPositionsHeight] = useState<number>(initialLayout.bottom);

    const [isCloseAllModalOpen, setIsCloseAllModalOpen] = useState(false);
    const closeAllButtonRef = useRef<HTMLButtonElement>(null);

    const isResizing = useRef(false);
    const isResizingRight = useRef(false);
    const isResizingHeight = useRef(false);
    const rafId = useRef<number | null>(null);
    const activeResizeCleanupRef = useRef<(() => void) | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const panelWidthRef = useRef(initialLayout.left);
    const rightPanelWidthRef = useRef(initialLayout.right);
    const positionsHeightRef = useRef(initialLayout.bottom);

    const setContainerCssDimension = useCallback((name: string, value: number) => {
        containerRef.current?.style.setProperty(name, `${Math.round(value)}px`);
    }, []);

    const syncContainerCssDimensions = useCallback((layout: { left: number; right: number; bottom: number }) => {
        setContainerCssDimension(TERMINAL_LEFT_WIDTH_CSS_VAR, layout.left);
        setContainerCssDimension(TERMINAL_RIGHT_WIDTH_CSS_VAR, layout.right);
        setContainerCssDimension(TERMINAL_POSITIONS_HEIGHT_CSS_VAR, layout.bottom);
    }, [setContainerCssDimension]);

    useEffect(() => {
        panelWidthRef.current = panelWidth;
        rightPanelWidthRef.current = rightPanelWidth;
        positionsHeightRef.current = positionsHeight;
        syncContainerCssDimensions({
            left: panelWidth,
            right: rightPanelWidth,
            bottom: positionsHeight,
        });
    }, [panelWidth, positionsHeight, rightPanelWidth, syncContainerCssDimensions]);

    const applyLeftPanelWidth = useCallback((width: number) => {
        panelWidthRef.current = width;
        setContainerCssDimension(TERMINAL_LEFT_WIDTH_CSS_VAR, width);
    }, [setContainerCssDimension]);

    const applyRightPanelWidth = useCallback((width: number) => {
        rightPanelWidthRef.current = width;
        setContainerCssDimension(TERMINAL_RIGHT_WIDTH_CSS_VAR, width);
    }, [setContainerCssDimension]);

    const applyPositionsHeight = useCallback((height: number) => {
        positionsHeightRef.current = height;
        setContainerCssDimension(TERMINAL_POSITIONS_HEIGHT_CSS_VAR, height);
    }, [setContainerCssDimension]);

    const commitLeftPanelWidth = useCallback((width: number) => {
        applyLeftPanelWidth(width);
        setPanelWidth((prev) => prev === width ? prev : width);
        window.localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(Math.round(width)));
        window.localStorage.setItem(LAYOUT_STORAGE_VERSION_KEY, LAYOUT_STORAGE_VERSION);
    }, [applyLeftPanelWidth]);

    const commitRightPanelWidth = useCallback((width: number) => {
        applyRightPanelWidth(width);
        setRightPanelWidth((prev) => prev === width ? prev : width);
        window.localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(Math.round(width)));
        window.localStorage.setItem(LAYOUT_STORAGE_VERSION_KEY, LAYOUT_STORAGE_VERSION);
    }, [applyRightPanelWidth]);

    const commitPositionsHeight = useCallback((height: number) => {
        applyPositionsHeight(height);
        setPositionsHeight((prev) => prev === height ? prev : height);
        window.localStorage.setItem(POSITIONS_HEIGHT_STORAGE_KEY, String(Math.round(height)));
        window.localStorage.setItem(LAYOUT_STORAGE_VERSION_KEY, LAYOUT_STORAGE_VERSION);
    }, [applyPositionsHeight]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const defaults = getDefaultTerminalLayout(window.innerWidth, window.innerHeight);
        const shouldResetStoredLayout = window.localStorage.getItem(LAYOUT_STORAGE_VERSION_KEY) !== LAYOUT_STORAGE_VERSION;
        const nextLayout = shouldResetStoredLayout
            ? defaults
            : {
                left: clampLeftPanelWidth(getStoredDimension(LEFT_PANEL_STORAGE_KEY, defaults.left), window.innerWidth),
                right: clampRightPanelWidth(getStoredDimension(RIGHT_PANEL_STORAGE_KEY, defaults.right), window.innerWidth),
                bottom: clampPositionsPanelHeight(getStoredDimension(POSITIONS_HEIGHT_STORAGE_KEY, defaults.bottom), window.innerHeight),
            };

        setPanelWidth(nextLayout.left);
        setRightPanelWidth(nextLayout.right);
        setPositionsHeight(nextLayout.bottom);
        panelWidthRef.current = nextLayout.left;
        rightPanelWidthRef.current = nextLayout.right;
        positionsHeightRef.current = nextLayout.bottom;
        syncContainerCssDimensions(nextLayout);

        window.localStorage.setItem(LAYOUT_STORAGE_VERSION_KEY, LAYOUT_STORAGE_VERSION);
    }, [syncContainerCssDimensions]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const syncLayoutToViewport = () => {
            const constrainedPanels = constrainTerminalPanelWidths(
                { left: panelWidthRef.current, right: rightPanelWidthRef.current },
                window.innerWidth,
                { left: Boolean(activePanel), right: isOrderPanelOpen },
            );
            const nextLeft = constrainedPanels.left;
            const nextRight = constrainedPanels.right;
            const nextBottom = clampPositionsPanelHeight(positionsHeightRef.current, window.innerHeight);

            panelWidthRef.current = nextLeft;
            rightPanelWidthRef.current = nextRight;
            positionsHeightRef.current = nextBottom;
            syncContainerCssDimensions({ left: nextLeft, right: nextRight, bottom: nextBottom });

            setPanelWidth((prev) => prev === nextLeft ? prev : nextLeft);
            setRightPanelWidth((prev) => prev === nextRight ? prev : nextRight);
            setPositionsHeight((prev) => prev === nextBottom ? prev : nextBottom);
        };

        window.addEventListener('resize', syncLayoutToViewport);
        return () => window.removeEventListener('resize', syncLayoutToViewport);
    }, [activePanel, isOrderPanelOpen, syncContainerCssDimensions]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const constrainedPanels = constrainTerminalPanelWidths(
            { left: panelWidthRef.current, right: rightPanelWidthRef.current },
            window.innerWidth,
            { left: Boolean(activePanel), right: isOrderPanelOpen },
        );

        if (
            constrainedPanels.left === panelWidthRef.current &&
            constrainedPanels.right === rightPanelWidthRef.current
        ) {
            return;
        }

        panelWidthRef.current = constrainedPanels.left;
        rightPanelWidthRef.current = constrainedPanels.right;
        syncContainerCssDimensions({
            left: constrainedPanels.left,
            right: constrainedPanels.right,
            bottom: positionsHeightRef.current,
        });
        setPanelWidth((prev) => prev === constrainedPanels.left ? prev : constrainedPanels.left);
        setRightPanelWidth((prev) => prev === constrainedPanels.right ? prev : constrainedPanels.right);
    }, [activePanel, isOrderPanelOpen, syncContainerCssDimensions]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        window.localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(Math.round(panelWidth)));
        window.localStorage.setItem(RIGHT_PANEL_STORAGE_KEY, String(Math.round(rightPanelWidth)));
        window.localStorage.setItem(POSITIONS_HEIGHT_STORAGE_KEY, String(Math.round(positionsHeight)));
        window.localStorage.setItem(LAYOUT_STORAGE_VERSION_KEY, LAYOUT_STORAGE_VERSION);
    }, [panelWidth, rightPanelWidth, positionsHeight]);

    useEffect(() => {
        return () => {
            activeResizeCleanupRef.current?.();
        };
    }, []);

    // ΓöÇΓöÇΓöÇ Left Divider ΓöÇΓöÇΓöÇ
    const applySnapLeft = (rawW: number) => {
        const container = containerRef.current;
        if (!container) return rawW;
        const totalW = container.clientWidth - SIDEBAR_WIDTH;
        for (const pct of SNAP_PERCENT) {
            const snapW = totalW * pct;
            if (Math.abs(rawW - snapW) < SNAP_THRESHOLD) return snapW;
        }
        return rawW;
    };

    const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        activeResizeCleanupRef.current?.();
        isResizing.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        const tvContainer = document.getElementById('tv_chart_container');
        if (tvContainer) tvContainer.style.pointerEvents = 'none';

        const onMove = (ev: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in ev ? ev.touches[0]?.clientX : (ev as MouseEvent).clientX;
            if (clientX === undefined) return;
            if (rafId.current) cancelAnimationFrame(rafId.current);
            rafId.current = requestAnimationFrame(() => {
                if (!isResizing.current) return;
                const rawW = clientX - SIDEBAR_WIDTH;
                if (rawW < LEFT_MIN / 2) {
                    const defaults = getDefaultTerminalLayout(window.innerWidth, window.innerHeight);
                    setActivePanel(null);
                    commitLeftPanelWidth(defaults.left);
                    cleanupResize();
                    return;
                }
                const maxW = getPanelMaxWidthForCenter(
                    LEFT_MIN,
                    rightPanelWidthRef.current,
                    window.innerWidth,
                    isOrderPanelOpen,
                );
                const finalW = clampPanelWidthWithinAvailable(applySnapLeft(rawW), LEFT_MIN, maxW);
                applyLeftPanelWidth(finalW);
            });
        };

        const cleanupResize = () => {
            isResizing.current = false;
            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            const tvContainer = document.getElementById('tv_chart_container');
            if (tvContainer) tvContainer.style.pointerEvents = '';
            
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
            window.removeEventListener('touchcancel', onUp);
            window.removeEventListener('blur', onUp);
            if (activeResizeCleanupRef.current === onUp) {
                activeResizeCleanupRef.current = null;
            }
        };

        const onUp = () => {
            const finalWidth = panelWidthRef.current;
            cleanupResize();
            commitLeftPanelWidth(finalWidth);
        };

        activeResizeCleanupRef.current = onUp;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        window.addEventListener('touchcancel', onUp);
        window.addEventListener('blur', onUp);
    }, [applyLeftPanelWidth, commitLeftPanelWidth, isOrderPanelOpen]);

    const handleDividerDoubleClick = useCallback(() => {
        const defaults = getDefaultTerminalLayout(window.innerWidth, window.innerHeight);
        commitLeftPanelWidth(defaults.left);
    }, [commitLeftPanelWidth]);

    // ΓöÇΓöÇΓöÇ Right Divider ΓöÇΓöÇΓöÇ
    const applySnapRight = (rawW: number) => {
        const defaults = typeof window === 'undefined'
            ? { right: 330 }
            : getDefaultTerminalLayout(window.innerWidth, window.innerHeight);
        for (const threshold of [RIGHT_MIN * 1.5, defaults.right, 500]) {
            if (Math.abs(rawW - threshold) < SNAP_THRESHOLD) return threshold;
        }
        return rawW;
    };

    const handleRightMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        activeResizeCleanupRef.current?.();
        isResizingRight.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const tvContainer = document.getElementById('tv_chart_container');
        if (tvContainer) tvContainer.style.pointerEvents = 'none';

        const onMove = (ev: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in ev ? ev.touches[0]?.clientX : (ev as MouseEvent).clientX;
            if (clientX === undefined) return;
            if (rafId.current) cancelAnimationFrame(rafId.current);
            rafId.current = requestAnimationFrame(() => {
                if (!isResizingRight.current) return;
                const rawW = window.innerWidth - clientX;
                if (rawW < RIGHT_MIN / 2) {
                    const defaults = getDefaultTerminalLayout(window.innerWidth, window.innerHeight);
                    setIsOrderPanelOpen(false);
                    commitRightPanelWidth(defaults.right);
                    cleanupResize();
                    return;
                }
                const maxW = getPanelMaxWidthForCenter(
                    RIGHT_MIN,
                    panelWidthRef.current,
                    window.innerWidth,
                    Boolean(activePanel),
                );
                const finalW = clampPanelWidthWithinAvailable(applySnapRight(rawW), RIGHT_MIN, maxW);
                applyRightPanelWidth(finalW);
            });
        };

        const cleanupResize = () => {
            isResizingRight.current = false;
            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            const tvContainer = document.getElementById('tv_chart_container');
            if (tvContainer) tvContainer.style.pointerEvents = '';
            
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
            window.removeEventListener('touchcancel', onUp);
            window.removeEventListener('blur', onUp);
            if (activeResizeCleanupRef.current === onUp) {
                activeResizeCleanupRef.current = null;
            }
        };

        const onUp = () => {
            const finalWidth = rightPanelWidthRef.current;
            cleanupResize();
            commitRightPanelWidth(finalWidth);
        };

        activeResizeCleanupRef.current = onUp;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        window.addEventListener('touchcancel', onUp);
        window.addEventListener('blur', onUp);
    }, [activePanel, applyRightPanelWidth, commitRightPanelWidth]);

    const handleRightDividerDoubleClick = useCallback(() => {
        const defaults = getDefaultTerminalLayout(window.innerWidth, window.innerHeight);
        commitRightPanelWidth(defaults.right);
    }, [commitRightPanelWidth]);

    // ΓöÇΓöÇΓöÇ Vertical (Height) Divider ΓöÇΓöÇΓöÇ
    const handleHeightMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        activeResizeCleanupRef.current?.();
        isResizingHeight.current = true;
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';

        const tvContainer = document.getElementById('tv_chart_container');
        if (tvContainer) tvContainer.style.pointerEvents = 'none';

        const onMove = (ev: MouseEvent | TouchEvent) => {
            const clientY = 'touches' in ev ? ev.touches[0]?.clientY : (ev as MouseEvent).clientY;
            if (clientY === undefined) return;
            if (rafId.current) cancelAnimationFrame(rafId.current);
            rafId.current = requestAnimationFrame(() => {
                if (!isResizingHeight.current) return;
                const newH = window.innerHeight - clientY - 40;
                applyPositionsHeight(clampPositionsPanelHeight(newH, window.innerHeight));
            });
        };

        const cleanupResize = () => {
            isResizingHeight.current = false;
            if (rafId.current) {
                cancelAnimationFrame(rafId.current);
                rafId.current = null;
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            const tvContainer = document.getElementById('tv_chart_container');
            if (tvContainer) tvContainer.style.pointerEvents = '';
            
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchend', onUp);
            window.removeEventListener('touchcancel', onUp);
            window.removeEventListener('blur', onUp);
            if (activeResizeCleanupRef.current === onUp) {
                activeResizeCleanupRef.current = null;
            }
        };

        const onUp = () => {
            const finalHeight = positionsHeightRef.current;
            cleanupResize();
            commitPositionsHeight(finalHeight);
        };

        activeResizeCleanupRef.current = onUp;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchend', onUp);
        window.addEventListener('touchcancel', onUp);
        window.addEventListener('blur', onUp);
    }, [applyPositionsHeight, commitPositionsHeight]);

    const subscribeRealtimeSymbols = useCallback((symbols: string[]) => {
        const requestedSymbols = resolveQuoteSubscriptionSymbolList(
            storeSymbols,
            symbols,
            latestStorePricesRef.current,
            { allowInputFallback: true },
        );

        if (
            !isQuoteClientReady ||
            requestedSymbols.length === 0
        ) {
            return;
        }

        const client = quoteWsClient;
        if (!client) {
            return;
        }

        const coveredSymbols = uniqueQuoteSubscriptionSymbols([
            ...(marketQuoteSubscriptionsRef.current?.client === client
                ? marketQuoteSubscriptionsRef.current.symbols
                : []),
            ...(selectedQuoteSubscriptionsRef.current?.client === client
                ? selectedQuoteSubscriptionsRef.current.symbols
                : []),
        ]);
        const nextSymbols = getUncoveredSubscriptionSymbols(requestedSymbols, coveredSymbols);
        if (nextSymbols.length === 0) {
            return;
        }

        void client.subscribeSymbols(nextSymbols).catch((error) => {
            console.error('[Terminal] Failed to auto-subscribe symbols', {
                symbols: nextSymbols,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }, [isQuoteClientReady, quoteWsClient, storeSymbols]);

    const requestOhlcHistoryForSymbols = useCallback((
        symbols: string[],
        historyLimit = TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT,
        timeframeMinutes = 1,
    ) => {
        if (!isOhlcHistoryClientReady) {
            return;
        }

        const normalizedTimeframeMinutes = normalizeTerminalTimeframeMinutes(timeframeMinutes);
        const nextSymbols = resolveCatalogSymbolList(
            storeSymbols,
            symbols,
            latestStorePricesRef.current,
            { preserveExact: true },
        );
        const pendingRequests = nextSymbols.flatMap((symbol) => {
            const requestKey = getTerminalOhlcHistoryRequestKey(
                connectAccountId,
                symbol,
                normalizedTimeframeMinutes,
            );
            const previousLimit = requestedOhlcHistoryRef.current.get(requestKey) ?? 0;
            if (previousLimit >= historyLimit) {
                return [];
            }

            return [{ symbol, requestKey }];
        });

        if (pendingRequests.length === 0) {
            return;
        }

        const runHistoryWarmupRequest = async ({
            symbol,
            requestKey,
        }: (typeof pendingRequests)[number], retryIndex = 0) => {
            // Backoff schedule for deferred/manager_busy responses: 1.5s, 3s, 6s
            const RETRY_DELAYS_MS = [1_500, 3_000, 6_000] as const;
            const MAX_RETRIES = RETRY_DELAYS_MS.length;
            const previousLimit = requestedOhlcHistoryRef.current.get(requestKey) ?? 0;
            if (previousLimit >= historyLimit) {
                return;
            }

            requestedOhlcHistoryRef.current.set(requestKey, historyLimit);
            const restorePreviousLimitIfCurrentRequestOwnsMarker = () => {
                if (requestedOhlcHistoryRef.current.get(requestKey) !== historyLimit) {
                    return;
                }

                if (previousLimit > 0) {
                    requestedOhlcHistoryRef.current.set(requestKey, previousLimit);
                } else {
                    requestedOhlcHistoryRef.current.delete(requestKey);
                }
            };
            try {
                const history = await ohlcService.getHistory(
                    symbol,
                    normalizedTimeframeMinutes,
                    historyLimit,
                );
                const diagnostics = ohlcService.getHistoryDiagnostics(
                    symbol,
                    normalizedTimeframeMinutes,
                ) ?? null;
                const usableBarCount = getUsableTerminalOhlcHistoryBarCount(history);
                const shouldRetry = terminalHistoryDiagnosticsIndicatesRetryable(
                    diagnostics,
                    historyLimit,
                    usableBarCount,
                );

                if (shouldRetry) {
                    restorePreviousLimitIfCurrentRequestOwnsMarker();

                    // ΓöÇΓöÇ Auto-retry on deferred / manager_state_busy ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
                    // C++ backend returned 0 bars (trade pending, MT5 manager busy).
                    // Schedule an automatic re-fetch so the chart recovers without
                    // needing the user to switch tabs or reconnect.
                    if (retryIndex < MAX_RETRIES) {
                        const delayMs = RETRY_DELAYS_MS[retryIndex];
                        const timeoutId = window.setTimeout(
                            () => {
                                ohlcHistoryWarmupRetryTimeoutsRef.current.delete(timeoutId);
                                void runHistoryWarmupRequest(
                                    { symbol, requestKey },
                                    retryIndex + 1,
                                );
                            },
                            delayMs,
                        );
                        ohlcHistoryWarmupRetryTimeoutsRef.current.add(timeoutId);
                    }
                } else {
                    const currentLimit = requestedOhlcHistoryRef.current.get(requestKey) ?? 0;
                    requestedOhlcHistoryRef.current.set(
                        requestKey,
                        Math.max(currentLimit, previousLimit, historyLimit),
                    );
                }

                if (isOhlcHistoryConsoleDebugEnabled) {
                    console.debug('[Terminal] OHLC history prime result', {
                        requestedSymbol: symbol,
                        timeframeMinutes: normalizedTimeframeMinutes,
                        requestedLimit: historyLimit,
                        usableBarCount,
                        returnedBarCount: diagnostics?.returnedBarCount ?? history.length,
                        metadataStatus: diagnostics?.status,
                        attemptedBrokerSymbol: diagnostics?.attemptedBrokerSymbol,
                        resolvedBrokerSymbol: diagnostics?.resolvedBrokerSymbol,
                        managerFetchDeferred: diagnostics?.managerFetchDeferred,
                        historySparse: diagnostics?.historySparse,
                        historyGapped: diagnostics?.historyGapped,
                        retryable: shouldRetry,
                        retryIndex,
                    });
                }
            } catch (error) {
                restorePreviousLimitIfCurrentRequestOwnsMarker();
                const failurePayload = {
                    requestedSymbol: symbol,
                    timeframeMinutes: normalizedTimeframeMinutes,
                    historyLimit,
                    error: error instanceof Error ? error.message : String(error),
                };

                if (shouldWarnTerminalOhlcPrimeFailure(error)) {
                    console.warn('[Terminal] Failed to prime OHLC history', failurePayload);
                } else if (isOhlcHistoryConsoleDebugEnabled) {
                    console.debug('[Terminal] OHLC history prime deferred', failurePayload);
                }
            }
        };

        void (async () => {
            for (const [index, pendingRequest] of pendingRequests.entries()) {
                await runHistoryWarmupRequest(pendingRequest);
                if (index < pendingRequests.length - 1) {
                    await new Promise<void>((resolve) =>
                        window.setTimeout(resolve, TERMINAL_OHLC_HISTORY_WARMUP_STAGGER_MS),
                    );
                }
            }
        })();
    }, [
        connectAccountId,
        isOhlcHistoryConsoleDebugEnabled,
        isOhlcHistoryClientReady,
        storeSymbols,
    ]);
    const requestOhlcHistoryForSymbolsRef = useRef(requestOhlcHistoryForSymbols);

    useEffect(() => {
        requestOhlcHistoryForSymbolsRef.current = requestOhlcHistoryForSymbols;
    }, [requestOhlcHistoryForSymbols]);

    useEffect(() => {
        clearOhlcWarmupTimers();
    }, [
        clearOhlcWarmupTimers,
        connectAccountId,
        selectedBrokerSymbol,
        selectedChartTimeframeMinutes,
    ]);

    const requestSelectedOhlcHistory = useCallback((
        symbol: string,
        historyLimit = TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT,
        timeframeMinutes = 1,
    ) => {
        if (!isOhlcHistoryClientReady || !symbol.trim()) {
            return;
        }

        const normalizedTimeframeMinutes = normalizeTerminalTimeframeMinutes(timeframeMinutes);
        const [exactSymbol] = resolveCatalogSymbolList(
            storeSymbols,
            [symbol],
            latestStorePricesRef.current,
            { preserveExact: true },
        );
        if (!exactSymbol) {
            return;
        }

        void ohlcService
            .getHistory(
                exactSymbol,
                normalizedTimeframeMinutes,
                historyLimit,
                { cacheFirst: true, cacheOnly: false },
            )
            .then((history) => {
                if (!isOhlcHistoryConsoleDebugEnabled) {
                    return;
                }

                const diagnostics = ohlcService.getHistoryDiagnostics(
                    exactSymbol,
                    normalizedTimeframeMinutes,
                ) ?? null;
                console.debug('[Terminal] selected OHLC history prime result', {
                    requestedSymbol: exactSymbol,
                    timeframeMinutes: normalizedTimeframeMinutes,
                    requestedLimit: historyLimit,
                    usableBarCount: getUsableTerminalOhlcHistoryBarCount(history),
                    returnedBarCount: diagnostics?.returnedBarCount ?? history.length,
                    metadataStatus: diagnostics?.status,
                    attemptedBrokerSymbol: diagnostics?.attemptedBrokerSymbol,
                    resolvedBrokerSymbol: diagnostics?.resolvedBrokerSymbol,
                    managerFetchDeferred: diagnostics?.managerFetchDeferred,
                    historySparse: diagnostics?.historySparse,
                    historyGapped: diagnostics?.historyGapped,
                });
            })
            .catch((error) => {
                const failurePayload = {
                    requestedSymbol: exactSymbol,
                    timeframeMinutes: normalizedTimeframeMinutes,
                    historyLimit,
                    error: error instanceof Error ? error.message : String(error),
                };

                if (shouldWarnTerminalOhlcPrimeFailure(error)) {
                    console.warn('[Terminal] Failed to prime selected OHLC history', failurePayload);
                } else if (isOhlcHistoryConsoleDebugEnabled) {
                    console.debug('[Terminal] selected OHLC history prime deferred', failurePayload);
                }
            });
    }, [
        isOhlcHistoryClientReady,
        isOhlcHistoryConsoleDebugEnabled,
        storeSymbols,
    ]);
    const requestSelectedOhlcHistoryRef = useRef(requestSelectedOhlcHistory);
    requestSelectedOhlcHistoryRef.current = requestSelectedOhlcHistory;

    const requestTerminalOhlcGapRepair = useCallback((
        symbol: string,
        timeframeMinutes: number,
        historyLimit = TERMINAL_BOOTSTRAP_OHLC_HISTORY_PRIME_LIMIT,
        reason = 'terminal-initial-gap-check',
    ) => {
        if (!connectAccountId || !symbol.trim()) {
            return;
        }

        const normalizedTimeframeMinutes = normalizeTerminalTimeframeMinutes(timeframeMinutes);
        const exactSymbol = resolveCatalogSymbolName(
            storeSymbols,
            symbol,
            latestStorePricesRef.current,
            { preserveExact: true },
        ) || symbol.trim();
        const requestKey = [
            getTerminalOhlcHistoryRequestKey(
                connectAccountId,
                exactSymbol,
                normalizedTimeframeMinutes,
            ),
            historyLimit,
        ].join(':');
        const now = Date.now();
        const entry = requestedOhlcRepairRef.current.get(requestKey);
        const lastRequestedAt = entry?.lastAt ?? 0;
        let failures = entry?.failures ?? 0;
        const retryAfterUntil = entry?.retryAfterUntil ?? 0;

        // Time-based failure reset: if the last failure was >5 min ago, the backend has likely
        // stabilised. Reset the counter so the chart retries without needing a page reload.
        if (failures > 0 && entry?.lastAt && (now - entry.lastAt) > TERMINAL_OHLC_REPAIR_FAILURE_RESET_MS) {
            failures = 0;
            requestedOhlcRepairRef.current.set(requestKey, { lastAt: entry.lastAt, failures: 0 });
        }

        // Hard stop: too many consecutive failures ΓÇö upstream is persistently down.
        if (failures >= TERMINAL_OHLC_REPAIR_MAX_FAILURES) {
            if (isOhlcHistoryConsoleDebugEnabled) {
                console.debug('[Terminal] OHLC repair suspended (max failures reached)', {
                    symbol: exactSymbol,
                    timeframeMinutes: normalizedTimeframeMinutes,
                    failures,
                });
            }
            return;
        }

        // Exponential backoff: min(base * 2^failures, max)
        const cooldownMs = Math.min(
            TERMINAL_OHLC_REPAIR_BACKOFF_BASE_MS * Math.pow(2, failures),
            TERMINAL_OHLC_REPAIR_BACKOFF_MAX_MS,
        );
        if (now < retryAfterUntil || now - lastRequestedAt < cooldownMs) {
            return;
        }

        requestedOhlcRepairRef.current.set(requestKey, { lastAt: now, failures });
        const controller = new AbortController();
        const timeoutId = window.setTimeout(
            () => controller.abort(),
            TERMINAL_OHLC_REPAIR_FETCH_TIMEOUT_MS,
        );

        void fetch(getTerminalOhlcRepairUrl(connectAccountId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
            body: JSON.stringify({
                symbol: exactSymbol,
                timeframeMinutes: normalizedTimeframeMinutes,
                limit: historyLimit,
                reason,
            }),
        }).then(async (response) => {
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                // HTTP-level failure ΓÇö count as a failure and back off.
                const currentEntry = requestedOhlcRepairRef.current.get(requestKey);
                requestedOhlcRepairRef.current.set(requestKey, {
                    lastAt: currentEntry?.lastAt ?? now,
                    failures: (currentEntry?.failures ?? 0) + 1,
                    retryAfterUntil: currentEntry?.retryAfterUntil,
                });
                throw new Error(
                    payload && typeof payload.error === 'string'
                        ? payload.error
                        : `OHLC repair failed with status ${response.status}`,
                );
            }

            if (
                payload &&
                typeof payload === 'object' &&
                ('ready' in payload || 'repaired' in payload)
            ) {
                const result = payload as {
                    ready?: boolean;
                    repaired?: boolean;
                    gaps?: boolean;
                    stale?: boolean;
                    source?: string;
                    status?: string;
                    managerFetchDeferred?: boolean;
                    managerFetchPending?: boolean;
                    retryAfterMs?: number;
                    managerFetchRetryAfterMs?: number;
                    backfillRetryAfterMs?: number;
                };
                if (isOhlcHistoryConsoleDebugEnabled) {
                    console.debug('[Terminal] OHLC gap repair result', {
                        symbol: exactSymbol,
                        timeframeMinutes: normalizedTimeframeMinutes,
                        historyLimit,
                        ready: result.ready,
                        repaired: result.repaired,
                        gaps: result.gaps,
                        stale: result.stale,
                        source: result.source,
                        status: result.status,
                    });
                }

                const isPendingRepairDiagnostic =
                    response.status === 202 ||
                    result.status === 'repair_pending' ||
                    result.managerFetchDeferred === true ||
                    result.managerFetchPending === true ||
                    /manager[_\s-]?(?:state[_\s-]?)?busy|manager_cooldown|scheduler_busy|already_pending|history[_\s-]?pending|defer(?:red)?|queued/i.test(
                        [result.status, result.source].filter(Boolean).join(' '),
                    );
                const rawRetryAfterMs = Number(
                    result.retryAfterMs ?? result.managerFetchRetryAfterMs ?? result.backfillRetryAfterMs ?? 0,
                );
                const retryAfterMs = Number.isFinite(rawRetryAfterMs)
                    ? Math.max(0, rawRetryAfterMs)
                    : 0;

                if (result.ready || result.repaired) {
                    // Success ΓÇö reset the failure counter so next call uses base cooldown.
                    const currentEntry = requestedOhlcRepairRef.current.get(requestKey);
                    requestedOhlcRepairRef.current.set(requestKey, {
                        lastAt: currentEntry?.lastAt ?? now,
                        failures: 0,
                        retryAfterUntil: undefined,
                    });
                    void ohlcService.getHistory(
                        exactSymbol,
                        normalizedTimeframeMinutes,
                        historyLimit,
                        { cacheFirst: false, cacheOnly: false },
                    ).catch(() => null);
                } else if (isPendingRepairDiagnostic) {
                    // The server bounded a long repair with a browser-friendly
                    // pending diagnostic. Keep the existing backoff state intact.
                    const currentEntry = requestedOhlcRepairRef.current.get(requestKey);
                    requestedOhlcRepairRef.current.set(requestKey, {
                        lastAt: currentEntry?.lastAt ?? now,
                        failures: currentEntry?.failures ?? failures,
                        retryAfterUntil: retryAfterMs > 0
                            ? Date.now() + retryAfterMs
                            : currentEntry?.retryAfterUntil,
                    });
                } else {
                    // ok: true but ready: false ΓÇö upstream returned a degraded result.
                    // Count as a failure so the backoff window grows.
                    const currentEntry = requestedOhlcRepairRef.current.get(requestKey);
                    requestedOhlcRepairRef.current.set(requestKey, {
                        lastAt: currentEntry?.lastAt ?? now,
                        failures: (currentEntry?.failures ?? 0) + 1,
                        retryAfterUntil: currentEntry?.retryAfterUntil,
                    });
                }
            }
        }).catch((error) => {
            // Network / abort / WS error ΓÇö increment failure counter.
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                const currentEntry = requestedOhlcRepairRef.current.get(requestKey);
                requestedOhlcRepairRef.current.set(requestKey, {
                    lastAt: currentEntry?.lastAt ?? now,
                    failures: (currentEntry?.failures ?? 0) + 1,
                    retryAfterUntil: currentEntry?.retryAfterUntil,
                });
                if (isOhlcHistoryConsoleDebugEnabled) {
                    console.debug('[Terminal] OHLC gap repair deferred', {
                        symbol: exactSymbol,
                        timeframeMinutes: normalizedTimeframeMinutes,
                        historyLimit,
                        failures: (requestedOhlcRepairRef.current.get(requestKey)?.failures ?? 1),
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
        }).finally(() => {
            window.clearTimeout(timeoutId);
        });
    }, [
        connectAccountId,
        isOhlcHistoryConsoleDebugEnabled,
        storeSymbols,
    ]);

    // Gap-fill: when chart diagnostics show historyGapped/historyStale, POST to the
    // ohlc-gap-fill API which fires targeted fills for each missing time range.
    const requestOhlcGapFill = useCallback((
        symbol: string,
        timeframeMinutes: number,
    ) => {
        if (!connectAccountId || !symbol.trim()) return;
        const normalizedTf = normalizeTerminalTimeframeMinutes(timeframeMinutes);
        const exactSymbol = resolveCatalogSymbolName(
            storeSymbols, symbol, latestStorePricesRef.current, { preserveExact: true },
        ) || symbol.trim();
        const bars = ohlcService.getSyncBars(exactSymbol, normalizedTf, accountSessionScopeId)
            .map((b) => ({ time: b.time }));
        if (bars.length < 2) return;
        void fetch(getTerminalOhlcGapFillUrl(connectAccountId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: exactSymbol, timeframeMinutes: normalizedTf, bars, reason: 'chart-gap-detected' }),
        }).catch(() => {});
    }, [accountSessionScopeId, connectAccountId, storeSymbols]);

    useEffect(() => {
        const currentTimer = selectedOhlcHistoryBackfillTimerRef.current;
        if (!selectedOhlcHistoryBackfillTarget) {
            if (currentTimer) {
                clearTimeout(currentTimer.timeoutId);
                selectedOhlcHistoryBackfillTimerRef.current = null;
            }
            return;
        }

        if (currentTimer?.key === selectedOhlcHistoryBackfillTarget.key) {
            return;
        }

        if (currentTimer) {
            clearTimeout(currentTimer.timeoutId);
        }

        const target = selectedOhlcHistoryBackfillTarget;
        const timeoutId = window.setTimeout(() => {
            if (selectedOhlcHistoryBackfillTimerRef.current?.key !== target.key) {
                return;
            }

            selectedOhlcHistoryBackfillTimerRef.current = null;
            requestSelectedOhlcHistoryRef.current(
                target.symbol,
                TERMINAL_SELECTED_OHLC_HISTORY_BACKFILL_LIMIT,
                target.timeframeMinutes,
            );
        }, TERMINAL_SELECTED_OHLC_HISTORY_BACKFILL_DELAY_MS);

        selectedOhlcHistoryBackfillTimerRef.current = {
            key: target.key,
            timeoutId,
        };

        return () => {
            if (selectedOhlcHistoryBackfillTimerRef.current?.key === target.key) {
                clearTimeout(timeoutId);
                selectedOhlcHistoryBackfillTimerRef.current = null;
            }
        };
    }, [selectedOhlcHistoryBackfillTarget]);

    // Pre-warm OHLC history cache as early as possible so the chart has data when it mounts.
    // This must stay cache-first; repair is driven by diagnostics and should not block first paint.
    useEffect(() => {
        if (isInitialOhlcPrimedRef.current || !isOhlcHistoryClientReady || !selectedBrokerSymbol) {
            return;
        }

        isInitialOhlcPrimedRef.current = true;
        const normalizedTf = normalizeTerminalTimeframeMinutes(chartTimeframeMinutes);

        ohlcService
            .getHistory(
                selectedBrokerSymbol,
                normalizedTf,
                TERMINAL_BOOTSTRAP_OHLC_HISTORY_PRIME_LIMIT,
                { cacheFirst: true, cacheOnly: false },
            )
            .catch(() => null);
    }, [
        isOhlcHistoryClientReady,
        selectedBrokerSymbol,
        chartTimeframeMinutes,
    ]);

    // ΓöÇΓöÇ Debounced gap recovery via WS ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    // Wait 1500ms BEFORE firing recovery. The diagnostics metadata frame arrives
    // FAST (before the actual bar data frame). Without a delay, this effect fires
    // a redundant fetch while the initial WS history response is still in-flight.
    // The timer is cancelled when: chart gets bars, or symbol/TF changes.
    // Only fires if chart still has zero candles after 1500ms ΓåÆ genuinely missing.
    useEffect(() => {
        if (
            !isOhlcHistoryClientReady ||
            !selectedBrokerSymbol ||
            !selectedHistoryTimeframeMinutes ||
            selectedBrokerChartHasCandles ||
            !terminalOhlcHistoryDiagnosticsNeedsRepair(selectedHistoryDiagnostics)
        ) {
            return;
        }

        const symbol = selectedBrokerSymbol;
        const tf = normalizeTerminalTimeframeMinutes(selectedHistoryTimeframeMinutes);

        // Give the initial WS history fetch 1.5s to arrive before we intervene.
        const timer = window.setTimeout(() => {
            // Re-check inside timer ΓÇö bars may have arrived during the grace period.
            if (selectedBrokerChartHasCandles) return;

            // Fast WS path: bypass cache, re-request fresh from MT5 without
            // clearing the shared history marker and reopening duplicate primes.
            void ohlcService.getHistory(symbol, tf, TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT, {
                cacheFirst: false,
                cacheOnly: false,
            }).catch(() => { /* WS failed ΓÇö repair backoff handles next attempt */ });
        }, 1500);

        return () => window.clearTimeout(timer);
    }, [
        connectAccountId,
        isOhlcHistoryClientReady,
        requestTerminalOhlcGapRepair,
        selectedBrokerSymbol,
        selectedBrokerChartHasCandles,
        selectedHistoryDiagnostics,
        selectedHistoryTimeframeMinutes,
    ]);

    // Only fire gap-fill when the data is BOTH gapped AND stale ΓÇö historyGapped alone
    // is normal for forex (weekend/off-hours closures) and should not trigger MT5 fetches.
    useEffect(() => {
        if (
            !isOhlcHistoryClientReady ||
            !selectedBrokerSymbol ||
            !selectedHistoryTimeframeMinutes ||
            !selectedHistoryDiagnostics?.historyGapped ||
            !selectedHistoryDiagnostics?.historyStale
        ) {
            return;
        }
        requestOhlcGapFill(selectedBrokerSymbol, selectedHistoryTimeframeMinutes);
    }, [
        isOhlcHistoryClientReady,
        requestOhlcGapFill,
        selectedBrokerSymbol,
        selectedHistoryDiagnostics?.historyGapped,
        selectedHistoryDiagnostics?.historyStale,
        selectedHistoryTimeframeMinutes,
    ]);

    const primeTerminalMarketData = useCallback((
        symbols: string[],
        options: { requestHistory?: boolean; historyLimit?: number } = {},
    ) => {
        const nextSymbols = resolveCatalogSymbolList(
            storeSymbols,
            symbols,
            latestStorePricesRef.current,
            { preserveExact: true },
        );
        if (nextSymbols.length === 0) {
            return;
        }

        subscribeRealtimeSymbols(nextSymbols);
        if (options.requestHistory) {
            requestOhlcHistoryForSymbols(
                nextSymbols,
                options.historyLimit ?? TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT,
                chartTimeframeMinutes,
            );
        }
    }, [chartTimeframeMinutes, requestOhlcHistoryForSymbols, storeSymbols, subscribeRealtimeSymbols]);

    const refreshTerminalSymbolCatalog = useCallback(async () => {
        const client = storeWsClient;
        if (
            symbolCatalogRefreshInFlightRef.current ||
            !client?.isConnected ||
            !client.isAuthenticated
        ) {
            return false;
        }

        symbolCatalogRefreshInFlightRef.current = true;
        try {
            let marketSymbols: SymbolInfo[] = [];
            try {
                marketSymbols = getTerminalDisplaySymbols(await client.getSymbols());
            } catch {
                marketSymbols = [];
            }

            if (marketSymbols.length === 0) {
                if (!client.isConnected || !client.isAuthenticated) {
                    return false;
                }
                const bootstrapState = await client.getBootstrapState();
                marketSymbols = getTerminalDisplaySymbols(bootstrapState.symbols);
            }

            if (marketSymbols.length === 0) {
                return false;
            }

            setStoreSymbols(marketSymbols);
            setStoreConnectionError(null);
            return true;
        } catch (error) {
            if (isTransientTerminalSymbolRefreshError(error)) {
                return false;
            }
            console.warn('[Terminal] Failed to refresh MT5 symbol catalog', {
                error: error instanceof Error ? error.message : String(error),
            });
            return false;
        } finally {
            symbolCatalogRefreshInFlightRef.current = false;
        }
    }, [setStoreConnectionError, setStoreSymbols, storeWsClient]);

    useEffect(() => {
        if (
            !connectAccountId ||
            !isRealtimeClientReady ||
            storeSymbols.length > 0
        ) {
            return;
        }

        let isCancelled = false;
        const timeoutIds = READY_STATE_REFRESH_RETRY_DELAYS_MS.map((delayMs) =>
            window.setTimeout(() => {
                if (!isCancelled && useWebtraderStore.getState().symbols.length === 0) {
                    void refreshTerminalSymbolCatalog();
                }
            }, delayMs),
        );

        return () => {
            isCancelled = true;
            timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
        };
    }, [
        connectAccountId,
        isRealtimeClientReady,
        refreshTerminalSymbolCatalog,
        storeSymbols.length,
    ]);

    // Seed fallback display symbols when the terminal is not yet ready or preferences haven't loaded.
    useEffect(() => {
        if (terminalConnectionStatus !== 'ready' || !terminalPreferencesLoaded) {
            if (storeSymbols.length === 0) {
                setStoreSymbols(terminalStoreFallbackSymbols);
            }
        }
    }, [terminalConnectionStatus, terminalPreferencesLoaded, storeSymbols.length, setStoreSymbols, terminalStoreFallbackSymbols]);

    // Once the active group catalog settles with real symbols, hydrate an empty or default-fallback store.
    useEffect(() => {
        if (!activeGroupCatalogSettled || activeGroupDisplaySymbols.length === 0) {
            return;
        }
        if (currentIsFallback || storeSymbols.length === 0) {
            setStoreSymbols(activeGroupDisplaySymbols);
            setStoreIsLoadingSymbols(false);
        }
    }, [activeGroupCatalogSettled, activeGroupDisplaySymbols, currentIsFallback, storeSymbols.length, setStoreSymbols, setStoreIsLoadingSymbols]);


    useEffect(() => {
        if (!isRealtimeClientReady || storeSymbols.length === 0) {
            return;
        }

        if (!selectedBrokerSymbol && !hasInitializedTerminalSymbolsRef.current) {
            return;
        }

        const firstPaintSymbols = selectedBrokerChartHasCandles
            ? uniqueTerminalSymbols([
                selectedBrokerSymbol,
                ...DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS,
            ])
            : selectedFirstLoadSymbols;
        primeTerminalMarketData(firstPaintSymbols);
    }, [
        isRealtimeClientReady,
        primeTerminalMarketData,
        selectedBrokerChartHasCandles,
        selectedFirstLoadSymbols,
        selectedBrokerSymbol,
        storeSymbols,
        livePriceSymbolKey,
    ]);

    // Exness-style: keep-alive / open-tab symbols stay warm (history + live quotes)
    // so switching charts is instant with history already in memory.
    useEffect(() => {
        if (!isRealtimeClientReady || renderedChartKeepAliveSymbols.length === 0) {
            return;
        }

        const warmSymbols = uniqueTerminalSymbols(renderedChartKeepAliveSymbols);
        primeTerminalMarketData(warmSymbols, {
            requestHistory: true,
            historyLimit: TERMINAL_BACKGROUND_OHLC_PREWARM_LIMIT,
        });

        const normalizedTf = normalizeTerminalTimeframeMinutes(chartTimeframeMinutes);
        for (const symbol of warmSymbols) {
            prewarmTerminalChartSwitchSeed({
                accountSessionScopeId,
                symbol,
                timeframeMinutes: normalizedTf,
            });
        }
    }, [
        accountSessionScopeId,
        chartTimeframeMinutes,
        isRealtimeClientReady,
        primeTerminalMarketData,
        renderedChartKeepAliveSymbols,
    ]);

    // Subscribe to real-time POSITION_UPDATE push events from the C++ backend.
    // C++ broadcasts positions via publishTerminalStateSnapshot after every trade,
    // so this keeps the table current without any polling round-trip.
    useEffect(() => {
        if (!storeWsClient) return;
        const unsub = storeWsClient.addStreamListener<WebtraderPosition[] | {
            action?: 'added' | 'modified' | 'deleted';
            position?: WebtraderPosition;
            positions?: WebtraderPosition[];
        }>('account.positions', (message) => {
            const streamPayload = message.payload;
            const positions = Array.isArray(streamPayload)
                ? streamPayload
                : streamPayload && Array.isArray(streamPayload.positions)
                    ? streamPayload.positions
                    : null;
            const positionPayload = !Array.isArray(streamPayload) && streamPayload?.position
                ? streamPayload
                : null;
            const latestSource = latestPositionsRefreshSourceRef.current;
            if (
                latestSource.accountId !== connectAccountId ||
                latestSource.wsClient !== storeWsClient
            ) {
                return;
            }

            if (Array.isArray(positions)) {
                const scopedPositions = filterTerminalPositionsForAccount(positions, connectAccountId);
                if (shouldDeferEmptyTerminalPositionsStreamSnapshot({
                    incomingPositions: scopedPositions,
                    currentPositions: useWebtraderStore.getState().positions,
                    positionsRefreshInFlight: positionsRefreshInFlightRef.current,
                    accountId: connectAccountId,
                    wsClient: storeWsClient,
                    terminalConnectionStatus,
                })) {
                    return;
                }

                applyPositionsForActiveAccount(scopedPositions);
                setPositionsLoadState({ isLoading: false, error: null, warning: null });
                return;
            }

            if (positionPayload?.position) {
                const currentPositions = useWebtraderStore.getState().positions;
                const incomingPosition = positionPayload.position;
                if (!terminalPositionMatchesAccount(incomingPosition, connectAccountId)) {
                    return;
                }
                const action = positionPayload.action ?? 'modified';
                const nextPositions = action === 'deleted'
                    ? currentPositions.filter((position) => position.ticket !== incomingPosition.ticket)
                    : (() => {
                        const existingIndex = currentPositions.findIndex(
                            (position) => position.ticket === incomingPosition.ticket,
                        );
                        if (existingIndex < 0) {
                            return [...currentPositions, incomingPosition];
                        }

                        const updatedPositions = currentPositions.slice();
                        updatedPositions[existingIndex] = incomingPosition;
                        return updatedPositions;
                    })();

                applyPositionsForActiveAccount(nextPositions);
                setPositionsLoadState({ isLoading: false, error: null, warning: null });
            }
        });
        return unsub;
    }, [applyPositionsForActiveAccount, connectAccountId, storeWsClient, terminalConnectionStatus]);

    useEffect(() => {
        if (!storeWsClient) return;

        const unsub = storeWsClient.addStreamListener<{ account?: TradingAccountInfo } | TradingAccountInfo>(
            'account.balance',
            (message) => {
                const payload = message.payload;
                const account: TradingAccountInfo | undefined =
                    payload && typeof payload === 'object' && 'account' in payload
                        ? (payload as { account?: TradingAccountInfo }).account
                        : (payload as TradingAccountInfo | undefined);

                if (terminalAccountInfoMatchesActiveAccount(activeTradingAccount, account)) {
                    setStoreAccountInfo(account);
                }
            },
        );

        return unsub;
    }, [activeTradingAccount, setStoreAccountInfo, storeWsClient]);

    useEffect(() => {
        if (!connectAccountId || !storeWsClient?.isConnected || !storeWsClient.isAuthenticated) {
            return;
        }

        const previousSource = immediatePositionsRequestSourceRef.current;
        if (
            previousSource.accountId === connectAccountId &&
            previousSource.wsClient === storeWsClient
        ) {
            return;
        }

        immediatePositionsRequestSourceRef.current = {
            accountId: connectAccountId,
            wsClient: storeWsClient,
        };

        let isCancelled = false;
        let hasAppliedSnapshot = false;
        let hasAppliedNonEmptySnapshot = false;
        const isCurrentImmediatePositionsSource = () => {
            if (isCancelled) {
                return false;
            }
            const latestSource = latestPositionsRefreshSourceRef.current;
            return latestSource.accountId === connectAccountId &&
                latestSource.wsClient === storeWsClient;
        };
        const applyImmediatePositionsSnapshot = (positions: WebtraderPosition[]) => {
            if (!isCurrentImmediatePositionsSource()) {
                return false;
            }
            const scopedPositions = filterTerminalPositionsForAccount(positions, connectAccountId);
            if (scopedPositions.length === 0 && hasAppliedNonEmptySnapshot) {
                return false;
            }
            applyPositionsForActiveAccount(scopedPositions);
            setPositionsLoadState({ isLoading: false, error: null, warning: null });
            hasResolvedOpenPositionsRef.current = true;
            hasAppliedSnapshot = true;
            hasAppliedNonEmptySnapshot = hasAppliedNonEmptySnapshot || scopedPositions.length > 0;
            return true;
        };
        const restCachePositionsRequest: Promise<WebtraderPosition[] | null> =
            shouldUseTerminalRestPositions
                ? fetchTerminalRestPositions(connectAccountId)
                    .catch((error) => {
                        console.warn('[Terminal] Immediate REST positions cache lookup failed', {
                            accountId: connectAccountId,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        return null;
                    })
                : Promise.resolve(null);

        void restCachePositionsRequest.then((positions) => {
            if (positions) {
                applyImmediatePositionsSnapshot(positions);
            }
        });

        void storeWsClient.getPositions()
            .then(async (positions) => {
                if (applyImmediatePositionsSnapshot(positions)) {
                    return;
                }
                if (!isCurrentImmediatePositionsSource()) {
                    return;
                }

                const cachedPositions = await restCachePositionsRequest;
                if (cachedPositions && applyImmediatePositionsSnapshot(cachedPositions)) {
                    return;
                }

                if (hasAppliedSnapshot || positions.length > 0) {
                    return;
                }

                if (!shouldUseTerminalRestPositions) {
                    return;
                }

                let resolvedPositions: WebtraderPosition[];
                try {
                    resolvedPositions = await fetchTerminalRestPositions(connectAccountId, { force: true });
                } catch (error) {
                    if (isCurrentImmediatePositionsSource()) {
                        console.warn('[Terminal] Immediate REST positions recovery failed', {
                            accountId: connectAccountId,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        setPositionsLoadState(
                            getTerminalPositionsRefreshFailureState(
                                createTerminalPositionsRestFallbackError(error),
                            ),
                        );
                    }
                    return;
                }

                applyImmediatePositionsSnapshot(resolvedPositions);
            })
            .catch(async (error) => {
                if (!isCurrentImmediatePositionsSource()) {
                    return;
                }

                console.warn('[Terminal] Immediate positions snapshot failed', {
                    accountId: connectAccountId,
                    error: error instanceof Error ? error.message : String(error),
                });

                const cachedPositions = await restCachePositionsRequest;
                if (cachedPositions && applyImmediatePositionsSnapshot(cachedPositions)) {
                    return;
                }
                if (hasAppliedSnapshot) {
                    return;
                }

                if (!shouldUseTerminalRestPositions) {
                    return;
                }

                try {
                    const forcedPositions = await fetchTerminalRestPositions(connectAccountId, { force: true });
                    applyImmediatePositionsSnapshot(forcedPositions);
                } catch (fallbackError) {
                    if (isCurrentImmediatePositionsSource()) {
                        console.warn('[Terminal] Immediate REST positions recovery failed', {
                            accountId: connectAccountId,
                            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                        });
                        setPositionsLoadState(
                            getTerminalPositionsRefreshFailureState(
                                createTerminalPositionsRestFallbackError(fallbackError),
                            ),
                        );
                    }
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [applyPositionsForActiveAccount, connectAccountId, shouldUseTerminalRestPositions, storeWsClient]);

    useEffect(() => {
        if (storeSymbols.length === 0) {
            return;
        }

        if (
            connectAccountId &&
            terminalConnectionStatus === 'ready' &&
            !terminalLaunchSession.isActive &&
            currentIsFallback &&
            !activeGroupCatalogSettled
        ) {
            return;
        }

        const latestPrices = latestStorePricesRef.current;
        const defaultSymbols = resolveDefaultTerminalSymbols(storeSymbols, latestPrices);
        if (!terminalPreferencesLoaded && defaultSymbols.length === 0) {
            return;
        }

        const initializationKey = `${connectAccountId ?? 'terminal'}:${storeSymbolCatalogKey}:${terminalPreferencesBootstrapKey}`;
        if (initializedTerminalStateKeyRef.current === initializationKey) {
            return;
        }
        initializedTerminalStateKeyRef.current = initializationKey;

        hasInitializedTerminalSymbolsRef.current = true;
        if (terminalPreferences) {
            persistedTerminalStateKeyRef.current = buildTerminalPreferencesStateKey({
                accountId: connectAccountId,
                selectedSymbol: terminalBootstrapState.nextSymbol,
                openTabs: terminalBootstrapState.nextTabs,
                watchlistSymbols: terminalBootstrapState.nextWatchlist,
                chartTimeframeMinutes,
                chartType,
                chartLayoutPanes,
                chartBarSpacing,
            });
        }
        setWatchlistSymbols((current) => areSymbolListsEqual(current, terminalBootstrapState.nextWatchlist) ? current : terminalBootstrapState.nextWatchlist);
        setOpenTabs((current) => areSymbolListsEqual(current, terminalBootstrapState.nextTabs) ? current : terminalBootstrapState.nextTabs);
        setSelectedSymbol((current) => current === terminalBootstrapState.nextSymbol ? current : terminalBootstrapState.nextSymbol);
        setSelectedSymbolAccountId(connectAccountId ?? null);
    }, [
        chartBarSpacing,
        chartLayoutPanes,
        chartTimeframeMinutes,
        chartType,
        connectAccountId,
        currentIsFallback,
        activeGroupCatalogSettled,
        livePriceSymbolKey,
        terminalPreferences,
        terminalBootstrapState,
        terminalPreferencesBootstrapKey,
        storeSymbolCatalogKey,
        storeSymbols,
        terminalConnectionStatus,
        terminalLaunchSession.isActive,
        terminalPreferencesLoaded,
    ]);

    useEffect(() => {
        const bootstrapQuotePrewarmKey = `${connectAccountId ?? 'terminal'}:${storeSymbolCatalogKey}:${terminalPreferencesBootstrapKey}`;
        if (
            isQuoteClientReady &&
            bootstrapQuotePrewarmSymbols.length > 0 &&
            terminalBootstrapQuotePrewarmKeyRef.current !== bootstrapQuotePrewarmKey
        ) {
            const quoteTimer = window.setTimeout(() => {
                subscribeRealtimeSymbols(bootstrapQuotePrewarmSymbols);
                terminalBootstrapQuotePrewarmKeyRef.current = bootstrapQuotePrewarmKey;
            }, TERMINAL_BOOTSTRAP_QUOTE_PREWARM_DELAY_MS);

            return () => window.clearTimeout(quoteTimer);
        }
    }, [
        bootstrapQuotePrewarmSymbols,
        connectAccountId,
        isQuoteClientReady,
        storeSymbolCatalogKey,
        subscribeRealtimeSymbols,
        terminalPreferencesBootstrapKey,
    ]);

    useEffect(() => {
        const bootstrapHistoryPrewarmKey = `${connectAccountId ?? 'terminal'}:${storeSymbolCatalogKey}:${terminalPreferencesBootstrapKey}`;
        const backgroundHistorySymbols = terminalBootstrapState.historyPrewarmSymbols.filter(
            (symbol) => !selectedBrokerSymbol || !symbolsMatch(symbol, selectedBrokerSymbol),
        );

        if (
            storeSymbols.length > 0 &&
            isOhlcHistoryClientReady &&
            backgroundHistorySymbols.length > 0 &&
            terminalBootstrapHistoryPrewarmKeyRef.current !== bootstrapHistoryPrewarmKey
        ) {
            const historyTimer = window.setTimeout(() => {
                requestOhlcHistoryForSymbols(
                    backgroundHistorySymbols,
                    TERMINAL_BACKGROUND_OHLC_PREWARM_LIMIT,
                    chartTimeframeMinutes,
                );
                terminalBootstrapHistoryPrewarmKeyRef.current = bootstrapHistoryPrewarmKey;
            }, TERMINAL_BOOTSTRAP_OHLC_HISTORY_PREWARM_DELAY_MS);

            return () => window.clearTimeout(historyTimer);
        }
    }, [
        chartTimeframeMinutes,
        connectAccountId,
        isOhlcHistoryClientReady,
        requestOhlcHistoryForSymbols,
        selectedBrokerSymbol,
        storeSymbolCatalogKey,
        storeSymbols.length,
        terminalBootstrapState,
        terminalPreferencesBootstrapKey,
    ]);

    // Reactive OHLC pre-warm stays bounded to default hot symbols plus the selected chart.
    // Persisted watchlists can contain broad catalogs/variants and must not fan out live OHLC.
    useEffect(() => {
        if (!isOhlcHistoryClientReady) return;
        const boundedPrewarmSymbols = uniqueTerminalSymbols(DEFAULT_FIRST_RUN_TERMINAL_SYMBOLS).filter(
            (symbol) => !selectedBrokerSymbol || !symbolsMatch(symbol, selectedBrokerSymbol),
        );
        if (boundedPrewarmSymbols.length === 0) return;
        const prewarmKey = `${connectAccountId ?? accountSessionScopeId ?? 'terminal'}:${selectedBrokerSymbol || 'none'}:${boundedPrewarmSymbols.join(',')}`;
        if (watchlistOhlcPrewarmKeyRef.current === prewarmKey) return;
        const timer = setTimeout(() => {
            watchlistOhlcPrewarmKeyRef.current = prewarmKey;
            requestOhlcHistoryForSymbolsRef.current(
                boundedPrewarmSymbols,
                TERMINAL_BACKGROUND_OHLC_PREWARM_LIMIT,
                chartTimeframeMinutes,
            );
        }, TERMINAL_REACTIVE_OHLC_HISTORY_PREWARM_DELAY_MS);
        return () => clearTimeout(timer);
    }, [accountSessionScopeId, chartTimeframeMinutes, connectAccountId, isOhlcHistoryClientReady, selectedBrokerSymbol]);

    useEffect(() => {
        const client = quoteWsClient;
        const subscriptionSymbols = client ? getSymbolsFromListKey(activeLiveSubscriptionSymbolsKey) : [];
        const previousState = marketQuoteSubscriptionsRef.current;
        const selectedQuoteState = selectedQuoteSubscriptionsRef.current;
        const previousClient = previousState?.client ?? null;
        const previousSymbols = previousState?.symbols ?? [];
        const nextSymbolsForPreviousClient = previousClient === client
            ? subscriptionSymbols
            : selectedQuoteState?.client === previousClient
                ? selectedQuoteState.symbols
                : [];
        const protectedSymbols = previousClient === client
            ? getSymbolsFromListKey(selectedSubscriptionSymbolsKey)
            : [];
        const removedSymbols = getRemovedSubscriptionSymbols(
            previousSymbols,
            nextSymbolsForPreviousClient,
            protectedSymbols,
        );

        if (previousClient && removedSymbols.length > 0) {
            void previousClient.unsubscribeSymbols(removedSymbols).catch((error) => {
                console.error('[Terminal] Failed to unsubscribe market symbols', {
                    count: removedSymbols.length,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        }

        if (!client) {
            marketQuoteSubscriptionsRef.current = null;
            return;
        }

        marketQuoteSubscriptionsRef.current = {
            client,
            symbols: subscriptionSymbols,
        };

        if (
            !isQuoteClientReady ||
            subscriptionSymbols.length === 0
        ) {
            return;
        }

        void client.subscribeSymbols(subscriptionSymbols).catch((error) => {
            console.error('[Terminal] Failed to subscribe market symbols', {
                count: subscriptionSymbols.length,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }, [
        activeLiveSubscriptionSymbolsKey,
        isQuoteClientReady,
        quoteWsClient,
        selectedSubscriptionSymbolsKey,
    ]);

    useEffect(() => {
        const client = quoteWsClient;
        const subscriptionSymbols = client ? getSymbolsFromListKey(selectedSubscriptionSymbolsKey) : [];
        const previousState = selectedQuoteSubscriptionsRef.current;
        const previousClient = previousState?.client ?? null;
        const previousSymbols = previousState?.symbols ?? [];
        const nextSymbolsForPreviousClient = previousClient === client ? subscriptionSymbols : [];
        const protectedSymbols = previousClient === client
            ? getSymbolsFromListKey(activeLiveSubscriptionSymbolsKey)
            : [];
        const removedSymbols = getRemovedSubscriptionSymbols(
            previousSymbols,
            nextSymbolsForPreviousClient,
            protectedSymbols,
        );

        if (previousClient && removedSymbols.length > 0) {
            void previousClient.unsubscribeSymbols(removedSymbols).catch((error) => {
                console.error('[Terminal] Failed to unsubscribe selected symbol', {
                    symbols: removedSymbols,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        }

        if (!client) {
            selectedQuoteSubscriptionsRef.current = null;
            return;
        }

        selectedQuoteSubscriptionsRef.current = {
            client,
            symbols: subscriptionSymbols,
        };

        if (
            !isQuoteClientReady ||
            !selectedBrokerSymbol ||
            subscriptionSymbols.length === 0
        ) {
            return;
        }

        void client.subscribeSymbols(subscriptionSymbols).catch((error) => {
            console.error('[Terminal] Failed to subscribe selected symbol', {
                symbol: selectedBrokerSymbol,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }, [
        activeLiveSubscriptionSymbolsKey,
        isQuoteClientReady,
        quoteWsClient,
        selectedBrokerSymbol,
        selectedSubscriptionSymbolsKey,
    ]);

    useEffect(() => () => {
        const subscriptionsByClient = new Map<NonNullable<typeof quoteWsClient>, string[]>();
        [marketQuoteSubscriptionsRef.current, selectedQuoteSubscriptionsRef.current].forEach((state) => {
            if (!state?.client || state.symbols.length === 0) {
                return;
            }

            subscriptionsByClient.set(
                state.client,
                uniqueTerminalSymbols([
                    ...(subscriptionsByClient.get(state.client) ?? []),
                    ...state.symbols,
                ]),
            );
        });

        subscriptionsByClient.forEach((symbols, client) => {
            void client.unsubscribeSymbols(symbols).catch((error) => {
                console.error('[Terminal] Failed to unsubscribe quote symbols on unmount', {
                    count: symbols.length,
                    error: error instanceof Error ? error.message : String(error),
                });
            });
        });

        marketQuoteSubscriptionsRef.current = null;
        selectedQuoteSubscriptionsRef.current = null;
    }, []);

    const terminalPreferencesStateKey = useMemo(
        () => buildTerminalPreferencesStateKey({
            accountId: connectAccountId,
            selectedSymbol,
            openTabs,
            watchlistSymbols,
            chartTimeframeMinutes,
            chartType,
            chartLayoutPanes,
            chartBarSpacing,
        }),
        [chartBarSpacing, chartLayoutPanes, chartTimeframeMinutes, chartType, connectAccountId, openTabs, selectedSymbol, watchlistSymbols],
    );

    useEffect(() => {
        if (
            !connectAccountId ||
            terminalLaunchSession.isActive ||
            !terminalPreferencesLoaded ||
            !hasInitializedTerminalSymbolsRef.current ||
            storeSymbols.length === 0
        ) {
            return;
        }

        if (terminalPreferencesPersistTimerRef.current !== null) {
            clearTimeout(terminalPreferencesPersistTimerRef.current);
        }

        terminalPreferencesPersistTimerRef.current = setTimeout(() => {
            terminalPreferencesPersistTimerRef.current = null;

            if (persistedTerminalStateKeyRef.current === terminalPreferencesStateKey) {
                return;
            }

            const latestPrices = latestStorePricesRef.current;
            const latestSymbols = latestStoreSymbolsRef.current;
            const catalogSymbols = latestSymbols;
            const payload = {
                accountId: connectAccountId,
                selectedSymbol: selectedSymbol || null,
                openTabs: resolveCatalogSymbolList(
                    catalogSymbols,
                    openTabs,
                    latestPrices,
                    { preserveExact: true },
                ),
                watchlistSymbols: resolveCatalogSymbolList(
                    catalogSymbols,
                    watchlistSymbols,
                    latestPrices,
                    { preserveExact: true },
                ),
                timeframeMinutes: chartTimeframeMinutes,
                chartType,
                chartLayoutPanes,
                chartBarSpacing,
            };

            persistedTerminalStateKeyRef.current = terminalPreferencesStateKey;
            void saveTerminalPreferences(payload).then((saved) => {
                if (!saved && persistedTerminalStateKeyRef.current === terminalPreferencesStateKey) {
                    persistedTerminalStateKeyRef.current = null;
                }
            });
        }, TERMINAL_PREFERENCES_PERSIST_DEBOUNCE_MS);

        return () => {
            if (terminalPreferencesPersistTimerRef.current !== null) {
                clearTimeout(terminalPreferencesPersistTimerRef.current);
                terminalPreferencesPersistTimerRef.current = null;
            }
        };
    }, [
        connectAccountId,
        terminalLaunchSession.isActive,
        chartBarSpacing,
        chartLayoutPanes,
        chartTimeframeMinutes,
        chartType,
        openTabs,
        selectedSymbol,
        storeSymbolCatalogKey,
        storeSymbols.length,
        terminalPreferencesLoaded,
        terminalPreferencesStateKey,
        watchlistSymbols,
    ]);

    const handleVisibleMarketSearchSymbolsChange = useCallback((symbols: string[]) => {
        const nextSymbols = resolveCatalogSymbolList(
            storeSymbols,
            symbols,
            latestStorePricesRef.current,
            { preserveExact: true },
        );

        startTransition(() => {
            setVisibleMarketSearchSymbols((current) => {
                if (areSymbolListsEqual(current, nextSymbols)) {
                    return current;
                }

                return nextSymbols;
            });
        });
    }, [storeSymbols]);

    const refreshLiveTradingState = useCallback(async (
        options: TerminalPositionsRefreshOptions = {},
    ) => {
        if (!isTerminalMountedRef.current) {
            return {
                accountInfoUpdated: false,
                positionsUpdated: false,
                ordersUpdated: false,
            };
        }

        // Trade commands use the same authenticated transport as account snapshots.
        // Do not let read-only refresh traffic get ahead of an order acknowledgement.
        if (activeOrderMutationCountRef.current > 0) {
            return {
                accountInfoUpdated: false,
                positionsUpdated: false,
                ordersUpdated: false,
            };
        }

        if (!storeWsClient?.isConnected || !storeWsClient.isAuthenticated) {
            setPositionsLoadState((current) => ({ ...current, isLoading: false }));
            return {
                accountInfoUpdated: false,
                positionsUpdated: false,
                ordersUpdated: false,
            };
        }

        const currentPositionsRefresh = positionsRefreshInFlightRef.current;
        const shouldCoalescePositionsRefresh =
            options.coalescePositionsRefresh === true &&
            currentPositionsRefresh !== null &&
            currentPositionsRefresh.accountId === connectAccountId &&
            currentPositionsRefresh.wsClient === storeWsClient;
        const positionsRefreshRequestSeq = shouldCoalescePositionsRefresh
            ? currentPositionsRefresh!.requestSeq
            : positionsRefreshRequestSeqRef.current + 1;
        if (!shouldCoalescePositionsRefresh) {
            positionsRefreshRequestSeqRef.current = positionsRefreshRequestSeq;
        }
        const requestPositionsAccountId = connectAccountId;
        const requestPositionsClient = storeWsClient;
        const isLatestPositionsRefreshRequest = () =>
            positionsRefreshRequestSeqRef.current === positionsRefreshRequestSeq;
        const isCurrentPositionsRefreshSource = () => {
            const latestSource = latestPositionsRefreshSourceRef.current;
            return (
                latestSource.accountId === requestPositionsAccountId &&
                latestSource.wsClient === requestPositionsClient
            );
        };
        const clearPositionsRefreshSettleTimer = () => {
            if (positionsRefreshSettleTimeoutRef.current !== null) {
                window.clearTimeout(positionsRefreshSettleTimeoutRef.current);
                positionsRefreshSettleTimeoutRef.current = null;
            }
            positionsRefreshSettleDeadlineRef.current = null;
        };
        const schedulePositionsRefreshSettleTimer = (delayMs: number, deadlineMs: number) => {
            if (positionsRefreshSettleTimeoutRef.current !== null) {
                window.clearTimeout(positionsRefreshSettleTimeoutRef.current);
            }

            positionsRefreshSettleDeadlineRef.current = deadlineMs;
            const timeoutId = window.setTimeout(() => {
                if (positionsRefreshSettleTimeoutRef.current === timeoutId) {
                    positionsRefreshSettleTimeoutRef.current = null;
                    positionsRefreshSettleDeadlineRef.current = null;
                }

                if (!isTerminalMountedRef.current || !isLatestPositionsRefreshRequest()) {
                    return;
                }

                setPositionsLoadState(
                    getTerminalPositionsTransientSettledState(),
                );
            }, delayMs);
            positionsRefreshSettleTimeoutRef.current = timeoutId;
        };

        const showPositionsLoading = options.showPositionsLoading ?? true;
        if (showPositionsLoading) {
            const hasKnownPositionsState =
                hasResolvedOpenPositionsRef.current ||
                useWebtraderStore.getState().positions.length > 0;
            setPositionsLoadState((current) => ({
                isLoading: !hasKnownPositionsState,
                error: hasKnownPositionsState ? current.error : null,
                warning: hasKnownPositionsState ? current.warning ?? null : null,
            }));
            const settleDeadlineMs = Date.now() + TERMINAL_POSITIONS_REFRESH_SETTLE_MS;
            schedulePositionsRefreshSettleTimer(
                TERMINAL_POSITIONS_REFRESH_SETTLE_MS,
                settleDeadlineMs,
            );
        } else if (positionsRefreshSettleDeadlineRef.current !== null) {
            schedulePositionsRefreshSettleTimer(
                Math.max(0, positionsRefreshSettleDeadlineRef.current - Date.now()),
                positionsRefreshSettleDeadlineRef.current,
            );
        }

        const positionsRequest = shouldCoalescePositionsRefresh
            ? currentPositionsRefresh!.promise
            : storeWsClient.getPositions(
                options.forcePositionsRefresh
                    ? {
                        force: true,
                        coalesceInFlight: options.coalescePositionsRefresh === true,
                    }
                    : undefined,
            );
        if (!shouldCoalescePositionsRefresh) {
            positionsRefreshInFlightRef.current = {
                promise: positionsRequest,
                accountId: requestPositionsAccountId,
                wsClient: requestPositionsClient,
                requestSeq: positionsRefreshRequestSeq,
            };
        }
        const ordersRequest: Promise<WebtraderOrder[]> = storeWsClient.getOrders();
        const [nextPositions, nextOrders] = await Promise.allSettled([positionsRequest, ordersRequest]);
        if (positionsRefreshInFlightRef.current?.promise === positionsRequest) {
            positionsRefreshInFlightRef.current = null;
        }

        if (!isTerminalMountedRef.current) {
            return {
                accountInfoUpdated: false,
                positionsUpdated: false,
                ordersUpdated: false,
            };
        }

        let accountInfoUpdated = false;
        let positionsUpdated = false;
        let ordersUpdated = false;
        let authoritativePositions = nextPositions;
        const shouldTryRestPositionsFallback =
            shouldUseTerminalRestPositions &&
            Boolean(requestPositionsAccountId) &&
            isCurrentPositionsRefreshSource() &&
            (terminalConnectionStatus === 'ready' || terminalConnectionStatus === 'locked') &&
            (
                nextPositions.status === 'fulfilled'
                    ? nextPositions.value.length === 0
                    : isTransientTerminalPositionRefreshError(nextPositions.reason)
        );
        if (shouldTryRestPositionsFallback && requestPositionsAccountId) {
            try {
                const restPositions = await fetchTerminalRestPositions(requestPositionsAccountId, { force: true });
                authoritativePositions = {
                    status: 'fulfilled',
                    value: restPositions,
                };
            } catch (error) {
                if (nextPositions.status === 'rejected') {
                    authoritativePositions = nextPositions;
                } else {
                    authoritativePositions = {
                        status: 'rejected',
                        reason: createTerminalPositionsRestFallbackError(error),
                    };
                }
            }
        }

        if (!isTerminalMountedRef.current) {
            return {
                accountInfoUpdated,
                positionsUpdated,
                ordersUpdated,
            };
        }

        if (nextOrders.status === 'fulfilled') {
            setStoreOrders(nextOrders.value);
            ordersUpdated = true;
        }

        if (authoritativePositions.status === 'fulfilled') {
            const isCurrentPositionsSource = isCurrentPositionsRefreshSource();
            const scopedAuthoritativePositions = filterTerminalPositionsForAccount(
                authoritativePositions.value,
                requestPositionsAccountId,
            );
            const hasOnlyMismatchedPositions = authoritativePositions.value.length > 0 && scopedAuthoritativePositions.length === 0;
            const shouldApplyPositionsSuccess =
                isCurrentPositionsSource &&
                !hasOnlyMismatchedPositions &&
                (isLatestPositionsRefreshRequest() || scopedAuthoritativePositions.length > 0);
            if (shouldApplyPositionsSuccess) {
                clearPositionsRefreshSettleTimer();
                hasResolvedOpenPositionsRef.current = true;
                setPositionsLoadState({ isLoading: false, error: null, warning: null });
                applyPositionsForActiveAccount(scopedAuthoritativePositions);
                positionsUpdated = true;
            }
        } else if (isLatestPositionsRefreshRequest()) {
            clearPositionsRefreshSettleTimer();
            setPositionsLoadState(
                getTerminalPositionsRefreshFailureState(
                    authoritativePositions.reason,
                ),
            );
        }

        const [nextAccountInfo] = await Promise.allSettled([
            storeWsClient.getAccountInfo(),
        ]);
        if (!isTerminalMountedRef.current) {
            return {
                accountInfoUpdated,
                positionsUpdated,
                ordersUpdated,
            };
        }

        if (
            nextAccountInfo.status === 'fulfilled' &&
            terminalAccountInfoMatchesActiveAccount(activeTradingAccount, nextAccountInfo.value)
        ) {
            setStoreAccountInfo(nextAccountInfo.value);
            accountInfoUpdated = true;
        }

        return {
            accountInfoUpdated,
            positionsUpdated,
            ordersUpdated,
        };
    }, [activeTradingAccount, applyPositionsForActiveAccount, connectAccountId, setStoreAccountInfo, setStoreOrders, shouldUseTerminalRestPositions, storeWsClient, terminalConnectionStatus]);

    const schedulePostTradeRefresh = useCallback((
        delayOrDelaysMs: number | readonly number[],
        onError: (error: unknown) => void = () => {},
    ) => {
        if (!isTerminalMountedRef.current) {
            return;
        }

        delayedPostTradeRefreshTimeoutsRef.current.forEach((timeoutId) => {
            window.clearTimeout(timeoutId);
        });
        delayedPostTradeRefreshTimeoutsRef.current.clear();

        const delaysMs = typeof delayOrDelaysMs === 'number'
            ? [delayOrDelaysMs]
            : [...delayOrDelaysMs];
        for (const delayMs of [...new Set(delaysMs)]) {
            const timeoutId = window.setTimeout(() => {
                delayedPostTradeRefreshTimeoutsRef.current.delete(timeoutId);
                if (!isTerminalMountedRef.current) {
                    return;
                }

                void refreshLiveTradingState({
                    forcePositionsRefresh: true,
                    coalescePositionsRefresh: true,
                }).catch(onError);
            }, Math.max(0, delayMs));
            delayedPostTradeRefreshTimeoutsRef.current.add(timeoutId);
        }
    }, [refreshLiveTradingState]);

    const consumePendingOrderConfirmation = useCallback((id: number): PendingTerminalOrderConfirmation | null => {
        const pending = pendingOrderConfirmationsRef.current.get(id) ?? null;
        if (!pending) {
            return null;
        }

        const timeoutId = pendingOrderConfirmationTimeoutsRef.current.get(id);
        if (timeoutId !== undefined) {
            window.clearTimeout(timeoutId);
            pendingOrderConfirmationTimeoutsRef.current.delete(id);
        }
        pendingOrderConfirmationsRef.current.delete(id);

        return pending;
    }, []);

    const clearPendingOrderConfirmation = useCallback((id: number) => {
        void consumePendingOrderConfirmation(id);
    }, [consumePendingOrderConfirmation]);

    const registerPendingOrderConfirmation = useCallback((
        message: string,
        correlation: PendingTerminalOrderCorrelation,
    ): number => {
        const id = pendingOrderConfirmationSeqRef.current + 1;
        pendingOrderConfirmationSeqRef.current = id;
        const expiresAtMs = Date.now() + 60_000;
        pendingOrderConfirmationsRef.current.set(id, {
            id,
            message,
            expiresAtMs,
            confirmed: false,
            correlation,
        });

        const timeoutId = window.setTimeout(() => {
            pendingOrderConfirmationsRef.current.delete(id);
            pendingOrderConfirmationTimeoutsRef.current.delete(id);
        }, Math.max(0, expiresAtMs - Date.now()));
        pendingOrderConfirmationTimeoutsRef.current.set(id, timeoutId);

        return id;
    }, []);

    useEffect(() => {
        if (!storeWsClient) {
            return;
        }

        const unsub = storeWsClient.addStreamListener('trade.execution', (message) => {
            const retcode = parseTerminalTradeRetcode(getTerminalTradeResultRetcode(message.payload));
            const MT5_SUCCESS_CODES = TERMINAL_TRADE_SUCCESS_RETCODES;
            if (retcode === null || !MT5_SUCCESS_CODES.has(retcode)) {
                return;
            }

            const now = Date.now();
            for (const pendingOrderConfirmation of pendingOrderConfirmationsRef.current.values()) {
                if (now > pendingOrderConfirmation.expiresAtMs) {
                    clearPendingOrderConfirmation(pendingOrderConfirmation.id);
                    continue;
                }
                if (
                    pendingOrderConfirmation.confirmed ||
                    !terminalTradeExecutionMatchesPendingOrder(
                        message.payload,
                        pendingOrderConfirmation.correlation,
                    )
                ) {
                    continue;
                }

                applyTerminalTradeResultCorrelation(pendingOrderConfirmation.correlation, message.payload);
                pendingOrderConfirmation.confirmed = true;
                handleShowToast('success', 'Order submitted', pendingOrderConfirmation.message);
                break;
            }
        });

        return unsub;
    }, [clearPendingOrderConfirmation, handleShowToast, storeWsClient]);

    const waitForPostTradeReconciliation = useCallback((
        options: TerminalPostTradeReconciliationOptions,
    ): Promise<TerminalPostTradeReconciliationResult> => {
        const requestAccountId = connectAccountId;
        const requestAccountKey = getTerminalPositionsAccountCacheKey(requestAccountId);
        const beforePositions = filterTerminalPositionsForAccount(options.beforePositions, requestAccountId);
        const beforePositionsSignature = getTerminalPositionExecutionSignature(beforePositions);
        const beforeAccountInfoSignature = getTerminalAccountInfoSignature(options.beforeAccountInfo);
        const timeoutMs = options.timeoutMs ?? TERMINAL_POST_TRADE_RECONCILE_TIMEOUT_MS;
        const refreshDelaysMs = options.refreshDelaysMs ?? TERMINAL_POST_TRADE_RECONCILE_REFRESH_DELAYS_MS;

        let resolved = false;
        let tradeResultSucceeded = false;
        let lastRefreshError: unknown = null;
        const timeoutIds = new Set<number>();
        const unsubscribers: Array<() => void> = [];

        const isCurrentAccount = () => (
            isTerminalMountedRef.current &&
            (!requestAccountKey || activePositionsAccountKeyRef.current === requestAccountKey)
        );

        const readCurrentSnapshot = () => {
            const state = useWebtraderStore.getState();
            const positions = filterTerminalPositionsForAccount(state.positions, requestAccountId);
            const positionsChanged = getTerminalPositionExecutionSignature(positions) !== beforePositionsSignature;
            const positionsSettled = options.expectPositions
                ? options.expectPositions(positions)
                : positionsChanged;
            const accountInfoUpdated =
                terminalAccountInfoMatchesActiveAccount(activeTradingAccount, state.accountInfo) &&
                getTerminalAccountInfoSignature(state.accountInfo) !== beforeAccountInfoSignature;

            return {
                positions,
                positionsSettled,
                positionsChanged,
                accountInfoUpdated,
            };
        };

        return new Promise<TerminalPostTradeReconciliationResult>((resolve) => {
            const cleanup = () => {
                timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
                timeoutIds.clear();
                unsubscribers.forEach((unsubscribe) => unsubscribe());
                unsubscribers.length = 0;
            };

            const finish = (timedOut: boolean) => {
                if (resolved) {
                    return;
                }

                resolved = true;
                const snapshot = readCurrentSnapshot();
                cleanup();
                resolve({
                    positionsSettled: snapshot.positionsSettled,
                    positionsChanged: snapshot.positionsChanged,
                    accountInfoUpdated: snapshot.accountInfoUpdated,
                    tradeResultSucceeded,
                    timedOut,
                    lastRefreshError,
                });
            };

            const evaluate = () => {
                if (resolved || !isCurrentAccount()) {
                    return;
                }

                const snapshot = readCurrentSnapshot();
                if (
                    snapshot.positionsSettled ||
                    (options.resolveOnTradeResult === true && tradeResultSucceeded)
                ) {
                    finish(false);
                }
            };

            const queueEvaluate = () => {
                const timeoutId = window.setTimeout(() => {
                    timeoutIds.delete(timeoutId);
                    evaluate();
                }, 0);
                timeoutIds.add(timeoutId);
            };

            const runBoundedRefresh = async () => {
                if (resolved || !isCurrentAccount()) {
                    return;
                }

                const refreshClient = useWebtraderStore.getState().wsClient;
                let appliedPositions = false;

                if (refreshClient?.isConnected && refreshClient.isAuthenticated) {
                    const [positionsResult, accountInfoResult] = await Promise.allSettled([
                        refreshClient.getPositions({ force: true, coalesceInFlight: true }),
                        refreshClient.getAccountInfo(),
                    ]);

                    if (resolved || !isCurrentAccount()) {
                        return;
                    }

                    if (positionsResult.status === 'fulfilled') {
                        applyPositionsForActiveAccount(
                            filterTerminalPositionsForAccount(positionsResult.value, requestAccountId),
                        );
                        appliedPositions = true;
                    } else {
                        lastRefreshError = positionsResult.reason;
                    }

                    if (
                        accountInfoResult.status === 'fulfilled' &&
                        terminalAccountInfoMatchesActiveAccount(activeTradingAccount, accountInfoResult.value)
                    ) {
                        setStoreAccountInfo(accountInfoResult.value);
                    } else if (accountInfoResult.status === 'rejected') {
                        lastRefreshError = accountInfoResult.reason;
                    }
                }

                if (!appliedPositions && requestAccountId && shouldUseTerminalRestPositions) {
                    try {
                        const restPositions = await fetchTerminalRestPositions(requestAccountId, { force: true });
                        if (resolved || !isCurrentAccount()) {
                            return;
                        }
                        applyPositionsForActiveAccount(
                            filterTerminalPositionsForAccount(restPositions, requestAccountId),
                        );
                    } catch (error) {
                        lastRefreshError = error;
                    }
                }

                evaluate();
            };

            const subscribeClient = useWebtraderStore.getState().wsClient ?? storeWsClient;
            if (subscribeClient) {
                unsubscribers.push(
                    subscribeClient.addStreamListener('account.positions', queueEvaluate),
                    subscribeClient.addStreamListener('account.balance', queueEvaluate),
                    subscribeClient.addStreamListener('trade.execution', (message) => {
                        if (
                            isSuccessfulTerminalTradeRetcode(getTerminalTradeResultRetcode(message.payload)) &&
                            (!options.isExpectedTradeResult || options.isExpectedTradeResult(message.payload))
                        ) {
                            tradeResultSucceeded = true;
                        }
                        queueEvaluate();
                    }),
                );
            }

            for (const delayMs of refreshDelaysMs) {
                const timeoutId = window.setTimeout(() => {
                    timeoutIds.delete(timeoutId);
                    void runBoundedRefresh();
                }, delayMs);
                timeoutIds.add(timeoutId);
            }

            const timeoutId = window.setTimeout(() => {
                timeoutIds.delete(timeoutId);
                finish(true);
            }, timeoutMs);
            timeoutIds.add(timeoutId);

            evaluate();
        });
    }, [
        activeTradingAccount,
        applyPositionsForActiveAccount,
        connectAccountId,
        setStoreAccountInfo,
        shouldUseTerminalRestPositions,
        storeWsClient,
    ]);

    const loadClosedTradeHistory = useCallback(async (options: { force?: boolean } = {}) => {
        if (closedHistoryState.isLoading || (closedHistoryState.isLoaded && !options.force)) {
            return;
        }

        if (!storeWsClient?.isConnected || !storeWsClient.isAuthenticated) {
            setClosedHistoryState({
                isLoading: false,
                isLoaded: false,
                error: 'Trading session is not ready yet. Please retry once the terminal reconnects.',
            });
            return;
        }

        setClosedHistoryState((current) => ({
            ...current,
            isLoading: true,
            error: null,
        }));

        try {
            const requestSeq = closedHistoryRequestSeqRef.current + 1;
            closedHistoryRequestSeqRef.current = requestSeq;
            const to = new Date();
            const from = new Date(
                to.getTime() - TERMINAL_CLOSED_HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
            );
            const requestAccountId = connectAccountId;
            const requestClient = storeWsClient;
            const deals = await requestClient.getTradeHistory(from, to, {
                maxRows: TERMINAL_CLOSED_HISTORY_MAX_ROWS,
            });

            if (
                latestClosedHistoryAccountIdRef.current !== requestAccountId ||
                latestClosedHistoryClientRef.current !== requestClient
            ) {
                setClosedHistoryState((current) => (
                    closedHistoryRequestSeqRef.current === requestSeq
                        ? { ...current, isLoading: false }
                        : current
                ));
                return;
            }

            const closedFromHistory: ClosedTrade[] = deals
                .filter((deal) =>
                    (deal.entry === 'out' || deal.entry === 'outby') &&
                    (deal.type === 'buy' || deal.type === 'sell'),
                )
                .map((deal) => {
                    const closeTime = deal.time instanceof Date
                        ? deal.time.toISOString().replace('T', ' ').slice(0, 19)
                        : String(deal.time);

                    return {
                        id: String(deal.ticket),
                        symbol: deal.symbol,
                        type: deal.type === 'sell' ? ('sell' as const) : ('buy' as const),
                        volume: deal.volume,
                        openPrice: 0,
                        closePrice: deal.price,
                        profit: deal.profit,
                        openTime: closeTime,
                        closeTime,
                    };
                });

            setClosedTrades((prev) => {
                const existingIds = new Set(prev.map((trade) => trade.id));
                const fresh = closedFromHistory.filter((trade) => !existingIds.has(trade.id));
                return [...prev, ...fresh].slice(0, TERMINAL_CLOSED_HISTORY_MAX_ROWS);
            });
            setClosedHistoryState({
                isLoading: false,
                isLoaded: true,
                error: null,
            });
        } catch (error) {
            if (
                latestClosedHistoryAccountIdRef.current !== connectAccountId ||
                latestClosedHistoryClientRef.current !== storeWsClient
            ) {
                return;
            }

            setClosedHistoryState({
                isLoading: false,
                isLoaded: false,
                error: formatTerminalRequestError(
                    error,
                    'Unable to load recent closed trades. Please retry in a moment.',
                ),
            });
        }
    }, [closedHistoryState.isLoaded, closedHistoryState.isLoading, connectAccountId, setClosedTrades, storeWsClient]);

    useEffect(() => {
        setClosedTrades([]);
        closedHistoryRequestSeqRef.current += 1;
        setClosedHistoryState({ isLoading: false, isLoaded: false, error: null });
    }, [connectAccountId, setClosedTrades, storeWsClient]);

    useEffect(() => {
        if (storeWsClient?.isConnected && storeWsClient?.isAuthenticated) {
            void loadClosedTradeHistory();
        }
    }, [storeWsClient?.isConnected, storeWsClient?.isAuthenticated, loadClosedTradeHistory]);

    useEffect(() => {
        if (!storeWsClient) return;

        const unsub = storeWsClient.addStreamListener('account.history', (message: any) => {
            // When MT5 executes a trade, it broadcasts a history update.
            // Instantly parse the deals and update the closed trades table!
            const incomingDeals = message.payload;
            console.log("MT5 LIVE HISTORY DUMP:", incomingDeals);
            if (!Array.isArray(incomingDeals)) return;
            
            const freshTrades = incomingDeals
                .filter((deal: any) =>
                    (deal.entry === 'out' || deal.entry === 'outby') &&
                    (deal.type === 'buy' || deal.type === 'sell')
                )
                .map((deal: any) => {
                    const closeTime = deal.time instanceof Date
                        ? deal.time.toISOString().replace('T', ' ').slice(0, 19)
                        : String(deal.time);
                    return {
                        id: String(deal.ticket),
                        symbol: deal.symbol,
                        type: deal.type === 'sell' ? 'sell' as const : 'buy' as const,
                        volume: deal.volume,
                        openPrice: 0, // WebSocket payload for deals doesn't carry openPrice natively
                        closePrice: deal.price,
                        profit: deal.profit,
                        openTime: closeTime, // Fallback
                        closeTime,
                    };
                });

            if (freshTrades.length > 0) {
                setClosedTrades((prev) => {
                    const existingIds = new Set(prev.map((t) => t.id));
                    const newTrades = freshTrades.filter((t) => !existingIds.has(t.id));
                    if (newTrades.length === 0) return prev;
                    return [...newTrades, ...prev].slice(0, TERMINAL_CLOSED_HISTORY_MAX_ROWS);
                });
            }
        });

        return unsub;
    }, [loadClosedTradeHistory, storeWsClient]);

    useEffect(() => {
        positionsRefreshRequestSeqRef.current += 1;
        positionsRefreshInFlightRef.current = null;
        if (positionsRefreshSettleTimeoutRef.current !== null) {
            window.clearTimeout(positionsRefreshSettleTimeoutRef.current);
            positionsRefreshSettleTimeoutRef.current = null;
        }
        positionsRefreshSettleDeadlineRef.current = null;
        setPositionsLoadState({ isLoading: false, error: null, warning: null });
        hasResolvedOpenPositionsRef.current = false;
        hasShownInitialPositionsLoadingRef.current = false;
    }, [connectAccountId, storeWsClient]);

    useEffect(() => {
        if (!canRefreshTerminalPositions({
            accountId: connectAccountId,
            wsClient: storeWsClient,
            terminalConnectionStatus,
        })) {
            return;
        }

        let isCancelled = false;
        let hasResolvedAccountInfo = terminalAccountInfoMatchesActiveAccount(
            activeTradingAccount,
            useWebtraderStore.getState().accountInfo,
        );
        let hasResolvedPositions = false;
        const timeoutIds = READY_STATE_REFRESH_RETRY_DELAYS_MS.map((delayMs, attemptIndex) =>
            window.setTimeout(() => {
                if (isCancelled) {
                    return;
                }

                if (attemptIndex > 0 && hasResolvedAccountInfo && hasResolvedPositions) {
                    return;
                }

                const showInitialPositionsLoading =
                    attemptIndex === 0 && !hasShownInitialPositionsLoadingRef.current;
                if (showInitialPositionsLoading) {
                    hasShownInitialPositionsLoadingRef.current = true;
                }

                void refreshLiveTradingState({
                    showPositionsLoading: showInitialPositionsLoading,
                    forcePositionsRefresh: true,
                    coalescePositionsRefresh: true,
                }).then((result) => {
                    if (isCancelled) {
                        return;
                    }

                    hasResolvedAccountInfo =
                        hasResolvedAccountInfo ||
                        result.accountInfoUpdated ||
                        terminalAccountInfoMatchesActiveAccount(
                            activeTradingAccount,
                            useWebtraderStore.getState().accountInfo,
                        );
                    hasResolvedPositions = hasResolvedPositions || result.positionsUpdated;
                });
            }, delayMs),
        );

        // Periodic balance polling every 15 seconds to keep balance/equity/margin live
        const periodicRefreshInterval = window.setInterval(() => {
            if (isCancelled) return;
            void refreshLiveTradingState({ showPositionsLoading: false });
        }, 15_000);

        return () => {
            isCancelled = true;
            timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
            window.clearInterval(periodicRefreshInterval);
        };
    }, [activeTradingAccount, connectAccountId, refreshLiveTradingState, storeWsClient, terminalConnectionStatus]);

    useEffect(() => {
        const hasTransientError = positionsLoadState.error
            ? isTransientTerminalPositionRefreshError(new Error(positionsLoadState.error))
            : false;
        if (
            (!positionsLoadState.warning && !hasTransientError) ||
            (positionsLoadState.error && !hasTransientError) ||
            !canRefreshTerminalPositions({
                accountId: connectAccountId,
                wsClient: storeWsClient,
                terminalConnectionStatus,
            })
        ) {
            return;
        }

        let isCancelled = false;
        let timeoutId: number | null = null;
        let retryAttempt = 0;

        const scheduleBackgroundRetry = () => {
            const delayMs = TERMINAL_POSITIONS_BACKGROUND_RETRY_DELAYS_MS[
                Math.min(retryAttempt, TERMINAL_POSITIONS_BACKGROUND_RETRY_DELAYS_MS.length - 1)
            ];
            timeoutId = window.setTimeout(() => {
                if (isCancelled) {
                    return;
                }

                void refreshLiveTradingState({
                    showPositionsLoading: false,
                    forcePositionsRefresh: true,
                    coalescePositionsRefresh: true,
                }).then((result) => {
                    if (isCancelled || result.positionsUpdated) {
                        return;
                    }

                    retryAttempt += 1;
                    scheduleBackgroundRetry();
                }).catch(() => {
                    if (isCancelled) {
                        return;
                    }

                    retryAttempt += 1;
                    scheduleBackgroundRetry();
                });
            }, delayMs);
        };

        scheduleBackgroundRetry();

        return () => {
            isCancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [
        connectAccountId,
        positionsLoadState.error,
        positionsLoadState.warning,
        refreshLiveTradingState,
        storeWsClient,
        terminalConnectionStatus,
    ]);

    const liveTerminalPositions = useMemo(() => {
        return storePositions.map((position) => {
            const instrument = getInstrumentForSymbol(position.symbol);
            // Display-only legacy guard: server priceCurrent/profit remains authoritative.
            const currentPrice = toFiniteNumber(
                position.priceCurrent,
                toFiniteNumber(position.openPrice, 0),
            );

            return {
                id: String(position.ticket),
                ticket: String(position.ticket),
                symbol: instrument?.symbol ?? position.symbol,
                type: position.type,
                volume: toFiniteNumber(position.volume),
                openPrice: toFiniteNumber(position.openPrice),
                currentPrice,
                profit: toFiniteNumber(position.profit),
                swap: toFiniteNumber(position.swap),
                commission: toFiniteNumber(position.commission),
                openTime: formatTerminalDate(position.openTime),
                sl: Number.isFinite(position.sl) && position.sl > 0 ? position.sl : null,
                tp: Number.isFinite(position.tp) && position.tp > 0 ? position.tp : null,
                digits: instrument?.digits,
                contractSize: instrument?.contractSize,
            } satisfies Position;
        });
    }, [getInstrumentForSymbol, storePositions]);

    useEffect(() => {
        setOptimisticOpenPositions((current) => {
            const next = current.filter((optimisticPosition) =>
                optimisticPosition.expiresAtMs > Date.now() &&
                !liveTerminalPositions.some((realPosition) =>
                    optimisticTerminalPositionMatchesReal(optimisticPosition, realPosition),
                ),
            );

            return next.length === current.length ? current : next;
        });
    }, [liveTerminalPositions]);

    useEffect(() => {
        if (optimisticOpenPositions.length === 0) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setOptimisticOpenPositions((current) => {
                const now = Date.now();
                const next = current.filter((position) => position.expiresAtMs > now);
                return next.length === current.length ? current : next;
            });
        }, 1_000);

        return () => window.clearTimeout(timeoutId);
    }, [optimisticOpenPositions]);

    const terminalPositions = useMemo(
        () => mergeTerminalPositionsWithOptimistic(liveTerminalPositions, optimisticOpenPositions),
        [liveTerminalPositions, optimisticOpenPositions],
    );

    const hasAuthenticatedManualWebtraderSession = Boolean(
        !activeTradingAccount &&
        storeSession &&
        storeAccountInfo &&
        storeWsClient?.isAuthenticated,
    );

    const account = useMemo(
        () => buildDashboardAccountSummary(
            activeTradingAccount,
            (connectAccountId || hasAuthenticatedManualWebtraderSession)
                ? storeAccountInfo
                : null,
        ),
        [activeTradingAccount, connectAccountId, hasAuthenticatedManualWebtraderSession, storeAccountInfo],
    );

    const selectedInstrument = useMemo(
        () => {
            const selectedSymbolInfo = getSymbolInfoForInstrumentSymbol(selectedBrokerSymbol);
            return selectedSymbolInfo ? createTerminalInstrument(selectedSymbolInfo) : null;
        },
        [createTerminalInstrument, getSymbolInfoForInstrumentSymbol, selectedBrokerSymbol],
    );

    const selectedSymbolBelongsToActiveAccount = selectedSymbolAccountId === (connectAccountId ?? null);
    const tradePanelHeaderSymbol = useMemo(() => {
        const symbol = selectedInstrument?.symbol || selectedBrokerSymbol || selectedSymbol;
        return symbol.trim();
    }, [selectedBrokerSymbol, selectedInstrument, selectedSymbol]);
    const tradePanelTitle = useMemo(() => {
        const displaySymbol = tradePanelHeaderSymbol ? formatTerminalDisplaySymbol(tradePanelHeaderSymbol) : '';

        return displaySymbol || 'Selected Pair';
    }, [tradePanelHeaderSymbol]);
    const activeAction = useWebtraderStore((state) => state.activeAction);
    const orderForm = useWebtraderStore((state) => state.orderForm);
    const selectedSymbolPositions = useMemo(
        () => {
            if (!selectedInstrument) return [];
            const positionsToRender = terminalPositions.filter((position) => symbolsMatch(position.symbol, selectedInstrument.symbol));
            if (activeAction) {
                const draftVolume = orderForm.volume > 0 ? orderForm.volume : 0.01;
                const priceTolerance = Math.max(1e-8, 1 / Math.pow(10, selectedInstrument.digits) / 2);
                const pricesMatch = (left: number | null | undefined, right: number | null | undefined) => {
                    const leftIsSet = typeof left === 'number' && Number.isFinite(left);
                    const rightIsSet = typeof right === 'number' && Number.isFinite(right);
                    if (!leftIsSet && !rightIsSet) return true;
                    if (!leftIsSet || !rightIsSet) return false;
                    return Math.abs(left - right) <= priceTolerance;
                };
                const hasMatchingLivePosition = positionsToRender.some((position) =>
                    position.type === activeAction &&
                    Math.abs(position.volume - draftVolume) <= 1e-9 &&
                    pricesMatch(position.sl, orderForm.sl) &&
                    pricesMatch(position.tp, orderForm.tp)
                );

                if (!hasMatchingLivePosition) positionsToRender.push({
                    id: 'draft-order',
                    ticket: 'draft-order',
                    symbol: selectedInstrument.symbol,
                    type: activeAction,
                    volume: draftVolume,
                    openPrice: activeAction === 'buy' ? selectedInstrument.ask : selectedInstrument.bid,
                    currentPrice: activeAction === 'buy' ? selectedInstrument.ask : selectedInstrument.bid,
                    profit: 0,
                    swap: 0,
                    commission: 0,
                    openTime: new Date(getMt5ServerTimeMs()).toISOString(),
                    sl: orderForm.sl,
                    tp: orderForm.tp,
                    digits: selectedInstrument.digits,
                    contractSize: selectedInstrument.contractSize,
                } as any);
            }
            return positionsToRender;
        },
        [terminalPositions, selectedInstrument, activeAction, orderForm],
    );
    const keptAliveChartEntries = useMemo(
        () => renderedChartKeepAliveSymbols.flatMap((chartSymbol) => {
            const symbolInfo = getSymbolInfoForInstrumentSymbol(chartSymbol);
            if (!symbolInfo) {
                return [];
            }

            const instrument = createTerminalInstrument(symbolInfo);
            const isActive = Boolean(
                selectedInstrument &&
                symbolsMatch(instrument.symbol, selectedInstrument.symbol),
            );
            const positions = isActive
                ? selectedSymbolPositions
                : terminalPositions.filter((position) => symbolsMatch(position.symbol, instrument.symbol));

            return [{
                symbol: instrument.symbol,
                instrument,
                isActive,
                positions,
            }];
        }),
        [
            createTerminalInstrument,
            getSymbolInfoForInstrumentSymbol,
            renderedChartKeepAliveSymbols,
            selectedInstrument,
            selectedSymbolPositions,
            terminalPositions,
        ],
    );
    const positionPriceSeedsBySymbol = useMemo(() => {
        const seeds: Record<string, number> = {};
        for (const position of terminalPositions) {
            const currentPrice = toFiniteNumber(position.currentPrice, 0);
            if (currentPrice <= 0 || seeds[position.symbol] !== undefined) {
                continue;
            }
            seeds[position.symbol] = currentPrice;
        }
        return seeds;
    }, [terminalPositions]);
    const priceDigits = selectedInstrument?.digits ?? 5;
    const addOptimisticOpenPosition = useCallback((
        order: {
            symbol: string;
            type: 'buy' | 'sell';
            volume: number;
            sl: number | null;
            tp: number | null;
        },
        openPrice: number,
    ) => {
        if (!connectAccountId || openPrice <= 0 || !Number.isFinite(openPrice)) {
            return null;
        }

        const instrument = getInstrumentForSymbol(order.symbol);
        const canonicalSymbol = instrument?.symbol ?? order.symbol;
        const nowMs = Date.now();
        const optimisticPosition: OptimisticTerminalPosition = {
            accountId: connectAccountId,
            id: `optimistic-${nowMs}-${Math.random().toString(36).slice(2, 8)}`,
            ticket: 'Syncing',
            symbol: canonicalSymbol,
            type: order.type,
            volume: order.volume,
            openPrice,
            currentPrice: openPrice,
            profit: 0,
            swap: 0,
            commission: 0,
            openTime: toMt5IsoString(getMt5ServerTimeMs()),
            sl: order.sl,
            tp: order.tp,
            digits: instrument?.digits,
            contractSize: instrument?.contractSize,
            isOptimistic: true,
            createdAtMs: nowMs,
            expiresAtMs: nowMs + TERMINAL_OPTIMISTIC_POSITION_TTL_MS,
        };

        setOptimisticOpenPositions((current) => {
            const withoutMatched = current.filter((existing) =>
                existing.expiresAtMs > nowMs &&
                !optimisticTerminalPositionMatchesReal(existing, optimisticPosition),
            );

            return [...withoutMatched, optimisticPosition];
        });
        setPositionsLoadState((current) => ({
            isLoading: false,
            error: null,
            warning: current.warning,
        }));
        return optimisticPosition.id;
    }, [connectAccountId, getInstrumentForSymbol]);
    const removeOptimisticOpenPosition = useCallback((positionId: string | null) => {
        if (!positionId) {
            return;
        }

        setOptimisticOpenPositions((current) => {
            const next = current.filter((position) => position.id !== positionId);
            return next.length === current.length ? current : next;
        });
    }, []);
    useEffect(() => {
        if (terminalConnectionStatus !== 'ready' || !connectAccountId || storeSymbols.length === 0) {
            setQuoteFeedWarning(null);
            return;
        }

        let warningActive = false;
        const hasLiveQuoteInStore = () => Object.values(latestStorePricesRef.current).some(
            (price) => (price.bid ?? 0) > 0 || (price.ask ?? 0) > 0 || (price.last ?? 0) > 0,
        );
        const evaluateQuoteFreshness = () => {
            if (hasObservedLiveMarketDataRef.current || hasLiveQuoteInStore()) {
                warningActive = false;
                markLiveMarketDataAvailable();
                return;
            }

            warningActive = true;
            setQuoteFeedWarning(FIRST_TICK_NOTICE_MESSAGE);
        };

        const initialTimeout = window.setTimeout(() => {
            evaluateQuoteFreshness();
        }, LIVE_QUOTE_INITIAL_WAIT_MS);

        const interval = window.setInterval(() => {
            if (!warningActive) {
                if (!hasLiveQuoteInStore()) {
                    return;
                }
            }

            evaluateQuoteFreshness();
        }, 1000);

        return () => {
            window.clearTimeout(initialTimeout);
            window.clearInterval(interval);
        };
    }, [connectAccountId, markLiveMarketDataAvailable, storeSymbols.length, terminalConnectionStatus]);

    useEffect(() => {
        if (
            terminalConnectionStatus === 'ready' &&
            isNonBlockingTerminalWarningMessage(storeConnectionError) &&
            !isQuoteFeedDegradedWarning(storeConnectionError)
        ) {
            setStoreConnectionError(null);
        }
    }, [setStoreConnectionError, storeConnectionError, terminalConnectionStatus]);

    const headerAccounts = useMemo(() => {
        const accounts = tradingAccounts.map((accountItem) => ({
            id: accountItem.id,
            label: accountItem.accountNumber,
            isReal: accountItem.type === 'Live',
            isMT5: accountItem.platform === 'mt5' || !accountItem.platform,
            type: accountItem.platform === 'ctrader' ? 'cTrader' : 'Standard',
            balance: toFiniteNumber(accountItem.balance),
            currency: accountItem.currency || 'USD',
        }));

        if (
            terminalLaunchSession.account &&
            !accounts.some((accountItem) => accountItem.id === terminalLaunchSession.account?.id)
        ) {
            accounts.unshift({
                id: terminalLaunchSession.account.id,
                label: terminalLaunchSession.account.accountNumber,
                isReal: terminalLaunchSession.account.type === 'Live',
                isMT5: true,
                type: 'Standard',
                balance: toFiniteNumber(terminalLaunchSession.account.balance),
                currency: terminalLaunchSession.account.currency || 'USD',
            });
        }

        return accounts;
    }, [terminalLaunchSession.account, tradingAccounts]);

    const userProfile = useMemo(() => {
        if (activeTradingAccount) {
            return {
                name: activeTradingAccount.name || 'Trader',
                email: activeTradingAccount.accountNumber ? `Account #${activeTradingAccount.accountNumber}` : '',
                isVerified: true,
            };
        }

        if (hasAuthenticatedManualWebtraderSession) {
            const fallbackLogin = storeAccountInfo?.login ?? storeSession?.login;

            return {
                name: storeSession?.name || storeAccountInfo?.name || 'Trader',
                email: fallbackLogin ? `Account #${fallbackLogin}` : '',
                isVerified: true,
            };
        }

        return {
            name: 'Trader',
            email: '',
            isVerified: true,
        };
    }, [activeTradingAccount, hasAuthenticatedManualWebtraderSession, storeAccountInfo, storeSession]);

    const networkConnectionStatus = terminalConnectionStatus;
    const accountConnectionWarning =
        activeTradingAccount?.status === 'Archived'
            ? 'Restore this account from the Accounts page before opening live terminal trading.'
            : activeTradingAccount?.platform === 'ctrader'
                ? 'Live terminal auto-login is only available for MT5 accounts.'
                : null;
    const selectedChartHistory =
        selectedInstrument &&
        isMatchingTerminalChartHistoryStatus(
            chartHistoryStatus,
            selectedInstrument.symbol,
            selectedChartTimeframeMinutes,
        )
            ? chartHistoryStatus
            : null;
    const visibleQuoteFeedWarning =
        isSoftQuoteFeedNotice(quoteFeedWarning) &&
        (selectedChartHistory?.isLoading || selectedChartHistory?.hasCandles)
            ? null
            : quoteFeedWarning;
    const staleStoreQuoteFeedWarning =
        !hasAnyLiveQuote && isQuoteFeedDegradedWarning(storeConnectionError)
            ? storeConnectionError
            : null;
    const staleConnectQuoteFeedWarning =
        !hasAnyLiveQuote && isQuoteFeedDegradedWarning(connectError)
            ? connectError
            : null;
    const activeConnectionProblem =
        terminalConnectionStatus === 'ready'
            ? visibleQuoteFeedWarning ||
                staleStoreQuoteFeedWarning ||
                staleConnectQuoteFeedWarning ||
                (isSymbolRefreshWarningMessage(connectError) ? connectError : null) ||
                (isSymbolRefreshWarningMessage(storeConnectionError) ? storeConnectionError : null)
            : connectError || storeConnectionError || visibleQuoteFeedWarning;
    const networkConnectionError = accountConnectionWarning || activeConnectionProblem;
    const frontendLaunchCacheMatchesActiveAccount =
        Boolean(connectAccountId) &&
        frontendLaunchCacheRestoreState.accountId === connectAccountId;
    const hasFrontendLaunchCacheDataForInitialRender = Boolean(
        frontendLaunchCacheMatchesActiveAccount &&
        (
            frontendLaunchCacheRestoreState.hasAccountInfo ||
            frontendLaunchCacheRestoreState.hasPositions ||
            frontendLaunchCacheRestoreState.hasSymbols
        )
    );
    const hasFrontendLaunchCachePositionsForInitialRender = Boolean(
        frontendLaunchCacheMatchesActiveAccount &&
        frontendLaunchCacheRestoreState.hasPositions
    );
    // Block only for local account discovery. Once an account candidate is known,
    // mount the terminal shell and let websocket/session recovery hydrate in-panel.
    const isResolvingInitialTerminalAccount =
        !terminalLaunchSession.isActive &&
        !accountIdFromUrl &&
        !connectAccountId &&
        !activeTradingAccount &&
        !isLastTerminalAccountReady;
    const isLoadingTerminalAccountData =
        !hasFrontendLaunchCacheDataForInitialRender &&
        !loadingTimedOut &&
        (
            isResolvingInitialTerminalAccount ||
            (isSnapshotLoading && !connectAccountId && !activeTradingAccount && !terminalLaunchSession.isActive)
        );
    const hasTerminalAccountRestoreCandidate = Boolean(
        connectAccountId ||
        activeTradingAccount ||
        terminalLaunchSession.isActive ||
        hasAuthenticatedManualWebtraderSession ||
        accountIdFromUrl ||
        lastTerminalAccountId,
    );
    const isTerminalConnectionRestoring = Boolean(
        hasTerminalAccountRestoreCandidate &&
        !accountConnectionWarning &&
        terminalConnectionStatus !== 'ready' &&
        terminalConnectionStatus !== 'error' &&
        terminalConnectionStatus !== 'locked'
    );
    const isTerminalSymbolCatalogRestoring = Boolean(
        connectAccountId &&
        terminalConnectionStatus === 'ready' &&
        !accountConnectionWarning &&
        (
            !terminalPreferencesLoaded ||
            storeSymbols.length === 0 ||
            (!terminalLaunchSession.isActive && currentIsFallback && !activeGroupCatalogSettled)
        )
    );
    const isTerminalSelectedInstrumentRestoring = Boolean(
        connectAccountId &&
        terminalConnectionStatus === 'ready' &&
        !accountConnectionWarning &&
        terminalPreferencesLoaded &&
        storeSymbols.length > 0 &&
        (
            !hasInitializedTerminalSymbolsRef.current ||
            (
                selectedSymbol.trim().length > 0 &&
                (!selectedSymbolBelongsToActiveAccount || !selectedInstrument)
            )
        )
    );
    const isTerminalRestoreInProgress = Boolean(
        !hasFrontendLaunchCacheDataForInitialRender &&
        (
            isLoadingTerminalAccountData ||
            terminalLaunchSession.isRestoring ||
            isTerminalConnectionRestoring ||
            isTerminalSymbolCatalogRestoring ||
            isTerminalSelectedInstrumentRestoring
        )
    );
    const selectedChartReadyForInitialTerminalRender = Boolean(
        selectedSymbolBelongsToActiveAccount &&
        selectedInstrument &&
        selectedChartHistory &&
        selectedChartHistory.hasCandles
    );
    const terminalInitialGateKey =
        connectAccountId ??
        (hasAuthenticatedManualWebtraderSession
            ? `manual:${storeSession?.id ?? storeAccountInfo?.login ?? 'session'}`
            : activeTradingAccount?.id ??
                (terminalLaunchSession.isActive ? 'launch' : 'terminal'));
    const isInitialTerminalGateReleased = releasedInitialTerminalGateKey === terminalInitialGateKey;
    const isInitialTerminalGateTimedOut = timedOutInitialTerminalGateKey === terminalInitialGateKey;
    // Do NOT release on shell-ready / launch-cache / timeout alone — that reveals a blank chart.
    // Preferred: first real candles. Fail-open only on hard connection errors.
    // Timed-out opens still keep the black overlay until hasCandles (see timeout effect).
    const shouldReleaseInitialTerminalGate = Boolean(
        terminalConnectionStatus === 'error' ||
        terminalConnectionStatus === 'locked' ||
        accountConnectionWarning ||
        activeGroupSymbolsState.error ||
        selectedChartReadyForInitialTerminalRender
    );
    useEffect(() => {
        if (isLoadingTerminalAccountData || isInitialTerminalGateReleased || !shouldReleaseInitialTerminalGate) {
            return;
        }

        setReleasedInitialTerminalGateKey((current) =>
            current === terminalInitialGateKey ? current : terminalInitialGateKey,
        );
    }, [
        isInitialTerminalGateReleased,
        isLoadingTerminalAccountData,
        shouldReleaseInitialTerminalGate,
        terminalInitialGateKey,
    ]);
    const positionsTableLoading =
        !hasFrontendLaunchCachePositionsForInitialRender &&
        (positionsLoadState.isLoading || terminalLaunchSession.isRestoring);
    const initialTerminalGateActive =
        !isLoadingTerminalAccountData &&
        !isInitialTerminalGateReleased &&
        !shouldReleaseInitialTerminalGate;
    const terminalLaunchBlockingOverlayActive = Boolean(
        terminalLaunchSession.isActive &&
        terminalLaunchSession.status !== 'ready',
    );
    // Black dots stay up until launch is ready AND first chart candles exist (or timeout).
    const terminalOpeningOverlayActive = Boolean(
        terminalLaunchBlockingOverlayActive ||
        initialTerminalGateActive
    );
    useEffect(() => {
        // Soft fail-open after a long wait: allow the terminal chrome, but only if we
        // still have no candles. Chart area stays on loading shell until hasCandles.
        // Hard release still requires selectedChartReadyForInitialTerminalRender above.
        if (!initialTerminalGateActive || isInitialTerminalGateTimedOut) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setTimedOutInitialTerminalGateKey((current) =>
                current === terminalInitialGateKey ? current : terminalInitialGateKey,
            );
            // Never unlock on a stale true hasCandles from a previous partial paint.
            setChartHistoryStatus((current) => {
                if (
                    current &&
                    isMatchingTerminalChartHistoryStatus(
                        current,
                        selectedBrokerSymbol,
                        selectedChartTimeframeMinutes,
                    ) &&
                    current.hasCandles
                ) {
                    return current;
                }
                return {
                    symbol: selectedBrokerSymbol || current?.symbol || '',
                    timeframeMinutes: selectedChartTimeframeMinutes,
                    isLoading: true,
                    hasCandles: false,
                };
            });
            // Soft-release overlay so user sees terminal chrome + chart loading shell,
            // not a permanent black screen when MT5 history is very slow.
            setReleasedInitialTerminalGateKey((current) =>
                current === terminalInitialGateKey ? current : terminalInitialGateKey,
            );
        }, INITIAL_TERMINAL_CHART_GATE_TIMEOUT_MS);

        return () => window.clearTimeout(timeoutId);
    }, [
        initialTerminalGateActive,
        isInitialTerminalGateTimedOut,
        selectedBrokerSymbol,
        selectedChartTimeframeMinutes,
        terminalInitialGateKey,
    ]);
    const handleChartTimeframeChange = useCallback((timeframeMinutes: number) => {
        const normalizedTf = normalizeTerminalTimeframeMinutes(timeframeMinutes);
        // TF change remounts series data — only unlock immediately if this TF was painted before.
        if (selectedBrokerSymbol) {
            const key = getTerminalChartHistoryStatusKey(selectedBrokerSymbol, normalizedTf);
            const confirmed = confirmedChartPaintRef.current.has(key);
            const nextStatus = confirmed
                ? {
                    symbol: selectedBrokerSymbol,
                    timeframeMinutes: normalizedTf,
                    isLoading: false,
                    hasCandles: true as const,
                }
                : {
                    symbol: selectedBrokerSymbol,
                    timeframeMinutes: normalizedTf,
                    isLoading: true,
                    hasCandles: false as const,
                };
            chartHistoryStatusCacheRef.current.set(key, nextStatus);
            setChartHistoryStatus(nextStatus);
        }
        setChartTimeframeMinutes(normalizedTf);
    }, [selectedBrokerSymbol]);

    const handleSelectSymbol = useCallback((symbol: string) => {
        const exactSymbol = resolveCatalogSymbolName(
            storeSymbols,
            symbol,
            latestStorePricesRef.current,
            { preserveExact: true },
        );
        if (!exactSymbol) {
            handleShowToast(
                'warning',
                'Symbol unavailable',
                'Only symbols from the connected broker catalog can be opened.',
            );
            return;
        }

        markTerminalChartSwitchPerf('handleSelectSymbol', {
            symbol: exactSymbol,
            timeframeMinutes: chartTimeframeMinutes,
        });
        // Synchronous switch-seed so layout/hydrate can paint candles immediately.
        const normalizedTf = normalizeTerminalTimeframeMinutes(chartTimeframeMinutes);
        prewarmTerminalChartSwitchSeed({
            accountSessionScopeId,
            symbol: exactSymbol,
            timeframeMinutes: normalizedTf,
        });
        setChartKeepAliveSymbols((current) =>
            reconcileTerminalChartKeepAliveSymbols(current, openTabs, exactSymbol),
        );
        // Exness-style warm switch:
        // 1) keep-alive + confirmed paint this session → instant
        // 2) memory history already in ohlcService → near-instant (chart seeds same frame)
        // 3) cold → loading until paint (never empty grid)
        const switchStatusKey = getTerminalChartHistoryStatusKey(exactSymbol, normalizedTf);
        const keepAliveWarm =
            chartKeepAliveSymbols.some((symbol) => symbolsMatch(symbol, exactSymbol)) ||
            openTabs.some((symbol) => symbolsMatch(symbol, exactSymbol)) ||
            renderedChartKeepAliveSymbols.some((symbol) => symbolsMatch(symbol, exactSymbol));
        const confirmedWarm = Boolean(confirmedChartPaintRef.current.get(switchStatusKey));
        const memoryBars = ohlcService.getSyncBars(
            exactSymbol,
            normalizedTf,
            accountSessionScopeId,
        );
        const memoryWarm = memoryBars.length >= 30;
        if (memoryWarm) {
            precomputeTerminalChartSwitchSeed({
                accountSessionScopeId,
                symbol: exactSymbol,
                timeframeMinutes: normalizedTf,
                bars: memoryBars,
                limit: TERMINAL_CHART_SWITCH_SEED_LIMIT,
            });
        }
        const canShowInstantly = (keepAliveWarm && confirmedWarm) || memoryWarm;
        const nextSwitchStatus = canShowInstantly
            ? {
                symbol: exactSymbol,
                timeframeMinutes: normalizedTf,
                isLoading: false,
                hasCandles: true,
            }
            : {
                symbol: exactSymbol,
                timeframeMinutes: normalizedTf,
                isLoading: true,
                hasCandles: false,
            };
        chartHistoryStatusCacheRef.current.set(switchStatusKey, nextSwitchStatus);
        setChartHistoryStatus(nextSwitchStatus);
        setSelectedSymbol(exactSymbol);
        setSelectedSymbolAccountId(connectAccountId ?? null);
        // Live + history for this symbol immediately (not only on idle).
        primeTerminalMarketData([exactSymbol], {
            requestHistory: true,
            historyLimit: TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT,
        });
        startTransition(() => {
            setWatchlistSymbols((prev) => upsertUniqueTerminalSymbol(prev, exactSymbol));
            setOpenTabs((prev) => upsertUniqueTerminalSymbol(prev, exactSymbol));
            if (window.innerWidth < 768) {
                setActivePanel(null);
            }
        });
        selectedSymbolMarketPrimeCancelRef.current?.();
        selectedSymbolMarketPrimeCancelRef.current = scheduleTerminalIdleTask(() => {
            selectedSymbolMarketPrimeCancelRef.current = undefined;
            const normalizedTimeframeMinutes = normalizeTerminalTimeframeMinutes(chartTimeframeMinutes);
            // Extra prime / repair only — primary prime already ran sync above.
            primeTerminalMarketData([exactSymbol], {
                requestHistory: true,
                historyLimit: TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT,
            });

            const selectedDiagnosticsApplies = Boolean(
                selectedHistoryDiagnostics &&
                selectedHistoryDiagnostics.timeframeMinutes === normalizedTimeframeMinutes &&
                (
                    symbolsMatch(selectedHistoryDiagnostics.symbol, exactSymbol) ||
                    symbolsMatch(selectedHistoryDiagnostics.requestedSymbol ?? '', exactSymbol)
                ),
            );
            const selectedDiagnosticsNeedsHistory =
                selectedDiagnosticsApplies &&
                terminalOhlcHistoryDiagnosticsNeedsRepair(selectedHistoryDiagnostics);

            if (selectedDiagnosticsNeedsHistory) {
                requestSelectedOhlcHistoryRef.current(
                    exactSymbol,
                    TERMINAL_SELECTED_OHLC_HISTORY_PRIME_LIMIT,
                    normalizedTimeframeMinutes,
                );
            }

            markTerminalChartSwitchPerf('handleSelectSymbol:background-prime', {
                symbol: exactSymbol,
                timeframeMinutes: normalizedTimeframeMinutes,
            });
        });
    }, [
        accountSessionScopeId,
        chartKeepAliveSymbols,
        chartTimeframeMinutes,
        connectAccountId,
        handleShowToast,
        primeTerminalMarketData,
        openTabs,
        renderedChartKeepAliveSymbols,
        selectedHistoryDiagnostics,
        storeSymbols,
    ]);

    const handleHoverSymbol = useCallback((symbol: string) => {
        const exactSymbol = resolveCatalogSymbolName(
            storeSymbols,
            symbol,
            latestStorePricesRef.current,
            { preserveExact: true },
        );
        if (!exactSymbol || symbolsMatch(exactSymbol, selectedSymbol)) {
            return;
        }

        const hoverKey = `${connectAccountId ?? 'terminal'}:${exactSymbol}:${chartTimeframeMinutes}`;
        if (lastHoveredHistoryPrewarmKeyRef.current === hoverKey) {
            return;
        }
        if (symbolHoverHistoryPrewarmTimeoutRef.current !== null) {
            window.clearTimeout(symbolHoverHistoryPrewarmTimeoutRef.current);
        }

        symbolHoverHistoryPrewarmTimeoutRef.current = window.setTimeout(() => {
            symbolHoverHistoryPrewarmTimeoutRef.current = null;
            lastHoveredHistoryPrewarmKeyRef.current = hoverKey;
            const normalizedTf = normalizeTerminalTimeframeMinutes(chartTimeframeMinutes);
            prewarmTerminalChartSwitchSeed({
                accountSessionScopeId,
                symbol: exactSymbol,
                timeframeMinutes: normalizedTf,
            });
            primeTerminalMarketData([exactSymbol], {
                requestHistory: true,
                historyLimit: TERMINAL_BACKGROUND_OHLC_PREWARM_LIMIT,
            });
        }, TERMINAL_SYMBOL_HOVER_OHLC_PREWARM_DELAY_MS);
    }, [
        accountSessionScopeId,
        chartTimeframeMinutes,
        connectAccountId,
        primeTerminalMarketData,
        selectedSymbol,
        storeSymbols,
    ]);

    const handleCloseTab = useCallback((symbol: string) => {
        setChartKeepAliveSymbols((current) =>
            current.filter((chartSymbol) => !symbolsMatch(chartSymbol, symbol)),
        );
        startTransition(() => {
            setOpenTabs((prev) => {
                const next = prev.filter((tab) => !symbolsMatch(tab, symbol));

                if (symbolsMatch(selectedSymbol, symbol)) {
                    setSelectedSymbol(next[next.length - 1] ?? '');
                }

                return next;
            });
        });
    }, [selectedSymbol]);

    const handleReorderTabs = useCallback((newTabs: string[]) => {
        setOpenTabs(resolveCatalogSymbolList(
            storeSymbols,
            newTabs,
            latestStorePricesRef.current,
            { preserveExact: true },
        ));
    }, [storeSymbols]);

    const handlePlaceOrder = useCallback((order: {
        symbol: string;
        type: 'buy' | 'sell';
        orderType: 'market' | 'limit' | 'stop';
        volume: number;
        price?: number;
        tp: number | null;
        sl: number | null;
    }): Promise<void> => {
        const placeLiveOrder = async () => {
            const liveQuote = getSafeLiveQuoteSnapshotBySymbol(
                order.symbol,
                getLivePriceSnapshotBySymbol,
                latestStorePricesRef.current,
            );
            const liveBid = (liveQuote?.bid ?? 0) > 0
                ? liveQuote?.bid ?? 0
                : 0;
            const liveAsk = (liveQuote?.ask ?? 0) > 0
                ? liveQuote?.ask ?? 0
                : 0;
            const liveMarketPrice =
                order.type === 'buy'
                    ? liveAsk
                    : liveBid;

            if (order.orderType === 'market' && (liveBid <= 0 || liveAsk <= 0 || liveMarketPrice <= 0)) {
                handleShowToast(
                    'warning',
                    'No live quote yet',
                    'This symbol needs both live MT5 bid and ask before placing a market order.',
                );
                setIsOrderPanelOpen(true);
                return;
            }

            const pendingOrderPrice =
                typeof order.price === 'number' && Number.isFinite(order.price)
                    ? order.price
                    : 0;
            if (order.orderType !== 'market' && pendingOrderPrice <= 0) {
                handleShowToast(
                    'warning',
                    'Pending price required',
                    'Enter a valid pending order price before submitting.',
                );
                setIsOrderPanelOpen(true);
                return;
            }

            // Always read the current client from the store at execution time so
            // reconnects that happen between the button click and order submission
            // don't leave us using a dead socket reference from the React closure.
            const getLiveClient = () => useWebtraderStore.getState().wsClient;
            let liveClient = getLiveClient();

            if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                const isReconnecting = useWebtraderStore.getState().connectionStatus === 'reconnecting';
                if (isReconnecting || liveClient) {
                    const deadline = Date.now() + 8000;
                    while (Date.now() < deadline) {
                        liveClient = getLiveClient();
                        if (liveClient?.isConnected && liveClient.isAuthenticated) break;
                        await new Promise<void>(res => window.setTimeout(res, 500));
                    }
                }
            }

            if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                handleShowToast(
                    'warning',
                    'Terminal not connected',
                    'Wait for MT5 to connect, or select an MT5 account/session before placing trades.',
                );
                setIsOrderPanelOpen(true);
                return;
            }

            const clientRequestId = crypto.randomUUID();
            const tradeRequest: TradeRequest = {
                clientRequestId,
                symbol: order.symbol,
                type: resolveOrderType(order.type, order.orderType),
                volume: order.volume,
                sl: order.sl ?? undefined,
                tp: order.tp ?? undefined,
            };

            if (order.orderType !== 'market') {
                tradeRequest.price = pendingOrderPrice;
            }

            const stateBeforeOrder = useWebtraderStore.getState();
            const positionsBeforeOrder = filterTerminalPositionsForAccount(
                stateBeforeOrder.positions,
                connectAccountId,
            );
            const accountInfoBeforeOrder = stateBeforeOrder.accountInfo;
            const submittedSide = order.type === 'sell' ? 'sell' : 'buy';
            const expectSubmittedMarketPosition = (positions: WebtraderPosition[]) => {
                if (order.orderType !== 'market') {
                    return false;
                }

                return terminalSubmittedOrderExposureDeltaMatches(
                    positionsBeforeOrder,
                    positions,
                    order.symbol,
                    submittedSide,
                    order.volume,
                );
            };
            const orderSubmittedMessage = order.orderType === 'market'
                ? `${order.type.toUpperCase()} ${order.volume} ${order.symbol} at server market price`
                : `${order.type.toUpperCase()} ${order.volume} ${order.symbol} @ ${pendingOrderPrice.toFixed(priceDigits)}`;
            const pendingOrderCorrelation: PendingTerminalOrderCorrelation = {
                symbol: order.symbol,
                side: submittedSide,
                tradeType: tradeRequest.type,
                orderType: order.orderType,
                volume: order.volume,
                resultRequestId: clientRequestId,
                ...(order.orderType !== 'market' ? { price: pendingOrderPrice } : {}),
            };
            const pendingOrderConfirmationId = registerPendingOrderConfirmation(
                orderSubmittedMessage,
                pendingOrderCorrelation,
            );
            // Show submitted market exposure without waiting for the dealer ACK.
            // A definitive rejection removes this temporary row below; uncertain
            // outcomes keep it marked as Syncing until reconciliation or expiry.
            const submittedOptimisticPositionId = order.orderType === 'market'
                ? addOptimisticOpenPosition(
                    {
                        symbol: order.symbol,
                        type: order.type,
                        volume: order.volume,
                        sl: order.sl,
                        tp: order.tp,
                    },
                    liveMarketPrice,
                )
                : null;
            let tradeResult;
            activeOrderMutationCountRef.current += 1;
            try {
                try {
                    tradeResult = await liveClient.placeOrder(tradeRequest);
                } finally {
                    activeOrderMutationCountRef.current = Math.max(
                        0,
                        activeOrderMutationCountRef.current - 1,
                    );
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                // Classify error: connection-lost means WS dropped while order was in-flight;
                // timeout means MT5 was slow but the order may have still executed on the server.
                const isConnectionLost = /connection lost|reconnecting|cancelled|websocket connection closed|websocket connection error/i.test(msg);
                const isTimedOut = /timed out/i.test(msg) || /trade context busy/i.test(msg);

                if (isConnectionLost || isTimedOut) {
                    const consumeConfirmedPendingOrder = () => {
                        const pendingOrderConfirmation =
                            pendingOrderConfirmationsRef.current.get(pendingOrderConfirmationId);
                        if (!pendingOrderConfirmation?.confirmed) {
                            return null;
                        }

                        return consumePendingOrderConfirmation(pendingOrderConfirmationId);
                    };

                    if (consumeConfirmedPendingOrder()?.confirmed) {
                        if (order.orderType === 'market') {
                            addOptimisticOpenPosition(
                                {
                                    symbol: order.symbol,
                                    type: order.type,
                                    volume: order.volume,
                                    sl: order.sl,
                                    tp: order.tp,
                                },
                                liveMarketPrice,
                            );
                        }
                        void refreshLiveTradingState({ forcePositionsRefresh: true });
                        schedulePostTradeRefresh(TERMINAL_POST_TRADE_SUCCESS_REFRESH_DELAYS_MS);
                        return;
                    }

                    if (isConnectionLost) {
                        handleShowToast(
                            'warning',
                            'Connection interrupted',
                            `ReconnectingΓÇª checking whether ${order.type.toUpperCase()} ${order.volume} ${order.symbol} reached the trade server.`,
                        );
                    }

                    // Always read the live client from the store ΓÇö never use the stale
                    // closure reference, which can be dead after a reconnect cycle.
                    const getLiveClient = () => useWebtraderStore.getState().wsClient;

                    // Poll until WS is authenticated again (30s: slow MT5 gateways can
                    // take 10ΓÇô20s to complete a full reconnect + auth handshake).
                    const waitForReconnect = async (): Promise<boolean> => {
                        const deadline = Date.now() + 30_000;
                        while (Date.now() < deadline) {
                            if (getLiveClient()?.isAuthenticated) return true;
                            await new Promise<void>(res => window.setTimeout(res, 500));
                        }
                        return Boolean(getLiveClient()?.isAuthenticated);
                    };

                    let reconnected = false;
                    void waitForReconnect().then((value) => {
                        reconnected = value;
                    });

                    // Check if the order already executed on MT5 before the disconnect.
                    const reconciliation = await waitForPostTradeReconciliation({
                        beforePositions: positionsBeforeOrder,
                        beforeAccountInfo: accountInfoBeforeOrder,
                        expectPositions: expectSubmittedMarketPosition,
                        isExpectedTradeResult: (payload) =>
                            terminalTradeExecutionMatchesPendingOrder(payload, pendingOrderCorrelation),
                        resolveOnTradeResult: true,
                        timeoutMs: TERMINAL_POST_TRADE_FAST_RECONCILE_TIMEOUT_MS,
                        refreshDelaysMs: TERMINAL_POST_TRADE_FAST_RECONCILE_REFRESH_DELAYS_MS,
                    });
                    const pendingOrderConfirmation = consumePendingOrderConfirmation(pendingOrderConfirmationId);

                    if (pendingOrderConfirmation?.confirmed) {
                        if (order.orderType === 'market') {
                            addOptimisticOpenPosition(
                                {
                                    symbol: order.symbol,
                                    type: order.type,
                                    volume: order.volume,
                                    sl: order.sl,
                                    tp: order.tp,
                                },
                                liveMarketPrice,
                            );
                        }
                        void refreshLiveTradingState({ forcePositionsRefresh: true });
                        schedulePostTradeRefresh(TERMINAL_POST_TRADE_SUCCESS_REFRESH_DELAYS_MS);
                        return;
                    }

                    if (
                        reconciliation.positionsSettled ||
                        reconciliation.tradeResultSucceeded
                    ) {
                        if (order.orderType === 'market' && !reconciliation.positionsSettled) {
                            addOptimisticOpenPosition(
                                {
                                    symbol: order.symbol,
                                    type: order.type,
                                    volume: order.volume,
                                    sl: order.sl,
                                    tp: order.tp,
                                },
                                liveMarketPrice,
                            );
                        }
                        handleShowToast(
                            'success',
                            'Order placed',
                            `${order.type.toUpperCase()} ${order.volume} ${order.symbol} ΓÇö confirmed after reconnect.`,
                        );
                        schedulePostTradeRefresh(TERMINAL_POST_TRADE_SUCCESS_REFRESH_DELAYS_MS);
                        return;
                    }

                    // Do not resend automatically: the first request may have reached MT5
                    // even if the websocket timed out or dropped before confirmation.
                    handleShowToast(
                        'warning',
                        'Order outcome uncertain',
                        reconnected || Boolean(getLiveClient()?.isAuthenticated)
                            ? `${order.type.toUpperCase()} ${order.volume} ${order.symbol} was not confirmed. Check positions and history before manually retrying.`
                            : `${order.type.toUpperCase()} ${order.volume} ${order.symbol} was not confirmed and connection is still unavailable. Check positions and history after reconnect before manually retrying.`,
                    );
                    setIsOrderPanelOpen(true);
                    return;
                }
                clearPendingOrderConfirmation(pendingOrderConfirmationId);
                removeOptimisticOpenPosition(submittedOptimisticPositionId);
                throw error;
            }

            if (isUnknownOutcomeTerminalTradeResult(tradeResult)) {
                const reconciliation = await waitForPostTradeReconciliation({
                    beforePositions: positionsBeforeOrder,
                    beforeAccountInfo: accountInfoBeforeOrder,
                    expectPositions: expectSubmittedMarketPosition,
                    isExpectedTradeResult: (payload) =>
                        terminalTradeExecutionMatchesPendingOrder(payload, pendingOrderCorrelation),
                    resolveOnTradeResult: true,
                    timeoutMs: TERMINAL_POST_TRADE_FAST_RECONCILE_TIMEOUT_MS,
                    refreshDelaysMs: TERMINAL_POST_TRADE_FAST_RECONCILE_REFRESH_DELAYS_MS,
                });
                const pendingOrderConfirmation = consumePendingOrderConfirmation(pendingOrderConfirmationId);

                if (pendingOrderConfirmation?.confirmed) {
                    if (order.orderType === 'market') {
                        addOptimisticOpenPosition(
                            {
                                symbol: order.symbol,
                                type: order.type,
                                volume: order.volume,
                                sl: order.sl,
                                tp: order.tp,
                            },
                            liveMarketPrice,
                        );
                    }
                    void refreshLiveTradingState({ forcePositionsRefresh: true });
                    schedulePostTradeRefresh(TERMINAL_POST_TRADE_SUCCESS_REFRESH_DELAYS_MS);
                    return;
                }

                if (
                    reconciliation.positionsSettled ||
                    reconciliation.tradeResultSucceeded
                ) {
                    if (order.orderType === 'market' && !reconciliation.positionsSettled) {
                        addOptimisticOpenPosition(
                            {
                                symbol: order.symbol,
                                type: order.type,
                                volume: order.volume,
                                sl: order.sl,
                                tp: order.tp,
                            },
                            liveMarketPrice,
                        );
                    }
                    handleShowToast(
                        'success',
                        'Order placed',
                        `${order.type.toUpperCase()} ${order.volume} ${order.symbol} ΓÇö confirmed after trade-server check.`,
                    );
                    schedulePostTradeRefresh(TERMINAL_POST_TRADE_SUCCESS_REFRESH_DELAYS_MS);
                    return;
                }

                handleShowToast(
                    'warning',
                    'Order outcome pending',
                    `${order.type.toUpperCase()} ${order.volume} ${order.symbol} was sent to MT5 but the dealer answer timed out. Check positions and history before manually retrying.`,
                );
                setIsOrderPanelOpen(true);
                return;
            }

            // MT5 retcodes: 10009 = Done, 10008 = Placed (pending), 10010 = Partial
            const MT5_SUCCESS_CODES = new Set([10009, 10008, 10010]);
            if (tradeResult.retcode != null && !MT5_SUCCESS_CODES.has(tradeResult.retcode)) {
                const MT5_REJECT_REASONS: Record<number, string> = {
                    10013: 'Invalid request ΓÇö check that the account is properly configured for trading.',
                    10019: 'Not enough money ΓÇö fund your account to trade.',
                    10006: 'Order rejected by the trade server.',
                    10030: 'Trading is disabled for this account.',
                    10031: 'Market is closed.',
                    10032: 'Volume is below the symbol minimum.',
                    10033: 'Volume exceeds the symbol maximum.',
                    10034: 'Volume must match the symbol step.',
                    10018: 'Market is closed.',
                    10004: 'Requote ΓÇö retry the order.',
                    10014: 'Insufficient free margin.',
                    10015: 'Prices have changed ΓÇö retry the order.',
                    10016: 'Invalid stops ΓÇö check SL/TP levels.',
                    10021: 'No price available ΓÇö market may be closed.',
                    10025: 'Trade context busy ΓÇö retry in a moment.',
                };
                const reason = tradeResult.comment
                    || MT5_REJECT_REASONS[tradeResult.retcode]
                    || `Trade rejected (MT5 code ${tradeResult.retcode}).`;
                clearPendingOrderConfirmation(pendingOrderConfirmationId);
                removeOptimisticOpenPosition(submittedOptimisticPositionId);
                handleShowToast('error', 'Order rejected', reason);
                setIsOrderPanelOpen(true);
                return;
            }

            if (order.orderType === 'market') {
                addOptimisticOpenPosition(
                    {
                        symbol: order.symbol,
                        type: order.type,
                        volume: order.volume,
                        sl: order.sl,
                        tp: order.tp,
                    },
                    liveMarketPrice,
                );
            }

            const pendingOrderConfirmation = consumePendingOrderConfirmation(pendingOrderConfirmationId);
            if (!pendingOrderConfirmation?.confirmed) {
                handleShowToast(
                    'success',
                    'Order submitted',
                    order.orderType === 'market'
                        ? `${order.type.toUpperCase()} ${order.volume} ${order.symbol} at server market price`
                        : `${order.type.toUpperCase()} ${order.volume} ${order.symbol} @ ${pendingOrderPrice.toFixed(priceDigits)}`,
                );
            }
            // Push events remain the fastest authoritative path. These bounded
            // retries cover MT5 snapshots that settle shortly after the ACK.
            schedulePostTradeRefresh(TERMINAL_POST_TRADE_SUCCESS_REFRESH_DELAYS_MS);
        };

        const run = async () => {
            if (activeTradingAccount?.status === 'Archived') {
                handleShowToast(
                    'warning',
                    'Account archived',
                    'Restore the account from the Accounts page before placing trades.',
                );
                setIsOrderPanelOpen(true);
                return;
            }

            if (activeTradingAccount?.platform === 'ctrader') {
                handleShowToast(
                    'warning',
                    'Unsupported account',
                    'The terminal page currently supports live auto-trading only for MT5 accounts.',
                );
                setIsOrderPanelOpen(true);
                return;
            }

            if (connectAccountId) {
                await placeLiveOrder();
                return;
            }

            handleShowToast(
                'warning',
                'MT5 connection required',
                'Select an MT5 account/session before placing trades, or restore the account from the Accounts page.',
            );
            setIsOrderPanelOpen(true);
        };

        return run().catch((error) => {
            handleShowToast(
                'error',
                'Order failed',
                error instanceof Error ? error.message : 'Failed to submit order.',
            );
        });
    }, [
        activeTradingAccount,
        addOptimisticOpenPosition,
        clearPendingOrderConfirmation,
        connectAccountId,
        consumePendingOrderConfirmation,
        handleShowToast,
        priceDigits,
        refreshLiveTradingState,
        registerPendingOrderConfirmation,
        removeOptimisticOpenPosition,
        schedulePostTradeRefresh,
        storeWsClient,
        waitForPostTradeReconciliation,
    ]);

    const handleUpdatePosition = useCallback((id: string, updates: Partial<Position>) => {
        const run = async () => {
            if (connectAccountId) {
                const getLiveClient = () => useWebtraderStore.getState().wsClient;
                let liveClient = getLiveClient();

                if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                    const isReconnecting = useWebtraderStore.getState().connectionStatus === 'reconnecting';
                    if (isReconnecting || liveClient) {
                        const deadline = Date.now() + 8000;
                        while (Date.now() < deadline) {
                            liveClient = getLiveClient();
                            if (liveClient?.isConnected && liveClient.isAuthenticated) break;
                            await new Promise<void>(res => window.setTimeout(res, 500));
                        }
                    }
                }

                if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                    throw new Error('Live terminal is not connected.');
                }

                const ticket = Number.parseInt(id, 10);
                if (!Number.isFinite(ticket)) {
                    throw new Error('Invalid position ticket.');
                }

                if (pendingPositionActions.has(id)) {
                    return; // Already updating or closing this position
                }
                
                const existingPosition = liveTerminalPositions.find(p => p.id === id || String(p.ticket) === String(ticket));
                
                setPendingPositionActions(prev => new Set(prev).add(id));
                try {
                    const result = await liveClient.modifyOrder(ticket, {
                        sl: updates.sl !== undefined ? (updates.sl === null ? 0 : updates.sl) : (existingPosition?.sl ?? undefined),
                        tp: updates.tp !== undefined ? (updates.tp === null ? 0 : updates.tp) : (existingPosition?.tp ?? undefined),
                        isPosition: true,
                    });
                    if (result.retcode !== 10009 && result.retcode !== 10008 && result.retcode !== 10010) {
                        const MT5_REJECT_REASONS: Record<number, string> = {
                            10013: 'Invalid request ΓÇö check that the account is properly configured for trading.',
                            10019: 'Not enough money ΓÇö fund your account to trade.',
                            10006: 'Order rejected by the trade server.',
                            10030: 'Trading is disabled for this account.',
                            10031: 'Market is closed.',
                            10032: 'Volume is below the symbol minimum.',
                            10033: 'Volume exceeds the symbol maximum.',
                            10034: 'Volume must match the symbol step.',
                            10018: 'Market is closed.',
                            10004: 'Requote ΓÇö retry the order.',
                            10014: 'Insufficient free margin.',
                            10015: 'Prices have changed ΓÇö retry the order.',
                            10016: 'Invalid stops ΓÇö check SL/TP levels.',
                            10021: 'No price available ΓÇö market may be closed.',
                            10025: 'Trade context busy ΓÇö retry in a moment.',
                        };
                        const reason = result.comment || MT5_REJECT_REASONS[result.retcode as number] || `Modification rejected by trade server (code ${result.retcode}).`;
                        throw new Error(reason);
                    }
                    await refreshLiveTradingState({ forcePositionsRefresh: true });
                    handleShowToast('success', 'Position updated', `Updated trade ${ticket}.`);
                } finally {
                    setPendingPositionActions(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }
                return;
            }

            handleShowToast(
                'warning',
                'MT5 connection required',
                'Connect or select an MT5 account/session before modifying positions.',
            );
            setIsOrderPanelOpen(true);
        };

        void run().catch((error) => {
            handleShowToast(
                'error',
                'Update failed',
                error instanceof Error ? error.message : 'Failed to update position.',
            );
        });
    }, [connectAccountId, handleShowToast, liveTerminalPositions, refreshLiveTradingState, storeWsClient, pendingPositionActions]);

    const handleClosePosition = useCallback((id: string) => {
        const run = async () => {
            if (connectAccountId) {
                const getLiveClient = () => useWebtraderStore.getState().wsClient;
                let liveClient = getLiveClient();

                if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                    const isReconnecting = useWebtraderStore.getState().connectionStatus === 'reconnecting';
                    if (isReconnecting || liveClient) {
                        const deadline = Date.now() + 8000;
                        while (Date.now() < deadline) {
                            liveClient = getLiveClient();
                            if (liveClient?.isConnected && liveClient.isAuthenticated) break;
                            await new Promise<void>(res => window.setTimeout(res, 500));
                        }
                    }
                }

                if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                    throw new Error('Live terminal is not connected.');
                }

                const ticket = Number.parseInt(id, 10);
                if (!Number.isFinite(ticket)) {
                    throw new Error('Invalid position ticket.');
                }

                if (pendingPositionActions.has(id)) {
                    return; // Already closing or updating this position
                }

                // Snapshot the position before closing so we can record it in the Closed tab
                const closingPosition = liveTerminalPositions.find(p => p.id === id);
                setPendingPositionActions(prev => new Set(prev).add(id));
                try {
                    const result = await liveClient.closePosition(ticket);
                    // 10009=DONE, 10008=PLACED, 10010=DONE_PARTIAL ΓÇö all MT5 success codes
                    if (result.retcode !== 10009 && result.retcode !== 10008 && result.retcode !== 10010) {
                        const MT5_REJECT_REASONS: Record<number, string> = {
                            10013: 'Invalid request ΓÇö check that the account is properly configured for trading.',
                            10019: 'Not enough money ΓÇö fund your account to trade.',
                            10006: 'Order rejected by the trade server.',
                            10030: 'Trading is disabled for this account.',
                            10031: 'Market is closed.',
                            10032: 'Volume is below the symbol minimum.',
                            10033: 'Volume exceeds the symbol maximum.',
                            10034: 'Volume must match the symbol step.',
                            10018: 'Market is closed.',
                            10004: 'Requote ΓÇö retry the order.',
                            10014: 'Insufficient free margin.',
                            10015: 'Prices have changed ΓÇö retry the order.',
                            10016: 'Invalid stops ΓÇö check SL/TP levels.',
                            10021: 'No price available ΓÇö market may be closed.',
                            10025: 'Trade context busy ΓÇö retry in a moment.',
                        };
                        const reason = result.comment || MT5_REJECT_REASONS[result.retcode as number] || `Close rejected by trade server (code ${result.retcode}).`;
                        throw new Error(reason);
                    }
                    // Only remove AFTER server confirms success ΓÇö prevents permanently
                    // losing position from UI if the close fails or times out
                    removeClosedPositionsFromActiveAccount([ticket]);
                    // Instantly add to closed trades tab using live close price
                    if (closingPosition) {
                        const closingQuote = getSafeLiveQuoteSnapshotBySymbol(
                            closingPosition.symbol,
                            getLivePriceSnapshotBySymbol,
                            latestStorePricesRef.current,
                        );
                        const closePrice = closingPosition.type === 'buy'
                            ? (closingQuote?.bid ?? closingPosition.currentPrice)
                            : (closingQuote?.ask ?? closingPosition.currentPrice);
                        setClosedTrades(prev => [{
                            id: closingPosition.id,
                            symbol: closingPosition.symbol,
                            type: closingPosition.type,
                            volume: closingPosition.volume,
                            openPrice: closingPosition.openPrice,
                            closePrice,
                            profit: closingPosition.profit,
                            openTime: closingPosition.openTime,
                            closeTime: toMt5IsoString(getMt5ServerTimeMs()),
                        }, ...prev.slice(0, 199)]);
                    }
                    handleShowToast('success', 'Position closed', `Closed trade ${ticket}.`);
                } finally {
                    const firstRefresh = await refreshLiveTradingState({ forcePositionsRefresh: true }).catch(() => ({ positionsUpdated: false as boolean, accountInfoUpdated: false as boolean }));
                    // If the first refresh missed updated state (backend lock contention right
                    // after trade), schedule a follow-up pass after a short back-off.
                    if (!firstRefresh.positionsUpdated || !firstRefresh.accountInfoUpdated) {
                        schedulePostTradeRefresh(800, console.error);
                    }
                    // Extra delayed refresh to ensure balance is fully settled on MT5 side
                    schedulePostTradeRefresh(1500);
                    setPendingPositionActions(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }
                return;
            }

            handleShowToast(
                'warning',
                'MT5 connection required',
                'Connect or select an MT5 account/session before closing positions.',
            );
            setIsOrderPanelOpen(true);
        };

        void run().catch((error) => {
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes('Position not found')) {
                // Position no longer exists on MT5 (SL/TP hit or closed from another terminal).
                removeClosedPositionsFromActiveAccount([Number.parseInt(id, 10)]);
                handleShowToast('success', 'Position closed', `Closed trade ${id}.`);
            } else {
                // Server rejected close ΓÇö refreshLiveTradingState() in finally restores the position
                handleShowToast('error', 'Close failed', msg);
            }
        });
    }, [connectAccountId, handleShowToast, liveTerminalPositions, refreshLiveTradingState, removeClosedPositionsFromActiveAccount, schedulePostTradeRefresh, setClosedTrades, storeWsClient, pendingPositionActions]);

    const handleCloseAll = useCallback((type: string = 'all') => {
        const run = async () => {
            if (connectAccountId) {
                const getLiveClient = () => useWebtraderStore.getState().wsClient;
                let liveClient = getLiveClient();

                if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                    const isReconnecting = useWebtraderStore.getState().connectionStatus === 'reconnecting';
                    if (isReconnecting || liveClient) {
                        const deadline = Date.now() + 8000;
                        while (Date.now() < deadline) {
                            liveClient = getLiveClient();
                            if (liveClient?.isConnected && liveClient.isAuthenticated) break;
                            await new Promise<void>(res => window.setTimeout(res, 500));
                        }
                    }
                }

                if (!liveClient?.isConnected || !liveClient.isAuthenticated) {
                    throw new Error('Live terminal is not connected.');
                }

                const positionsToClose = liveTerminalPositions.filter(pos => {
                    if (type === 'all') return true;
                    if (type === 'profitable') return pos.profit >= 0;
                    if (type === 'losing') return pos.profit < 0;
                    if (type === 'buy') return pos.type === 'buy';
                    if (type === 'sell') return pos.type === 'sell';
                    if (type.startsWith('symbol-')) return pos.symbol === type.substring(7);
                    return false;
                });

                if (positionsToClose.length === 0) return;

                const results = await Promise.allSettled(
                    positionsToClose.map(async (position) => {
                        const ticket = Number.parseInt(position.ticket, 10);
                        try {
                            const result = await liveClient!.closePosition(ticket);
                            if (result.retcode !== 10009 && result.retcode !== 10008 && result.retcode !== 10010) {
                                throw new Error(result.comment || `Close rejected (code ${result.retcode}).`);
                            }
                            return result;
                        } catch (err: any) {
                            if (err.message && err.message.includes('Position not found')) {
                                return { retcode: 10009 };
                            }
                            throw err;
                        }
                    })
                );

                await refreshLiveTradingState({ forcePositionsRefresh: true });
                const closedTickets = positionsToClose
                    .map((position, index) => ({
                        ticket: Number.parseInt(position.ticket, 10),
                        result: results[index],
                    }))
                    .filter(({ ticket, result }) => Number.isFinite(ticket) && result?.status === 'fulfilled')
                    .map(({ ticket }) => ticket);
                removeClosedPositionsFromActiveAccount(closedTickets);

                const failed = results.filter((result) => result.status === 'rejected').length;
                if (failed > 0) {
                    handleShowToast(
                        'warning',
                        'Close all completed with warnings',
                        `${positionsToClose.length - failed} positions were closed, ${failed} failed.`,
                    );
                    return;
                }

                handleShowToast('success', 'Positions closed', `Successfully closed ${positionsToClose.length} positions.`);
                return;
            }

            handleShowToast(
                'warning',
                'MT5 connection required',
                'Connect or select an MT5 account/session before closing positions.',
            );
            setIsOrderPanelOpen(true);
        };

        void run().catch((error) => {
            handleShowToast(
                'error',
                'Close all failed',
                error instanceof Error ? error.message : 'Failed to close all positions.',
            );
        });
    }, [
        connectAccountId,
        handleShowToast,
        liveTerminalPositions,
        refreshLiveTradingState,
        removeClosedPositionsFromActiveAccount,
        storeWsClient,
    ]);

    const handleTopUp = useCallback(() => {
        setIsOrderPanelOpen(true);
        handleShowToast(
            'info',
            'Funding & account tools',
            'Open the Accounts page to restore an account or manage account funding.',
        );
    }, [handleShowToast]);

    const handleSwitchAccount = useCallback((id: string) => {
        if (!id || id === activeAccountId) {
            return;
        }

        const nextAccount = findTradingAccountByLookup(id);
        const nextTerminalAccountId = nextAccount ? getTerminalSessionAccountId(nextAccount) : id;
        persistLastTerminalAccount(nextAccount);
        router.replace(`/terminal?accountId=${encodeURIComponent(nextTerminalAccountId)}`);
    }, [activeAccountId, findTradingAccountByLookup, getTerminalSessionAccountId, persistLastTerminalAccount, router]);

    const handleOpenTradePanel = useCallback(() => {
        setIsOrderPanelOpen(true);
    }, []);

    const handleCloseOrderPanel = useCallback(() => {
        setIsOrderPanelOpen(false);
    }, []);

    const handleToggleOrderPanel = useCallback(() => {
        setIsOrderPanelOpen((open) => !open);
    }, []);

    const handleSelectedSell = useCallback(() => {
        if (!selectedInstrument) {
            return;
        }

        setIsOrderPanelOpen(true);
        useWebtraderStore.getState().setActiveAction('sell');
    }, [selectedInstrument]);

    const handleSelectedBuy = useCallback(() => {
        if (!selectedInstrument) {
            return;
        }

        setIsOrderPanelOpen(true);
        useWebtraderStore.getState().setActiveAction('buy');
    }, [selectedInstrument]);

    const handleAddPriceAlert = (symbol: string, price: number) => {
        if (!Number.isFinite(price) || price <= 0) {
            handleShowToast('warning', 'Invalid alert', 'A live market price is required to create an alert.');
            return;
        }

        const instrument = getInstrumentForSymbol(symbol);
        const referencePrice = instrument?.bid ?? instrument?.ask ?? price;
        const condition: PriceAlert['condition'] =
            price > referencePrice
                ? 'greater_than'
                : price < referencePrice
                    ? 'less_than'
                    : 'crosses';

        const nextAlert: PriceAlert = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            symbol: instrument?.symbol ?? symbol,
            price,
            condition,
            active: true,
            createdAt: new Date().toISOString(),
        };

        setPriceAlerts((prev) => [nextAlert, ...prev]);
        handleShowToast(
            'success',
            'Price alert created',
            `${nextAlert.symbol} ${condition.replace('_', ' ')} ${price.toFixed(instrument?.digits ?? priceDigits)}`,
        );
    };
    const handleTogglePriceAlert = useCallback((id: string) => {
        setPriceAlerts((prev) =>
            prev.map((alert) => (alert.id === id ? { ...alert, active: !alert.active } : alert)),
        );
    }, []);

    const handleDeletePriceAlert = useCallback((id: string) => {
        setPriceAlerts((prev) => prev.filter((alert) => alert.id !== id));
    }, []);
    const handleToggleSidebar = useCallback((panel: 'instruments' | 'calendar' | 'alerts' | 'settings' | 'signals' | 'positions' | 'more' | 'market-status' | null) => {
        setActivePanel((current) => (current === panel ? null : panel));
    }, []);

    if (isLoadingTerminalAccountData) {
        // Same black-dots open experience as launch; do not flash a skeleton then a blank chart.
        return <TerminalLaunchLoadingOverlay />;
    }

    return (
        <>
        {terminalOpeningOverlayActive && (
            <TerminalLaunchLoadingOverlay error={terminalLaunchSession.error} />
        )}
        <div
            aria-hidden={terminalOpeningOverlayActive ? true : undefined}
            className="flex h-[100dvh] w-full min-w-0 max-w-[100dvw] flex-col overflow-hidden bg-background p-0"
        >
            {/* Header */}
            <Header
                account={account}
                positions={terminalPositions}
                selectedSymbol={selectedSymbol}
                openTabs={openTabs}
                userProfile={userProfile}
                notifications={notifications}
                accounts={headerAccounts}
                activeAccountId={activeAccountId}
                onSwitchAccount={handleSwitchAccount}
                onSelectTab={handleSelectSymbol}
                onCloseTab={handleCloseTab}
                onToggleSidebar={handleToggleSidebar}
                onReorderTabs={handleReorderTabs}
                onTopUp={handleTopUp}
                onMarkNotificationsRead={handleMarkNotificationsRead}
                onAddPriceAlert={handleAddPriceAlert}
                onShowToast={handleShowToast}
                onOpenOrderPanel={handleOpenTradePanel}
                availableInstruments={catalogInstruments}
            />

            {/* Main Content Area */}
            <div className="relative flex min-w-0 flex-1 overflow-hidden">
                {/* Global Sidebar (Icons) */}
                <div className="flex-shrink-0 h-full bg-card rounded-none overflow-hidden hidden md:block border-r-[6px] border-border z-50 relative">
                    <Sidebar
                        activePanel={activePanel}
                        onTogglePanel={handleToggleSidebar}
                    />
                </div>

                {/* Main Viewport containing Panels and Footer */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden relative">
                    <div
                        ref={containerRef}
                        className="relative flex min-w-0 flex-1 overflow-hidden"
                        style={{
                            [TERMINAL_LEFT_WIDTH_CSS_VAR]: `${panelWidth}px`,
                            [TERMINAL_RIGHT_WIDTH_CSS_VAR]: `${rightPanelWidth}px`,
                            [TERMINAL_POSITIONS_HEIGHT_CSS_VAR]: `${positionsHeight}px`,
                        } as CSSProperties}
                    >
                        {/* Dynamically Expandable Left Panel */}
                        {activePanel && activePanel !== 'positions' && (
                            <div
                                className="z-[60] flex min-w-0 flex-shrink-0 flex-col overflow-hidden rounded-none border-border bg-background transition-all duration-300 ease-in-out absolute inset-0 w-full md:relative md:w-[var(--terminal-left-width)] md:border-r-[6px]"
                            >
                                {activePanel === 'instruments' && (
                                    <InstrumentsPanel
                                        instruments={instruments}
                                        searchInstruments={catalogInstruments}
                                        positionPriceSeedsBySymbol={positionPriceSeedsBySymbol}
                                        selectedSymbol={selectedSymbol}
                                        onSelect={handleSelectSymbol}
                                        onClose={() => setActivePanel(null)}
                                        onVisibleSearchSymbolsChange={handleVisibleMarketSearchSymbolsChange}
                                        onSymbolHover={handleHoverSymbol}
                                        panelWidth={panelWidth}
                                    />
                                )}
                                {activePanel === 'calendar' && (
                                    <EconomicCalendar onClose={() => setActivePanel(null)} />
                                )}
                                {activePanel === 'alerts' && (
                                    <AlertsPanel
                                        alerts={priceAlerts}
                                        onToggleAlert={handleTogglePriceAlert}
                                        onDeleteAlert={handleDeletePriceAlert}
                                        onClose={() => setActivePanel(null)}
                                    />
                                )}
                                {activePanel === 'settings' && (
                                    <SettingsPanel onClose={() => setActivePanel(null)} currentTheme={currentTheme} onSetTheme={setTheme} />
                                )}
                                {activePanel === 'signals' && (
                                    <SignalsPanel onClose={() => setActivePanel(null)} />
                                )}
                                {activePanel === 'market-status' && (
                                    <MarketStatusPanel
                                        accountId={connectAccountId ?? ''}
                                        onClose={() => setActivePanel(null)}
                                    />
                                )}
                                {activePanel === 'more' && (
                                    <div className="flex h-full flex-col bg-background">
                                        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-4">
                                            <h2 className="text-[15px] font-bold text-foreground">More Tools</h2>
                                            <button onClick={() => setActivePanel(null)} className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                                                <X size={18} />
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                                            <button onClick={() => setActivePanel('calendar')} className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 text-left shadow-sm hover:bg-accent/50">
                                                <div className="rounded-full bg-primary/10 p-2 text-primary"><Calendar size={20} /></div>
                                                <div className="flex-1"><h3 className="font-semibold text-foreground">Economic Calendar</h3><p className="text-[12px] text-muted-foreground">Market events and indicators</p></div>
                                                <ChevronRight size={18} className="text-muted-foreground/50" />
                                            </button>
                                            <button onClick={() => setActivePanel('alerts')} className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 text-left shadow-sm hover:bg-accent/50">
                                                <div className="rounded-full bg-primary/10 p-2 text-primary"><Bell size={20} /></div>
                                                <div className="flex-1"><h3 className="font-semibold text-foreground">Price Alerts</h3><p className="text-[12px] text-muted-foreground">Manage active alerts</p></div>
                                                <ChevronRight size={18} className="text-muted-foreground/50" />
                                            </button>
                                            <button onClick={() => setActivePanel('signals')} className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 text-left shadow-sm hover:bg-accent/50">
                                                <div className="rounded-full bg-primary/10 p-2 text-primary"><TrendingUp size={20} /></div>
                                                <div className="flex-1"><h3 className="font-semibold text-foreground">Trading Signals</h3><p className="text-[12px] text-muted-foreground">Technical analysis ideas</p></div>
                                                <ChevronRight size={18} className="text-muted-foreground/50" />
                                            </button>
                                            <button onClick={() => setActivePanel('settings')} className="flex items-center gap-4 rounded-xl border border-border/50 bg-card p-4 text-left shadow-sm hover:bg-accent/50">
                                                <div className="rounded-full bg-primary/10 p-2 text-primary"><Settings size={20} /></div>
                                                <div className="flex-1"><h3 className="font-semibold text-foreground">Terminal Settings</h3><p className="text-[12px] text-muted-foreground">Theme and preferences</p></div>
                                                <ChevronRight size={18} className="text-muted-foreground/50" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Left Resize Divider ΓÇö sibling between left panel and center */}
                        {activePanel && (
                            <div className="flex-shrink-0 w-0 relative hidden md:flex items-center justify-center z-[200]">
                                <div
                                    className="absolute -left-[3px] w-[6px] h-full cursor-col-resize hover:bg-primary/50 transition-colors"
                                    onMouseDown={handleMouseDown}
                                    onTouchStart={handleMouseDown}
                                    onDoubleClick={handleDividerDoubleClick}
                                    style={{ touchAction: 'none' }}
                                />
                            </div>
                        )}

                        {/* Center Content (Chart + Positions) */}
                        <div
                            className="flex min-w-0 flex-1 basis-0 flex-col overflow-hidden md:min-w-[360px]"
                        >
                            {/* Main Chart Area */}
                            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-card md:min-h-[240px]">
                                {/*
                                  Mount charts as soon as the instrument is known (even while session
                                  restore is in progress) so first candles can arrive under the black
                                  open-terminal overlay. Do not wait for full restore before hydrate.
                                */}
                                {selectedSymbolBelongsToActiveAccount && selectedInstrument ? (
                                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                                        {/*
                                          Charts stay mounted so seed/history can load and emit hasCandles.
                                          Chart section is revealed only once real candles arrive for the active symbol/TF.
                                        */}
                                        <div
                                            className="relative flex-1 bg-card"
                                            aria-hidden={!selectedChartSectionReady}
                                        >
                                            {keptAliveChartEntries.map((chartEntry, chartIndex) => (
                                                <div
                                                    key={`${accountSessionScopeId ?? connectAccountId ?? 'terminal'}:${getTerminalSymbolKey(chartEntry.symbol)}`}
                                                    className={`absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden bg-card ${
                                                        chartEntry.isActive
                                                            ? 'visible z-10'
                                                            : 'invisible pointer-events-none z-0'
                                                    }`}
                                                    aria-hidden={!chartEntry.isActive || !selectedChartSectionReady}
                                                >
                                                    <TradingChart
                                                        symbol={chartEntry.symbol}
                                                        accountSessionScopeId={accountSessionScopeId}
                                                        basePrice={chartEntry.instrument.bid}
                                                        instrument={chartEntry.instrument}
                                                        positions={chartEntry.positions}
                                                        onClosePosition={handleClosePosition}
                                                        onUpdatePosition={handleUpdatePosition}
                                                        onSell={handleSelectedSell}
                                                        onBuy={handleSelectedBuy}
                                                        onOpenOrderPanel={handleOpenTradePanel}
                                                        isOrderPanelOpen={
                                                            chartEntry.isActive &&
                                                            selectedChartSectionReady &&
                                                            isOrderPanelOpen
                                                        }
                                                        onToggleOrderPanel={handleToggleOrderPanel}
                                                        onHistoryStatusChange={handleChartHistoryStatusChange}
                                                        timeframeMinutes={chartTimeframeMinutes}
                                                        onTimeframeChange={handleChartTimeframeChange}
                                                        chartType={chartType}
                                                        onChartTypeChange={setChartType}
                                                        layoutPanes={chartEntry.isActive ? chartLayoutPanes : 1}
                                                        onLayoutPanesChange={setChartLayoutPanes}
                                                        chartBarSpacing={chartBarSpacing}
                                                        onChartBarSpacingChange={setChartBarSpacing}
                                                        isActive={chartEntry.isActive}
                                                        backgroundHydrationDelayMs={
                                                            // Keep-alive: mount quickly so history+live are warm before switch.
                                                            chartEntry.isActive ? 0 : Math.min((chartIndex + 1) * 80, 200)
                                                        }
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        {/*
                                          In-pane loading only after the terminal is visible.
                                          During open, black dots cover the whole app instead.
                                        */}
                                        {!selectedChartSectionReady && !terminalOpeningOverlayActive ? (
                                            <div
                                                className="absolute inset-0 z-20 bg-card"
                                                aria-busy="true"
                                                aria-live="polite"
                                            >
                                                <TerminalChartLoadingShell />
                                            </div>
                                        ) : null}
                                    </div>
                                ) : isTerminalRestoreInProgress ? (
                                    <TerminalChartLoadingShell />
                                ) : (terminalConnectionStatus === 'error' || activeGroupSymbolsState.error) ? (
                                    <div className="flex h-full flex-col items-center justify-center px-6 py-8">
                                        <div className="flex max-w-[420px] flex-col items-center text-center">
                                            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
                                                <X className="h-6 w-6 text-destructive" strokeWidth={2.5} />
                                            </div>
                                            <p className="text-[17px] font-bold text-foreground tracking-tight">Terminal Connection Error</p>
                                            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground/90">
                                                {connectError || activeGroupSymbolsState.error || 'The terminal connection failed to establish.'}
                                            </p>
                                            <button
                                                onClick={() => window.location.reload()}
                                                className="mt-8 rounded-[8px] bg-primary px-6 py-2.5 text-[13px] font-bold tracking-wide text-primary-foreground shadow-sm hover:bg-primary/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                            >
                                                Reload Terminal
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex h-full items-center justify-center px-6 py-8">
                                        <div className="max-w-[320px] text-center">
                                            <p className="text-sm font-bold text-foreground">No live market data available</p>
                                            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                                                Connect or select an active MT5 account/session and wait for live symbols to load before trading.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Bottom Panel: Positions Table - Resizable */}
                            <div
                                className={`${activePanel === 'positions' ? 'absolute inset-0 z-[60] flex h-full w-full' : 'hidden md:flex'} flex-col flex-shrink-0 md:relative md:z-20 md:h-[var(--terminal-positions-height)] bg-background rounded-none overflow-hidden md:border-t-[6px] md:border-border`}
                            >
                                <div
                                    className="hidden md:block absolute -top-[3px] left-0 right-0 h-[6px] cursor-row-resize z-[100] hover:bg-primary/50 transition-colors"
                                    onMouseDown={handleHeightMouseDown}
                                    onTouchStart={handleHeightMouseDown}
                                    style={{ touchAction: 'none' }}
                                />
                                {activePanel === 'positions' && (
                                    <div className="md:hidden flex h-14 flex-shrink-0 items-center justify-between border-b border-border bg-background px-4">
                                        <h2 className="text-[15px] font-bold text-foreground">Positions & Orders</h2>
                                        <button onClick={() => setActivePanel(null)} className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                                            <X size={18} />
                                        </button>
                                    </div>
                                )}
                                <PositionsTable
                                    openPositions={terminalPositions}
                                    pendingOrders={storeOrders}
                                    closedTrades={closedTrades}
                                    positionsLoading={positionsTableLoading}
                                    positionsError={positionsLoadState.error}
                                    positionsWarning={positionsLoadState.warning ?? null}
                                    closedHistoryLoading={closedHistoryState.isLoading}
                                    closedHistoryLoaded={closedHistoryState.isLoaded}
                                    closedHistoryError={closedHistoryState.error}
                                    onClosePosition={handleClosePosition}
                                    onUpdatePosition={handleUpdatePosition}
                                    onCloseAll={handleCloseAll}
                                    onRetryPositions={() => {
                                        void refreshLiveTradingState({ forcePositionsRefresh: true });
                                    }}
                                    onOpenClosedTab={() => {
                                        void loadClosedTradeHistory();
                                    }}
                                    onRetryClosedHistory={() => {
                                        void loadClosedTradeHistory({ force: true });
                                    }}
                                    onShowToast={handleShowToast}
                                />
                            </div>
                        </div>

                        {/* Right Resize Divider ΓÇö sibling between center and right panel */}
                        {isOrderPanelOpen && (
                            <div className="flex-shrink-0 w-0 relative hidden md:flex items-center justify-center z-[200]">
                                <div
                                    className="absolute -left-[3px] w-[6px] h-full cursor-col-resize hover:bg-primary/50 transition-colors"
                                    onMouseDown={handleRightMouseDown}
                                    onTouchStart={handleRightMouseDown}
                                    onDoubleClick={handleRightDividerDoubleClick}
                                    style={{ touchAction: 'none' }}
                                />
                            </div>
                        )}

                        {/* Right Panel: Order / Deal Ticket */}
                        {isOrderPanelOpen && (
                            <div
                                className="absolute inset-0 z-40 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none border-l-[6px] border-border bg-card md:relative md:inset-auto md:w-[var(--terminal-right-width)] md:flex-shrink-0"
                            >
                                <div className="flex min-w-0 flex-shrink-0 items-center gap-2 overflow-hidden border-b-[6px] border-border bg-background px-2 py-2">
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-foreground">
                                        {tradePanelHeaderSymbol ? (
                                            <span className="flex-shrink-0">
                                                <SymbolIcon symbol={tradePanelHeaderSymbol} />
                                            </span>
                                        ) : null}
                                        <span className="min-w-0 truncate tracking-wide">
                                            {tradePanelTitle}
                                        </span>
                                    </div>
                                    <button
                                        aria-label="Close trade panel"
                                        title="Close trade panel"
                                        onClick={handleCloseOrderPanel}
                                        className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div className="min-h-0 flex-1 overflow-hidden">
                                    {isTerminalRestoreInProgress ? (
                                        <TerminalOrderPanelLoadingShell />
                                    ) : selectedInstrument ? (
                                        <OrderPanel
                                            instrument={selectedInstrument}
                                            onClose={handleCloseOrderPanel}
                                            onPlaceOrder={handlePlaceOrder}
                                        />
                                    ) : (
                                        <div className="flex h-full items-center justify-center px-5 py-8">
                                            <div className="max-w-[240px] text-center">
                                                <p className="text-sm font-bold text-foreground">Trade ticket unavailable</p>
                                                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                                                    No live instrument is selected yet. Connect an MT5 session, then choose a market symbol to trade.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status Bar */}
                    <div className="relative z-[100] flex h-[26px] min-w-0 flex-shrink-0 select-none items-center whitespace-nowrap border-t border-border bg-background font-mono text-[11px] tabular-nums">
                        
                        {/* Container that takes all available space and structures children in high-visibility bordered cells */}
                        <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden text-muted-foreground">
                            <div className="flex items-center h-full px-4 border-r border-border">
                                <span>Equity: <span className="text-foreground font-semibold">{account.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> <span className="text-muted-foreground">{account.currency || 'USD'}</span></span>
                            </div>
                            <div className="flex items-center h-full px-4 border-r border-border">
                                <span>Free Margin: <span className="text-foreground font-semibold">{account.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> <span className="text-muted-foreground">{account.currency || 'USD'}</span></span>
                            </div>
                            <div className="flex items-center h-full px-4 border-r border-border">
                                <span>Balance: <span className="text-foreground font-semibold">{account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> <span className="text-muted-foreground">{account.currency || 'USD'}</span></span>
                            </div>
                            <div className="flex items-center h-full px-4 border-r border-border">
                                <span>Margin: <span className="text-foreground font-semibold">{account.margin.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> <span className="text-muted-foreground">{account.currency || 'USD'}</span></span>
                            </div>
                            <div className="flex items-center h-full px-4 border-r border-border">
                                <span>Margin level: <span className="text-foreground font-semibold">{account.marginLevel > 0 ? `${account.marginLevel.toFixed(2)}%` : 'ΓÇö'}</span></span>
                            </div>
                            
                            {terminalPositions.length > 0 && (
                                <div className="flex items-center h-full gap-4 px-4 border-r border-border relative">
                                    <span className="text-muted-foreground font-mono">Total P/L, USD: <span className={`font-semibold ${terminalPositions.reduce((s, p) => s + (p.profit ?? 0), 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{terminalPositions.reduce((s, p) => s + (p.profit ?? 0), 0).toFixed(2)}</span></span>
                                    <button
                                        ref={closeAllButtonRef}
                                        onClick={() => setIsCloseAllModalOpen(prev => !prev)}
                                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-[3px] bg-accent/50 hover:bg-accent border border-border/50 text-foreground transition-colors font-sans text-[10px] font-semibold tracking-wide"
                                    >
                                        Close all <ChevronDown size={12} className="opacity-70" />
                                    </button>
                                    <CloseAllModal
                                        isOpen={isCloseAllModalOpen}
                                        onClose={() => setIsCloseAllModalOpen(false)}
                                        onConfirm={handleCloseAll}
                                        positions={terminalPositions}
                                        buttonRef={closeAllButtonRef}
                                    />
                                </div>
                            )}
                        </div>

                        {/* New connection dropdown (pinned to the right) */}
                        <div className="flex h-full flex-shrink-0 items-center px-4 bg-background border-l border-border">
                            <NetworkStatusMenu
                                status={networkConnectionStatus}
                                error={isSoftQuoteFeedNotice(networkConnectionError) ? null : networkConnectionError}
                                activeAccount={activeTradingAccount}
                                wsClient={storeWsClient}
                            />
                        </div>
                    </div>

                    {/* Mobile Bottom Navigation Bar */}
                    <div className="md:hidden flex h-[56px] w-full flex-shrink-0 items-center justify-around border-t border-border bg-card pb-safe pt-1 z-[200]">
                        <button
                            onClick={() => setActivePanel(null)}
                            className={`flex flex-col items-center justify-center gap-1 w-16 ${!activePanel ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                            <span className="text-[10px] font-medium leading-none">Chart</span>
                        </button>
                        <button
                            onClick={() => setActivePanel('positions')}
                            className={`flex flex-col items-center justify-center gap-1 w-16 ${activePanel === 'positions' ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            <Briefcase size={20} strokeWidth={2} />
                            <span className="text-[10px] font-medium leading-none">Positions</span>
                        </button>
                        <button
                            onClick={() => setActivePanel('instruments')}
                            className={`flex flex-col items-center justify-center gap-1 w-16 ${activePanel === 'instruments' ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            <Globe size={20} strokeWidth={2} />
                            <span className="text-[10px] font-medium leading-none">Markets</span>
                        </button>
                        <button
                            onClick={() => setActivePanel('more')}
                            className={`flex flex-col items-center justify-center gap-1 w-16 ${activePanel === 'more' ? 'text-primary' : 'text-muted-foreground'}`}
                        >
                            <Menu size={20} strokeWidth={2} />
                            <span className="text-[10px] font-medium leading-none">More</span>
                        </button>
                    </div>
                </div>
            </div>

            <TerminalOhlcHistoryDebugPanel
                isAvailable={isOhlcHistoryDebugAvailable}
                isOpen={isOhlcHistoryDebugPanelOpen}
                isPersistent={isOhlcHistoryDebugPersistent}
                snapshot={selectedHistoryDiagnostics}
                selectedSymbol={selectedBrokerSymbol || null}
                timeframeMinutes={selectedHistoryTimeframeMinutes}
                onToggleOpen={() => setIsOhlcHistoryDebugPanelOpen((current) => !current)}
                onTogglePersistent={handleToggleOhlcHistoryDebugPersistence}
            />

            {/* Global Toasts Overlay */}
            {toasts.length > 0 && (
                <div className="fixed bottom-8 left-4 md:left-[108px] z-[9999] flex flex-col gap-3 pointer-events-none">
                    {toasts.map(toast => (
                        <div key={toast.id} className="flex items-start gap-4 bg-popover rounded-[10px] p-4 pr-12 shadow-[0_16px_40px_-5px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-8 fade-in duration-300 min-w-[320px] max-w-[400px] relative pointer-events-auto transition-all">
                            <div className="flex-shrink-0 mt-[2px]">
                                {toast.type === 'success' && <div className="w-5 h-5 rounded-full border-2 border-success flex items-center justify-center p-0.5"><CheckCircle2 size={12} className="text-success" strokeWidth={3} /></div>}
                                {toast.type === 'info' && <AlarmClock size={20} className="text-primary" strokeWidth={2.5} />}
                                {toast.type === 'warning' && <div className="w-5 h-5 flex items-center justify-center"><Clock size={16} className="text-warning" /></div>}
                                {toast.type === 'error' && <div className="w-5 h-5 flex items-center justify-center"><X size={16} className="text-destructive" strokeWidth={3} /></div>}
                                {toast.type === 'topup' && <div className="w-5 h-5 rounded-full border-2 border-success flex items-center justify-center p-0.5"><CheckCircle2 size={12} className="text-success" strokeWidth={3} /></div>}
                            </div>
                            <div className="flex flex-col gap-1 w-full translate-y-[-1px]">
                                {toast.type === 'topup' ? (
                                    <span className="text-[14px] text-white font-bold leading-tight">
                                        The amount of {toast.amount?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD has been credited.
                                    </span>
                                ) : (
                                    <>
                                        <span className="text-[15px] text-foreground font-bold tracking-wide leading-tight">{toast.title}</span>
                                        {toast.message && <span className="text-[14px] text-muted-foreground font-medium opacity-90 leading-tight">{toast.message}</span>}
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                className="text-muted-foreground hover:text-foreground transition-colors absolute top-3.5 right-3.5 rounded-full p-1 hover:bg-accent/50"
                            >
                                <X size={15} strokeWidth={2} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div >
        </>
    );
}

// Wrap with Suspense for useSearchParams
export default function TerminalPage() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    if (!mounted) {
        return <TerminalLaunchLoadingOverlay />;
    }

    return (
        <Suspense
            fallback={<TerminalLaunchLoadingOverlay />}
        >
            <TradingDashboardInner />
        </Suspense>
    );
}
