"use client";

import { useEffect, useRef, useState } from "react";

export function usePicker(disabled = false) {
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (disabled) {
      setOpen(false);
      return;
    }
    function outside(event: PointerEvent | FocusEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open, disabled]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return { container, trigger, open, setOpen, close };
}
