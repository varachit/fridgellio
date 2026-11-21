import assert from "node:assert/strict";
import { test } from "node:test";
import { mockStatistics } from "../lib/statistics-mock.ts";

test("statistics mock supplies six current monthly comparisons", () => {
  const result = mockStatistics("2026-11-21");
  assert.equal(result.months.length, 6);
  assert.equal(result.months[0].month, "2026-06");
  assert.equal(result.months[5].month, "2026-11");
  assert.ok(result.months.every((month) => Number(month.used.g) > 0));
  assert.ok(result.months.every((month) => Number(month.expired.g) > 0));
  assert.ok(result.months.every((month) => Number(month.used.each) > 0));
  assert.ok(result.months.every((month) => Number(month.expired.ml) > 0));
  assert.ok(result.months.every((month) => Number(month.used_cost) > 0));
  assert.ok(result.months.every((month) => Number(month.expired_cost) > 0));
});
