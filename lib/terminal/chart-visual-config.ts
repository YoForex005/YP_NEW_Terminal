export interface ChartResolutionOption {
  label: string;
  minutes: number;
}

export type ChartType = 'Bars' | 'Candles' | 'Hollow Candles' | 'Line';
export type ChartThemeName = 'Dark' | 'Light';

export const DEFAULT_CHART_TYPES: ChartType[] = ['Bars', 'Candles', 'Hollow Candles', 'Line'];

export const GLOBAL_CHART_TRANSPARENT_COLOR = 'rgba(0,0,0,0)';

// Volume occupies the bottom 20% of the pane. Both price.bottom and volume.top must
// equal (1 - VOLUME_HEIGHT) so they meet at exactly the same boundary with no gap.
const VOLUME_HEIGHT = 0.20;
export const GLOBAL_CHART_SCALE_MARGINS = {
  // Price renders from 5% (top) to 80% (bottom) — the remaining 20% belongs to volume.
  price: { top: 0.05, bottom: VOLUME_HEIGHT },
  // Volume renders from 80% to 100% — top must equal (1 - VOLUME_HEIGHT) = 0.80.
  volume: { top: 1 - VOLUME_HEIGHT, bottom: 0.0 },
} as const;

export const GLOBAL_CHART_PRICE_ONLY_SCALE_MARGINS = {
  top: GLOBAL_CHART_SCALE_MARGINS.price.top,
  bottom: 0.05,
} as const;

export const GLOBAL_CHART_LINE_WIDTHS = {
  crosshair: 1,
  lineSeries: 2,
} as const;

// Keep every symbol/timeframe on the same dense, large-candle visual window.
// A stronger min spacing prevents persisted/manual zoom from collapsing
// candles back into 1px dots, while a small right offset keeps the latest
// candle and price marker clear of the price scale.
export const GLOBAL_CHART_SPACING = {
  minBarSpacing: 12,
  rightOffset: 8,
} as const;

export const GLOBAL_CHART_VIEWPORT = {
  initialVisibleBars: 100,
  minInitialVisibleBars: 80,
  maxInitialVisibleBars: 300,
} as const;

const CHART_MIN_VISIBLE_PRICE_RANGE_RATIO = 0.0015;
const CHART_MIN_VISIBLE_PRICE_RANGE_TICKS = 200;
const CHART_MIN_VISIBLE_PRICE_RANGE_PIPS = 20;

const PROGRAMMATIC_BAR_SPACING_SUPPRESSION_EVENTS = 3;
const PROGRAMMATIC_BAR_SPACING_SUPPRESSION_WINDOW_MS = 250;

export interface ProgrammaticBarSpacingGuard {
  markProgrammaticChange(spacing?: unknown): void;
  shouldIgnoreSpacingChange(spacing: number, nowMs?: number): boolean;
}

export function createProgrammaticBarSpacingGuard(
  now: () => number = () => Date.now(),
): ProgrammaticBarSpacingGuard {
  let suppressedEventsRemaining = 0;
  let suppressUntilMs = 0;

  return {
    markProgrammaticChange() {
      suppressedEventsRemaining = Math.max(
        suppressedEventsRemaining,
        PROGRAMMATIC_BAR_SPACING_SUPPRESSION_EVENTS,
      );
      suppressUntilMs = Math.max(
        suppressUntilMs,
        now() + PROGRAMMATIC_BAR_SPACING_SUPPRESSION_WINDOW_MS,
      );
    },

    shouldIgnoreSpacingChange(spacing, nowMs = now()) {
      if (
        typeof spacing !== 'number' ||
        !Number.isFinite(spacing) ||
        spacing <= 0 ||
        suppressedEventsRemaining <= 0 ||
        nowMs > suppressUntilMs
      ) {
        return false;
      }

      suppressedEventsRemaining -= 1;
      return true;
    },
  };
}

// Shared MT5-style visual palette used by every symbol chart.
export const GLOBAL_CHART_THEME = {
  Dark: {
    background: '#131722',
    foreground: '#d1d4dc',
    text: '#d1d4dc',
    muted: '#787b86',
    border: 'rgba(42,46,57,0.8)',
    grid: 'rgba(42,46,57,0.6)',
    surfaceRaised: '#1e222d',
    accent: '#2962FF',
    up: '#2962FF',
    down: '#F23645',
    volumeUp: 'rgba(41, 98, 255, 0.5)',
    volumeDown: 'rgba(242, 54, 69, 0.5)',
  },
  Light: {
    background: '#ffffff',
    foreground: '#131722',
    text: '#1f2937',
    muted: '#6b7280',
    border: 'rgba(42,46,57,0.3)',
    grid: 'rgba(42,46,57,0.15)',
    surfaceRaised: '#f2f4f6',
    accent: '#2962FF',
    up: '#2962FF',
    down: '#F23645',
    volumeUp: 'rgba(41, 98, 255, 0.35)',
    volumeDown: 'rgba(242, 54, 69, 0.35)',
  },
} as const;

export type GlobalChartPalette = (typeof GLOBAL_CHART_THEME)[ChartThemeName];

export const DEFAULT_CHART_RESOLUTIONS: ChartResolutionOption[] = [
  { label: '1m', minutes: 1 },
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
  { label: '4h', minutes: 240 },
  { label: '1D', minutes: 1440 },
];

export function getGlobalChartBarSpacing(timeframeMinutes: number): number {
  return timeframeMinutes >= 1440 ? 20 : 18;
}

export function getChartPipSizeFromPrecision(precision: number): number {
  const digits = Number.isFinite(precision) ? Math.max(0, Math.floor(precision)) : 0;

  return digits === 3 || digits >= 4
    ? 1 / Math.pow(10, digits - 1)
    : 1 / Math.pow(10, digits);
}

export function getChartMinVisiblePriceRange(anchorPrice: number, precision: number): number {
  const digits = Number.isFinite(precision) ? Math.max(0, Math.floor(precision)) : 0;
  const tickSize = 1 / Math.pow(10, digits);
  const pipSize = getChartPipSizeFromPrecision(digits);
  const normalizedAnchor = Number.isFinite(anchorPrice) && anchorPrice > 0 ? anchorPrice : 1;

  return Math.max(
    tickSize * CHART_MIN_VISIBLE_PRICE_RANGE_TICKS,
    pipSize * CHART_MIN_VISIBLE_PRICE_RANGE_PIPS,
    normalizedAnchor * CHART_MIN_VISIBLE_PRICE_RANGE_RATIO,
  );
}

export function expandPriceRangeToMinVisibleRange(
  priceRange: { minValue: number; maxValue: number },
  precision: number,
): { minValue: number; maxValue: number } {
  const minValue = Number(priceRange.minValue);
  const maxValue = Number(priceRange.maxValue);

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return priceRange;
  }

  const midpoint = (minValue + maxValue) / 2;
  const currentRange = Math.max(0, maxValue - minValue);
  const minVisibleRange = getChartMinVisiblePriceRange(Math.max(Math.abs(midpoint), 1), precision);

  if (currentRange >= minVisibleRange) {
    return priceRange;
  }

  const halfRange = minVisibleRange / 2;
  return {
    minValue: midpoint - halfRange,
    maxValue: midpoint + halfRange,
  };
}

export function getGlobalChartVisualConfig(
  theme: ChartThemeName,
  timeframeMinutes: number,
) {
  const palette = GLOBAL_CHART_THEME[theme];

  return {
    colors: {
      background: palette.background,
      foreground: palette.foreground,
      text: palette.text,
      muted: palette.muted,
      border: palette.border,
      grid: palette.grid,
      surfaceRaised: palette.surfaceRaised,
      accent: palette.accent,
      up: palette.up,
      down: palette.down,
      bullCandle: palette.up,
      bearCandle: palette.down,
      barUp: palette.up,
      barDown: palette.down,
      lineChart: palette.up,
      volumeUp: palette.volumeUp,
      volumeDown: palette.volumeDown,
    },
    timeScale: {
      barSpacing: getGlobalChartBarSpacing(timeframeMinutes),
      minBarSpacing: GLOBAL_CHART_SPACING.minBarSpacing,
      rightOffset: GLOBAL_CHART_SPACING.rightOffset,
      initialVisibleBars: GLOBAL_CHART_VIEWPORT.initialVisibleBars,
    },
    scaleMargins: GLOBAL_CHART_SCALE_MARGINS,
    lineWidths: GLOBAL_CHART_LINE_WIDTHS,
    transparentColor: GLOBAL_CHART_TRANSPARENT_COLOR,
    resolutions: DEFAULT_CHART_RESOLUTIONS,
  };
}
