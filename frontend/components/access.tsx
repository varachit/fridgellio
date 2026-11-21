"use client";
import { useState } from "react";
import Image from "next/image";
import {
  Eye,
  EyeOff,
  UserRound,
  LockKeyhole,
  House,
  KeyRound,
} from "lucide-react";
import { getSession, signIn } from "next-auth/react";
import { api, ApiError } from "@/lib/api";
import type { Household } from "@/lib/pantry";
import { useText, Brand, Message, LanguageButton, useAction } from "./ui";

export function AccessFrame({
  children,
  changeLanguage,
}: {
  children: React.ReactNode;
  changeLanguage: () => void;
}) {
  const { t } = useText();
  return (
    <div className="entry">
      <header className="mast">
        <Brand />
        <LanguageButton change={changeLanguage} />
      </header>
      <main className="entry-layout">
        <section className="entry-form">{children}</section>
        <aside className="produce">
          <Image
            src="/kitchen.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 760px) 100vw, 48vw"
            style={{ objectFit: "cover" }}
          />
          <div className="photo-note">
            <span className="note-icon">
              <House size={23} />
            </span>
            <div>
              <strong>{t("The household pantry", "คลังอาหารประจำบ้าน")}</strong>
              <span>
                {t(
                  "One kitchen, shared by everyone at home.",
                  "ครัวเดียวกันสำหรับทุกคนในบ้าน",
                )}
              </span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
export function SignIn({ expired }: { expired: boolean }) {
  const { t, lang } = useText();
  const [create, setCreate] = useState(false),
    [visible, show] = useState(false);
  const [username, setName] = useState(""),
    [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const action = useAction();
  return (
    <div className="access-inner">
      <h1>
        {create
          ? t("Create an account", "สร้างบัญชี")
          : t("Welcome back.", "ยินดีต้อนรับกลับ")}
      </h1>
      <p className="intro">
        {create
          ? t(
              "Keep track of groceries with everyone in your household.",
              "ติดตามของกินของใช้ในครัวร่วมกับทุกคนในบ้าน",
            )
          : t(
              "Sign in to see what’s in your pantry and decide what to cook next.",
              "เข้าสู่ระบบเพื่อดูวัตถุดิบในคลังและวางแผนมื้อถัดไป",
            )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            if (create && (!firstName.trim() || !lastName.trim()))
              throw new ApiError("profile_names_required");
            const result = await signIn("credentials", {
              redirect: false,
              callbackUrl: location.origin,
              username: username.trim(),
              password,
              ...(create && { firstName, lastName }),
              intent: create ? "register" : "login",
              language: lang,
            });
            if (
              !result?.ok ||
              result.error ||
              !result.url ||
              new URL(result.url).pathname !== "/"
            ) {
              throw new ApiError(
                result?.error === "CredentialsSignin"
                  ? "invalid_credentials"
                  : result?.error || "service_unavailable",
              );
            }
            history.replaceState(null, "", location.pathname + location.hash);
            // Inline sign-in updates this tab. Publish the session change to the others.
            await getSession();
          });
        }}
      >
        <fieldset disabled={action.busy}>
          {create && (
            <div className="profile-names">
              <label>
                {t("First name", "ชื่อ")}
                <input
                  required
                  autoComplete="given-name"
                  maxLength={200}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </label>
              <label>
                {t("Last name", "นามสกุล")}
                <input
                  required
                  autoComplete="family-name"
                  maxLength={200}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            {t("Username", "ชื่อผู้ใช้")}
            <span className="input-icon">
              <UserRound size={18} />
              <input
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setName(e.target.value)}
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,31}"
                placeholder={t("Enter your username", "กรอกชื่อผู้ใช้")}
              />
            </span>
          </label>
          {create && (
            <small>
              {t(
                "Use 3–32 letters (A–Z), digits, dots, hyphens or underscores. Start with a letter or digit.",
                "ใช้ตัวอักษร A–Z ตัวเลข จุด ขีดกลาง หรือขีดล่าง 3 ถึง 32 ตัว ขึ้นต้นด้วยตัวอักษรหรือตัวเลข",
              )}
            </small>
          )}
          <label>
            {t("Password", "รหัสผ่าน")}
            <span className="input-icon">
              <LockKeyhole size={18} />
              <input
                required
                type={visible ? "text" : "password"}
                aria-label={t("Password", "รหัสผ่าน")}
                autoComplete={create ? "new-password" : "current-password"}
                minLength={create ? 8 : 1}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("Enter your password", "กรอกรหัสผ่าน")}
              />
              <button
                type="button"
                className="reveal"
                aria-label={
                  visible
                    ? t("Hide password", "ซ่อนรหัสผ่าน")
                    : t("Show password", "แสดงรหัสผ่าน")
                }
                onClick={() => show(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          {create && (
            <small>
              {t("Use 8 to 128 characters.", "ใช้รหัสผ่าน 8 ถึง 128 ตัวอักษร")}
            </small>
          )}
          <Message
            code={action.error || (!create && expired ? "expired" : null)}
          />
          <button className="primary wide" type="submit">
            {action.busy
              ? t("Please wait…", "กรุณารอสักครู่…")
              : create
                ? t("Create account", "สร้างบัญชี")
                : t("Sign in", "เข้าสู่ระบบ")}
          </button>
        </fieldset>
      </form>
      <p className="alternate">
        {create
          ? t("Already have an account?", "มีบัญชีแล้วใช่ไหม")
          : t("New to Fridgellio?", "เพิ่งเริ่มใช้ Fridgellio ใช่ไหม")}{" "}
        <button
          type="button"
          className="link"
          disabled={action.busy}
          onClick={() => {
            setCreate(!create);
            action.setError(null);
            setPassword("");
            show(false);
          }}
        >
          {create
            ? t("Sign in", "เข้าสู่ระบบ")
            : t("Create an account", "สร้างบัญชี")}
        </button>
      </p>
    </div>
  );
}
export function Onboarding({
  joined,
  signOut,
}: {
  joined: (h: Household) => void;
  signOut: () => void;
}) {
  const { t } = useText(),
    action = useAction();
  const [join, setJoin] = useState(false),
    [token, setToken] = useState("");
  return (
    <div className="access-inner">
      <House className="section-symbol" />
      <h1>{t("Your household", "ครัวเรือนของคุณ")}</h1>
      <p className="intro">
        {t(
          "Start a shared pantry, or enter an invitation code from someone in your household.",
          "สร้างคลังอาหารร่วมกัน หรือกรอกรหัสเชิญจากสมาชิกในบ้าน",
        )}
      </p>
      <div className="segmented">
        <button
          disabled={action.busy}
          aria-pressed={!join}
          onClick={() => {
            setJoin(false);
            action.setError(null);
          }}
        >
          <House size={17} />
          {t("Create", "สร้าง")}
        </button>
        <button
          disabled={action.busy}
          aria-pressed={join}
          onClick={() => {
            setJoin(true);
            action.setError(null);
          }}
        >
          <KeyRound size={17} />
          {t("Join", "เข้าร่วม")}
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () =>
            joined(
              await api<Household>(
                join ? "household/join" : "household",
                "POST",
                join ? { token: token.trim() } : undefined,
              ),
            ),
          );
        }}
      >
        <fieldset disabled={action.busy}>
          {join && (
            <label>
              {t("Invitation code", "รหัสเชิญ")}
              <input
                required
                maxLength={43}
                pattern="(?:[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}|[A-Za-z0-9_\-]{43})"
                placeholder="XXXX-XXXX"
                spellCheck={false}
                autoCorrect="off"
                value={token}
                onChange={(e) => setToken(e.target.value.trim())}
              />
            </label>
          )}
          <Message code={action.error} />
          <button className="primary wide">
            {action.busy
              ? t("Please wait…", "กรุณารอสักครู่…")
              : join
                ? t("Join household", "เข้าร่วมครัวเรือน")
                : t("Create household", "สร้างครัวเรือน")}
          </button>
        </fieldset>
      </form>
      <button className="link" onClick={signOut} disabled={action.busy}>
        {t("Sign out", "ออกจากระบบ")}
      </button>
    </div>
  );
}
