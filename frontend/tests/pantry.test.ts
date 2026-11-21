import { test } from "node:test";
import assert from "node:assert/strict";
import {
  localDay,
  validDate,
  quantityError,
  priceError,
  packageMeasurement,
  eligibleEntries,
  displayName,
  expiredEntries,
  type Stock,
} from "../lib/pantry.ts";

test("expiry alerts count positive stock entries strictly before the local day", () => {
  const base: Stock = {
    id: "1",
    name: "Spinach",
    name_en: null,
    name_th: "ผักโขม",
    location: "fridge",
    unit: "g",
    quantity: "100",
    price: null,
    expiry_date: "2026-11-20",
    expiry_status: "due_today",
  };
  const stock: Stock[] = [
    base,
    { ...base, id: "2", expiry_date: "2026-11-19" },
    { ...base, id: "3", expiry_date: "2026-11-21" },
    { ...base, id: "4", expiry_date: "2026-11-22" },
    { ...base, id: "5", expiry_date: null },
    { ...base, id: "6", quantity: "0" },
  ];
  assert.deepEqual(
    expiredEntries(stock, "2026-11-21").map((item) => item.id),
    ["2", "1"],
  );
  assert.deepEqual(
    expiredEntries(stock, "2026-11-22").map((item) => item.id),
    ["2", "1", "3"],
  );
  assert.equal(stock[0], base, "Sorting alerts does not reorder the inventory");
  assert.deepEqual(expiredEntries([], "2026-11-21"), []);
});

test("quantities preserve database precision and whole-item rules", () => {
  assert.equal(quantityError("1.5", "each"), "whole");
  assert.equal(quantityError("1.000000", "each"), null);
  for (const invalid of [
    "0",
    "-1",
    "1e3",
    "1.0000001",
    "1000000000000",
    "NaN",
    "",
  ])
    assert.equal(quantityError(invalid, "g"), "quantity");
  assert.equal(quantityError("0.15", "kg"), null);
  assert.equal(
    quantityError("999999999999.999999", "g", "999999999999.999998"),
    "insufficient_stock",
  );
});

test("prices accept optional Thai baht amounts with two decimals", () => {
  assert.equal(priceError(""), null);
  assert.equal(priceError("0"), null);
  assert.equal(priceError("42.50"), null);
  assert.equal(priceError("-1"), "price");
  assert.equal(priceError("12.345"), "price");
  assert.equal(priceError("10000000000.00"), "price");
});
test("barcode package measurements prefill valid stock quantities and units", () => {
  assert.deepEqual(packageMeasurement(170, " G "), {
    quantity: "170",
    unit: "g",
  });
  assert.deepEqual(packageMeasurement(0.25, "kg"), {
    quantity: "0.25",
    unit: "kg",
  });
  assert.deepEqual(packageMeasurement(6, "each"), {
    quantity: "6",
    unit: "each",
  });
  assert.deepEqual(packageMeasurement(250, "mg"), {
    quantity: "0.25",
    unit: "g",
  });
  assert.deepEqual(packageMeasurement(33, "cl"), {
    quantity: "330",
    unit: "ml",
  });
  assert.deepEqual(packageMeasurement(1, "oz"), {
    quantity: "28.349523",
    unit: "g",
  });

  assert.equal(packageMeasurement(null, "g"), null);
  assert.equal(packageMeasurement(12, null), null);
  assert.equal(packageMeasurement(1, "bottle"), null);
  assert.equal(packageMeasurement(1.5, "each"), null);
  assert.equal(packageMeasurement(Infinity, "lb"), null);
  assert.equal(packageMeasurement(0, "ml"), null);
});
test("expiry uses local calendar days and validates leap dates", () => {
  assert.equal(localDay(new Date(2026, 5, 10, 0, 1)), "2026-06-10");
  assert.ok(validDate("2024-02-29"));
  assert.ok(validDate(""));
  assert.ok(!validDate("2026-02-30"));
  assert.ok(!validDate("0000-01-01"));
});
test("menu eligibility includes undated and due-today stock and compares both languages", () => {
  const base: Stock = {
    id: "1",
    name: "Peanut",
    name_en: "Ground nut",
    name_th: "ถั่วลิสง",
    location: "pantry",
    unit: "g",
    quantity: "100",
    price: null,
    expiry_date: null,
    expiry_status: "no_date",
  };
  const stock = [
    base,
    {
      ...base,
      id: "2",
      name: "Spinach",
      name_en: null,
      name_th: null,
      expiry_date: "2026-06-10",
    },
    { ...base, id: "3", expiry_date: "2026-06-09" },
    { ...base, id: "4", quantity: "0" },
  ];
  for (const name of [" GROUND  NUT ", " ถั่วลิสง "]) {
    const { fresh, eligible } = eligibleEntries(stock, [name], "2026-06-10");
    assert.equal(fresh.length, 2);
    assert.deepEqual(
      eligible.map((s) => s.id),
      ["2"],
    );
  }
  assert.equal(displayName(base, "th"), "ถั่วลิสง");
  assert.equal(displayName(stock[1], "th"), "Spinach");
});
