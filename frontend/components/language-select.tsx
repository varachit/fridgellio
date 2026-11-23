"use client";

import { SelectField } from "./select-field";
import { useText } from "./ui";

const options = [
  { value: "en", label: "English", lang: "en" },
  { value: "th", label: "ไทย", lang: "th" },
] as const;

export function LanguageSelect({
  change,
  disabled,
}: {
  change: () => void;
  disabled: boolean;
}) {
  const { lang, t } = useText();
  return (
    <div className="language-field">
      <SelectField
        label={t("Display language", "ภาษาที่แสดง")}
        value={lang}
        options={options}
        onChange={change}
        disabled={disabled}
      />
    </div>
  );
}
