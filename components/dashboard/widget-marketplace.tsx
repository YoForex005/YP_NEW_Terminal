"use client";

import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WIDGET_META } from "@/lib/dashboard/widget-catalog";
import { cn } from "@/lib/utils";
import type { WidgetId } from "@/types/dashboard";

interface WidgetMarketplaceProps {
    onToggle: (widgetId: WidgetId) => void;
    activeWidgets: WidgetId[];
}

const CATEGORY_COLORS: Record<string, string> = {
    account: "bg-primary/10 text-primary",
    market: "bg-primary/10 text-primary",
    trading: "bg-success/10 text-success",
    tools: "bg-warning/10 text-warning",
};

export function WidgetMarketplace({ onToggle, activeWidgets }: WidgetMarketplaceProps) {
    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Widget Marketplace</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {(Object.entries(WIDGET_META) as [WidgetId, typeof WIDGET_META[WidgetId]][]).map(
                    ([id, meta]) => {
                        const isActive = activeWidgets.includes(id);

                        return (
                            <Card
                                key={id}
                                className={cn(
                                    "group relative overflow-hidden transition-all hover:shadow-md cursor-pointer border",
                                    isActive
                                        ? "border-success bg-success/5"
                                        : "border-border hover:border-success/50"
                                )}
                                onClick={() => onToggle(id)}
                            >
                                <div className="p-5 space-y-4">
                                    <div className="flex items-start justify-between">
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                                                CATEGORY_COLORS[meta.category] || "bg-slate-100 text-slate-700"
                                            )}
                                        >
                                            {meta.category}
                                        </Badge>
                                        <div className="flex items-center justify-center">
                                            {isActive ? (
                                                <div className="h-6 w-6 rounded-full bg-success text-white flex items-center justify-center shadow-sm">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                            ) : (
                                                <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center group-hover:border-success/50 transition-colors">
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-semibold leading-none tracking-tight mb-2 text-base">
                                            {meta.title}
                                        </h3>
                                        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5em]">
                                            {meta.description}
                                        </p>
                                    </div>

                                    <div className="pt-2 flex items-center justify-between border-t border-border/50">
                                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                            Size: {meta.size}
                                        </span>
                                    </div>
                                </div>
                            </Card>
                        );
                    }
                )}
            </div>
        </div>
    );
}
