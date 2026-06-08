"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { User, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useToastStore } from "@/store/toast-store";
import type { AuthUser } from "@/lib/auth/types";

interface ProfileDropdownProps {
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLElement>;
    user: AuthUser | null;
    onLogout: () => Promise<void>;
}

export function ProfileDropdown({ isOpen, onClose, anchorRef, user, onLogout }: ProfileDropdownProps) {
    const [mounted, setMounted] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, right: 0 });
    const { addToast } = useToastStore();

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen && anchorRef.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 12,
                right: window.innerWidth - rect.right,
            });
        }
    }, [isOpen, anchorRef]);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                anchorRef.current &&
                !anchorRef.current.contains(event.target as Node)
            ) {
                onClose();
            }
        };

        window.addEventListener("mousedown", handleClickOutside);
        return () => window.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onClose, anchorRef]);

    const initials = user?.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "U";

    const handleLogout = async () => {
        onClose();
        await onLogout();
        addToast("You have been successfully logged out.", "success");
    };

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    style={{
                        top: position.top,
                        right: position.right
                    }}
                    className="fixed z-[9999] w-72 rounded-3xl border border-border/50 bg-card/95 shadow-fintech-xl backdrop-blur-xl overflow-hidden"
                >
                    {/* User Header */}
                    <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3.5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-md shadow-primary/20">
                            {initials}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <h4 className="truncate text-sm font-bold text-foreground">
                                {user?.name ?? "User"}
                            </h4>
                            <p className="truncate text-xs text-muted-foreground">
                                {user?.email ?? "unknown"}
                            </p>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div className="p-1.5">
                        <Link
                            href="/dashboard/profile"
                            onClick={onClose}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted/60"
                        >
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                                <User className="h-3.5 w-3.5 text-primary" />
                            </div>
                            User Profile
                        </Link>
                    </div>

                    <div className="border-t border-border/30 p-1.5">
                        <button
                            onClick={() => {
                                void handleLogout();
                            }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-danger transition-all hover:bg-danger/10"
                        >
                            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-danger/10">
                                <LogOut className="h-3.5 w-3.5" />
                            </div>
                            Logout
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
