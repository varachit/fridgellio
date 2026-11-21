"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorCode } from "@/lib/api";
import type { MemberProfile } from "@/lib/pantry";
import {
  invitationsPath,
  invitationsQuery,
  membersQuery,
  type PendingInvitation,
} from "@/lib/queries";
import { Busy, Empty, Message, Retry, useAction, useText } from "./ui";

export function MemberIdentity({ profile }: { profile?: MemberProfile }) {
  const { t } = useText();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const names = [profile?.first_name, profile?.last_name].filter(
    (name): name is string => Boolean(name),
  );
  const displayName =
    names.join(" ") || profile?.username || t("Household member", "สมาชิกในบ้าน");
  const initials = (names.length ? names : [displayName])
    .map((name) => Array.from(name)[0])
    .join("")
    .toLocaleUpperCase();
  const image = profile?.profile_picture_url;
  return (
    <span className="user">
      <span className="avatar" aria-hidden="true">
        {image && /^https:\/\//i.test(image) && failedImage !== image ? (
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(image)}
          />
        ) : (
          initials
        )}
      </span>
      <span>{displayName}</span>
    </span>
  );
}

type CreatedInvitation = PendingInvitation & { token: string };

export function HouseholdInvitations() {
  const { t, lang } = useText();
  const client = useQueryClient();
  const invitations = useQuery(invitationsQuery);
  const action = useAction();
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [removed, setRemoved] = useState(false);
  const queryKey = invitationsQuery.queryKey;

  return (
    <section className="panel" aria-labelledby="household-invitations-title">
      <h2 id="household-invitations-title">{t("Invitations", "คำเชิญ")}</h2>
      <p>
        {t(
          "Share the code with the person you want to invite. Each code works once and expires after 24 hours.",
          "แชร์รหัสให้คนที่คุณต้องการเชิญ รหัสใช้ได้ครั้งเดียวและหมดอายุใน 24 ชั่วโมง",
        )}
      </p>
      <button
        type="button"
        className="secondary"
        disabled={action.busy}
        onClick={() =>
          void action.run(async () => {
            setRemoved(false);
            const { token, ...invite } = await api<CreatedInvitation>(
              invitationsPath,
              "POST",
            );
            await client.cancelQueries({ queryKey });
            client.setQueryData(queryKey, (previous = []) => [
              invite,
              ...previous.filter((item) => item.id !== invite.id),
            ]);
            setCreated({ ...invite, token });
            void client.invalidateQueries({ queryKey });
          })
        }
      >
        {t("Create invitation code", "สร้างรหัสเชิญ")}
      </button>
      <Message code={action.error ?? errorCode(invitations.error)} />
      {invitations.error && (
        <Retry onClick={() => void invitations.refetch()} />
      )}
      {removed && (
        <p role="status" className="success">
          {t("Invitation removed.", "ลบคำเชิญแล้ว")}
        </p>
      )}
      {invitations.data?.length ? (
        <ul className="name-list invitation-list">
          {invitations.data.map((invite) => {
            const reference = invite.id.slice(0, 8);
            return (
              <li key={invite.id}>
                <div className="invitation-summary">
                  <strong>
                    {t("Invite", "คำเชิญ")} {reference}
                  </strong>
                  <small className="muted">
                    {t("Expires", "หมดอายุ")}{" "}
                    <time dateTime={invite.expires_at}>
                      {new Date(invite.expires_at).toLocaleString(lang)}
                    </time>
                  </small>
                </div>
                <button
                  type="button"
                  className="secondary destructive"
                  aria-label={t(
                    `Remove invite ${reference}`,
                    `ลบคำเชิญ ${reference}`,
                  )}
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      setRemoved(false);
                      await api(`${invitationsPath}/${invite.id}`, "DELETE");
                      await client.cancelQueries({ queryKey });
                      client.setQueryData(queryKey, (previous = []) =>
                        previous.filter((item) => item.id !== invite.id),
                      );
                      if (created?.id === invite.id) setCreated(null);
                      setRemoved(true);
                      void client.invalidateQueries({ queryKey });
                    })
                  }
                >
                  {t("Remove invite", "ลบคำเชิญ")}
                </button>
                {created?.id === invite.id && (
                  <label className="invitation-code">
                    {t("Invitation code", "รหัสเชิญ")}
                    <input
                      readOnly
                      value={created.token}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      ) : invitations.data ? (
        <p className="muted">{t("No pending invites.", "ไม่มีคำเชิญที่รอใช้งาน")}</p>
      ) : (
        !invitations.error && <Busy />
      )}
    </section>
  );
}

export function HouseholdMembers({ accountId }: { accountId: string }) {
  const { t } = useText();
  const members = useQuery(membersQuery);
  return (
    <>
      <Message code={errorCode(members.error)} />
      {members.error && <Retry onClick={() => void members.refetch()} />}
      {members.data ? (
        members.data.length ? (
          <ul className="name-list members-list">
            {members.data.map((member) => (
              <li key={member.id}>
                <div className="member-summary">
                  <MemberIdentity profile={member} />
                  {member.id === accountId && (
                    <small className="muted">{t("You", "คุณ")}</small>
                  )}
                </div>
                {member.is_owner && (
                  <small className="muted">{t("Owner", "เจ้าของครัวเรือน")}</small>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title={t("No household members found", "ไม่พบสมาชิกในบ้าน")} />
        )
      ) : (
        !members.error && <Busy />
      )}
    </>
  );
}
