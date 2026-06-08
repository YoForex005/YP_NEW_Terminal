export default function TerminalLoading() {
    return (
        <div
            aria-hidden="true"
            className="bg-background"
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
                .tpls-dot-loader { display: flex; gap: 8px; }
                .tpls-dot {
                    width: 8px; height: 8px;
                    background-color: #ffffff;
                    border-radius: 50%;
                    animation: tplsDotFade 1.4s infinite ease-in-out both;
                }
                .tpls-dot:nth-child(1) { animation-delay: -0.32s; }
                .tpls-dot:nth-child(2) { animation-delay: -0.16s; }
                @keyframes tplsDotFade {
                    0%, 80%, 100% { opacity: 0.3; }
                    40% { opacity: 1; }
                }
            `}</style>
            <div className="tpls-dot-loader">
                <div className="tpls-dot" />
                <div className="tpls-dot" />
                <div className="tpls-dot" />
            </div>
        </div>
    );
}
