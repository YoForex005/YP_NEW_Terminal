"use client";

import { useState, useEffect } from "react";
import { Crown, CheckCircle2 } from "lucide-react";
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from "@/components/ui/card";
import { RevealCardContainer } from "@/components/ui/animated-profile-card";
import { cn } from "@/lib/utils";

export interface PremiumTier {
    name: string;
    minDeposit: string;
    perks: string[];
    accent: string;
    textOnAccent: string;
    mutedOnAccent: string;
    highlight?: boolean;
}

interface PremiumTierCardBodyProps {
    tier: PremiumTier;
    scheme?: "plain" | "accented";
    showIcon?: boolean;
    cardCss?: React.CSSProperties;
}

function PremiumTierCardBody({ tier, scheme = "plain", showIcon = false, cardCss }: PremiumTierCardBodyProps) {
    const isAccent = scheme === "accented";
    const fg    = isAccent ? "var(--on-accent-foreground)"       : undefined;
    const muted = isAccent ? "var(--on-accent-muted-foreground)" : undefined;

    return (
        <Card
            style={cardCss}
            className={cn(
                "flex flex-col rounded-3xl border-0 p-5 sm:p-8 h-full",
                !isAccent && "bg-card text-card-foreground"
            )}
        >
            <CardHeader className="p-0 space-y-0">
                {/* Crown icon — invisible on base, visible on overlay */}
                <div className={cn(!showIcon && "invisible", "mb-1")}>
                    <div
                        className="h-12 w-12 sm:h-16 sm:w-16 rounded-full flex items-center justify-center ring-2 ring-offset-4 ring-offset-card"
                        style={{
                            backgroundColor: isAccent ? "rgba(255,255,255,0.2)" : undefined,
                            "--tw-ring-color": "var(--accent-color)",
                        } as React.CSSProperties}
                    >
                        <Crown
                            className="h-5 w-5 sm:h-7 sm:w-7"
                            style={{ color: isAccent ? fg : tier.accent }}
                        />
                    </div>
                </div>

                <CardDescription
                    className="pt-5 sm:pt-6 text-left text-[11px] sm:text-sm"
                    style={muted ? { color: muted } : undefined}
                >
                    Min deposit:{" "}
                    <span className="font-semibold">{tier.minDeposit}</span>
                </CardDescription>

                <CardTitle
                    className="text-2xl sm:text-3xl text-left"
                    style={fg ? { color: fg } : undefined}
                >
                    {tier.name}
                </CardTitle>
            </CardHeader>

            <CardContent className="mt-4 sm:mt-6 flex-grow p-0">
                <ul className="space-y-2 sm:space-y-2.5">
                    {tier.perks.map((perk) => (
                        <li key={perk} className="flex items-center gap-2 sm:gap-2.5 text-xs sm:text-sm">
                            <CheckCircle2
                                className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0"
                                style={{ color: isAccent ? fg : tier.accent }}
                            />
                            <span style={fg ? { color: fg } : undefined}>{perk}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>

            <CardFooter className="mt-6 sm:mt-8 p-0">
                <button
                    className={cn(
                        "w-full py-2.5 sm:py-3 px-4 rounded-2xl font-semibold text-xs sm:text-sm transition-all duration-200",
                        "border border-border/20 shadow-sm",
                        isAccent
                            ? "border-white/20 hover:opacity-90"
                            : tier.highlight
                                ? "bg-foreground text-background hover:bg-foreground/90"
                                : "bg-muted/60 text-foreground hover:bg-muted"
                    )}
                    style={
                        isAccent
                            ? { backgroundColor: "rgba(255,255,255,0.2)", color: fg }
                            : undefined
                    }
                >
                    {tier.highlight ? "Upgrade Now" : "Learn More"}
                </button>
            </CardFooter>
        </Card>
    );
}

// p-5 (20px) + h-12/2 (24px) = 44px origin at sm-  ;  p-8 (32px) + h-16/2 (32px) = 64px origin at sm+
const SM = 640;
function getClips(w: number) {
    return w < SM
        ? { startClip: "circle(37px at 44px 44px)", expandClip: "circle(160% at 44px 44px)" }
        : { startClip: "circle(50px at 64px 64px)", expandClip: "circle(160% at 64px 64px)" };
}

export function PremiumTierCard({ tier }: { tier: PremiumTier }) {
    const [clips, setClips] = useState(() =>
        typeof window !== "undefined"
            ? getClips(window.innerWidth)
            : { startClip: "circle(50px at 64px 64px)", expandClip: "circle(160% at 64px 64px)" }
    );

    useEffect(() => {
        const update = () => setClips(getClips(window.innerWidth));
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    return (
        <RevealCardContainer
            accent={tier.accent}
            textOnAccent={tier.textOnAccent}
            mutedOnAccent={tier.mutedOnAccent}
            className="w-full"
            startClip={clips.startClip}
            expandClip={clips.expandClip}
            base={
                <PremiumTierCardBody tier={tier} scheme="plain" showIcon={false} />
            }
            overlay={
                <PremiumTierCardBody
                    tier={tier}
                    scheme="accented"
                    showIcon={true}
                    cardCss={{ backgroundColor: "var(--accent-color)" }}
                />
            }
        />
    );
}
