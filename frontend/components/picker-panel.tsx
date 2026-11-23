"use client";

import { motion, useIsPresent, useReducedMotion } from "motion/react";
import type { ComponentProps } from "react";

export function PickerPanel(props: ComponentProps<typeof motion.div>) {
  const present = useIsPresent();
  const reduce = useReducedMotion();
  return (
    <motion.div
      {...props}
      inert={!present}
      aria-hidden={present ? undefined : true}
      initial={reduce ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
      transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
    />
  );
}
