"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useText } from "./ui";

const options = [
  { value: "en", label: "English" },
  { value: "th", label: "ไทย" },
] as const;

export function LanguageSelect({
  change,
  disabled,
}: {
  change: () => void;
  disabled: boolean;
}) {
  const { lang, t } = useText();
  const selected = options.findIndex((option) => option.value === lang);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const [above, setAbove] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
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
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function show(index = selected) {
    const rect = trigger.current?.getBoundingClientRect();
    setAbove(
      Boolean(rect && window.innerHeight - rect.bottom < 160 && rect.top > 160),
    );
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    if (disabled) return;
    setOpen(false);
    trigger.current?.focus();
    // There are two supported languages; selecting the current one is a no-op.
    if (options[index].value !== lang) change();
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else
        setActive(
          (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length,
        );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      show(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else show();
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
    } else if (event.key === "Tab") setOpen(false);
    else if (event.key.length === 1) {
      const key = event.key.toLowerCase();
      const index = options.findIndex(
        (option) =>
          option.label.toLowerCase().startsWith(key) ||
          option.value.startsWith(key),
      );
      if (index !== -1) {
        event.preventDefault();
        show(index);
      }
    }
  }

  return (
    <div className="language-field">
      <span className="language-select-label" id={`${id}-label`}>
        {t("Display language", "ภาษาที่แสดง")}
      </span>
      <div className="language-select" ref={container}>
        <button
          type="button"
          className="language-select-trigger"
          ref={trigger}
          role="combobox"
          aria-labelledby={`${id}-label`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? `${id}-options` : undefined}
          aria-activedescendant={
            open ? `${id}-${options[active].value}` : undefined
          }
          aria-busy={disabled}
          disabled={disabled}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={navigate}
        >
          <span lang={lang}>{options[selected].label}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        {open && (
          <ul
            className="language-options"
            id={`${id}-options`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            data-side={above ? "above" : "below"}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-${option.value}`}
                role="option"
                aria-selected={option.value === lang}
                className={
                  active === index
                    ? "language-option active"
                    : "language-option"
                }
                onPointerMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span lang={option.value}>{option.label}</span>
                {option.value === lang && (
                  <Check size={18} aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
