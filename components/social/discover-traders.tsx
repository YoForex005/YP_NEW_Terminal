"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { StrategyCard } from "./strategy-card";
import { StrategyDetailsModal } from "./strategy-details-modal";
import { FullAnalysisModal } from "./full-analysis-modal";
import { SocialStrategy } from "@/types/dashboard";

export function DiscoverTraders() {
    const [strategies, setStrategies] = useState<SocialStrategy[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [riskFilter, setRiskFilter] = useState<"All" | "Low" | "Medium" | "High">("All");
    const [sortBy, setSortBy] = useState<"followers" | "profit" | "drawdown" | "winRate" | "profitFactor" | "fee" | "newest">("followers");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [selectedStrategy, setSelectedStrategy] = useState<SocialStrategy | null>(null);
    const [analyzingStrategy, setAnalyzingStrategy] = useState<SocialStrategy | null>(null);

    useEffect(() => {
        let mounted = true;
        void (async () => {
            try {
                const response = await fetch("/api/private/social/strategies", {
                    method: "GET",
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error("Failed to load social strategies.");
                }

                const payload = (await response.json()) as { strategies: SocialStrategy[] };
                if (mounted) {
                    setStrategies(payload.strategies);
                }
            } catch {
                if (mounted) {
                    setStrategies([]);
                }
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    // Filter and Sort Logic
    const filteredStrategies = useMemo(
        () =>
            strategies
                .filter((strategy) => {
                    const matchesSearch = strategy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        strategy.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
                    const matchesRisk = riskFilter === "All" || strategy.riskLevel === riskFilter;

                    return matchesSearch && matchesRisk;
                })
                .sort((a, b) => {
                    let diff = 0;
                    if (sortBy === "followers") diff = a.followers - b.followers;
                    else if (sortBy === "profit") diff = a.totalProfit - b.totalProfit;
                    else if (sortBy === "drawdown") diff = a.maxDrawdown - b.maxDrawdown;
                    else if (sortBy === "winRate") diff = a.winRate - b.winRate;
                    else if (sortBy === "profitFactor") diff = a.profitFactor - b.profitFactor;
                    else if (sortBy === "fee") diff = a.performanceFee - b.performanceFee;
                    else if (sortBy === "newest") diff = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();

                    return sortOrder === "asc" ? diff : -diff;
                }),
        [riskFilter, searchQuery, sortBy, sortOrder, strategies],
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Search and Filters */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-[12px] bg-[#0A0A0A] border border-white/[0.05] shadow-sm">
                <div className="md:col-span-5 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search strategies..."
                        className="pl-11 h-[42px] text-[13px] bg-[#111111] border border-[#222] rounded-[8px] text-white placeholder:text-muted-foreground/50 focus-visible:ring-white/10 transition-colors"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="md:col-span-3">
                    <Select value={riskFilter} onValueChange={(v: any) => setRiskFilter(v)}>
                        <SelectTrigger className="h-[42px] text-[13px] bg-[#111111] border border-[#222] rounded-[8px] text-white focus:ring-white/10 transition-colors">
                            <SelectValue placeholder="All Risk Levels" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#111111] border-[#222] text-white">
                            <SelectItem value="All">All Risk Levels</SelectItem>
                            <SelectItem value="Low">Low Risk</SelectItem>
                            <SelectItem value="Medium">Medium Risk</SelectItem>
                            <SelectItem value="High">High Risk</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="md:col-span-2">
                    <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                        <SelectTrigger className="h-[42px] text-[13px] bg-[#111111] border border-[#222] rounded-[8px] text-white focus:ring-white/10 transition-colors">
                            <SelectValue placeholder="Sort by Followers" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#111111] border-[#222] text-white">
                            <SelectItem value="followers">Sort by Followers</SelectItem>
                            <SelectItem value="winRate">Sort by Win Rate</SelectItem>
                            <SelectItem value="profitFactor">Sort by Profit Factor</SelectItem>
                            <SelectItem value="profit">Sort by Profit %</SelectItem>
                            <SelectItem value="fee">Sort by Fee</SelectItem>
                            <SelectItem value="newest">Sort by Newest</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="md:col-span-2">
                    <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                        <SelectTrigger className="h-[42px] text-[13px] bg-[#111111] border border-[#222] rounded-[8px] text-white focus:ring-white/10 transition-colors">
                            <SelectValue placeholder="High to Low" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#111111] border-[#222] text-white">
                            <SelectItem value="desc">High to Low</SelectItem>
                            <SelectItem value="asc">Low to High</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filteredStrategies.map((strategy) => (
                    <StrategyCard
                        key={strategy.id}
                        strategy={strategy}
                        onDetailsClick={setSelectedStrategy}
                    />
                ))}
            </div>

            <StrategyDetailsModal
                isOpen={!!selectedStrategy}
                onClose={() => setSelectedStrategy(null)}
                strategy={selectedStrategy}
                onViewFullAnalysis={(strategy) => {
                    setSelectedStrategy(null);
                    setAnalyzingStrategy(strategy);
                }}
            />

            <FullAnalysisModal
                isOpen={!!analyzingStrategy}
                onClose={() => setAnalyzingStrategy(null)}
                strategy={analyzingStrategy}
            />

            {isLoading && (
                <div className="flex flex-col items-center justify-center py-28 text-center rounded-[12px] border border-white/[0.05] bg-[#0A0A0A] w-full">
                    <div className="h-10 w-10 border-2 border-primary/50 border-t-primary rounded-full animate-spin mb-4" />
                    <p className="text-[13px] text-muted-foreground/70 font-medium tracking-wide">Loading strategies...</p>
                </div>
            )}

            {filteredStrategies.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center py-28 text-center rounded-[12px] border border-white/[0.05] bg-[#0A0A0A] w-full">
                    <div className="flex items-center justify-center h-14 w-14 rounded-[12px] bg-[#111111] border border-[#222] mb-4 shadow-inner">
                        <Search className="h-6 w-6 text-muted-foreground/40" strokeWidth={1.5} />
                    </div>
                    <p className="text-[15px] font-bold text-white mb-1 tracking-tight">No strategies found</p>
                    <p className="text-[13px] text-muted-foreground/70">No strategies found matching your criteria.</p>
                </div>
            )}
        </div>
    );
}
