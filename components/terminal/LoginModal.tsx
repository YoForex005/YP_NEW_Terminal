'use client';

import { useState } from 'react';
import { X, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

interface LoginModalProps {
    onClose: () => void;
    onSuccess: (accountId: string) => void;
}

const MT5_SERVERS = ['FXTrusts-Real', 'FXTrusts-Real2', 'FXTrusts-Demo'];

export function LoginModal({ onClose, onSuccess }: LoginModalProps) {
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [server, setServer] = useState(MT5_SERVERS[0]);
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const loginNum = login.trim();
        const pwd = password.trim();
        if (!loginNum || !pwd) return;

        setIsLoading(true);
        setError(null);

        try {
            const accountId = `mt5-${loginNum}`;
            const response = await fetch(
                `/api/private/accounts/${encodeURIComponent(accountId)}/terminal-session`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tradingPassword: pwd, server }),
                    cache: 'no-store',
                },
            );

            let payload: Record<string, unknown> = {};
            try { payload = (await response.json()) as Record<string, unknown>; } catch { /* empty */ }

            if (!response.ok || payload.state === 'locked' || payload.state === 'error') {
                const msg =
                    typeof payload.message === 'string' ? payload.message :
                    typeof payload.error === 'string' ? payload.error :
                    response.status === 401 ? 'Invalid login or password.' :
                    'Login failed. Check your credentials and server, then try again.';
                setError(msg);
                return;
            }

            const resolvedId =
                (typeof payload.accountId === 'string' && payload.accountId) ||
                accountId;

            onSuccess(resolvedId);
            onClose();
        } catch {
            setError('Network error. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border mt-[-8vh] shadow-[0_16px_50px_-5px_rgba(0,0,0,1)] rounded-md w-full max-w-[340px] flex flex-col font-sans animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                    <h2 className="text-[14px] font-semibold text-foreground tracking-wide">Login to trade account</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Login</label>
                        <input
                            type="text"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            placeholder="Account Number"
                            autoFocus
                            className="bg-background border border-border text-foreground text-[13px] px-3 py-2 rounded-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/60 w-full"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Trader Password"
                                className="bg-background border border-border text-foreground text-[13px] px-3 py-2 pr-9 rounded-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/60 w-full"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Server</label>
                        <select
                            value={server}
                            onChange={(e) => setServer(e.target.value)}
                            className="bg-background border border-border text-foreground text-[13px] px-3 py-2 rounded-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all w-full cursor-pointer"
                        >
                            {MT5_SERVERS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 rounded-sm bg-destructive/10 border border-destructive/20 px-3 py-2">
                            <AlertCircle size={13} className="text-destructive mt-[1px] flex-shrink-0" />
                            <span className="text-[12px] text-destructive leading-relaxed">{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 rounded-sm bg-accent border border-border text-foreground text-[13px] font-semibold hover:bg-accent/80 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!login.trim() || !password.trim() || isLoading}
                            className="flex-1 py-2 rounded-sm bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading && <Loader2 size={13} className="animate-spin" />}
                            {isLoading ? 'Connecting…' : 'Login'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
