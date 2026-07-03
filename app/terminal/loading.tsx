export default function TerminalLoading() {
    return (
        <div
            aria-hidden="true"
            className="bg-[#0e0f11]"
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <style>{`
                .terminal-loading-dots {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    width: min(220px, 52vw);
                    height: 72px;
                }
                .terminal-loading-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 999px;
                    background: #ffffff;
                    opacity: 0.28;
                    transform: translateY(0) scale(0.72);
                    animation: terminalDotWave 1.15s ease-in-out infinite;
                }
                .terminal-loading-dot:nth-child(2) {
                    animation-delay: 0.12s;
                }
                .terminal-loading-dot:nth-child(3) {
                    animation-delay: 0.24s;
                }
                .terminal-loading-dot:nth-child(4) {
                    animation-delay: 0.36s;
                }
                .terminal-loading-dot:nth-child(5) {
                    animation-delay: 0.48s;
                }
                @keyframes terminalDotWave {
                    0%, 72%, 100% {
                        opacity: 0.28;
                        transform: translateY(0) scale(0.72);
                    }
                    28% {
                        opacity: 1;
                        transform: translateY(-2px) scale(1.45);
                    }
                }
            `}</style>
            <div className="terminal-loading-dots">
                <span className="terminal-loading-dot" />
                <span className="terminal-loading-dot" />
                <span className="terminal-loading-dot" />
                <span className="terminal-loading-dot" />
                <span className="terminal-loading-dot" />
            </div>
        </div>
    );
}
