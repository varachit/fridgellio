"use client";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PencilLine, Camera, ScanBarcode } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  locations,
  units,
  validDate,
  quantityError,
  type Stock,
  type Unit,
  type Location,
  type Localized,
} from "@/lib/pantry";
import { Dialog, Message, useAction, useText, useLabels } from "./ui";

type Draft = {
  name: string;
  name_en: string;
  name_th: string;
  quantity: string;
  unit: Unit | "";
  location: Location | "";
  expiry_date: string;
};
type Suggestion = {
  name: Localized;
  quantity: string | null;
  unit: Unit | null;
  expiry_date: string | null;
};
type Barcode = {
  name: string;
  name_en: string | null;
  name_th: string | null;
  brands: string;
  Quantity: number | null;
  Unit: string | null;
};
const blank: Draft = {
  name: "",
  name_en: "",
  name_th: "",
  quantity: "",
  unit: "",
  location: "",
  expiry_date: "",
};
function fromStock(stock?: Stock): Draft {
  if (!stock) return { ...blank };
  return {
    name: stock.name,
    name_en: stock.name_en ?? "",
    name_th: stock.name_th ?? "",
    quantity: stock.quantity,
    unit: stock.unit,
    location: stock.location,
    expiry_date: stock.expiry_date ?? "",
  };
}
function payload(draft: Draft) {
  return {
    name: draft.name.trim(),
    name_en: draft.name_en.trim() || null,
    name_th: draft.name_th.trim() || null,
    quantity: draft.quantity,
    unit: draft.unit,
    location: draft.location,
    expiry_date: draft.expiry_date || null,
  };
}
function Scanner({
  found,
  failed,
}: {
  found: (code: string) => void;
  failed: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const handlers = useRef({ found, failed });
  handlers.current = { found, failed };
  useEffect(() => {
    let active = true,
      finished = false,
      stop: (() => void) | undefined;
    async function start() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!active || !video.current) return;
      const reader = new BrowserMultiFormatReader();
      const control = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video.current,
        (result, _error, controls) => {
          if (!active) {
            controls.stop();
            return;
          }
          const value = result?.getText();
          if (!finished && value && /^[0-9]{4,24}$/.test(value)) {
            finished = true;
            controls.stop();
            handlers.current.found(value);
          }
        },
      );
      stop = () => control.stop();
      if (!active) stop();
    }
    start().catch(() => {
      if (active) handlers.current.failed();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, []);
  return <video className="scanner" ref={video} autoPlay playsInline muted />;
}
export function StockEditor({
  existing,
  day,
  close,
  saved,
}: {
  existing?: Stock;
  day: string;
  close: () => void;
  saved: () => void;
}) {
  const client = useQueryClient();
  const { t, lang } = useText(),
    labels = useLabels(),
    action = useAction();
  const [initialDraft] = useState(() => fromStock(existing));
  const [method, setMethod] = useState<"manual" | "photo" | "barcode">(
      "manual",
    ),
    [draft, setDraft] = useState(initialDraft);
  const [code, setCode] = useState(""),
    [scan, setScan] = useState(false),
    [file, setFile] = useState<File | null>(null);
  const [queue, setQueue] = useState<Draft[]>([]),
    [hint, setHint] = useState(""),
    [source, setSource] = useState<string | null>(null),
    [review, setReview] = useState(false);
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  function change(field: keyof Draft, value: string) {
    setDraft({ ...draft, [field]: value });
    setInvalid({ ...invalid, [field]: "" });
  }
  function switchMethod(m: typeof method) {
    setScan(false);
    setReview(false);
    setMethod(m);
    setQueue([]);
    setHint("");
    setSource(null);
    action.setError(null);
    setInvalid({});
  }
  function lookup(digits: string) {
    void action.run(async () => {
      const { data, source } = await client.fetchQuery({
        queryKey: ["barcodes", digits, lang],
        queryFn: async ({ signal }) => {
          let source: string | null = null;
          const data = await api<Barcode>(
            "barcodes/" + digits + "?language=" + lang,
            "GET",
            undefined,
            {
              signal,
              onHeaders: (headers) => {
                const url = headers.get("X-Barcode-Source");
                if (url && /^https?:\/\//i.test(url)) source = url;
              },
            },
          );
          return { data, source };
        },
        staleTime: 5 * 60_000,
      });
      const size =
        data.Quantity != null && data.Unit
          ? `${data.Quantity} ${data.Unit}`
          : null;
      setHint([data.brands, size].filter(Boolean).join(" · "));
      setSource(source);
      setDraft({
        ...blank,
        name: data.name || "",
        name_en: data.name_en || "",
        name_th: data.name_th || "",
      });
      setReview(true);
    });
  }
  const fieldError = (key: keyof Draft) => <Message code={invalid[key]} />;
  const textField = (key: "name" | "name_en" | "name_th", label: string) => (
    <label>
      {label}
      <input
        maxLength={200}
        value={draft[key]}
        required={key === "name"}
        aria-invalid={!!invalid[key]}
        onChange={(e) => change(key, e.target.value)}
      />
      {fieldError(key)}
    </label>
  );
  return (
    <Dialog
      title={
        existing
          ? t("Edit entry", "แก้ไขรายการ")
          : t("Add groceries", "เพิ่มของสด")
      }
      close={close}
      busy={action.busy}
    >
      {!existing && (
        <div className="segmented methods">
          {(
            [
              { key: "manual", icon: PencilLine, text: t("Manual", "กรอกเอง") },
              {
                key: "barcode",
                icon: ScanBarcode,
                text: t("Barcode", "บาร์โค้ด"),
              },
              { key: "photo", icon: Camera, text: t("Photo", "รูปถ่าย") },
            ] as const
          ).map((m) => (
            <button
              disabled={action.busy}
              type="button"
              key={m.key}
              aria-pressed={m.key === method}
              onClick={() => switchMethod(m.key)}
            >
              <m.icon size={17} />
              {m.text}
            </button>
          ))}
        </div>
      )}
      {method === "barcode" && !review ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setScan(false);
            lookup(code);
          }}
        >
          <fieldset disabled={action.busy}>
            <label>
              {t("Barcode digits", "เลขบาร์โค้ด")}
              <input
                inputMode="numeric"
                pattern="[0-9]{4,24}"
                minLength={4}
                maxLength={24}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            {scan && (
              <Scanner
                found={(digits) => {
                  setScan(false);
                  setCode(digits);
                }}
                failed={() => {
                  setScan(false);
                  action.setError("camera");
                }}
              />
            )}
            <div className="actions">
              <button className="primary">
                {action.busy
                  ? t("Looking up…", "กำลังค้นหา…")
                  : t("Look up product", "ค้นหาสินค้า")}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  action.setError(null);
                  setScan(!scan);
                }}
              >
                {scan
                  ? t("Stop camera", "ปิดกล้อง")
                  : t("Scan barcode", "สแกนบาร์โค้ด")}
              </button>
            </div>
          </fieldset>
        </form>
      ) : method === "photo" && !review ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) return;
            void action.run(async () => {
              const data = new FormData();
              data.append("photo", file);
              const response = await api<{ suggestions: Suggestion[] }>(
                "photos/analyze",
                "POST",
                data,
              );
              if (!response.suggestions?.length)
                throw new ApiError("empty_photo");
              const drafts = response.suggestions.map((s) => ({
                ...blank,
                name: s.name[lang],
                name_en: s.name.en,
                name_th: s.name.th,
                quantity: s.quantity == null ? "" : String(s.quantity),
                unit: s.unit ?? ("" as const),
                expiry_date: s.expiry_date || "",
              }));
              setDraft(drafts[0]);
              setQueue(drafts.slice(1));
              setReview(true);
            }, "photo");
          }}
        >
          <fieldset disabled={action.busy}>
            <label>
              {t("Grocery photo", "ภาพถ่ายของสด")}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className="primary">
              {action.busy
                ? t("Analyzing photo…", "กำลังวิเคราะห์ภาพ…")
                : t("Analyze photo", "วิเคราะห์รูป")}
            </button>
          </fieldset>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const errors: Record<string, string> = {};
            if (!draft.name.trim()) errors.name = "name";
            if (!draft.unit) errors.unit = "required";
            if (!draft.location) errors.location = "required";
            const q = quantityError(draft.quantity, draft.unit || "g");
            if (q) errors.quantity = q;
            if (!validDate(draft.expiry_date)) errors.expiry_date = "date";
            setInvalid(errors);
            if (Object.keys(errors).length) return;
            void action.run(async () => {
              const values = payload(draft);
              if (existing) {
                const original = payload(initialDraft);
                const changes = Object.fromEntries(
                  Object.entries(values).filter(
                    ([k, v]) => v !== original[k as keyof typeof original],
                  ),
                );
                if (Object.keys(changes).length)
                  await api(
                    "inventory/" + existing.id + "?today=" + day,
                    "PATCH",
                    changes,
                  );
              } else await api("inventory?today=" + day, "POST", values);
              saved();
              if (queue.length) {
                setDraft(queue[0]);
                setQueue(queue.slice(1));
              } else close();
            });
          }}
        >
          <fieldset disabled={action.busy}>
            {review && (
              <p className="hint">
                {t(
                  "Review the item and confirm the amount you are adding.",
                  "ตรวจสอบรายการและยืนยันปริมาณที่ต้องการเพิ่ม",
                )}
                {hint && (
                  <>
                    <br />
                    {hint}
                  </>
                )}
                {source && (
                  <>
                    <br />
                    <a href={source} target="_blank" rel="noreferrer">
                      {t("Product source", "แหล่งข้อมูลสินค้า")}
                    </a>
                  </>
                )}
              </p>
            )}
            {textField("name", t("Item name", "ชื่อรายการ"))}
            <details open={review || undefined}>
              <summary>
                {t("English and Thai names", "ชื่อภาษาอังกฤษและภาษาไทย")}
              </summary>
              {textField(
                "name_en",
                t("English name (optional)", "ชื่อภาษาอังกฤษ (ถ้ามี)"),
              )}
              {textField(
                "name_th",
                t("Thai name (optional)", "ชื่อภาษาไทย (ถ้ามี)"),
              )}
            </details>
            <div className="pair">
              <label>
                {t("Quantity", "จำนวน")}
                <input
                  inputMode="decimal"
                  maxLength={19}
                  required
                  aria-invalid={!!invalid.quantity}
                  value={draft.quantity}
                  onChange={(e) => change("quantity", e.target.value)}
                />
                {fieldError("quantity")}
              </label>
              <label>
                {t("Unit", "หน่วย")}
                <select
                  required
                  value={draft.unit}
                  onChange={(e) => change("unit", e.target.value)}
                >
                  <option value="">{t("Select unit", "เลือกหน่วย")}</option>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {labels[u]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              {t("Storage location", "ที่จัดเก็บ")}
              <select
                required
                value={draft.location}
                onChange={(e) => change("location", e.target.value)}
              >
                <option value="">{t("Select location", "เลือกที่จัดเก็บ")}</option>
                {locations.map((l) => (
                  <option key={l} value={l}>
                    {labels[l]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Expiry date (optional)", "วันหมดอายุ (ถ้ามี)")}
              <input
                type="date"
                min="0001-01-01"
                max="9999-12-31"
                value={draft.expiry_date}
                onChange={(e) => change("expiry_date", e.target.value)}
              />
              {fieldError("expiry_date")}
            </label>
            <div className="actions">
              <button className="primary">
                {action.busy
                  ? t("Saving…", "กำลังบันทึก…")
                  : queue.length
                    ? t("Save and review next", "บันทึกและตรวจรายการถัดไป")
                    : t("Save entry", "บันทึกรายการ")}
              </button>
              {queue.length > 0 && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setDraft(queue[0]);
                    setQueue(queue.slice(1));
                    setInvalid({});
                  }}
                >
                  {t("Skip item", "ข้ามรายการ")}
                </button>
              )}
            </div>
          </fieldset>
        </form>
      )}
      <Message code={action.error} />
      {action.error && method !== "manual" && !review && (
        <button className="link" onClick={() => switchMethod("manual")}>
          {t("Enter manually", "กรอกด้วยตนเอง")}
        </button>
      )}
    </Dialog>
  );
}
