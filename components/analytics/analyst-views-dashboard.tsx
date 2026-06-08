"use client";

import { useState } from "react";
import { Search, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type AnalystView = {
  id: string;
  symbol: string;
  timeframe: string;
  time: string;
  date: string;
  direction: "up" | "down";
  expectedMove: string;
  target: string;
  pivot: string;
  category: string;
};

const analystViewsData: AnalystView[] = [
  // ─── Forex ───
  { id: "AUDJPY", symbol: "AUD / JPY", timeframe: "30 MIN", time: "3:05 PM (UTC+5:30)", date: "Monday, March 17, 2026 10:35:22 AM CET", direction: "up", expectedMove: "5.70%", target: "112.88", pivot: "111.40", category: "forex" },
  { id: "EURGBP", symbol: "EUR / GBP", timeframe: "30 MIN", time: "3:05 PM (UTC+5:30)", date: "Monday, March 17, 2026 10:35:22 AM CET", direction: "up", expectedMove: "3.21%", target: "0.8670", pivot: "0.8624", category: "forex" },
  { id: "EURJPY", symbol: "EUR / JPY", timeframe: "30 MIN", time: "3:05 PM (UTC+5:30)", date: "Monday, March 17, 2026 10:35:22 AM CET", direction: "up", expectedMove: "4.12%", target: "183.33", pivot: "181.94", category: "forex" },
  { id: "NZDUSD", symbol: "NZD / USD", timeframe: "30 MIN", time: "3:05 PM (UTC+5:30)", date: "Monday, March 17, 2026 10:12:14 AM CET", direction: "up", expectedMove: "2.45%", target: "0.5865", pivot: "0.5794", category: "forex" },
  { id: "USDCAD", symbol: "USD / CAD", timeframe: "30 MIN", time: "2:54 PM (UTC+5:30)", date: "Monday, March 17, 2026 10:24:35 AM CET", direction: "up", expectedMove: "1.82%", target: "1.3760", pivot: "1.3680", category: "forex" },
  { id: "AUDUSD", symbol: "AUD / USD", timeframe: "30 MIN", time: "2:50 PM (UTC+5:30)", date: "Monday, March 17, 2026 10:20:12 AM CET", direction: "down", expectedMove: "3.15%", target: "0.6950", pivot: "0.7040", category: "forex" },

  // ─── Crypto ───
  { id: "XRPUSD", symbol: "XRP / Dollar", timeframe: "30 MIN", time: "3:16 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:40:38 AM CET", direction: "down", expectedMove: "5.70%", target: "1.4339", pivot: "1.5593", category: "crypto" },
  { id: "DOGEUSD", symbol: "Dogecoin / Dollar", timeframe: "30 MIN", time: "3:15 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:45:47 AM CET", direction: "up", expectedMove: "6.05%", target: "0.1070", pivot: "0.0979", category: "crypto" },
  { id: "ADAUSD", symbol: "Cardano / Dollar", timeframe: "30 MIN", time: "3:14 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:44:55 AM CET", direction: "down", expectedMove: "5.56%", target: "0.2703", pivot: "0.2942", category: "crypto" },
  { id: "ETHUSD", symbol: "Ether / USD", timeframe: "30 MIN", time: "3:13 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:43:48 AM CET", direction: "up", expectedMove: "5.52%", target: "2,453", pivot: "2,264", category: "crypto" },
  { id: "BTCUSD", symbol: "Bitcoin / USD", timeframe: "30 MIN", time: "3:12 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:42:00 AM CET", direction: "up", expectedMove: "4.31%", target: "71,040", pivot: "75,700", category: "crypto" },
  { id: "BNBUSD", symbol: "Binance Coin / Dollar", timeframe: "30 MIN", time: "3:11 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:41:22 AM CET", direction: "up", expectedMove: "4.23%", target: "645.3", pivot: "687.4", category: "crypto" },

  // ─── Stocks ───
  { id: "EXXON", symbol: "Exxon Mobil", timeframe: "DAILY", time: "3:23 AM (UTC+5:30)", date: "Monday, March 17, 2026 10:52:13 PM CET", direction: "up", expectedMove: "9.08%", target: "171.31", pivot: "148.84", category: "stocks" },
  { id: "JPM", symbol: "JPMorgan Chase", timeframe: "DAILY", time: "3:21 AM (UTC+5:30)", date: "Monday, March 17, 2026 10:51:57 PM CET", direction: "up", expectedMove: "8.29%", target: "262.45", pivot: "299.18", category: "stocks" },
  { id: "BABA", symbol: "Alibaba", timeframe: "DAILY", time: "2:30 PM (UTC+5:30)", date: "Monday, March 17, 2026 10:00:36 AM CET", direction: "up", expectedMove: "9.06%", target: "122.67", pivot: "142.46", category: "stocks" },
  { id: "GOOG", symbol: "Alphabet", timeframe: "DAILY", time: "2:15 PM (UTC+5:30)", date: "Monday, March 17, 2026 9:45:29 AM CET", direction: "up", expectedMove: "8.66%", target: "328.46", pivot: "291.52", category: "stocks" },
  { id: "META", symbol: "Meta Platforms", timeframe: "DAILY", time: "2:15 PM (UTC+5:30)", date: "Monday, March 17, 2026 9:45:29 AM CET", direction: "up", expectedMove: "8.72%", target: "560.39", pivot: "651.58", category: "stocks" },
  { id: "TSLA", symbol: "Tesla", timeframe: "DAILY", time: "2:15 PM (UTC+5:30)", date: "Monday, March 17, 2026 9:45:29 AM CET", direction: "down", expectedMove: "10.01%", target: "352.05", pivot: "417.31", category: "stocks" },
  { id: "AAPL", symbol: "Apple", timeframe: "DAILY", time: "2:15 PM (UTC+5:30)", date: "Monday, March 17, 2026 9:45:29 AM CET", direction: "down", expectedMove: "7.40%", target: "198.50", pivot: "266.10", category: "stocks" },
  { id: "MSFT", symbol: "Microsoft", timeframe: "DAILY", time: "2:15 PM (UTC+5:30)", date: "Monday, March 17, 2026 9:45:29 AM CET", direction: "up", expectedMove: "10.80%", target: "438.28", pivot: "379.90", category: "stocks" },

  // ─── Indices ───
  { id: "DAX", symbol: "Dax", timeframe: "DAILY", time: "2:21 PM (UTC+5:30)", date: "Monday, March 17, 2026 9:51:32 AM CET", direction: "down", expectedMove: "4.52%", target: "24,490", pivot: "22,770", category: "indices" },
  { id: "FTSE100", symbol: "FTSE 100", timeframe: "DAILY", time: "2:19 PM (UTC+5:30)", date: "Monday, March 17, 2026 9:40:20 AM CET", direction: "down", expectedMove: "2.50%", target: "10,550", pivot: "10,080", category: "indices" },
  { id: "DOWJONES", symbol: "Dow Jones", timeframe: "DAILY", time: "2:04 AM (UTC+5:30)", date: "Monday, March 17, 2026 8:43:42 AM CET", direction: "up", expectedMove: "4.75%", target: "44,470", pivot: "48,200", category: "indices" },
  { id: "NASDAQ", symbol: "Nasdaq 100", timeframe: "DAILY", time: "2:01 AM (UTC+5:30)", date: "Friday, March 13, 2026 9:31:46 PM CET", direction: "down", expectedMove: "4.63%", target: "23,370.00", pivot: "25,460.00", category: "indices" },
  { id: "SP500", symbol: "S&P 500", timeframe: "DAILY", time: "1:57 AM (UTC+5:30)", date: "Friday, March 13, 2026 9:27:34 PM CET", direction: "down", expectedMove: "2.00%", target: "6,520.00", pivot: "7,000.00", category: "indices" },
  { id: "HANGSENG", symbol: "Hang Seng", timeframe: "DAILY", time: "12:10 PM (UTC+5:30)", date: "Friday, March 13, 2026 7:40:45 AM CET", direction: "up", expectedMove: "4.75%", target: "24,400", pivot: "26,300", category: "indices" },
  { id: "NIKKEI", symbol: "Nikkei 225", timeframe: "DAILY", time: "12:01 PM (UTC+5:30)", date: "Friday, March 13, 2026 7:31:00 AM CET", direction: "down", expectedMove: "3.80%", target: "35,600", pivot: "55,860", category: "indices" },

  // ─── Commodities ───
  { id: "NATGAS", symbol: "Natural Gas (NYMEX)", timeframe: "30 MIN", time: "3:31 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 11:01:44 AM CET", direction: "down", expectedMove: "7.67%", target: "2.7700", pivot: "3.1000", category: "commodities" },
  { id: "BRENT", symbol: "Brent (ICE)", timeframe: "30 MIN", time: "3:29 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:59:29 AM CET", direction: "up", expectedMove: "5.21%", target: "108.20", pivot: "101.30", category: "commodities" },
  { id: "SILVER", symbol: "Silver", timeframe: "30 MIN", time: "3:28 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:58:04 AM CET", direction: "up", expectedMove: "4.31%", target: "84.40", pivot: "79.80", category: "commodities" },
  { id: "GOLD", symbol: "Gold", timeframe: "30 MIN", time: "3:26 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:56:41 AM CET", direction: "up", expectedMove: "1.02%", target: "5,065", pivot: "4,988", category: "commodities" },
  { id: "CRUDEOIL", symbol: "Crude Oil (WTI)", timeframe: "30 MIN", time: "3:24 PM (UTC+5:30)", date: "Tuesday, March 17, 2026 10:54:04 AM CET", direction: "up", expectedMove: "5.95%", target: "101.10", pivot: "93.70", category: "commodities" },
];

export function AnalystViewsDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("forex");

  const filteredData = analystViewsData.filter(
    (item) =>
      item.category === activeTab &&
      item.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col space-y-6">
      {/* Hero Banner — Emerald/Green */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-600/20 via-emerald-500/10 to-transparent border border-emerald-500/15 p-8 md:p-10">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-green-500/5 rounded-full blur-2xl translate-y-1/2" />
        <div className="relative flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <Sparkles className="h-3 w-3" />
              ANALYST VIEWS
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Analyst <span className="text-emerald-400">Views</span>
            </h1>
            <p className="text-base text-muted-foreground max-w-md">
              Expert technical analysis across Forex, Crypto, Stocks, Indices and Commodities — powered by Trading Central.
            </p>
          </div>
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Enter Symbol or Name"
              className="w-full pl-9 bg-card/60 backdrop-blur-sm rounded-xl border-border/50 h-11"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="forex" className="w-full" onValueChange={(v) => { setActiveTab(v); setSearchTerm(""); }}>
        <TabsList className="bg-card rounded-2xl border border-border/30 shadow-sm p-1 w-auto justify-start h-auto flex-wrap gap-0.5">
          {["Forex", "Crypto", "Stocks", "Indices", "Commodities"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab.toLowerCase()}
              className="rounded-xl px-5 py-2.5 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/20 text-muted-foreground hover:bg-muted/50 transition-all"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {["forex", "crypto", "stocks", "indices", "commodities"].map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData.map((view) => (
                <Card key={view.id} className={`group overflow-hidden flex flex-col rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm hover:shadow-xl ${view.direction === "up" ? "hover:border-emerald-500/30 hover:shadow-emerald-500/5" : "hover:border-red-500/30 hover:shadow-red-500/5"} transition-all duration-300`}>
                  {/* Gradient top strip */}
                  <div className={`h-[3px] w-full ${view.direction === "up" ? "bg-gradient-to-r from-emerald-500/60 via-emerald-400/30 to-transparent" : "bg-gradient-to-r from-red-500/60 via-red-400/30 to-transparent"}`} />
                  <CardHeader className="p-4 pb-2">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-base leading-none">{view.symbol}</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase tracking-wider">
                          {view.timeframe}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">{view.time}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{view.date}</p>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 flex-grow">
                    {/* Mini chart */}
                    <div className="w-full h-36 bg-muted/5 border border-border/30 rounded-xl relative mb-4 overflow-hidden flex flex-col items-center justify-center p-2">
                      <div className="absolute top-2 left-2 flex gap-4 text-[9px] text-muted-foreground">
                        <div className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-500"></span> MA 20 = BB</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500"></span> MA 50</div>
                      </div>
                      <div className="absolute top-2 right-2 text-[8px] text-muted-foreground/50">Research © 2026 Trading Central</div>

                      <svg className="w-full h-full mt-4" viewBox="0 0 100 50" preserveAspectRatio="none">
                        {view.direction === "up" ? (
                          <>
                            <path d="M0,40 Q20,30 40,35 T80,15 T100,5" fill="none" stroke="currentColor" strokeWidth="1" className="text-green-500" />
                            <path d="M0,40 Q20,30 40,35 T80,15 T100,5 L100,50 L0,50 Z" fill="currentColor" className="text-green-500/10" />
                          </>
                        ) : (
                          <>
                            <path d="M0,10 Q20,20 40,15 T80,35 T100,45" fill="none" stroke="currentColor" strokeWidth="1" className="text-red-500" />
                            <path d="M0,10 Q20,20 40,15 T80,35 T100,45 L100,50 L0,50 Z" fill="currentColor" className="text-red-500/10" />
                          </>
                        )}
                      </svg>

                      <div className="absolute right-0 top-6 bottom-0 w-12 flex flex-col justify-between text-[8px] border-l border-border/30 bg-background/70 py-2 pr-1 text-right text-muted-foreground font-mono">
                        <span className={view.direction === "up" ? "text-green-500 font-bold" : "text-red-500 font-bold"}>{view.target}</span>
                        <span>{view.pivot}</span>
                      </div>

                      <div className="absolute bottom-1 left-2 right-14 flex justify-between text-[8px] text-muted-foreground">
                        <span>Mar 16</span>
                        <span>Mar 23</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Expected Move</span>
                        <span className={`font-bold flex items-center gap-1 ${view.direction === "up" ? "text-green-500" : "text-red-500"}`}>
                          {view.direction === "up" ? <ArrowUp size={14} strokeWidth={3} /> : <ArrowDown size={14} strokeWidth={3} />}
                          {view.expectedMove}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Target</span>
                        <span className="font-semibold text-primary">{view.target}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Pivot</span>
                        <span className="font-semibold text-primary">{view.pivot}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="p-4 pt-0">
                    <Link href="/accounts" className="w-full">
                      <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-10 rounded-lg">
                        Trade
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              ))}
            </div>

            {filteredData.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No analyst views found matching your search.
              </div>
            )}

            {/* Footer disclosure */}
            <div className="mt-12 text-[10px] text-muted-foreground space-y-4 border-t pt-6 pb-10">
              <p>
                © 2026 Trading Central. All Rights Reserved. The information contained herein: (1) is proprietary to Trading Central and/or its content providers; (2) may not be copied or distributed; (3) is not warranted to be accurate, complete or timely; and, (4) does not constitute advice or a recommendation by FxTrusts. Trading Central or its content providers in respect of the investment in financial instruments. Neither FxTrusts nor Trading Central nor its content providers are responsible for any damages or losses arising from any use of this information. Past performance is no guarantee of future results.
              </p>
              <p>Pricing, historical chart data and fundamental company data are provided by Morningstar Research Inc.</p>
              <p>Technical Event® is a registered trademark of Trading Central.</p>
              <p>Trading Central products and services are protected under U.S. Patent Nos.: 6,801,201; 7,469,226; 7,469,238; 7,835,966; and 7,853,500; and corresponding foreign patents.</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
