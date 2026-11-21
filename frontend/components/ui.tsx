"use client";
import { useState, useRef, useEffect, useId } from "react";
import { X, CircleAlert, LoaderCircle, Globe, Sprout } from "lucide-react";
import { useLanguage } from "./language";
import { ApiError } from "@/lib/api";

export function useText() {
  const { lang } = useLanguage();
  return {
    lang,
    t: (english: string, thai: string) => (lang === "th" ? thai : english),
  };
}
export function Brand() {
  return (
    <span className="brand">
      <img src="/icon.svg" width="36" height="36" alt="" />
      fridgellio
    </span>
  );
}
export function LanguageButton({
  change,
  disabled,
}: {
  change: () => void;
  disabled?: boolean;
}) {
  const { lang, t } = useText();
  return (
    <button
      type="button"
      className="language"
      disabled={disabled}
      onClick={change}
      aria-label={t("Switch to Thai", "เปลี่ยนเป็นภาษาอังกฤษ")}
    >
      <Globe size={16} />
      <span lang="en" className={lang === "en" ? "active" : ""}>
        EN
      </span>
      <span aria-hidden="true">/</span>
      <span lang="th" className={lang === "th" ? "active" : ""}>
        ไทย
      </span>
    </button>
  );
}
const errors: Record<string, [string, string]> = {
  invalid_credentials: [
    "Check your username and password.",
    "ตรวจสอบชื่อผู้ใช้และรหัสผ่าน",
  ],
  username_unavailable: [
    "That username is taken. Choose another.",
    "มีผู้ใช้ชื่อนี้แล้ว กรุณาเลือกชื่อใหม่",
  ],
  auth_rate_limited: [
    "Too many attempts. Try again in 15 minutes.",
    "ลองหลายครั้งเกินไป กรุณาลองใหม่ใน 15 นาที",
  ],
  invalid_request: [
    "Check the fields and try again.",
    "ตรวจสอบข้อมูลแล้วลองอีกครั้ง",
  ],
  invitation_unavailable: [
    "This code has expired or has already been used.",
    "รหัสนี้หมดอายุหรือถูกใช้แล้ว",
  ],
  already_in_household: [
    "This account already has a household. Reload to open it.",
    "บัญชีนี้มีครัวเรือนแล้ว โหลดหน้าใหม่เพื่อเปิดครัวเรือน",
  ],
  insufficient_stock: [
    "The amount exceeds the remaining stock.",
    "จำนวนมากกว่าปริมาณคงเหลือ",
  ],
  invalid_count: [
    "Enter a whole number for individual items.",
    "กรอกจำนวนชิ้นเป็นจำนวนเต็ม",
  ],
  stock_not_found: [
    "This entry is no longer available. Refresh the pantry.",
    "ไม่พบรายการนี้แล้ว กรุณาโหลดคลังอาหารใหม่",
  ],
  product_not_found: [
    "No product found. Add this item manually.",
    "ไม่พบสินค้า กรุณาเพิ่มรายการด้วยตนเอง",
  ],
  barcode_timeout: [
    "Lookup timed out. Try again or enter the item manually.",
    "ค้นหาไม่ทันเวลา ลองใหม่หรือกรอกเอง",
  ],
  barcode_unavailable: [
    "Lookup is unavailable. Try again or enter the item manually.",
    "ค้นหาไม่ได้ในขณะนี้ ลองใหม่หรือกรอกเอง",
  ],
  barcode_rate_limited: [
    "Barcode lookup is busy. Try again shortly.",
    "ระบบค้นหาบาร์โค้ดไม่ว่าง ลองใหม่ภายหลัง",
  ],
  camera: [
    "Couldn’t open the camera. Check permission or type the barcode.",
    "เปิดกล้องไม่ได้ ตรวจสอบสิทธิ์หรือพิมพ์บาร์โค้ด",
  ],
  photo: [
    "Photo analysis is unavailable. Try again later or add the item manually.",
    "ยังวิเคราะห์รูปไม่ได้ ลองภายหลังหรือกรอกเอง",
  ],
  empty_photo: [
    "No groceries were detected. Try a different photo or add an item manually.",
    "ไม่พบของสดในภาพ ลองเปลี่ยนภาพหรือกรอกเอง",
  ],
  menu: [
    "Menu generation is unavailable. You can still manage your pantry and equipment.",
    "ยังสร้างเมนูไม่ได้ คุณยังจัดการคลังอาหารและอุปกรณ์ได้",
  ],
  no_suitable_menu: [
    "No suitable menu was found. Try different ingredients or equipment.",
    "ไม่พบเมนูที่เหมาะสม ลองเปลี่ยนวัตถุดิบหรืออุปกรณ์",
  ],
  invalid_menu: [
    "The menu could not be validated. Try again.",
    "ตรวจสอบเมนูไม่สำเร็จ กรุณาลองอีกครั้ง",
  ],
  database_unavailable: [
    "The pantry database is unavailable. Try again shortly.",
    "ฐานข้อมูลคลังอาหารไม่พร้อมใช้งาน กรุณาลองใหม่",
  ],
  quantity: [
    "Enter a positive quantity with up to 12 whole and 6 decimal digits.",
    "กรอกจำนวนบวกที่มีเลขจำนวนเต็มไม่เกิน 12 หลักและทศนิยมไม่เกิน 6 หลัก",
  ],
  whole: [
    "Enter a whole number for individual items.",
    "กรอกจำนวนชิ้นเป็นจำนวนเต็ม",
  ],
  date: ["Enter a valid calendar date.", "กรอกวันที่ให้ถูกต้อง"],
  name: ["Enter an item name.", "กรอกชื่อรายการ"],
  required: ["Complete this field.", "กรอกช่องนี้"],
  expired: [
    "Your session ended. Sign in again.",
    "เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง",
  ],
};
export function Message({ code }: { code: string | null }) {
  const { t } = useText();
  if (!code) return null;
  const pair =
    errors[code] ||
    ([
      "The request could not be completed. Check your connection and try again.",
      "ทำรายการไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
    ] as const);
  return (
    <p className="error" role="alert">
      <CircleAlert size={17} />
      {t(...pair)}
    </p>
  );
}
export function Busy() {
  const { t } = useText();
  return (
    <p role="status" className="busy">
      <LoaderCircle size={17} className="spin" />
      {t("Loading…", "กำลังโหลด…")}
    </p>
  );
}
export function useAction() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>, ai?: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "service_unavailable";
      setError(code === "ai_not_implemented" && ai ? ai : code);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}
export function Retry({ onClick }: { onClick: () => void }) {
  const { t } = useText();
  return (
    <button type="button" className="secondary" onClick={onClick}>
      {t("Try again", "ลองอีกครั้ง")}
    </button>
  );
}
export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty">
      <Sprout size={36} />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
    </div>
  );
}
export function Dialog({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { t } = useText();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <header className="dialog-head">
        <h2 id={id}>{title}</h2>
        <button
          className="icon"
          type="button"
          disabled={busy}
          aria-label={t("Close", "ปิด")}
          onClick={close}
        >
          <X size={21} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function useLabels() {
  const { t } = useText();
  return {
    pantry: t("Pantry", "ตู้กับข้าว"),
    fridge: t("Fridge", "ตู้เย็น"),
    freezer: t("Freezer", "ช่องแช่แข็ง"),
    other: t("Other", "อื่น ๆ"),
    each: t("each", "ชิ้น"),
    g: t("g", "กรัม"),
    kg: t("kg", "กก."),
    ml: t("ml", "มล."),
    l: t("l", "ลิตร"),
    due_today: t("Due today", "ครบกำหนดวันนี้"),
    past_date: t("Past date", "เลยวันที่ระบุ"),
    use_soon: t("Use soon", "ควรใช้เร็ว ๆ นี้"),
    later: t("Later", "ยังเก็บได้"),
    no_date: t("No date", "ไม่ระบุวันที่"),
  };
}
