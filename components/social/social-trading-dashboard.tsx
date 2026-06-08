"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DiscoverTraders } from "./discover-traders";
import { MySubscriptions } from "./my-subscriptions";
import { MySocialAccounts } from "./my-social-accounts";
import { Users, UserPlus, ShieldCheck, AreaChart, Sparkles } from "lucide-react";

export function SocialTradingDashboard() {
    return (
        <div className="flex flex-col gap-8 w-full pb-8">
            {/* Hero Banner — Violet */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-violet-600/20 via-violet-500/10 to-transparent border border-violet-500/15 p-8 md:p-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-violet-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-purple-500/5 rounded-full blur-2xl translate-y-1/2" />
                <div className="relative space-y-3">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1">
                        <Sparkles className="h-3 w-3" />
                        SOCIAL TRADING
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                        Social <span className="text-violet-400">Trading</span>
                    </h1>
                    <p className="text-base text-muted-foreground max-w-md">
                        Follow successful traders and automatically copy their trades, or become a provider and earn fees from followers.
                    </p>
                </div>
            </div>

            <Tabs defaultValue="discover" className="space-y-4">
                <TabsList className="bg-transparent p-0 gap-4 h-auto flex-wrap">
                    <TabsTrigger
                        value="discover"
                        className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        <Users className="h-4 w-4" />
                        Discover Traders
                    </TabsTrigger>
                    <TabsTrigger
                        value="subscriptions"
                        className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        My Subscriptions
                    </TabsTrigger>
                    <TabsTrigger
                        value="my-social-accounts"
                        className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        <AreaChart className="h-4 w-4" />
                        My Social Accounts
                    </TabsTrigger>
                    <TabsTrigger
                        value="become-provider"
                        className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                    >
                        <UserPlus className="h-4 w-4" />
                        Become a Provider
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="discover" className="space-y-4">
                    <DiscoverTraders />
                </TabsContent>

                <TabsContent value="subscriptions">
                    <MySubscriptions />
                </TabsContent>

                <TabsContent value="my-social-accounts">
                    <MySocialAccounts />
                </TabsContent>

                <TabsContent value="become-provider">
                    <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-border/40 bg-card/50">
                        <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-violet-500/15 border border-violet-500/20 mb-4">
                            <UserPlus className="h-8 w-8 text-violet-400" />
                        </div>
                        <h3 className="text-lg font-bold mb-1">Become a Strategy Provider</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mt-1">
                            Share your trading strategy and earn performance fees from followers.
                        </p>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
