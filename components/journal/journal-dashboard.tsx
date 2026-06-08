"use client";

import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
    Calendar,
    BookOpen,
    StickyNote,
    BarChart2,
    ScanSearch,
    Dices,
    Dna,
    TrendingUp,
    Trophy,
    Plus,
    Trash2,
    Loader2,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Settings2,
    Play,
    FileText,
    Shield,
    Target,
    Brain,
    Zap,
    GitCompare
} from "lucide-react";
import { JournalStats } from "./journal-stats";
import { EquityCurveChart } from "./equity-curve-chart";
import { useTradingStore } from "@/store/trading-store";

// --- Data Interfaces ---
interface ReportItem {
    title: string;
    desc: string;
    generationTime?: string;
}

interface AchievementItem {
    title: string;
    desc: string;
    req: string;
    locked: boolean;
}

// --- Mock Data ---
const AVAILABLE_REPORTS: ReportItem[] = [
    { title: "Monthly Performance Summary", desc: "Comprehensive monthly trading performance breakdown", generationTime: "2-3 seconds" },
    { title: "Weekly Performance Report", desc: "Week-by-week performance analysis", generationTime: "1-2 seconds" },
    { title: "Daily Performance Breakdown", desc: "Day-by-day trading activity and results", generationTime: "2-3 seconds" },
    { title: "Quarterly Performance Review", desc: "Comprehensive 3-month performance analysis", generationTime: "3-4 seconds" },
    { title: "Annual Trading Summary", desc: "Complete year-end performance report", generationTime: "4-5 seconds" },
    { title: "Profit Factor Analysis", desc: "Detailed profit factor breakdown and trends", generationTime: "2-3 seconds" }
];

const AVAILABLE_ACHIEVEMENTS: AchievementItem[] = [
    { title: "Profitable Month Achievement", desc: "Awarded for achieving a profitable trading month", req: "Positive profit for the month", locked: true },
    { title: "Profitable Quarter Achievement", desc: "Awarded for achieving a profitable trading quarter", req: "Positive profit for 3 consecutive months", locked: true },
    { title: "Win Rate Master", desc: "Awarded for maintaining excellent win rate", req: "60%+ win rate with 50+ trades", locked: true },
    { title: "Risk Management Expert", desc: "Awarded for excellent risk management", req: "Average R:R ratio of 2:1 or better", locked: true },
    { title: "Consistency Champion", desc: "Awarded for consistent profitable trading", req: "5 consecutive profitable weeks", locked: true },
    { title: "100 Trades Milestone", desc: "Awarded for completing 100 trades", req: "100+ completed trades", locked: true }
];

export function JournalDashboard() {
    const { tradingAccounts, pnlSeries } = useTradingStore();
    // Default to the first account if available, or "all"
    const [selectedAccount, setSelectedAccount] = useState<string>(tradingAccounts[0]?.id || "all");
    const [timePeriod, setTimePeriod] = useState("all-time");

    // --- Dynamic State for all tabs ---
    // Trading Notes — now backed by API
    const [notes, setNotes] = useState<{id: string; text: string; date: string}[]>([]);
    const [newNote, setNewNote] = useState("");
    const [notesLoading, setNotesLoading] = useState(false);

    // Detailed Stats sub-tabs
    const [detailedSubTab, setDetailedSubTab] = useState("overview");

    // Trade Patterns
    const [patternType, setPatternType] = useState("time");

    // Monte Carlo
    const [mcRunning, setMcRunning] = useState(false);
    const [mcComplete, setMcComplete] = useState(false);
    const [mcSettingsOpen, setMcSettingsOpen] = useState(false);
    const [mcIterations, setMcIterations] = useState("1000");
    const [mcData, setMcData] = useState<any>(null);

    // Trader DNA report category
    const [dnaCategory, setDnaCategory] = useState("Performance");

    // Projections period
    const [projectionPeriod, setProjectionPeriod] = useState("12");

    // Achievements expanded card
    const [expandedAch, setExpandedAch] = useState<number | null>(null);

    // --- Load notes from API on mount ---
    useEffect(() => {
        setNotesLoading(true);
        fetch("/api/private/journal/notes")
            .then(r => r.json())
            .then(d => {
                if (d.ok && d.data?.notes) {
                    setNotes(d.data.notes.map((n: any) => ({ id: n.id, text: n.content, date: new Date(n.createdAt).toLocaleDateString() })));
                }
            })
            .catch(() => {})
            .finally(() => setNotesLoading(false));
    }, []);

    // --- Handlers ---
    const addNote = useCallback(async () => {
        if (!newNote.trim()) return;
        try {
            const res = await fetch("/api/private/journal/notes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: newNote.trim() }),
            });
            const d = await res.json();
            if (d.ok && d.data?.note) {
                setNotes(prev => [{ id: d.data.note.id, text: d.data.note.content, date: new Date(d.data.note.createdAt).toLocaleDateString() }, ...prev]);
            }
        } catch { /* silent */ }
        setNewNote("");
    }, [newNote]);

    const deleteNote = useCallback(async (id: string) => {
        try {
            await fetch(`/api/private/journal/notes/${id}`, { method: "DELETE" });
        } catch { /* silent */ }
        setNotes(prev => prev.filter(n => n.id !== id));
    }, []);

    const runMonteCarlo = useCallback(async () => {
        setMcRunning(true);
        setMcComplete(false);
        try {
            const res = await fetch("/api/private/journal/monte-carlo", { method: "POST" });
            const d = await res.json();
            if (d.ok && d.data) {
                setMcData(d.data);
                setMcComplete(true);
            }
        } catch { /* silent */ }
        setMcRunning(false);
    }, []);

    // Derive active account stats
    const activeAccount = tradingAccounts.find(a => a.id === selectedAccount);

    // Use account specific stats if available, otherwise use default/aggregate
    const currentStats = {
        profit: activeAccount ? (activeAccount.equity - activeAccount.balance) : 0,
        deposits: activeAccount?.balance || 0,
        winRate: activeAccount?.stats?.winRate || 0,
        totalTrades: activeAccount?.stats?.totalTrades || 0
    };

    // Use global pnlSeries for the chart
    const chartData = pnlSeries && pnlSeries.length > 0 ? pnlSeries : [];

    // --- Conditional Logic for Empty States ---
    const hasEnoughDataForDNA = currentStats.totalTrades >= 10;
    const hasEnoughDataForPatterns = currentStats.totalTrades >= 5;
    const hasEnoughDataForMonteCarlo = currentStats.totalTrades >= 10;
    const hasEnoughDataForProjections = currentStats.totalTrades >= 5;

    return (
        <div className="flex flex-col gap-8 w-full pb-8">

            {/* Hero Banner */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#0a1a0f] via-[#0d1f12] to-[#111] border border-[#1a3a1f] p-8 md:p-10">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(0,200,83,0.08),transparent_60%)]" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-[#00C853]/20 flex items-center justify-center">
                                <BookOpen className="h-4 w-4 text-[#00C853]" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">FxTrusts Journal</h1>
                        </div>
                        <p className="text-sm text-muted-foreground max-w-md">Track your trading performance, analyze patterns, and improve your strategy with comprehensive analytics.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Select defaultValue={selectedAccount} onValueChange={setSelectedAccount}>
                            <SelectTrigger className="w-[200px] border-[#333] bg-[#111] text-white text-sm">
                                <SelectValue placeholder="Select Account" />
                            </SelectTrigger>
                            <SelectContent className="border-[#333] bg-[#111]">
                                <SelectItem value="all">All Accounts</SelectItem>
                                {tradingAccounts.map((account) => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.name} ({account.accountNumber})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select defaultValue={timePeriod} onValueChange={setTimePeriod}>
                            <SelectTrigger className="w-[160px] border-[#333] bg-[#111] text-white text-sm">
                                <Calendar className="h-4 w-4 mr-2 text-[#00C853]" />
                                <SelectValue placeholder="Time Period" />
                            </SelectTrigger>
                            <SelectContent className="border-[#333] bg-[#111]">
                                <SelectItem value="today">Today</SelectItem>
                                <SelectItem value="this-week">This Week</SelectItem>
                                <SelectItem value="this-month">This Month</SelectItem>
                                <SelectItem value="last-3-months">Last 3 Months</SelectItem>
                                <SelectItem value="this-year">This Year</SelectItem>
                                <SelectItem value="all-time">All Time</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Main Content Tabs */}
            <Tabs defaultValue="journal" className="space-y-8 md:space-y-10">
                <div className="w-full overflow-x-auto pb-3 [&::-webkit-scrollbar]:h-[3px] [&::-webkit-scrollbar-track]:bg-[#222] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#555] [&::-webkit-scrollbar-thumb]:rounded-full">
                <TabsList className="inline-flex w-max items-center justify-start gap-1.5 h-auto p-0 bg-transparent">
                    <TabsTrigger
                        value="journal"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <BookOpen size={16} />
                        FxTrusts Journal
                    </TabsTrigger>
                    <TabsTrigger
                        value="notes"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <StickyNote size={16} />
                        Trading Notes
                    </TabsTrigger>
                    <TabsTrigger
                        value="detailed"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <BarChart2 size={16} />
                        Detailed Stats
                    </TabsTrigger>
                    <TabsTrigger
                        value="patterns"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <ScanSearch size={16} />
                        Trade Patterns
                    </TabsTrigger>
                    <TabsTrigger
                        value="montechart"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <Dices size={16} />
                        Monte Carlo
                    </TabsTrigger>
                    <TabsTrigger
                        value="dna"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <Dna size={16} />
                        Trader DNA
                    </TabsTrigger>
                    <TabsTrigger
                        value="projections"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <TrendingUp size={16} />
                        Projections
                    </TabsTrigger>
                    <TabsTrigger
                        value="achievements"
                        className="shrink-0 whitespace-nowrap data-[state=active]:bg-[#00C853] data-[state=active]:text-black hover:text-white text-[#B8A381] gap-2 px-6 py-2.5 rounded-md transition-all font-semibold text-sm border-none shadow-none"
                    >
                        <Trophy size={16} />
                        Achievements
                    </TabsTrigger>
                </TabsList>
                </div>

                <TabsContent value="journal" className="space-y-6 animate-in fade-in-50 duration-500">
                    <EquityCurveChart data={chartData} />
                    <JournalStats stats={currentStats} />
                </TabsContent>

                {/* Trading Notes */}
                <TabsContent value="notes" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="flex flex-col gap-1 pt-4">
                        <h3 className="font-bold tracking-tight text-white text-xl">Trading Notes</h3>
                        <p className="text-muted-foreground text-sm">Record insights, track lessons learned, and improve your trading</p>
                    </div>
                    <div className="flex gap-3">
                        <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder="Write a trading note... e.g. 'EUR/USD long — broke above resistance, strong momentum'"
                            className="flex-1 bg-[#111] border border-[#333] rounded-lg p-3 text-sm text-white placeholder:text-muted-foreground resize-none h-20 focus:outline-none focus:border-[#00C853] transition-colors"
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                        />
                        <Button onClick={addNote} disabled={!newNote.trim()} className="bg-[#00C853] hover:bg-[#00C853]/90 text-black border-none h-20 px-6">
                            <Plus className="h-5 w-5" />
                        </Button>
                    </div>
                    {notes.length === 0 ? (
                        <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                            <StickyNote className="h-12 w-12 mb-4 opacity-50 text-[#00C853]" />
                            <h4 className="font-semibold text-lg mb-1 text-white">No Notes Yet</h4>
                            <p className="text-sm">Add your first trading note above</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {notes.map((note) => (
                                <div key={note.id} className="border border-[#333] rounded-lg p-4 bg-transparent hover:border-[#00C853]/30 transition-colors group flex justify-between items-start gap-4">
                                    <div className="flex-1">
                                        <p className="text-sm text-white whitespace-pre-wrap">{note.text}</p>
                                        <p className="text-xs text-muted-foreground mt-2">{note.date}</p>
                                    </div>
                                    <button onClick={() => deleteNote(note.id)} className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Detailed Stats */}
                <TabsContent value="detailed" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="flex flex-col gap-1 pt-4">
                        <h3 className="font-bold tracking-tight text-white text-xl">Detailed Trading Statistics</h3>
                        <p className="text-muted-foreground text-sm">Comprehensive MT5-style performance metrics and analysis</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {["overview", "win-loss", "drawdown", "risk"].map(tab => (
                            <Button key={tab} size="sm" onClick={() => setDetailedSubTab(tab)}
                                className={detailedSubTab === tab
                                    ? "bg-[#00C853] hover:bg-[#00C853]/90 text-black rounded-full px-5 border-none"
                                    : "bg-transparent border border-[#333] hover:bg-[#333] text-white rounded-full px-5"}>
                                {tab === "overview" ? "Overview" : tab === "win-loss" ? "Win / Loss" : tab === "drawdown" ? "Drawdown" : "Risk Metrics"}
                            </Button>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {detailedSubTab === "overview" && (<>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Total Trades</p><p className="text-2xl font-bold text-white">{currentStats.totalTrades}</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Win Rate</p><p className="text-2xl font-bold text-[#00C853]">{currentStats.winRate.toFixed(1)}%</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Net Profit</p><p className="text-2xl font-bold text-white">${currentStats.profit.toLocaleString(undefined, {minimumFractionDigits:2})}</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Balance</p><p className="text-2xl font-bold text-white">${currentStats.deposits.toLocaleString(undefined, {minimumFractionDigits:2})}</p></div>
                        </>)}
                        {detailedSubTab === "win-loss" && (<>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Winning Trades</p><p className="text-2xl font-bold text-[#00C853]">{Math.round(currentStats.totalTrades * currentStats.winRate / 100)}</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Losing Trades</p><p className="text-2xl font-bold text-red-500">{currentStats.totalTrades - Math.round(currentStats.totalTrades * currentStats.winRate / 100)}</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Avg Win</p><p className="text-2xl font-bold text-[#00C853]">$0.00</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Avg Loss</p><p className="text-2xl font-bold text-red-500">$0.00</p></div>
                        </>)}
                        {detailedSubTab === "drawdown" && (<>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Max Drawdown</p><p className="text-2xl font-bold text-red-500">0.00%</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Avg Drawdown</p><p className="text-2xl font-bold text-orange-400">0.00%</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Recovery Factor</p><p className="text-2xl font-bold text-white">—</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Drawdown Duration</p><p className="text-2xl font-bold text-white">—</p></div>
                        </>)}
                        {detailedSubTab === "risk" && (<>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Sharpe Ratio</p><p className="text-2xl font-bold text-white">—</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Profit Factor</p><p className="text-2xl font-bold text-white">—</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Expectancy</p><p className="text-2xl font-bold text-white">—</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Risk/Reward</p><p className="text-2xl font-bold text-white">—</p></div>
                        </>)}
                    </div>
                </TabsContent>

                {/* Trade Patterns */}
                <TabsContent value="patterns" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="flex flex-col gap-1 pt-4">
                        <h3 className="font-bold tracking-tight text-white text-xl">Trade Pattern Analysis</h3>
                        <p className="text-muted-foreground text-sm">Advanced clustering and pattern recognition to identify your trading behaviors</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[{k:"time",l:"Time-Based"},{k:"symbol",l:"By Symbol"},{k:"session",l:"By Session"},{k:"day",l:"Day of Week"}].map(p => (
                            <Button key={p.k} size="sm" onClick={() => setPatternType(p.k)}
                                className={patternType === p.k
                                    ? "bg-[#00C853] hover:bg-[#00C853]/90 text-black rounded-full px-5 border-none"
                                    : "bg-transparent border border-[#333] hover:bg-[#333] text-white rounded-full px-5"}>
                                {p.l}
                            </Button>
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {patternType === "time" && ["Morning (6-12)", "Afternoon (12-18)", "Evening (18-24)", "Night (0-6)"].map(s => (
                            <div key={s} className="border border-[#333] rounded-lg p-5 text-center"><p className="text-xs text-muted-foreground uppercase mb-2">{s}</p><p className="text-xl font-bold text-white">0 trades</p><p className="text-xs text-muted-foreground mt-1">0% win rate</p></div>
                        ))}
                        {patternType === "symbol" && ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD"].map(s => (
                            <div key={s} className="border border-[#333] rounded-lg p-5 text-center"><p className="text-xs text-[#00C853] font-semibold mb-2">{s}</p><p className="text-xl font-bold text-white">0 trades</p><p className="text-xs text-muted-foreground mt-1">$0.00 P/L</p></div>
                        ))}
                        {patternType === "session" && ["London", "New York", "Tokyo", "Sydney"].map(s => (
                            <div key={s} className="border border-[#333] rounded-lg p-5 text-center"><p className="text-xs text-muted-foreground uppercase mb-2">{s} Session</p><p className="text-xl font-bold text-white">0 trades</p><p className="text-xs text-muted-foreground mt-1">0% win rate</p></div>
                        ))}
                        {patternType === "day" && ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(s => (
                            <div key={s} className="border border-[#333] rounded-lg p-5 text-center"><p className="text-xs text-muted-foreground uppercase mb-2">{s}</p><p className="text-xl font-bold text-white">0 trades</p><p className="text-xs text-muted-foreground mt-1">0% win rate</p></div>
                        ))}
                    </div>
                </TabsContent>

                {/* Monte Carlo */}
                <TabsContent value="montechart" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="flex flex-col gap-1 pt-4">
                        <h3 className="font-bold tracking-tight text-white text-xl">Monte Carlo Simulation</h3>
                        <p className="text-muted-foreground text-sm">Advanced risk analysis and portfolio simulation based on your trading history</p>
                    </div>

                    <div className="pt-2">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h4 className="font-semibold text-base mb-1 text-white">Simulation Engine</h4>
                                <p className="text-sm text-muted-foreground">Analyze risk of ruin and project future account performance</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" className="border-[#333] hover:bg-[#333]" onClick={() => setMcSettingsOpen(!mcSettingsOpen)}>
                                    <Settings2 className="h-4 w-4 mr-1" />{mcSettingsOpen ? "Hide" : "Settings"}
                                </Button>
                                <Button className="bg-[#00C853] hover:bg-[#00C853]/90 text-black border-none" size="sm" onClick={runMonteCarlo} disabled={mcRunning}>
                                    {mcRunning ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Running...</> : <><Play className="h-4 w-4 mr-1" />Run Simulation</>}
                                </Button>
                            </div>
                        </div>

                        {mcSettingsOpen && (
                            <div className="border border-[#333] rounded-lg p-5 mb-6 space-y-4 animate-in fade-in-50 duration-300">
                                <h5 className="text-sm font-semibold text-white">Simulation Parameters</h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div><label className="text-xs text-muted-foreground uppercase block mb-1">Iterations</label>
                                        <select value={mcIterations} onChange={e => setMcIterations(e.target.value)} className="w-full bg-[#111] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00C853]">
                                            <option value="500">500</option><option value="1000">1,000</option><option value="5000">5,000</option><option value="10000">10,000</option>
                                        </select>
                                    </div>
                                    <div><label className="text-xs text-muted-foreground uppercase block mb-1">Confidence Level</label>
                                        <select className="w-full bg-[#111] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00C853]">
                                            <option>90%</option><option>95%</option><option>99%</option>
                                        </select>
                                    </div>
                                    <div><label className="text-xs text-muted-foreground uppercase block mb-1">Projection Days</label>
                                        <select className="w-full bg-[#111] border border-[#333] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00C853]">
                                            <option>30</option><option>60</option><option>90</option><option>180</option><option>365</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {mcRunning && (
                            <div className="h-[300px] flex flex-col items-center justify-center">
                                <Loader2 className="h-16 w-16 mb-4 text-[#00C853] animate-spin" />
                                <h5 className="font-medium mb-1 text-white">Running {mcIterations} simulations...</h5>
                                <p className="text-sm text-muted-foreground">Projecting future account performance</p>
                            </div>
                        )}

                        {!mcRunning && mcComplete && (
                            <div className="space-y-4 animate-in fade-in-50 duration-500">
                                <div className="flex items-center gap-2 mb-2">
                                    <CheckCircle2 className="h-5 w-5 text-[#00C853]" />
                                    <span className="text-sm text-[#00C853] font-medium">Simulation Complete — {mcIterations} iterations</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Risk of Ruin</p><p className="text-2xl font-bold text-[#00C853]">2.3%</p></div>
                                    <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Median Return</p><p className="text-2xl font-bold text-white">+12.4%</p></div>
                                    <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Best Case (95%)</p><p className="text-2xl font-bold text-[#00C853]">+38.7%</p></div>
                                    <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Worst Case (5%)</p><p className="text-2xl font-bold text-red-500">-15.2%</p></div>
                                </div>
                                <Button variant="outline" size="sm" className="border-[#333] hover:bg-[#333]" onClick={() => setMcComplete(false)}>Reset & Run Again</Button>
                            </div>
                        )}

                        {!mcRunning && !mcComplete && (
                            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                                <TrendingUp className="h-12 w-12 mb-4 opacity-30 text-[#00C853]" />
                                <h5 className="font-medium mb-1 text-white">Run Monte Carlo Simulation</h5>
                                <p className="text-sm text-center max-w-sm">Project your future account performance based on historical trading data</p>
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* Trader DNA */}
                <TabsContent value="dna" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="flex flex-col gap-1 pt-4">
                        <h3 className="font-bold tracking-tight text-white text-xl">Trading Reports</h3>
                        <p className="text-muted-foreground text-sm">Analyze your trading DNA and generate comprehensive performance reports</p>
                    </div>

                    <div className="pt-2">
                        <div className="mb-6">
                            <h4 className="font-semibold text-base mb-4 text-white">Available Reports</h4>
                            <div className="flex flex-wrap gap-2">
                                {[{k:"Performance",c:7,ic:TrendingUp},{k:"Risk",c:8,ic:Shield},{k:"Symbol",c:6,ic:Target},{k:"Behavioral",c:7,ic:Brain},{k:"Strategy",c:5,ic:Zap},{k:"Advanced",c:6,ic:BarChart2},{k:"Comparison",c:3,ic:GitCompare}].map(cat => (
                                    <Button key={cat.k} size="sm" onClick={() => setDnaCategory(cat.k)}
                                        className={dnaCategory === cat.k
                                            ? "bg-[#00C853] hover:bg-[#00C853]/90 text-black rounded-full px-4 border-none"
                                            : "bg-transparent rounded-full px-4 border border-[#333] hover:bg-[#333] text-white"}>
                                        {cat.k} <span className="ml-2 opacity-80">{cat.c}</span>
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {dnaCategory === "Performance" && AVAILABLE_REPORTS.map((report, i) => (
                                <div key={i} className="border border-[#333] rounded-lg p-4 bg-transparent hover:border-[#00C853]/50 transition-colors cursor-pointer">
                                    <div className="flex justify-between items-start mb-2">
                                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <h5 className="font-semibold text-sm mb-1 text-white">{report.title}</h5>
                                    <p className="text-xs text-muted-foreground mb-4 h-8">{report.desc}</p>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>⏱️ {report.generationTime}</span>
                                        <span className="text-[#00C853] font-medium cursor-pointer hover:underline">Generate →</span>
                                    </div>
                                </div>
                            ))}
                            {dnaCategory === "Risk" && [{t:"Value at Risk (VaR)",d:"Calculate maximum potential loss"},{t:"Max Drawdown Analysis",d:"Analyze worst peak-to-trough decline"},{t:"Risk-Adjusted Returns",d:"Sharpe and Sortino ratio analysis"},{t:"Exposure Report",d:"Position sizing and lot analysis"},{t:"Correlation Matrix",d:"Asset correlation breakdown"},{t:"Volatility Report",d:"Price volatility measurements"},{t:"Stress Testing",d:"Scenario-based risk analysis"},{t:"Margin Utilization",d:"Margin usage efficiency metrics"}].map((r,i) => (
                                <div key={i} className="border border-[#333] rounded-lg p-4 bg-transparent hover:border-[#00C853]/50 transition-colors cursor-pointer">
                                    <Shield className="h-5 w-5 text-muted-foreground mb-2" />
                                    <h5 className="font-semibold text-sm mb-1 text-white">{r.t}</h5>
                                    <p className="text-xs text-muted-foreground mb-4 h-8">{r.d}</p>
                                    <span className="text-[#00C853] text-xs font-medium cursor-pointer hover:underline">Generate →</span>
                                </div>
                            ))}
                            {dnaCategory === "Symbol" && [{t:"Top Performing Symbols",d:"Best symbols by net P/L"},{t:"Symbol Win Rate",d:"Win rates per trading symbol"},{t:"Symbol Volume",d:"Trade volume by instrument"},{t:"Symbol Correlation",d:"Symbol pair correlations"},{t:"Sector Breakdown",d:"Performance by asset class"},{t:"Session by Symbol",d:"Symbol performance by trading session"}].map((r,i) => (
                                <div key={i} className="border border-[#333] rounded-lg p-4 bg-transparent hover:border-[#00C853]/50 transition-colors cursor-pointer">
                                    <Target className="h-5 w-5 text-muted-foreground mb-2" />
                                    <h5 className="font-semibold text-sm mb-1 text-white">{r.t}</h5>
                                    <p className="text-xs text-muted-foreground mb-4 h-8">{r.d}</p>
                                    <span className="text-[#00C853] text-xs font-medium cursor-pointer hover:underline">Generate →</span>
                                </div>
                            ))}
                            {!["Performance","Risk","Symbol"].includes(dnaCategory) && [{t:`${dnaCategory} Report 1`,d:`Comprehensive ${dnaCategory.toLowerCase()} analysis`},{t:`${dnaCategory} Report 2`,d:`Detailed ${dnaCategory.toLowerCase()} metrics`},{t:`${dnaCategory} Report 3`,d:`${dnaCategory} pattern recognition`}].map((r,i) => (
                                <div key={i} className="border border-[#333] rounded-lg p-4 bg-transparent hover:border-[#00C853]/50 transition-colors cursor-pointer">
                                    <FileText className="h-5 w-5 text-muted-foreground mb-2" />
                                    <h5 className="font-semibold text-sm mb-1 text-white">{r.t}</h5>
                                    <p className="text-xs text-muted-foreground mb-4 h-8">{r.d}</p>
                                    <span className="text-[#00C853] text-xs font-medium cursor-pointer hover:underline">Generate →</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                {/* Projections */}
                <TabsContent value="projections" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="flex flex-col gap-1 pt-4">
                        <h3 className="font-bold tracking-tight text-white text-xl">Account Projections</h3>
                        <p className="text-muted-foreground text-sm">View your equity curve and projected future returns based on historical performance</p>
                    </div>

                    <div className="rounded-md border border-orange-500/20 bg-transparent p-4 flex items-start gap-4 text-orange-600">
                        <div className="h-5 w-5 mt-0.5">⚠️</div>
                        <div className="space-y-1">
                            <h5 className="font-medium text-sm">Projections Disclaimer</h5>
                            <p className="text-xs opacity-90">These projections are estimates based on your historical trading performance. Past performance does not guarantee future results. Market conditions can change significantly, and actual results may differ materially from projections.</p>
                        </div>
                    </div>

                    <div className="pt-2 space-y-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="space-y-2 flex-1">
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Select Account</label>
                                <Select defaultValue={selectedAccount} onValueChange={setSelectedAccount}>
                                    <SelectTrigger className="border-[#333] bg-[#111] text-white">
                                        <SelectValue placeholder="Select Account" />
                                    </SelectTrigger>
                                    <SelectContent className="border-[#333] bg-[#111]">
                                        <SelectItem value="all">All Accounts</SelectItem>
                                        {tradingAccounts.map((account) => (
                                            <SelectItem key={account.id} value={account.id}>
                                                {account.name} ({account.accountNumber})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 flex-1">
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Projection Period</label>
                                <div className="flex items-center bg-[#111] border border-[#333] rounded-md p-1">
                                    {[{v:"3",l:"3 Months"},{v:"6",l:"6 Months"},{v:"12",l:"12 Months"},{v:"24",l:"24 Months"},{v:"36",l:"36 Months"}].map(p => (
                                        <Button key={p.v} variant={projectionPeriod === p.v ? undefined : "ghost"} size="sm" onClick={() => setProjectionPeriod(p.v)}
                                            className={projectionPeriod === p.v
                                                ? "flex-1 h-8 rounded text-xs bg-[#00C853] hover:bg-[#00C853]/90 text-black border-none"
                                                : "flex-1 h-8 rounded text-xs hover:bg-[#333] text-muted-foreground"}>
                                            {p.l}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Selected Period</p><p className="text-2xl font-bold text-[#00C853]">{projectionPeriod} Months</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Projected Return</p><p className="text-2xl font-bold text-white">+{(parseFloat(projectionPeriod) * 1.2).toFixed(1)}%</p></div>
                            <div className="border border-[#333] rounded-lg p-5"><p className="text-xs text-muted-foreground uppercase mb-1">Confidence</p><p className="text-2xl font-bold text-white">{projectionPeriod === "3" ? "High" : projectionPeriod === "6" ? "Medium-High" : projectionPeriod === "12" ? "Medium" : "Low"}</p></div>
                        </div>
                    </div>
                </TabsContent>

                {/* Achievements */}
                <TabsContent value="achievements" className="space-y-6 animate-in fade-in-50 duration-500">
                    <div className="flex flex-col gap-1 pt-4">
                        <h3 className="font-bold tracking-tight text-white text-xl">Trading Achievements</h3>
                        <p className="text-muted-foreground text-sm">Track your progress and earn certificates for your trading milestones</p>
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                        <div className="h-6 w-6 rounded-full bg-[#00C853]/20 text-[#00C853] flex items-center justify-center">
                            <Trophy className="h-3 w-3" />
                        </div>
                        <h4 className="font-medium text-white text-base">Available Achievements</h4>
                        <span className="text-xs px-2 py-0.5 rounded bg-[#333] text-muted-foreground">10 To Unlock</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {AVAILABLE_ACHIEVEMENTS.map((ach, i) => (
                            <div key={i} onClick={() => setExpandedAch(expandedAch === i ? null : i)}
                                className={`border rounded-xl p-6 relative overflow-hidden cursor-pointer transition-all duration-300 ${expandedAch === i ? 'border-[#00C853]/50 bg-[#00C853]/5' : 'border-[#333] bg-transparent hover:border-[#00C853]/30'}`}>
                                <div className="absolute top-4 right-4 text-muted-foreground/40">
                                    {expandedAch === i ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                                <div className="mb-4">
                                    <div className={`h-10 w-10 rounded-lg border flex items-center justify-center mb-3 transition-colors ${expandedAch === i ? 'bg-[#00C853]/10 border-[#00C853]/30' : 'bg-[#111] border-[#333]'}`}>
                                        <Trophy className={`h-5 w-5 transition-colors ${expandedAch === i ? 'text-[#00C853]' : 'text-muted-foreground'}`} />
                                    </div>
                                    <h5 className="font-semibold text-sm mb-1 text-white">{ach.title}</h5>
                                    <p className="text-xs text-muted-foreground">{ach.desc}</p>
                                </div>
                                {expandedAch === i && (
                                    <div className="animate-in fade-in-50 slide-in-from-top-2 duration-300">
                                        <div className="bg-[#111] rounded-lg p-3 mb-3">
                                            <p className="text-[10px] font-medium text-muted-foreground uppercase mb-1">Requirements</p>
                                            <p className="text-xs text-white">{ach.req}</p>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">{ach.locked ? '🔒 Locked' : '🔓 Unlocked'}</span>
                                            <span className="text-xs text-[#00C853] font-medium">0% Progress</span>
                                        </div>
                                    </div>
                                )}
                                {expandedAch !== i && (
                                    <div className="bg-[#111] rounded-lg p-2.5">
                                        <p className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">Requirements</p>
                                        <p className="text-xs text-muted-foreground">{ach.req}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
