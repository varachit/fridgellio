"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ChefHat,
  ChevronDown,
  CookingPot,
  Leaf,
  Minus,
  Plus,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  eligibleEntries,
  normalize,
  type Localized,
  type Named,
  type Stock,
} from "@/lib/pantry";
import {
  cuisineOptions,
  dietOptions,
  nutritionOptions,
  difficulties,
  translatedNames,
  type MealPreferences,
  type RecommendationPreview,
} from "@/lib/meals";
import { equipmentChoices } from "./equipment-picker";
import { Message, useAction, useText } from "./ui";

type Selection = { names: string[]; other: string | null };
const emptySelection: Selection = { names: [], other: null };

function selectionNames({ names, other }: Selection) {
  const custom = other?.trim();
  if (!custom || names.some((name) => normalize(name) === normalize(custom)))
    return names;
  return [...names, custom];
}

function CheckGroup({
  title,
  options,
  selection,
  change,
  otherLabel,
}: {
  title: string;
  options: { value: string; label: string }[];
  selection: Selection;
  change: (next: Selection) => void;
  otherLabel: string;
}) {
  const { t } = useText();
  return (
    <fieldset className="meal-group">
      <legend>{title}</legend>
      <div className="meal-choices">
        {options.map(({ value, label }) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={selection.names.includes(value)}
              onChange={(e) =>
                change({
                  ...selection,
                  names: e.target.checked
                    ? [...selection.names, value]
                    : selection.names.filter((name) => name !== value),
                })
              }
            />
            {label}
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={selection.other !== null}
            onChange={(e) =>
              change({
                ...selection,
                other: e.target.checked ? "" : null,
              })
            }
          />
          {t("Other", "อื่น ๆ")}
        </label>
      </div>
      {selection.other !== null && (
        <label>
          {otherLabel}
          <input
            required
            pattern={".*\\S.*"}
            maxLength={200}
            value={selection.other}
            onChange={(e) => change({ ...selection, other: e.target.value })}
          />
        </label>
      )}
    </fieldset>
  );
}

function PreferenceSection({
  title,
  summary,
  icon: Icon,
  children,
  sectionRef,
}: {
  title: string;
  summary: string;
  icon: LucideIcon;
  children: ReactNode;
  sectionRef?: React.RefObject<HTMLDetailsElement | null>;
}) {
  return (
    <details className="meal-section" name="meal-preferences" ref={sectionRef}>
      <summary>
        <Icon size={22} aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <ChevronDown size={18} aria-hidden="true" className="meal-chevron" />
      </summary>
      <div className="meal-section-body">{children}</div>
    </details>
  );
}

export function MealForm({
  foods,
  equipment,
  stock,
  day,
  add,
  showPreview,
}: {
  foods: Named[];
  equipment: Named[];
  stock: Stock[];
  day: string;
  add: () => void;
  showPreview: (preview: RecommendationPreview) => void;
}) {
  const { t, lang } = useText();
  const action = useAction();
  const kitchenSection = useRef<HTMLDetailsElement>(null);
  const avoidedField = useRef<HTMLTextAreaElement>(null);
  const [servings, setServings] = useState(2);
  const [minutes, setMinutes] = useState("");
  const [diet, setDiet] = useState(emptySelection);
  const [cuisines, setCuisines] = useState(emptySelection);
  const [goal, setGoal] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [difficulty, setDifficulty] =
    useState<MealPreferences["difficulty"]>("any");
  const [avoidedOverride, setAvoidedOverride] = useState<string | null>(null);
  const [gearOverride, setGearOverride] = useState<Selection | null>(null);
  const avoidText = avoidedOverride ?? foods.map((item) => item.name).join("\n");
  const tools = equipmentChoices(equipment);
  const gear = gearOverride ?? {
    names: tools.flatMap((choice) =>
      choice.saved.length ? [choice.saved[0].name] : [],
    ),
    other: null,
  };

  const avoided = avoidText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const { fresh, eligible } = eligibleEntries(stock, avoided, day);
  const tooLong = avoided.some((name) => name.length > 200);
  const dietaryStyles = selectionNames(diet);
  const cuisineNames = selectionNames(cuisines);
  const equipmentNames = selectionNames(gear);
  const nutritionGoal = goal === "other" ? customGoal.trim() : goal;
  const dietSummary =
    [
      translatedNames(dietaryStyles, dietOptions, lang),
      translatedNames([nutritionGoal], nutritionOptions, lang),
    ]
      .filter(Boolean)
      .join(" · ") ||
    t("Any diet or nutrition goal", "ไม่จำกัดรูปแบบการกินและเป้าหมายโภชนาการ");

  const options = (items: Localized[]) =>
    items.map((item) => ({ value: item.en, label: item[lang] }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eligible.length || tooLong) return;
    await action.run(async () => {
      const preferences: MealPreferences = {
        servings,
        dietary_styles: dietaryStyles,
        cuisines: cuisineNames,
        nutrition_goal: nutritionGoal || null,
        foods_to_avoid: avoided,
        equipment: equipmentNames,
        max_total_minutes: Number(minutes) || null,
        difficulty,
      };
      showPreview(
        await api<RecommendationPreview>("menus/recommendations", "POST", {
          today: day,
          generate: true,
          ...preferences,
        }),
      );
    });
  }

  return (
    <form onSubmit={submit}>
      <fieldset className="meal-fields" disabled={action.busy}>
        <div className="meal-pair">
          <fieldset className="meal-group">
            <legend>{t("Servings", "จำนวนที่เสิร์ฟ")}</legend>
            <div className="meal-stepper">
              <button
                type="button"
                aria-label={t("Fewer servings", "ลดจำนวนที่เสิร์ฟ")}
                disabled={servings <= 1}
                onClick={() => setServings(servings - 1)}
              >
                <Minus size={17} />
              </button>
              <output aria-label={t("Servings", "จำนวนที่เสิร์ฟ")}>
                {servings}
              </output>
              <button
                type="button"
                aria-label={t("More servings", "เพิ่มจำนวนที่เสิร์ฟ")}
                onClick={() => setServings(servings + 1)}
              >
                <Plus size={17} />
              </button>
            </div>
          </fieldset>
          <label>
            {t("Maximum total time", "เวลารวมสูงสุด")}
            <select
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            >
              <option value="">{t("Unlimited", "ไม่จำกัด")}</option>
              <option value="15">
                {t("Up to 15 minutes", "ไม่เกิน 15 นาที")}
              </option>
              <option value="30">
                {t("Up to 30 minutes", "ไม่เกิน 30 นาที")}
              </option>
              <option value="60">{t("Up to 1 hour", "ไม่เกิน 1 ชม.")}</option>
              <option value="120">{t("Up to 2 hours", "ไม่เกิน 2 ชม.")}</option>
            </select>
          </label>
        </div>
        <div className="meal-sections">
          <PreferenceSection
            icon={Leaf}
            title={t("Diet & nutrition", "รูปแบบการกินและโภชนาการ")}
            summary={dietSummary}
          >
            <CheckGroup
              title={t("Dietary styles", "รูปแบบการกิน")}
              options={options(dietOptions)}
              selection={diet}
              change={setDiet}
              otherLabel={t("Other dietary style", "ระบุรูปแบบการกินอื่น ๆ")}
            />
            <label>
              {t("Nutrition goal", "เป้าหมายโภชนาการ")}
              <select value={goal} onChange={(e) => setGoal(e.target.value)}>
                <option value="">{t("No preference", "ไม่ระบุ")}</option>
                {nutritionOptions.map((item) => (
                  <option key={item.en} value={item.en}>
                    {item[lang]}
                  </option>
                ))}
                <option value="other">{t("Other", "อื่น ๆ โปรดระบุ")}</option>
              </select>
            </label>
            {goal === "other" && (
              <label>
                {t("Other nutrition goal", "ระบุเป้าหมายโภชนาการอื่น ๆ")}
                <input
                  required
                  pattern={".*\\S.*"}
                  maxLength={200}
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                />
              </label>
            )}
          </PreferenceSection>
          <PreferenceSection
            icon={Utensils}
            title={t("Cuisine & difficulty", "สไตล์อาหารและความยาก")}
            summary={[
              translatedNames(cuisineNames, cuisineOptions, lang) ||
                t("Any cuisine", "ทุกสไตล์อาหาร"),
              difficulties[difficulty][lang],
            ].join(" · ")}
          >
            <CheckGroup
              title={t("Cuisines", "สไตล์อาหาร")}
              options={options(cuisineOptions)}
              selection={cuisines}
              change={setCuisines}
              otherLabel={t("Other cuisine", "ระบุสไตล์อาหารอื่น ๆ")}
            />
            <fieldset className="meal-group">
              <legend>{t("Difficulty", "ความยาก")}</legend>
              <div className="meal-choices">
                {(
                  Object.keys(difficulties) as (keyof typeof difficulties)[]
                ).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="difficulty"
                      value={value}
                      checked={value === difficulty}
                      onChange={() => setDifficulty(value)}
                    />
                    {difficulties[value][lang]}
                  </label>
                ))}
              </div>
            </fieldset>
          </PreferenceSection>
          <PreferenceSection
            icon={CookingPot}
            sectionRef={kitchenSection}
            title={t("Kitchen settings", "วัตถุดิบและอุปกรณ์")}
            summary={t(
              `${avoided.length} excluded · ${equipmentNames.length} ${equipmentNames.length === 1 ? "tool" : "tools"} available`,
              `เว้นวัตถุดิบ ${avoided.length} รายการ · มีอุปกรณ์ ${equipmentNames.length} รายการ`,
            )}
          >
            <p>
              {t(
                "Imported from Settings. Edit these for this meal.",
                "นำเข้าจากการตั้งค่า แก้ไขได้เฉพาะมื้อนี้",
              )}
            </p>
            <label>
              {t("Foods to avoid", "วัตถุดิบที่ไม่กิน")}
              <textarea
                rows={2}
                ref={avoidedField}
                value={avoidText}
                onChange={(e) => setAvoidedOverride(e.target.value)}
                aria-describedby="avoid-hint"
                aria-invalid={tooLong || undefined}
              />
            </label>
            <small id="avoid-hint">
              {t("One ingredient per line.", "ใส่วัตถุดิบหนึ่งรายการต่อบรรทัด")}
            </small>
            {tooLong && (
              <p role="alert" className="error">
                {t(
                  "Use up to 200 characters per ingredient.",
                  "ชื่อวัตถุดิบแต่ละรายการยาวได้ไม่เกิน 200 ตัวอักษร",
                )}
              </p>
            )}
            <CheckGroup
              title={t("Available equipment", "อุปกรณ์ที่ใช้ได้")}
              options={tools.map((choice) => ({
                value: choice.saved[0]?.name ?? choice.name.en,
                label: choice.name[lang],
              }))}
              selection={gear}
              change={setGearOverride}
              otherLabel={t("Other equipment", "ระบุอุปกรณ์อื่น ๆ")}
            />
          </PreferenceSection>
        </div>
        {!fresh.length ? (
          <div className="meal-empty">
            <p>
              {t(
                "Add in-date or undated groceries to request a menu.",
                "เพิ่มวัตถุดิบที่ยังไม่หมดอายุหรือไม่ระบุวันหมดอายุเพื่อขอเมนู",
              )}
            </p>
            <button type="button" className="secondary" onClick={add}>
              {t("Add groceries", "เพิ่มของสด")}
            </button>
          </div>
        ) : (
          !eligible.length && (
            <div className="meal-empty">
              <p>
                {t(
                  "Your Foods to avoid list excludes every available ingredient.",
                  "รายการวัตถุดิบที่ไม่กินครอบคลุมวัตถุดิบทั้งหมดที่มี",
                )}
              </p>
              <button
                type="button"
                className="link"
                onClick={() => {
                  if (kitchenSection.current)
                    kitchenSection.current.open = true;
                  avoidedField.current?.focus();
                }}
              >
                {t("Edit foods for this meal", "แก้ไขวัตถุดิบสำหรับมื้อนี้")}
              </button>
            </div>
          )
        )}
        <button
          className="primary"
          type="submit"
          disabled={!eligible.length || tooLong}
        >
          <ChefHat size={19} aria-hidden="true" />
          {action.busy
            ? t("Generating recipes…", "กำลังแนะนำเมนู…")
            : t("Generate menu", "สร้างเมนู")}
        </button>
        <Message code={action.error} />
      </fieldset>
    </form>
  );
}
