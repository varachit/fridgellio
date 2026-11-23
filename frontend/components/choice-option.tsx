"use client";

import type { ComponentProps } from "react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type ChoiceOptionProps = Pick<
  ComponentProps<"button">,
  "ref" | "tabIndex" | "onClick" | "onKeyDown" | "disabled"
> & {
  role: "checkbox" | "radio";
  checked: boolean;
  label: string;
};

export function ChoiceOption({
  role,
  checked,
  label,
  ...props
}: ChoiceOptionProps) {
  const reduce = useReducedMotion();
  return (
    <button
      {...props}
      type="button"
      className="choice-option"
      role={role}
      aria-checked={checked}
    >
      <span className="choice-indicator" aria-hidden="true">
        {checked && (
          <motion.span
            className="choice-mark"
            initial={reduce ? false : { scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.12, ease: "easeOut" }}
          >
            {role === "checkbox" && <Check size={14} strokeWidth={3} />}
          </motion.span>
        )}
      </span>
      {label}
    </button>
  );
}
