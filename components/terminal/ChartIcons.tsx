import React from 'react';

// --- Drawing & Tool Icons ---

export const CustomCrosshair = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v6M12 14v6M4 12h6M14 12h6" />
    </svg>
);

export const CustomTrendLine = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="19" r="1.5" />
        <circle cx="19" cy="5" r="1.5" />
        <path d="M6.5 17.5L17.5 6.5" />
    </svg>
);

export const CustomPitchfork = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="19" cy="8" r="1.5" />
        <circle cx="19" cy="16" r="1.5" />
        <circle cx="5" cy="16" r="1.5" />
        <path d="M5 14v-6h14" />
        <path d="M5 16h14" />
        <path d="M5 12h14" />
    </svg>
);

export const CustomFib = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
        <circle cx="6" cy="18" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18" cy="6" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="10" cy="14" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="14" cy="10" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 18L18 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 18L10 14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 10L18 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 14L14 10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const CustomFibChannel = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
        <circle cx="5" cy="19" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="15" cy="9" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="19" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="19" cy="9" r="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 19L15 9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 19L19 9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 3" />
        <path d="M3 15h14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 11h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const CustomBrush = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 15C11 15 8 18 5 18C4.5 18 4 17.5 4 17C4 14 7 11 7 11" />
        <path d="M7 11L15 3L19 7L11 15" />
        <path d="M17 5L20 8" strokeDasharray="2 2" />
    </svg>
);

export const CustomType = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 7H18" />
        <path d="M12 7V19" />
        <path d="M10 19H14" />
        <path d="M6 7V9" />
        <path d="M18 7V9" />
    </svg>
);

export const CustomSmile = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M9 10H9.01M15 10H15.01" />
        <path d="M9 14.5A4 4 0 0015 14.5" />
    </svg>
);

export const CustomRuler = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5l8-8" />
        <path d="M8.5 19.5l8-8" />
        <path d="M4.5 16.5l4 3M12.5 8.5l4 3" />
        <path d="M7 16l1-1M9 14l1-1M11 12l1-1M13 10l1-1" />
    </svg>
);

export const CustomZoomIn = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="10" r="6" />
        <path d="M14 14L19 19" />
        <path d="M10 7V13M7 10H13" />
    </svg>
);

export const CustomMagnet = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 14V10A5 5 0 0117 10V14" />
        <path d="M7 15H17M7 15v3H5v-3h2zM17 15v3h2v-3h-2z" />
    </svg>
);

export const CustomPenTool = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 5L19 10" />
        <path d="M16 3L21 8L8 21H3V16L16 3Z" />
        <path d="M16 16v4h4" strokeDasharray="1 2" />
        <rect x="15" y="16" width="3" height="4" rx="1" />
        <path d="M16.5 18V19" />
    </svg>
);

export const CustomLock = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="11" width="12" height="9" rx="2" ry="2" />
        <path d="M8 11V7a4 4 0 018 0v4M12 14v2" />
    </svg>
);

export const CustomEye = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12c1.5-4 5.5-7 9.5-7s8 3 9.5 7c-1.5 4-5.5 7-9.5 7s-8-3-9.5-7z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

export const CustomEyeBrush = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12c1.5-4 5.5-7 9.5-7s8 3 9.5 7c-1.5 4-5.5 7-9.5 7s-8-3-9.5-7z" />
        <circle cx="12" cy="12" r="3" />
        <path d="M16 18c0 0-1.5 1.5-3 1.5s-1.5-.5-1.5-1 1.5-1.5 1.5-1.5" />
        <path d="M14.5 15.5L18 12l2 2-3.5 3.5" />
    </svg>
);

export const CustomTrash = ({ size = 20, color = "currentColor", strokeWidth = 1 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6H20" />
        <path d="M8 6V4H16V6" />
        <path d="M6 6v12A2 2 0 008 20h8a2 2 0 002-2V6" />
    </svg>
);

// --- Chart Type Icons ---

export const ChartBarsIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M8 6v12M5 14h3M8 10h3M16 4v12M13 12h3M16 8h3" /></svg>;
export const ChartCandlesIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><rect x="6" y="8" width="4" height="8" /><path d="M8 4v4M8 16v4" /><rect x="14" y="6" width="4" height="12" /><path d="M16 2v4M16 18v4" /></svg>;
export const ChartHollowCandlesIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1 1" {...props}><rect x="6" y="8" width="4" height="8" /><path d="M8 4v4M8 16v4" /><rect x="14" y="6" width="4" height="12" /><path d="M16 2v4M16 18v4" /></svg>;
export const ChartVolumeCandlesIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><rect x="5" y="8" width="6" height="8" /><path d="M8 4v4M8 16v4" /><rect x="13" y="6" width="6" height="12" /><path d="M16 2v4M16 18v4" /></svg>;
export const ChartHlcBarsIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M8 4v16M4 10h4M16 2v20M16 14h4" /></svg>;

export const ChartLineIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M2 20l7-10 5 4 8-12" /></svg>;
export const ChartLineMarkersIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M2 20l7-10 5 4 8-12" /><circle cx="9" cy="10" r="1.5" fill="currentColor" /><circle cx="14" cy="14" r="1.5" fill="currentColor" /><circle cx="22" cy="2" r="1.5" fill="currentColor" /></svg>;
export const ChartStepLineIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M2 20h6v-8h6v-6h8" /></svg>;

export const ChartAreaIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M2 20l7-10 5 4 8-12v18H2z" fill="currentColor" fillOpacity="0.2" /></svg>;
export const ChartHlcAreaIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M2 20l7-10 5 4 8-12v18H2z" fill="currentColor" fillOpacity="0.2" /><path d="M2 20l7-10 5 4 8-12" strokeDasharray="2 2" /></svg>;
export const ChartBaselineIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M2 20l7-10 5 4 8-12" /><path d="M0 12h24" strokeDasharray="2 2" /></svg>;

export const ChartColumnsIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><rect x="4" y="10" width="4" height="10" /><rect x="10" y="4" width="4" height="16" /><rect x="16" y="14" width="4" height="6" /></svg>;
export const ChartHighLowIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><rect x="6" y="6" width="4" height="12" /><rect x="14" y="2" width="4" height="20" /></svg>;

export const ChartHeikinAshiIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><rect x="6" y="8" width="4" height="8" fill="currentColor" /><path d="M8 4v4M8 16v4" /><rect x="14" y="6" width="4" height="12" fill="currentColor" /><path d="M16 2v4M16 18v4" /></svg>;
export const ChartRenkoIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><rect x="4" y="14" width="4" height="4" /><rect x="10" y="10" width="4" height="4" /><rect x="16" y="6" width="4" height="4" /></svg>;
export const ChartLineBreakIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><rect x="4" y="12" width="4" height="8" /><rect x="10" y="6" width="4" height="14" /><rect x="16" y="2" width="4" height="4" /></svg>;
export const ChartKagiIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M4 20V8h6v8h6V4" /></svg>;
export const ChartPointFigureIcon = (props: any) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...props}><path d="M4 16l4 4M8 16l-4 4M10 8l4 4M14 8l-4 4M16 16l4 4M20 16l-4 4" /></svg>;
