import { MOCK_DASHBOARD_SNAPSHOT } from "@/lib/mock-data";
import type { DashboardDataProvider } from "@/lib/dashboard/provider";
import type { DashboardSnapshot } from "@/types/dashboard";

const cloneSnapshot = (snapshot: DashboardSnapshot): DashboardSnapshot => ({
  marketInstruments: snapshot.marketInstruments.map((item) => {
    // Randomize score and trend slightly to simulate market movement
    const fluctuation = Math.floor(Math.random() * 11) - 5; // -5 to +5
    const newScore = Math.max(-75, Math.min(75, item.score + fluctuation));

    let newTrend = item.trend;
    if (newScore > 20) newTrend = "Bullish";
    else if (newScore < -20) newTrend = "Bearish";
    else newTrend = "Neutral";

    return {
      ...item,
      score: newScore,
      trend: newTrend as any
    };
  }),
  tradingSessions: snapshot.tradingSessions.map((item) => ({ ...item })),
  wallets: { ...snapshot.wallets },
  positions: snapshot.positions.map((item) => ({ ...item })),
  transactions: snapshot.transactions.map((item) => ({ ...item })),
  pnlSeries: snapshot.pnlSeries.map((item) => ({ ...item })),
  tradingAccounts: snapshot.tradingAccounts.map((item) => ({ ...item })),
});

export const mockDashboardProvider: DashboardDataProvider = {
  async getSnapshot() {
    await new Promise((resolve) => setTimeout(resolve, 250)); // Slight delay for effect
    return cloneSnapshot(MOCK_DASHBOARD_SNAPSHOT);
  },
};

