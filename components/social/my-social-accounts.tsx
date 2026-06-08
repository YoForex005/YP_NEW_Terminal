"use client";

import { useState } from "react";
import { RefreshCcw, Plus, Crown, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn, formatSignedCurrency } from "@/lib/utils";
import { motion } from "framer-motion";
import { useTradingStore } from "@/store/trading-store";

export function MySocialAccounts() {
    const { tradingAccounts } = useTradingStore();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">My Social Trading Accounts</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">0 accounts for social trading</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        className="border-slate-200 dark:border-slate-800"
                    >
                        <RefreshCcw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
                        Refresh
                    </Button>
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                        <Plus className="h-4 w-4 mr-2" />
                        New Account
                    </Button>
                </div>
            </div>

            {/* Master Accounts Section */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Crown className="h-4 w-4 text-amber-500" />
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Master Accounts</CardTitle>
                        <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">
                            0
                        </span>
                    </div>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                        Accounts used as strategy providers
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <EmptyState
                        message='No master accounts yet. Register a strategy in the "My Strategy" tab to become a provider.'
                    />
                </CardContent>
            </Card>

            {/* Slave Accounts Section */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-blue-500" />
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Slave Accounts</CardTitle>
                        <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">
                            0
                        </span>
                    </div>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                        Accounts copying other traders&apos; strategies
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <EmptyState
                        message='No slave accounts yet. Subscribe to a strategy in the "Discover Traders" tab.'
                    />
                </CardContent>
            </Card>

            {/* Available Accounts Section */}
            <Card className="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Wallet className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Available Accounts</CardTitle>
                        <span className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">
                            {tradingAccounts.length}
                        </span>
                    </div>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                        Accounts ready for social trading
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                    {tradingAccounts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                            <p className="text-slate-500 dark:text-slate-400 mb-4 text-sm">
                                No available accounts. Create a new trading account to get started.
                            </p>
                            <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground border-0">
                                <Plus className="h-4 w-4 mr-2" />
                                Create Account
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {tradingAccounts.map((account) => (
                                <div key={account.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                                    <div>
                                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">{account.name}</h4>
                                        <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{account.platform} &middot; {account.accountNumber}</p>
                                    </div>
                                    <div className="mt-4 flex items-center justify-between">
                                        <span className="font-black text-primary text-lg">{formatSignedCurrency(account.balance)}</span>
                                        <Button size="sm" variant="outline" className="h-7 text-xs px-3">Use Here</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="flex items-center justify-center py-12 text-center">
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md">
                {message}
            </p>
        </div>
    );
}
