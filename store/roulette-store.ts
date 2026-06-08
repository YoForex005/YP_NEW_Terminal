"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface RouletteResult {
    number: number;
    color: "red" | "black" | "green";
    won: boolean;
    pointsEarned: number;
    betType: "number" | "color";
    timestamp: number;
}

interface RouletteState {
    totalPoints: number;
    history: RouletteResult[];
    addPoints: (n: number) => void;
    recordResult: (result: RouletteResult) => void;
    resetPoints: () => void;
}

const fallbackStorage: Storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    get length() {
        return 0;
    },
};

export const useRouletteStore = create<RouletteState>()(
    persist(
        (set) => ({
            totalPoints: 0,
            history: [],
            addPoints: (n) =>
                set((state) => ({ totalPoints: state.totalPoints + n })),
            recordResult: (result) =>
                set((state) => ({
                    totalPoints: state.totalPoints + result.pointsEarned,
                    history: [result, ...state.history].slice(0, 10),
                })),
            resetPoints: () => set({ totalPoints: 0, history: [] }),
        }),
        {
            name: "dominion-roulette-v1",
            storage: createJSONStorage(() =>
                typeof window === "undefined" ? fallbackStorage : localStorage,
            ),
            partialize: (state) => ({
                totalPoints: state.totalPoints,
                history: state.history,
            }),
        },
    ),
);
