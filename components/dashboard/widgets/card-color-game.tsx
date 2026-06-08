"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useRouletteStore } from "@/store/roulette-store";
import { Trophy } from "lucide-react";

/* ───────── Card data ───────── */

type Suit = "hearts" | "diamonds" | "spades" | "clubs";
type CardValue = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

interface PlayingCard {
    suit: Suit;
    value: CardValue;
    color: "red" | "black";
}

const SUITS: Suit[] = ["hearts", "diamonds", "spades", "clubs"];
const VALUES: CardValue[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const SUIT_SYMBOLS: Record<Suit, string> = {
    hearts: "\u2665",
    diamonds: "\u2666",
    spades: "\u2660",
    clubs: "\u2663",
};

function getRandomCard(): PlayingCard {
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    const value = VALUES[Math.floor(Math.random() * VALUES.length)];
    const color: "red" | "black" = suit === "hearts" || suit === "diamonds" ? "red" : "black";
    return { suit, value, color };
}

/* ───────── Component ───────── */

export function CardColorGame() {
    const { totalPoints, recordResult } = useRouletteStore();
    const history = useRouletteStore((s) => s.history);

    const [selectedColor, setSelectedColor] = useState<"red" | "black" | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawnCard, setDrawnCard] = useState<PlayingCard | null>(null);
    const [isFlipped, setIsFlipped] = useState(false);
    const [result, setResult] = useState<{ won: boolean; points: number } | null>(null);
    const [showWinModal, setShowWinModal] = useState(false);

    const handleDraw = useCallback(() => {
        if (!selectedColor || isDrawing) return;

        setIsDrawing(true);
        setResult(null);
        setShowWinModal(false);

        // Draw a random card
        const card = getRandomCard();
        setDrawnCard(card);
        setIsFlipped(false);

        // Flip after a short delay
        setTimeout(() => {
            setIsFlipped(true);
        }, 300);

        // Reveal result after flip animation completes
        setTimeout(() => {
            const won = card.color === selectedColor;
            const points = won ? 2 : 0;

            setResult({ won, points });

            recordResult({
                number: VALUES.indexOf(card.value) + 1,
                color: card.color === "red" ? "red" : "black",
                won,
                pointsEarned: points,
                betType: "color",
                timestamp: Date.now(),
            });

            if (won) {
                setShowWinModal(true);
                setTimeout(() => setShowWinModal(false), 3000);
            }

            setIsDrawing(false);
        }, 900);
    }, [selectedColor, isDrawing, recordResult]);

    const resetRound = () => {
        setDrawnCard(null);
        setIsFlipped(false);
        setResult(null);
        setSelectedColor(null);
    };

    return (
        <div className="flex flex-col gap-4 w-full">
            {/* Card display area */}
            <div className="flex flex-col items-center gap-4">
                {/* The card */}
                <div
                    className="relative"
                    style={{
                        width: 140,
                        height: 196,
                        perspective: "800px",
                    }}
                >
                    <div
                        className="absolute inset-0 transition-transform duration-600"
                        style={{
                            transformStyle: "preserve-3d",
                            transition: "transform 0.6s ease-in-out",
                            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                        }}
                    >
                        {/* Card Back */}
                        <div
                            className="absolute inset-0 rounded-md backface-hidden"
                            style={{
                                backfaceVisibility: "hidden",
                                background: "linear-gradient(135deg, #0d1b35 0%, #1e293b 50%, #0d1b35 100%)",
                                border: "2px solid #1e293b",
                                boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
                            }}
                        >
                            {/* Card back pattern */}
                            <div className="absolute inset-2 rounded-md border border-primary/30 flex items-center justify-center">
                                <div
                                    className="w-16 h-16 rounded-md flex items-center justify-center"
                                    style={{
                                        background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))",
                                        boxShadow: "0 4px 15px hsl(var(--primary) / 0.3)",
                                    }}
                                >
                                    <span className="text-3xl font-black text-white/80">?</span>
                                </div>
                            </div>
                        </div>

                        {/* Card Front */}
                        <div
                            className="absolute inset-0 rounded-md backface-hidden flex flex-col items-center justify-between p-4"
                            style={{
                                backfaceVisibility: "hidden",
                                transform: "rotateY(180deg)",
                                background: "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)",
                                border: `2px solid ${drawnCard?.color === "red" ? "#ff4d4d" : "#0d1b35"}`,
                                boxShadow: drawnCard?.color === "red"
                                    ? "0 8px 30px rgba(255,77,77,0.25)"
                                    : "0 8px 30px rgba(0,0,0,0.2)",
                            }}
                        >
                            {drawnCard && (
                                <>
                                    {/* Top left */}
                                    <div className="self-start flex flex-col items-center leading-tight">
                                        <span
                                            className="text-lg font-black"
                                            style={{ color: drawnCard.color === "red" ? "#ff4d4d" : "#0d1b35" }}
                                        >
                                            {drawnCard.value}
                                        </span>
                                        <span
                                            className="text-sm"
                                            style={{ color: drawnCard.color === "red" ? "#ff4d4d" : "#0d1b35" }}
                                        >
                                            {SUIT_SYMBOLS[drawnCard.suit]}
                                        </span>
                                    </div>

                                    {/* Center suit */}
                                    <span
                                        className="text-5xl"
                                        style={{
                                            color: drawnCard.color === "red" ? "#ff4d4d" : "#0d1b35",
                                            filter: `drop-shadow(0 2px 4px ${drawnCard.color === "red" ? "rgba(255,77,77,0.3)" : "rgba(0,0,0,0.2)"})`,
                                        }}
                                    >
                                        {SUIT_SYMBOLS[drawnCard.suit]}
                                    </span>

                                    {/* Bottom right (inverted) */}
                                    <div className="self-end flex flex-col items-center leading-tight rotate-180">
                                        <span
                                            className="text-lg font-black"
                                            style={{ color: drawnCard.color === "red" ? "#DC2626" : "#1F2937" }}
                                        >
                                            {drawnCard.value}
                                        </span>
                                        <span
                                            className="text-sm"
                                            style={{ color: drawnCard.color === "red" ? "#DC2626" : "#1F2937" }}
                                        >
                                            {SUIT_SYMBOLS[drawnCard.suit]}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Result message under card */}
                {result && (
                    <div
                        className={cn(
                            "text-center px-4 py-2 rounded-md text-xs font-semibold",
                        )}
                        style={{ animation: "roulette-zoom-in 0.3s ease-out" }}
                    >
                        {result.won ? (
                            <span className="text-primary">
                                Correct! <strong className="text-primary">+2 Points</strong>
                            </span>
                        ) : (
                            <span className="text-red-400">
                                Wrong color — Try Again!
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Color Pick */}
            <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Pick a color:</span>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        onClick={() => { if (!isDrawing) { resetRound(); setSelectedColor("red"); } }}
                        disabled={isDrawing}
                        className={cn(
                            "flex items-center justify-center gap-1.5 sm:gap-2 h-11 sm:h-14 rounded-md text-xs sm:text-sm font-bold transition-all border-2",
                            selectedColor === "red"
                                ? "bg-danger text-white border-red-400 ring-2 ring-red-400/40 shadow-lg shadow-red-500/20 scale-[1.03]"
                                : "bg-red-900/40 text-red-200 border-red-700/40 hover:bg-red-800/50"
                        )}
                    >
                        <span className="text-lg">{"\u2665"}</span> Red
                    </button>
                    <button
                        onClick={() => { if (!isDrawing) { resetRound(); setSelectedColor("black"); } }}
                        disabled={isDrawing}
                        className={cn(
                            "flex items-center justify-center gap-1.5 sm:gap-2 h-11 sm:h-14 rounded-md text-xs sm:text-sm font-bold transition-all border-2",
                            selectedColor === "black"
                                ? "bg-neutral-800 text-white border-neutral-600 ring-2 ring-neutral-600/40 shadow-lg shadow-neutral-900/20 scale-[1.03]"
                                : "bg-neutral-900/40 text-neutral-300 border-neutral-700/40 hover:bg-neutral-800/50"
                        )}
                    >
                        <span className="text-lg">{"\u2660"}</span> Black
                    </button>
                </div>
                <p className="text-[10px] text-muted-foreground/70 text-center">
                    Correct color pays <strong className="text-success">+2 points</strong>
                </p>
            </div>

            {/* Draw Button */}
            <button
                onClick={result ? resetRound : handleDraw}
                disabled={isDrawing || (!result && !selectedColor)}
                className={cn(
                    "w-full h-10 sm:h-11 rounded-md text-xs sm:text-sm font-bold transition-all",
                    "flex items-center justify-center gap-2",
                    isDrawing
                        ? "bg-success/50 text-white/70 cursor-not-allowed"
                        : result
                            ? "bg-primary text-white shadow-md shadow-primary/20 active:scale-[0.98]"
                            : selectedColor
                                ? "bg-success hover:bg-success/90 text-white shadow-md shadow-success/20 active:scale-[0.98]"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
            >
                {isDrawing ? (
                    "Drawing..."
                ) : result ? (
                    "New Round"
                ) : (
                    "Draw Card"
                )}
            </button>

            {/* Mini history */}
            {history.filter(h => h.betType === "color").length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground/60 mr-1">Last:</span>
                    {history
                        .filter(h => h.betType === "color")
                        .slice(0, 8)
                        .map((h, i) => (
                            <span
                                key={h.timestamp + "-card-" + i}
                                className={cn(
                                    "inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded text-[9px] font-bold",
                                    h.color === "red"
                                        ? "bg-red-600/80 text-white"
                                        : "bg-gray-600/80 text-white"
                                )}
                            >
                                {h.won ? "\u2713" : "\u2717"}
                            </span>
                        ))}
                </div>
            )}

            {/* Win Modal */}
            {showWinModal && result?.won && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
                    onClick={() => setShowWinModal(false)}
                >
                    <div
                        className="relative flex flex-col items-center gap-3 rounded-md px-10 py-8 shadow-2xl"
                        style={{
                            animation: "roulette-zoom-in 0.5s ease-out",
                            background: "linear-gradient(135deg, #0d1b35 0%, #1e293b 50%, #0d1b35 100%)",
                            boxShadow: "0 0 60px hsl(var(--primary) / 0.2), 0 0 120px hsl(var(--primary) / 0.05)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Trophy */}
                        <div
                            className="flex items-center justify-center rounded-full"
                            style={{
                                width: 64,
                                height: 64,
                                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                                boxShadow: "0 0 30px rgba(245,158,11,0.4)",
                            }}
                        >
                            <Trophy className="h-8 w-8 text-white" />
                        </div>

                        <h3 className="text-xl font-black text-white tracking-tight">You Win!</h3>
                        <p className="text-3xl font-black text-primary">+2 Points!</p>
                        <p className="text-xs text-primary/60 mt-1">
                            Total: {totalPoints} points
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
