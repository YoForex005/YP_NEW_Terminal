'use client';

import { useState } from 'react';

interface ToolItem {
    id: string;
    icon: React.ReactNode;
    label: string;
}

const tools: ToolItem[] = [
    {
        id: 'crosshair',
        label: 'Crosshair',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /></svg>,
    },
    {
        id: 'line',
        label: 'Trend Line',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="20" x2="20" y2="4" /></svg>,
    },
    {
        id: 'hline',
        label: 'Horizontal Line',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="22" y2="12" /></svg>,
    },
    {
        id: 'rectangle',
        label: 'Rectangle',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="1" /></svg>,
    },
    {
        id: 'fibonacci',
        label: 'Fibonacci',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 20h18M3 15h18M3 10h12M3 5h6" strokeLinecap="round" /></svg>,
    },
    {
        id: 'measure',
        label: 'Measure',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4m12 0h4M6 8v8M18 8v8" /></svg>,
    },
    {
        id: 'text',
        label: 'Text',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>,
    },
    {
        id: 'brush',
        label: 'Brush',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
    },
    {
        id: 'eraser',
        label: 'Eraser',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16l9-9 8 8-3 5z" /><line x1="6" y1="11" x2="13" y2="18" /></svg>,
    },
    {
        id: 'magnet',
        label: 'Magnet',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v6a6 6 0 0 0 12 0V2" /><line x1="6" y1="6" x2="6" y2="2" /><line x1="18" y1="6" x2="18" y2="2" /></svg>,
    },
    {
        id: 'eye',
        label: 'Show/Hide',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>,
    },
    {
        id: 'lock',
        label: 'Lock',
        icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
    },
];

export default function ChartToolbar() {
    const [activeTool, setActiveTool] = useState<string>('crosshair');

    return (
        <div className="flex flex-col items-center py-2 w-[40px] h-full border-l border-border flex-shrink-0 bg-background">
            {tools.map((tool, i) => (
                <div key={tool.id}>
                    <button
                        onClick={() => setActiveTool(tool.id)}
                        className={`w-[34px] h-[34px] flex items-center justify-center rounded-none transition-all duration-150 ${activeTool === tool.id
                            ? 'text-primary bg-accent'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            }`}
                        title={tool.label}
                    >
                        {tool.icon}
                    </button>
                    {/* Separator after certain groups */}
                    {(i === 0 || i === 4 || i === 7 || i === 9) && (
                        <div className="w-[20px] h-px bg-border mx-auto my-1" />
                    )}
                </div>
            ))}
        </div>
    );
}

