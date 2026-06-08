"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DiscoverStrategies } from "./discover-strategies";
import { MyStrategiesContent } from "./my-strategies-content";
import { Sparkles } from "lucide-react";

export function CopyTradingDashboard() {
    const [showDetails, setShowDetails] = useState(false);
    return (
        <div className="flex flex-col gap-8 w-full pb-8">
            {/* Hero Banner — Cyan */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-cyan-600/20 via-cyan-500/10 to-transparent border border-cyan-500/15 p-8 md:p-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-blue-500/5 rounded-full blur-2xl translate-y-1/2" />
                <div className="relative flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-3 py-1">
                            <Sparkles className="h-3 w-3" />
                            COPY TRADING
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                            Copy <span className="text-cyan-400">Trading</span>
                        </h1>
                        <p className="text-base text-muted-foreground max-w-md">
                            Follow successful traders and automatically copy their trades, or become a provider and earn fees from followers.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 shrink-0">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Live Strategies
                    </div>
                </div>
            </div>

            <Tabs defaultValue="discover" className="space-y-4">
                <TabsList className="bg-transparent p-0 gap-6 h-auto justify-start border-b border-border w-full rounded-none overflow-x-auto flex-nowrap scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <TabsTrigger
                        value="discover"
                        className="rounded-none border-b-2 border-transparent px-0 py-3 text-sm font-medium whitespace-nowrap shrink-0 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        Discover strategies
                    </TabsTrigger>
                    <TabsTrigger
                        value="favorites"
                        className="rounded-none border-b-2 border-transparent px-0 py-3 text-sm font-medium whitespace-nowrap shrink-0 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        Favorites
                    </TabsTrigger>
                    <TabsTrigger
                        value="assets"
                        className="rounded-none border-b-2 border-transparent px-0 py-3 text-sm font-medium whitespace-nowrap shrink-0 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        Assets
                    </TabsTrigger>
                    <TabsTrigger
                        value="my-strategies"
                        className="rounded-none border-b-2 border-transparent px-0 py-3 text-sm font-medium whitespace-nowrap shrink-0 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        My strategies
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="discover" className="space-y-6">
                    <DiscoverStrategies />
                </TabsContent>

                <TabsContent value="favorites">
                    <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-border/40 bg-card/50">
                        <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-amber-500/15 border border-amber-500/20 mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-bold mb-0.5">No favorites yet</h3>
                        <p className="text-xs text-muted-foreground max-w-sm mb-6">
                            Tap the star icon on a strategy to add it to your favorites.
                        </p>
                        <button
                            onClick={() => {
                                const discoverTab = document.querySelector('[value="discover"]') as HTMLButtonElement;
                                if (discoverTab) discoverTab.click();
                            }}
                            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm px-8 py-3 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20"
                        >
                            Discover strategies
                        </button>
                    </div>
                </TabsContent>

                <TabsContent value="assets" className="space-y-6">
                    {/* Important: Copy Trading update banner */}
                    <div className="flex items-center justify-between rounded-lg border border-blue-500/20 bg-blue-500/5 px-5 py-4">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500/10">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold">Important: Copy Trading update</p>
                                <p className="text-xs text-muted-foreground">We&apos;re phasing out the service in your region. <span className="text-primary cursor-pointer hover:underline">Learn more.</span></p>
                            </div>
                        </div>
                        <button onClick={() => setShowDetails(true)} className="text-xs text-primary font-medium hover:underline whitespace-nowrap ml-4">See all details</button>
                    </div>

                    {/* Details Dialog */}
                    <Dialog open={showDetails} onOpenChange={setShowDetails}>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                                    Copy Trading Update
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground">
                                    Important changes to the Copy Trading service in your region.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-5 pt-2">
                                <div className="rounded-lg bg-muted/30 p-4 space-y-2">
                                    <h4 className="text-sm font-semibold">What&apos;s changing?</h4>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        We&apos;re phasing out the Copy Trading service in your region due to updated regulatory requirements. Existing investments will continue to operate, but no new investments can be created.
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold">Timeline</h4>
                                    <div className="space-y-2">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1.5 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium">March 31, 2026</p>
                                                <p className="text-xs text-muted-foreground">New investments will be disabled</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-1.5 h-2 w-2 rounded-full bg-red-500 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium">June 30, 2026</p>
                                                <p className="text-xs text-muted-foreground">All remaining investments will be closed and funds returned</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <h4 className="text-sm font-semibold">What should you do?</h4>
                                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-0.5">•</span>
                                            Review your existing investments and close them before the deadline
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-0.5">•</span>
                                            Withdraw funds from your investment wallet
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary mt-0.5">•</span>
                                            Contact support if you have any questions
                                        </li>
                                    </ul>
                                </div>

                                <div className="flex items-center gap-3 pt-2">
                                    <button onClick={() => setShowDetails(false)} className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm px-4 py-2.5 hover:bg-primary/90 transition-colors">
                                        Got it
                                    </button>
                                    <button onClick={() => setShowDetails(false)} className="flex-1 inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground font-semibold text-sm px-4 py-2.5 hover:bg-muted transition-colors">
                                        Contact Support
                                    </button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* Investments Heading */}
                    <h3 className="text-xl font-bold tracking-tight">Investments</h3>

                    {/* Main Content: Investments + Assets Sidebar */}
                    <div className="flex flex-col lg:flex-row gap-8 items-start">
                        {/* Investments Section */}
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-col items-center justify-center min-h-[400px] text-center rounded-2xl border border-border/40 bg-card/50">
                                <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/20 mb-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-muted-foreground/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                                </div>
                                <h4 className="text-sm font-bold mb-0.5">There are no active investments</h4>
                                <p className="text-xs text-muted-foreground mb-6 max-w-sm">When you start investing, investments will appear here</p>
                                <button className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm px-8 py-3 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                                    Discover strategies
                                </button>
                            </div>
                        </div>

                        {/* Assets Sidebar */}
                        <div className="w-full lg:w-[320px] shrink-0 lg:sticky lg:top-6 space-y-4">
                            {/* Card 1: Assets Overview */}
                            <div className="rounded-xl border border-border/40 bg-card/50 p-6 pt-8 space-y-4">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assets</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                                </div>
                                <p className="text-3xl font-bold tracking-tight">0.00 USD</p>
                                <p className="text-xs text-muted-foreground">Invested <span className="font-semibold text-foreground">0.00 USD</span></p>
                            </div>

                            {/* Card 2: Investment Wallet */}
                            <div className="rounded-xl border border-border/40 bg-card/50 p-6 pt-8 space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Investment wallet</span>
                                    <span className="text-sm font-bold">0.00 USD</span>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2">
                                    <Link href="/wallet/deposits" className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm px-4 py-2.5 hover:bg-primary/90 transition-colors">
                                        Deposit
                                    </Link>
                                    <Link href="/wallet/withdrawals" className="flex-1 inline-flex items-center justify-center rounded-lg border border-border/40 bg-card text-foreground font-semibold text-sm px-4 py-2.5 hover:bg-muted transition-colors">
                                        Withdraw
                                    </Link>
                                    <button className="inline-flex items-center justify-center rounded-lg border border-border/40 bg-card text-muted-foreground h-10 w-10 hover:bg-muted transition-colors shrink-0" title="History">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="my-strategies" className="space-y-6">
                    <MyStrategiesContent />
                </TabsContent>
            </Tabs>
        </div>
    );
}
