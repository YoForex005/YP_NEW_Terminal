"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, BarChart3 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useTheme } from "next-themes";

import { PnlPoint } from "@/types/dashboard";

interface EquityCurveChartProps {
    data: PnlPoint[];
}

// Placeholder data to show a nice chart when there's no real data
const PLACEHOLDER_DATA = [
    { t: "Jan", value: 10000 },
    { t: "Feb", value: 10250 },
    { t: "Mar", value: 10180 },
    { t: "Apr", value: 10520 },
    { t: "May", value: 10380 },
    { t: "Jun", value: 10750 },
    { t: "Jul", value: 10680 },
    { t: "Aug", value: 11100 },
    { t: "Sep", value: 10950 },
    { t: "Oct", value: 11400 },
    { t: "Nov", value: 11250 },
    { t: "Dec", value: 11800 },
];

export function EquityCurveChart({ data }: EquityCurveChartProps) {
    const { theme } = useTheme();
    const hasData = data && data.length > 0;
    const chartData = hasData ? data : PLACEHOLDER_DATA;

    return (
        <Card className="border border-[#1a1a1a] shadow-none bg-[#0a0a0a] rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between pb-4 px-6 pt-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-[#00C853]" />
                        <CardTitle className="text-lg font-bold tracking-tight text-white">Equity Curve</CardTitle>
                    </div>
                    <CardDescription className="text-sm text-muted-foreground">Your trading performance over time</CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-2 border-[#00C853] text-[#00C853] bg-transparent hover:bg-[#00C853]/10 hover:text-[#00C853]">
                    <Download className="h-4 w-4" />
                    Export CSV
                </Button>
            </CardHeader>
            <CardContent className="px-6 pb-6">
                <div className="relative">
                    <div className={`h-[350px] w-full ${!hasData ? 'opacity-30' : ''}`}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#00C853" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#00C853" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" opacity={0.5} />
                                <XAxis
                                    dataKey="t"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "#555", fontSize: 11 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: "#555", fontSize: 11 }}
                                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                    domain={['auto', 'auto']}
                                    width={50}
                                />
                                {hasData && (
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "#111",
                                            borderColor: "#333",
                                            borderRadius: "8px",
                                            boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
                                        }}
                                        itemStyle={{ color: "#fff" }}
                                        labelStyle={{ color: "#888" }}
                                    />
                                )}
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#00C853"
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorEquity)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    {!hasData && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <div className="h-16 w-16 rounded-2xl bg-[#00C853]/10 flex items-center justify-center mb-4">
                                <TrendingUp className="h-8 w-8 text-[#00C853]" />
                            </div>
                            <h4 className="font-semibold text-lg mb-1 text-white">No Trading Data Yet</h4>
                            <p className="text-sm text-muted-foreground text-center max-w-xs">Start trading to see your equity curve and performance analytics here</p>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-center gap-8 mt-5 pt-4 border-t border-[#1a1a1a]">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-[2px] bg-[#00C853] rounded-full" />
                        <span className="text-xs font-medium text-muted-foreground">Equity</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-xs font-medium text-muted-foreground">Deposits</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span className="text-xs font-medium text-muted-foreground">Withdrawals</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
