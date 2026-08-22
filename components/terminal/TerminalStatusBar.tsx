'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { subscribeToLivePriceBySymbol } from '@/store/webtrader-store';
import type { Position } from '@/lib/terminal/types';
import { deriveLiveAccountMetrics } from '@/lib/terminal/live-position-pnl';

type StatusAccount = {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    marginLevel: number;
    currency?: string;
};

const formatMoney = (value: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatPnl = (value: number) => value.toFixed(2);

const formatMarginLevel = (value: number) =>
    value > 0 ? `${value.toFixed(2)}%` : '—';

interface TerminalStatusBarProps {
    account: StatusAccount;
    positions: Position[];
    closeAllSlot?: ReactNode;
}

export default function TerminalStatusBar({
    account,
    positions,
    closeAllSlot,
}: TerminalStatusBarProps) {
    const equityRef = useRef<HTMLSpanElement>(null);
    const freeMarginRef = useRef<HTMLSpanElement>(null);
    const marginLevelRef = useRef<HTMLSpanElement>(null);
    const totalPnlRef = useRef<HTMLSpanElement>(null);
    const accountRef = useRef(account);
    const positionsRef = useRef(positions);
    accountRef.current = account;
    positionsRef.current = positions;

    useEffect(() => {
        const paint = () => {
            const metrics = deriveLiveAccountMetrics(accountRef.current, positionsRef.current);
            if (equityRef.current) {
                equityRef.current.textContent = formatMoney(metrics.equity);
            }
            if (freeMarginRef.current) {
                freeMarginRef.current.textContent = formatMoney(metrics.freeMargin);
            }
            if (marginLevelRef.current) {
                marginLevelRef.current.textContent = formatMarginLevel(metrics.marginLevel);
            }
            if (totalPnlRef.current) {
                totalPnlRef.current.textContent = formatPnl(metrics.totalProfit);
                totalPnlRef.current.classList.remove('text-emerald-400', 'text-rose-400');
                totalPnlRef.current.classList.add(
                    metrics.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400',
                );
            }
        };

        paint();
        const symbols = [...new Set(positions.map((position) => position.symbol).filter(Boolean))];
        const unsubs = symbols.map((symbol) => subscribeToLivePriceBySymbol(symbol, paint));
        return () => {
            unsubs.forEach((unsub) => unsub());
        };
    }, [account.balance, account.margin, account.equity, account.freeMargin, account.marginLevel, positions]);

    const initial = deriveLiveAccountMetrics(account, positions);
    const currency = account.currency || 'USD';

    return (
        <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden text-muted-foreground">
            <div className="flex h-full items-center border-r border-border px-4">
                <span>
                    Equity:{' '}
                    <span ref={equityRef} className="font-semibold text-foreground">
                        {formatMoney(initial.equity)}
                    </span>{' '}
                    <span className="text-muted-foreground">{currency}</span>
                </span>
            </div>
            <div className="flex h-full items-center border-r border-border px-4">
                <span>
                    Free Margin:{' '}
                    <span ref={freeMarginRef} className="font-semibold text-foreground">
                        {formatMoney(initial.freeMargin)}
                    </span>{' '}
                    <span className="text-muted-foreground">{currency}</span>
                </span>
            </div>
            <div className="flex h-full items-center border-r border-border px-4">
                <span>
                    Balance:{' '}
                    <span className="font-semibold text-foreground">{formatMoney(account.balance)}</span>{' '}
                    <span className="text-muted-foreground">{currency}</span>
                </span>
            </div>
            <div className="flex h-full items-center border-r border-border px-4">
                <span>
                    Margin:{' '}
                    <span className="font-semibold text-foreground">{formatMoney(account.margin)}</span>{' '}
                    <span className="text-muted-foreground">{currency}</span>
                </span>
            </div>
            <div className="flex h-full items-center border-r border-border px-4">
                <span>
                    Margin level:{' '}
                    <span ref={marginLevelRef} className="font-semibold text-foreground">
                        {formatMarginLevel(initial.marginLevel)}
                    </span>
                </span>
            </div>

            {positions.length > 0 && (
                <div className="relative flex h-full items-center gap-4 border-r border-border px-4">
                    <span className="font-mono text-muted-foreground">
                        Total P/L, USD:{' '}
                        <span
                            ref={totalPnlRef}
                            className={`font-semibold ${initial.totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                            {formatPnl(initial.totalProfit)}
                        </span>
                    </span>
                    {closeAllSlot}
                </div>
            )}
        </div>
    );
}
