"use client";
import { useEffectEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PencilLine, Camera, ScanBarcode } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  locations,
  units,
  validDate,
  quantityError,
  priceError,
  packageMeasurement,
  type Stock,
  type Unit,
  type Location,
  type Localized,
} from "@/lib/pantry";
import { Dialog, Message, useAction, useText, useLabels } from "./ui";
import {
  CameraPreview,
  captureFrame,
  GroceryPhoto,
  type CameraSession,
} from "./grocery-camera";

type Draft = {
  name: string;
  name_en: string;
  name_th: string;
  quantity: string;
  price: string;
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
  price: "",
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
    price: stock.price ?? "",
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
    price: draft.price || null,
    unit: draft.unit,
    location: draft.location,
    expiry_date: draft.expiry_date || null,
  };
}
async function readBarcodeFrame(video: HTMLVideoElement, signal: AbortSignal) {
  const photo = await captureFrame(video);
  const data = new FormData();
  data.append("photo", photo, "barcode.jpg");
  const digits = await api<unknown>("barcodes/decode", "POST", data, {
    signal,
  });
  if (typeof digits !== "string" || !/^[0-9]{4,24}$/.test(digits))
    throw new ApiError("service_unavailable");
  return digits;
}

function Scanner({
  found,
  failed,
}: {
  found: (digits: string) => void;
  failed: (code: string) => void;
}) {
  const { t } = useText();
  const onFound = useEffectEvent(found);
  const onFailed = useEffectEvent(failed);
  function start({ video, signal, stop }: CameraSession) {
    let timer: number | undefined;
    signal.addEventListener("abort", () => window.clearTimeout(timer), {
      once: true,
    });
    async function scan() {
      if (signal.aborted) return;
      let digits: string;
      try {
        digits = await readBarcodeFrame(video, signal);
      } catch (error) {
        if (signal.aborted) return;
        const code =
          error instanceof ApiError ? error.code : "service_unavailable";
        if (code === "barcode_not_found" || code === "multiple_barcodes") {
          // Wait for the user to reposition the camera before sending another frame.
          timer = window.setTimeout(scan, 750);
        } else {
          stop();
          onFailed(code);
        }
        return;
      }
      if (signal.aborted) return;
      stop();
      onFound(digits);
    }
    void scan();
  }
  return (
    <>
      <CameraPreview onReady={start} failed={failed} />
      <p className="hint" role="status">
        {t("Point the camera at one barcode.", "เล็งกล้องไปที่บาร์โค้ดหนึ่งอัน")}
      </p>
    </>
  );
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
    [scan, setScan] = useState(false);
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
      setCode(digits);
      setScan(false);
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
        ...packageMeasurement(data.Quantity, data.Unit),
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
                found={lookup}
                failed={(code) => {
                  setScan(false);
                  action.setError(code);
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
        <GroceryPhoto
          busy={action.busy}
          setError={action.setError}
          analyze={(photo) => {
            void action.run(async () => {
              const data = new FormData();
              data.append("photo", photo);
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
        />
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
            const price = priceError(draft.price);
            if (price) errors.price = price;
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
              {t("Price paid (optional, THB)", "ราคาที่จ่าย (ถ้ามี, บาท)")}
              <input
                inputMode="decimal"
                maxLength={13}
                placeholder="0.00"
                aria-invalid={!!invalid.price}
                value={draft.price}
                onChange={(e) => change("price", e.target.value)}
              />
              {fieldError("price")}
            </label>
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
