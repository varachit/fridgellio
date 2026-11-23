"use client";
import { useEffectEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PencilLine,
  ShoppingBasket,
  Camera,
  List,
  ReceiptText,
  ScanBarcode,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  locations,
  units,
  packageMeasurement,
  type Stock,
  type Unit,
  type Location,
  type Localized,
} from "@/lib/pantry";
import {
  blank,
  draftErrors,
  maxBatch,
  payload,
  readGroceryList,
  type Draft,
  type BatchSource,
} from "@/lib/grocery-intake";
import { BatchReview } from "./batch-review";
import { DateField } from "./date-field";
import { SelectField } from "./select-field";
import { Dialog, Message, useAction, useText, useLabels } from "./ui";
import {
  CameraPreview,
  captureFrame,
  GroceryPhoto,
  type CameraSession,
} from "./grocery-camera";

type Suggestion = {
  name: Localized;
  quantity: string | null;
  unit: Unit | null;
  expiry_date?: string | null;
  printed_name?: string;
  price?: string | null;
};
type Barcode = {
  name: string;
  name_en: string | null;
  name_th: string | null;
  brands: string;
  Quantity: number | null;
  Unit: string | null;
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
  saved: (count?: number) => void;
}) {
  const client = useQueryClient();
  const { t, lang } = useText(),
    labels = useLabels(),
    action = useAction();
  const [initialDraft] = useState(() => fromStock(existing));
  const [method, setMethod] = useState<"manual" | "barcode" | BatchSource>(
      "manual",
    ),
    [draft, setDraft] = useState(initialDraft);
  const [code, setCode] = useState(""),
    [scan, setScan] = useState(false);
  const [batch, setBatch] = useState<{
      rows: Draft[];
      source: BatchSource;
      hasMore: boolean;
      receiptImage?: File;
    } | null>(null),
    [listText, setListText] = useState(""),
    [started, setStarted] = useState(0),
    [requestId, setRequestId] = useState(""),
    [hint, setHint] = useState(""),
    [source, setSource] = useState<string | null>(null),
    [review, setReview] = useState(false);
  const [invalid, setInvalid] = useState<Partial<Record<keyof Draft, string>>>(
    {},
  );
  function change(field: keyof Draft, value: string) {
    setDraft({ ...draft, [field]: value });
    setInvalid({ ...invalid, [field]: "" });
  }
  function switchMethod(m: typeof method) {
    if (m === method) return;
    if (m === "photo" || m === "list" || m === "receipt") {
      const key = crypto.randomUUID();
      setRequestId(key);
      setStarted(performance.now());
      // A missing start event must never block a shopper from reviewing or saving.
      void api("inventory/batch-starts", "POST", { source: m }, { key }).catch(
        () => {},
      );
    }
    setScan(false);
    setReview(false);
    setMethod(m);
    setBatch(null);
    setHint("");
    setSource(null);
    action.setError(null);
    setInvalid({});
  }
  async function startReview(
    drafts: Draft[],
    source: BatchSource,
    hasMore = false,
    receiptImage?: File,
  ) {
    const names = [
      ...new Set(
        drafts
          .map((row) => row.name.trim())
          .filter((name) => name && name.length <= 200),
      ),
    ];
    const hints = names.length
      ? await api<Record<string, Location>>(
          "inventory/location-hints",
          "POST",
          { names },
          { signal: AbortSignal.timeout(2000) },
        ).catch(() => ({}) as Record<string, Location>)
      : {};
    setBatch({
      source,
      hasMore,
      receiptImage,
      rows: drafts.map((draft) => ({
        ...draft,
        location: Object.hasOwn(hints, draft.name.trim())
          ? hints[draft.name.trim()]
          : "",
      })),
    });
  }
  const listRows = method === "list" && !batch ? readGroceryList(listText) : [];
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
  const fieldError = (key: keyof Draft) => (
    <Message code={invalid[key] || null} />
  );
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
      icon={existing ? PencilLine : ShoppingBasket}
      title={
        existing
          ? t("Edit entry", "แก้ไขรายการ")
          : t("Add groceries", "เพิ่มของสด")
      }
      close={close}
      busy={action.busy}
    >
      {!existing && !batch && (
        <div className="segmented methods">
          {(
            [
              { key: "list", icon: List, text: t("Paste list", "วางรายการ") },
              { key: "manual", icon: PencilLine, text: t("Manual", "กรอกเอง") },
              {
                key: "barcode",
                icon: ScanBarcode,
                text: t("Barcode", "บาร์โค้ด"),
              },
              { key: "photo", icon: Camera, text: t("Photo", "รูปถ่าย") },
              {
                key: "receipt",
                icon: ReceiptText,
                text: t("Receipt", "ใบเสร็จ"),
              },
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
      {batch ? (
        <BatchReview
          initial={batch.rows}
          source={batch.source}
          hasMore={batch.hasMore}
          receiptImage={batch.receiptImage}
          requestId={requestId}
          started={started}
          day={day}
          busy={action.busy}
          run={action.run}
          saved={(count) => {
            saved(count);
            close();
          }}
        />
      ) : method === "list" ? (
        <form
          className="grocery-list"
          onSubmit={(event) => {
            event.preventDefault();
            if (listRows.length && listRows.length <= maxBatch)
              void action.run(() => startReview(listRows, "list"));
          }}
        >
          <label>
            {t("Shopping list", "รายการซื้อของ")}
            <textarea
              rows={6}
              value={listText}
              disabled={action.busy}
              onChange={(event) => setListText(event.target.value)}
              aria-describedby="grocery-list-hint"
              placeholder={t(
                "Eggs 6 each\nRice 1 kg\nBasil",
                "ไข่ 6 ฟอง\nข้าว 1 กก.\nกะเพรา",
              )}
            />
          </label>
          <p id="grocery-list-hint" className="muted">
            {t(
              "Paste one item per line, up to 40. Include an amount and unit if you know them.",
              "วางของหนึ่งรายการต่อบรรทัด สูงสุด 40 รายการ ใส่จำนวนและหน่วยได้หากทราบ",
            )}
          </p>
          {listRows.length > maxBatch && (
            <p role="alert">
              {t(
                "Split this list into groups of 40 or fewer.",
                "แบ่งรายการเป็นกลุ่มละไม่เกิน 40 รายการ",
              )}
            </p>
          )}
          <button
            className="primary"
            disabled={
              action.busy || !listRows.length || listRows.length > maxBatch
            }
          >
            {t("Review list", "ตรวจรายการ")}
          </button>
        </form>
      ) : method === "barcode" && !review ? (
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
      ) : (method === "photo" || method === "receipt") && !review ? (
        <GroceryPhoto
          key={method}
          receipt={method === "receipt"}
          busy={action.busy}
          setError={action.setError}
          analyze={(photo) => {
            void action.run(async () => {
              const data = new FormData();
              data.append("photo", photo);
              const response = await api<{
                suggestions: Suggestion[];
                has_more?: boolean;
              }>(
                method === "receipt" ? "receipts/analyze" : "photos/analyze",
                "POST",
                data,
              );
              if (!response.suggestions?.length)
                throw new ApiError(
                  method === "receipt" ? "empty_receipt" : "empty_photo",
                );
              const drafts = response.suggestions.map((s) => ({
                ...blank,
                name: s.name[lang],
                name_en: s.name.en,
                name_th: s.name.th,
                quantity: s.quantity == null ? "" : String(s.quantity),
                unit: s.unit ?? ("" as const),
                expiry_date: method === "photo" ? s.expiry_date || "" : "",
                printedName: s.printed_name,
                price: s.price ?? "",
              }));
              await startReview(
                drafts,
                method,
                response.has_more,
                method === "receipt" ? photo : undefined,
              );
            }, "photo");
          }}
        />
      ) : (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const errors = draftErrors(draft);
            setInvalid(errors);
            if (Object.keys(errors).length) {
              const form = e.currentTarget;
              requestAnimationFrame(() =>
                form
                  .querySelector<HTMLElement>('[aria-invalid="true"]')
                  ?.focus(),
              );
              return;
            }
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
              close();
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
              <SelectField
                label={t("Unit", "หน่วย")}
                required
                value={draft.unit}
                disabled={action.busy}
                error={invalid.unit}
                onChange={(value) => change("unit", value)}
                options={[
                  { value: "", label: t("Select unit", "เลือกหน่วย") },
                  ...units.map((value) => ({ value, label: labels[value] })),
                ]}
              />
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
            <SelectField
              label={t("Storage location", "ที่จัดเก็บ")}
              required
              value={draft.location}
              disabled={action.busy}
              error={invalid.location}
              onChange={(value) => change("location", value)}
              options={[
                { value: "", label: t("Select location", "เลือกที่จัดเก็บ") },
                ...locations.map((value) => ({ value, label: labels[value] })),
              ]}
            />
            <DateField
              label={t("Expiry date (optional)", "วันหมดอายุ (ถ้ามี)")}
              value={draft.expiry_date}
              today={day}
              onChange={(value) => change("expiry_date", value)}
              disabled={action.busy}
              error={invalid.expiry_date}
            />
            <div className="actions">
              <button className="primary">
                {action.busy
                  ? t("Saving…", "กำลังบันทึก…")
                  : t("Save entry", "บันทึกรายการ")}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <Message code={action.error} />
      {action.error && method !== "manual" && !review && !batch && (
        <button className="link" onClick={() => switchMethod("manual")}>
          {t("Enter manually", "กรอกด้วยตนเอง")}
        </button>
      )}
    </Dialog>
  );
}
