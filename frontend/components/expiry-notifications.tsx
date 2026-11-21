"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Bell, CircleAlert, X } from "lucide-react";
import { displayName, type Stock } from "@/lib/pantry";
import { useLabels, useText } from "./ui";

export function ExpiryAlert({
  entries,
  review,
}: {
  entries: Stock[];
  review: () => void;
}) {
  const { t } = useText();
  if (!entries.length) return null;
  return (
    <section
      className="expiry-alert"
      role="alert"
      aria-label={t("Expired groceries", "วัตถุดิบที่หมดอายุ")}
    >
      <CircleAlert size={22} aria-hidden="true" />
      <div>
        <strong>
          {t(
            `${entries.length} ${entries.length === 1 ? "grocery entry is" : "grocery entries are"} past the expiry date.`,
            `มีวัตถุดิบเลยวันหมดอายุ ${entries.length} รายการ`,
          )}
        </strong>
        <p>
          {t(
            "Review these items and update your pantry.",
            "ตรวจสอบรายการเหล่านี้และอัปเดตของในคลัง",
          )}
        </p>
      </div>
      <button type="button" className="secondary" onClick={review}>
        {t("Review expired items", "ดูรายการที่หมดอายุ")}
      </button>
    </section>
  );
}

export function ExpiryNotifications({
  entries,
  loading,
  failed,
  retry,
  review,
  storageKey,
}: {
  entries: Stock[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
  review: () => void;
  storageKey: string;
}) {
  const { t, lang } = useText();
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [readReady, setReadReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const tokens = JSON.stringify(
    entries.map((item) => `${item.id}:${item.expiry_date}`),
  );
  const unread = entries.filter(
    (item) => !seen.has(`${item.id}:${item.expiry_date}`),
  ).length;
  useEffect(() => {
    function read(raw: string | null) {
      try {
        const values: unknown = JSON.parse(raw ?? "[]");
        setSeen(
          new Set(
            Array.isArray(values)
              ? values.filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
          ),
        );
      } catch {
        setSeen(new Set());
      }
    }
    try {
      read(localStorage.getItem(storageKey));
    } catch {
      read(null);
    }
    setReadReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) read(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  useEffect(() => {
    if (!open || loading || failed || !readReady) return;
    const current: string[] = JSON.parse(tokens);
    if (current.every((token) => seen.has(token))) return;
    const next = new Set([...seen, ...current]);
    setSeen(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {}
  }, [open, loading, failed, readReady, tokens, seen, storageKey]);
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const outside = (event: PointerEvent | FocusEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className="expiry-notifications" ref={container}>
      <button
        type="button"
        ref={trigger}
        className="icon notification-trigger"
        aria-label={t(
          `Notifications${entries.length ? `, ${entries.length} expired entries` : ""}`,
          `การแจ้งเตือน${entries.length ? ` มีวัตถุดิบหมดอายุ ${entries.length} รายการ` : ""}`,
        )}
        aria-haspopup="dialog"
        aria-description={t(
          `${unread} unread expiry alerts`,
          `มีแจ้งเตือนหมดอายุที่ยังไม่ได้อ่าน ${unread} รายการ`,
        )}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen(!open)}
      >
        <Bell size={21} aria-hidden="true" />
        {readReady && !open && unread > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          className="notifications-panel"
          id={`${id}-panel`}
          role="dialog"
          aria-labelledby={`${id}-title`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <header>
            <h2 id={`${id}-title`}>{t("Notifications", "การแจ้งเตือน")}</h2>
            <button
              type="button"
              className="icon"
              ref={closeButton}
              aria-label={t("Close notifications", "ปิดการแจ้งเตือน")}
              onClick={close}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {failed ? (
            <div className="notification-message" role="status">
              <p>{t("Could not check expiry dates.", "ตรวจสอบวันหมดอายุไม่ได้")}</p>
              <button type="button" className="secondary" onClick={retry}>
                {t("Try again", "ลองอีกครั้ง")}
              </button>
            </div>
          ) : loading ? (
            <p className="notification-message" role="status">
              {t("Checking expiry dates…", "กำลังตรวจสอบวันหมดอายุ…")}
            </p>
          ) : entries.length ? (
            <>
              <p className="notification-message">
                {t(
                  `${entries.length} expired entries to review.`,
                  `มีวัตถุดิบหมดอายุ ${entries.length} รายการที่ควรตรวจสอบ`,
                )}
              </p>
              <ul className="notification-list">
                {entries.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <CircleAlert size={18} aria-hidden="true" />
                    <div>
                      <strong>{displayName(item, lang)}</strong>
                      <span>
                        {item.quantity} {labels[item.unit]} ·{" "}
                        {labels[item.location]}
                      </span>
                      <span>
                        {t("Expiry date", "วันหมดอายุ")}:{" "}
                        {new Intl.DateTimeFormat(lang, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(item.expiry_date! + "T12:00:00"))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {entries.length > 5 && (
                <p className="notification-message">
                  {t(
                    `And ${entries.length - 5} more entries.`,
                    `และอีก ${entries.length - 5} รายการ`,
                  )}
                </p>
              )}
              <button
                type="button"
                className="secondary notification-review"
                onClick={() => {
                  close();
                  review();
                }}
              >
                {t("Review expired items", "ดูรายการที่หมดอายุ")}
              </button>
            </>
          ) : (
            <p className="notification-message" role="status">
              {t("No expired groceries in your pantry.", "ไม่มีวัตถุดิบหมดอายุในคลัง")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
