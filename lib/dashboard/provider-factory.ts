import { apiDashboardProvider } from "@/lib/dashboard/api-provider";
import { mockDashboardProvider } from "@/lib/dashboard/mock-provider";
import type { DashboardDataProvider } from "@/lib/dashboard/provider";

type DashboardDataSource = "mock" | "api";

const resolveDataSource = (): DashboardDataSource =>
  process.env.NEXT_PUBLIC_DASHBOARD_DATA_SOURCE === "mock" ? "mock" : "api";

export const createDashboardProvider = (): DashboardDataProvider => {
  return resolveDataSource() === "api" ? apiDashboardProvider : mockDashboardProvider;
};
