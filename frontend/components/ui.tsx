"use client";
import { useState, useRef } from "react";
import { CircleAlert, LoaderCircle, Globe, Sprout } from "lucide-react";
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
  profile_names_required: [
    "Enter both a first name and a last name.",
    "กรอกทั้งชื่อและนามสกุล",
  ],
  invitation_unavailable: [
    "This invitation code is no longer available.",
    "รหัสเชิญนี้ใช้ไม่ได้แล้ว",
  ],
  invite_forbidden: [
    "Only the household owner can manage invitations.",
    "เฉพาะเจ้าของครัวเรือนเท่านั้นที่จัดการคำเชิญได้",
  ],
  already_in_household: [
    "This account already has a household. Reload to open it.",
    "บัญชีนี้มีครัวเรือนแล้ว โหลดหน้าใหม่เพื่อเปิดครัวเรือน",
  ],
  insufficient_stock: [
    "The amount exceeds the remaining stock.",
    "จำนวนมากกว่าปริมาณคงเหลือ",
  ],
  meal_stock_shortage: [
    "There isn't enough in-date stock for this recipe. No ingredients were deducted.",
    "วัตถุดิบที่ยังไม่หมดอายุมีไม่พอสำหรับเมนูนี้ ยังไม่ได้หักวัตถุดิบจากคลัง",
  ],
  meal_quantity_precision: [
    "The exact amount could not be recorded in the stock entry’s unit. No ingredients were deducted.",
    "ไม่สามารถบันทึกปริมาณที่แน่นอนในหน่วยของรายการนี้ได้ ยังไม่ได้หักวัตถุดิบจากคลัง",
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
    "Camera unavailable. Check your camera and allow camera access in your browser.",
    "ใช้กล้องไม่ได้ ตรวจสอบกล้องและอนุญาตให้เบราว์เซอร์เข้าถึงกล้อง",
  ],
  camera_https: [
    "Open Fridgellio over HTTPS to use the camera.",
    "เปิด Fridgellio ผ่าน HTTPS เพื่อใช้กล้อง",
  ],
  camera_frame_unavailable: [
    "Couldn’t capture a photo. Try the camera again.",
    "ถ่ายภาพไม่ได้ กรุณาลองเปิดกล้องอีกครั้ง",
  ],
  photo: [
    "Photo analysis is unavailable. Try again later or add the item manually.",
    "ยังวิเคราะห์รูปไม่ได้ ลองภายหลังหรือกรอกเอง",
  ],
  photo_unavailable: [
    "Photo analysis is unavailable. Try again later or add the item manually.",
    "ยังวิเคราะห์รูปไม่ได้ ลองภายหลังหรือกรอกเอง",
  ],
  photo_invalid_response: [
    "The photo result could not be read. Try again or add the item manually.",
    "อ่านผลจากรูปไม่ได้ ลองอีกครั้งหรือกรอกเอง",
  ],
  photo_rate_limited: [
    "Photo analysis is busy. Try again shortly.",
    "ระบบวิเคราะห์รูปไม่ว่าง ลองใหม่ภายหลัง",
  ],
  invalid_photo: [
    "Choose a valid JPEG, PNG, or WebP photo.",
    "เลือกภาพ JPEG, PNG หรือ WebP ที่ถูกต้อง",
  ],
  photo_dimensions: [
    "Choose a photo no larger than 16 megapixels.",
    "เลือกภาพที่มีขนาดไม่เกิน 16 เมกะพิกเซล",
  ],
  empty_receipt: [
    "No grocery lines could be read. Try a clearer receipt image or paste a shopping list.",
    "อ่านรายการของสดไม่ได้ ลองใช้ภาพใบเสร็จที่ชัดขึ้นหรือวางรายการซื้อของ",
  ],
  empty_photo: [
    "No groceries were detected. Try a different photo or add an item manually.",
    "ไม่พบของสดในภาพ ลองเปลี่ยนภาพหรือกรอกเอง",
  ],
  menu: [
    "Menu generation is unavailable. You can still manage your pantry and equipment.",
    "ยังสร้างเมนูไม่ได้ คุณยังจัดการคลังอาหารและอุปกรณ์ได้",
  ],
  menu_rate_limited: [
    "Too many recipe requests. Try again shortly.",
    "ขอเมนูถี่เกินไป กรุณาลองใหม่ในอีกสักครู่",
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
  price: [
    "Enter a price with up to 10 whole and 2 decimal digits.",
    "กรอกราคาโดยมีจำนวนเต็มไม่เกิน 10 หลักและทศนิยมไม่เกิน 2 หลัก",
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
export function Message({ code, id }: { code: string | null; id?: string }) {
  const { t } = useText();
  if (!code) return null;
  const pair =
    errors[code] ||
    ([
      "The request could not be completed. Check your connection and try again.",
      "ทำรายการไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง",
    ] as const);
  return (
    <p id={id} className="error" role="alert">
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
export { Dialog } from "./dialog";
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
