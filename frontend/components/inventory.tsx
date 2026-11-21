"use client";
import { useRef, useState } from "react";
import {
  Search,
  ChevronRight,
  Package,
  Refrigerator,
  Snowflake,
  ShoppingBasket,
  Archive,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, errorCode } from "@/lib/api";
import { historyQuery } from "@/lib/queries";
import {
  displayName,
  quantityError,
  locations,
  type Stock,
  type Location,
} from "@/lib/pantry";
import {
  Dialog,
  Message,
  Busy,
  Retry,
  Empty,
  useText,
  useLabels,
  useAction,
} from "./ui";
import { StockEditor } from "./stock-editor";

const icons = {
  pantry: Archive,
  fridge: Refrigerator,
  freezer: Snowflake,
  other: ShoppingBasket,
};
export function Inventory({
  stock,
  soon,
  refresh,
  day,
}: {
  stock: Stock[];
  soon: boolean;
  refresh: () => void;
  day: string;
}) {
  const { t, lang } = useText(),
    labels = useLabels();
  const [search, setSearch] = useState(""),
    [loc, setLoc] = useState<Location | "">(""),
    [selected, setSelected] = useState<Stock | null>(null),
    [edit, setEdit] = useState(false);
  const needle = search.trim().toLowerCase();
  const matches = stock.filter(
    (s) =>
      (!loc || s.location === loc) &&
      [s.name, s.name_en, s.name_th].some((name) =>
        name?.toLowerCase().includes(needle),
      ),
  );
  function list(rows: Stock[], empty: string) {
    if (!rows.length) return <Empty title={empty} />;
    return (
      <ul className="stock-list">
        {rows.map((item) => {
          const Icon = icons[item.location];
          return (
            <li key={item.id}>
              <button
                className="stock-row"
                onClick={() => {
                  setEdit(false);
                  setSelected(item);
                }}
              >
                <span className={"tile " + item.location}>
                  <Icon size={21} />
                </span>
                <span className="item">
                  <strong>{displayName(item, lang)}</strong>
                  <small>
                    {labels[item.location]} · {item.quantity}{" "}
                    {labels[item.unit]}
                  </small>
                </span>
                <span className="dates">
                  <span className={"badge " + item.expiry_status}>
                    {labels[item.expiry_status]}
                  </span>
                  {item.expiry_date && (
                    <small>
                      {new Intl.DateTimeFormat(lang, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(item.expiry_date + "T12:00:00"))}
                    </small>
                  )}
                </span>
                <ChevronRight size={17} />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <>
      <div className="filters">
        <label>
          {t("Search inventory", "ค้นหาในคลัง")}
          <span className="input-icon">
            <Search size={17} />
            <input
              type="search"
              maxLength={200}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search by item name", "ค้นหาตามชื่อรายการ")}
            />
          </span>
        </label>
        <label>
          {t("Storage location", "ที่จัดเก็บ")}
          <select
            value={loc}
            onChange={(e) => setLoc(e.target.value as typeof loc)}
          >
            <option value="">{t("All locations", "ทุกที่จัดเก็บ")}</option>
            {locations.map((l) => (
              <option key={l} value={l}>
                {labels[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {soon ? (
        <>
          <h2>{t("Due within three days", "ครบกำหนดภายในสามวัน")}</h2>
          {list(
            matches.filter((s) =>
              ["due_today", "use_soon"].includes(s.expiry_status),
            ),
            t("Nothing due in this period", "ไม่มีรายการที่ครบกำหนดในช่วงนี้"),
          )}
          <h2>{labels.past_date}</h2>
          {list(
            matches.filter((s) => s.expiry_status === "past_date"),
            t("No past-date groceries", "ไม่มีอาหารที่เลยวันที่ระบุ"),
          )}
        </>
      ) : (
        <>
          <div className="section-title">
            <h2>{t("Pantry stock", "ของในคลัง")}</h2>
            <span>
              {matches.length}{" "}
              {t(matches.length === 1 ? "entry" : "entries", "รายการ")}
            </span>
          </div>
          {stock.length ? (
            list(matches, t("No matching groceries", "ไม่พบรายการที่ตรงกัน"))
          ) : (
            <Empty
              title={t("Your pantry is empty", "คลังอาหารยังว่างอยู่")}
              body={t(
                "Add your first grocery to track its quantity and expiry date.",
                "เพิ่มของสดรายการแรกเพื่อติดตามปริมาณและวันหมดอายุ",
              )}
            />
          )}
        </>
      )}
      {selected &&
        (edit ? (
          <StockEditor
            existing={selected}
            day={day}
            close={() => setSelected(null)}
            saved={refresh}
          />
        ) : (
          <StockDetail
            item={selected}
            close={() => setSelected(null)}
            edit={() => setEdit(true)}
            day={day}
            refresh={refresh}
          />
        ))}
    </>
  );
}
function StockDetail({
  item,
  close,
  edit,
  day,
  refresh,
}: {
  item: Stock;
  close: () => void;
  edit: () => void;
  day: string;
  refresh: () => void;
}) {
  const { t, lang } = useText(),
    labels = useLabels(),
    action = useAction();
  const [kind, setKind] = useState<"used" | "discarded">("used"),
    [quantity, setAmount] = useState(""),
    [removing, setRemoving] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  return (
    <Dialog title={displayName(item, lang)} close={close} busy={action.busy}>
      <p className="detail-meta">
        <Package size={18} />
        {item.quantity} {labels[item.unit]} · {labels[item.location]} ·{" "}
        {labels[item.expiry_status]}
      </p>
      {removing ? (
        <>
          <p>
            {t(
              "Remove this incorrect stock entry? Its recorded use and discard history will be kept.",
              "ลบรายการที่บันทึกผิดนี้หรือไม่ ประวัติการใช้และการทิ้งจะยังอยู่",
            )}
          </p>
          <div className="actions">
            <button
              disabled={action.busy}
              className="danger"
              onClick={() =>
                void action.run(async () => {
                  await api("inventory/" + item.id, "DELETE");
                  refresh();
                  close();
                })
              }
            >
              {t("Confirm removal", "ยืนยันการลบ")}
            </button>
            <button
              className="secondary"
              disabled={action.busy}
              onClick={() => setRemoving(false)}
            >
              {t("Cancel", "ยกเลิก")}
            </button>
          </div>
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const error = quantityError(quantity, item.unit, item.quantity);
              if (error) {
                action.setError(error);
                return;
              }
              void action.run(async () => {
                const body = { kind, quantity };
                const signature = JSON.stringify(body);
                if (attempt.current?.body !== signature)
                  attempt.current = {
                    body: signature,
                    key: Array.from(
                      crypto.getRandomValues(new Uint8Array(16)),
                      (byte) => byte.toString(16).padStart(2, "0"),
                    ).join(""),
                  };
                await api(
                  "inventory/" + item.id + "/events?today=" + day,
                  "POST",
                  body,
                  { key: attempt.current.key },
                );
                refresh();
                close();
              });
            }}
          >
            <fieldset disabled={action.busy}>
              <div className="segmented">
                {(["used", "discarded"] as const).map((k) => (
                  <button
                    type="button"
                    aria-pressed={k === kind}
                    key={k}
                    onClick={() => {
                      setKind(k);
                      action.setError(null);
                    }}
                  >
                    {k === "used"
                      ? t("Record use", "บันทึกการใช้")
                      : t("Record discard", "บันทึกการทิ้ง")}
                  </button>
                ))}
              </div>
              <label>
                {t("Amount", "ปริมาณ")} ({labels[item.unit]})
                <input
                  required
                  inputMode="decimal"
                  maxLength={19}
                  value={quantity}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <button className="primary">
                {kind === "used"
                  ? t("Save usage", "บันทึกปริมาณที่ใช้")
                  : t("Save discard", "บันทึกปริมาณที่ทิ้ง")}
              </button>
            </fieldset>
          </form>
          <div className="actions separated">
            <button disabled={action.busy} className="link" onClick={edit}>
              {t("Edit entry", "แก้ไขรายการ")}
            </button>
            <button
              disabled={action.busy}
              className="link destructive"
              onClick={() => {
                action.setError(null);
                setRemoving(true);
              }}
            >
              {t("Remove entry", "ลบรายการ")}
            </button>
          </div>
        </>
      )}
      <Message code={action.error} />
    </Dialog>
  );
}
export function HistoryView() {
  const { t, lang } = useText(),
    labels = useLabels();
  const res = useQuery(historyQuery);
  return (
    <>
      <Message code={errorCode(res.error)} />
      {res.error && <Retry onClick={() => void res.refetch()} />}
      {res.data ? (
        res.data.length ? (
          <ul className="stock-list">
            {res.data.map((event) => (
              <li className="history-row" key={event.id}>
                <span className="item">
                  <strong>{event.item_name}</strong>
                  <small>
                    {new Date(event.created_at).toLocaleString(lang)}
                  </small>
                </span>
                <span>
                  {event.kind === "used"
                    ? t("Used", "ใช้แล้ว")
                    : t("Discarded", "ทิ้งแล้ว")}{" "}
                  {event.quantity} {labels[event.unit]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title={t("No inventory history yet", "ยังไม่มีประวัติ")}
            body={t(
              "Record use or discard on a grocery entry to see it here.",
              "บันทึกการใช้หรือทิ้งวัตถุดิบเพื่อดูประวัติที่นี่",
            )}
          />
        )
      ) : (
        !res.error && <Busy />
      )}
    </>
  );
}
