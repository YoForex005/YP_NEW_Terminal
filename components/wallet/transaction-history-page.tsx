"use client";

import { Search, HelpCircle, Calendar, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { WalletFooter } from "@/components/wallet/wallet-footer";

export function TransactionHistoryContent() {
    return (
        <div className="space-y-8">
            {/* Hero Banner — Teal theme */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-teal-600/20 via-teal-500/10 to-transparent border border-teal-500/15 p-8 md:p-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-cyan-500/5 rounded-full blur-2xl translate-y-1/2" />

                <div className="relative">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-3 py-1">
                                <Sparkles className="h-3 w-3" />
                                TRANSACTION HISTORY
                            </div>
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                                Transaction <span className="text-teal-400">History</span>
                            </h1>
                            <p className="text-base text-muted-foreground max-w-md">
                                Track all your financial transactions, filter by type, status, and date range.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            <Link href="/support" className="text-sm font-medium text-primary hover:underline">Get support</Link>
                            <span className="text-muted-foreground/30">|</span>
                            <Link href="/support" className="text-sm font-medium text-primary hover:underline flex items-center gap-2">
                                Support requests
                                <span className="bg-muted-foreground/20 text-muted-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-normal">0</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3">
                <Select value="7days">
                    <SelectTrigger className="flex w-auto items-center gap-2 bg-primary text-primary-foreground px-4 py-2 h-auto rounded-full text-sm font-medium transition-colors hover:bg-primary/90 border-0 focus:ring-0 shadow-none [&>span]:line-clamp-none data-[state=open]:bg-primary [&>svg:last-child]:hidden">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <SelectValue placeholder="Last 7 days" />
                            <ChevronDown className="h-4 w-4 ml-1 opacity-70" />
                        </div>
                    </SelectTrigger>
                    <SelectContent 
                        className="bg-popover border border-border shadow-xl rounded-lg mt-1 min-w-[160px] p-0 overflow-hidden font-normal text-sm"
                        align="start"
                    >
                        <SelectItem value="3days" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10 pr-4">
                            Last 3 days
                        </SelectItem>
                        <SelectItem value="7days" className="bg-secondary py-3 px-4 focus:bg-secondary/80 cursor-pointer rounded-none border-b border-border/50 pl-10 pr-4">
                            Last 7 days
                        </SelectItem>
                        <SelectItem value="30days" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10 pr-4">
                            Last 30 days
                        </SelectItem>
                        <SelectItem value="3months" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10 pr-4">
                            Last 3 months
                        </SelectItem>
                        <SelectItem value="custom" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10 pr-4 flex items-center justify-between">
                            <div className="flex w-full items-center justify-between">
                                Custom date <ChevronRight className="h-4 w-4 opacity-70" />
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
                
                <Select value="all">
                    <SelectTrigger className="flex w-auto items-center gap-2 bg-secondary text-foreground px-4 py-2 h-auto rounded-full text-sm font-medium transition-colors hover:bg-secondary/80 border-0 focus:ring-0 shadow-none [&>span]:line-clamp-none data-[state=open]:bg-secondary">
                        <SelectValue placeholder="All transaction types" />
                    </SelectTrigger>
                    <SelectContent 
                        className="bg-popover border border-border shadow-xl rounded-lg mt-1 min-w-[200px] p-0 overflow-hidden font-normal text-sm"
                        align="start"
                    >
                        <SelectItem value="all" className="bg-secondary py-3 px-4 focus:bg-secondary/80 cursor-pointer rounded-none border-b border-border/50 pl-10">
                            All transaction types
                        </SelectItem>
                        <SelectItem value="deposit" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Deposit
                        </SelectItem>
                        <SelectItem value="withdrawal" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Withdrawal
                        </SelectItem>
                        <SelectItem value="transfer" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Transfer
                        </SelectItem>
                        <SelectItem value="refund" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Refund
                        </SelectItem>
                        <SelectItem value="reward" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Reward
                        </SelectItem>
                        <SelectItem value="rebate" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Rebate
                        </SelectItem>
                        <SelectItem value="investment" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Investment
                        </SelectItem>
                        <SelectItem value="performance_fee" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Performance fee
                        </SelectItem>
                        <SelectItem value="agent_commission" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Agent commission
                        </SelectItem>
                    </SelectContent>
                </Select>
                
                <Select value="all">
                    <SelectTrigger className="flex w-auto items-center gap-2 bg-secondary text-foreground px-4 py-2 h-auto rounded-full text-sm font-medium transition-colors hover:bg-secondary/80 border-0 focus:ring-0 shadow-none [&>span]:line-clamp-none data-[state=open]:bg-secondary">
                        <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent 
                        className="bg-popover border border-border shadow-xl rounded-lg mt-1 min-w-[160px] p-0 overflow-hidden font-normal text-sm"
                        align="start"
                    >
                        <SelectItem value="all" className="bg-secondary py-3 px-4 focus:bg-secondary/80 cursor-pointer rounded-none border-b border-border/50 pl-10">
                            All statuses
                        </SelectItem>
                        <SelectItem value="processing" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Processing
                        </SelectItem>
                        <SelectItem value="done" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Done
                        </SelectItem>
                        <SelectItem value="rejected" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Rejected
                        </SelectItem>
                    </SelectContent>
                </Select>
                
                <Select value="all">
                    <SelectTrigger className="flex w-auto items-center gap-2 bg-secondary text-foreground px-4 py-2 h-auto rounded-full text-sm font-medium transition-colors hover:bg-secondary/80 border-0 focus:ring-0 shadow-none [&>span]:line-clamp-none data-[state=open]:bg-secondary">
                        <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent 
                        className="bg-popover border border-border shadow-xl rounded-lg mt-1 min-w-[160px] p-0 overflow-hidden font-normal text-sm"
                        align="start"
                    >
                        <SelectItem value="all" className="bg-secondary py-3 px-4 focus:bg-secondary/80 cursor-pointer rounded-none border-b border-border/50 pl-10">
                            All accounts
                        </SelectItem>
                        <SelectItem value="standard" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Standard
                        </SelectItem>
                        <SelectItem value="pro" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Pro
                        </SelectItem>
                        <SelectItem value="raw-spread" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Raw Spread
                        </SelectItem>
                        <SelectItem value="zero" className="py-3 px-4 focus:bg-secondary cursor-pointer rounded-none pl-10">
                            Zero
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Empty State */}
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="relative mb-6">
                    <Search className="h-12 w-12 text-muted-foreground/50" strokeWidth={1.5} />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-full">
                        <HelpCircle className="h-5 w-5 text-muted-foreground/50" strokeWidth={2} />
                    </div>
                </div>
                
                <h3 className="text-xl font-semibold mb-2">
                    No transaction matches your filters
                </h3>
                
                <p className="text-muted-foreground mb-8">
                    Try changing your search terms
                </p>
                
                <Button className="font-semibold px-8 py-2.5 h-auto rounded-lg">
                    Reset filters
                </Button>
            </div>
            
            {/* Footer */}
            <WalletFooter />
        </div>
    );
}
