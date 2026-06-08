"use client"

import { motion, useReducedMotion } from "framer-motion"
import { CheckCircle2, Download, ExternalLink } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface PlatformStat {
    icon: ReactNode
    value: string
    label: string
}

export interface PlatformCardProps {
    name: string
    description: string
    image: string
    badge?: string
    stats: [PlatformStat, PlatformStat]
    ctaLabel: string
    ctaHref: string
    isDownload?: boolean
    className?: string
}

// Shared animation variants — mirrors ProfileCard exactly
const imageVariants = {
    rest:  { scale: 1    },
    hover: { scale: 1.05 },
}

const contentVariants = {
    hidden:  { opacity: 0, y: 20, filter: "blur(4px)" },
    visible: {
        opacity: 1, y: 0, filter: "blur(0px)",
        transition: {
            type: "spring" as const, stiffness: 400, damping: 28, mass: 0.6,
            staggerChildren: 0.08, delayChildren: 0.1,
        },
    },
}

const itemVariants = {
    hidden:  { opacity: 0, y: 15, scale: 0.95, filter: "blur(2px)" },
    visible: {
        opacity: 1, y: 0, scale: 1, filter: "blur(0px)",
        transition: { type: "spring" as const, stiffness: 400, damping: 25, mass: 0.5 },
    },
}

const letterVariants = {
    hidden:  { opacity: 0, scale: 0.8 },
    visible: {
        opacity: 1, scale: 1,
        transition: { type: "spring" as const, damping: 8, stiffness: 200, mass: 0.8 },
    },
}

export function PlatformCard({
    name,
    description,
    image,
    badge = "Official",
    stats,
    ctaLabel,
    ctaHref,
    isDownload = true,
    className,
}: PlatformCardProps) {
    const shouldReduceMotion = useReducedMotion()
    const animate = !shouldReduceMotion

    const containerVariants = {
        rest:  { scale: 1, y: 0 },
        hover: animate ? {
            scale: 1.02,
            y: -4,
            transition: { type: "spring" as const, stiffness: 400, damping: 28, mass: 0.6 },
        } : {},
    }

    return (
        <motion.div
            initial="rest"
            whileHover="hover"
            variants={containerVariants}
            className={cn(
                "relative h-96 w-full max-w-80 rounded-3xl border border-border/20 text-card-foreground",
                "overflow-hidden shadow-xl shadow-black/5 dark:shadow-black/20",
                "cursor-pointer backdrop-blur-sm",
                className
            )}
        >
            {/* Background image */}
            <motion.img
                src={image}
                alt={name}
                className="absolute inset-0 w-full h-full object-cover"
                variants={imageVariants}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />

            {/* Gradient overlays — identical to ProfileCard */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 via-background/20 via-background/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-background/90 via-background/60 via-background/30 via-background/15 via-background/8 to-transparent backdrop-blur-[1px]" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background/85 via-background/40 to-transparent backdrop-blur-sm" />

            {/* Official badge — top-right */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-background/50 backdrop-blur-md border border-border/20 rounded-full px-2.5 py-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] font-semibold text-muted-foreground">{badge}</span>
            </div>

            {/* Animated content stack */}
            <motion.div
                variants={contentVariants}
                initial="hidden"
                animate="visible"
                className="absolute bottom-0 left-0 right-0 p-6 space-y-4"
            >
                {/* Platform name — letter-by-letter entrance */}
                <motion.div variants={itemVariants}>
                    <motion.h2
                        className="text-2xl font-bold text-foreground"
                        variants={{ visible: { transition: { staggerChildren: 0.02 } } }}
                    >
                        {name.split("").map((letter, i) => (
                            <motion.span key={i} variants={letterVariants} className="inline-block">
                                {letter === " " ? " " : letter}
                            </motion.span>
                        ))}
                    </motion.h2>
                </motion.div>

                {/* Description */}
                <motion.p
                    variants={itemVariants}
                    className="text-muted-foreground text-sm leading-relaxed"
                >
                    {description}
                </motion.p>

                {/* Stats row */}
                <motion.div variants={itemVariants} className="flex items-center gap-6 pt-1">
                    {stats.map(({ icon, value, label }) => (
                        <div key={label} className="flex items-center gap-1.5 text-muted-foreground">
                            <span className="shrink-0">{icon}</span>
                            <span className="font-semibold text-foreground text-sm">{value}</span>
                            <span className="text-xs">{label}</span>
                        </div>
                    ))}
                </motion.div>

                {/* CTA button */}
                <motion.a
                    href={ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    variants={itemVariants}
                    onClick={(e) => e.stopPropagation()}
                    whileHover={{
                        scale: 1.02,
                        transition: { type: "spring", stiffness: 400, damping: 25 },
                    }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                        "flex items-center justify-center gap-2 w-full py-3 px-4 rounded-2xl",
                        "font-semibold text-sm border border-border/20 shadow-sm",
                        "bg-foreground text-background hover:bg-foreground/90",
                        "transform-gpu transition-colors duration-200"
                    )}
                >
                    {isDownload
                        ? <Download className="w-4 h-4" />
                        : <ExternalLink className="w-4 h-4" />
                    }
                    {ctaLabel}
                </motion.a>
            </motion.div>
        </motion.div>
    )
}
