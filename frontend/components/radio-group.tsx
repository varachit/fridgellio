"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { ChoiceOption } from "./choice-option";

export function RadioGroup<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  name: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (index + 1) % options.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (index + options.length - 1) % options.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = options.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    buttons.current[next]?.focus();
    if (next !== selectedIndex) onChange(options[next].value);
  }

  return (
    <fieldset
      className="radio-group"
      role="radiogroup"
      aria-labelledby={labelId}
      disabled={disabled}
      aria-disabled={disabled || undefined}
    >
      <legend id={labelId}>{label}</legend>
      <input type="hidden" name={name} value={value} />
      <div className="choice-options">
        {options.map((option, index) => {
          const checked = index === selectedIndex;
          return (
            <ChoiceOption
              key={option.value}
              role="radio"
              label={option.label}
              checked={checked}
              tabIndex={index === Math.max(0, selectedIndex) ? 0 : -1}
              ref={(button) => {
                buttons.current[index] = button;
              }}
              onKeyDown={(event) => navigate(event, index)}
              onClick={() => {
                if (!checked) onChange(option.value);
              }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
