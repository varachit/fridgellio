"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, useIsPresent } from "motion/react";
import { PickerPanel } from "./picker-panel";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { validDate } from "@/lib/pantry";
import { Message, useText } from "./ui";
import { usePicker } from "./use-picker";

// Do calendar arithmetic in UTC so local clock changes cannot skip a day.
function calendarDay(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}
function isoDay(date: Date) {
  if (date.getUTCFullYear() < 1) return "0001-01-01";
  if (date.getUTCFullYear() > 9999) return "9999-12-31";
  return date.toISOString().slice(0, 10);
}

function Calendar({
  id,
  cursor,
  setCursor,
  selected,
  today,
  pick,
}: {
  id: string;
  cursor: string;
  setCursor: (day: string) => void;
  selected: string;
  today: string;
  pick: (date: string) => void;
}) {
  const { lang, t } = useText();
  const present = useIsPresent();
  const active = useRef<HTMLButtonElement>(null);
  const focusDay = useRef(true);
  const date = new Date(cursor + "T00:00:00Z");
  const year = date.getUTCFullYear(),
    month = date.getUTCMonth(),
    day = date.getUTCDate();
  const start = calendarDay(year, month, 1).getUTCDay();
  const days = calendarDay(year, month + 1, 0).getUTCDate();
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(lang, {
      ...options,
      calendar: "gregory",
      timeZone: "UTC",
    });
  const monthLabel = format({ month: "long", year: "numeric" }).format(date);
  const dayLabel = format({ dateStyle: "full" });
  const weekday = format({ weekday: "short" });

  useLayoutEffect(() => {
    if (present && focusDay.current) active.current?.focus();
    focusDay.current = !present;
  }, [cursor, present]);

  function moveMonth(offset: number) {
    const last = calendarDay(year, month + offset + 1, 0).getUTCDate();
    setCursor(isoDay(calendarDay(year, month + offset, Math.min(day, last))));
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -date.getUTCDay(),
      End: 6 - date.getUTCDay(),
    };
    if (event.key in offsets) {
      event.preventDefault();
      focusDay.current = true;
      setCursor(isoDay(calendarDay(year, month, day + offsets[event.key])));
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      focusDay.current = true;
      moveMonth((event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1));
    }
  }

  return (
    <PickerPanel
      className="calendar"
      id={id}
      role="group"
      aria-label={t("Calendar", "ปฏิทิน")}
    >
      <div className="calendar-heading">
        <button
          type="button"
          aria-label={t("Previous month", "เดือนก่อนหน้า")}
          disabled={year === 1 && month === 0}
          onClick={() => moveMonth(-1)}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <strong aria-live="polite" id={id + "-month"}>
          {monthLabel}
        </strong>
        <button
          type="button"
          aria-label={t("Next month", "เดือนถัดไป")}
          disabled={year === 9999 && month === 11}
          onClick={() => moveMonth(1)}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <table role="grid" aria-labelledby={id + "-month"}>
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, i) => (
              <th key={i} scope="col">
                {weekday.format(calendarDay(year, month, 1 - start + i))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil((start + days) / 7) }, (_, week) => (
            <tr key={week}>
              {Array.from({ length: 7 }, (_, i) => {
                const number = week * 7 + i - start + 1;
                if (number < 1 || number > days) return <td key={i} />;
                const cell = calendarDay(year, month, number);
                const value = isoDay(cell);
                return (
                  <td key={i} aria-selected={value === selected}>
                    <button
                      type="button"
                      tabIndex={value === cursor ? 0 : -1}
                      ref={value === cursor ? active : undefined}
                      aria-label={dayLabel.format(cell)}
                      aria-current={value === today ? "date" : undefined}
                      onKeyDown={navigate}
                      onClick={() => pick(value)}
                    >
                      {number}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="calendar-actions">
        <button type="button" disabled={!selected} onClick={() => pick("")}>
          {t("Clear date", "ล้างวันที่")}
        </button>
        <button type="button" onClick={() => pick(today)}>
          {t("Today", "วันนี้")}
        </button>
      </div>
    </PickerPanel>
  );
}

export function DateField({
  label,
  value,
  today,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  today: string;
  onChange: (date: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const { t } = useText();
  const id = useId();
  const [cursor, setCursor] = useState(today);
  const { container, trigger, open, setOpen, close } = usePicker(disabled);
  return (
    <div
      ref={container}
      className="picker-field"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="date-input">
        <input
          id={id}
          type="text"
          placeholder={t("YYYY-MM-DD", "YYYY-MM-DD (ค.ศ.)")}
          maxLength={10}
          autoComplete="off"
          aria-description={t(
            "Use YYYY-MM-DD.",
            "กรอกปี ค.ศ.-เดือน-วัน (YYYY-MM-DD)",
          )}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          value={value}
          disabled={disabled}
          onFocus={() => setOpen(false)}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          ref={trigger}
          disabled={disabled}
          aria-label={t("Choose date", "เลือกวันที่")}
          aria-expanded={open}
          aria-controls={open ? id + "-calendar" : undefined}
          onClick={() => {
            if (!open) setCursor(value && validDate(value) ? value : today);
            setOpen(!open);
          }}
        >
          <CalendarDays size={20} aria-hidden="true" />
        </button>
      </div>
      {error && <Message id={id + "-error"} code={error} />}
      <AnimatePresence initial={false}>
        {open && (
          <Calendar
            key={id}
            cursor={cursor}
            setCursor={setCursor}
            id={id + "-calendar"}
            selected={value}
            today={today}
            pick={(date) => {
              onChange(date);
              close();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
