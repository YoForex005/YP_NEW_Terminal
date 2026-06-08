"use client";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, Users, AlertTriangle, Info } from "lucide-react";
import { FundProps } from "./fund-card";
import { cn } from "@/lib/utils";

interface FundDetailsDialogProps {
    fund: FundProps | null;
    isOpen: boolean;
    onClose: () => void;
    onInvest: (fund: FundProps) => void;
}

export function FundDetailsDialog({ fund, isOpen, onClose, onInvest }: FundDetailsDialogProps) {
    if (!fund) return null;

    const riskColor = {
        LOW: "bg-primary/10 text-primary border-primary/20",
        MEDIUM: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
        HIGH: "bg-red-500/10 text-red-500 border-red-500/20",
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl">
                <DialogHeader className="space-y-1">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="text-2xl font-bold">{fund.name}</DialogTitle>
                    </div>
                    <DialogDescription className="text-base">
                        Managed by <span className="font-medium text-foreground">{fund.manager}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Key Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl border bg-card shadow-sm space-y-2">
                            <div className="p-2 w-fit rounded-lg bg-primary/10 text-primary">
                                <TrendingUp className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase">Total Return</p>
                                <p className="text-lg font-bold text-primary">+{fund.totalReturn.toFixed(2)}%</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border bg-card shadow-sm space-y-2">
                            <div className="p-2 w-fit rounded-lg bg-blue-500/10 text-blue-500">
                                <DollarSign className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase">Total AUM</p>
                                <p className="text-lg font-bold">USD {fund.aum.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border bg-card shadow-sm space-y-2">
                            <div className="p-2 w-fit rounded-lg bg-orange-500/10 text-orange-500">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase">Max Drawdown</p>
                                <p className="text-lg font-bold text-rose-500">{fund.maxDrawdown.toFixed(2)}%</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border bg-card shadow-sm space-y-2">
                            <div className="p-2 w-fit rounded-lg bg-purple-500/10 text-purple-500">
                                <Users className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground font-semibold uppercase">Investors</p>
                                <p className="text-lg font-bold">{fund.investors}</p>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Info Grid */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Fund Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col gap-1">
                                <p className="text-xs text-muted-foreground font-medium uppercase">Risk Level</p>
                                <Badge variant="secondary" className={cn("w-fit", riskColor[fund.risk])}>{fund.risk}</Badge>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col gap-1">
                                <p className="text-xs text-muted-foreground font-medium uppercase">Minimum Investment</p>
                                <p className="text-sm font-semibold">USD {fund.minInvestment.toLocaleString()}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col gap-1">
                                <p className="text-xs text-muted-foreground font-medium uppercase">Performance Fee</p>
                                <p className="text-sm font-semibold">{fund.performanceFee.toFixed(2)}%</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col gap-1">
                                <p className="text-xs text-muted-foreground font-medium uppercase">Management Fee</p>
                                <p className="text-sm font-semibold">{fund.managementFee.toFixed(2)}%</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col gap-1">
                                <p className="text-xs text-muted-foreground font-medium uppercase">Lock-in Period</p>
                                <p className="text-sm font-semibold">{fund.lockInPeriod}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50 flex flex-col gap-1">
                                <p className="text-xs text-muted-foreground font-medium uppercase">Current NAV</p>
                                <p className="text-sm font-semibold">{fund.nav.toFixed(4)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Fee Structure Alert */}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex gap-3 items-start">
                        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-primary dark:text-primary">Fee Structure</p>
                            <p className="text-xs text-primary/90 dark:text-primary/80 leading-relaxed">
                                Performance fee of {fund.performanceFee.toFixed(2)}% is charged on profits only. Management fee of {fund.managementFee.toFixed(2)}% is charged annually on your investment.
                            </p>
                        </div>
                    </div>



                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
                        Close
                    </Button>
                    <Button
                        onClick={() => onInvest(fund)}
                        className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        Invest in This Fund
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
