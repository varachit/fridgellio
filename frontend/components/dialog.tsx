"use client";

import { motion, useIsPresent, useReducedMotion } from "framer-motion";
import { X, type LucideIcon } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useLanguage } from "./language";

type DialogProps = {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
  icon?: LucideIcon;
  size?: "compact" | "standard" | "reading";
  dismissOnBackdrop?: boolean;
};

function onBackdrop(event: PointerEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } =
    event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < left ||
    event.clientX >= right ||
    event.clientY < top ||
    event.clientY >= bottom
  );
}

function wrapTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab" || event.defaultPrevented) return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, summary, [tabindex], [contenteditable="true"]',
    ),
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(":disabled") &&
      !el.closest("[inert]") &&
      (el.checkVisibility
        ? el.checkVisibility({ visibilityProperty: true })
        : el.getClientRects().length > 0 &&
          getComputedStyle(el).visibility === "visible"),
  );
  const first = controls.at(0);
  const last = controls.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const heading = event.currentTarget.querySelector(".dialog-head h2");
  if (event.shiftKey && (event.target === first || event.target === heading)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault();
    first.focus();
  }
}

export function Dialog({
  title,
  children,
  close,
  busy = false,
  icon: Icon,
  size = "standard",
  dismissOnBackdrop = false,
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const backdropPointer = useRef<number | null>(null);
  const titleId = useId();
  const { lang } = useLanguage();
  const present = useIsPresent();
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      // Removing stock or equipment can also remove the button that opened its dialog.
      requestAnimationFrame(() => {
        if (
          document.activeElement !== document.body ||
          document.querySelector("dialog:modal")
        )
          return;
        if (
          opener instanceof HTMLElement &&
          opener.isConnected &&
          opener !== document.body
        )
          opener.focus({ preventScroll: true });
        if (document.activeElement === document.body)
          document
            .querySelector<HTMLElement>("main[tabindex]")
            ?.focus({ preventScroll: true });
      });
    };
  }, []);

  function dismiss() {
    if (present && !busy) close();
  }

  return (
    <motion.dialog
      ref={dialog}
      className="app-dialog"
      data-size={size}
      data-present={present}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: reduced ? 0 : 8,
        transition: { duration: reduced ? 0 : 0.14, ease: "easeIn" },
      }}
      transition={{ duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
      onKeyDown={wrapTab}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onPointerDown={(event) => {
        backdropPointer.current =
          dismissOnBackdrop &&
          event.isPrimary &&
          event.button === 0 &&
          onBackdrop(event)
            ? event.pointerId
            : null;
      }}
      onPointerCancel={() => {
        backdropPointer.current = null;
      }}
      onPointerUp={(event) => {
        const startedOutside = backdropPointer.current === event.pointerId;
        backdropPointer.current = null;
        if (startedOutside && onBackdrop(event)) dismiss();
      }}
    >
      <header className="dialog-head" inert={!present}>
        {Icon && (
          <span className="dialog-symbol">
            <Icon size={22} aria-hidden="true" />
          </span>
        )}
        <h2 ref={heading} tabIndex={-1} id={titleId}>
          {title}
        </h2>
        <button
          className="icon dialog-close"
          type="button"
          disabled={busy}
          aria-label={lang === "th" ? "ปิด" : "Close"}
          onClick={dismiss}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="dialog-body" inert={!present}>
        {children}
      </div>
    </motion.dialog>
  );
}
