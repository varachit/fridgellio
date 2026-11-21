"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { LogOut, UserRoundPen } from "lucide-react";
import { profileQuery } from "@/lib/queries";
import { MemberIdentity } from "./household-members";
import { useText } from "./ui";

export function AccountMenu({
  account,
  busy,
  editProfile,
  signOut,
}: {
  account: Session["user"];
  busy: boolean;
  editProfile: () => void;
  signOut: () => void;
}) {
  const { t } = useText();
  const profile = useQuery(profileQuery);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const last = useRef(false);
  const id = useId();
  const items = () => [
    ...(container.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    ) ?? []),
  ];

  useEffect(() => {
    if (!open) return;
    const buttons = items();
    (last.current ? buttons.at(-1) : buttons[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const focusOutside = (event: FocusEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusOutside);
    };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function navigate(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      close();
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const buttons = items();
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (current +
                (event.key === "ArrowDown" ? 1 : -1) +
                buttons.length) %
              buttons.length;
      buttons[index]?.focus();
    }
  }

  return (
    <div className="account-menu" ref={container}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="profile-trigger"
        aria-label={t("Profile menu", "เมนูโปรไฟล์")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        disabled={busy}
        onClick={() => {
          last.current = false;
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            last.current = event.key === "ArrowUp";
            if (open) {
              const buttons = items();
              (last.current ? buttons.at(-1) : buttons[0])?.focus();
            } else setOpen(true);
          }
        }}
      >
        <MemberIdentity
          avatarOnly
          profile={{
            ...(profile.data ?? {
              first_name: account.firstName,
              last_name: account.lastName,
            }),
            username: account.name,
            profile_picture_url: account.image,
          }}
        />
      </button>
      {open && (
        <div
          className="profile-dropdown"
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={id}
          onKeyDown={navigate}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={busy}
            onClick={() => {
              close();
              editProfile();
            }}
          >
            <UserRoundPen size={18} aria-hidden="true" />
            {t("Edit profile", "แก้ไขโปรไฟล์")}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="profile-signout"
            disabled={busy}
            onClick={() => {
              close();
              signOut();
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            {t("Sign out", "ออกจากระบบ")}
          </button>
        </div>
      )}
    </div>
  );
}
