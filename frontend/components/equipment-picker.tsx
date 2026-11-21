"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Plus, CookingPot } from "lucide-react";
import { api, errorCode } from "@/lib/api";
import { normalize, type Localized, type Named } from "@/lib/pantry";
import { equipmentQuery } from "@/lib/queries";
import { Busy, Dialog, Message, Retry, useText } from "./ui";

const presets: Localized[] = [
  { en: "Stove", th: "เตา" },
  { en: "Skillet", th: "กระทะแบน" },
  { en: "Wok", th: "กระทะก้นลึก" },
  { en: "Pot", th: "หม้อ" },
  { en: "Rice cooker", th: "หม้อหุงข้าว" },
  { en: "Steamer", th: "หม้อนึ่ง" },
  { en: "Microwave", th: "ไมโครเวฟ" },
  { en: "Oven", th: "เตาอบ" },
  { en: "Air fryer", th: "หม้อทอดไร้น้ำมัน" },
  { en: "Blender", th: "เครื่องปั่น" },
  { en: "Toaster", th: "เครื่องปิ้งขนมปัง" },
  { en: "Pressure cooker", th: "หม้ออัดแรงดัน" },
];

type Choice = { name: Localized; custom: boolean; saved: Named[] };

function equipmentChoices(saved: Named[]) {
  const choices: Choice[] = presets.map((name) => ({
    name,
    custom: false,
    saved: [],
  }));
  const byName = new Map<string, Choice>();
  for (const choice of choices) {
    byName.set(normalize(choice.name.en), choice);
    byName.set(normalize(choice.name.th), choice);
  }
  for (const item of saved) {
    const key = normalize(item.name);
    const choice = byName.get(key);
    if (choice) {
      choice.saved.push(item);
    } else {
      const custom = {
        name: { en: item.name, th: item.name },
        custom: true,
        saved: [item],
      };
      choices.push(custom);
      byName.set(key, custom);
    }
  }
  return choices;
}

function EquipmentCard({
  choice,
  disabled,
}: {
  choice: Choice;
  disabled: boolean;
}) {
  const { lang, t } = useText();
  const client = useQueryClient();
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const change = useMutation({
    mutationFn: async (select: boolean) => {
      if (select) {
        await api("equipment", "POST", { name: choice.name.en });
      } else {
        for (const item of choice.saved) {
          try {
            await api("equipment/" + item.id, "DELETE");
          } catch (error) {
            if (errorCode(error) !== "equipment_not_found") throw error;
          }
        }
      }
    },
    onSuccess: () => setConfirmRemoval(false),
    onSettled: () =>
      client.invalidateQueries({ queryKey: equipmentQuery.queryKey }),
  });
  const locked = disabled || change.isPending;
  const selected = change.isPending
    ? change.variables
    : choice.saved.length > 0;
  return (
    <div>
      <button
        className="equipment-card"
        type="button"
        aria-pressed={selected}
        disabled={locked}
        onClick={() => {
          if (choice.custom) {
            change.reset();
            setConfirmRemoval(true);
          } else {
            change.mutate(!selected);
          }
        }}
      >
        <span>{choice.name[lang]}</span>
        {selected ? (
          <CircleCheck size={19} aria-hidden="true" />
        ) : (
          <Plus size={19} aria-hidden="true" />
        )}
      </button>
      {!confirmRemoval && <Message code={errorCode(change.error)} />}
      {confirmRemoval && (
        <Dialog
          title={t("Remove equipment", "ลบอุปกรณ์")}
          close={() => setConfirmRemoval(false)}
          busy={change.isPending}
        >
          <p>
            {t(
              "Remove this custom item from your household?",
              "ลบอุปกรณ์ที่เพิ่มเองนี้ออกจากครัวเรือนหรือไม่",
            )}{" "}
            <strong>{choice.name[lang]}</strong>
          </p>
          <Message code={errorCode(change.error)} />
          <button
            className="danger"
            disabled={locked}
            onClick={() => change.mutate(false)}
          >
            {t("Confirm removal", "ยืนยันการลบ")}
          </button>
        </Dialog>
      )}
    </div>
  );
}

export function EquipmentPicker() {
  const { t } = useText();
  const rows = useQuery(equipmentQuery);
  return (
    <section className="panel" aria-labelledby="equipment-heading">
      <h2 id="equipment-heading">
        <CookingPot />
        {t("Cooking equipment", "อุปกรณ์ทำอาหาร")}
      </h2>
      <p>
        {t(
          "Select the equipment in your shared kitchen.",
          "เลือกอุปกรณ์ที่มีในครัวของครัวเรือน",
        )}
      </p>
      <Message code={errorCode(rows.error)} />
      {rows.isError && <Retry onClick={() => void rows.refetch()} />}
      {rows.isPending && <Busy />}
      {rows.data && (
        <div className="equipment-grid">
          {equipmentChoices(rows.data).map((choice) => (
            <EquipmentCard
              key={choice.name.en}
              choice={choice}
              disabled={rows.isError}
            />
          ))}
        </div>
      )}
    </section>
  );
}
