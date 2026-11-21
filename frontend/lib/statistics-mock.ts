import type { GroceryStatistics, StatisticAmounts } from "./queries";

const samples: [StatisticAmounts, StatisticAmounts, string, string][] = [
  [
    { each: "18", g: "4250", ml: "3200" },
    { each: "3", g: "620", ml: "750" },
    "486.50",
    "92.75",
  ],
  [
    { each: "22", g: "5100", ml: "2800" },
    { each: "2", g: "480", ml: "500" },
    "542.00",
    "68.50",
  ],
  [
    { each: "16", g: "3900", ml: "4100" },
    { each: "4", g: "850", ml: "1000" },
    "475.25",
    "126.00",
  ],
  [
    { each: "25", g: "5700", ml: "3600" },
    { each: "1", g: "350", ml: "250" },
    "618.75",
    "44.25",
  ],
  [
    { each: "20", g: "4650", ml: "3000" },
    { each: "3", g: "710", ml: "600" },
    "531.00",
    "89.50",
  ],
  [
    { each: "27", g: "6200", ml: "4500" },
    { each: "2", g: "400", ml: "500" },
    "672.50",
    "58.00",
  ],
];

function monthKey(day: Date, offset: number) {
  const month = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + offset, 1),
  );
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function mockStatistics(day: string): GroceryStatistics {
  const current = new Date(`${day}T00:00:00Z`);
  return {
    months: samples.map(([used, expired, usedCost, expiredCost], index) => ({
      month: monthKey(current, index - samples.length + 1),
      used,
      expired,
      used_cost: usedCost,
      expired_cost: expiredCost,
    })),
  };
}
