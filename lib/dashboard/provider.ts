import type { DashboardSnapshot } from "@/types/dashboard";

export interface DashboardDataProvider {
  getSnapshot(): Promise<DashboardSnapshot>;
}

