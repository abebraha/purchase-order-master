import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  FileText,
  House,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/kit";
import { useTheme, type ThemePreference } from "@/components/theme";
import { useSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  /** Short label for the phone tab bar */
  tabLabel: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Home", tabLabel: "Home", icon: House, match: (p) => p === "/" },
  {
    href: "/purchase-orders",
    label: "Purchase Orders",
    tabLabel: "Orders",
    icon: FileText,
    match: (p) => p.startsWith("/purchase-orders") && p !== "/purchase-orders/new",
  },
  { href: "/styles", label: "Styles", tabLabel: "Styles", icon: Tags, match: (p) => p.startsWith("/styles") },
  { href: "/settings", label: "Settings", tabLabel: "Settings", icon: Settings, match: (p) => p.startsWith("/settings") },
];

// ---------------------------------------------------------------------------
// Mobile tab bar visibility (compose/edit screens hide it and show their own bar)
// ---------------------------------------------------------------------------

const MobileNavContext = createContext<{ setHidden: (hidden: boolean) => void }>({ setHidden: () => {} });

/** Call from a page that renders its own fixed bottom toolbar on phones. */
export function useHideMobileNav() {
  const { setHidden } = useContext(MobileNavContext);
  useEffect(() => {
    setHidden(true);
    return () => setHidden(false);
  }, [setHidden]);
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Navigation model: which history entry we're on, what came before, and where each entry
// was scrolled. Installed at module load — before wouter subscribes to history events — so
// Back/Forward are always recognised correctly. Kept on `window` so it survives hot reloads.
// ---------------------------------------------------------------------------

interface NavModel {
  /** Index of the current history entry (stamped into history.state). */
  idx: number;
  /** How we got to the current entry; read and cleared by the scroll logic. */
  type: "init" | "push" | "replace" | "pop";
  /** URL (path + query) of each entry we've seen, by index. */
  entries: Map<number, string>;
  /** Last scroll position of each entry, by index. */
  scroll: Map<number, number>;
  /** Last full URL seen for each path (e.g. the Orders list with its filters). */
  lastByPath: Map<string, string>;
}

const IDX_KEY = "__poIdx";
const here = () => window.location.pathname + window.location.search;

function installNavModel(): NavModel {
  const w = window as Window & { __poNav?: NavModel };
  if (w.__poNav) return w.__poNav;
  const state = history.state as Record<string, unknown> | null;
  const nav: NavModel = {
    idx: typeof state?.[IDX_KEY] === "number" ? (state[IDX_KEY] as number) : 0,
    type: "init",
    entries: new Map(),
    scroll: new Map(),
    lastByPath: new Map(),
  };
  w.__poNav = nav;
  const record = () => {
    nav.entries.set(nav.idx, here());
    nav.lastByPath.set(window.location.pathname, here());
  };
  if (typeof state?.[IDX_KEY] !== "number") {
    history.replaceState({ ...(state ?? {}), [IDX_KEY]: nav.idx }, "");
  }
  record();
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      nav.scroll.set(nav.idx, window.scrollY); // position of the screen we're leaving
      if (method === "pushState") {
        nav.idx += 1;
        // Forward history is gone after a push.
        for (const k of Array.from(nav.entries.keys())) if (k >= nav.idx) nav.entries.delete(k);
      }
      nav.type = method === "pushState" ? "push" : "replace";
      const stamped = { ...(data && typeof data === "object" ? data : {}), [IDX_KEY]: nav.idx };
      const result = original.call(this, stamped, unused, url);
      record();
      return result;
    } as History[typeof method];
  }
  window.addEventListener("popstate", (e) => {
    nav.scroll.set(nav.idx, window.scrollY); // position of the screen we're leaving
    const idx = (e.state as Record<string, unknown> | null)?.[IDX_KEY];
    nav.idx = typeof idx === "number" ? idx : 0;
    nav.type = "pop";
    record();
  });
  window.addEventListener(
    "scroll",
    () => {
      nav.scroll.set(nav.idx, window.scrollY);
    },
    { passive: true },
  );
  return nav;
}

const nav: NavModel | null = typeof window !== "undefined" ? installNavModel() : null;

/**
 * Where a back button should go. If the previous history entry is that screen, go back to it
 * (keeping its filters and scroll position, like iOS); otherwise link to the last version of
 * that screen we saw (e.g. the Orders list with the filters you had).
 */
function resolveBack(backHref: string): { href: string; useHistory: boolean } {
  if (!nav) return { href: backHref, useHistory: false };
  const target = new URL(backHref, window.location.origin);
  const prev = nav.entries.get(nav.idx - 1);
  if (prev && new URL(prev, window.location.origin).pathname === target.pathname) {
    return { href: prev, useHistory: true };
  }
  const last = target.search ? null : nav.lastByPath.get(target.pathname);
  return { href: last ?? backHref, useHistory: false };
}

/**
 * After finishing a task (e.g. saving in the editor), return to `href`: go back if the
 * previous entry is already that screen (so Back doesn't reopen the editor), otherwise
 * replace the current entry with it.
 */
export function returnTo(href: string, navigate: (to: string, opts?: { replace?: boolean }) => void) {
  const prev = nav?.entries.get(nav.idx - 1);
  if (prev && prev === href) history.back();
  else navigate(href, { replace: true });
}

/**
 * New screens open at the top; Back/Forward returns to exactly where that screen was
 * scrolled (like iOS), so going from a long list into a PO and back doesn't lose your place.
 */
function useScrollRestoration(location: string) {
  useLayoutEffect(() => {
    if (!nav) return;
    const type = nav.type;
    nav.type = "init";
    if (type !== "pop") {
      window.scrollTo(0, 0);
      return;
    }
    const target = nav.scroll.get(nav.idx) ?? 0;
    let frames = 0;
    const restore = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll >= target || frames > 40) {
        window.scrollTo(0, target);
        return;
      }
      frames++;
      requestAnimationFrame(restore); // content may still be rendering
    };
    restore();
  }, [location]);
}

// Page layout context: pages with a large title align their content under it (so the title
// doesn't jump sideways when switching tabs on desktop).
const PageLayoutContext = createContext<{ largeTitle: boolean; setLargeTitle: (v: boolean) => void }>({
  largeTitle: false,
  setLargeTitle: () => {},
});

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavHidden, setMobileNavHidden] = useState(false);
  const [largeTitle, setLargeTitle] = useState(false);
  const [location] = useLocation();
  useScrollRestoration(location);

  // Toasts sit just above whatever bar is at the bottom of the phone screen.
  useEffect(() => {
    document.documentElement.style.setProperty("--toast-offset", mobileNavHidden ? "5.75rem" : "3.75rem");
  }, [mobileNavHidden]);

  return (
    <MobileNavContext.Provider value={{ setHidden: setMobileNavHidden }}>
      <PageLayoutContext.Provider value={{ largeTitle, setLargeTitle }}>
        <div className="min-h-dvh bg-background lg:pl-[260px]">
          <Sidebar path={location} />
          <main className="min-w-0">{children}</main>
          {!mobileNavHidden && <TabBar path={location} />}
        </div>
      </PageLayoutContext.Provider>
    </MobileNavContext.Provider>
  );
}

function Sidebar({ path }: { path: string }) {
  const { data: settings } = useSettings();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
        <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0 rounded-[8px] shadow-sm" />
        <div className="min-w-0 leading-tight">
          <div className="text-[17px] font-semibold tracking-tight">PO Master</div>
          {settings?.company.name && <div className="truncate text-xs text-muted-foreground">{settings.company.name}</div>}
        </div>
      </div>
      <div className="px-4 pb-4">
        <Button asChild className="w-full">
          <Link href="/purchase-orders/new">
            <Plus strokeWidth={2.5} />
            New Purchase Order
          </Link>
        </Button>
      </div>
      <nav className="flex-1 space-y-0.5 px-3" aria-label="Main">
        {NAV.map((item) => {
          const active = item.match(path);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-3 rounded-lg px-2.5 text-[15px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
                active
                  ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", active ? "text-current" : "text-primary")} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function TabBar({ path }: { path: string }) {
  return (
    <nav
      aria-label="Main"
      className="material-bar hairline-t no-print fixed inset-x-0 bottom-0 z-40 pb-safe lg:hidden"
    >
      <div className="mx-auto grid h-[var(--mobile-nav-height)] max-w-md grid-cols-4">
        {NAV.map((item) => {
          const active = item.match(path);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-[3px] pt-1 text-[10px] font-medium outline-none transition-colors",
                active ? "text-primary" : "text-muted-foreground active:opacity-60",
              )}
            >
              <item.icon
                className="h-[23px] w-[23px]"
                strokeWidth={active ? 2.2 : 1.8}
                fill={active ? "currentColor" : "none"}
                fillOpacity={active ? 0.18 : 0}
              />
              {item.tabLabel}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Theme control (used in Settings)
// ---------------------------------------------------------------------------

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Automatic", icon: Monitor },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      aria-label="Appearance"
      value={theme}
      onChange={setTheme}
      options={THEME_OPTIONS}
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Page scaffolding
// ---------------------------------------------------------------------------

export type PageWidth = "narrow" | "default" | "wide";

const WIDTH: Record<PageWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
};

interface PageHeaderProps {
  title: ReactNode;
  /** Plain-text title for the compact bar when `title` is not a string. */
  compactTitle?: string;
  /** Secondary line under the large title. */
  subtitle?: ReactNode;
  /** Chips/badges under the large title (status, type…). */
  meta?: ReactNode;
  /** iOS back button: "‹ backLabel". */
  backHref?: string;
  backLabel?: string;
  /** Replaces the back button (e.g. a "Cancel" plain button on compose screens). */
  leading?: ReactNode;
  /**
   * Right side of the nav bar. On phones prefer plain/icon buttons (variant="plain" or
   * size="icon"); keep to 1–2 items plus an optional "more" menu.
   */
  actions?: ReactNode;
  /** Show the big 34px title under the bar (default). When false the title sits in the bar. */
  largeTitle?: boolean;
  width?: PageWidth;
}

/**
 * Apple-style navigation bar + large title. The bar is transparent at the top of the page and
 * turns into a translucent material with a centered compact title once the large title
 * scrolls away — like Mail, Notes or Settings on iPhone.
 */
export function PageHeader({
  title,
  compactTitle,
  subtitle,
  meta,
  backHref,
  backLabel = "Back",
  leading,
  actions,
  largeTitle = true,
  width = "default",
}: PageHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(!largeTitle);
  const layout = useContext(PageLayoutContext);
  const setLayoutLargeTitle = layout.setLargeTitle;

  useLayoutEffect(() => {
    if (!largeTitle) return;
    setLayoutLargeTitle(true);
    return () => setLayoutLargeTitle(false);
  }, [largeTitle, setLayoutLargeTitle]);

  useEffect(() => {
    if (!largeTitle) {
      setCollapsed(true);
      return;
    }
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setCollapsed(entry.boundingClientRect.top < 60),
      { threshold: [0, 1], rootMargin: "-60px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [largeTitle]);

  const barTitle = compactTitle ?? (typeof title === "string" ? title : undefined);

  // Browser tab / window title (also announced to screen readers on navigation).
  useEffect(() => {
    document.title = barTitle ? `${barTitle} · PO Master` : "PO Master";
  }, [barTitle]);

  const back = backHref ? resolveBack(backHref) : null;
  // Large-title pages share one left edge (the wide column) so titles never jump sideways.
  const headerWidth = largeTitle ? WIDTH.wide : WIDTH[width];

  return (
    <>
      <header className="no-print sticky top-0 z-30">
        <div
          className={cn(
            "pt-safe transition-[background-color,box-shadow,backdrop-filter] duration-200",
            collapsed ? "material-bar hairline-b" : "bg-transparent",
          )}
        >
          <div className={cn("relative mx-auto flex h-[52px] items-center gap-2 px-2 md:px-4 lg:px-6", headerWidth)}>
            <div className="z-10 flex min-w-0 flex-1 items-center">
              {leading ??
                (back && (
                  <Link
                    href={back.href}
                    onClick={(e) => {
                      if (!back.useHistory || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      history.back();
                    }}
                    className="-ml-1 flex h-11 min-w-0 items-center rounded-lg pr-2 text-[17px] text-primary outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring/40 active:opacity-50 md:text-[15px]"
                  >
                    <ChevronLeft className="h-7 w-7 shrink-0 md:h-6 md:w-6" strokeWidth={2.4} />
                    <span className="-ml-0.5 truncate">{backLabel}</span>
                  </Link>
                ))}
            </div>
            {barTitle && (
              <div
                aria-hidden={largeTitle}
                className={cn(
                  "pointer-events-none absolute inset-x-0 mx-auto w-fit max-w-[55%] truncate text-center text-[17px] font-semibold transition-opacity duration-200 md:text-[15px]",
                  collapsed ? "opacity-100" : "opacity-0",
                )}
              >
                {barTitle}
              </div>
            )}
            <div className="z-10 flex flex-1 items-center justify-end gap-1 md:gap-2">{actions}</div>
          </div>
        </div>
      </header>
      {largeTitle && (
        <div className={cn("no-print mx-auto px-4 pb-1 md:px-6 lg:px-8", headerWidth)}>
          <h1 className="text-large-title [overflow-wrap:anywhere]">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">{subtitle}</p>}
          {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
          <div ref={sentinelRef} aria-hidden className="h-px" />
        </div>
      )}
      {!largeTitle && <h1 className="sr-only">{barTitle}</h1>}
    </>
  );
}

/** Page body with consistent width and padding. Leaves room for the phone tab bar. */
export function PageContainer({
  children,
  className,
  width = "default",
}: {
  children: ReactNode;
  className?: string;
  width?: PageWidth;
}) {
  const { largeTitle } = useContext(PageLayoutContext);
  const padding = "px-4 pb-mobile-nav pt-4 md:px-6 lg:px-8 lg:pb-16 lg:pt-5";
  if (largeTitle && width !== "wide") {
    // Under a large title: same left edge as the title, content keeps its comfortable width.
    return (
      <div className={cn("mx-auto", WIDTH.wide, padding)}>
        <div className={cn(WIDTH[width], className)}>{children}</div>
      </div>
    );
  }
  return <div className={cn("mx-auto", padding, WIDTH[width], className)}>{children}</div>;
}
