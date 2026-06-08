"use client";

import { useState, useEffect } from "react";
import { ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Strategy {
    id: string;
    name: string;
    returnPercent: number;
    investors: number;
    fee: number;
    avatarUrl: string;
    bgUrl?: string;
    isFavorite?: boolean;
}

const fallbackMostCopied: Strategy[] = [
    { id: "1", name: "Ms Flower", returnPercent: 215003, investors: 5804, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=1" },
    { id: "2", name: "EZSignals Team", returnPercent: 2314, investors: 1807, fee: 25, avatarUrl: "https://i.pravatar.cc/150?u=2" },
    { id: "3", name: "TH true GOLD", returnPercent: 843, investors: 1463, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=3" },
    { id: "4", name: "Profit Engine", returnPercent: 72387, investors: 1488, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=4" },
    { id: "5", name: "PHÙ THỦY TRADING", returnPercent: 938, investors: 1457, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=5" },
    { id: "6", name: "Ds Steady Growth", returnPercent: 72658, investors: 1261, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=6" },
];

const mockModerateDrawdown: Strategy[] = [
    { id: "7", name: "Ms Flower", returnPercent: 215003, investors: 5804, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=1", bgUrl: "https://images.unsplash.com/photo-1604085572504-a392ddf0d86a?w=500&q=80" },
    { id: "8", name: "Ds Steady Growth", returnPercent: 72658, investors: 1261, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=6", bgUrl: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&q=80" },
    { id: "9", name: "Profit Engine", returnPercent: 72387, investors: 1488, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=4", bgUrl: "https://images.unsplash.com/photo-1533038590840-1cbf6f6b158c?w=500&q=80" },
    { id: "10", name: "Millionaires Circle", returnPercent: 50286, investors: 130, fee: 30, avatarUrl: "https://i.pravatar.cc/150?u=7", bgUrl: "https://images.unsplash.com/photo-1542204165-65bf26472b9b?w=500&q=80" },
];

const mockLowFee: Strategy[] = [
    { id: "11", name: "Infinite Gold", returnPercent: 22747, investors: 21, fee: 0, avatarUrl: "https://i.pravatar.cc/150?u=8", bgUrl: "https://images.unsplash.com/photo-1621839673705-6617adf9e890?w=500&q=80" },
    { id: "12", name: "Tap Hóa Traders", returnPercent: 14106, investors: 45, fee: 0, avatarUrl: "https://i.pravatar.cc/150?u=9", bgUrl: "https://images.unsplash.com/photo-1620247658742-1e967a5b3a4e?w=500&q=80" },
    { id: "13", name: "Nghiện Forex x100", returnPercent: 10835, investors: 21, fee: 0, avatarUrl: "https://i.pravatar.cc/150?u=10", bgUrl: "https://images.unsplash.com/photo-1605792657660-596af9009e82?w=500&q=80" },
    { id: "14", name: "THANH HUYEN 79", returnPercent: 8809, investors: 37, fee: 0, avatarUrl: "https://i.pravatar.cc/150?u=11", bgUrl: "https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=500&q=80" },
];

export function DiscoverStrategies() {
    const [apiStrategies, setApiStrategies] = useState<Strategy[]>([]);
    const [loaded, setLoaded] = useState(false);

    // Fetch real strategies from the backend
    useEffect(() => {
        fetch("/api/private/copy-trading")
            .then(r => r.json())
            .then(d => {
                if (d.ok && d.data?.strategies) {
                    setApiStrategies(d.data.strategies.map((s: any, i: number) => ({
                        id: s.id,
                        name: s.name,
                        returnPercent: Math.round(s.roi * 100) / 100,
                        investors: s.followers,
                        fee: s.riskLevel === "high" ? 30 : s.riskLevel === "medium" ? 20 : 10,
                        avatarUrl: `https://i.pravatar.cc/150?u=${i + 20}`,
                    })));
                }
            })
            .catch(() => {})
            .finally(() => setLoaded(true));
    }, []);

    // Use API strategies if available, otherwise fallback
    const mostCopied = apiStrategies.length > 0 ? apiStrategies : fallbackMostCopied;
    return (
        <div className="space-y-10 animate-in fade-in duration-500">
            {/* Filter Pills — Support Hub style */}
            <div className="flex flex-wrap gap-2">
                <Button className="rounded-full bg-muted/20 border border-border/40 hover:bg-muted/40 text-sm h-8 px-4 font-medium shadow-none text-foreground">All strategies</Button>
                <Button variant="outline" className="rounded-full text-sm h-8 px-4 font-normal shadow-none border-border/40 text-muted-foreground hover:text-foreground hover:border-border">Most Copied</Button>
                <Button variant="outline" className="rounded-full text-sm h-8 px-4 font-normal shadow-none border-border/40 text-muted-foreground hover:text-foreground hover:border-border">Return with Moderate Drawdown</Button>
                <Button variant="outline" className="rounded-full text-sm h-8 px-4 font-normal shadow-none border-border/40 text-muted-foreground hover:text-foreground hover:border-border">Best Return for 3 months</Button>
                <Button variant="outline" className="rounded-full text-sm h-8 px-4 font-normal shadow-none border-border/40 text-muted-foreground hover:text-foreground hover:border-border">Low Fee</Button>
                <Button variant="outline" className="rounded-full text-sm h-8 px-4 font-normal shadow-none border-border/40 text-muted-foreground hover:text-foreground hover:border-border">New Strategies</Button>
            </div>

            {/* Most Copied Section */}
            <div>
                <SectionHeader title="Most Copied" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                    {mostCopied.map((strategy: Strategy, index: number) => (
                        <div key={strategy.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/10 transition-colors cursor-pointer group">
                            <span className="text-sm font-bold text-muted-foreground/50 w-5 text-center">{index + 1}</span>
                            <div className="h-10 w-10 relative rounded-xl overflow-hidden shrink-0 border border-border/30">
                                <Image src={strategy.avatarUrl} alt={strategy.name} fill className="object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-semibold truncate">{strategy.name}</h4>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                    <span className="flex items-center text-emerald-400 font-medium">
                                        <TrendingUpIcon className="w-3 h-3 mr-1" />
                                        {strategy.returnPercent}%
                                    </span>
                                    <span>⏱ {strategy.fee}%</span>
                                </div>
                            </div>
                            <div className="text-right flex flex-col items-end shrink-0">
                                <span className="text-sm font-bold">{strategy.investors}</span>
                                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">investors</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Best Strategy Banner — Support Hub style */}
            <div className="rounded-2xl border border-border/40 bg-card/50 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-amber-500">🔥</span>
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Best strategy by return per 3 months</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 relative rounded-xl overflow-hidden shrink-0 border border-border/30">
                            <Image src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&q=80" alt="Banner" fill className="object-cover" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold">us500 downward1</h4>
                            <span className="text-xs text-emerald-400 font-medium flex items-center mt-0.5">
                                <TrendingUpIcon className="w-3 h-3 mr-1" />
                                Return 10020%
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" className="border-border/40 text-sm font-medium flex-1 sm:flex-none rounded-lg">Details</Button>
                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold shadow-md shadow-primary/20 flex-1 sm:flex-none rounded-lg">Invest 10 USD</Button>
                </div>
            </div>

            {/* By Currency */}
            <div>
                <SectionHeader title="By currency" />
                <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide snap-x pt-2">
                    {[
                        { code: 'XAU', img: 'https://flagcdn.com/w80/us.png' },
                        { code: 'USD', img: 'https://flagcdn.com/w80/us.png' },
                        { code: 'JPY', img: 'https://flagcdn.com/w80/jp.png' },
                        { code: 'GBP', img: 'https://flagcdn.com/w80/gb.png' },
                        { code: 'CAD', img: 'https://flagcdn.com/w80/ca.png' },
                        { code: 'CHF', img: 'https://flagcdn.com/w80/ch.png' },
                        { code: 'EUR', img: 'https://flagcdn.com/w80/eu.png' },
                        { code: 'AUD', img: 'https://flagcdn.com/w80/au.png' },
                        { code: 'NZD', img: 'https://flagcdn.com/w80/nz.png' },
                        { code: 'XAG', img: 'https://flagcdn.com/w80/us.png' },
                    ].map((currency) => (
                        <div key={currency.code} className="flex flex-col items-center gap-2.5 min-w-[64px] cursor-pointer group snap-start">
                            <div className="w-12 h-12 rounded-xl border border-border/40 flex items-center justify-center bg-card/50 group-hover:border-primary/50 group-hover:shadow-lg transition-all overflow-hidden shrink-0">
                                {currency.code === 'XAU' || currency.code === 'XAG' ? (
                                    <span className="text-[10px] font-bold">{currency.code}</span>
                                ) : (
                                    <Image src={currency.img} alt={currency.code} width={48} height={48} className="object-cover w-full h-full transform group-hover:scale-110 transition-transform duration-300" />
                                )}
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider">{currency.code}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Return with Moderate Drawdown */}
            <div>
                <SectionHeader title="Return with Moderate Drawdown" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {mockModerateDrawdown.map((strategy) => (
                        <SquareCard key={strategy.id} strategy={strategy} />
                    ))}
                </div>
            </div>

            {/* Low Fee */}
            <div>
                <SectionHeader title="Low Fee" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {mockLowFee.map((strategy) => (
                        <SquareCard key={strategy.id} strategy={strategy} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold tracking-tight">{title}</h3>
            <Button variant="ghost" className="text-xs font-medium text-muted-foreground hover:text-foreground h-8 px-2">
                See all <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
        </div>
    );
}

function TrendingUpIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
        </svg>
    )
}

function SquareCard({ strategy }: { strategy: Strategy }) {
    return (
        <div className="group overflow-hidden rounded-2xl border border-border/40 bg-card cursor-pointer hover:border-border hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col">
            {/* Image Header — Contact-card gradient style */}
            <div className="h-[130px] w-full relative overflow-hidden">
                {strategy.bgUrl ? (
                    <Image src={strategy.bgUrl} alt={strategy.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
                <div className="absolute top-3 right-3">
                    <button className="flex items-center justify-center h-8 w-8 rounded-lg bg-black/30 backdrop-blur-sm border border-white/10 hover:bg-black/50 transition-colors">
                        <Star className="w-4 h-4 text-white/80" />
                    </button>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <span className="text-white font-bold text-sm truncate pr-2" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                        {strategy.name}
                    </span>
                    <div className="h-7 w-7 relative rounded-lg overflow-hidden border border-white/20 shrink-0">
                         <Image src={strategy.avatarUrl} alt={strategy.name} fill className="object-cover" />
                    </div>
                </div>
            </div>
            {/* Stats Footer */}
            <div className="p-4 flex items-center justify-between">
                <div>
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Return</span>
                    <div className="text-sm font-bold">{strategy.returnPercent}%</div>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/20 border border-border/30">
                        ⏱️ {strategy.fee}%
                    </span>
                </div>
            </div>
        </div>
    );
}
