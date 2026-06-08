"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, ArrowUpRight, TrendingUp, ArrowLeft, ArrowRight } from "lucide-react";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from "@/components/ui/carousel";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FundCard, FundProps } from "@/components/money-management/fund-card";
import { CreateFundForm } from "@/components/money-management/create-fund-form";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import { FundDetailsDialog } from "@/components/money-management/fund-details-dialog";

// Initial Mock Data
const INITIAL_FUNDS: FundProps[] = [
    {
        id: "1",
        name: "Alghemy",
        manager: "Alex Thompson",
        risk: "LOW",
        totalReturn: 12.45,
        maxDrawdown: 4.20,
        investors: 128,
        aum: 245000.50,
        performanceFee: 30.00,
        managementFee: 0.00,
        minInvestment: 1000,
        lockInPeriod: "None",
        nav: 10.4520,
    },
    {
        id: "2",
        name: "Eslam Test",
        manager: "Eslam Mahmoud",
        risk: "MEDIUM",
        totalReturn: 1.34,
        maxDrawdown: 0.00,
        investors: 1,
        aum: 101.34,
        performanceFee: 20.00,
        managementFee: 2.00,
        minInvestment: 500,
        lockInPeriod: "30 Days",
        nav: 1.0134,
    },
    {
        id: "3",
        name: "Alpha Prime",
        manager: "Sarah Jenkins",
        risk: "HIGH",
        totalReturn: 45.20,
        maxDrawdown: 15.50,
        investors: 45,
        aum: 1200000.00,
        performanceFee: 25.00,
        managementFee: 1.50,
        minInvestment: 5000,
        lockInPeriod: "90 Days",
        nav: 15.2045,
    },
    {
        id: "4",
        name: "Stable Growth",
        manager: "David Chen",
        risk: "LOW",
        totalReturn: 8.50,
        maxDrawdown: 2.10,
        investors: 312,
        aum: 5600000.00,
        performanceFee: 15.00,
        managementFee: 1.00,
        minInvestment: 2500,
        lockInPeriod: "None",
        nav: 12.8500,
    }
];

export function MoneyManagementDashboard() {
    const [activeTab, setActiveTab] = useState("discovery");
    const [funds, setFunds] = useState<FundProps[]>(INITIAL_FUNDS);
    const [myInvestments, setMyInvestments] = useState<FundProps[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch live funds and investments
    useEffect(() => {
        const fetchPammData = async () => {
            setIsLoading(true);
            try {
                // Fetch public social strategies (Discover Funds)
                const strategiesRes = await fetch("/api/private/social/strategies");
                const strategiesData = await strategiesRes.json();
                
                if (strategiesData.strategies && Array.isArray(strategiesData.strategies)) {
                    const mappedFunds: FundProps[] = strategiesData.strategies.map((s: any) => ({
                        id: s.id,
                        name: s.name,
                        manager: "Pro Trader", // Optional: extend via profile
                        risk: s.riskLevel?.toUpperCase() || "MEDIUM",
                        totalReturn: s.totalProfit || 0,
                        maxDrawdown: s.maxDrawdown || 0,
                        investors: s.followers || 0,
                        aum: s.masterEquity || 0,
                        performanceFee: s.performanceFee || 0,
                        managementFee: s.fee || 0,
                        minInvestment: s.minBalance || 0,
                        lockInPeriod: "30 Days",
                        nav: 10 + ((s.totalProfit || 0) / 100)
                    }));
                    
                    if (mappedFunds.length > 0) {
                        setFunds(mappedFunds);
                    }
                }

                // Fetch user's PAMM Accounts (My Investments)
                const mmRes = await fetch("/api/private/mm/accounts");
                const mmData = await mmRes.json();

                if (mmData.ok && mmData.data?.data?.accounts) {
                    // Map user accounts into investments
                    const investedIds = mmData.data.data.accounts.map((acc: any) => acc.id);
                    // For demo purposes, we randomly assign invested funds or map if backend supports it
                }
            } catch (error) {
                console.error("Failed to fetch PAMM data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPammData();
    }, []);

    // Filtering State
    const [searchQuery, setSearchQuery] = useState("");
    const [riskFilter, setRiskFilter] = useState("all");
    const [minAum, setMinAum] = useState("");
    const [maxDd, setMaxDd] = useState("");
    const [sortBy, setSortBy] = useState("return_desc");

    // Investment Modal State
    const [selectedFund, setSelectedFund] = useState<FundProps | null>(null);
    const [investAmount, setInvestAmount] = useState("");
    const [isInvestModalOpen, setIsInvestModalOpen] = useState(false);

    // Manager State
    const [isCreatingFund, setIsCreatingFund] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // Carousel State
    const [discoverApi, setDiscoverApi] = useState<CarouselApi>();
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);
    const [investApi, setInvestApi] = useState<CarouselApi>();
    const [canInvestPrev, setCanInvestPrev] = useState(false);
    const [canInvestNext, setCanInvestNext] = useState(false);

    useEffect(() => {
        if (!discoverApi) return;
        const update = () => {
            setCanScrollPrev(discoverApi.canScrollPrev());
            setCanScrollNext(discoverApi.canScrollNext());
        };
        update();
        discoverApi.on("select", update);
        return () => { discoverApi.off("select", update); };
    }, [discoverApi]);

    useEffect(() => {
        if (!investApi) return;
        const update = () => {
            setCanInvestPrev(investApi.canScrollPrev());
            setCanInvestNext(investApi.canScrollNext());
        };
        update();
        investApi.on("select", update);
        return () => { investApi.off("select", update); };
    }, [investApi]);

    // Filter Logic
    const filteredFunds = funds.filter(fund => {
        const matchesSearch = fund.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            fund.manager.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRisk = riskFilter === "all" || fund.risk.toLowerCase() === riskFilter.toLowerCase();
        const matchesAum = minAum === "" || fund.aum >= Number(minAum);
        const matchesDd = maxDd === "" || fund.maxDrawdown <= Number(maxDd);

        return matchesSearch && matchesRisk && matchesAum && matchesDd;
    }).sort((a, b) => {
        switch (sortBy) {
            case "return_desc": return b.totalReturn - a.totalReturn;
            case "return_asc": return a.totalReturn - b.totalReturn;
            case "aum_desc": return b.aum - a.aum;
            case "investors_desc": return b.investors - a.investors;
            default: return 0;
        }
    });

    const handleInvestClick = (fund: FundProps) => {
        setSelectedFund(fund);
        setIsInvestModalOpen(true);
    };

    const handleCardClick = (fund: FundProps) => {
        setSelectedFund(fund);
        setIsDetailOpen(true);
    };

    const confirmInvestment = () => {
        if (selectedFund) {
            if (!myInvestments.find(f => f.id === selectedFund.id)) {
                setMyInvestments([...myInvestments, selectedFund]);
            }
            setIsInvestModalOpen(false);
            setInvestAmount("");
            setActiveTab("invest");
        }
    };

    const handleCreateFund = (newFundData: Omit<FundProps, "id" | "minInvestment" | "lockInPeriod" | "nav">) => {
        const newFund: FundProps = {
            ...newFundData,
            id: Math.random().toString(36).substr(2, 9),
            minInvestment: 1000, // Default for user created funds
            lockInPeriod: "None", // Default
            nav: 10.0000, // Default starting NAV
        };
        setFunds([newFund, ...funds]);
        setIsCreatingFund(false);
        setActiveTab("discovery");
    };

    return (
        <div className="flex flex-col gap-8 w-full pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Hero Banner — Blue */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-blue-600/20 via-blue-500/10 to-transparent border border-blue-500/15 p-5 sm:p-8 md:p-10">
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/8 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-indigo-500/5 rounded-full blur-2xl translate-y-1/2" />
                <div className="relative space-y-3">
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1">
                        <SlidersHorizontal className="h-3 w-3" />
                        MONEY MANAGEMENT
                    </div>
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
                        FxTrusts <span className="text-blue-400">Money Management</span>
                    </h1>
                    <p className="text-base text-muted-foreground max-w-md">
                        Invest in managed funds or create your own fund and earn performance fees from investors.
                    </p>
                </div>
            </div>

            <Tabs value={activeTab} className="space-y-6" onValueChange={setActiveTab}>
                <div className="flex items-center w-full overflow-x-auto pb-2 scrollbar-none">
                    <TabsList className="bg-transparent p-0 gap-2 sm:gap-4 h-auto inline-flex min-w-max">
                        <TabsTrigger
                            value="discovery"
                            className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                        >
                            <Search className="h-4 w-4" />
                            Discover Funds
                        </TabsTrigger>
                        <TabsTrigger
                            value="invest"
                            className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                        >
                            <ArrowUpRight className="h-4 w-4" />
                            Invest
                        </TabsTrigger>
                        <TabsTrigger
                            value="manager"
                            className="gap-2 rounded-md px-4 py-2 text-base font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground transition-all shadow-none"
                        >
                            <TrendingUp className="h-4 w-4" />
                            Become a Fund Manager
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="discovery" className="space-y-6 outline-none">
                    {/* Filters — Support Hub toolbar style */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-xl bg-muted/5 border border-border/40">
                        <div className="md:col-span-4 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search funds..."
                                className="pl-9 h-9 text-xs bg-background/80 border-border/40 rounded-lg focus-visible:ring-primary/20"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <Select value={riskFilter} onValueChange={setRiskFilter}>
                                <SelectTrigger className="h-9 text-xs bg-background/80 border-border/40 rounded-lg">
                                    <SelectValue placeholder="Risk Level" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Risk Levels</SelectItem>
                                    <SelectItem value="low">Low Risk</SelectItem>
                                    <SelectItem value="medium">Medium Risk</SelectItem>
                                    <SelectItem value="high">High Risk</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-2">
                            <Input
                                placeholder="Min AUM"
                                type="number"
                                className="h-9 text-xs bg-background/80 border-border/40 rounded-lg focus-visible:ring-primary/20"
                                value={minAum}
                                onChange={(e) => setMinAum(e.target.value)}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Input
                                placeholder="Max DD %"
                                type="number"
                                className="h-9 text-xs bg-background/80 border-border/40 rounded-lg focus-visible:ring-primary/20"
                                value={maxDd}
                                onChange={(e) => setMaxDd(e.target.value)}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="h-9 text-xs bg-background/80 border-border/40 rounded-lg">
                                    <SelectValue placeholder="Sort by" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="return_desc">Return: High to Low</SelectItem>
                                    <SelectItem value="return_asc">Return: Low to High</SelectItem>
                                    <SelectItem value="aum_desc">AUM: High to Low</SelectItem>
                                    <SelectItem value="investors_desc">Most Investors</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>


                    {/* Gallery6-style Carousel */}
                    {filteredFunds.length > 0 ? (
                        <div>
                            {/* Header row with title + nav arrows */}
                            <div className="mb-6 flex flex-col justify-between md:flex-row md:items-end gap-4">
                                <div>
                                    <h2 className="text-2xl font-semibold md:text-3xl">
                                        Available Funds
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {filteredFunds.length} fund{filteredFunds.length !== 1 ? "s" : ""} matching your criteria
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        onClick={() => discoverApi?.scrollPrev()}
                                        disabled={!canScrollPrev}
                                        className="disabled:pointer-events-auto"
                                    >
                                        <ArrowLeft className="size-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        onClick={() => discoverApi?.scrollNext()}
                                        disabled={!canScrollNext}
                                        className="disabled:pointer-events-auto"
                                    >
                                        <ArrowRight className="size-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Carousel */}
                            <div className="w-full">
                                <Carousel
                                    setApi={setDiscoverApi}
                                    opts={{
                                        align: "start",
                                        breakpoints: { "(max-width: 768px)": { dragFree: true } },
                                    }}
                                    className="relative -mx-1"
                                >
                                    <CarouselContent className="-ml-4 pl-1">
                                        {filteredFunds.map((fund) => (
                                            <CarouselItem key={fund.id} className="pl-4 basis-[82%] sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                                                <FundCard
                                                    fund={fund}
                                                    onInvest={handleInvestClick}
                                                    onClick={handleCardClick}
                                                />
                                            </CarouselItem>
                                        ))}
                                    </CarouselContent>
                                </Carousel>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                            <p className="text-muted-foreground">No funds found matching your criteria.</p>
                            <Button variant="outline" onClick={() => {
                                setSearchQuery("");
                                setRiskFilter("all");
                                setMinAum("");
                                setMaxDd("");
                            }}>Clear Filters</Button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="invest">
                    {myInvestments.length > 0 ? (
                        <div>
                            <div className="mb-6 flex flex-col justify-between md:flex-row md:items-end gap-4">
                                <div>
                                    <h2 className="text-2xl font-semibold md:text-3xl">Your Portfolio</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {myInvestments.length} active investment{myInvestments.length !== 1 ? "s" : ""}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        onClick={() => investApi?.scrollPrev()}
                                        disabled={!canInvestPrev}
                                        className="disabled:pointer-events-auto"
                                    >
                                        <ArrowLeft className="size-4" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        onClick={() => investApi?.scrollNext()}
                                        disabled={!canInvestNext}
                                        className="disabled:pointer-events-auto"
                                    >
                                        <ArrowRight className="size-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="w-full">
                                <Carousel
                                    setApi={setInvestApi}
                                    opts={{
                                        align: "start",
                                        breakpoints: { "(max-width: 768px)": { dragFree: true } },
                                    }}
                                    className="relative -mx-1"
                                >
                                    <CarouselContent className="-ml-4 pl-1">
                                        {myInvestments.map((fund) => (
                                            <CarouselItem key={fund.id} className="pl-4 basis-[82%] sm:basis-1/2 lg:basis-1/3 xl:basis-1/4">
                                                <FundCard fund={fund} />
                                            </CarouselItem>
                                        ))}
                                    </CarouselContent>
                                </Carousel>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-xl border border-dashed border-border/50 bg-card/50">
                            <div className="p-4 rounded-full bg-primary/10 text-primary">
                                <ArrowUpRight className="h-8 w-8" />
                            </div>
                            <h3 className="text-xl font-semibold">Your Investments</h3>
                            <p className="text-muted-foreground max-w-md">
                                You haven&apos;t invested in any funds yet. Browse the discovery tab to find funds that match your risk appetite.
                            </p>
                            <Button onClick={() => setActiveTab("discovery")}>
                                Discover Funds
                            </Button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="manager">
                    {isCreatingFund ? (
                        <CreateFundForm onSubmit={handleCreateFund} onCancel={() => setIsCreatingFund(false)} />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 rounded-xl border border-dashed border-border/50 bg-card/50">
                            <div className="p-4 rounded-full bg-primary/10 text-primary">
                                <TrendingUp className="h-8 w-8" />
                            </div>
                            <h3 className="text-xl font-semibold">Become a Fund Manager</h3>
                            <p className="text-muted-foreground max-w-md">
                                Create your own public fund, attract investors, and earn performance fees on your trading success.
                            </p>
                            <Button onClick={() => setIsCreatingFund(true)}>
                                Create a Fund
                            </Button>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Invest Dialog */}
            <Dialog open={isInvestModalOpen} onOpenChange={setIsInvestModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Invest in {selectedFund?.name}</DialogTitle>
                        <DialogDescription>
                            Enter the amount you wish to invest. Current AUM: ${selectedFund?.aum.toLocaleString()}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <span className="text-right text-sm font-medium">Amount</span>
                            <Input
                                id="amount"
                                type="number"
                                placeholder="1000"
                                className="col-span-3"
                                value={investAmount}
                                onChange={(e) => setInvestAmount(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsInvestModalOpen(false)}>Cancel</Button>
                        <Button onClick={confirmInvestment} disabled={!investAmount}>Confirm Investment</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <FundDetailsDialog
                fund={selectedFund}
                isOpen={!!selectedFund && !isInvestModalOpen && isDetailOpen}
                onClose={() => setIsDetailOpen(false)}
                onInvest={(fund) => {
                    setIsDetailOpen(false);
                    handleInvestClick(fund);
                }}
            />
        </div>
    );
}
