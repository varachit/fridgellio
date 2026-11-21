"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorCode } from "@/lib/api";
import { equipmentQuery, foodsQuery, menusQuery } from "@/lib/queries";
import type { Stock } from "@/lib/pantry";
import {
  cuisineOptions,
  dietOptions,
  nutritionOptions,
  difficulties,
  translatedNames,
  type RecommendationPreview,
} from "@/lib/meals";
import { MealForm } from "./meal-form";
import { equipmentPresets } from "./equipment-picker";
import { Busy, Message, Retry, useLabels, useText } from "./ui";

function SavedMenus() {
  const { t, lang } = useText();
  const labels = useLabels();
  const menus = useQuery(menusQuery);
  const [selected, setSelected] = useState("");
  const saved = menus.data || [];
  const menu = saved.find((m) => m.id === selected) || saved[0];
  if (menus.data && !menu && !menus.error) return null;
  return (
    <section className="panel saved-menus">
      <h2>{t("Saved menus", "เมนูที่บันทึกไว้")}</h2>
      <Message code={errorCode(menus.error)} />
      {menus.error && <Retry onClick={() => void menus.refetch()} />}
      {menu ? (
        <>
          {saved.length > 1 && (
            <label>
              {t("Choose menu", "เลือกเมนู")}
              <select
                value={menu.id}
                onChange={(e) => setSelected(e.target.value)}
              >
                {saved.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.dishes[0].name[lang]} ·{" "}
                    {new Date(m.created_at).toLocaleString(lang)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {menu.dishes.map((d, i) => (
            <article className="dish" key={i}>
              <h3>{d.name[lang]}</h3>
              <h4>{t("Ingredients", "วัตถุดิบ")}</h4>
              <ul>
                {d.ingredients.map((v, j) => (
                  <li key={j}>
                    {v.name[lang]} · {v.quantity} {labels[v.unit]}
                  </li>
                ))}
              </ul>
              {d.equipment.length > 0 && (
                <p>
                  <strong>{t("Equipment", "อุปกรณ์")} </strong>
                  {d.equipment.map((v) => v.name[lang]).join(", ")}
                </p>
              )}
              <h4>{t("Cooking steps", "วิธีทำ")}</h4>
              <ol>
                {d.steps.map((s, j) => (
                  <li key={j}>{s[lang]}</li>
                ))}
              </ol>
            </article>
          ))}
          <a href="#pantry" className="link">
            {t(
              "Record ingredients used in inventory",
              "บันทึกวัตถุดิบที่ใช้ในคลังอาหาร",
            )}
          </a>
        </>
      ) : (
        !menus.error && <Busy />
      )}
    </section>
  );
}

export function Meals({
  stock,
  day,
  add,
}: {
  stock: Stock[];
  day: string;
  add: () => void;
}) {
  const { t, lang } = useText();
  const labels = useLabels();
  const foods = useQuery(foodsQuery);
  const equipment = useQuery(equipmentQuery);
  const [preview, setPreview] = useState<RecommendationPreview | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);
  const preferences = preview?.preferences;
  const conditions = preferences
    ? [
        translatedNames(preferences.dietary_styles, dietOptions, lang),
        translatedNames(preferences.cuisines, cuisineOptions, lang),
        translatedNames(
          preferences.nutrition_goal ? [preferences.nutrition_goal] : [],
          nutritionOptions,
          lang,
        ),
        preferences.max_total_minutes &&
          t(
            `Up to ${preferences.max_total_minutes} minutes`,
            `ไม่เกิน ${preferences.max_total_minutes} นาที`,
          ),
        preferences.difficulty !== "any" &&
          difficulties[preferences.difficulty][lang],
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const problem = errorCode(foods.error || equipment.error);
  return (
    <div className="meal-layout">
      <section className="panel">
        <h2>{t("Plan this meal", "แนะนำเท่าที่มี")}</h2>
        <Message code={problem} />
        {problem && (
          <Retry
            onClick={() => {
              void foods.refetch();
              void equipment.refetch();
            }}
          />
        )}
        {foods.data && equipment.data ? (
          <MealForm
            foods={foods.data}
            equipment={equipment.data}
            stock={stock}
            day={day}
            add={add}
            showPreview={setPreview}
          />
        ) : (
          !problem && <Busy />
        )}
      </section>
      <section
        className="panel meal-preview"
        aria-labelledby="meal-preview-title"
      >
        <h2 id="meal-preview-title" ref={previewHeading} tabIndex={-1}>
          {t("Request preview", "ตัวอย่างคำขอเมนู")}
        </h2>
        {preview ? (
          <>
            <p>
              {t(
                `Request prepared for ${preview.preferences.servings} ${preview.preferences.servings === 1 ? "serving" : "servings"}, up to ${preview.recipe_limit} recipes. AI recipe generation is coming in a later version.`,
                `เตรียมคำขอสำหรับ ${preview.preferences.servings} ที่ สูงสุด ${preview.recipe_limit} เมนูแล้ว ระบบจะสร้างสูตรอาหารด้วย AI ได้ในเวอร์ชันถัดไป`,
              )}
            </p>
            {conditions && <p>{conditions}</p>}
            <dl className="meal-summary">
              <dt>{t("Available equipment", "อุปกรณ์ที่ใช้ได้")}</dt>
              <dd>
                {translatedNames(
                  preview.preferences.equipment,
                  equipmentPresets,
                  lang,
                ) || t("None", "ไม่มี")}
              </dd>
              {preview.preferences.foods_to_avoid.length > 0 && (
                <>
                  <dt>{t("Foods to avoid", "วัตถุดิบที่ไม่กิน")}</dt>
                  <dd>{preview.preferences.foods_to_avoid.join(", ")}</dd>
                </>
              )}
            </dl>
            <h3>{t("Available ingredients", "วัตถุดิบที่ใช้ได้")}</h3>
            {preview.ingredients.length ? (
              <ul className="meal-ingredients">
                {preview.ingredients.map((item, i) => (
                  <li key={i}>
                    <span>
                      {(lang === "th" ? item.name_th : item.name_en) ||
                        item.name}
                    </span>
                    <span>
                      {item.quantity} {labels[item.unit]}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                {t(
                  "No pantry ingredients match this request.",
                  "ไม่มีวัตถุดิบในคลังที่ตรงกับคำขอนี้",
                )}
              </p>
            )}
          </>
        ) : (
          <>
            <img
              className="meal-still-life"
              src="/illustrations/dashboard.webp"
              width="420"
              height="274"
              alt=""
            />
            <p>
              {t(
                "Generate a menu to review your preferences and available ingredients. AI recipes are coming in a later version.",
                "กดสร้างเมนูเพื่อดูตัวเลือกและวัตถุดิบที่ใช้ได้ สูตรอาหารจาก AI จะมีในเวอร์ชันถัดไป",
              )}
            </p>
          </>
        )}
      </section>
      <SavedMenus />
    </div>
  );
}
