"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {

    Menu,
    User,
    CreditCard,
    LogOut,
    ChevronDown,
    Bell,
    Sun,
    Moon,
    Wifi,
    WifiOff
} from "lucide-react";
import { BrandBadge } from "@/components/branding/brand-badge";
import { Button } from "@/components/ui/button";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { useNotificationStore } from "@/store/notification-store";
import { NotificationsPanel } from "@/components/dashboard/notifications-dropdown";

interface NavbarProps {
    onToggleSidebar: () => void;
}

export function Navbar({ onToggleSidebar }: NavbarProps) {
    const router = useRouter();
    const { setTheme, resolvedTheme } = useTheme();
    const { user, logout } = useAuth();
    const { getUnreadCount } = useNotificationStore();


    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsOnline(navigator.onLine);

        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);



    const handleLogout = async () => {
        await logout();
    };

    const userInitials = user?.name
        ? user.name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()
        : "U";

    if (!mounted) return null;

    return (
        <nav className="bg-card border-b border-border sticky top-0 z-40 text-foreground transition-colors duration-300">
            <div className="px-4 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onToggleSidebar}
                            className="lg:hidden text-muted-foreground hover:text-foreground hover:bg-accent"
                            aria-label="Toggle menu"
                        >
                            <Menu size={20} />
                        </Button>

                        <Link href="/" className="flex items-center gap-2 lg:hidden">
                            {resolvedTheme === "dark" ? (
                                <img src="/assets/logo_white.png" alt="FxTrusts Logo" className="h-[40px] w-auto mt-1" />
                            ) : (
                                <img src="/assets/logo.png" alt="FxTrusts Logo" className="h-[40px] w-auto mt-1" />
                            )}
                        </Link>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Network Status */}
                        <div
                            className={cn(
                                "hidden sm:flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                                isOnline
                                    ? "bg-success/20 text-success-foreground border border-success/30 dark:bg-success/10 dark:text-success dark:border-success/15"
                                    : "bg-danger/20 text-danger-foreground border border-danger/30 dark:bg-danger/10 dark:text-danger dark:border-danger/15"
                            )}
                        >
                            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                            <span className="hidden xl:inline text-foreground">{isOnline ? "Connected" : "Offline"}</span>
                        </div>

                        {/* Theme is locked dark to prevent light fallback surfaces. */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTheme("dark")}
                            aria-label="Dark theme enforced"
                            className="text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                        </Button>

                        {/* Notifications */}
                        <div className="relative">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                aria-label="Notifications"
                                className="text-muted-foreground hover:text-foreground hover:bg-accent"
                            >
                                <Bell size={20} />
                                {getUnreadCount() > 0 && (
                                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
                                )}
                            </Button>
                            <NotificationsPanel
                                isOpen={isNotificationsOpen}
                                onClose={() => setIsNotificationsOpen(false)}
                            />
                        </div>

                        {/* User Profile */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-2 px-3 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent">
                                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                                        {userInitials}
                                    </div>
                                    <span className="hidden sm:block text-sm font-medium">{user?.name || "User"}</span>
                                    <ChevronDown size={16} className="hidden sm:block" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>
                                    <p className="text-sm font-medium">{user?.name || "User"}</p>
                                    <p className="text-xs text-muted-foreground font-normal">{user?.email || "user@example.com"}</p>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push("/wallet")}>
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    <span>Wallet</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        void handleLogout();
                                    }} 
                                    className="text-destructive focus:text-destructive cursor-pointer"
                                >
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Logout</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="md:hidden pb-3">

                </div>
            </div>
        </nav>
    );
}
