"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, ChevronUp, RefreshCw, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

import { useDashboardData } from "@/components/dashboard/dashboard-data-provider";
import { MarketGauge } from "@/components/dashboard/widgets/market-gauge";
import { MarketOverviewSettingsModal } from "@/components/dashboard/widgets/market-overview-settings-modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sentimentClass: Record<"BUY" | "NEUTRAL" | "SELL", string> = {
  BUY: "bg-success/10 text-success border-success/20",
  NEUTRAL: "bg-muted/60 text-muted-foreground border-border/50",
  SELL: "bg-danger/10 text-danger border-danger/20",
};

const trendClass: Record<"Bullish" | "Neutral" | "Bearish", string> = {
  Bullish: "text-success font-bold",
  Neutral: "text-muted-foreground font-semibold",
  Bearish: "text-danger font-bold",
};


const FALLBACK_INSTRUMENTS = [
  { id: "audusd", label: "AUDUSD", name: "Australian Dollar / US Dollar", sentiment: "BUY" as const, score: 65, short: 2, medium: 3, long: 4, trend: "Bullish" as const },
  { id: "eurusd", label: "EURUSD", name: "Euro / US Dollar", sentiment: "BUY" as const, score: 70, short: 1, medium: 2, long: 3, trend: "Bullish" as const },
  { id: "gbpjpy", label: "GBPJPY", name: "British Pound / Japanese Yen", sentiment: "NEUTRAL" as const, score: 50, short: -1, medium: 1, long: 2, trend: "Neutral" as const },
  { id: "xauusd", label: "XAUUSD", name: "Gold / US Dollar", sentiment: "BUY" as const, score: 75, short: 3, medium: 4, long: 5, trend: "Bullish" as const },
];

export function MarketOverviewWidget() {
  const { snapshot, isLoading, reload, lastRefreshAt } = useDashboardData();
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedSymbolIds, setSelectedSymbolIds] = useState<string[]>(["audusd", "eurusd", "gbpjpy", "xauusd"]);

  const marketInstruments = useMemo(() => {
    const source = snapshot?.marketInstruments?.length ? snapshot.marketInstruments : FALLBACK_INSTRUMENTS;
    return source.filter(inst => selectedSymbolIds.includes(inst.id));
  }, [snapshot?.marketInstruments, selectedSymbolIds]);


  const handleRefresh = async () => {
    setIsRefreshing(true);
    await reload();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  const formattedTime = useMemo(() => {
    if (!mounted || !lastRefreshAt) return "--:--:--";
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(lastRefreshAt);
  }, [lastRefreshAt, mounted]);

  if (!mounted) return null;

  return (
    <>
      <Card className="flex h-full flex-col overflow-hidden rounded-xl border-border dark:border-white/10 shadow-xl shadow-black/5 bg-gradient-to-br from-white to-slate-50 dark:from-card dark:to-muted/10">
        <CardHeader className="pb-2 pt-6 px-6">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-3 text-base font-bold tracking-tight">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/10">
                <BarChart3 className="h-4 w-4" strokeWidth={2.5} />
              </div>
              Market Overview
            </CardTitle>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="rounded-lg p-2 transition-colors hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/5"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={cn(
                  "rounded-lg p-2 transition-all hover:bg-slate-100 hover:text-foreground dark:hover:bg-white/5",
                  isRefreshing && "animate-spin text-orange-600"
                )}
                aria-label="Refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground pl-[48px]">
            <span className="font-medium opacity-80">Updated {formattedTime}</span>
            <span className="flex items-center gap-1 text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-md dark:bg-orange-500/10">
              {marketInstruments.length} symbols
              <ChevronUp className="h-3 w-3" strokeWidth={3} />
            </span>
          </div>
        </CardHeader>
        <CardContent className="h-[calc(100%-90px)] overflow-y-auto px-6 pt-2 pb-6 space-y-3">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`market-skeleton-${index}`} className="h-[200px] animate-pulse rounded-2xl border border-border/30 bg-muted/30" />
              ))}
            </div>
          ) : null}
          {!isLoading && marketInstruments.length === 0 ? (
            <div className="grid h-[200px] place-items-center rounded-3xl border border-dashed border-border bg-slate-50/50 text-sm font-bold text-muted-foreground dark:border-white/10 dark:bg-white/5">
              No market instruments available.
            </div>
          ) : null}
          {!isLoading ? (
            <div className={cn(
              "grid gap-3",
              marketInstruments.length > 1 ? "grid-cols-2" : "grid-cols-1"
            )}>
              {marketInstruments.map((instrument, index) => (
                <motion.article
                  key={instrument.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.04 }}
                  className="rounded-2xl border border-slate-100 bg-white px-4 pb-3 pt-3 transition-all hover:border-orange-200 hover:shadow-md hover:shadow-orange-100/50 dark:bg-muted/10 dark:border-white/5 dark:hover:border-orange-500/20"
                >
                  <p className="text-center text-[11px] font-black uppercase tracking-wider text-foreground">{instrument.label}</p>
                  <p className="text-center text-[9px] font-bold text-muted-foreground/80">{instrument.name}</p>
                  <div className="mt-2 flex justify-center">
                    <span className={cn("rounded-md border px-2.5 py-0.5 text-[10px] font-bold shadow-sm", sentimentClass[instrument.sentiment])}>
                      {instrument.sentiment}
                    </span>
                  </div>
                  <div className="my-2">
                    <MarketGauge score={instrument.score} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center bg-slate-50/50 rounded-xl p-2 dark:bg-black/20">
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">Short</p>
                      <p className={cn("text-xs font-black tabular-nums mt-0.5", instrument.short >= 0 ? "text-primary" : "text-rose-600")}>
                        {instrument.short >= 0 ? `+${instrument.short}` : instrument.short}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">Med</p>
                      <p className={cn("text-xs font-black tabular-nums mt-0.5", instrument.medium >= 0 ? "text-primary" : "text-rose-600")}>
                        {instrument.medium >= 0 ? `+${instrument.medium}` : instrument.medium}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">Long</p>
                      <p className={cn("text-xs font-black tabular-nums mt-0.5", instrument.long >= 0 ? "text-primary" : "text-rose-600")}>
                        {instrument.long >= 0 ? `+${instrument.long}` : instrument.long}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-slate-100 pt-2 text-center text-[9px] font-medium text-muted-foreground dark:border-white/5">
                    Trend: <span className={`uppercase tracking-wider font-bold ${trendClass[instrument.trend]}`}>{instrument.trend}</span>
                  </p>
                </motion.article>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <MarketOverviewSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedIds={selectedSymbolIds}
        onSave={setSelectedSymbolIds}
        availableSymbols={snapshot?.marketInstruments ?? []}
      />
    </>
  );
}
