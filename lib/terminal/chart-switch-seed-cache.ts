import type { OHLCBar } from '@/lib/terminal/ohlcWebSocketService';

export const TERMINAL_CHART_SWITCH_SEED_LIMIT = 100;
export const TERMINAL_CHART_SNAPSHOT_LIMIT = 2_000;
export const MAX_TERMINAL_CHART_SNAPSHOTS = 64;

export type TerminalChartSnapshotPhase = 'warming' | 'ready';

/** Backward-compatible, lightweight seed returned during a chart switch. */
export interface TerminalChartSwitchSeed {
    key: string;
    accountSessionScopeId: string | null;
    symbol: string;
    timeframeMinutes: number;
    bars: OHLCBar[];
    preparedAtMs: number;
}

/** A synchronized ready entry may be revealed again without another loader. */
export interface TerminalChartSessionSnapshot extends TerminalChartSwitchSeed {
    phase: TerminalChartSnapshotPhase;
    revision: number;
    updatedAtMs: number;
    readyAtMs: number | null;
}

export type TerminalChartSnapshotIdentity = {
    accountSessionScopeId?: string | null;
    symbol: string;
    timeframeMinutes: number;
};

export type TerminalChartSnapshotWrite = TerminalChartSnapshotIdentity & {
    bars?: OHLCBar[];
    limit?: number;
};

const terminalChartSnapshots = new Map<string, TerminalChartSessionSnapshot>();

function normalizeAccountSessionScopeId(accountSessionScopeId: string | null | undefined) {
    return accountSessionScopeId?.trim() || null;
}

function normalizeSymbol(symbol: string) {
    return symbol.trim().toUpperCase();
}

function nowPreparedAtMs() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function cloneBars(bars: OHLCBar[], limit: number) {
    return bars.slice(-Math.max(1, limit)).map((bar) => ({ ...bar }));
}

function cloneSnapshot(snapshot: TerminalChartSessionSnapshot): TerminalChartSessionSnapshot {
    return {
        ...snapshot,
        bars: snapshot.bars.map((bar) => ({ ...bar })),
    };
}

function toSwitchSeed(
    snapshot: TerminalChartSessionSnapshot,
    limit = TERMINAL_CHART_SWITCH_SEED_LIMIT,
): TerminalChartSwitchSeed {
    return {
        key: snapshot.key,
        accountSessionScopeId: snapshot.accountSessionScopeId,
        symbol: snapshot.symbol,
        timeframeMinutes: snapshot.timeframeMinutes,
        bars: cloneBars(snapshot.bars, limit),
        preparedAtMs: snapshot.preparedAtMs,
    };
}

function touchSnapshot(key: string, snapshot: TerminalChartSessionSnapshot) {
    terminalChartSnapshots.delete(key);
    terminalChartSnapshots.set(key, snapshot);
}

function enforceSnapshotLimit() {
    while (terminalChartSnapshots.size > MAX_TERMINAL_CHART_SNAPSHOTS) {
        const oldestKey = terminalChartSnapshots.keys().next().value;
        if (!oldestKey) {
            break;
        }
        terminalChartSnapshots.delete(oldestKey);
    }
}

export function getTerminalChartSwitchSeedKey(
    accountSessionScopeId: string | null | undefined,
    symbol: string,
    timeframeMinutes: number,
) {
    return [
        normalizeAccountSessionScopeId(accountSessionScopeId) ?? 'terminal',
        normalizeSymbol(symbol),
        timeframeMinutes,
    ].join(':');
}

/**
 * Mark a chart as warming. This is monotonic: once a chart is ready, remounts
 * and ordinary optimistic prewarm calls cannot put it behind a loader again.
 */
export function markTerminalChartSnapshotWarming(input: TerminalChartSnapshotWrite) {
    const symbol = input.symbol.trim();
    if (!symbol) {
        return null;
    }

    const accountSessionScopeId = normalizeAccountSessionScopeId(input.accountSessionScopeId);
    const key = getTerminalChartSwitchSeedKey(
        accountSessionScopeId,
        symbol,
        input.timeframeMinutes,
    );
    const existing = terminalChartSnapshots.get(key);
    if (existing?.phase === 'ready') {
        touchSnapshot(key, existing);
        return cloneSnapshot(existing);
    }

    const snapshot: TerminalChartSessionSnapshot = {
        key,
        accountSessionScopeId,
        symbol,
        timeframeMinutes: input.timeframeMinutes,
        bars: cloneBars(
            input.bars ?? existing?.bars ?? [],
            input.limit ?? TERMINAL_CHART_SWITCH_SEED_LIMIT,
        ),
        preparedAtMs: nowPreparedAtMs(),
        phase: 'warming',
        revision: (existing?.revision ?? 0) + 1,
        updatedAtMs: Date.now(),
        readyAtMs: null,
    };

    touchSnapshot(key, snapshot);
    enforceSnapshotLimit();
    return cloneSnapshot(snapshot);
}

/**
 * Atomically publish reconciled history + live candles. Empty input is never
 * ready, and a rejected publish leaves the previous registry entry untouched.
 */
export function publishTerminalChartReadySnapshot(input: TerminalChartSnapshotWrite) {
    const symbol = input.symbol.trim();
    const bars = input.bars ?? [];
    const accountSessionScopeId = normalizeAccountSessionScopeId(input.accountSessionScopeId);
    // Ready snapshots are reusable across component lifetimes, so they require a
    // concrete account/session identity. The generic null scope is safe only for
    // provisional seeds and must never leak readiness between sessions.
    if (!accountSessionScopeId || !symbol || bars.length === 0) {
        return null;
    }

    const key = getTerminalChartSwitchSeedKey(
        accountSessionScopeId,
        symbol,
        input.timeframeMinutes,
    );
    const existing = terminalChartSnapshots.get(key);
    const publishedAtMs = Date.now();
    const snapshot: TerminalChartSessionSnapshot = {
        key,
        accountSessionScopeId,
        symbol,
        timeframeMinutes: input.timeframeMinutes,
        bars: cloneBars(bars, input.limit ?? TERMINAL_CHART_SNAPSHOT_LIMIT),
        preparedAtMs: nowPreparedAtMs(),
        phase: 'ready',
        revision: (existing?.revision ?? 0) + 1,
        updatedAtMs: publishedAtMs,
        readyAtMs: publishedAtMs,
    };

    touchSnapshot(key, snapshot);
    enforceSnapshotLimit();
    return cloneSnapshot(snapshot);
}

export function getTerminalChartSnapshot(
    accountSessionScopeId: string | null | undefined,
    symbol: string,
    timeframeMinutes: number,
) {
    const key = getTerminalChartSwitchSeedKey(accountSessionScopeId, symbol, timeframeMinutes);
    const snapshot = terminalChartSnapshots.get(key);
    if (!snapshot) {
        return null;
    }

    touchSnapshot(key, snapshot);
    return cloneSnapshot(snapshot);
}

export function getTerminalChartReadySnapshot(
    accountSessionScopeId: string | null | undefined,
    symbol: string,
    timeframeMinutes: number,
) {
    if (!normalizeAccountSessionScopeId(accountSessionScopeId)) {
        return null;
    }

    const snapshot = getTerminalChartSnapshot(
        accountSessionScopeId,
        symbol,
        timeframeMinutes,
    );
    return snapshot?.phase === 'ready' ? snapshot : null;
}

/** Remove one chart snapshot after a hard render/data-integrity failure. */
export function invalidateTerminalChartSnapshot(input: TerminalChartSnapshotIdentity) {
    const key = getTerminalChartSwitchSeedKey(
        input.accountSessionScopeId,
        input.symbol,
        input.timeframeMinutes,
    );
    return terminalChartSnapshots.delete(key);
}

/** Remove all chart states belonging to exactly one account/session scope. */
export function invalidateTerminalChartSessionSnapshots(
    accountSessionScopeId: string | null | undefined,
) {
    const normalizedScopeId = normalizeAccountSessionScopeId(accountSessionScopeId);
    let invalidatedCount = 0;

    for (const [key, snapshot] of terminalChartSnapshots) {
        if (snapshot.accountSessionScopeId !== normalizedScopeId) {
            continue;
        }
        terminalChartSnapshots.delete(key);
        invalidatedCount += 1;
    }

    return invalidatedCount;
}

/** Primarily useful for logout and deterministic tests. */
export function clearTerminalChartSnapshots() {
    const clearedCount = terminalChartSnapshots.size;
    terminalChartSnapshots.clear();
    return clearedCount;
}

export function precomputeTerminalChartSwitchSeed(input: {
    accountSessionScopeId?: string | null;
    symbol: string;
    timeframeMinutes: number;
    bars: OHLCBar[];
    limit?: number;
}) {
    const snapshot = markTerminalChartSnapshotWarming(input);
    return snapshot ? toSwitchSeed(snapshot, input.limit) : null;
}

export function getTerminalChartSwitchSeed(
    accountSessionScopeId: string | null | undefined,
    symbol: string,
    timeframeMinutes: number,
) {
    const snapshot = getTerminalChartSnapshot(
        accountSessionScopeId,
        symbol,
        timeframeMinutes,
    );
    return snapshot ? toSwitchSeed(snapshot) : null;
}
