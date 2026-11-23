"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  blank,
  draftErrors,
  maxBatch,
  payload,
  reviewCounts,
  type Draft,
  type BatchSource,
  type ReviewRow,
} from "@/lib/grocery-intake";
import { locations, units } from "@/lib/pantry";
import { DateField } from "./date-field";
import { SelectField } from "./select-field";
import { Message, useLabels, useText } from "./ui";

type Props = {
  initial: Draft[];
  source: BatchSource;
  hasMore: boolean;
  receiptImage?: File;
  started: number;
  requestId: string;
  day: string;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  saved: (count: number) => void;
};
export function BatchReview({
  initial,
  source,
  hasMore,
  receiptImage,
  started,
  requestId,
  day,
  busy,
  run,
  saved,
}: Props) {
  const { lang, t } = useText();
  const labels = useLabels();
  const original = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!original.current || !receiptImage) return;
    const url = URL.createObjectURL(receiptImage);
    original.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [receiptImage]);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [rows, setRows] = useState<ReviewRow[]>(() =>
    initial.map((draft) => ({
      id: crypto.randomUUID(),
      draft,
      original: draft,
    })),
  );
  const [checked, setChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const elapsed = useRef(0);
  const locationOptions = locations.map((value) => ({
    value,
    label: labels[value],
  }));
  const missingLocation = rows.filter((row) => !row.draft.location).length;
  const locked = busy || submitted;

  function edit(id: string, changes: Partial<Draft>) {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, draft: { ...row.draft, ...changes } } : row,
      ),
    );
  }
  return (
    <form
      className="batch-review"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
        if (!rows.length) return;
        if (rows.some((row) => Object.keys(draftErrors(row.draft)).length)) {
          const form = event.currentTarget;
          requestAnimationFrame(() => {
            const field = form.querySelector<HTMLElement>(
              '[aria-invalid="true"]',
            );
            if (field) {
              const details = field.closest("details");
              if (details) details.open = true;
              field.focus();
            }
          });
          return;
        }
        void run(async () => {
          if (!submitted)
            elapsed.current = Math.min(
              604800,
              Math.round((performance.now() - started) / 1000),
            );
          setSubmitted(true);
          try {
            const result = await api<{ saved: number }>(
              "inventory/batches",
              "POST",
              {
                source,
                items: rows.map((row) => payload(row.draft)),
                ...reviewCounts(rows, initial.length),
                elapsed_seconds: elapsed.current,
              },
              { key: requestId },
            );
            saved(result.saved);
          } catch (error) {
            if (error instanceof ApiError && error.code === "invalid_request")
              setSubmitted(false);
            throw error;
          }
        });
      }}
    >
      <h3 tabIndex={-1} ref={heading}>
        {t("Review groceries", "ตรวจรายการของสด")} <span>({rows.length})</span>
      </h3>
      <p className="muted">
        {t(
          "Check amounts and storage before saving. Repeat items can use your household’s last location.",
          "ตรวจจำนวนและที่จัดเก็บก่อนบันทึก ของที่เคยซื้อจะแนะนำที่จัดเก็บครั้งล่าสุดของครัวเรือน",
        )}
      </p>
      {receiptImage && (
        <details>
          <summary>{t("View original receipt", "ดูภาพใบเสร็จต้นฉบับ")}</summary>
          <img
            className="receipt-original"
            ref={original}
            alt={t("Original receipt", "ใบเสร็จต้นฉบับ")}
          />
        </details>
      )}
      {hasMore && (
        <p className="hint" role="status">
          {t(
            "This receipt has more items. After saving, scan the remaining lines in another photo.",
            "ใบเสร็จนี้มีรายการเพิ่มเติม หลังบันทึกแล้วให้ถ่ายเฉพาะส่วนที่เหลือเพื่อเพิ่มรายการต่อ",
          )}
        </p>
      )}
      <fieldset disabled={locked}>
        {missingLocation > 0 && (
          <SelectField
            label={t(
              `Set storage for ${missingLocation} unassigned`,
              `กำหนดที่จัดเก็บให้ ${missingLocation} รายการที่ยังไม่ระบุ`,
            )}
            value=""
            disabled={locked}
            options={[
              { value: "", label: t("Choose location", "เลือกที่จัดเก็บ") },
              ...locationOptions,
            ]}
            onChange={(location) =>
              setRows((current) =>
                current.map((row) =>
                  row.draft.location
                    ? row
                    : { ...row, draft: { ...row.draft, location } },
                ),
              )
            }
          />
        )}
        {rows.map(({ id, draft }, index) => {
          const errors = checked ? draftErrors(draft) : {};
          return (
            <fieldset key={id} className="batch-item">
              <legend>{t(`Item ${index + 1}`, `รายการที่ ${index + 1}`)}</legend>
              {draft.printedName && (
                <p className="receipt-line">
                  {t("On receipt", "ข้อความบนใบเสร็จ")} ·{" "}
                  <bdi>{draft.printedName}</bdi>
                </p>
              )}
              <div className="batch-name">
                <label>
                  {t("Item name", "ชื่อรายการ")}
                  <input
                    required
                    value={draft.name}
                    maxLength={200}
                    aria-invalid={!!errors.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      edit(
                        id,
                        source !== "list" && name !== draft.name
                          ? {
                              name,
                              name_en: lang === "en" ? name : "",
                              name_th: lang === "th" ? name : "",
                            }
                          : { name },
                      );
                    }}
                  />
                  <Message code={errors.name || null} />
                </label>
                <button
                  type="button"
                  className="icon"
                  aria-label={t(
                    `Remove item ${index + 1}`,
                    `นำรายการที่ ${index + 1} ออก`,
                  )}
                  onClick={() =>
                    setRows((current) => current.filter((row) => row.id !== id))
                  }
                >
                  <X size={18} />
                </button>
              </div>
              <div className="batch-measures">
                <label>
                  {t("Quantity", "จำนวน")}
                  <input
                    required
                    inputMode="decimal"
                    maxLength={19}
                    value={draft.quantity}
                    aria-invalid={!!errors.quantity}
                    onChange={(e) => edit(id, { quantity: e.target.value })}
                  />
                  <Message code={errors.quantity || null} />
                </label>
                <SelectField
                  label={t("Unit", "หน่วย")}
                  value={draft.unit}
                  required
                  disabled={locked}
                  error={errors.unit}
                  options={[
                    { value: "", label: t("Select unit", "เลือกหน่วย") },
                    ...units.map((value) => ({ value, label: labels[value] })),
                  ]}
                  onChange={(unit) => edit(id, { unit })}
                />
                <SelectField
                  label={t("Storage location", "ที่จัดเก็บ")}
                  value={draft.location}
                  required
                  disabled={locked}
                  error={errors.location}
                  options={[
                    { value: "", label: t("Select location", "เลือกที่จัดเก็บ") },
                    ...locationOptions,
                  ]}
                  onChange={(location) => edit(id, { location })}
                />
              </div>
              <details>
                <summary>
                  {t("Date, price and names", "วันที่ ราคา และชื่อ")}
                  {draft.expiry_date && ` · ${draft.expiry_date}`}
                  {draft.price && ` · ฿${draft.price}`}
                </summary>
                <div className="batch-details">
                  <DateField
                    label={t("Expiry date (optional)", "วันหมดอายุ (ถ้ามี)")}
                    value={draft.expiry_date}
                    today={day}
                    disabled={locked}
                    error={errors.expiry_date}
                    onChange={(expiry_date) => edit(id, { expiry_date })}
                  />
                  <label>
                    {t("Price paid (optional, THB)", "ราคาที่จ่าย (ถ้ามี, บาท)")}
                    <input
                      inputMode="decimal"
                      maxLength={13}
                      value={draft.price}
                      aria-invalid={!!errors.price}
                      onChange={(e) => edit(id, { price: e.target.value })}
                    />
                    <Message code={errors.price || null} />
                  </label>
                  {(["name_en", "name_th"] as const).map((key) => (
                    <label key={key}>
                      {key === "name_en"
                        ? t("English name (optional)", "ชื่อภาษาอังกฤษ (ถ้ามี)")
                        : t("Thai name (optional)", "ชื่อภาษาไทย (ถ้ามี)")}
                      <input
                        maxLength={200}
                        value={draft[key]}
                        onChange={(e) => edit(id, { [key]: e.target.value })}
                      />
                    </label>
                  ))}
                </div>
              </details>
            </fieldset>
          );
        })}
        {rows.length < maxBatch && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  id: crypto.randomUUID(),
                  draft: { ...blank },
                  original: null,
                },
              ])
            }
          >
            <Plus size={16} />
            {t("Add missing item", "เพิ่มรายการที่ขาด")}
          </button>
        )}
      </fieldset>
      <button className="primary batch-save" disabled={busy || !rows.length}>
        {busy
          ? t("Saving…", "กำลังบันทึก…")
          : submitted
            ? t("Retry save", "ลองบันทึกอีกครั้ง")
            : t(
                `Save ${rows.length} ${rows.length === 1 ? "item" : "items"}`,
                `บันทึก ${rows.length} รายการ`,
              )}
      </button>
    </form>
  );
}
