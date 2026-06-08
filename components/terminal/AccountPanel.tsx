'use client';

import type { AccountInfo } from '@/lib/terminal/types';
import { Wallet, TrendingUp, Shield, PiggyBank } from 'lucide-react';

interface AccountPanelProps {
    account: AccountInfo;
}

export default function AccountPanel({ account }: AccountPanelProps) {
    const stats = [
        {
            label: 'Balance',
            value: account.balance,
            icon: Wallet,
            color: 'text-accent',
            bg: 'bg-accent/10',
        },
        {
            label: 'Equity',
            value: account.equity,
            icon: TrendingUp,
            color: 'text-success',
            bg: 'bg-success/10',
        },
        {
            label: 'Margin',
            value: account.margin,
            icon: Shield,
            color: 'text-warning',
            bg: 'bg-warning/10',
        },
        {
            label: 'Free Margin',
            value: account.freeMargin,
            icon: PiggyBank,
            color: 'text-muted-foreground',
            bg: 'bg-muted/10',
        },
    ];

    return (
        <div className="p-3 space-y-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Account
            </h2>

            <div className="space-y-2">
                {stats.map((stat) => (
                    <div
                        key={stat.label}
                        className="flex items-center justify-between py-2 px-2.5 rounded-none hover:bg-accent/40 transition-all duration-200 group"
                    >
                        <div className="flex items-center gap-2.5">
                            <div className={`p-1.5 rounded-none ${stat.bg}`}>
                                <stat.icon size={12} className={stat.color} />
                            </div>
                            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                                {stat.label}
                            </span>
                        </div>
                        <span className="text-xs font-mono font-semibold text-foreground tabular-nums">
                            ${stat.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                ))}
            </div>

            {/* Margin Level */}
            <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-muted-foreground uppercase">Margin Level</span>
                    <span className="text-xs font-mono font-semibold text-success tabular-nums">
                        {account.marginLevel.toFixed(2)}%
                    </span>
                </div>
                <div className="w-full h-1.5 bg-accent rounded-none overflow-hidden">
                    <div
                        className="h-full rounded-none transition-all duration-500"
                        style={{
                            width: `${Math.min(100, account.marginLevel / 10)}%`,
                            background: 'linear-gradient(90deg, #10b981, #34d399)',
                        }}
                    />
                </div>
            </div>

            {/* Floating P&L */}
            <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase">Floating P&L</span>
                    <span
                        className={`text-sm font-mono font-bold tabular-nums ${account.profit >= 0 ? 'text-success' : 'text-destructive'
                            }`}
                    >
                        {account.profit >= 0 ? '+' : ''}$
                        {account.profit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>
        </div>
    );
}

