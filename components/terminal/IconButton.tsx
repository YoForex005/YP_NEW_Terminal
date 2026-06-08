import React from 'react';
import { LucideIcon } from 'lucide-react';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    size?: number;
    iconSize?: number;
    active?: boolean;
    className?: string;
    tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export function IconButton({
    icon: Icon,
    size = 32,
    iconSize = 18,
    active = false,
    className = '',
    title,
    tooltipPosition = 'right',
    ...props
}: IconButtonProps) {
    const positionClasses = {
        top: 'bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2',
        bottom: 'top-[calc(100%+6px)] left-1/2 -translate-x-1/2',
        left: 'right-[calc(100%+6px)] top-1/2 -translate-y-1/2',
        right: 'left-[calc(100%+6px)] top-1/2 -translate-y-1/2',
    };

    const arrowClasses = {
        top: 'bottom-[-5px] left-1/2 -translate-x-1/2 border-b border-r',
        bottom: 'top-[-5px] left-1/2 -translate-x-1/2 border-t border-l',
        left: 'right-[-5px] top-1/2 -translate-y-1/2 border-t border-r',
        right: 'left-[-5px] top-1/2 -translate-y-1/2 border-b border-l',
    };

    return (
        <div className="relative group/iconbtn flex-shrink-0">
            <button
                className={`flex items-center justify-center rounded-none transition-colors ${active
                    ? 'bg-[var(--bg-hover)] text-[hsl(142.09deg_70.56%_45.29%)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-bright)]'
                    } ${className}`}
                style={{ width: size, height: size }}
                {...props}
            >
                <Icon size={iconSize} strokeWidth={1.5} />
            </button>

            {title && (
                <div className={`absolute ${positionClasses[tooltipPosition]} px-2.5 py-1.5 bg-popover text-popover-foreground text-[12px] rounded-[4px] font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/iconbtn:opacity-100 transition-opacity z-[9999] shadow-none-[0_4px_12px_rgba(0,0,0,0.5)] border border-border [transition-delay:400ms]`}>
                    <div className={`absolute w-2 h-2 rotate-45 bg-popover border-border ${arrowClasses[tooltipPosition]} pointer-events-none`} />
                    <span className="relative z-10">{title}</span>
                </div>
            )}
        </div>
    );
}
