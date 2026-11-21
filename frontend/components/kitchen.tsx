"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Landing } from "./landing";
import { Illustration } from "./illustration";
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
  X,
  UsersRound,
  ArrowLeft,
} from "lucide-react";
import { api, ApiError, errorCode } from "@/lib/api";
import {
  historyQuery,
  householdQuery,
  inventoryQuery,
  preferencesQuery,
} from "@/lib/queries";
import { LanguageProvider, useLanguage } from "./language";
import {
  expiredEntries,
  localDay,
  type Household,
  type Language,
} from "@/lib/pantry";
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
import { HouseholdInvitations, HouseholdMembers } from "./household-members";
import { SettingsView } from "./management";
import { Meals } from "./meals";
import { AccountMenu } from "./account-menu";
import { ProfileSettings } from "./profile-settings";
import { ExpiryAlert, ExpiryNotifications } from "./expiry-notifications";
type Account = Session["user"];
type Page = "pantry" | "soon" | "meals" | "history" | "members" | "settings";
const pages: Page[] = [
  "pantry",
  "soon",
  "meals",
  "history",
  "members",
  "settings",
];
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
  const pathname = usePathname();
  const { lang, setLanguage } = useLanguage();
  const [showExpired, setShowExpired] = useState(expired);
  const accountId = session?.user.id;
  useEffect(() => {
    if (!accountId) {
      if (pathname === "/" && pages.includes(location.hash.slice(1) as Page))
        history.replaceState(null, "", "/sign-in" + location.hash);
      return;
    }
    if (pathname !== "/") history.replaceState(null, "", "/" + location.hash);
    setShowExpired(false);
    // A new login in another tab may already have replaced this cookie. Recheck
    // the current session on the server without signing out the new account.
    const recheck = () =>
      window.location.replace("/sign-in?expired=1" + location.hash);
    window.addEventListener("session-ended", recheck, { once: true });
    return () => window.removeEventListener("session-ended", recheck);
  }, [accountId, pathname]);
  if (!session) {
    const flip = () => setLanguage(lang === "en" ? "th" : "en");
    if (pathname === "/" && !showExpired)
      return <Landing changeLanguage={flip} />;
    return (
      <AccessFrame changeLanguage={flip}>
        <SignIn
          key={pathname}
          create={pathname === "/register"}
          expired={showExpired}
        />
      </AccessFrame>
    );
  }
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
  const [editingProfile, setEditingProfile] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const onboardingContent = useRef<HTMLDivElement>(null);
  const profileHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (editingProfile) profileHeading.current?.focus();
  }, [editingProfile]);
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
      history.replaceState(null, "", "/");
    });
  const problem = errorCode(household.error || preferences.error);
  if (!household.data || !preferences.data)
    return (
      <AccessFrame
        changeLanguage={flip}
        headerActions={
          <AccountMenu
            account={account}
            busy={action.busy || onboardingBusy}
            editProfile={() => setEditingProfile(true)}
            signOut={logout}
          />
        }
      >
        <Message code={action.error || problem} />
        {problem ? (
          <div className="actions">
            <Retry
              onClick={() => {
                void household.refetch();
                void preferences.refetch();
              }}
            />
          </div>
        ) : household.data === null && preferences.data ? (
          <>
            <div hidden={editingProfile} ref={onboardingContent}>
              <Onboarding
                joined={(h) => client.setQueryData(householdQuery.queryKey, h)}
                onBusyChange={setOnboardingBusy}
              />
            </div>
            {editingProfile && (
              <div className="access-inner access-profile">
                <button
                  type="button"
                  className="plain"
                  onClick={() => {
                    setEditingProfile(false);
                    requestAnimationFrame(() =>
                      onboardingContent.current?.querySelector("h1")?.focus(),
                    );
                  }}
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                  {t("Back to your household", "กลับไปหน้าครัวเรือน")}
                </button>
                <h1 ref={profileHeading} tabIndex={-1}>
                  {t("Edit profile", "แก้ไขโปรไฟล์")}
                </h1>
                <ProfileSettings />
              </div>
            )}
          </>
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
    [menuOpen, setMenuOpen] = useState(false),
    [adding, setAdding] = useState(false);
  const [day, setDay] = useState(localDay),
    [notice, setNotice] = useState(false);
  const menu = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLElement>(null);
  const [reviewExpired, setReviewExpired] = useState(false);
  useEffect(() => {
    const sync = () => {
      setPage(hashPage());
      menu.current?.close();
      setAdding(false);
      setNotice(false);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const drawer = menu.current;
    if (!menuOpen || !drawer) return;
    const desktop = window.matchMedia("(min-width: 56rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) drawer.close();
    };
    drawer.showModal();
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [menuOpen]);
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
  const expired = stock.error ? [] : expiredEntries(stock.data ?? [], day);
  useEffect(() => {
    if (page !== "soon" || !reviewExpired || !stock.data) return;
    const heading = document.getElementById("past-date-groceries");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
    setReviewExpired(false);
  }, [page, reviewExpired, stock.data]);
  const showExpired = () => {
    setReviewExpired(true);
    location.hash = "soon";
  };
  const refreshStock = () => {
    void client.invalidateQueries({ queryKey: ["inventory"] });
    void client.invalidateQueries({ queryKey: historyQuery.queryKey });
  };
  const links = [
    { page: "pantry", icon: Archive, title: t("Inventory", "คลังอาหาร") },
    { page: "soon", icon: CalendarClock, title: t("Use soon", "ควรใช้เร็ว ๆ นี้") },
    { page: "meals", icon: ChefHat, title: t("Meal ideas", "ไอเดียมื้ออาหาร") },
    { page: "history", icon: History, title: t("History", "ประวัติ") },
    {
      page: "members",
      icon: UsersRound,
      title: t("Household", "ครัวเรือน"),
    },
    { page: "settings", icon: Settings, title: t("Settings", "การตั้งค่า") },
  ];
  const title = links.find((link) => link.page === page)!.title;
  const navigation = (
    <nav className="workspace-nav" aria-label={t("Navigation", "เมนูนำทาง")}>
      {links.map((link) => (
        <a
          key={link.page}
          href={"#" + link.page}
          onClick={() => {
            if (menu.current?.open) {
              menu.current.close();
              content.current?.focus();
            }
          }}
          aria-current={link.page === page ? "page" : undefined}
        >
          <link.icon size={19} aria-hidden="true" />
          {link.title}
        </a>
      ))}
    </nav>
  );
  const signOutButton = (
    <button type="button" disabled={busy} className="plain" onClick={logout}>
      <LogOut size={17} aria-hidden="true" />
      {t("Sign out", "ออกจากระบบ")}
    </button>
  );
  return (
    <div className="workspace">
      <a
        className="skip"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          content.current?.focus();
        }}
      >
        {t("Skip to content", "ข้ามไปเนื้อหา")}
      </a>
      <aside className="workspace-sidebar">
        <Brand />
        {navigation}
        <div className="member-controls">{signOutButton}</div>
      </aside>
      <header className="workspace-mast">
        <div className="workspace-mast-start">
          <button
            className="secondary workspace-menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="workspace-drawer"
            aria-haspopup="dialog"
            aria-label={t("Menu", "เมนู")}
            onClick={(event) => {
              event.currentTarget.focus();
              setMenuOpen(true);
            }}
          >
            <MenuIcon size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="workspace-topbar-actions">
          <ExpiryNotifications
            key={`${account.id}:${household.id}`}
            storageKey={`fridgellio:expiry-read:${account.id}:${household.id}`}
            entries={expired}
            loading={!stock.data && !stock.error}
            failed={Boolean(stock.error)}
            retry={() => {
              void stock.refetch();
            }}
            review={showExpired}
          />
          <AccountMenu
            account={account}
            busy={busy}
            signOut={logout}
            editProfile={() => {
              location.hash = "settings";
              requestAnimationFrame(() => content.current?.focus());
            }}
          />
        </div>
      </header>
      <dialog
        className="workspace-drawer"
        id="workspace-drawer"
        ref={menu}
        aria-label={t("Navigation menu", "เมนูนำทาง")}
        onClose={() => setMenuOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        {menuOpen && (
          <div className="workspace-drawer-inner">
            <header className="workspace-drawer-head">
              <Brand />
              <button
                className="icon"
                type="button"
                aria-label={t("Close menu", "ปิดเมนู")}
                onClick={() => menu.current?.close()}
              >
                <X size={21} aria-hidden="true" />
              </button>
            </header>
            {navigation}
            <div className="member-controls">{signOutButton}</div>
          </div>
        )}
      </dialog>
      <main id="content" ref={content} tabIndex={-1} className="content">
        {page === "pantry" && (
          <ExpiryAlert entries={expired} review={showExpired} />
        )}
        <div
          className={page === "pantry" ? "pagehead pantry-head" : "pagehead"}
        >
          <div className="pagehead-copy">
            <p className="kicker">{t("My household", "ครัวเรือนของฉัน")}</p>
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
                    "See what your household added, used, or discarded.",
                    "ดูรายการที่สมาชิกในบ้านเพิ่ม ใช้ หรือทิ้ง",
                  ),
                  members: t(
                    "People who can access your shared pantry.",
                    "ผู้ที่เข้าถึงคลังอาหารส่วนรวมได้",
                  ),
                  meals: t(
                    "Preview a request for up to 5 recipes using what you have.",
                    "ดูตัวอย่างคำขอแนะนำสูงสุด 5 เมนูจากวัตถุดิบที่มีในครัว",
                  ),
                  settings: t(
                    "Manage your preferences and shared kitchen.",
                    "จัดการการตั้งค่าส่วนตัวและครัวส่วนรวม",
                  ),
                }[page]
              }
            </p>
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
          {page === "pantry" && <Illustration variant="groceries" />}
        </div>
        <Message code={actionError} />
        {notice && (
          <p role="status" className="success">
            {t("Groceries saved to your pantry.", "บันทึกรายการในคลังแล้ว")}
          </p>
        )}
        {page === "history" ? (
          <HistoryView />
        ) : page === "members" ? (
          <div className="panels">
            <HouseholdMembers accountId={account.id} />
            {household.can_invite && <HouseholdInvitations />}
          </div>
        ) : page === "settings" ? (
          <SettingsView changeLanguage={flip} languageBusy={busy} />
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
