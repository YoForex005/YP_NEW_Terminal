"use client";

import { Server, CheckCircle2 } from "lucide-react";
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

export interface VpsPlan {
    name: string;
    price: string;
    condition: string;
    specs: string[];
    accent: string;          // CSS colour for the reveal overlay background
    textOnAccent: string;    // text colour on that background
    mutedOnAccent: string;   // muted text colour on that background
    highlight?: boolean;
}

// ──────────────────────────────────────────────────────────────
// Card body — rendered twice (plain base + accented overlay)
// ──────────────────────────────────────────────────────────────
interface VpsCardBodyProps {
    plan: VpsPlan;
    scheme?: "plain" | "accented";
    showIcon?: boolean;
    cardCss?: React.CSSProperties;
}

function VpsCardBody({ plan, scheme = "plain", showIcon = false, cardCss }: VpsCardBodyProps) {
    const isAccent = scheme === "accented";

    const fg    = isAccent ? "var(--on-accent-foreground)"       : undefined;
    const muted = isAccent ? "var(--on-accent-muted-foreground)" : undefined;

    return (
        <Card
            style={cardCss}
            className={cn(
                "flex flex-col rounded-3xl border-0 p-8 h-full",
                !isAccent && "bg-card text-card-foreground"
            )}
        >
            <CardHeader className="p-0 space-y-0">
                {/* Server icon — invisible on base, visible on overlay (mirrors avatar in IdentityCardBody) */}
                <div className={cn(!showIcon && "invisible", "mb-1")}>
                    <div
                        className="h-16 w-16 rounded-full flex items-center justify-center ring-2 ring-offset-4 ring-offset-card"
                        style={{ backgroundColor: isAccent ? "rgba(255,255,255,0.2)" : undefined, "--tw-ring-color": "var(--accent-color)" } as React.CSSProperties}
                    >
                        <Server
                            className="h-7 w-7"
                            style={{ color: isAccent ? fg : plan.accent }}
                        />
                    </div>
                </div>

                <CardDescription
                    className="pt-6 text-left text-sm"
                    style={muted ? { color: muted } : undefined}
                >
                    {plan.condition}
                </CardDescription>

                <CardTitle
                    className="text-3xl text-left"
                    style={fg ? { color: fg } : undefined}
                >
                    {plan.name}
                </CardTitle>

                <p
                    className="text-4xl font-bold mt-1 text-left"
                    style={fg ? { color: fg } : { color: plan.accent }}
                >
                    {plan.price}
                </p>
            </CardHeader>

            <CardContent className="mt-6 flex-grow p-0">
                <ul className="space-y-2.5">
                    {plan.specs.map((spec) => (
                        <li key={spec} className="flex items-center gap-2.5 text-sm">
                            <CheckCircle2
                                className="h-4 w-4 shrink-0"
                                style={{ color: isAccent ? fg : "#10b981" }}
                            />
                            <span style={fg ? { color: fg } : undefined}>{spec}</span>
                        </li>
                    ))}
                </ul>
            </CardContent>

            <CardFooter className="mt-8 p-0">
                <button
                    className={cn(
                        "w-full py-3 px-4 rounded-2xl font-semibold text-sm transition-all duration-200",
                        "border border-border/20 shadow-sm",
                        isAccent
                            ? "border-white/20 hover:opacity-90"
                            : plan.highlight
                                ? "bg-foreground text-background hover:bg-foreground/90"
                                : "bg-muted/60 text-foreground hover:bg-muted"
                    )}
                    style={
                        isAccent
                            ? { backgroundColor: "rgba(255,255,255,0.2)", color: fg }
                            : undefined
                    }
                >
                    {plan.highlight ? "Activate VPS" : "Get Started"}
                </button>
            </CardFooter>
        </Card>
    );
}

// ──────────────────────────────────────────────────────────────
// Public component — wraps both bodies in the reveal container
// ──────────────────────────────────────────────────────────────
export function VpsCard({ plan }: { plan: VpsPlan }) {
    return (
        <RevealCardContainer
            accent={plan.accent}
            textOnAccent={plan.textOnAccent}
            mutedOnAccent={plan.mutedOnAccent}
            className="w-full"          // override the fixed w-[350px] for grid layout
            base={
                <VpsCardBody plan={plan} scheme="plain" showIcon={false} />
            }
            overlay={
                <VpsCardBody
                    plan={plan}
                    scheme="accented"
                    showIcon={true}
                    cardCss={{ backgroundColor: "var(--accent-color)" }}
                />
            }
        />
    );
}
