import type { Language, Localized, Stock } from "./pantry";

export const dietOptions: Localized[] = [
  { en: "Vegan", th: "วีแกน" },
  { en: "Halal", th: "ฮาลาล" },
];
export const cuisineOptions: Localized[] = [
  { en: "Thai", th: "ไทย" },
  { en: "Chinese", th: "จีน" },
  { en: "Japanese", th: "ญี่ปุ่น" },
  { en: "Korean", th: "เกาหลี" },
  { en: "Italian", th: "อิตาเลียน" },
];
export const nutritionOptions: Localized[] = [
  { en: "Calorie control", th: "คุมแคลอรี่" },
  { en: "High protein", th: "เน้นโปรตีน" },
];
export const difficulties = {
  any: { en: "Any level", th: "ทุกระดับ" },
  easy: { en: "Easy", th: "ง่าย" },
  medium: { en: "Medium", th: "ปานกลาง" },
  hard: { en: "Hard", th: "ยาก" },
};

export type MealPreferences = {
  servings: number;
  dietary_styles: string[];
  nutrition_goal: string | null;
  cuisines: string[];
  foods_to_avoid: string[];
  max_total_minutes: number | null;
  difficulty: keyof typeof difficulties;
  equipment: string[];
};
export type RecommendationPreview = {
  status: "preview" | "generated";
  recipe_limit: 5;
  preferences: MealPreferences;
  ingredients: (Pick<
    Stock,
    "name" | "name_en" | "name_th" | "unit" | "quantity"
  > & {
    estimated_price: string | null;
    price_coverage: "full" | "partial" | "none";
  })[];
  recipes: {
    id: string;
    cooked?: boolean;
    name: Localized;
    description: Localized;
    ingredients: {
      name: Localized;
      quantity: string;
      unit: Stock["unit"];
      estimated_price: string | null;
      price_coverage: "full" | "partial" | "none";
    }[];
    equipment: string[];
    steps: Localized[];
    minutes: number;
    difficulty: Exclude<keyof typeof difficulties, "any">;
    estimated_price: string | null;
    price_coverage: "full" | "partial" | "none";
  }[];
};

export function withRecipeIds(
  preview: RecommendationPreview,
): RecommendationPreview {
  if (preview.recipes.every((recipe) => recipe.id)) return preview;
  return {
    ...preview,
    recipes: preview.recipes.map((recipe) =>
      recipe.id
        ? recipe
        : {
            ...recipe,
            id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          },
    ),
  };
}

export function translatedNames(
  values: string[],
  options: Localized[],
  lang: Language,
) {
  return values
    .map(
      (value) =>
        options.find((item) => item.en === value || item.th === value)?.[
          lang
        ] ?? value,
    )
    .join(", ");
}
