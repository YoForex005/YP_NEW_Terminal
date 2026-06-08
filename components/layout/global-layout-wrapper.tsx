"use client";

import { useEffect, useRef, useState, memo } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { VerificationBanner } from "./VerificationBanner";
import { usePathname } from "next/navigation";
import { ToastContainer } from "@/components/ui/toast-container";
import { useTradingStore } from "@/store/trading-store";
import { DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS } from "@/lib/trading/terminal-symbols";

interface GlobalLayoutProps {
    children: React.ReactNode;
}

const MemoizedSidebar = memo(Sidebar);
const MemoizedNavbar = memo(Navbar);
const DASHBOARD_OHLC_PRELOAD_START_DELAY_MS = 1500;
const DASHBOARD_OHLC_PRELOAD_STAGGER_MS = 4_000;

export function GlobalLayoutWrapper({ children }: GlobalLayoutProps) {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const tradingAccounts = useTradingStore((state) => state.tradingAccounts);
    const preloadFiredRef = useRef<string | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Silently warm the OHLC DB cache for the default terminal symbols while the user is on a
    // dashboard page, so the chart loads instantly when they navigate to the terminal.
    useEffect(() => {
        const isDashboardRoute =
            mounted &&
            !pathname?.startsWith('/login') &&
            !pathname?.startsWith('/register') &&
            !pathname?.startsWith('/forgot-password') &&
            !pathname?.startsWith('/reset-password') &&
            !pathname?.startsWith('/webtrader') &&
            !pathname?.startsWith('/terminal');

        if (!isDashboardRoute) return;

        const activeMt5Account = tradingAccounts.find(
            (a) => (a.platform === 'mt5' || !a.platform) && a.status !== 'Archived',
        );
        const accountId = activeMt5Account?.id;
        if (!accountId || preloadFiredRef.current === accountId) return;

        let cancelled = false;
        let activeController: AbortController | null = null;

        const timer = setTimeout(() => {
            preloadFiredRef.current = accountId;
            const url = `/api/private/accounts/${encodeURIComponent(accountId)}/terminal-ohlc-repair`;
            void (async () => {
                if (cancelled) return;
                
                activeController = new AbortController();
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: activeController.signal,
                    body: JSON.stringify({
                        symbols: DEFAULT_REQUESTED_TERMINAL_WARM_SYMBOLS,
                        timeframeMinutes: 1,
                        limit: 300,
                        reason: 'dashboard-preload',
                    }),
                }).catch(() => {});
                activeController = null;
            })();
        }, DASHBOARD_OHLC_PRELOAD_START_DELAY_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            activeController?.abort();
        };
    }, [mounted, pathname, tradingAccounts]);

    // Routes that SHOULD NOT have the dashboard sidebar/navbar
    const isChromeFreeRoute = 
        pathname?.startsWith('/login') || 
        pathname?.startsWith('/register') || 
        pathname?.startsWith('/forgot-password') ||
        pathname?.startsWith('/reset-password') ||
        pathname?.startsWith('/webtrader') ||
        pathname?.startsWith('/terminal');

    if (!mounted || isChromeFreeRoute) {
        return (
            <div className="min-h-screen bg-background">
                {children}
                <ToastContainer />
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background">
            <MemoizedSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

            <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300">
                <MemoizedNavbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
                <VerificationBanner />

                <main className="flex-1 overflow-auto bg-background/50">
                    <div className="p-4 md:p-8 container mx-auto max-w-7xl">
                        {children}
                    </div>
                </main>
            </div>
            <ToastContainer />
        </div>
    );
}
