"use client";

import { useEffect, useId, useState } from "react";
import { useSpring } from "framer-motion";

interface MarketGaugeProps {
  score: number;
}

// Clamp to -75 to 75 based on screenshot values
const clamp = (value: number) => Math.min(75, Math.max(-75, value));

const polarToPoint = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const rad = (Math.PI / 180) * angleDeg;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
};

// Create arc path for the TOP semi-circle (180 to 360 degrees)
const createArcPath = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToPoint(cx, cy, radius, startAngle);
  const end = polarToPoint(cx, cy, radius, endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  // sweep-flag = 1 for clockwise (matching 180 -> 270 -> 360)
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

export function MarketGauge({ score }: MarketGaugeProps) {
  const id = useId();
  const safeScore = clamp(score);

  // Normalize -75..75 to 0..100 for gauge positioning
  const normalizedValue = ((safeScore + 75) / 150) * 100;

  const springValue = useSpring(50, {
    stiffness: 45, // Slightly faster for "movement" feel
    damping: 25,
    mass: 0.8,
  });

  const [displayScore, setDisplayScore] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(270);

  useEffect(() => {
    const timer = setTimeout(() => {
      springValue.set(normalizedValue);
    }, 250);

    const unsubscribe = springValue.on("change", (v) => {
      // Map back to -75..75 for display
      const mapped = Math.round((v / 100) * 150 - 75);
      setDisplayScore(mapped);
      // Map 0..100 to 180..360 deg
      setCurrentAngle(180 + (v / 100) * 180);
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [normalizedValue, springValue]);

  const needlePoint = polarToPoint(64, 75, 52, currentAngle);

  return (
    <div className="mx-auto w-[120px] mt-1">
      <svg viewBox="0 0 128 85" className="h-auto w-full" role="img" aria-label={`Gauge score ${safeScore}`}>
        <defs>
          <filter id={`${id}-glow`}>
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`${id}-inner-shadow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="90%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </radialGradient>
          <linearGradient id={`${id}-needle`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3d58d3" />
            <stop offset="100%" stopColor="#4f6df5" />
          </linearGradient>
        </defs>

        {/* Backdrop for the arc */}
        <path
          d={createArcPath(64, 75, 55, 180, 360)}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* RED section (-75 to -25) */}
        <path
          d={createArcPath(64, 75, 55, 180, 240)}
          fill="none"
          stroke="#ff4d4d"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* GRAY section (-25 to 25) */}
        <path
          d={createArcPath(64, 75, 55, 240, 300)}
          fill="none"
          stroke="currentColor"
          className="text-muted-foreground/30"
          strokeWidth="12"
        />
        {/* GREEN section (25 to 75) */}
        <path
          d={createArcPath(64, 75, 55, 300, 360)}
          fill="none"
          stroke="#25b865"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Tick marks on the outer arc */}
        {Array.from({ length: 21 }).map((_, index) => {
          const angle = 180 + index * 9;
          const isMajor = index % 5 === 0;
          const outer = polarToPoint(64, 75, 60, angle);
          const inner = polarToPoint(64, 75, isMajor ? 48 : 50, angle);
          return (
            <line
              key={`tick-${index}`}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={isMajor ? "#d4a853" : "rgba(255,255,255,0.7)"}
              strokeWidth={isMajor ? "2.5" : "1"}
            />
          );
        })}

        {/* Center circle area for text */}
        <circle cx="64" cy="75" r="42" fill="currentColor" className="text-card" />
        <circle cx="64" cy="75" r="42" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border" />

        {/* Score display: value | 75 */}
        <g transform="translate(64, 68)">
          <text
            x="-14"
            y="0"
            textAnchor="middle"
            fontWeight="bold"
            fill="currentColor"
            fontSize="24"
            className="font-sans text-foreground"
          >
            {displayScore}
          </text>
          <line x1="0" y1="-14" x2="0" y2="4" stroke="currentColor" strokeWidth="1.5" className="text-border" />
          <text
            x="16"
            y="0"
            textAnchor="middle"
            fill="currentColor"
            fontSize="20"
            className="font-sans text-muted-foreground"
          >
            75
          </text>
        </g>

        {/* Needle - Stick upper movement */}
        <line
          x1="64"
          y1="75"
          x2={needlePoint.x}
          y2={needlePoint.y}
          stroke={`url(#${id}-needle)`}
          strokeWidth="3.5"
          strokeLinecap="round"
          filter={`url(#${id}-glow)`}
        />

        {/* Pivot Point (Gold) */}
        <circle cx="64" cy="75" r="7" fill="#d4a853" />
        <circle cx="64" cy="75" r="4" fill="#fef08a" opacity="0.8" />
      </svg>
    </div>
  );
}