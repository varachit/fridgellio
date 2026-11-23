"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PickerPanel } from "./picker-panel";
import { Check, ChevronDown } from "lucide-react";
import { usePicker } from "./use-picker";
import { Message } from "./ui";

const MotionChevron = motion.create(ChevronDown);

type Option<T extends string> = { value: T; label: string; lang?: string };

export function SelectField<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  required = false,
  error,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  const { container, trigger, open, setOpen, close } = usePicker(disabled);
  const reduce = useReducedMotion();
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", at: 0 });
  const selected = options.findIndex((option) => option.value === value);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      if (!list.current || !trigger.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const bounds = trigger.current
        .closest(".dialog-body, dialog")
        ?.getBoundingClientRect();
      const below =
        Math.min(window.innerHeight, bounds?.bottom ?? Infinity) -
        rect.bottom -
        12;
      const above = rect.top - Math.max(0, bounds?.top ?? 0) - 12;
      const flip = below < list.current.scrollHeight && above > below;
      setAbove(flip);
      list.current.style.maxHeight = Math.max(48, flip ? above : below) + "px";
    }
    position();
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    const option = list.current?.children[active] as HTMLElement | undefined;
    const menu = list.current;
    if (!open || !menu || !option) return;
    if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      menu.scrollTop + menu.clientHeight
    )
      menu.scrollTop =
        option.offsetTop + option.offsetHeight - menu.clientHeight;
  }, [open, active]);

  function show(index = Math.max(selected, 0)) {
    setActive(index);
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || trigger.current?.matches(":disabled")) return;
    close();
    if (option.value !== value) onChange(option.value);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        if (!open) show();
        else
          show(
            (active + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length,
          );
        break;
      case "Home":
      case "End":
        event.preventDefault();
        show(event.key === "Home" ? 0 : options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active);
        else show();
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length !== 1) return;
        const now = Date.now();
        const key = event.key.toLowerCase();
        const prefix =
          open && now - search.current.at < 650
            ? search.current.text + key
            : key;
        search.current = { text: prefix, at: now };
        const index = options.findIndex(
          (option) =>
            option.label.toLowerCase().startsWith(prefix) ||
            option.value.toLowerCase().startsWith(prefix),
        );
        if (index !== -1) {
          event.preventDefault();
          show(index);
        }
    }
  }

  return (
    <div className="picker-field" ref={container}>
      <label id={id + "-label"} htmlFor={id}>
        {label}
      </label>
      <div className="select-control">
        <button
          id={id}
          type="button"
          className="select-trigger"
          ref={trigger}
          role="combobox"
          aria-labelledby={id + "-label"}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? id + "-options" : undefined}
          aria-activedescendant={
            open && options[active] ? id + "-" + active : undefined
          }
          aria-busy={disabled || undefined}
          aria-required={required || undefined}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          disabled={disabled || !options.length}
          onClick={() => (open ? setOpen(false) : show())}
          onKeyDown={navigate}
        >
          <span lang={options[selected]?.lang}>{options[selected]?.label}</span>
          <MotionChevron
            size={18}
            aria-hidden="true"
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduce ? 0 : 0.12, ease: "easeOut" }}
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <PickerPanel
              key={id}
              className="select-options"
              id={id + "-options"}
              role="listbox"
              aria-labelledby={id + "-label"}
              data-side={above ? "above" : "below"}
              ref={list}
            >
              {options.map((option, index) => (
                <div
                  key={option.value}
                  id={id + "-" + index}
                  role="option"
                  aria-selected={option.value === value}
                  className={
                    active === index ? "select-option active" : "select-option"
                  }
                  onPointerMove={(event) => {
                    if (event.pointerType === "mouse") setActive(index);
                  }}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(index)}
                >
                  <span lang={option.lang}>{option.label}</span>
                  {option.value === value && (
                    <Check size={18} aria-hidden="true" />
                  )}
                </div>
              ))}
            </PickerPanel>
          )}
        </AnimatePresence>
      </div>
      {error && <Message id={id + "-error"} code={error} />}
    </div>
  );
}
