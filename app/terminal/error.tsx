'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function TerminalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Terminal] route error boundary caught', error);
  }, [error]);

  return (
    <div
      className="flex h-[100dvh] w-full items-center justify-center bg-[#0e0f11] px-6 text-white"
      role="alert"
      aria-label="Terminal failed to load"
    >
      <div className="flex max-w-[420px] flex-col items-center text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-8 ring-red-500/5">
          <X className="h-6 w-6 text-red-400" strokeWidth={2.5} />
        </div>
        <p className="text-[17px] font-bold tracking-tight">Terminal Load Error</p>
        <p className="mt-3 text-[14px] leading-relaxed text-white/70">
          The terminal could not finish opening. Reload it once; if it still fails, reopen it from the client dashboard.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-[8px] bg-white px-6 py-2.5 text-[13px] font-bold tracking-wide text-[#0e0f11] shadow-sm transition-all hover:bg-white/90 active:scale-[0.98]"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-[8px] border border-white/15 px-6 py-2.5 text-[13px] font-bold tracking-wide text-white transition-all hover:bg-white/10 active:scale-[0.98]"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
