'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Archive,
    KeyRound,
    Loader2,
    PlusCircle,
    RefreshCw,
} from 'lucide-react';

import { CreateAccountModal } from '@/components/accounts/create-account-modal';
import { useTradingStore } from '@/store/trading-store';
import type { TradingAccount as DashboardTradingAccount } from '@/types/dashboard';

interface AccountSummary {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    profit: number;
    marginLevel: number;
    currency?: string;
}

interface TerminalAccessPanelProps {
    activeAccount: DashboardTradingAccount | null;
    accountSummary: AccountSummary;
    connectionStatus: string;
    connectionError?: string | null;
    requiresManualPassword?: boolean;
    onActivateAccount?: (accountId: string) => void;
    onConnectWithPassword?: (password: string) => Promise<{ ok: boolean; message?: string }>;
    onOpenTradePanel?: () => void;
    onShowToast?: (
        type: 'success' | 'info' | 'topup' | 'warning' | 'error',
        title: string,
        message?: string,
    ) => void;
}

const formatMoney = (value: number, currency: string) =>
    `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

const getConnectionBadge = (status: string) => {
    if (status === 'ready' || status === 'connected') {
        return 'bg-success/10 text-success border-success/20';
    }

    if (status === 'error') {
        return 'bg-destructive/10 text-destructive border-destructive/20';
    }

    if (status === 'locked' || status === 'connecting' || status === 'authenticating' || status === 'reconnecting' || status === 'degraded') {
        return 'bg-warning/10 text-warning border-warning/20';
    }

    return 'bg-muted text-muted-foreground border-border';
};

const getConnectionMessage = (status: string): { text: string; className: string } | null => {
    if (status === 'locked') {
        return {
            text: 'Password required. Unlock this MT5 account to start the live terminal session.',
            className: 'text-warning',
        };
    }

    if (status === 'ready' || status === 'connected') {
        return {
            text: 'Terminal session ready. Live trading and market data are connected.',
            className: 'text-success',
        };
    }

    if (status === 'connecting' || status === 'authenticating') {
        return {
            text: 'Initializing the MT5 terminal session...',
            className: 'text-warning',
        };
    }

    if (status === 'reconnecting') {
        return {
            text: 'Reconnecting to the MT5 terminal. Live data may pause until the session is restored.',
            className: 'text-warning',
        };
    }

    if (status === 'degraded') {
        return {
            text: 'MT5 Manager or live quotes are unavailable. Check the backend Manager/proxy connection and broker IP whitelist; trading stays blocked until real quotes recover.',
            className: 'text-warning',
        };
    }

    return null;
};

const isQuoteFeedWarning = (message?: string | null) =>
    /quote|market data|ohlc|no live|degraded|no_live_server/i.test(message ?? '');

const isSoftMarketDataNotice = (message?: string | null) =>
    /waiting for the first mt5 tick|chart history can load/i.test(message ?? '');

export default function TerminalAccessPanel({
    activeAccount,
    accountSummary,
    connectionStatus,
    connectionError,
    requiresManualPassword = false,
    onActivateAccount,
    onConnectWithPassword,
    onOpenTradePanel,
    onShowToast,
}: TerminalAccessPanelProps) {
    const syncAccountBalance = useTradingStore((state) => state.syncAccountBalance);
    const archiveAccount = useTradingStore((state) => state.archiveAccount);
    const unarchiveAccount = useTradingStore((state) => state.unarchiveAccount);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [manualPassword, setManualPassword] = useState('');
    const [isUnlockingTerminal, setIsUnlockingTerminal] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);

    const accountCurrency = activeAccount?.currency === 'EUR' ? 'EUR' : 'USD';
    const connectionMessage = getConnectionMessage(connectionStatus);
    const connectionErrorClassName =
        isSoftMarketDataNotice(connectionError)
            ? 'text-info'
            : connectionStatus === 'degraded' || isQuoteFeedWarning(connectionError)
            ? 'text-warning'
            : 'text-destructive';

    useEffect(() => {
        if (!requiresManualPassword) {
            setManualPassword('');
            setIsUnlockingTerminal(false);
        }
    }, [activeAccount?.id, requiresManualPassword]);

    const handleSyncBalance = useCallback(async () => {
        if (!activeAccount) {
            onShowToast?.('warning', 'No account selected', 'Select an MT5 account before syncing.');
            return;
        }

        setIsSyncing(true);

        try {
            const result = await syncAccountBalance(activeAccount.id);

            if (!result.ok) {
                onShowToast?.('error', 'Sync failed', result.message);
                return;
            }

            onShowToast?.('success', 'Balance synced', `Account ${activeAccount.accountNumber} was refreshed from MT5.`);
        } finally {
            setIsSyncing(false);
        }
    }, [activeAccount, onShowToast, syncAccountBalance]);

    const handleToggleArchive = useCallback(async () => {
        if (!activeAccount) {
            onShowToast?.('warning', 'No account selected', 'Select an account before changing its status.');
            return;
        }

        setIsArchiving(true);

        try {
            const action = activeAccount.status === 'Archived' ? unarchiveAccount : archiveAccount;
            const result = await action(activeAccount.id);

            if (!result.ok) {
                onShowToast?.('error', 'Status update failed', result.message);
                return;
            }

            onShowToast?.(
                'success',
                activeAccount.status === 'Archived' ? 'Account restored' : 'Account archived',
                result.message,
            );
        } finally {
            setIsArchiving(false);
        }
    }, [activeAccount, archiveAccount, onShowToast, unarchiveAccount]);

    const handleUnlockTerminal = useCallback(async () => {
        if (!activeAccount) {
            onShowToast?.('warning', 'No account selected', 'Select an MT5 account first.');
            return;
        }

        if (!onConnectWithPassword) {
            onShowToast?.('error', 'Terminal unavailable', 'Manual MT5 login is not available right now.');
            return;
        }

        const normalizedPassword = manualPassword.trim();
        if (!normalizedPassword) {
            onShowToast?.('warning', 'Password required', 'Enter the MT5 trading password for this account.');
            return;
        }

        setIsUnlockingTerminal(true);

        try {
            const result = await onConnectWithPassword(normalizedPassword);
            if (!result.ok) {
                onShowToast?.('error', 'Terminal unlock failed', result.message || 'Unable to verify the MT5 trading password.');
                return;
            }

            setManualPassword('');
            onShowToast?.(
                'success',
                'Terminal unlocked',
                `Live terminal access is now enabled for account ${activeAccount.accountNumber}.`,
            );
        } finally {
            setIsUnlockingTerminal(false);
        }
    }, [activeAccount, manualPassword, onConnectWithPassword, onShowToast]);

    return (
        <>
            <div className="flex h-full flex-col bg-card text-foreground">
                <div className="border-b border-border px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                                Backend Access
                            </p>
                            <h3 className="mt-1 text-sm font-bold text-foreground">
                                Terminal access
                            </h3>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${getConnectionBadge(connectionStatus)}`}>
                            {connectionStatus}
                        </span>
                    </div>
                    {connectionError ? (
                        <p className={`mt-2 text-[11px] ${connectionErrorClassName}`}>{connectionError}</p>
                    ) : connectionMessage ? (
                        <p className={`mt-2 text-[11px] ${connectionMessage.className}`}>{connectionMessage.text}</p>
                    ) : null}
                </div>

                <section className="flex flex-col gap-3 p-3">
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { label: 'Balance', value: formatMoney(accountSummary.balance, accountCurrency) },
                            { label: 'Equity', value: formatMoney(accountSummary.equity, accountCurrency) },
                            { label: 'Margin', value: formatMoney(accountSummary.margin, accountCurrency) },
                            { label: 'Free Margin', value: formatMoney(accountSummary.freeMargin, accountCurrency) },
                            { label: 'Profit', value: formatMoney(accountSummary.profit, accountCurrency) },
                            { label: 'Margin Level', value: `${accountSummary.marginLevel.toFixed(2)}%` },
                        ].map(({ label, value }) => (
                            <div key={label} className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                                <p className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                                <p className="mt-0.5 text-[12px] font-bold text-foreground">{value}</p>
                            </div>
                        ))}
                    </div>

                    {requiresManualPassword && (
                        <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                            <p className="text-[11px] font-semibold text-warning">
                                <KeyRound size={12} className="mr-1 inline-block" />
                                Enter MT5 trading password to unlock terminal
                            </p>
                            <input
                                type="password"
                                value={manualPassword}
                                onChange={(e) => setManualPassword(e.target.value)}
                                placeholder="MT5 trading password"
                                className="w-full rounded-md border border-border bg-card px-3 py-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                                onKeyDown={(e) => e.key === 'Enter' && handleUnlockTerminal()}
                            />
                            <button
                                onClick={handleUnlockTerminal}
                                disabled={isUnlockingTerminal || !manualPassword.trim()}
                                className="flex items-center justify-center gap-2 rounded-md bg-warning px-3 py-2 text-[11px] font-semibold text-warning-foreground transition-colors hover:bg-warning/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isUnlockingTerminal ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                                Unlock Terminal
                            </button>
                        </div>
                    )}

                    {activeAccount && (
                        <button
                            onClick={onOpenTradePanel}
                            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <PlusCircle size={14} />
                            New Trade
                        </button>
                    )}

                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleSyncBalance}
                            disabled={!activeAccount || isSyncing}
                            className="flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Sync Balance
                        </button>

                        <button
                            onClick={handleToggleArchive}
                            disabled={!activeAccount || isArchiving}
                            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isArchiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                            {activeAccount?.status === 'Archived' ? 'Restore Account' : 'Archive Account'}
                        </button>
                    </div>
                </section>
            </div>

            <CreateAccountModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                defaultMode="demo"
                defaultCurrency="USD"
                defaultInitialBalance={35000}
                onAccountCreated={(account) => {
                    setIsCreateModalOpen(false);
                    onActivateAccount?.(account.id);
                }}
            />
        </>
    );
}
