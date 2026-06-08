"use client";

import { ArrowDownToLine, ArrowUpRight, Clock3, Wallet } from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";
import { useTradingStore } from "@/store/trading-store";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { FundActionForm } from "./fund-action-form";

export function DepositWithdrawalWidget() {
  const {
    wallets,
    fundsTab,
    setFundsTab,
    transactions,
  } = useTradingStore();

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 py-4 pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          Deposit & Withdrawal
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-60px)] overflow-y-auto px-5 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card-gradient rounded-md border border-primary/10 bg-primary/5 p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary/60">USD Wallet</p>
            <p className="mt-1 text-xl font-bold text-foreground tabular-nums">{formatCurrency(wallets.USD, "USD")}</p>
          </div>
          <div className="stat-card-gradient rounded-md border border-primary/10 bg-primary/5 p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary/60">EUR Wallet</p>
            <p className="mt-1 text-xl font-bold text-foreground tabular-nums">{formatCurrency(wallets.EUR, "EUR")}</p>
          </div>
        </div>

        <Tabs value={fundsTab} onValueChange={(value) => setFundsTab(value as "deposit" | "withdraw" | "history")} className="mt-5">
          <TabsList className="grid h-11 w-full grid-cols-3 rounded-md bg-muted/60 p-0.5">
            <TabsTrigger value="deposit" className="gap-1.5 rounded-md py-2 text-xs font-semibold transition-all data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Deposit
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="gap-1.5 rounded-md py-2 text-xs font-semibold transition-all data-[state=active]:bg-success data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:shadow-success/20">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Withdraw
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 rounded-md py-2 text-xs font-semibold transition-all data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">
              <Clock3 className="h-3.5 w-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="animate-in fade-in-50 duration-500">
            <FundActionForm type="deposit" />
          </TabsContent>

          <TabsContent value="withdraw" className="animate-in fade-in-50 duration-500">
            <FundActionForm type="withdraw" />
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {transactions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/50 py-8 text-center text-sm text-muted-foreground font-medium">
                No transaction history yet.
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((transaction) => (
                  <article
                    key={transaction.id}
                    className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 rounded-md border border-border/40 bg-muted/15 p-3 transition-colors hover:bg-muted/25"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{transaction.type}</p>
                      <p className="text-xs text-muted-foreground">{transaction.createdAt}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground tabular-nums">
                        {formatCurrency(transaction.amount, transaction.currency)}
                      </p>
                      <p className="text-xs capitalize text-muted-foreground">{transaction.method}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                        transaction.status === "Completed"
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      )}
                    >
                      {transaction.status}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
