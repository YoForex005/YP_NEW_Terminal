"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Trophy, X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouletteStore } from "@/store/roulette-store";

/* ───────── European roulette data ───────── */

const WHEEL_NUMBERS = [
    0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
    24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function getColor(n: number): "red" | "black" | "green" {
    if (n === 0) return "green";
    return RED_NUMBERS.has(n) ? "red" : "black";
}

const SEGMENT_ANGLE = 360 / 37;

/* ───────── SVG wheel helpers ───────── */

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
        x: parseFloat((cx + r * Math.cos(rad)).toFixed(4)),
        y: parseFloat((cy + r * Math.sin(rad)).toFixed(4))
    };
}

function describeArc(
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number,
) {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} Z`;
}

/* ───────── Color map ───────── */
const COLOR_HEX: Record<string, string> = {
    red: "#ff4d4d",
    black: "#0d1b35",
    green: "#25b865",
};

/* ───────── Component ───────── */

export function RouletteGame() {
    const { totalPoints, history, recordResult } = useRouletteStore();

    // Bet state
    const [betMode, setBetMode] = useState<"number" | "color">("number");
    const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
    const [selectedColor, setSelectedColor] = useState<"red" | "black" | null>(null);

    // Spin state
    const [isSpinning, setIsSpinning] = useState(false);
    const [wheelRotation, setWheelRotation] = useState(0);
    const [result, setResult] = useState<{
        number: number;
        color: "red" | "black" | "green";
        won: boolean;
        points: number;
    } | null>(null);
    const [showWinModal, setShowWinModal] = useState(false);
    const [showResult, setShowResult] = useState(false);

    const cumulativeRotation = useRef(0);
    const wheelRef = useRef<SVGGElement>(null);

    // Auto-dismiss result
    useEffect(() => {
        if (showResult && result && !result.won) {
            const timer = setTimeout(() => setShowResult(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [showResult, result]);

    // Auto-dismiss win modal
    useEffect(() => {
        if (showWinModal) {
            const timer = setTimeout(() => setShowWinModal(false), 4000);
            return () => clearTimeout(timer);
        }
    }, [showWinModal]);

    const handleSpin = useCallback(() => {
        if (isSpinning) return;
        if (betMode === "number" && selectedNumber === null) return;
        if (betMode === "color" && selectedColor === null) return;

        setIsSpinning(true);
        setResult(null);
        setShowResult(false);
        setShowWinModal(false);

        // Random winning number
        const winIndex = Math.floor(Math.random() * 37);
        const winNumber = WHEEL_NUMBERS[winIndex];
        const winColor = getColor(winNumber);

        // Calculate target rotation so the winning segment lands at the top (marker)
        const targetAngle = winIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
        const fullSpins = 360 * (5 + Math.floor(Math.random() * 3)); // 5-7 full spins

        // Account for current wheel position — the wheel is already rotated
        const currentEffective = cumulativeRotation.current % 360;
        const neededAngle = ((360 - targetAngle) - currentEffective + 360) % 360;
        const totalRotation = fullSpins + neededAngle;

        cumulativeRotation.current += totalRotation;
        setWheelRotation(cumulativeRotation.current);

        // After animation ends
        setTimeout(() => {
            let won = false;
            let points = 0;

            if (betMode === "number") {
                won = selectedNumber === winNumber;
                points = won ? 35 : 0;
            } else {
                won = winColor === selectedColor;
                points = won ? 2 : 0;
            }

            const resultObj = { number: winNumber, color: winColor, won, points };
            setResult(resultObj);
            setShowResult(true);

            recordResult({
                number: winNumber,
                color: winColor,
                won,
                pointsEarned: points,
                betType: betMode,
                timestamp: Date.now(),
            });

            if (won) {
                setShowWinModal(true);
            }

            setIsSpinning(false);
        }, 4200);
    }, [isSpinning, betMode, selectedNumber, selectedColor, recordResult]);

    /* ───────── Render wheel segments ───────── */
    const CX = 150,
        CY = 150,
        R = 130;

    const segments = WHEEL_NUMBERS.map((num, i) => {
        const startAngle = i * SEGMENT_ANGLE;
        const endAngle = startAngle + SEGMENT_ANGLE;
        const midAngle = startAngle + SEGMENT_ANGLE / 2;
        const color = getColor(num);
        const labelPos = polarToCartesian(CX, CY, R * 0.78, midAngle);

        return (
            <g key={num + "-" + i}>
                <path
                    d={describeArc(CX, CY, R, startAngle, endAngle)}
                    fill={COLOR_HEX[color]}
                    stroke="#2A2A2A"
                    strokeWidth="0.5"
                />
                <text
                    x={labelPos.x}
                    y={labelPos.y}
                    fill="white"
                    fontSize="9"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${midAngle}, ${labelPos.x}, ${labelPos.y})`}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                >
                    {num}
                </text>
            </g>
        );
    });

    /* ───────── Number grid for bet ───────── */
    const gridNumbers = Array.from({ length: 37 }, (_, i) => i);

    const hasBet =
        (betMode === "number" && selectedNumber !== null) ||
        (betMode === "color" && selectedColor !== null);

    return (
        <div className="flex flex-col gap-3 sm:gap-4 w-full">
            {/* Game Area */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-center sm:items-start">

                {/* ────── Wheel ────── */}
                <div className="relative shrink-0 flex items-center justify-center w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] md:w-[260px] md:h-[260px]">
                    {/* Outer chrome ring */}
                    <div
                        className="absolute rounded-full w-full h-full"
                        style={{
                            background: "conic-gradient(from 0deg, #888 0%, #ccc 25%, #888 50%, #ccc 75%, #888 100%)",
                            boxShadow: "0 0 20px rgba(0,0,0,0.4), inset 0 0 10px rgba(0,0,0,0.2)",
                        }}
                    />

                    {/* SVG Wheel */}
                    <svg viewBox="0 0 300 300" className="relative z-[1] w-[185px] h-[185px] sm:w-[225px] sm:h-[225px] md:w-[240px] md:h-[240px]">
                        <defs>
                            <filter id="wheelShadow">
                                <feDropShadow dx="0" dy="0" stdDeviation="3" floodOpacity="0.4" />
                            </filter>
                            <radialGradient id="hubGrad" cx="50%" cy="40%" r="50%">
                                <stop offset="0%" stopColor="#F59E0B" />
                                <stop offset="100%" stopColor="#B45309" />
                            </radialGradient>
                        </defs>

                        {/* Rotating wheel group */}
                        <g
                            ref={wheelRef}
                            style={{
                                transformOrigin: `${CX}px ${CY}px`,
                                transform: `rotate(${wheelRotation}deg)`,
                                transition: isSpinning
                                    ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                                    : "none",
                            }}
                            filter="url(#wheelShadow)"
                        >
                            {/* Outer ring */}
                            <circle cx={CX} cy={CY} r={R + 5} fill="#1a1a1a" />
                            {segments}
                            {/* Inner ring */}
                            <circle cx={CX} cy={CY} r={R * 0.38} fill="#2A2A2A" stroke="#3A3A3A" strokeWidth="2" />
                        </g>

                        {/* Center hub (doesn't rotate) */}
                        <circle cx={CX} cy={CY} r={18} fill="url(#hubGrad)" stroke="#92400E" strokeWidth="3" />
                        <circle cx={CX} cy={CY} r={7} fill="#FCD34D" opacity="0.6" />

                        {/* Ball marker at top */}
                        <g>
                            <polygon
                                points={`${CX - 8},${CY - R - 12} ${CX + 8},${CY - R - 12} ${CX},${CY - R + 2}`}
                                fill="#F1F5F9"
                                stroke="#94A3B8"
                                strokeWidth="1"
                            />
                        </g>
                    </svg>

                    {/* Result overlay on wheel */}
                    {showResult && result && (
                        <div
                            className="absolute z-10 flex flex-col items-center justify-center rounded-md w-[60px] h-[60px] sm:w-[70px] sm:h-[70px] md:w-[80px] md:h-[80px]"
                            style={{
                                animation: "roulette-zoom-in 0.3s ease-out",
                                background: result.won
                                    ? "linear-gradient(135deg, #25b865, #1da352)"
                                    : "linear-gradient(135deg, #1e293b, #0d1b35)",
                                boxShadow: result.won
                                    ? "0 0 25px rgba(37,184,101,0.5)"
                                    : "0 0 15px rgba(0,0,0,0.3)",
                            }}
                        >
                            <span className="text-lg sm:text-xl md:text-2xl font-black text-white">{result.number}</span>
                            <span
                                className="text-[10px] font-bold uppercase tracking-wider"
                                style={{ color: result.color === "red" ? "#FCA5A5" : result.color === "green" ? "#86EFAC" : "#CBD5E1" }}
                            >
                                {result.color}
                            </span>
                        </div>
                    )}
                </div>

                {/* ────── Controls ────── */}
                <div className="flex-1 flex flex-col gap-3 w-full min-w-0">
                    {/* Mode Toggle */}
                    <div className="grid grid-cols-2 rounded-md border border-input p-1 bg-muted/20">
                        <button
                            onClick={() => { setBetMode("number"); setSelectedColor(null); }}
                            className={cn(
                                "rounded-md px-3 py-2 text-xs font-bold transition-all",
                                betMode === "number"
                                    ? "bg-success text-white shadow-md"
                                    : "hover:bg-background/60 text-muted-foreground"
                            )}
                        >
                            Number
                        </button>
                        <button
                            onClick={() => { setBetMode("color"); setSelectedNumber(null); }}
                            className={cn(
                                "rounded-md px-3 py-2 text-xs font-bold transition-all",
                                betMode === "color"
                                    ? "bg-success text-white shadow-md"
                                    : "hover:bg-background/60 text-muted-foreground"
                            )}
                        >
                            Color
                        </button>
                    </div>

                    {/* Number Grid */}
                    {betMode === "number" && (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground">Pick a number:</span>

                            {/* Zero */}
                            <button
                                onClick={() => setSelectedNumber(selectedNumber === 0 ? null : 0)}
                                disabled={isSpinning}
                                className={cn(
                                    "w-full h-8 rounded-md text-xs font-bold transition-all border",
                                    selectedNumber === 0
                                        ? "bg-green-600 text-white border-green-400 ring-2 ring-green-400/50 scale-[1.02]"
                                        : "bg-green-800/60 text-green-100 border-green-700/50 hover:bg-green-700/70"
                                )}
                            >
                                0
                            </button>

                            {/* Numbers 1-36 in 3 columns (casino layout) */}
                            <div className="grid grid-cols-6 sm:grid-cols-9 gap-1">
                                {Array.from({ length: 36 }, (_, i) => i + 1).map((num) => {
                                    const color = getColor(num);
                                    const isSelected = selectedNumber === num;
                                    return (
                                        <button
                                            key={num}
                                            onClick={() => setSelectedNumber(isSelected ? null : num)}
                                            disabled={isSpinning}
                                            className={cn(
                                                "h-7 rounded text-[10px] font-bold transition-all border",
                                                isSelected && "ring-2 scale-[1.08] z-10",
                                                color === "red"
                                                    ? isSelected
                                                        ? "bg-red-600 text-white border-red-400 ring-red-400/50"
                                                        : "bg-red-800/60 text-red-100 border-red-700/40 hover:bg-red-700/70"
                                                    : isSelected
                                                        ? "bg-gray-700 text-white border-gray-400 ring-gray-400/50"
                                                        : "bg-gray-800/60 text-gray-200 border-gray-600/40 hover:bg-gray-700/70"
                                            )}
                                        >
                                            {num}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Color Selector */}
                    {betMode === "color" && (
                        <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-medium text-muted-foreground">Pick a color:</span>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setSelectedColor(selectedColor === "red" ? null : "red")}
                                    disabled={isSpinning}
                                    className={cn(
                                        "flex items-center justify-center gap-1.5 sm:gap-2 h-11 sm:h-14 rounded-md text-xs sm:text-sm font-bold transition-all border-2",
                                        selectedColor === "red"
                                            ? "bg-danger text-white border-red-400 ring-2 ring-red-400/40 shadow-lg shadow-red-500/20 scale-[1.03]"
                                            : "bg-red-900/40 text-red-200 border-red-700/40 hover:bg-red-800/50"
                                    )}
                                >
                                    <span className="text-lg">🔴</span> Red
                                </button>
                                <button
                                    onClick={() => setSelectedColor(selectedColor === "black" ? null : "black")}
                                    disabled={isSpinning}
                                    className={cn(
                                        "flex items-center justify-center gap-1.5 sm:gap-2 h-11 sm:h-14 rounded-md text-xs sm:text-sm font-bold transition-all border-2",
                                        selectedColor === "black"
                                            ? "bg-neutral-800 text-white border-neutral-600 ring-2 ring-neutral-600/40 shadow-lg shadow-neutral-900/20 scale-[1.03]"
                                            : "bg-neutral-900/40 text-neutral-300 border-neutral-700/40 hover:bg-neutral-800/50"
                                    )}
                                >
                                    <span className="text-lg">⚫</span> Black
                                </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground/70 text-center">
                                Color bet pays <strong className="text-success">+2 points</strong>
                            </p>
                        </div>
                    )}

                    {/* Spin Button */}
                    <button
                        onClick={handleSpin}
                        disabled={isSpinning || !hasBet}
                        className={cn(
                            "w-full h-10 sm:h-11 rounded-md text-xs sm:text-sm font-bold transition-all mt-1",
                            "flex items-center justify-center gap-2",
                            isSpinning
                                ? "bg-success/50 text-white/70 cursor-not-allowed"
                                : hasBet
                                    ? "bg-success hover:bg-success/90 text-white shadow-md shadow-success/20 active:scale-[0.98]"
                                    : "bg-muted text-muted-foreground cursor-not-allowed"
                        )}
                    >
                        {isSpinning ? (
                            <>
                                <RotateCcw className="h-4 w-4 animate-spin" /> Spinning...
                            </>
                        ) : (
                            <>
                                <RotateCcw className="h-4 w-4" /> Spin Roulette
                            </>
                        )}
                    </button>

                    {/* Result Message (Lose) */}
                    {showResult && result && !result.won && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-danger/10 border border-danger/20" style={{ animation: "roulette-slide-up 0.3s ease-out" }}>
                            <span className="text-xs font-medium text-danger">
                                Landed on <strong className="text-red-300">{result.number}</strong>{" "}
                                <span style={{ color: result.color === "red" ? "#FCA5A5" : result.color === "green" ? "#86EFAC" : "#CBD5E1" }}>
                                    ({result.color})
                                </span>{" "}
                                — Try Again!
                            </span>
                        </div>
                    )}

                    {/* Last results mini-history */}
                    {history.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground/60 mr-1">Last:</span>
                            {history.slice(0, 8).map((h, i) => (
                                <span
                                    key={h.timestamp + "-" + i}
                                    className={cn(
                                        "inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded text-[9px] font-bold",
                                        h.color === "red"
                                            ? "bg-red-600/80 text-white"
                                            : h.color === "green"
                                                ? "bg-green-600/80 text-white"
                                                : "bg-gray-600/80 text-white"
                                    )}
                                >
                                    {h.number}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ────── Win Modal ────── */}
            {showWinModal && result && result.won && (
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
                        <button
                            onClick={() => setShowWinModal(false)}
                            className="absolute top-3 right-3 text-success/60 hover:text-white transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        {/* Confetti rings */}
                        <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-2 border-amber-400/20 animate-ping" style={{ animationDuration: "2s" }} />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 rounded-full border border-primary/10 animate-ping" style={{ animationDuration: "3s" }} />
                        </div>

                        {/* Trophy */}
                        <div className="relative">
                            <span className="text-6xl block animate-bounce" style={{ animationDuration: "1s" }}>🏆</span>
                        </div>

                        <h2 className="text-2xl font-black text-white tracking-tight">Winner!</h2>

                        <div className="flex items-center gap-2">
                            <span
                                className="text-4xl font-black"
                                style={{
                                    background: "linear-gradient(135deg, #FCD34D, #F59E0B)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                }}
                            >
                                +{result.points}
                            </span>
                            <span className="text-lg font-bold text-success">Points</span>
                        </div>

                        <p className="text-xs text-neutral-400">
                            Ball landed on{" "}
                            <strong className="text-white">{result.number}</strong> (
                            <span style={{ color: result.color === "red" ? "#ff4d4d" : result.color === "green" ? "#25b865" : "#CBD5E1" }}>
                                {result.color}
                            </span>
                            )
                        </p>

                        <div className="mt-1 px-4 py-1.5 rounded-full bg-success/20 border border-success/30">
                            <span className="text-xs font-bold text-success">
                                Total: {totalPoints} pts
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
