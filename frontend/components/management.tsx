"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Leaf, Globe } from "lucide-react";
import { api, errorCode, ApiError } from "@/lib/api";
import { foodsQuery } from "@/lib/queries";
import { EquipmentPicker } from "./equipment-picker";
import { ProfileSettings } from "./profile-settings";
import type { Named } from "@/lib/pantry";
import { LanguageSelect } from "./language-select";
import { Dialog, Message, Busy, Retry, useAction, useText } from "./ui";

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
export function SettingsView({
  changeLanguage,
  languageBusy,
}: {
  changeLanguage: () => void;
  languageBusy: boolean;
}) {
  const { t } = useText();
  return (
    <div className="panels">
      <ProfileSettings />
      <section className="panel" aria-labelledby="settings-language-title">
        <h2 id="settings-language-title">
          <Globe aria-hidden="true" />
          {t("Language", "ภาษา")}
        </h2>
        <p>
          {t(
            "Choose the language you prefer for Fridgellio.",
            "เลือกภาษาที่ต้องการใช้ใน Fridgellio",
          )}
        </p>
        <LanguageSelect change={changeLanguage} disabled={languageBusy} />
      </section>
      <FoodsToAvoid />
      <EquipmentPicker />
    </div>
  );
}
