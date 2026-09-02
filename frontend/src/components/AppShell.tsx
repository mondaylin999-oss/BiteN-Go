// ===========================================================================
//  AppShell.tsx — the frame every signed-in screen sits in.
//
//  Straight from the Nexus design:
//    * a fixed top bar with the wordmark, search, and the account button
//    * a 256px side rail on desktop, with the "System Switcher" card
//    * a pinned bottom bar on phones (navigation must stay reachable while
//      the user is moving — that is the design brief's rule)
//  The nav items themselves depend on which of the four roles is signed in.
// ===========================================================================

import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Bus,
  Clock,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu as MenuIcon,
  Receipt,
  Moon,
  Settings,
  Sun,
  ShieldCheck,
  Ticket,
  User as UserIcon,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { LANGUAGE_NAMES } from "@/lib/i18n";
import { initials, titleCase } from "@/lib/format";
import type { Role } from "@/lib/api";

type NavItem = { href: string; label: string; icon: ReactNode; context?: "canteen" | "ferry" };

const NAV: Record<Role, NavItem[]> = {
  user: [
    { href: "/student", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: "/student/canteen", label: "Canteen Menu", icon: <UtensilsCrossed className="h-5 w-5" />, context: "canteen" },
    { href: "/student/orders", label: "Meal Orders", icon: <Receipt className="h-5 w-5" />, context: "canteen" },
    { href: "/student/wallet", label: "Wallet", icon: <Wallet className="h-5 w-5" />, context: "canteen" },
    { href: "/student/ferry", label: "Ferry", icon: <Bus className="h-5 w-5" />, context: "ferry" },
    { href: "/student/passes", label: "My Ferry Pass", icon: <Ticket className="h-5 w-5" />, context: "ferry" },
    { href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" /> },
  ],
  agent: [
    { href: "/agent", label: "Kitchen Display", icon: <ChefHat className="h-5 w-5" />, context: "canteen" },
    { href: "/agent/menu", label: "Menu Board", icon: <UtensilsCrossed className="h-5 w-5" />, context: "canteen" },
    { href: "/agent/wallet", label: "Cash & Top-ups", icon: <Wallet className="h-5 w-5" />, context: "canteen" },
    { href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" /> },
  ],
  driver: [
    { href: "/driver", label: "My Ferry", icon: <Bus className="h-5 w-5" />, context: "ferry" },
    { href: "/driver/route", label: "Road & Map", icon: <MapIcon className="h-5 w-5" />, context: "ferry" },
    { href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" /> },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: <LayoutDashboard className="h-5 w-5" /> },
    { href: "/admin/people", label: "People", icon: <Users className="h-5 w-5" /> },
    { href: "/admin/transport", label: "Transport", icon: <Bus className="h-5 w-5" />, context: "ferry" },
    { href: "/admin/canteen", label: "Canteen Ops", icon: <UtensilsCrossed className="h-5 w-5" />, context: "canteen" },
    { href: "/admin/history", label: "Cash Flow", icon: <ClipboardList className="h-5 w-5" /> },
    { href: "/profile", label: "Profile", icon: <UserIcon className="h-5 w-5" /> },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  user: "Student",
  agent: "Canteen agent",
  driver: "Transport agent",
  admin: "Administrator",
};

function isActive(current: string, href: string) {
  if (href === "/profile") return current === "/profile";
  const roots = ["/student", "/agent", "/admin", "/driver"];
  if (roots.includes(href)) return current === href;
  return current === href || current.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, health, logout } = useAuth();
  const { language, theme, toggleLanguage, toggleTheme, t } = usePrefs();
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = useMemo(() => (user ? NAV[user.role] : []), [user]);
  if (!user) return <>{children}</>;

  const navLink = (item: NavItem, onNavigate?: () => void) => {
    const active = isActive(location, item.href);
    const activeClass = item.context === "ferry" ? "nav-item-active-ferry" : "nav-item-active";
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={`nav-item ${active ? activeClass : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {item.icon}
        <span>{t(item.label)}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* ---------- top bar ---------- */}
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-lowest px-gutter">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="rounded-full p-2 text-on-surface hover:bg-surface-container-high md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <Link href={items[0]?.href ?? "/"} className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="truncate text-headline-md font-bold text-primary">BiteN Go</span>
          </Link>
        </div>

        <div className="hidden flex-1 justify-center md:flex">
          <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-transparent bg-surface-container-low px-4 py-2 text-on-surface-variant">
            <Clock className="h-4 w-4" />
            <span className="truncate text-[13px]">
              {health?.myanmarTime ? <span className="tabular">{health.myanmarTime} · Yangon</span> : <span>Connecting…</span>}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* ---- English ⇄ မြန်မာ, one click ---- */}
          <button
            className="rounded-full border border-outline-variant px-2.5 py-1.5 text-[12px] font-bold text-on-surface hover:bg-surface-container-high"
            onClick={toggleLanguage}
            aria-label={`Switch to ${language === "en" ? LANGUAGE_NAMES.my : LANGUAGE_NAMES.en}`}
            title={`${t("Language")}: ${LANGUAGE_NAMES[language]}`}
          >
            {language === "en" ? "EN" : "မြန်"}
          </button>

          {/* ---- light ⇄ dark, one click ---- */}
          <button
            className="rounded-full p-2 text-on-surface hover:bg-surface-container-high"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("Light mode") : t("Dark mode")}
            title={theme === "dark" ? t("Light mode") : t("Dark mode")}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <Link href="/profile" className="hidden rounded-full p-2 text-on-surface hover:bg-surface-container-high sm:block" aria-label="Settings">
            <Settings className="h-5 w-5" />
          </Link>
          <div className="hidden text-right sm:block">
            <p className="max-w-[160px] truncate text-[13px] font-semibold text-on-surface">{user.name ?? user.username}</p>
            <p className="text-[11px] uppercase tracking-wider text-on-surface-variant">{t(ROLE_LABEL[user.role])}</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-highest text-[13px] font-bold text-on-surface">
            {initials(user.name ?? user.username)}
          </span>
          <button className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high" onClick={logout} aria-label="Log out" title="Log out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* ---------- desktop side rail ---------- */}
      <aside className="fixed left-0 top-16 z-40 hidden h-[calc(100vh-64px)] w-64 flex-col border-r border-outline-variant bg-surface-container-low p-stack-md md:flex">
        <div className="mb-stack-lg rounded-lg border border-surface-container-high bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded ${
                user.role === "driver" ? "bg-tertiary text-on-tertiary" : "bg-secondary text-on-secondary"
              }`}
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-headline-md font-bold leading-tight text-on-surface">{t("System Switcher")}</h2>
              <p className="truncate text-label font-semibold text-secondary">
                {t("Current")}: {t(ROLE_LABEL[user.role])}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto kds-scroll">{items.map(item => navLink(item))}</nav>

        <div className="mt-auto space-y-2 border-t border-outline-variant pt-4">
          <p className="px-2 text-[11px] leading-relaxed text-on-surface-variant">
            {health ? t("Connected") : t("Not connected — the server is not answering")}
          </p>
          <button className="btn btn-ghost w-full" onClick={logout}>
            <LogOut className="h-4 w-4" /> {t("Log out")}
          </button>
        </div>
      </aside>

      {/* ---------- mobile drawer ---------- */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-inverse-surface/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface-container-low p-stack-md shadow-raised">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-headline-md font-bold text-primary">BiteN Go</span>
              <button className="rounded-full p-2 hover:bg-surface-container-high" onClick={() => setDrawerOpen(false)} aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">{items.map(item => navLink(item, () => setDrawerOpen(false)))}</nav>
          </div>
        </div>
      ) : null}

      {/* ---------- page ---------- */}
      <main className="px-gutter pb-28 pt-20 md:ml-64 md:px-container-margin md:pb-10">
        <div className="mx-auto w-full max-w-6xl space-y-stack-md">{children}</div>
      </main>

      {/* ---------- mobile bottom bar ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-outline-variant bg-surface-container-lowest pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.slice(0, 5).map(item => {
          const active = isActive(location, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 px-1 py-2 text-[10px] font-semibold ${
                active ? (item.context === "ferry" ? "text-tertiary" : "text-secondary") : "text-on-surface-variant"
              }`}
            >
              {item.icon}
              <span className="truncate">{t(item.label).split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export { ROLE_LABEL, titleCase };
