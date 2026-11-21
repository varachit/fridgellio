"use client";

import Link from "next/link";
import { ArrowUpRight, Hand } from "lucide-react";
import { Brand, LanguageButton, useText } from "./ui";
import { Illustration } from "./illustration";

export function PublicHeader({
  changeLanguage,
  signIn = false,
  actions,
}: {
  changeLanguage: () => void;
  signIn?: boolean;
  actions?: React.ReactNode;
}) {
  const { t } = useText();
  return (
    <header className="mast">
      <Link href="/" className="home-link">
        <Brand />
      </Link>
      <div className="mast-actions">
        <LanguageButton change={changeLanguage} />
        {actions}
        {signIn && (
          <Link href="/sign-in" className="secondary">
            {t("Sign in", "เข้าสู่ระบบ")}
          </Link>
        )}
      </div>
    </header>
  );
}

export function FridgeFigure() {
  const { t } = useText();
  return (
    <figure className="fridge-figure">
      <div className="figure-title">
        {t("The everyday kitchen", "ครัวในทุกวัน")}
      </div>
      <Illustration variant="landing" />
    </figure>
  );
}

export function Landing({ changeLanguage }: { changeLanguage: () => void }) {
  const { t } = useText();
  return (
    <div className="entry">
      <PublicHeader changeLanguage={changeLanguage} signIn />
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="hero-copy">
            <p className="kicker">
              {t("The household pantry", "คลังอาหารประจำบ้าน")}
            </p>
            <h1 id="landing-title">
              {t("Good food.", "มื้ออร่อย")}
              <br />
              {t("Already in", "เริ่มได้จาก")}
              <br />
              <em>{t("your fridge.", "ตู้เย็นของคุณ")}</em>
            </h1>
            <p className="hero-intro">
              {t(
                "A fresh idea for dinner starts with what you have. Keep track of what’s in your kitchen and see what needs using first.",
                "มื้อเย็นเริ่มได้จากวัตถุดิบที่มี ลองดูว่าในครัวมีอะไรเหลืออยู่ และควรหยิบอะไรมาใช้ก่อน",
              )}
            </p>
            <Link className="primary hero-action" href="/register">
              {t("Create an account", "สร้างบัญชี")}{" "}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <FridgeFigure />
        </section>
        <section className="landing-details" aria-labelledby="shared-title">
          <div className="details-copy">
            <h2 id="shared-title">
              {t("One kitchen, one shared pantry.", "ครัวเดียวกัน คลังอาหารเดียวกัน")}
            </h2>
            <p>
              {t(
                "Add groceries as you unpack. Everyone at home can check quantities, see what’s due soon, and record what they used for dinner.",
                "บันทึกของสดเมื่อซื้อเข้าบ้าน ทุกคนในครัวเรือนดูปริมาณ เช็กวันหมดอายุ และจดวัตถุดิบที่ใช้ทำมื้อเย็นได้",
              )}
            </p>
          </div>
          <Illustration variant="dashboard" />
        </section>
      </main>
    </div>
  );
}
