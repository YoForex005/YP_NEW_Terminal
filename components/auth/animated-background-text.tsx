"use client";

import { motion, useAnimation } from "framer-motion";
import { useEffect } from "react";

export function AnimatedBackgroundText() {
  const text = "FXTRUSTS";
  const letters = Array.from(text);

  const controls = useAnimation();

  useEffect(() => {
    let mounted = true;
    async function sequence() {
      try {
        if (mounted) await controls.start("show");
        if (mounted) await controls.start("fill");
      } catch (error) {
        // Ignore unmount interruption errors from framer-motion
      }
    }
    
    // Slight delay ensures Framer Motion has fully bound the controls in Strict Mode
    const timer = setTimeout(() => {
      if (mounted) sequence();
    }, 50);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [controls]);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15, // Fast typing speed
      },
    },
    fill: {
      opacity: 1,
      transition: {
        staggerChildren: 0.35, // Slow, rolling fill speed
      },
    }
  };

  const letterVariants = {
    hidden: {
      opacity: 0,
      scale: 1.2,
      filter: "blur(8px)",
      color: "rgba(203, 213, 225, 0)",
      textShadow: "0px 0px 0px rgba(203, 213, 225, 0)"
    },
    show: {
      opacity: 1,
      scale: 1,
      filter: "blur(0px)",
      color: "rgba(203, 213, 225, 0)", // Keep it perfectly transparent glass initially
      textShadow: "0px 0px 0px rgba(203, 213, 225, 0)",
      transition: { type: "spring", damping: 15, stiffness: 100 },
    },
    fill: {
      color: "rgba(203, 213, 225, 0.18)", // Elegant silver fill
      textShadow: "0px 0px 40px rgba(203, 213, 225, 0.4)", // Deep silver glow
      transition: { duration: 1.5, ease: "easeInOut" }
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={controls}
        className="flex items-center justify-center text-[25vw] sm:text-[20vw] lg:text-[10vw] font-black tracking-tighter"
      >
        {letters.map((letter, index) => (
          <motion.span
            key={index}
            variants={letterVariants}
            style={{
              WebkitTextStroke: "min(3px, 0.4vw) rgba(255, 255, 255, 0.05)",
              color: "transparent",
              lineHeight: 1,
            }}
          >
            {letter}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}
