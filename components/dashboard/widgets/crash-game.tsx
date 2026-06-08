"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useRouletteStore } from "@/store/roulette-store";
import { Trophy, TrendingUp, Zap } from "lucide-react";

/* ───────── Helpers ───────── */

/**
 * Generate a random crash point using an exponential distribution.
 * Most rounds crash between 1.0x–3.0x, but occasionally go much higher.
 */
function generateCrashPoint(): number {
    // Using the inverse of CDF for exponential distribution
    // House edge ~5%: crash at 1.00x ~5% of the time
    const r = Math.random();
    if (r < 0.05) return 1.0; // instant crash 5% of the time
    // Exponential: -ln(1 - r) / lambda, scaled
    const crash = 1 / (1 - r);
    return Math.min(parseFloat(crash.toFixed(2)), 25.0); // cap at 25x
}

/* ───────── Component ───────── */

export function CrashGame() {
    const { totalPoints, recordResult } = useRouletteStore();

    // Game state
    const [phase, setPhase] = useState<"idle" | "running" | "cashed" | "crashed">("idle");
    const [multiplier, setMultiplier] = useState(1.0);
    const [crashPoint, setCrashPoint] = useState(0);
    const [cashOutAt, setCashOutAt] = useState(0);
    const [pointsWon, setPointsWon] = useState(0);
    const [showWinModal, setShowWinModal] = useState(false);

    // Graph data
    const [graphPoints, setGraphPoints] = useState<number[]>([]);

    // Animation refs
    const animRef = useRef<number>(0);
    const startTimeRef = useRef(0);
    const crashPointRef = useRef(0);

    // Start a new round
    const startRound = useCallback(() => {
        const cp = generateCrashPoint();
        setCrashPoint(cp);
        crashPointRef.current = cp;
        setMultiplier(1.0);
        setGraphPoints([1.0]);
        setCashOutAt(0);
        setPointsWon(0);
        setShowWinModal(false);
        setPhase("running");
        startTimeRef.current = performance.now();

        // Animation loop
        const tick = (now: number) => {
            const elapsed = (now - startTimeRef.current) / 1000; // seconds
            // Multiplier grows exponentially: 1.0 * e^(0.6t)
            const m = parseFloat((1.0 * Math.exp(0.6 * elapsed)).toFixed(2));

            if (m >= crashPointRef.current) {
                // CRASH!
                setMultiplier(crashPointRef.current);
                setGraphPoints((prev) => [...prev, crashPointRef.current]);
                setPhase("crashed");

                // Record loss
                recordResult({
                    number: 0,
                    color: "red",
                    won: false,
                    pointsEarned: 0,
                    betType: "number", // reusing store
                    timestamp: Date.now(),
                });
                return;
            }

            setMultiplier(m);
            setGraphPoints((prev) => [...prev, m]);
            animRef.current = requestAnimationFrame(tick);
        };

        animRef.current = requestAnimationFrame(tick);
    }, [recordResult]);

    // Cash out
    const cashOut = useCallback(() => {
        if (phase !== "running") return;

        cancelAnimationFrame(animRef.current);
        setCashOutAt(multiplier);

        // Points = floor of multiplier (so 2.45x = +2 points, 5.78x = +5 points)
        const pts = Math.floor(multiplier);
        setPointsWon(pts);
        setPhase("cashed");

        recordResult({
            number: Math.round(multiplier * 100),
            color: "green",
            won: true,
            pointsEarned: pts,
            betType: "number",
            timestamp: Date.now(),
        });

        setShowWinModal(true);
        setTimeout(() => setShowWinModal(false), 3000);
    }, [phase, multiplier, recordResult]);

    // Cleanup on unmount
    useEffect(() => {
        return () => cancelAnimationFrame(animRef.current);
    }, []);

    // Graph rendering
    const graphWidth = 300;
    const graphHeight = 140;
    const maxDisplayMultiplier = Math.max(3, multiplier * 1.3);

    const polylinePoints = graphPoints
        .map((m, i) => {
            const x = (i / Math.max(graphPoints.length - 1, 1)) * graphWidth;
            const y = graphHeight - ((m - 1) / (maxDisplayMultiplier - 1)) * (graphHeight - 10);
            return `${x},${Math.max(5, y)}`;
        })
        .join(" ");

    // Fill area under the curve
    const areaPoints = graphPoints.length > 0
        ? `0,${graphHeight} ${polylinePoints} ${graphWidth * ((graphPoints.length - 1) / Math.max(graphPoints.length - 1, 1))},${graphHeight}`
        : "";

    const lineColor = phase === "crashed" ? "#ff4d4d" : phase === "cashed" ? "#25b865" : "#25b865";

    // Plane position as percentage of the graph container
    const tipXPercent = graphPoints.length > 0
        ? ((graphPoints.length - 1) / Math.max(graphPoints.length - 1, 1)) * 100
        : 0;
    const tipYPercent = graphPoints.length > 0
        ? (Math.max(5, graphHeight - ((graphPoints[graphPoints.length - 1] - 1) / (maxDisplayMultiplier - 1)) * (graphHeight - 10)) / graphHeight) * 100
        : 100;

    // Calculate flight angle
    let planeAngle = -30;
    if (graphPoints.length > 1) {
        const lastM = graphPoints[graphPoints.length - 1];
        const prevM = graphPoints[graphPoints.length - 2];
        const dx = 1; // normalized
        const dy = -(lastM - prevM); // inverted because Y goes up
        planeAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    }

    return (
        <div className="flex flex-col gap-4 w-full">
            {/* Multiplier display */}
            <div className="flex flex-col items-center gap-1">
                <div
                    className={cn(
                        "text-4xl sm:text-5xl font-black tracking-tight transition-colors",
                        phase === "crashed"
                            ? "text-danger"
                            : phase === "cashed"
                                ? "text-success"
                                : phase === "running"
                                    ? "text-success"
                                    : "text-muted-foreground/50"
                    )}
                >
                    {phase === "idle" ? "1.00" : multiplier.toFixed(2)}x
                </div>
                {phase === "crashed" && (
                    <span
                        className="text-sm font-bold text-danger uppercase tracking-wider"
                        style={{ animation: "roulette-zoom-in 0.3s ease-out" }}
                    >
                        Crashed!
                    </span>
                )}
                {phase === "cashed" && (
                    <span
                        className="text-sm font-bold text-success"
                        style={{ animation: "roulette-zoom-in 0.3s ease-out" }}
                    >
                        Cashed out at {cashOutAt.toFixed(2)}x
                    </span>
                )}
            </div>

            {/* Graph */}
            <div
                className="relative rounded-md"
                style={{
                    padding: "12px",
                    background: "linear-gradient(180deg, var(--success-10) 0%, var(--success-05) 100%)",
                    border: "1px solid var(--success-20)",
                }}
            >
                <svg
                    viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                    className="w-full"
                    style={{ height: 140 }}
                    preserveAspectRatio="none"
                >
                    {/* Grid lines */}
                    {[0.25, 0.5, 0.75].map((frac) => (
                        <line
                            key={frac}
                            x1={0}
                            y1={graphHeight * frac}
                            x2={graphWidth}
                            y2={graphHeight * frac}
                            stroke="rgba(148,163,184,0.1)"
                            strokeDasharray="4 4"
                        />
                    ))}

                    {/* Area fill under curve */}
                    {graphPoints.length > 1 && (
                        <polygon
                            points={areaPoints}
                            fill={phase === "crashed" ? "var(--danger-10)" : "var(--success-10)"}
                        />
                    )}

                    {/* Plane icon at curve tip */}
                    {graphPoints.length > 1 && (
                        <polyline
                            points={polylinePoints}
                            fill="none"
                            stroke={lineColor}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}
                </svg>

                {/* Plane/Rocket HTML overlay */}
                {phase !== "idle" && graphPoints.length > 0 && (
                    <div
                        className="absolute z-10 pointer-events-none"
                        style={{
                            left: `${tipXPercent}%`,
                            top: `${tipYPercent}%`,
                            transform: `translate(-50%, -50%) rotate(${phase === "crashed" ? 0 : planeAngle}deg)`,
                            transition: phase === "running" ? "none" : "transform 0.3s ease-out",
                        }}
                    >
                        {phase === "crashed" ? (
                            <span className="text-2xl" style={{ animation: "roulette-zoom-in 0.3s ease-out" }}>
                                {"\uD83D\uDCA5"}
                            </span>
                        ) : (
                            <span
                                className="text-2xl drop-shadow-lg"
                                style={{
                                    filter: phase === "cashed"
                                        ? "drop-shadow(0 0 6px hsl(var(--primary) / 0.6))"
                                        : "drop-shadow(0 0 8px rgba(255,255,255,0.5))",
                                }}
                            >
                                {"\u2708\uFE0F"}
                            </span>
                        )}
                    </div>
                )}

                {/* Crash overlay */}
                {phase === "crashed" && (
                    <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{
                            background: "var(--danger-10)",
                            animation: "roulette-zoom-in 0.3s ease-out",
                        }}
                    >
                        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-danger/20 border border-danger/30">
                            <Zap className="h-4 w-4 text-danger" />
                            <span className="text-sm font-bold text-danger">
                                Crashed at {crashPoint.toFixed(2)}x
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Info text */}
            <p className="text-[10px] text-muted-foreground/70 text-center">
                Cash out before it crashes! Points = <strong className="text-success">floor(multiplier)</strong>
                {" "} e.g. 3.47x = +3 points
            </p>

            {/* Action Button */}
            {
                phase === "running" ? (
                    <button
                        onClick={cashOut}
                        className={cn(
                            "w-full h-12 sm:h-14 rounded-md text-sm sm:text-base font-black transition-all",
                            "flex items-center justify-center gap-2",
                            "bg-warning hover:bg-warning/90",
                            "text-white shadow-md shadow-warning/20",
                            "active:scale-[0.97]"
                        )}
                    >
                        <TrendingUp className="h-5 w-5" />
                        Cash Out @ {multiplier.toFixed(2)}x
                    </button>
                ) : (
                    <button
                        onClick={startRound}
                        className={cn(
                            "w-full h-10 sm:h-11 rounded-md text-xs sm:text-sm font-bold transition-all",
                            "flex items-center justify-center gap-2",
                            "bg-success hover:bg-success/90",
                            "text-white shadow-md shadow-success/20",
                            "active:scale-[0.98]"
                        )}
                    >
                        <Zap className="h-4 w-4" />
                        {phase === "idle" ? "Start Round" : "Play Again"}
                    </button>
                )
            }

            {/* Result message */}
            {
                phase === "crashed" && (
                    <div
                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-danger/10 border border-danger/20"
                        style={{ animation: "roulette-slide-up 0.3s ease-out" }}
                    >
                        <span className="text-xs font-medium text-danger">
                            Crashed at <strong className="text-danger/80">{crashPoint.toFixed(2)}x</strong> — Too slow! Try again.
                        </span>
                    </div>
                )
            }

            {/* Win Modal */}
            {
                showWinModal && phase === "cashed" && (
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

                            <h3 className="text-xl font-black text-white tracking-tight">Cashed Out!</h3>
                            <p className="text-lg font-bold text-success/80">{cashOutAt.toFixed(2)}x</p>
                            <p className="text-3xl font-black text-success">+{pointsWon} Points!</p>
                            <p className="text-xs text-primary/60 mt-1">
                                Total: {totalPoints} points
                            </p>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
