/**
 * MT5 Server Time utilities.
 *
 * All timestamps from the MT5 broker (positions, orders, deals, OHLC candles)
 * are UTC milliseconds. This module formats and normalises them consistently
 * so every user — regardless of local timezone — sees the same broker time.
 *
 * Rule: store and process in UTC ms; display in UTC (or broker-configured tz).
 */

import { useWebtraderStore } from '@/store/webtrader-store';

// ─── Low-level helpers ───────────────────────────────────────────────────────

/**
 * Returns the latest MT5 server time in UTC ms, dynamically tracked from
 * live tick timestamps received from the broker. Falls back to Date.now()
 * if no tick has been received yet.
 */
export function getMt5ServerTimeMs(): number {
    try {
        const { mt5ServerTimeMs } = useWebtraderStore.getState();
        return mt5ServerTimeMs > 0 ? mt5ServerTimeMs : Date.now();
    } catch {
        return Date.now();
    }
}

/**
 * Normalises a raw MT5 timestamp value to UTC milliseconds.
 * Accepts: number (ms or s), Date object, ISO string, null/undefined.
 * Returns 0 for invalid inputs.
 */
export function toMt5Ms(value: unknown): number {
    if (!value && value !== 0) return 0;

    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) && ms > 0 ? ms : 0;
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        // Detect Unix-seconds vs Unix-ms threshold
        return value < 10_000_000_000 ? Math.trunc(value * 1000) : Math.trunc(value);
    }

    if (typeof value === 'string') {
        const asNum = Number(value);
        if (Number.isFinite(asNum) && asNum > 0) {
            return asNum < 10_000_000_000 ? Math.trunc(asNum * 1000) : Math.trunc(asNum);
        }
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    return 0;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Formats a UTC-ms timestamp as "MMM D, HH:MM:SS" in UTC.
 * Example: "Jun 07, 09:24:15"
 *
 * This is the canonical format for all trading timestamps (positions, orders,
 * deals, history). UTC is used so every user sees the same broker time.
 */
export function formatMt5DateTime(timestampMs: number | Date | string | null | undefined): string {
    const ms = timestampMs instanceof Date
        ? timestampMs.getTime()
        : toMt5Ms(timestampMs);

    if (!ms) return '—';

    const d = new Date(ms);
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day   = d.getUTCDate();
    const hh    = String(d.getUTCHours()).padStart(2, '0');
    const mm    = String(d.getUTCMinutes()).padStart(2, '0');
    const ss    = String(d.getUTCSeconds()).padStart(2, '0');
    return `${month} ${day}, ${hh}:${mm}:${ss}`;
}

/**
 * Formats as "MMM D, HH:MM" (no seconds) — compact display for tables.
 */
export function formatMt5DateTimeShort(timestampMs: number | Date | string | null | undefined): string {
    const ms = timestampMs instanceof Date
        ? timestampMs.getTime()
        : toMt5Ms(timestampMs);

    if (!ms) return '—';

    const d = new Date(ms);
    const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day   = d.getUTCDate();
    const hh    = String(d.getUTCHours()).padStart(2, '0');
    const mm    = String(d.getUTCMinutes()).padStart(2, '0');
    return `${month} ${day}, ${hh}:${mm}`;
}

/**
 * Returns the canonical MT5 timestamp string used throughout the terminal:
 * "YYYY-MM-DD HH:MM:SS" in UTC.
 *
 * Replaces all uses of `new Date().toISOString().replace('T',' ').slice(0,19)`.
 */
export function toMt5IsoString(timestampMs: number | Date | string | null | undefined): string {
    const ms = timestampMs instanceof Date
        ? timestampMs.getTime()
        : toMt5Ms(timestampMs);

    if (!ms) return new Date(getMt5ServerTimeMs()).toISOString().replace('T', ' ').slice(0, 19);

    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Returns "HH:MM:SS" in UTC — used for live clocks / last-refresh labels.
 */
export function formatMt5TimeOnly(timestampMs: number | Date | null | undefined): string {
    const ms = timestampMs instanceof Date ? timestampMs.getTime() : (timestampMs ?? 0);
    if (!ms) return '—';

    const d = new Date(ms);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

// ─── React hook ──────────────────────────────────────────────────────────────

/**
 * Returns a stable `formatMt5DateTime` function bound to the current store
 * state. Re-renders only when mt5ServerTimeMs changes, which is infrequent.
 */
export function useMt5TimeFormatter() {
    useWebtraderStore((s) => s.mt5ServerTimeMs);
    return formatMt5DateTime;
}
