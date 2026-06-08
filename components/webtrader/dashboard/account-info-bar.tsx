/**
 * Account Info Bar
 * Displays trading account information and connection status
 */

'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Scale,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Activity,
  Power,
  Shield,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWebtraderStore } from '@/store/webtrader-store';
import { cn, formatCurrency } from '@/lib/utils';
import { CONNECTION_STATUS_COLORS } from '@/lib/trading/constants';

interface AccountInfoBarProps {
  className?: string;
}

export function AccountInfoBar({ className }: AccountInfoBarProps) {
  const session = useWebtraderStore((state) => state.session);
  const accountInfo = useWebtraderStore((state) => state.accountInfo);
  const connectionStatus = useWebtraderStore((state) => state.connectionStatus);
  const positions = useWebtraderStore((state) => state.positions);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!accountInfo) return null;

    const marginLevel =
      accountInfo.margin > 0
        ? (accountInfo.equity / accountInfo.margin) * 100
        : 0;

    const totalProfit = positions.reduce((sum, p) => sum + p.profit, 0);

    return {
      balance: accountInfo.balance,
      equity: accountInfo.equity,
      margin: accountInfo.margin,
      freeMargin: accountInfo.equity - accountInfo.margin,
      marginLevel,
      totalProfit,
      currency: accountInfo.currency,
      leverage: accountInfo.leverage,
    };
  }, [accountInfo, positions]);

  // Get connection status color
  const statusColor = useMemo(() => {
    return CONNECTION_STATUS_COLORS[connectionStatus] || 'bg-gray-500';
  }, [connectionStatus]);

  // Get connection status text
  const statusText = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  }, [connectionStatus]);

  if (!session || !accountInfo) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-14 bg-card border-b border-border px-4',
          className
        )}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">No active trading session</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between h-14 bg-card border-b border-border px-4',
        className
      )}
    >
      {/* Left: Account Info */}
      <div className="flex items-center gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <motion.div
            animate={
              connectionStatus === 'connected'
                ? {}
                : { opacity: [1, 0.5, 1] }
            }
            transition={
              connectionStatus !== 'connected'
                ? { duration: 1.5, repeat: Infinity }
                : {}
            }
            className={cn(
              'w-2.5 h-2.5 rounded-full',
              statusColor,
              connectionStatus === 'connected' && 'shadow-lg shadow-emerald-500/50'
            )}
          />
          <span className="text-xs text-muted-foreground">{statusText}</span>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Account Details */}
        <div className="flex items-center gap-3">
          <div>
            <span className="text-xs text-muted-foreground">Account</span>
            <p className="text-sm font-medium">{session.login}</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {session.server}
          </Badge>
          <Badge variant="outline" className="text-xs">
            1:{session.leverage}
          </Badge>
        </div>
      </div>

      {/* Center: Balance Stats */}
      {stats && (
        <div className="flex items-center gap-6">
          {/* Balance */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Wallet className="w-3 h-3" />
              Balance
            </div>
            <p className="text-sm font-medium tabular-nums">
              {formatCurrency(stats.balance, stats.currency)}
            </p>
          </div>

          {/* Equity */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Scale className="w-3 h-3" />
              Equity
            </div>
            <p className="text-sm font-medium tabular-nums">
              {formatCurrency(stats.equity, stats.currency)}
            </p>
          </div>

          {/* Margin */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="w-3 h-3" />
              Margin
            </div>
            <p className="text-sm font-medium tabular-nums">
              {formatCurrency(stats.margin, stats.currency)}
            </p>
          </div>

          {/* Free Margin */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <PiggyBank className="w-3 h-3" />
              Free Margin
            </div>
            <p
              className={cn(
                'text-sm font-medium tabular-nums',
                stats.freeMargin < 0 && 'text-rose-500'
              )}
            >
              {formatCurrency(stats.freeMargin, stats.currency)}
            </p>
          </div>

          {/* Margin Level */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Shield className="w-3 h-3" />
              Margin Level
            </div>
            <p
              className={cn(
                'text-sm font-bold tabular-nums',
                stats.marginLevel < 100
                  ? 'text-rose-500'
                  : stats.marginLevel < 200
                  ? 'text-amber-500'
                  : 'text-emerald-500'
              )}
            >
              {stats.marginLevel.toFixed(2)}%
            </p>
          </div>

          {/* P&L */}
          <div className="text-center">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {stats.totalProfit >= 0 ? (
                <TrendingUp className="w-3 h-3 text-emerald-500" />
              ) : (
                <TrendingDown className="w-3 h-3 text-rose-500" />
              )}
              P&L
            </div>
            <p
              className={cn(
                'text-sm font-bold tabular-nums',
                stats.totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'
              )}
            >
              {stats.totalProfit >= 0 ? '+' : ''}
              {formatCurrency(stats.totalProfit, stats.currency)}
            </p>
          </div>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs">
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Refresh
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-rose-500">
          <Power className="w-3.5 h-3.5 mr-1" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}

export default AccountInfoBar;
