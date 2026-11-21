"use client";
import { useEffect, useState } from "react";
import type { Session } from "next-auth";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Archive,
  CalendarClock,
  ChefHat,
  History,
  Settings,
  LogOut,
  Menu as MenuIcon,
  House,
} from "lucide-react";
import { api, ApiError, errorCode } from "@/lib/api";
import {
  historyQuery,
  householdQuery,
  inventoryQuery,
  preferencesQuery,
} from "@/lib/queries";
import { LanguageProvider, useLanguage } from "./language";
import { localDay, type Household, type Language } from "@/lib/pantry";
import { AccessFrame, SignIn, Onboarding } from "./access";
import {
  Brand,
  Message,
  Busy,
  Retry,
  LanguageButton,
  useText,
  useAction,
} from "./ui";
import { Inventory, HistoryView } from "./inventory";
import { StockEditor } from "./stock-editor";
import { Meals, SettingsView } from "./management";
type Account = Session["user"];
type Page = "pantry" | "soon" | "meals" | "history" | "settings";
const pages: Page[] = ["pantry", "soon", "meals", "history", "settings"];
function hashPage() {
  const value = location.hash.slice(1) as Page;
  return pages.includes(value) ? value : "pantry";
}
export function Kitchen({
  session,
  expired,
}: {
  session: Session | null;
  expired: boolean;
}) {
  return (
    <SessionProvider session={session}>
      <LanguageProvider>
        <KitchenSession expired={expired} />
      </LanguageProvider>
    </SessionProvider>
  );
}

function KitchenSession({ expired }: { expired: boolean }) {
  const { data: session } = useSession();
  const { lang, setLanguage } = useLanguage();
  const [showExpired, setShowExpired] = useState(expired);
  const accountId = session?.user.id;
  useEffect(() => {
    if (!accountId) return;
    setShowExpired(false);
    // A new login in another tab may already have replaced this cookie. Recheck
    // the current session on the server without signing out the new account.
    const recheck = () =>
      window.location.replace("/?expired=1" + location.hash);
    window.addEventListener("session-ended", recheck, { once: true });
    return () => window.removeEventListener("session-ended", recheck);
  }, [accountId]);
  if (!session)
    return (
      <AccessFrame
        changeLanguage={() => setLanguage(lang === "en" ? "th" : "en")}
      >
        <SignIn expired={showExpired} />
      </AccessFrame>
    );
  return <MemberProvider key={session.user.id} account={session.user} />;
}

function MemberProvider({ account }: { account: Account }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchInterval: 30_000 } },
      }),
  );
  useEffect(() => () => client.clear(), [client]);
  return (
    <QueryClientProvider client={client}>
      <MemberKitchen account={account} />
    </QueryClientProvider>
  );
}

function MemberKitchen({ account }: { account: Account }) {
  const { lang, setLanguage } = useLanguage();
  const { t } = useText();
  const client = useQueryClient();
  const household = useQuery(householdQuery);
  const preferences = useQuery(preferencesQuery);
  const action = useAction();
  const preferredLanguage = preferences.data?.language;
  useEffect(() => {
    if (preferredLanguage) setLanguage(preferredLanguage);
  }, [preferredLanguage, setLanguage]);
  const flip = () =>
    void action.run(async () => {
      const next = lang === "en" ? "th" : "en";
      const updated = await api<{ language: Language }>(
        "preferences",
        "PATCH",
        { language: next },
      );
      await client.cancelQueries({ queryKey: preferencesQuery.queryKey });
      client.setQueryData(preferencesQuery.queryKey, updated);
    });
  const logout = () =>
    void action.run(async () => {
      const result = await signOut({
        redirect: false,
        callbackUrl: location.origin,
      });
      if (!result?.url || new URL(result.url).pathname !== "/")
        throw new ApiError("service_unavailable");
      history.replaceState(null, "", location.pathname);
    });
  const problem = errorCode(household.error || preferences.error);
  if (!household.data || !preferences.data)
    return (
      <AccessFrame changeLanguage={flip}>
        <Message code={action.error || problem} />
        {problem ? (
          <div className="actions">
            <Retry
              onClick={() => {
                void household.refetch();
                void preferences.refetch();
              }}
            />
            <button
              className="link"
              type="button"
              disabled={action.busy}
              onClick={logout}
            >
              {t("Sign out", "ออกจากระบบ")}
            </button>
          </div>
        ) : household.data === null && preferences.data ? (
          <Onboarding
            joined={(h) => client.setQueryData(householdQuery.queryKey, h)}
            signOut={logout}
          />
        ) : (
          <Busy />
        )}
      </AccessFrame>
    );
  return (
    <Workspace
      account={account}
      household={household.data}
      logout={logout}
      flip={flip}
      busy={action.busy}
      actionError={action.error || problem}
    />
  );
}
function MemberIdentity({ account }: { account: Account }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const names = [account.firstName, account.lastName].filter(
    (name): name is string => Boolean(name),
  );
  const displayName = names.join(" ") || account.name;
  const initials = (names.length ? names : [account.name])
    .map((name) => Array.from(name)[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <span className="user">
      <span className="avatar" aria-hidden="true">
        {account.image && failedImage !== account.image ? (
          <img
            src={account.image}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(account.image)}
          />
        ) : (
          initials
        )}
      </span>
      <span>{displayName}</span>
    </span>
  );
}

function Workspace({
  account,
  household,
  logout,
  flip,
  busy,
  actionError,
}: {
  account: Account;
  household: Household;
  logout: () => void;
  flip: () => void;
  busy: boolean;
  actionError: string | null;
}) {
  const { t } = useText();
  const [page, setPage] = useState<Page>("pantry"),
    [open, setOpen] = useState(false),
    [adding, setAdding] = useState(false);
  const [day, setDay] = useState(localDay),
    [notice, setNotice] = useState(false);
  useEffect(() => {
    const sync = () => {
      setPage(hashPage());
      setOpen(false);
      setAdding(false);
      setNotice(false);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      clearTimeout(timer);
      const now = new Date();
      setDay(localDay(now));
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(tick, midnight.getTime() - now.getTime());
    };
    tick();
    window.addEventListener("focus", tick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const client = useQueryClient();
  const stock = useQuery(inventoryQuery(day));
  const refreshStock = () => {
    void client.invalidateQueries({ queryKey: ["inventory"] });
    void client.invalidateQueries({ queryKey: historyQuery.queryKey });
  };
  const links = [
    { page: "pantry", icon: Archive, title: t("Inventory", "คลังอาหาร") },
    { page: "soon", icon: CalendarClock, title: t("Use soon", "ควรใช้เร็ว ๆ นี้") },
    { page: "meals", icon: ChefHat, title: t("Meal ideas", "ไอเดียมื้ออาหาร") },
    { page: "history", icon: History, title: t("History", "ประวัติ") },
    { page: "settings", icon: Settings, title: t("Settings", "การตั้งค่า") },
  ];
  const title = links.find((link) => link.page === page)!.title;
  return (
    <div className="workspace">
      <a
        className="skip"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        {t("Skip to content", "ข้ามไปเนื้อหา")}
      </a>
      <aside className="sidebar">
        <div className="side-top">
          <Brand />
          <button
            className="icon mobile-nav"
            aria-label={t("Navigation", "เมนูนำทาง")}
            aria-expanded={open}
            aria-controls="side-nav"
            onClick={() => setOpen(!open)}
          >
            <MenuIcon />
          </button>
        </div>
        <div className={"side-body " + (open ? "opened" : "")} id="side-nav">
          <nav>
            {links.map((link) => (
              <a
                key={link.page}
                href={"#" + link.page}
                onClick={() => setOpen(false)}
                aria-current={link.page === page ? "page" : undefined}
              >
                <link.icon size={19} />
                {link.title}
              </a>
            ))}
          </nav>
          <div className="side-bottom">
            <MemberIdentity account={account} />
            <button disabled={busy} className="plain" onClick={logout}>
              <LogOut size={17} />
              {t("Sign out", "ออกจากระบบ")}
            </button>
          </div>
        </div>
      </aside>
      <main id="content" tabIndex={-1} className="content">
        <div className="toolbar">
          <span>
            <House size={16} />
            {t("My household", "ครัวเรือนของฉัน")}
          </span>
          <LanguageButton disabled={busy} change={flip} />
        </div>
        <div className="pagehead">
          <div>
            <h1>{title}</h1>
            <p>
              {
                {
                  pantry: t(
                    "Groceries and ingredients in your shared kitchen.",
                    "ของสดและวัตถุดิบในครัวส่วนรวม",
                  ),
                  soon: t(
                    "Check what’s due today and in the next three days.",
                    "ดูวัตถุดิบที่ครบกำหนดวันนี้และในสามวันข้างหน้า",
                  ),
                  history: t(
                    "Food used or discarded by your household.",
                    "อาหารที่สมาชิกในบ้านใช้หรือทิ้ง",
                  ),
                  meals: t(
                    "Plan a meal with the ingredients and equipment you have.",
                    "วางแผนมื้ออาหารด้วยวัตถุดิบและอุปกรณ์ที่มี",
                  ),
                  settings: t(
                    "Manage your preferences and shared kitchen.",
                    "จัดการการตั้งค่าส่วนตัวและครัวส่วนรวม",
                  ),
                }[page]
              }
            </p>
          </div>
          {(page === "pantry" || page === "soon") && (
            <button
              className="primary"
              onClick={() => {
                setNotice(false);
                setAdding(true);
              }}
            >
              <span aria-hidden="true">+</span>
              {t("Add groceries", "เพิ่มของสด")}
            </button>
          )}
        </div>
        <Message code={actionError} />
        {notice && (
          <p role="status" className="success">
            {t("Groceries saved to your pantry.", "บันทึกรายการในคลังแล้ว")}
          </p>
        )}
        {page === "history" ? (
          <HistoryView />
        ) : page === "settings" ? (
          <SettingsView household={household} />
        ) : (
          <>
            <Message code={errorCode(stock.error)} />
            {stock.error && <Retry onClick={() => void stock.refetch()} />}
            {stock.data ? (
              page === "meals" ? (
                <Meals
                  stock={stock.data}
                  day={day}
                  add={() => setAdding(true)}
                />
              ) : (
                <Inventory
                  key={page}
                  stock={stock.data}
                  soon={page === "soon"}
                  refresh={refreshStock}
                  day={day}
                />
              )
            ) : (
              !stock.error && <Busy />
            )}
          </>
        )}
        {adding && (
          <StockEditor
            day={day}
            close={() => setAdding(false)}
            saved={() => {
              refreshStock();
              setNotice(true);
            }}
          />
        )}
      </main>
    </div>
  );
}
