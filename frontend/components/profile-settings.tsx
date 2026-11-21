"use client";

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { api, errorCode } from "@/lib/api";
import { membersQuery, profileQuery, type Profile } from "@/lib/queries";
import { Busy, Message, Retry, useAction, useText } from "./ui";

const profilePath = profileQuery.queryKey[0];

export function ProfileSettings() {
  const { t } = useText();
  const profile = useQuery(profileQuery);

  return (
    <section className="panel">
      <h2>
        <UserRound aria-hidden="true" />
        {t("Profile", "โปรไฟล์")}
      </h2>
      {profile.data ? (
        <ProfileForm profile={profile.data} />
      ) : profile.error ? (
        <>
          <Message code={errorCode(profile.error)} />
          <Retry onClick={() => void profile.refetch()} />
        </>
      ) : (
        <Busy />
      )}
    </section>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const validationId = useId();
  const { t } = useText();
  const client = useQueryClient();
  const action = useAction();
  const [draft, setDraft] = useState<Partial<Record<keyof Profile, string>>>(
    {},
  );
  const [saved, setSaved] = useState(false);
  const firstName = draft.first_name ?? profile.first_name ?? "";
  const lastName = draft.last_name ?? profile.last_name ?? "";
  const valid = Boolean(firstName.trim() && lastName.trim());

  function edit(field: keyof Profile, value: string) {
    setDraft((draft) => ({ ...draft, [field]: value }));
    setSaved(false);
    action.setError(null);
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || action.busy) return;
        void action.run(async () => {
          const updated = await api<Profile>(profilePath, "PATCH", {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          });
          await client.cancelQueries({ queryKey: profileQuery.queryKey });
          client.setQueryData(profileQuery.queryKey, updated);
          void client.invalidateQueries({ queryKey: membersQuery.queryKey });
          setDraft({});
          setSaved(true);
        });
      }}
    >
      <fieldset disabled={action.busy}>
        <div className="profile-names">
          <label>
            {t("First name", "ชื่อ")}
            <input
              required
              autoComplete="given-name"
              maxLength={200}
              value={firstName}
              aria-invalid={!firstName.trim()}
              aria-describedby={!firstName.trim() ? validationId : undefined}
              onChange={(event) => edit("first_name", event.target.value)}
            />
          </label>
          <label>
            {t("Last name", "นามสกุล")}
            <input
              required
              autoComplete="family-name"
              maxLength={200}
              value={lastName}
              aria-invalid={!lastName.trim()}
              aria-describedby={!lastName.trim() ? validationId : undefined}
              onChange={(event) => edit("last_name", event.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          className="secondary profile-save"
          disabled={!valid || action.busy}
          aria-busy={action.busy}
        >
          {action.busy
            ? t("Saving…", "กำลังบันทึก…")
            : t("Save profile", "บันทึกโปรไฟล์")}
        </button>
      </fieldset>
      <div role="status" aria-live="polite">
        {!valid && (
          <p className="error" id={validationId}>
            {t(
              "Please fill in both your first and last name.",
              "กรุณากรอกข้อมูลให้ครบทั้งชื่อและนามสกุล",
            )}
          </p>
        )}
      </div>
      <Message code={action.error} />
      {saved && (
        <p role="status" className="success">
          {t("Profile saved.", "บันทึกโปรไฟล์แล้ว")}
        </p>
      )}
    </form>
  );
}
