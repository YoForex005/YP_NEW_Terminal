"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, Trash2, X, Info, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationStore, Notification } from "@/store/notification-store";
import { cn } from "@/lib/utils";

interface NotificationsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
        case "success": return <CheckCircle2 className="h-4 w-4 text-success" />;
        case "error": return <AlertCircle className="h-4 w-4 text-danger" />;
        case "info": return <Info className="h-4 w-4 text-primary" />;
        case "warning": return <AlertTriangle className="h-4 w-4 text-warning" />;
        default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
};

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
    const { notifications, markAllAsRead, clearAll, markAsRead } = useNotificationStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    // We use a Portal to render the notification panel at the body level.
    // This ensures it is truly "outside" any containers and "over" all elements.
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-[2px]"
                    />

                    {/* Floating Panel Overlay */}
                    <motion.div
                        initial={{ x: "100%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 220 }}
                        className="fixed right-0 top-0 bottom-0 sm:right-4 sm:top-4 sm:bottom-4 z-[10000] flex w-full max-w-full sm:max-w-[400px] flex-col overflow-hidden sm:rounded-[2rem] border-l sm:border sm:border-border/50 bg-card/95 shadow-2xl backdrop-blur-xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-6 py-5">
                            <div>
                                <h3 className="text-lg font-black tracking-tight text-foreground uppercase">Notifications</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                    Alerts & Platform Updates
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="rounded-full bg-muted/50 p-2 text-muted-foreground transition-all hover:bg-muted hover:text-foreground hover:scale-110 active:scale-95"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between border-b border-border/30 bg-muted/10 px-6 py-3">
                            <button
                                onClick={() => markAllAsRead()}
                                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-success transition-colors hover:text-success/80"
                            >
                                <Check className="h-3 w-3" />
                                Mark all as read
                            </button>
                            <button
                                onClick={() => clearAll()}
                                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-danger transition-colors hover:text-danger/80"
                            >
                                <Trash2 className="h-3 w-3" />
                                Clear all
                            </button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                            {notifications.length === 0 ? (
                                <div className="flex h-full flex-col items-center justify-center space-y-4 text-center">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground/20">
                                        <Bell className="h-8 w-8" />
                                    </div>
                                    <p className="max-w-[150px] text-[10px] font-black uppercase leading-relaxed tracking-widest text-muted-foreground/40">
                                        You are all caught up!
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {notifications.map((n) => (
                                        <div
                                            key={n.id}
                                            onClick={() => markAsRead(n.id)}
                                            className={cn(
                                                "group relative cursor-pointer rounded-xl border border-transparent p-4 transition-all hover:bg-muted/50 hover:border-border/50",
                                                !n.isRead && "border-success/20 bg-success/[0.03]"
                                            )}
                                        >
                                            <div className="flex gap-4">
                                                <span className="mt-1 shrink-0">{getNotificationIcon(n.type)}</span>
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className={cn(
                                                            "text-[13px] font-bold leading-none tracking-tight",
                                                            !n.isRead ? "text-foreground" : "text-muted-foreground"
                                                        )}>
                                                            {n.title}
                                                        </h4>
                                                        {!n.isRead && (
                                                            <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px_rgba(37,184,101,0.6)]" />
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] font-medium leading-relaxed text-muted-foreground/70 line-clamp-2">
                                                        {n.message}
                                                    </p>
                                                    <p className="pt-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground/30">
                                                        {new Intl.DateTimeFormat("en-GB", {
                                                            day: "2-digit",
                                                            month: "2-digit",
                                                            year: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            hour12: false,
                                                        }).format(new Date(n.timestamp))}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer / App Info */}
                        <div className="border-t border-border/30 bg-muted/5 px-6 py-4">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 text-center">
                                Yopips Web Terminal v1.0.4
                            </p>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
