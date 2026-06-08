export function shouldAllowSyntheticMarketData(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_SYNTHETIC_MARKET_DATA === 'true';
}
