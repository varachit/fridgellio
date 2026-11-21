export type Language = "en" | "th";
export const locations = ["pantry", "fridge", "freezer", "other"] as const;
export const units = ["each", "g", "kg", "ml", "l"] as const;
export type Location = (typeof locations)[number];
export type Unit = (typeof units)[number];
export type Status =
  "past_date" | "due_today" | "use_soon" | "later" | "no_date";
export type Household = { id: string; can_invite: boolean };
export type MemberProfile = {
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_picture_url: string | null;
};
export type HouseholdMember = MemberProfile & { id: string; is_owner: boolean };
export type Named = { id: string; name: string };
export type Stock = Named & {
  name_en: string | null;
  name_th: string | null;
  quantity: string;
  unit: Unit;
  location: Location;
  expiry_date: string | null;
  expiry_status: Status;
};
export type StockEvent = {
  id: string;
  actor_account_id: string;
  item_name: string;
  kind: "added" | "used" | "discarded";
  quantity: string;
  unit: Unit;
  created_at: string;
};
export type Localized = Record<Language, string>;
export type Menu = {
  id: string;
  created_at: string;
  dishes: {
    name: Localized;
    ingredients: {
      reference: string;
      name: Localized;
      quantity: string;
      unit: Unit;
    }[];
    equipment: { reference: string; name: Localized }[];
    steps: Localized[];
  }[];
};
export const localDay = (day = new Date()) =>
  [
    day.getFullYear(),
    String(day.getMonth() + 1).padStart(2, "0"),
    String(day.getDate()).padStart(2, "0"),
  ].join("-");
export function displayName(item: Stock, lang: Language) {
  return item[lang === "th" ? "name_th" : "name_en"] || item.name;
}
export function validDate(day: string) {
  if (!day) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith("0000")) return false;
  const date = new Date(day + "T00:00:00Z");
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === day
  );
}
function micros(raw: string) {
  const [whole, fraction = ""] = raw.split(".");
  return BigInt(whole + fraction.padEnd(6, "0"));
}
export function quantityError(raw: string, unit: Unit, maximum?: string) {
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(raw) || micros(raw) <= 0n)
    return "quantity";
  if (unit === "each" && micros(raw) % 1000000n !== 0n) return "whole";
  if (maximum && micros(raw) > micros(maximum)) return "insufficient_stock";
  return null;
}
export const normalize = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export function eligibleEntries(stock: Stock[], foods: string[], day: string) {
  const excluded = new Set(foods.map(normalize));
  const fresh = stock.filter(
    (item) =>
      Number(item.quantity) > 0 &&
      (!item.expiry_date || item.expiry_date >= day),
  );
  return {
    fresh,
    eligible: fresh.filter(
      (item) =>
        ![item.name, item.name_en, item.name_th].some(
          (n) => n && excluded.has(normalize(n)),
        ),
    ),
  };
}
