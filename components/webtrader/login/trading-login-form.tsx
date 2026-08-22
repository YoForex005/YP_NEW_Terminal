/**
 * Trading Login Form
 * MT5 WebTrader authentication component
 */

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Lock,
  Server,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Shield,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useWebtraderStore } from '@/store/webtrader-store';
import { WebSocketTradingClient } from '@/lib/trading/websocket-client';
import { getPreferredTerminalSubscriptionSymbols } from '@/lib/trading/terminal-symbols';
import { DEFAULT_MT5_SERVERS } from '@/lib/trading/constants';
import { cn } from '@/lib/utils';

interface TradingLoginFormProps {
  onSuccess?: () => void;
  className?: string;
}

export function TradingLoginForm({ onSuccess, className }: TradingLoginFormProps) {
  const router = useRouter();

  // Form state
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState<string>(DEFAULT_MT5_SERVERS[0].name);
  const [customServer, setCustomServer] = useState('');
  const [useCustomServer, setUseCustomServer] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');

  // Store actions
  const setSession = useWebtraderStore((state) => state.setSession);
  const setAccountInfo = useWebtraderStore((state) => state.setAccountInfo);
  const setWsClient = useWebtraderStore((state) => state.setWsClient);
  const setSymbols = useWebtraderStore((state) => state.setSymbols);
  const setPositions = useWebtraderStore((state) => state.setPositions);
  const setOrders = useWebtraderStore((state) => state.setOrders);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setConnectionStatus('connecting');

    let wsClient: WebSocketTradingClient | null = null;

    try {
      const serverName = useCustomServer ? customServer : server;

      if (!login || !password || !serverName) {
        throw new Error('Please fill in all fields');
      }

      const loginNumber = parseInt(login, 10);
      if (isNaN(loginNumber)) {
        throw new Error('Login must be a number');
      }

      // Create WebSocket client
      wsClient = new WebSocketTradingClient({
        onConnect: () => {
          setConnectionStatus('connected');
        },
        onDisconnect: (reason) => {
          setConnectionStatus('error');
          console.log('Disconnected:', reason);
        },
        onError: (err) => {
          setConnectionStatus('error');
          setError(err.message);
        },
        onAuthenticated: (session) => {
          setSession(session);
        },
      });

      // Authenticate with MT5 credentials
      const session = await wsClient.authenticate({
        login: loginNumber,
        password,
        server: serverName,
      });

      if (!session) {
        throw new Error('Authentication failed. Please check your credentials.');
      }

      // Store WebSocket client
      setWsClient(wsClient);

      // Load initial data
      const [accountInfo, symbols, positions, orders] = await Promise.all([
        wsClient.getAccountInfo(),
        wsClient.getSymbols(),
        wsClient.getPositions(),
        wsClient.getOrders(),
      ]);

      if (accountInfo) {
        setAccountInfo(accountInfo);
      }
      setSymbols(symbols);
      setPositions(positions);
      setOrders(orders);

      const subscriptionSymbols = getPreferredTerminalSubscriptionSymbols(symbols);
      if (subscriptionSymbols.length > 0) {
        await wsClient.subscribeSymbols(subscriptionSymbols);
      }

      setConnectionStatus('connected');
      onSuccess?.();

      // Navigate to the richer terminal surface once MT5 auth succeeds.
      router.push('/terminal');
    } catch (err) {
      wsClient?.disconnect();
      setError((err as Error).message);
      setConnectionStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [login, password, server, customServer, useCustomServer, onSuccess, router, setSession, setAccountInfo, setWsClient, setSymbols, setPositions, setOrders]);

  return (
    <div className={cn('w-full max-w-md mx-auto', className)}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-4">
          <TrendingUp className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">MT5 WebTrader</h1>
        <p className="text-muted-foreground mt-2">Connect to your MetaTrader 5 account</p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50">
          <Zap className="w-5 h-5 text-amber-500 mb-2" />
          <span className="text-xs text-muted-foreground text-center">Real-time</span>
        </div>
        <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50">
          <Shield className="w-5 h-5 text-emerald-500 mb-2" />
          <span className="text-xs text-muted-foreground text-center">Secure</span>
        </div>
        <div className="flex flex-col items-center p-3 rounded-xl bg-muted/50">
          <TrendingUp className="w-5 h-5 text-blue-500 mb-2" />
          <span className="text-xs text-muted-foreground text-center">Full Trading</span>
        </div>
      </div>

      {/* Login Card */}
      <Card className="border-border/50 shadow-xl shadow-black/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Login to Trade</CardTitle>
          <CardDescription>Enter your MT5 account credentials</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Login ID */}
            <div className="space-y-2">
              <Label htmlFor="login">Account Login</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="login"
                  type="text"
                  placeholder="Enter your login ID"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Server Selection */}
            <div className="space-y-2">
              <Label htmlFor="server">Server</Label>
              {!useCustomServer ? (
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select
                    id="server"
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading}
                  >
                    {DEFAULT_MT5_SERVERS.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Enter custom server"
                    value={customServer}
                    onChange={(e) => setCustomServer(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setUseCustomServer(!useCustomServer)}
                className="text-xs text-primary hover:underline"
              >
                {useCustomServer ? 'Use predefined server' : 'Use custom server'}
              </button>
            </div>

            {/* Error Alert */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Connection Status */}
            {connectionStatus !== 'idle' && connectionStatus !== 'error' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-sm"
              >
                {connectionStatus === 'connecting' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-muted-foreground">Connecting to trading server...</span>
                  </>
                ) : connectionStatus === 'connected' ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-500">Connected successfully!</span>
                  </>
                ) : null}
              </motion.div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Login to WebTrader'
              )}
            </Button>
          </form>

          <Separator className="my-6" />

          {/* Help Links */}
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p>Don&apos;t have an account?</p>
            <div className="flex justify-center gap-4">
              <Link href="/register" className="text-primary hover:underline">
                Register
              </Link>
              <span className="text-border">|</span>
              <Link href="/" className="text-primary hover:underline">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Notice */}
      <p className="text-xs text-muted-foreground text-center mt-6">
        Your credentials are securely transmitted and never stored on our servers.
        We use end-to-end encryption for all trading communications.
      </p>
    </div>
  );
}

export default TradingLoginForm;
