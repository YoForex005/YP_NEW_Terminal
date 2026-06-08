"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    ReferenceLine,
} from "recharts";
import { Info, Sparkles } from "lucide-react";
import { useTradingStore } from "@/store/trading-store";

const MONTHS = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

function generateMonthlyData() {
    return MONTHS.map((month, i) => ({
        month,
        profit: 0,
        loss: 0,
        net: 0,
        closedOrders: 0,
        volume: 0,
        equity: 0,
    }));
}

function StatCard({ label, value, subValue }: { label: string; value: string | number; subValue?: string }) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Info size={14} className="text-muted-foreground/50" />
            </div>
            <span className="text-base sm:text-2xl font-bold tracking-tight break-all">{value}</span>
            {subValue && <span className="text-xs text-muted-foreground">{subValue}</span>}
        </div>
    );
}

export function PerformanceDashboard() {
    const { tradingAccounts } = useTradingStore();
    const [selectedAccount, setSelectedAccount] = useState("all");
    const [timePeriod, setTimePeriod] = useState("last_365");
    const [chartTab, setChartTab] = useState("net_profit");

    // Derive stats from the selected account
    const activeAccount = tradingAccounts.find(a => a.id === selectedAccount);

    const stats = useMemo(() => {
        if (selectedAccount === "all") {
            const totalProfit = tradingAccounts.reduce((sum, a) => sum + Math.max(0, a.equity - a.balance), 0);
            const totalLoss = tradingAccounts.reduce((sum, a) => sum + Math.min(0, a.equity - a.balance), 0);
            const totalTrades = tradingAccounts.reduce((sum, a) => sum + (a.stats?.totalTrades || 0), 0);
            const totalVolume = tradingAccounts.reduce((sum, a) => sum + (a.stats?.totalVolume || 0), 0);
            const totalEquity = tradingAccounts.reduce((sum, a) => sum + a.equity, 0);
            const profitable = tradingAccounts.reduce((sum, a) => sum + (a.stats?.winningTrades || 0), 0);
            const unprofitable = tradingAccounts.reduce((sum, a) => sum + (a.stats?.losingTrades || 0), 0);

            return {
                netProfit: totalProfit + totalLoss,
                closedOrders: totalTrades,
                tradingVolume: totalVolume,
                equity: totalEquity,
                profit: totalProfit,
                loss: totalLoss,
                unrealisedPnl: 0,
                profitable,
                unprofitable,
            };
        }

        const a = activeAccount;
        if (!a) {
            return {
                netProfit: 0, closedOrders: 0, tradingVolume: 0, equity: 0,
                profit: 0, loss: 0, unrealisedPnl: 0, profitable: 0, unprofitable: 0,
            };
        }

        const pnl = a.equity - a.balance;
        return {
            netProfit: pnl,
            closedOrders: a.stats?.totalTrades || 0,
            tradingVolume: a.stats?.totalVolume || 0,
            equity: a.equity,
            profit: Math.max(0, pnl),
            loss: Math.min(0, pnl),
            unrealisedPnl: 0,
            profitable: a.stats?.winningTrades || 0,
            unprofitable: a.stats?.losingTrades || 0,
        };
    }, [selectedAccount, tradingAccounts, activeAccount]);

    const monthlyData = useMemo(() => generateMonthlyData(), []);

    const getChartDataKey = () => {
        switch (chartTab) {
            case "net_profit": return "net";
            case "closed_orders": return "closedOrders";
            case "trading_volume": return "volume";
            case "equity": return "equity";
            default: return "net";
        }
    };

    const formatValue = (val: number) => {
        if (chartTab === "closed_orders") return val.toString();
        return `${val} USD`;
    };

    return (
        <div className="space-y-6 overflow-hidden">
            {/* Hero Banner — Purple theme */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-violet-600/20 via-violet-500/10 to-transparent border border-violet-500/15 p-8 md:p-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-violet-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-purple-500/5 rounded-full blur-2xl translate-y-1/2" />

                <div className="relative">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 text-xs font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1">
                                <Sparkles className="h-3 w-3" />
                                PERFORMANCE
                            </div>
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                                Trading <span className="text-violet-400">Performance</span>
                            </h1>
                            <p className="text-base text-muted-foreground max-w-md">
                                Analyze your trading results, track profitability, and review performance metrics.
                            </p>
                        </div>

                        <div className="flex gap-3 shrink-0">
                            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[90px]">
                                <p className={`text-xl font-bold ${stats.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{stats.netProfit.toFixed(2)}</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Net Profit</p>
                            </div>
                            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                                <p className="text-xl font-bold text-violet-400">{stats.closedOrders}</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Trades</p>
                            </div>
                            <div className="rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 px-5 py-3 text-center min-w-[80px]">
                                <p className="text-xl font-bold">{stats.equity.toFixed(2)}</p>
                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Equity</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Account Selector */}
            <p className="text-primary text-sm font-medium">Account</p>


            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger className="w-full sm:w-[220px] bg-background border-border/50 hover:border-primary/50 transition-colors rounded-xl">
                        <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All accounts</SelectItem>
                        {tradingAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                                {account.name} ({account.accountNumber})
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={timePeriod} onValueChange={setTimePeriod}>
                    <SelectTrigger className="w-full sm:w-[180px] bg-background border-border/50 hover:border-primary/50 transition-colors rounded-xl">
                        <SelectValue placeholder="Last 365 days" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="last_365">Last 365 days</SelectItem>
                        <SelectItem value="last_90">Last 90 days</SelectItem>
                        <SelectItem value="last_30">Last 30 days</SelectItem>
                        <SelectItem value="last_7">Last 7 days</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Summary Stats Row */}
            <Card className="border border-border/30 shadow-lg rounded-2xl overflow-hidden">
                <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 to-purple-500" />
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
                        <StatCard
                            label="Net profit"
                            value={`${stats.netProfit >= 0 ? "" : "-"}${Math.abs(stats.netProfit).toFixed(2)} USD`}
                        />
                        <StatCard
                            label="Closed orders"
                            value={stats.closedOrders}
                        />
                        <StatCard
                            label="Trading volume"
                            value={`${stats.tradingVolume.toFixed(2)} USD`}
                        />
                        <StatCard
                            label="Equity"
                            value={`${stats.equity.toFixed(2)} USD`}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Profit / Loss Details */}
            <Card className="border border-border/30 shadow-lg rounded-2xl overflow-hidden">
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-teal-500" />
                <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Profit</p>
                            <p className="text-sm sm:text-lg font-semibold text-emerald-500">{stats.profit.toFixed(2)} USD</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Loss</p>
                            <p className="text-sm sm:text-lg font-semibold text-red-500">{stats.loss.toFixed(2)} USD</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Unrealised PnL</p>
                            <div className="flex items-center gap-1.5">
                                <p className="text-sm sm:text-lg font-semibold">{stats.unrealisedPnl.toFixed(2)} USD</p>
                                <Info size={14} className="text-muted-foreground/50" />
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Profitable</p>
                            <p className="text-lg font-semibold">{stats.profitable}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground mb-1">Unprofitable</p>
                            <p className="text-lg font-semibold">{stats.unprofitable}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Charts Section */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight">Charts</h2>

                <Card className="border border-border/30 shadow-lg rounded-2xl overflow-hidden">
                    <div className="h-1.5 w-full bg-gradient-to-r from-cyan-500 to-blue-500" />
                    <CardContent className="pt-6">
                        <Tabs value={chartTab} onValueChange={setChartTab}>
                            <div className="overflow-x-auto -mx-1 px-1 pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                            <TabsList className="bg-muted/50 h-auto p-1 gap-1 w-max inline-flex mb-6">
                                <TabsTrigger
                                    value="net_profit"
                                    className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm px-4 py-2 text-sm rounded-md"
                                >
                                    Net profit
                                </TabsTrigger>
                                <TabsTrigger
                                    value="closed_orders"
                                    className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm px-4 py-2 text-sm rounded-md"
                                >
                                    Closed orders
                                </TabsTrigger>
                                <TabsTrigger
                                    value="trading_volume"
                                    className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm px-4 py-2 text-sm rounded-md"
                                >
                                    Trading volume
                                </TabsTrigger>
                                <TabsTrigger
                                    value="equity"
                                    className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm px-4 py-2 text-sm rounded-md"
                                >
                                    Equity
                                </TabsTrigger>
                            </TabsList>
                            </div>

                            <TabsContent value={chartTab} forceMount className="mt-0">
                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlyData} margin={{ top: 10, right: 5, left: 0, bottom: 5 }}>
                                            <CartesianGrid
                                                strokeDasharray="3 3"
                                                vertical={false}
                                                stroke="hsl(var(--border))"
                                                opacity={0.4}
                                            />
                                            <XAxis
                                                dataKey="month"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                                                domain={[0, 4]}
                                                ticks={[0, 1, 2, 3, 4]}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: "hsl(var(--card))",
                                                    borderColor: "hsl(var(--border))",
                                                    borderRadius: "8px",
                                                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                                }}
                                                itemStyle={{ color: "hsl(var(--foreground))" }}
                                                formatter={(value: number) => [formatValue(value), ""]}
                                            />
                                            <ReferenceLine y={0} stroke="hsl(var(--border))" />
                                            <Bar dataKey={getChartDataKey()} radius={[4, 4, 0, 0]} maxBarSize={40}>
                                                {monthlyData.map((entry, index) => {
                                                    const val = entry[getChartDataKey() as keyof typeof entry] as number;
                                                    return (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={val >= 0 ? "#22c55e" : "#374151"}
                                                        />
                                                    );
                                                })}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Legend */}
                                <div className="flex items-center justify-center gap-6 mt-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                                        <span className="text-sm text-muted-foreground">Profit</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-sm bg-gray-700 dark:bg-gray-400" />
                                        <span className="text-sm text-muted-foreground">Loss</span>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            </div>

            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground">
                Please keep in mind this only closed position count. For real-time statistics, check{" "}
                <span className="underline cursor-pointer text-primary">terminal</span>.
            </p>
        </div>
    );
}
