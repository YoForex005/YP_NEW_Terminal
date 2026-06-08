"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monitor, Settings2, Laptop, Globe, Cpu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SettingsTradingTerminalDashboard() {
  const [mt5Terminal, setMt5Terminal] = useState("MetaTrader 5");
  const [isMt5DialogOpen, setIsMt5DialogOpen] = useState(false);

  const [mt4Terminal, setMt4Terminal] = useState("MetaTrader 4");
  const [isMt4DialogOpen, setIsMt4DialogOpen] = useState(false);

  useEffect(() => {
    fetch("/api/private/settings/trading")
      .then(res => res.json())
      .then(resData => {
        if (resData.ok && resData.data) {
          if (resData.data.defaultMt5Terminal) setMt5Terminal(resData.data.defaultMt5Terminal);
          if (resData.data.defaultMt4Terminal) setMt4Terminal(resData.data.defaultMt4Terminal);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">Trading Terminal</h1>
        <p className="text-sm text-muted-foreground">Set the default trading terminal for all your MT4 and MT5 accounts</p>
      </div>

      {/* Platform Overview Cards */}
      <div className="space-y-5">
        <h2 className="text-lg font-bold tracking-tight">Platform overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* MT5 Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-violet-500/30 hover:shadow-xl hover:shadow-violet-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-violet-500/15 via-violet-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-violet-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-violet-500/15 border border-violet-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-500/10 transition-all duration-300">
                <Laptop className="h-7 w-7 text-violet-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">MetaTrader 5</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Advanced charting, multi-asset trading, and algorithmic strategies.</p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50 mt-auto">
                <Laptop className="h-3.5 w-3.5 text-violet-400" />
                <span>3 terminal options</span>
              </div>
            </div>
          </Card>

          {/* MT4 Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-cyan-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/10 transition-all duration-300">
                <Laptop className="h-7 w-7 text-cyan-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">MetaTrader 4</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Industry standard platform for forex trading with expert advisors.</p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50 mt-auto">
                <Laptop className="h-3.5 w-3.5 text-cyan-400" />
                <span>2 terminal options</span>
              </div>
            </div>
          </Card>

          {/* FxTrusts Terminal Card */}
          <Card className="group overflow-hidden rounded-2xl border-border/40 bg-card hover:border-amber-500/30 hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 flex flex-col">
            <div className="h-32 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent relative overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-amber-500/10 blur-xl" />
              <div className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-amber-500/15 border border-amber-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-amber-500/10 transition-all duration-300">
                <Monitor className="h-7 w-7 text-amber-400" />
              </div>
            </div>
            <div className="p-5 flex flex-col flex-grow">
              <h3 className="font-bold text-sm mb-1.5">FxTrusts Terminal</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">Web-based platform with integrated tools and real-time analytics.</p>
              <div className="flex items-center gap-2 text-xs font-semibold bg-muted/30 rounded-lg px-3 py-2.5 border border-border/50 mt-auto">
                <Monitor className="h-3.5 w-3.5 text-amber-400" />
                <span>EXT accounts exclusive</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Terminal Settings */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Monitor className="h-4 w-4 text-emerald-400" />
          <h2 className="text-base font-bold">Terminal preferences</h2>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card/50 overflow-hidden">
          {/* MT5 Accounts Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-border/30 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-3 sm:w-1/3">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Laptop className="h-3.5 w-3.5 text-violet-400" />
              </div>
              <span className="text-sm font-medium">MT5 Accounts</span>
            </div>
            <div className="text-sm sm:w-2/3 flex justify-between items-center mt-2 sm:mt-0">
              <span className="text-muted-foreground">Set your default terminal</span>
              <Dialog open={isMt5DialogOpen} onOpenChange={setIsMt5DialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-lg font-medium px-4 h-8 border-border/40 text-xs hover:bg-muted/20">Change</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden rounded-2xl border-border/50" aria-describedby={undefined}>
                  <DialogHeader className="p-6 pb-4 border-b border-border/30">
                    <DialogTitle className="text-lg font-bold">Set trading terminal</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-2 p-5">
                    {[
                      { name: "FxTrusts Terminal", icon: Monitor, desc: "Web-based platform" },
                      { name: "MetaTrader 5", icon: Laptop, desc: "Desktop application" },
                      { name: "MT5 WebTerminal", icon: Globe, desc: "Browser-based MT5" },
                    ].map((option) => (
                      <label key={option.name} className={`flex items-center gap-4 cursor-pointer p-3.5 rounded-xl border transition-all duration-150 ${mt5Terminal === option.name ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/30 hover:bg-muted/10'
                        }`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${mt5Terminal === option.name ? 'border-emerald-500' : 'border-muted-foreground/25'
                          }`}>
                          {mt5Terminal === option.name && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </div>
                        <input type="radio" name="terminal" value={option.name} className="hidden" onChange={(e) => setMt5Terminal(e.target.value)} checked={mt5Terminal === option.name} />
                        <div className="h-8 w-8 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-center">
                          <option.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{option.name}</p>
                          <p className="text-xs text-muted-foreground">{option.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 p-5 pt-0">
                    <Button
                      className={`rounded-lg font-semibold h-9 text-sm ${mt5Terminal ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/15' : 'bg-muted/30 text-muted-foreground cursor-not-allowed'}`}
                      disabled={!mt5Terminal}
                      onClick={() => setIsMt5DialogOpen(false)}
                    >
                      Set terminal
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-lg font-medium h-9 text-sm border-border/40"
                      onClick={() => setIsMt5DialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* MT4 Accounts Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-border/30 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-3 sm:w-1/3">
              <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Laptop className="h-3.5 w-3.5 text-cyan-400" />
              </div>
              <span className="text-sm font-medium">MT4 Accounts</span>
            </div>
            <div className="text-sm sm:w-2/3 flex justify-between items-center mt-2 sm:mt-0">
              <span className="text-muted-foreground">Set your default terminal</span>
              <Dialog open={isMt4DialogOpen} onOpenChange={setIsMt4DialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-lg font-medium px-4 h-8 border-border/40 text-xs hover:bg-muted/20">Change</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden rounded-2xl border-border/50" aria-describedby={undefined}>
                  <DialogHeader className="p-6 pb-4 border-b border-border/30">
                    <DialogTitle className="text-lg font-bold">Set trading terminal</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-2 p-5">
                    {[
                      { name: "MetaTrader 4", icon: Laptop, desc: "Desktop application" },
                      { name: "MT4 WebTerminal", icon: Globe, desc: "Browser-based MT4" },
                    ].map((option) => (
                      <label key={option.name} className={`flex items-center gap-4 cursor-pointer p-3.5 rounded-xl border transition-all duration-150 ${mt4Terminal === option.name ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/30 hover:bg-muted/10'
                        }`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${mt4Terminal === option.name ? 'border-emerald-500' : 'border-muted-foreground/25'
                          }`}>
                          {mt4Terminal === option.name && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                        </div>
                        <input type="radio" name="mt4terminal" value={option.name} className="hidden" onChange={(e) => setMt4Terminal(e.target.value)} checked={mt4Terminal === option.name} />
                        <div className="h-8 w-8 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-center">
                          <option.icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{option.name}</p>
                          <p className="text-xs text-muted-foreground">{option.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2 p-5 pt-0">
                    <Button
                      className={`rounded-lg font-semibold h-9 text-sm ${mt4Terminal ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-500/15' : 'bg-muted/30 text-muted-foreground cursor-not-allowed'}`}
                      disabled={!mt4Terminal}
                      onClick={() => setIsMt4DialogOpen(false)}
                    >
                      Set terminal
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-lg font-medium h-9 text-sm border-border/40"
                      onClick={() => setIsMt4DialogOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* EXT Accounts Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 border-b border-border/30 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-3 sm:w-1/3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Monitor className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <span className="text-sm font-medium">EXT Accounts</span>
            </div>
            <div className="text-sm sm:w-2/3 flex justify-between items-center mt-2 sm:mt-0">
              <span className="text-emerald-400 font-medium">Only FxTrusts terminal</span>
            </div>
          </div>

          {/* MT5 Only Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:bg-muted/5 transition-colors">
            <div className="flex items-center gap-3 sm:w-1/3">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <Cpu className="h-3.5 w-3.5 text-blue-400" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">MT5 Accounts</span>
                <span className="text-[10px] font-semibold bg-blue-500/10 text-blue-400 rounded-md px-2 py-0.5 border border-blue-500/15">Only for MetaTrader</span>
              </div>
            </div>
            <div className="text-sm sm:w-2/3 flex justify-between items-center mt-2 sm:mt-0">
              <span className="text-muted-foreground">Only MT terminal</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
