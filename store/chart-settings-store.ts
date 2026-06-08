import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Mt5ChartType = 'Bar' | 'Candlesticks' | 'Line';
export type ColorScheme = 'Green on Black' | 'Black on White' | 'Yellow on Black' | 'Custom';

export interface Mt5Colors {
    background: string;
    foreground: string;
    grid: string;
    barUp: string;
    barDown: string;
    bullCandle: string;
    bearCandle: string;
    lineChart: string;
    volumes: string;
    bidPriceLine: string;
    askPriceLine: string;
    lastPriceLine: string;
    stopLevels: string;
}

const GREEN_ON_BLACK: Mt5Colors = {
    background: '#0e0e12',
    foreground: '#ffffff',
    grid: 'rgba(255,255,255,0.15)',
    barUp: '#10B981',
    barDown: '#EF4444',
    bullCandle: '#10B981',
    bearCandle: '#EF4444',
    lineChart: '#10B981',
    volumes: 'rgba(34, 197, 94, 0.4)',
    bidPriceLine: '#778899',
    askPriceLine: '#EF4444',
    lastPriceLine: '#00C000',
    stopLevels: '#EF4444',
};

const BLACK_ON_WHITE: Mt5Colors = {
    background: '#ffffff',
    foreground: '#000000',
    grid: '#e2e8f0',
    barUp: '#000000',
    barDown: '#000000',
    bullCandle: '#ffffff',
    bearCandle: '#000000',
    lineChart: '#000000',
    volumes: 'rgba(0, 0, 0, 0.4)',
    bidPriceLine: '#64748b',
    askPriceLine: '#dc2626',
    lastPriceLine: '#16a34a',
    stopLevels: '#dc2626',
};

const YELLOW_ON_BLACK: Mt5Colors = {
    background: '#000000',
    foreground: '#ffffff',
    grid: '#333333',
    barUp: '#eab308',
    barDown: '#eab308',
    bullCandle: '#000000',
    bearCandle: '#ffffff',
    lineChart: '#eab308',
    volumes: 'rgba(234, 179, 8, 0.4)',
    bidPriceLine: '#94a3b8',
    askPriceLine: '#ef4444',
    lastPriceLine: '#22c55e',
    stopLevels: '#ef4444',
};

export interface ChartSettingsState {
    // Candles (legacy flat fields — kept for compatibility)
    colorBasedOnPrevClose: boolean;
    showBody: boolean;
    bodyUpColor: string;
    bodyDownColor: string;
    showBorders: boolean;
    borderUpColor: string;
    borderDownColor: string;
    showWick: boolean;
    wickUpColor: string;
    wickDownColor: string;

    // Status Line
    showTitle: boolean;
    showChartValues: boolean;
    showBarChangeValues: boolean;
    showVolume: boolean;
    bgOpacity: number;

    // Scales and Lines
    showPriceLabel: boolean;

    // Canvas
    showGridLines: boolean;
    showSessionBreaks: boolean;
    crosshairDashed: boolean;
    showWatermark: boolean;

    // Trading / chart behavior
    oneClickTrading: boolean;
    autoScroll: boolean;
    chartShift: boolean;

    // ── MT5-style Properties dialog (Common / Show / Colors) ──
    mt5ChartType: Mt5ChartType;
    chartOnForeground: boolean;
    scaleFixOneToOne: boolean;
    scaleFix: boolean;
    fixedMaximum: number;
    fixedMinimum: number;

    showTicker: boolean;
    showOHLC: boolean;
    showQuickTradingButtons: boolean;
    showBidPriceLine: boolean;
    showAskPriceLine: boolean;
    showLastPriceLine: boolean;
    showPeriodSeparators: boolean;
    showTickVolumes: boolean;
    showRealVolumes: boolean;
    showObjectDescriptions: boolean;
    showTradeLevels: boolean;
    showTradeHistory: boolean;

    colorScheme: ColorScheme;
    colors: Mt5Colors;

    // Actions
    updateSettings: (updates: Partial<Omit<ChartSettingsState, 'updateSettings' | 'updateColor' | 'applyPresetScheme'>>) => void;
    updateColor: (key: keyof Mt5Colors, value: string) => void;
    applyPresetScheme: (scheme: ColorScheme) => void;
}

export const useChartSettingsStore = create<ChartSettingsState>()(
    persist(
        (set) => ({
            colorBasedOnPrevClose: false,
            showBody: true,
            bodyUpColor: '#26a69a',
            bodyDownColor: '#ef5350',
            showBorders: false,
            borderUpColor: '#26a69a',
            borderDownColor: '#ef5350',
            showWick: true,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',

            showTitle: true,
            showChartValues: true,
            showBarChangeValues: true,
            showVolume: false,
            bgOpacity: 0,

            showPriceLabel: true,

            showGridLines: true,
            showSessionBreaks: false,
            crosshairDashed: true,
            showWatermark: false,

            oneClickTrading: false,
            autoScroll: true,
            chartShift: false,

            mt5ChartType: 'Candlesticks',
            chartOnForeground: false,
            scaleFixOneToOne: false,
            scaleFix: false,
            fixedMaximum: 0,
            fixedMinimum: 0,

            showTicker: true,
            showOHLC: false,
            showQuickTradingButtons: true,
            showBidPriceLine: true,
            showAskPriceLine: false,
            showLastPriceLine: false,
            showPeriodSeparators: false,
            showTickVolumes: true,
            showRealVolumes: false,
            showObjectDescriptions: false,
            showTradeLevels: true,
            showTradeHistory: true,

            colorScheme: 'Green on Black',
            colors: { ...GREEN_ON_BLACK },

            updateSettings: (updates) => set((state) => ({ ...state, ...updates })),
            updateColor: (key, value) => set((state) => ({
                ...state,
                colorScheme: 'Custom',
                colors: { ...state.colors, [key]: value },
            })),
            applyPresetScheme: (scheme) => set((state) => {
                const next = scheme === 'Green on Black' ? GREEN_ON_BLACK
                    : scheme === 'Black on White' ? BLACK_ON_WHITE
                    : scheme === 'Yellow on Black' ? YELLOW_ON_BLACK
                    : state.colors;
                return { ...state, colorScheme: scheme, colors: { ...next } };
            }),
        }),
        {
            name: 'chart-settings-storage',
        }
    )
);
