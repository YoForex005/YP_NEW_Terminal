"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { useToastStore, type ToastType } from "@/store/toast-store";

const iconMap: Record<ToastType, typeof CheckCircle2> = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
};

const colorMap: Record<ToastType, string> = {
    success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    error: "bg-rose-500/10 border-rose-500/30 text-rose-400",
    info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
};

const iconColorMap: Record<ToastType, string> = {
    success: "text-primary",
    error: "text-rose-500",
    info: "text-blue-500",
};

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => {
                    const Icon = iconMap[toast.type];
                    return (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 100, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${colorMap[toast.type]}`}
                        >
                            <Icon className={`h-5 w-5 ${iconColorMap[toast.type]}`} />
                            <p className="text-sm font-semibold">{toast.message}</p>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="ml-2 rounded-md p-1 transition-colors hover:bg-black/5"
                                aria-label="Dismiss"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
