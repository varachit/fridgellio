import {
  quantityError,
  priceError,
  validDate,
  type Location,
  type Unit,
} from "./pantry.ts";

export type BatchSource = "list" | "photo" | "receipt";
export type Draft = {
  printedName?: string;
  name: string;
  name_en: string;
  name_th: string;
  quantity: string;
  price: string;
  unit: Unit | "";
  location: Location | "";
  expiry_date: string;
};

export const blank: Draft = {
  name: "",
  name_en: "",
  name_th: "",
  quantity: "",
  price: "",
  unit: "",
  location: "",
  expiry_date: "",
};
export const maxBatch = 40;
export function payload(draft: Draft) {
  return {
    name: draft.name.trim(),
    name_en: draft.name_en.trim() || null,
    name_th: draft.name_th.trim() || null,
    quantity: draft.quantity,
    price: draft.price || null,
    unit: draft.unit,
    location: draft.location,
    expiry_date: draft.expiry_date || null,
  };
}
export function draftErrors(
  draft: Draft,
): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!draft.name.trim() || draft.name.trim().length > 200)
    errors.name = "name";
  if (!draft.unit) errors.unit = "required";
  if (!draft.location) errors.location = "required";
  const quantity = quantityError(draft.quantity, draft.unit || "g");
  if (quantity) errors.quantity = quantity;
  const price = priceError(draft.price);
  if (price) errors.price = price;
  if (!validDate(draft.expiry_date)) errors.expiry_date = "date";
  return errors;
}

const unitNames: Record<string, Unit> = {
  each: "each",
  pc: "each",
  pcs: "each",
  piece: "each",
  pieces: "each",
  ชิ้น: "each",
  ฟอง: "each",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  กก: "kg",
  กิโลกรัม: "kg",
  gram: "g",
  grams: "g",
  g: "g",
  กรัม: "g",
  ml: "ml",
  มล: "ml",
  มิลลิลิตร: "ml",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  l: "l",
  ลิตร: "l",
};
export function readGroceryList(text: string): Draft[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^(?:[-*•]\s+)?(?:\[[ xX]\]\s+|[☐☑]\s*)?/, "")
        .trim(),
    )
    .filter(Boolean)
    .map((line) => {
      const suffix = /^(.+?)\s+(\d+(?:\.\d+)?)\s*([\p{L}\p{M}]+)\.?$/u.exec(
        line,
      );
      const prefix = /^(\d+(?:\.\d+)?)\s*([\p{L}\p{M}]+)\.?\s+(.+)$/u.exec(
        line,
      );
      const parts = suffix
        ? [suffix[1], suffix[2], suffix[3]]
        : prefix
          ? [prefix[3], prefix[1], prefix[2]]
          : null;
      if (parts) {
        const [name, quantity, rawUnit] = parts;
        const key = rawUnit.toLowerCase();
        if (Object.hasOwn(unitNames, key))
          return { ...blank, name, quantity, unit: unitNames[key] };
      }
      return { ...blank, name: line };
    });
}

export type ReviewRow = { id: string; draft: Draft; original: Draft | null };
export function reviewCounts(rows: ReviewRow[], offered: number) {
  const retained = rows.filter((row) => row.original);
  const fields = [
    "name",
    "name_en",
    "name_th",
    "quantity",
    "unit",
    "price",
    "expiry_date",
  ] as const;
  const corrected = retained.filter(({ original, draft }) =>
    fields.some(
      (key) => original![key] !== "" && original![key] !== draft[key],
    ),
  ).length;
  return { offered, removed: offered - retained.length, corrected };
}
