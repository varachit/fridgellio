"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, Trash2 } from "lucide-react";
import { statisticsQuery, type StatisticAmounts } from "@/lib/queries";
import { errorCode } from "@/lib/api";
import { formatPrice } from "@/lib/pantry";
import { Busy, Empty, Message, Retry, useText } from "./ui";

const units = ["each", "g", "ml"] as const;

function sum(rows: StatisticAmounts[]) {
  return Object.fromEntries(
    units.map((unit) => [
      unit,
      rows.reduce((total, row) => total + Number(row[unit]), 0),
    ]),
  ) as Record<(typeof units)[number], number>;
}

function AmountList({
  values,
}: {
  values: Record<(typeof units)[number], number>;
}) {
  const { t, lang } = useText();
  const visible = units.filter((unit) => values[unit] > 0);
  if (!visible.length) return <strong>0</strong>;
  return (
    <ul className="stat-amounts">
      {visible.map((unit) => (
        <li key={unit}>
          <strong>{values[unit].toLocaleString(lang)}</strong>{" "}
          {unit === "each" ? t("items", "ชิ้น") : unit}
        </li>
      ))}
    </ul>
  );
}

export function GroceryStatistics({ day }: { day: string }) {
  const { t, lang } = useText();
  const result = useQuery(
    statisticsQuery(day, -new Date().getTimezoneOffset()),
  );
  const problem = errorCode(result.error);
  if (problem)
    return (
      <>
        <Message code={problem} />
        <Retry onClick={() => void result.refetch()} />
      </>
    );
  if (!result.data) return <Busy />;

  const used = sum(result.data.months.map((month) => month.used));
  const expired = sum(result.data.months.map((month) => month.expired));
  const usedCost = result.data.months.reduce(
    (total, month) => total + Number(month.used_cost),
    0,
  );
  const expiredCost = result.data.months.reduce(
    (total, month) => total + Number(month.expired_cost),
    0,
  );
  const hasActivity = units.some((unit) => used[unit] || expired[unit]);
  if (!hasActivity)
    return (
      <Empty
        title={t("No usage statistics yet", "ยังไม่มีสถิติการใช้งาน")}
        body={t(
          "Record grocery use or discard a past-date item to see the comparison.",
          "บันทึกการใช้ของสดหรือทิ้งรายการที่หมดอายุเพื่อดูการเปรียบเทียบ",
        )}
      />
    );

  return (
    <div className="statistics-layout">
      <section
        className="stat-summary"
        aria-label={t("Six-month totals", "ยอดรวมหกเดือน")}
      >
        <article className="panel stat-card used">
          <CheckCircle2 aria-hidden="true" />
          <div>
            <h2>{t("Actually used", "ใช้จริง")}</h2>
            <AmountList values={used} />
            <p className="stat-cost">
              {t("Total cost", "ต้นทุนรวม")} ·{" "}
              <strong>{formatPrice(usedCost.toFixed(2), lang)}</strong>
            </p>
          </div>
        </article>
        <article className="panel stat-card expired">
          <Trash2 aria-hidden="true" />
          <div>
            <h2>{t("Lost after expiry", "สูญเสียเพราะหมดอายุ")}</h2>
            <AmountList values={expired} />
            <p className="stat-cost">
              {t("Total loss", "มูลค่าที่สูญเสียรวม")} ·{" "}
              <strong>{formatPrice(expiredCost.toFixed(2), lang)}</strong>
            </p>
          </div>
        </article>
      </section>
      <p className="muted stat-cost-note">
        {t(
          "Cost totals include recorded events whose groceries had a saved price.",
          "ยอดต้นทุนรวมเฉพาะรายการที่บันทึกราคาไว้",
        )}
      </p>

      <section
        className="panel stat-history"
        aria-labelledby="monthly-statistics"
      >
        <h2 id="monthly-statistics">
          <BarChart3 aria-hidden="true" />
          {t("Monthly comparison", "เปรียบเทียบรายเดือน")}
        </h2>
        <p>
          {t(
            "Quantities are kept separate for items, weight, and volume.",
            "แยกปริมาณตามจำนวน น้ำหนัก และปริมาตร",
          )}
        </p>
        <div className="stat-legend" aria-hidden="true">
          <span className="used">{t("Used", "ใช้จริง")}</span>
          <span className="expired">{t("Expired", "หมดอายุ")}</span>
        </div>
        <div className="stat-months">
          {result.data.months.map((month) => {
            const label = new Intl.DateTimeFormat(lang, {
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${month.month}-01T00:00:00Z`));
            return (
              <article key={month.month} className="stat-month">
                <h3>{label}</h3>
                {units.map((unit) => {
                  const usedValue = Number(month.used[unit]);
                  const expiredValue = Number(month.expired[unit]);
                  const maximum = Math.max(usedValue, expiredValue, 1);
                  const unitLabel = unit === "each" ? t("items", "ชิ้น") : unit;
                  return (
                    <div className="stat-unit" key={unit}>
                      <span>{unitLabel}</span>
                      <div
                        className="stat-bars"
                        role="img"
                        aria-label={t(
                          `${usedValue.toLocaleString(lang)} ${unitLabel} used; ${expiredValue.toLocaleString(lang)} ${unitLabel} lost after expiry`,
                          `ใช้จริง ${usedValue.toLocaleString(lang)} ${unitLabel}; สูญเสียเพราะหมดอายุ ${expiredValue.toLocaleString(lang)} ${unitLabel}`,
                        )}
                      >
                        <i
                          className="used"
                          style={{ width: `${(usedValue / maximum) * 100}%` }}
                        />
                        <i
                          className="expired"
                          style={{
                            width: `${(expiredValue / maximum) * 100}%`,
                          }}
                        />
                      </div>
                      <small>
                        {usedValue.toLocaleString(lang)} /{" "}
                        {expiredValue.toLocaleString(lang)}
                      </small>
                    </div>
                  );
                })}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
