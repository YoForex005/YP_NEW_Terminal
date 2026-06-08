import type { DashboardSnapshot } from "@/types/dashboard";

const createdAtFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "short",
});

const toTimestamp = (value: string): number => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatCreatedAt = (value: string): string => {
  const timestamp = toTimestamp(value);
  if (timestamp <= 0) {
    return value;
  }
  return createdAtFormatter.format(new Date(timestamp));
};

export const normalizeSnapshotTransactions = (
  snapshot: DashboardSnapshot,
): DashboardSnapshot => ({
  ...snapshot,
  transactions: [...snapshot.transactions]
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .map((transaction) => ({
      ...transaction,
      createdAt: formatCreatedAt(transaction.createdAt),
    })),
});

