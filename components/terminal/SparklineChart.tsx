'use client';

interface SparklineChartProps {
    data: number[];
    width?: number;
    height?: number;
    className?: string;
}

export default function SparklineChart({
    data,
    width = 60,
    height = 24,
    className = '',
}: SparklineChartProps) {
    if (!data || data.length < 2) return null;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const isUp = data[data.length - 1] >= data[0];
    const strokeColor = isUp ? 'var(--bull-bright)' : 'var(--bear-bright)';

    // Create a gradient fill path
    const fillPath = `M0,${height} L${points.join(' L')} L${width},${height} Z`;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={className}
            style={{ overflow: 'visible' }}
        >
            <defs>
                <linearGradient id={`spark-grad-${isUp ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path
                d={fillPath}
                fill={`url(#spark-grad-${isUp ? 'up' : 'down'})`}
            />
            <polyline
                points={points.join(' ')}
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
