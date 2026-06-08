"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp, Users, DollarSign, Shield, Star, ArrowRight, Smartphone, Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const topStrategies = [
    { rank: 1, name: "CryptoKing", avatar: "CK", return: "2,547%", profit: "1,044,812 USD", investors: 5804, color: "bg-violet-500" },
    { rank: 2, name: "ForexMaster", avatar: "FM", return: "1,890%", profit: "512,476 USD", investors: 3201, color: "bg-blue-500" },
    { rank: 3, name: "GoldTrader", avatar: "GT", return: "1,247%", profit: "378,943 USD", investors: 2156, color: "bg-amber-500" },
    { rank: 4, name: "SwingPro", avatar: "SP", return: "987%", profit: "245,891 USD", investors: 1488, color: "bg-emerald-500" },
    { rank: 5, name: "TechAnalyst", avatar: "TA", return: "834%", profit: "189,432 USD", investors: 1102, color: "bg-pink-500" },
];

const liveStrategies = [
    { name: "Alpha Trader", return: "3,540%", investors: 892, fee: "25%", avatar: "AT", color: "bg-cyan-500" },
    { name: "EZ Signals", return: "2,314%", investors: 1807, fee: "30%", avatar: "EZ", color: "bg-orange-500" },
    { name: "Profit Engine", return: "1,876%", investors: 1488, fee: "20%", avatar: "PE", color: "bg-rose-500" },
    { name: "Steady Growth", return: "1,245%", investors: 1261, fee: "15%", avatar: "SG", color: "bg-teal-500" },
];

const faqs = [
    { q: "How do I create a strategy?", a: "To create a strategy, click the 'Create Strategy' button and fill in your strategy details including name, description, fee structure, and minimum investment. Your strategy will be reviewed and published within 24 hours." },
    { q: "What fees can I charge?", a: "You can set a performance fee between 0% and 50%. This fee is charged on profits generated for your investors. There are no upfront or management fees allowed." },
    { q: "How are profits distributed?", a: "Profits are calculated daily and distributed based on each investor's share in your strategy. Your performance fee is automatically deducted from the investor's profits." },
    { q: "What are the requirements to become a strategy provider?", a: "You need a verified account with at least 30 days of trading history, a minimum account balance of $500, and no more than 30% maximum drawdown in the last 90 days." },
];

export function MyStrategiesContent() {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    return (
        <div className="space-y-16 pb-12">
            {/* Hero Banner */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-400 p-8 md:p-12">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZG90cyIgeD0iMCIgeT0iMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIxMCIgY3k9IjEwIiByPSIxLjUiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9InVybCgjZG90cykiLz48L3N2Zz4=')] opacity-30" />
                <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                    <div className="space-y-4 max-w-xl">
                        <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Join Copy Trading</h2>
                        <p className="text-emerald-50/90 text-base md:text-lg leading-relaxed">
                            Create your own strategy, attract investors, and earn commission on every profitable trade. Start building your track record today.
                        </p>
                        <div className="flex flex-wrap gap-3 pt-2">
                            <Button className="bg-emerald-950/90 text-emerald-50 hover:bg-emerald-950 font-bold text-sm px-6 py-2.5 h-auto shadow-lg">
                                Create a strategy
                            </Button>
                            <Button variant="outline" className="border-emerald-100/40 text-emerald-50 hover:bg-emerald-950/20 font-semibold text-sm px-6 py-2.5 h-auto">
                                Learn more
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 shrink-0">
                        <div className="bg-emerald-950/20 border border-emerald-100/15 backdrop-blur-sm rounded-xl p-4 text-center min-w-[130px]">
                            <p className="text-2xl font-bold text-white">54,300+</p>
                            <p className="text-xs text-emerald-100 mt-1">Active investors</p>
                        </div>
                        <div className="bg-emerald-950/20 border border-emerald-100/15 backdrop-blur-sm rounded-xl p-4 text-center min-w-[130px]">
                            <p className="text-2xl font-bold text-white">$12.5M</p>
                            <p className="text-xs text-emerald-100 mt-1">Total managed</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Start Earning Section */}
            <div className="space-y-8">
                <div className="text-center space-y-2">
                    <h3 className="text-2xl font-bold tracking-tight">Start earning now</h3>
                    <p className="text-muted-foreground max-w-lg mx-auto">Three simple steps to start earning with your trading strategies</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { step: "1", title: "Create a strategy", desc: "Set up your trading strategy with custom parameters, risk levels, and commission rates.", icon: Star },
                        { step: "2", title: "Build track record", desc: "Trade and build a track record. The better your results, the more investors you attract.", icon: TrendingUp },
                        { step: "3", title: "Earn commissions", desc: "Earn commission fees from profitable trades. The more investors copy you, the more you earn.", icon: DollarSign },
                    ].map((item) => (
                        <Card key={item.step} className="relative overflow-hidden group hover:shadow-lg hover:-translate-y-1 transition-all">
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
                                        <item.icon className="h-5 w-5" />
                                    </div>
                                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Step {item.step}</span>
                                </div>
                                <h4 className="text-lg font-bold">{item.title}</h4>
                                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Investors Count */}
            <div className="text-center space-y-3 py-8">
                <h3 className="text-3xl md:text-4xl font-bold tracking-tight">
                    More than <span className="text-primary">54,300</span> investors
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">are ready to invest in your strategies. Join our community of successful strategy providers.</p>
            </div>

            {/* Top Earning Strategies */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold tracking-tight">Top earning strategies</h3>
                    <Button variant="ghost" className="text-sm font-medium text-muted-foreground hover:text-foreground h-8 px-2">
                        See all <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                </div>

                {/* Table Header */}
                <div className="rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-[40px_1fr_1fr_1fr_1fr] gap-4 px-6 py-3 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                        <span>#</span>
                        <span>Strategy</span>
                        <span>All-time return</span>
                        <span>Profit</span>
                        <span className="text-right">Investors</span>
                    </div>
                    {topStrategies.map((s) => (
                        <div key={s.rank} className="grid grid-cols-[40px_1fr_1fr_1fr_1fr] gap-4 px-6 py-4 items-center border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors cursor-pointer">
                            <span className="text-sm font-bold text-muted-foreground">{s.rank}</span>
                            <div className="flex items-center gap-3">
                                <div className={`h-9 w-9 rounded-lg ${s.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                    {s.avatar}
                                </div>
                                <span className="text-sm font-semibold truncate">{s.name}</span>
                            </div>
                            <span className="text-sm font-bold text-emerald-500">{s.return}</span>
                            <span className="text-sm text-foreground">{s.profit}</span>
                            <span className="text-sm text-muted-foreground text-right">{s.investors.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Promo Banner */}
            <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-blue-600 to-violet-600 p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-3 max-w-lg">
                    <h3 className="text-2xl font-bold text-white">Earn more by promoting your strategy online</h3>
                    <p className="text-blue-100/80 text-sm leading-relaxed">
                        Use referral links to attract investors directly to your strategy. Share on social media, blogs, and trading forums to grow your investor base.
                    </p>
                </div>
                <Button className="bg-blue-950/90 text-blue-50 hover:bg-blue-950 font-bold text-sm px-6 py-2.5 h-auto shadow-lg shrink-0">
                    Get referral link <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
            </div>

            {/* Live Strategies */}
            <div className="space-y-6">
                <h3 className="text-xl font-bold tracking-tight">Check out some live strategies</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {liveStrategies.map((s) => (
                        <Card key={s.name} className="overflow-hidden group cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all">
                            <div className={`h-24 ${s.color} relative flex items-center justify-center`}>
                                <span className="text-3xl font-black text-white/20">{s.avatar}</span>
                                <div className="absolute top-3 right-3">
                                    <Star className="h-4 w-4 text-white/60 hover:text-white transition-colors" />
                                </div>
                            </div>
                            <CardContent className="p-4 space-y-3">
                                <h4 className="text-sm font-bold truncate">{s.name}</h4>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Return</p>
                                        <p className="text-lg font-bold text-emerald-500">{s.return}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Fee</p>
                                        <p className="text-sm font-semibold">{s.fee}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Users className="h-3 w-3" />
                                    {s.investors.toLocaleString()} investors
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Download App Section */}
            <div className="rounded-2xl border border-border bg-card p-8 md:p-10 flex flex-col md:flex-row items-center gap-8">
                <div className="flex items-center justify-center h-20 w-20 rounded-2xl bg-primary/10 shrink-0">
                    <Smartphone className="h-10 w-10 text-primary" />
                </div>
                <div className="flex-1 space-y-2 text-center md:text-left">
                    <h3 className="text-xl font-bold">Download the FxTrusts Copy Trading app</h3>
                    <p className="text-sm text-muted-foreground max-w-lg">Easily control and monitor your copy trading strategies on the go. Available for iOS and Android.</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl border border-border bg-muted/30 hover:bg-muted transition-colors cursor-pointer">
                        <Play className="h-5 w-5" />
                        <span className="text-[10px] text-muted-foreground">Google Play</span>
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold">4.6</span>
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 px-5 py-3 rounded-xl border border-border bg-muted/30 hover:bg-muted transition-colors cursor-pointer">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                        <span className="text-[10px] text-muted-foreground">App Store</span>
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold">4.8</span>
                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        </div>
                    </div>
                </div>
            </div>

            {/* FAQ Section */}
            <div className="space-y-6">
                <h3 className="text-xl font-bold tracking-tight">FAQ</h3>
                <div className="space-y-3">
                    {faqs.map((faq, idx) => (
                        <div key={idx} className="rounded-xl border border-border overflow-hidden">
                            <button
                                onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                                className="flex items-center justify-between w-full px-6 py-4 text-left hover:bg-muted/30 transition-colors"
                            >
                                <span className="text-sm font-semibold pr-4">{faq.q}</span>
                                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${openFaq === idx ? "rotate-180" : ""}`} />
                            </button>
                            {openFaq === idx && (
                                <div className="px-6 pb-5 pt-0">
                                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Compliance Section */}
            <div className="space-y-6 pt-4 border-t border-border">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            Fees
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            FxTrusts does not charge fees for using the Copy Trading service. Strategy providers can set performance fees between 0-50% which are applied to investor profits only. No fees are charged on losses.
                        </p>

                        <h4 className="text-sm font-bold mt-6">Trading and Utilization</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            High returns do not guarantee future results. Past performance is not indicative of future performance. Trading involves significant risk and may result in the loss of invested capital.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold">Attracting investors</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            FxTrusts may promote top-performing strategies on its platform. Strategy providers can also use referral links to attract investors directly. Misleading claims about returns or guarantees are strictly prohibited.
                        </p>

                        <h4 className="text-sm font-bold mt-6">Privacy</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Your personal information is protected under our privacy policy. Only your strategy name, performance metrics, and public profile are visible to potential investors.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
