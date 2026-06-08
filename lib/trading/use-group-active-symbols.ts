'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SymbolInfo } from '@/types/webtrader';
import type { TerminalMarketCategory } from '@/lib/trading/terminal-symbols';
import type { ActiveSymbolsResponse } from '@/app/api/trading/symbols/group/active/route';

export interface GroupActiveSymbolsState {
  symbols: SymbolInfo[];
  byCategory: Record<TerminalMarketCategory, SymbolInfo[]>;
  total: number;
  catalogStatus: string;
  degraded: boolean;
  hasLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_BY_CATEGORY: Record<TerminalMarketCategory, SymbolInfo[]> = {
  forex: [],
  crypto: [],
  commodity: [],
  index: [],
};

const INITIAL_STATE: GroupActiveSymbolsState = {
  symbols: [],
  byCategory: EMPTY_BY_CATEGORY,
  total: 0,
  catalogStatus: 'unknown',
  degraded: false,
  hasLoaded: false,
  isLoading: false,
  error: null,
};

interface ScopedGroupActiveSymbolsState {
  requestKey: string | null;
  state: GroupActiveSymbolsState;
}

function createRequestKey(
  accountId: string | null | undefined,
  group: string | undefined,
  category: TerminalMarketCategory | undefined,
  disabled: boolean,
): string | null {
  if (!accountId || disabled) {
    return null;
  }

  return JSON.stringify({ accountId, group: group ?? null, category: category ?? null });
}

export function createGroupActiveSymbolsLoadingState(): GroupActiveSymbolsState {
  return {
    ...INITIAL_STATE,
    isLoading: true,
  };
}

export function createGroupActiveSymbolsErrorState(error: string): GroupActiveSymbolsState {
  return {
    ...INITIAL_STATE,
    hasLoaded: true,
    error,
  };
}

export interface UseGroupActiveSymbolsOptions {
  /** MT5 group name to scope results (optional — returns all groups when omitted) */
  group?: string;
  /** Market category filter: forex | crypto | commodity | index */
  category?: TerminalMarketCategory;
  /** Disable automatic fetching on mount (default: false) */
  disabled?: boolean;
}

export function useGroupActiveSymbols(
  accountId: string | null | undefined,
  options: UseGroupActiveSymbolsOptions = {},
): GroupActiveSymbolsState & { refresh: () => void } {
  const abortRef = useRef<AbortController | null>(null);
  const activeRequestKeyRef = useRef<string | null>(null);
  const { group, category, disabled = false } = options;
  const currentRequestKey = createRequestKey(accountId, group, category, disabled);
  const [scopedState, setScopedState] = useState<ScopedGroupActiveSymbolsState>({
    requestKey: null,
    state: INITIAL_STATE,
  });

  const fetch_ = useCallback(async () => {
    if (!accountId || !currentRequestKey) {
      abortRef.current?.abort();
      activeRequestKeyRef.current = null;
      setScopedState({ requestKey: null, state: INITIAL_STATE });
      return;
    }

    const requestKey = currentRequestKey;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    activeRequestKeyRef.current = requestKey;

    setScopedState({ requestKey, state: createGroupActiveSymbolsLoadingState() });

    try {
      const params = new URLSearchParams({ accountId });
      if (group) params.set('group', group);
      if (category) params.set('category', category);

      const response = await fetch(
        `/api/trading/symbols/group/active?${params.toString()}`,
        { signal: controller.signal, cache: 'no-store' },
      );

      const json = (await response.json()) as ActiveSymbolsResponse | { ok: false; error: string };

      if (controller.signal.aborted || activeRequestKeyRef.current !== requestKey) {
        return;
      }

      if (!json.ok) {
        setScopedState({
          requestKey,
          state: createGroupActiveSymbolsErrorState(
            'error' in json ? json.error : 'Failed to load symbols',
          ),
        });
        return;
      }

      const data = json as ActiveSymbolsResponse;
      setScopedState({
        requestKey,
        state: {
          symbols: data.symbols,
          byCategory: data.byCategory,
          total: data.total,
          catalogStatus: data.catalogStatus,
          degraded: data.degraded,
          hasLoaded: true,
          isLoading: false,
          error: null,
        },
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      if (controller.signal.aborted || activeRequestKeyRef.current !== requestKey) {
        return;
      }
      setScopedState({
        requestKey,
        state: createGroupActiveSymbolsErrorState(
          error instanceof Error ? error.message : 'Failed to load symbols',
        ),
      });
    }
  }, [accountId, group, category, currentRequestKey]);

  useEffect(() => {
    void fetch_();
    return () => { abortRef.current?.abort(); };
  }, [fetch_]);

  const state =
    scopedState.requestKey === currentRequestKey
      ? scopedState.state
      : currentRequestKey
        ? createGroupActiveSymbolsLoadingState()
        : INITIAL_STATE;

  return { ...state, refresh: () => { void fetch_(); } };
}
