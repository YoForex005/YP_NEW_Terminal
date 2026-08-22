'use client';

const SPOKE_COUNT = 12;
const SPOKES = Array.from({ length: SPOKE_COUNT }, (_, index) => index);

type ChartSyncSpinnerProps = {
    size?: number;
    color?: string;
    label?: string;
};

export default function ChartSyncSpinner({
    size = 64,
    color = 'currentColor',
    label = 'Synchronizing chart history and live data',
}: ChartSyncSpinnerProps) {
    const spokeWidth = Math.max(5, Math.round(size * 0.1));
    const spokeHeight = Math.max(14, Math.round(size * 0.28));
    const spokeRadius = Math.round(size * 0.3);

    return (
        <div
            className="relative shrink-0 animate-spin"
            style={{
                width: size,
                height: size,
                color,
                animationDuration: '960ms',
                animationTimingFunction: 'steps(12, end)',
                willChange: 'transform',
            }}
            role="status"
            aria-live="polite"
            aria-label={label}
        >
            {SPOKES.map((index) => (
                <span
                    key={index}
                    className="absolute left-1/2 top-1/2 block rounded-full bg-current"
                    style={{
                        width: spokeWidth,
                        height: spokeHeight,
                        marginLeft: -spokeWidth / 2,
                        marginTop: -spokeHeight / 2,
                        opacity: Math.max(0.16, 1 - index * 0.075),
                        transform: `rotate(${index * 30}deg) translateY(-${spokeRadius}px)`,
                    }}
                    aria-hidden="true"
                />
            ))}
        </div>
    );
}
