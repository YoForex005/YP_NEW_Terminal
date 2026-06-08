"use client";

import { useState } from "react";
import { History, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function MySubscriptions() {
    const [activeTab, setActiveTab] = useState<"active" | "history">("active");

    return (
        <div className="space-y-6">
            {/* Tab Controls */}
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                <Button
                    variant={activeTab === "active" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab("active")}
                    className={cn(
                        "rounded-md px-4 font-bold transition-all",
                        activeTab === "active"
                            ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20"
                            : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                >
                    Active (0)
                </Button>
                <Button
                    variant={activeTab === "history" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveTab("history")}
                    className={cn(
                        "rounded-md px-4 font-bold border-0 transition-all",
                        activeTab === "history"
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                            : "bg-card text-slate-500 hover:bg-muted dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 border border-border"
                    )}
                >
                    History
                </Button>
            </div>

            {/* Content Area */}
            <div className="min-h-[400px] bg-card rounded-2xl border border-border p-8 flex items-center justify-center">
                <AnimatePresence mode="wait">
                    {activeTab === "active" ? (
                        <motion.div
                            key="active-empty"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex flex-col items-center justify-center text-center max-w-md"
                        >
                            <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                                <TrendingUp className="h-8 w-8 text-slate-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                No Active Subscriptions
                            </h3>
                            <p className="text-slate-500 dark:text-slate-400">
                                You do not have any active subscriptions. Browse the Discover Traders tab to find traders to follow.
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="history-empty"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex flex-col items-center justify-center text-center max-w-md"
                        >
                            <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                                <History className="h-8 w-8 text-slate-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                No Subscription History
                            </h3>
                            <p className="text-slate-500 dark:text-slate-400">
                                You have not subscribed to any strategies yet. Past subscriptions will appear here.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
