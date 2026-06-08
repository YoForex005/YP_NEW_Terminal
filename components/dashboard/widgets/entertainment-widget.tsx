"use client";

import { useState } from "react";
import { Gamepad2, RotateCcw, CheckSquare, Square } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useRouletteStore } from "@/store/roulette-store";
import { RouletteGame } from "@/components/dashboard/widgets/roulette-game";
import { CardColorGame } from "@/components/dashboard/widgets/card-color-game";
import { CrashGame } from "@/components/dashboard/widgets/crash-game";

export function EntertainmentWidget() {
    const [activeTab, setActiveTab] = useState<"Roulette" | "Card Color" | "Crash">("Roulette");
    const [scoreInHeader, setScoreInHeader] = useState(true);
    const { totalPoints } = useRouletteStore();

    return (
        <Card className="flex h-full flex-col overflow-auto">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5 py-4 pb-2">
                <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                            <Gamepad2 className="h-4 w-4 text-primary" />
                        </div>
                        Entertainment
                    </CardTitle>
                    <p className="pl-[38px] text-xs text-muted-foreground">
                        {scoreInHeader ? (
                            <>
                                Score: <strong className="text-success tabular-nums">{totalPoints} points</strong> |{" "}
                            </>
                        ) : (
                            ""
                        )}
                        Fun games for traders
                    </p>
                </div>
            </CardHeader>

            <CardContent className="flex-1 px-5 pt-2 flex flex-col gap-5">
                {/* Game Tabs */}
                <div className="flex rounded-md bg-muted/60 p-0.5 w-full justify-between">
                    <button
                        onClick={() => setActiveTab("Roulette")}
                        className={cn("flex-1 rounded-md py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all", activeTab === "Roulette" ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "hover:bg-muted text-muted-foreground")}
                    >
                        <RotateCcw className="h-3 w-3" /> Roulette
                    </button>
                    <button
                        onClick={() => setActiveTab("Card Color")}
                        className={cn("flex-1 rounded-md py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all", activeTab === "Card Color" ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "hover:bg-muted text-muted-foreground")}
                    >
                        Card Color
                    </button>
                    <button
                        onClick={() => setActiveTab("Crash")}
                        className={cn("flex-1 rounded-md py-2 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all", activeTab === "Crash" ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" : "hover:bg-muted text-muted-foreground")}
                    >
                        Crash
                    </button>
                </div>

                {activeTab === "Roulette" && <RouletteGame />}
                {activeTab === "Card Color" && <CardColorGame />}
                {activeTab === "Crash" && <CrashGame />}

                <div className="mt-auto pt-4 border-t border-border/30">
                    <div
                        className="flex items-center gap-2 cursor-pointer w-fit"
                        onClick={() => setScoreInHeader(!scoreInHeader)}
                    >
                        {scoreInHeader ? (
                            <div className="bg-primary text-primary-foreground rounded-md h-4 w-4 flex items-center justify-center">
                                <CheckSquare className="h-3 w-3" />
                            </div>
                        ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium text-foreground">Show score in header</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
