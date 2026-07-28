import type { OHLCBar } from '@/lib/terminal/ohlcWebSocketService';

export const TERMINAL_CHART_SWITCH_SEED_LIMIT = 100;

export interface TerminalChartSwitchSeed {
    key: string;
    accountSessionScopeId: string | null;
    symbol: string;
    timeframeMinutes: number;
    bars: OHLCBar[];
    preparedAtMs: number;
}

const MAX_TERMINAL_CHART_SWITCH_SEEDS = 64;
const terminalChartSwitchSeeds = new Map<string, TerminalChartSwitchSeed>();

export function getTerminalChartSwitchSeedKey(
    accountSessionScopeId: string | null | undefined,
    symbol: string,
    timeframeMinutes: number,
) {
    return [
        accountSessionScopeId ?? 'terminal',
        symbol.trim().toUpperCase(),
        timeframeMinutes,
    ].join(':');
}

export function precomputeTerminalChartSwitchSeed(input: {
    accountSessionScopeId?: string | null;
    symbol: string;
    timeframeMinutes: number;
    bars: OHLCBar[];
    limit?: number;
}) {
    const symbol = input.symbol.trim();
    if (!symbol) {
        return null;
    }

    const limit = Math.max(1, input.limit ?? TERMINAL_CHART_SWITCH_SEED_LIMIT);
    const key = getTerminalChartSwitchSeedKey(input.accountSessionScopeId, symbol, input.timeframeMinutes);
    const seed: TerminalChartSwitchSeed = {
        key,
        accountSessionScopeId: input.accountSessionScopeId ?? null,
        symbol,
        timeframeMinutes: input.timeframeMinutes,
        bars: input.bars.slice(-limit).map((bar) => ({ ...bar })),
        preparedAtMs: globalThis.performance?.now?.() ?? Date.now(),
    };

    terminalChartSwitchSeeds.delete(key);
    terminalChartSwitchSeeds.set(key, seed);
    while (terminalChartSwitchSeeds.size > MAX_TERMINAL_CHART_SWITCH_SEEDS) {
        const oldestKey = terminalChartSwitchSeeds.keys().next().value;
        if (!oldestKey) {
            break;
        }
        terminalChartSwitchSeeds.delete(oldestKey);
    }

    return seed;
}

export function getTerminalChartSwitchSeed(
    accountSessionScopeId: string | null | undefined,
    symbol: string,
    timeframeMinutes: number,
) {
    const key = getTerminalChartSwitchSeedKey(accountSessionScopeId, symbol, timeframeMinutes);
    const seed = terminalChartSwitchSeeds.get(key);
    if (!seed) {
        return null;
    }

    terminalChartSwitchSeeds.delete(key);
    terminalChartSwitchSeeds.set(key, seed);
    return {
        ...seed,
        bars: seed.bars.map((bar) => ({ ...bar })),
    };
}
