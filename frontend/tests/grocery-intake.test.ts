import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  draftErrors,
  readGroceryList,
  reviewCounts,
} from "../lib/grocery-intake.ts";

test("reads English and Thai lists, explicit measurements, duplicates and uncertain lines", () => {
  const list =
    "- [ ] Eggs 6 pcs\r\nไข่ 3 ฟอง\n • 0.5 kg rice\nข้าว 1 กก.\n\nMilk 2 cartons\nEggs 1 constructor\nไข่ 3 ฟอง";
  assert.deepEqual(
    readGroceryList(list).map(({ name, quantity, unit }) => [
      name,
      quantity,
      unit,
    ]),
    [
      ["Eggs", "6", "each"],
      ["ไข่", "3", "each"],
      ["rice", "0.5", "kg"],
      ["ข้าว", "1", "kg"],
      ["Milk 2 cartons", "", ""],
      ["Eggs 1 constructor", "", ""],
      ["ไข่", "3", "each"],
    ],
  );
  assert.equal(
    draftErrors(readGroceryList("Eggs 1.5 each")[0]).quantity,
    "whole",
  );
});

test("separates edited suggestions from blanks filled in, added rows and removals", () => {
  const [egg, herb] = readGroceryList("Eggs 3 each\nBasil");
  assert.deepEqual(
    reviewCounts(
      [
        { id: "1", original: egg, draft: { ...egg, quantity: "4" } },
        {
          id: "2",
          original: herb,
          draft: { ...herb, quantity: "5", unit: "g", location: "fridge" },
        },
        { id: "3", original: null, draft: { ...blank, name: "Milk" } },
      ],
      3,
    ),
    { offered: 3, removed: 1, corrected: 1 },
  );
});
