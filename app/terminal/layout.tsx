import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Yopips Web Terminal",
    description: "Yopips web trading terminal with real-time market data, charts, and order management.",
};

export default function TerminalLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="terminal-root h-[100dvh] w-full min-w-0 max-w-[100dvw] overflow-hidden bg-background font-sans text-foreground antialiased">
            {children}
        </div>
    );
}
