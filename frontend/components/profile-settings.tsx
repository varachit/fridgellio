"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { api, ApiError, errorCode } from "@/lib/api";
import { membersQuery, profileQuery, type Profile } from "@/lib/queries";
import { Busy, Message, Retry, useAction, useText } from "./ui";

const profilePath = profileQuery.queryKey[0];

export function ProfileSettings({ username }: { username: string }) {
  const { t } = useText();
  const profile = useQuery(profileQuery);

  return (
    <section className="panel">
      <h2>
        <UserRound aria-hidden="true" />
        {t("Profile", "โปรไฟล์")}
      </h2>
      <label>
        {t("Username", "ชื่อผู้ใช้")}
        <input value={username} readOnly />
      </label>
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
  const { t } = useText();
  const client = useQueryClient();
  const action = useAction();
  const [draft, setDraft] = useState<Partial<Record<keyof Profile, string>>>(
    {},
  );
  const [saved, setSaved] = useState(false);
  const firstName = draft.first_name ?? profile.first_name ?? "";
  const lastName = draft.last_name ?? profile.last_name ?? "";
  const changes: typeof draft = {};
  if (draft.first_name !== undefined && firstName.trim() !== profile.first_name)
    changes.first_name = firstName.trim();
  if (draft.last_name !== undefined && lastName.trim() !== profile.last_name)
    changes.last_name = lastName.trim();
  const changed = Object.keys(changes).length > 0;

  function edit(field: keyof Profile, value: string) {
    setDraft((draft) => ({ ...draft, [field]: value }));
    setSaved(false);
    action.setError(null);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!changed) return;
        void action.run(async () => {
          if (!firstName.trim() || !lastName.trim())
            throw new ApiError("profile_names_required");
          const updated = await api<Profile>(profilePath, "PATCH", changes);
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
              onChange={(event) => edit("last_name", event.target.value)}
            />
          </label>
        </div>
        <button className="secondary" disabled={!changed}>
          {action.busy
            ? t("Saving…", "กำลังบันทึก…")
            : t("Save profile", "บันทึกโปรไฟล์")}
        </button>
      </fieldset>
      <Message code={action.error} />
      {saved && (
        <p role="status" className="success">
          {t("Profile saved.", "บันทึกโปรไฟล์แล้ว")}
        </p>
      )}
    </form>
  );
}
