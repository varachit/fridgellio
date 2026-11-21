"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChefHat, Leaf } from "lucide-react";
import { api, errorCode, ApiError } from "@/lib/api";
import { foodsQuery, menusQuery } from "@/lib/queries";
import { EquipmentPicker } from "./equipment-picker";
import { ProfileSettings } from "./profile-settings";
import {
  eligibleEntries,
  type Named,
  type Stock,
  type Menu,
} from "@/lib/pantry";
import {
  Dialog,
  Message,
  Busy,
  Retry,
  useAction,
  useText,
  useLabels,
} from "./ui";

const foodPath = "preferences/foods-to-avoid";
function FoodsToAvoid() {
  const { t } = useText(),
    action = useAction();
  const client = useQueryClient();
  const rows = useQuery(foodsQuery);
  const [name, setName] = useState(""),
    [selected, select] = useState<Named | null>(null);
  return (
    <section className="panel">
      <h2>
        <Leaf />
        {t("Foods to avoid", "อาหารที่ต้องการหลีกเลี่ยง")}
      </h2>
      <p>
        {t(
          "Exclude these ingredients from your own meal ideas.",
          "ยกเว้นวัตถุดิบเหล่านี้จากไอเดียมื้ออาหารของคุณ",
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            if (!name.trim()) throw new ApiError("name");
            await api(foodPath, "POST", { name: name.trim() });
            setName("");
            void client.invalidateQueries({ queryKey: foodsQuery.queryKey });
          });
        }}
      >
        <fieldset className="inline-fields" disabled={action.busy}>
          <label>
            {t("Ingredient name", "ชื่อวัตถุดิบ")}
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="secondary">
            <Plus size={17} />
            {t("Add", "เพิ่ม")}
          </button>
        </fieldset>
      </form>
      <Message code={errorCode(rows.error)} />
      {rows.error && <Retry onClick={() => void rows.refetch()} />}
      {rows.data ? (
        rows.data.length ? (
          <ul className="name-list">
            {rows.data.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                <div className="actions">
                  <button
                    className="link destructive"
                    disabled={action.busy}
                    onClick={() => {
                      action.setError(null);
                      select(item);
                    }}
                  >
                    {t("Remove", "ลบ")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            {t("No foods on your list.", "ยังไม่มีอาหารในรายการของคุณ")}
          </p>
        )
      ) : (
        !rows.error && <Busy />
      )}
      {!selected && <Message code={action.error} />}
      {selected && (
        <Dialog
          title={t("Remove item", "ลบรายการ")}
          close={() => select(null)}
          busy={action.busy}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await api(foodPath + "/" + selected.id, "DELETE");
                select(null);
                void client.invalidateQueries({
                  queryKey: foodsQuery.queryKey,
                });
              });
            }}
          >
            <fieldset disabled={action.busy}>
              <p>
                {t("Remove this item?", "ลบรายการนี้หรือไม่")}{" "}
                <strong>{selected.name}</strong>
              </p>
              <Message code={action.error} />
              <button className="danger">
                {t("Confirm removal", "ยืนยันการลบ")}
              </button>
            </fieldset>
          </form>
        </Dialog>
      )}
    </section>
  );
}
export function SettingsView({ username }: { username: string }) {
  return (
    <div className="panels">
      <ProfileSettings username={username} />
      <FoodsToAvoid />
      <EquipmentPicker />
    </div>
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
  const { t, lang } = useText(),
    labels = useLabels(),
    action = useAction();
  const client = useQueryClient();
  const foods = useQuery(foodsQuery);
  const menus = useQuery(menusQuery);
  const [selected, setSelected] = useState("");
  const available = foods.data ? eligibleEntries(stock, foods.data, day) : null;
  const saved = menus.data || [];
  const menu = saved.find((m) => m.id === selected) || saved[0];
  return (
    <div className="panels">
      <section className="panel meal-panel">
        <ChefHat size={38} />
        <h2>{t("Cook from your pantry", "ทำอาหารจากวัตถุดิบที่มี")}</h2>
        <Message code={errorCode(foods.error)} />
        {foods.error && <Retry onClick={() => void foods.refetch()} />}
        {!available ? (
          !foods.error && <Busy />
        ) : !available.fresh.length ? (
          <>
            <p>
              {t(
                "Add in-date or undated groceries to request a menu.",
                "เพิ่มวัตถุดิบที่ยังไม่เลยวันหมดอายุหรือไม่ระบุวันเพื่อขอเมนู",
              )}
            </p>
            <button className="primary" onClick={add}>
              {t("Add groceries", "เพิ่มของสด")}
            </button>
          </>
        ) : !available.eligible.length ? (
          <>
            <p>
              {t(
                "Your Foods to avoid list excludes every available ingredient.",
                "รายการอาหารที่ต้องการหลีกเลี่ยงของคุณครอบคลุมวัตถุดิบทั้งหมดที่ใช้ได้",
              )}
            </p>
            <a className="link" href="#settings">
              {t("Review foods to avoid", "ตรวจรายการอาหารที่ต้องการหลีกเลี่ยง")}
            </a>
          </>
        ) : (
          <>
            <p>
              {t(
                "Request a menu using your available stock, cooking equipment and personal food preferences.",
                "ขอเมนูจากวัตถุดิบและอุปกรณ์ที่มี โดยคำนึงถึงอาหารที่คุณต้องการหลีกเลี่ยง",
              )}
            </p>
            <button
              disabled={action.busy || !!foods.error}
              className="primary"
              onClick={() =>
                void action.run(async () => {
                  const result = await api<Menu | null>("menus", "POST", {
                    today: day,
                  });
                  if (!result?.dishes?.length)
                    throw new ApiError("no_suitable_menu");
                  if (
                    !result.dishes.every(
                      (d) =>
                        d.name?.en &&
                        d.name?.th &&
                        Array.isArray(d.ingredients) &&
                        d.ingredients.length &&
                        d.ingredients.every(
                          (i) =>
                            i.name?.en &&
                            i.name?.th &&
                            i.unit in labels &&
                            Number(i.quantity) > 0,
                        ) &&
                        Array.isArray(d.equipment) &&
                        d.equipment.every((v) => v.name?.en && v.name?.th) &&
                        Array.isArray(d.steps) &&
                        d.steps.length &&
                        d.steps.every((s) => s.en && s.th),
                    )
                  )
                    throw new ApiError("invalid_menu");
                  await client.cancelQueries({ queryKey: menusQuery.queryKey });
                  client.setQueryData(menusQuery.queryKey, (previous = []) => [
                    result,
                    ...previous.filter((menu) => menu.id !== result.id),
                  ]);
                  setSelected(result.id);
                }, "menu")
              }
            >
              {action.busy
                ? t("Preparing menu…", "กำลังเตรียมเมนู…")
                : action.error
                  ? t("Try again", "ลองอีกครั้ง")
                  : t("Generate menu", "สร้างเมนู")}
            </button>
            <Message code={action.error} />
          </>
        )}
      </section>
      <section className="panel">
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
        ) : menus.data ? (
          <p>
            {t("Your generated menus will appear here.", "เมนูที่สร้างแล้วจะแสดงที่นี่")}
          </p>
        ) : (
          !menus.error && <Busy />
        )}
      </section>
    </div>
  );
}
