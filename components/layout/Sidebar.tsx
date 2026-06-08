"use client";

import { useState, useEffect, useRef, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Wallet,
    Users,
    Layers,
    BookOpen,
    Handshake,
    Globe,
    ChevronLeft,
    ChevronRight,
    X,
    ChevronDown,
    LineChart,
    Settings,
    Heart,
    Copy,
    TrendingUp,
    Calculator,
    GraduationCap,
    Trophy,
    FileText,
    UserPlus,
    Server,
    Crown,
    Bell,
    ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const DiscordIcon = ({ size = 20, className = "" }: { size?: number | string; className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 127.14 96.36"
        fill="currentColor"
        className={className}
    >
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.31,60,73.31,53s5-12.74,11.43-12.74S96.2,46,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
);

const CandleIcon = ({ size = 20, className = "" }: { size?: number | string; className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M9 5v4" />
        <rect x="7" y="9" width="4" height="6" rx="1" />
        <path d="M9 15v4" />
        <path d="M17 3v2" />
        <rect x="15" y="5" width="4" height="8" rx="1" />
        <path d="M17 13v8" />
    </svg>
);

interface SidebarProps {
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
}

type SidebarIcon = ComponentType<{ size?: number | string; className?: string }>;

interface SidebarSubItem {
    name: string;
    path: string;
}

interface SidebarItem {
    name: string;
    icon: SidebarIcon;
    path?: string;
    subItems?: SidebarSubItem[];
}

interface SidebarGroup {
    title?: string;
    items: SidebarItem[];
}

const dockIconBase =
    "relative flex h-9 w-9 items-center justify-center rounded-xl ring-1 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.06] hover:shadow-md";
const dockIconIdle =
    "bg-gradient-to-b from-muted/50 to-muted/80 dark:from-neutral-800/60 dark:to-neutral-900/75 ring-border/30 dark:ring-white/10 hover:ring-border/50 dark:hover:ring-white/20";
const dockIconActive =
    "bg-primary text-primary-foreground ring-primary/30 shadow-primary/15 shadow-md";

export function Sidebar({ sidebarOpen, setSidebarOpen }: SidebarProps) {
    const pathname = usePathname();
    const [isMobile, setIsMobile] = useState(false);
    const [hoverOpen, setHoverOpen] = useState(false);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // eff = the sidebar behaves as "open" when either pinned open or hover-expanded
    const eff = sidebarOpen || hoverOpen;

    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => ({
        "Trading": !!(pathname?.startsWith("/trading/") || pathname === "/accounts"),
        "Payments & Wallet": !!(pathname?.startsWith("/wallet/") && pathname !== "/wallet"),
        "Analytics": !!pathname?.startsWith("/analytics/"),
        "Markets": !!pathname?.startsWith("/markets"),
        "Tools": !!pathname?.startsWith("/tools/"),
        "Settings": !!pathname?.startsWith("/settings/"),
    }));
    const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

    const toggleMenu = (name: string) => {
        setOpenMenus((prev) => ({ ...prev, [name]: !prev[name] }));
    };

    const menuGroups: SidebarGroup[] = [
        {
            items: [
                { name: "Dashboard", path: "/", icon: LayoutDashboard },
                { name: "Wallet", path: "/wallet", icon: Wallet },
                {
                    name: "Trading",
                    icon: CandleIcon,
                    subItems: [
                        { name: "My accounts", path: "/accounts" },
                        { name: "Performance", path: "/trading/performance" },
                        { name: "History of orders", path: "/trading/history" },
                    ],
                },
                {
                    name: "Payments & Wallet",
                    icon: Wallet,
                    subItems: [
                        { name: "Deposits", path: "/wallet/deposits" },
                        { name: "Withdrawal", path: "/wallet/withdrawals" },
                        { name: "Internal Transfer", path: "/wallet/transfers" },
                        { name: "Transaction History", path: "/wallet/history" },
                        { name: "Crypto Wallets", path: "/wallet/crypto" },
                    ],
                },
                {
                    name: "Analytics",
                    icon: LineChart,
                    subItems: [
                        { name: "Analyst Views", path: "/analytics/analyst-views" },
                        { name: "Market News", path: "/analytics/market-news" },
                        { name: "Economic Calendar", path: "/analytics/economic-calendar" },
                        { name: "Trading Signals", path: "/analytics/trading-signals" },
                    ],
                },
                {
                    name: "Markets",
                    icon: TrendingUp,
                    subItems: [
                        { name: "Overview", path: "/markets" },
                        { name: "Forex", path: "/markets/forex" },
                        { name: "Stocks", path: "/markets/stocks" },
                        { name: "Crypto", path: "/markets/crypto" },
                        { name: "Commodities", path: "/markets/commodities" },
                        { name: "Indices", path: "/markets/indices" },
                    ],
                },
                {
                    name: "Tools",
                    icon: Calculator,
                    subItems: [
                        { name: "Trading Calculator", path: "/tools/calculator" },
                        { name: "Currency Converter", path: "/tools/converter" },
                        { name: "Tick History", path: "/tools/tick-history" },
                    ],
                },
            ],
        },
        {
            title: "Trading & Finance",
            items: [
                { name: "Social Trading", path: "/social", icon: Users },
                { name: "Copy Trading", path: "/copy-trading", icon: Copy },
                { name: "Money Management", path: "/money-management", icon: Layers },
                { name: "Conversion Rates", path: "/conversion-rates", icon: ArrowRightLeft },
            ],
        },
        {
            title: "Tools & Platforms",
            items: [
                { name: "Trading Terminal", path: "/terminal", icon: CandleIcon },
                { name: "Platforms", path: "/platforms", icon: Globe },
                { name: "VPS Hosting", path: "/vps", icon: Server },
                { name: "Premium", path: "/premium", icon: Crown },
            ],
        },
        {
            title: "Resources & Education",
            items: [
                { name: "FxTrusts Journal", path: "/journal", icon: BookOpen },
                { name: "Education", path: "/education", icon: GraduationCap },
                { name: "Conditions", path: "/conditions", icon: FileText },
            ],
        },
        {
            title: "Community & Growth",
            items: [
                { name: "Partner Dashboard", path: "/partner-dashboard", icon: Handshake },
                { name: "Invite Friends", path: "/invite-friends", icon: UserPlus },
                { name: "Rewards", path: "/rewards", icon: Trophy },
                { name: "Join Discord", path: "https://discord.com/", icon: DiscordIcon },
            ],
        },
        {
            title: "System & Support",
            items: [
                { name: "Support Hub", path: "/support", icon: Heart },
                { name: "Notifications", path: "/notifications", icon: Bell },
                {
                    name: "Settings",
                    icon: Settings,
                    subItems: [
                        { name: "Account Settings", path: "/account-settings" },
                        { name: "Profile", path: "/settings/profile" },
                        { name: "Security", path: "/settings/security" },
                        { name: "Trading Terminal", path: "/settings/trading-terminal" },
                    ],
                },
            ],
        },
    ];

    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (mobile) setSidebarOpen(false);
            else setSidebarOpen(true);
        };
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, [setSidebarOpen]);

    const closeSidebarOnMobile = () => {
        if (isMobile) setSidebarOpen(false);
    };

    // Close hover-expand with a short delay so mouse can travel into the sidebar
    const startHoverClose = () => {
        hoverTimeoutRef.current = setTimeout(() => setHoverOpen(false), 150);
    };
    const cancelHoverClose = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };

    return (
        <TooltipProvider delayDuration={0}>
            {sidebarOpen && isMobile && (
                <div
                    onClick={() => setSidebarOpen(false)}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                />
            )}

            <aside
                onMouseLeave={() => { if (!sidebarOpen) startHoverClose(); }}
                onMouseEnter={cancelHoverClose}
                className={cn(
                    "border-r border-border/40 dark:border-white/[0.06] transition-all duration-300 flex flex-col fixed lg:relative h-full z-50 overflow-hidden",
                    "bg-card/95 dark:bg-neutral-950/95 backdrop-blur-xl shadow-2xl shadow-black/5 dark:shadow-black/40",
                    isMobile
                        ? sidebarOpen ? "w-64" : "w-0"
                        : eff ? "w-64" : "w-[62px]",
                    isMobile && !sidebarOpen ? "-translate-x-full" : "translate-x-0"
                )}
            >
                {/* ── Logo / Toggle header ── */}
                <div className="px-4 py-2 border-b border-border/30 dark:border-white/[0.05] flex items-center justify-between h-[80px] shrink-0">
                    {eff ? (
                        <Link href="/" className="flex min-w-0 items-center">
                            <img
                                src="/assets/logo_white.png"
                                alt="FxTrusts Logo"
                                className="hidden dark:block h-[60px] w-auto ml-2"
                            />
                            <img
                                src="/assets/logo.png"
                                alt="FxTrusts Logo"
                                className="block dark:hidden h-[60px] w-auto ml-2"
                            />
                        </Link>
                    ) : (
                        <Link href="/" className="mx-auto flex items-center justify-center">
                            <img
                                src="/assets/logo-small-dark.png"
                                alt="FxTrusts"
                                className="hidden dark:block h-8 w-8 object-contain"
                            />
                            <img
                                src="/assets/logo-small-light.png"
                                alt="FxTrusts"
                                className="block dark:hidden h-8 w-8 object-contain"
                            />
                        </Link>
                    )}

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setSidebarOpen(!sidebarOpen); setHoverOpen(false); }}
                                className={cn(
                                    "hidden lg:flex h-9 w-9 rounded-xl ring-1 ring-border/30 dark:ring-white/10",
                                    "dark:bg-gradient-to-b dark:from-neutral-800/60 dark:to-neutral-900/70",
                                    "hover:-translate-y-0.5 hover:scale-[1.06] hover:ring-border/50 dark:hover:ring-white/20 hover:shadow-md transition-all duration-200"
                                )}
                            >
                                {eff ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                            </Button>
                        </TooltipTrigger>
                        {!eff && (
                            <TooltipContent side="right">Expand sidebar</TooltipContent>
                        )}
                    </Tooltip>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden h-9 w-9 rounded-xl"
                    >
                        <X size={18} />
                    </Button>
                </div>

                {/* ── Navigation ── */}
                <nav
                    className={cn(
                        "flex-1 overflow-y-auto overflow-x-hidden scrollbar-none",
                        eff ? "p-3 space-y-1" : "p-2 py-4 space-y-1.5 flex flex-col items-center"
                    )}
                >
                    {menuGroups.map((group, groupIndex) => {
                        // In collapsed (non-hover) mode, hide sub-section groups
                        if (!eff && group.title) return null;
                        return (
                            <div
                                key={group.title || `group-${groupIndex}`}
                                className={cn("space-y-0.5", !eff && "w-full flex flex-col items-center gap-0.5")}
                            >
                                {/* Group header */}
                                {group.title && (
                                    <div className="pt-1.5">
                                        {eff ? (
                                            <button
                                                onClick={() =>
                                                    setCollapsedSections((prev) => ({
                                                        ...prev,
                                                        [group.title!]: !prev[group.title!],
                                                    }))
                                                }
                                                className="flex w-full items-center justify-between px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                                            >
                                                <span>{group.title}</span>
                                                <ChevronDown
                                                    size={11}
                                                    className={cn(
                                                        "transition-transform duration-200",
                                                        collapsedSections[group.title!] && "-rotate-90"
                                                    )}
                                                />
                                            </button>
                                        ) : (
                                            <div className="w-7 border-b border-border/40 dark:border-white/8 my-1 mx-auto" />
                                        )}
                                    </div>
                                )}

                                {/* Items */}
                                {(!group.title || !collapsedSections[group.title]) &&
                                    group.items.map((item, index) => {
                                        const isExternal = item.path?.startsWith("http");
                                        const isActive =
                                            item.path === "/" || item.path === "/wallet"
                                                ? pathname === item.path
                                                : !isExternal && item.path
                                                  ? pathname?.startsWith(item.path)
                                                  : false;
                                        const hasActiveSubItem = item.subItems?.some((sub) =>
                                            pathname?.startsWith(sub.path)
                                        );

                                        /* ── Items with sub-menus ── */
                                        if (item.subItems) {
                                            if (!eff) {
                                                return (
                                                    <Tooltip key={item.name}>
                                                        <TooltipTrigger asChild>
                                                            <button
                                                                onClick={() => {
                                                                    setSidebarOpen(true);
                                                                    setHoverOpen(false);
                                                                    toggleMenu(item.name);
                                                                }}
                                                                className={cn(
                                                                    dockIconBase,
                                                                    hasActiveSubItem ? dockIconActive : dockIconIdle
                                                                )}
                                                            >
                                                                <item.icon size={17} className="shrink-0" />
                                                            </button>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right">{item.name}</TooltipContent>
                                                    </Tooltip>
                                                );
                                            }

                                            return (
                                                <div key={item.name} className="flex flex-col gap-0.5">
                                                    <button
                                                        onClick={() => toggleMenu(item.name)}
                                                        className={cn(
                                                            "flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 text-sm w-full",
                                                            hasActiveSubItem
                                                                ? "bg-primary/10 dark:bg-primary/12 text-primary"
                                                                : "hover:bg-accent/70 dark:hover:bg-neutral-800/50 hover:text-accent-foreground"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <item.icon size={18} className="shrink-0" />
                                                            <span>{item.name}</span>
                                                        </div>
                                                        <ChevronDown
                                                            size={14}
                                                            className={cn(
                                                                "text-muted-foreground/50 transition-transform duration-200",
                                                                openMenus[item.name] && "rotate-180"
                                                            )}
                                                        />
                                                    </button>

                                                    {openMenus[item.name] && (
                                                        <div className="flex flex-col pl-8 pr-1 pb-0.5 gap-0">
                                                            {item.subItems.map((subItem) => {
                                                                const isSubActive = pathname === subItem.path;
                                                                return (
                                                                    <Link
                                                                        key={subItem.path}
                                                                        href={subItem.path}
                                                                        onClick={() => { closeSidebarOnMobile(); setHoverOpen(false); }}
                                                                        className={cn(
                                                                            "px-3 py-1.5 rounded-lg text-[12.5px] transition-all duration-150",
                                                                            isSubActive
                                                                                ? "text-primary font-medium bg-primary/8 dark:bg-primary/10"
                                                                                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                                                                        )}
                                                                    >
                                                                        {subItem.name}
                                                                    </Link>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        }

                                        /* ── Leaf items — collapsed (dock icon) ── */
                                        if (!eff) {
                                            const trigger = isExternal ? (
                                                <a
                                                    href={item.path || "#"}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={cn(dockIconBase, isActive ? dockIconActive : dockIconIdle)}
                                                >
                                                    <item.icon size={17} className="shrink-0" />
                                                </a>
                                            ) : (
                                                <Link
                                                    href={item.path || "#"}
                                                    onClick={closeSidebarOnMobile}
                                                    className={cn(dockIconBase, isActive ? dockIconActive : dockIconIdle)}
                                                >
                                                    <item.icon size={17} className="shrink-0" />
                                                </Link>
                                            );

                                            return (
                                                <Tooltip key={item.path || index}>
                                                    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                                                    <TooltipContent side="right">{item.name}</TooltipContent>
                                                </Tooltip>
                                            );
                                        }

                                        /* ── Leaf items — expanded ── */
                                        const expandedClasses = cn(
                                            "flex items-center gap-2.5 rounded-xl transition-all duration-200",
                                            group.title ? "px-3 py-1.5 text-[13px]" : "px-3 py-2 text-sm",
                                            isActive
                                                ? "bg-primary text-primary-foreground shadow-sm"
                                                : group.title
                                                  ? "text-muted-foreground hover:text-foreground hover:bg-accent/50 dark:hover:bg-neutral-800/40"
                                                  : "hover:bg-accent/70 dark:hover:bg-neutral-800/50 hover:text-accent-foreground"
                                        );

                                        if (isExternal) {
                                            return (
                                                <a
                                                    key={item.path || index}
                                                    href={item.path || "#"}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={() => { closeSidebarOnMobile(); setHoverOpen(false); }}
                                                    className={expandedClasses}
                                                >
                                                    <item.icon size={group.title ? 15 : 18} className="shrink-0" />
                                                    <span>{item.name}</span>
                                                </a>
                                            );
                                        }

                                        return (
                                            <Link
                                                key={item.path || index}
                                                href={item.path || "#"}
                                                onClick={() => { closeSidebarOnMobile(); setHoverOpen(false); }}
                                                className={expandedClasses}
                                            >
                                                <item.icon size={group.title ? 15 : 18} className="shrink-0" />
                                                <span>{item.name}</span>
                                            </Link>
                                        );
                                    })}
                            </div>
                        );
                    })}

                    {/* ── "···" button — only in truly collapsed state ── */}
                    {!eff && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onMouseEnter={() => { cancelHoverClose(); setHoverOpen(true); }}
                                    className={cn(
                                        dockIconBase,
                                        dockIconIdle,
                                        "mt-auto text-muted-foreground font-bold tracking-widest"
                                    )}
                                    aria-label="More sections"
                                >
                                    ···
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right">More</TooltipContent>
                        </Tooltip>
                    )}
                </nav>
            </aside>
        </TooltipProvider>
    );
}
