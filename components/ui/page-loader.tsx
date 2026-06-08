"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

export function PageLoader() {
    const pathname = usePathname();
    const [progress, setProgress] = useState(0);
    const [visible, setVisible] = useState(false);
    const prevPathname = useRef(pathname);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const cleanup = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (prevPathname.current === pathname) return;
        prevPathname.current = pathname;

        cleanup();
        setVisible(true);
        setProgress(80);

        timeoutRef.current = setTimeout(() => {
            setProgress(100);
            timeoutRef.current = setTimeout(() => {
                setVisible(false);
                setProgress(0);
            }, 100);
        }, 80);

        return cleanup;
    }, [pathname, cleanup]);

    if (!visible) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px]">
            <div
                className="h-full bg-primary shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                style={{
                    width: `${progress}%`,
                    transition: `width ${progress === 100 ? '80ms' : '120ms'} ease-out`,
                }}
            />
        </div>
    );
}
