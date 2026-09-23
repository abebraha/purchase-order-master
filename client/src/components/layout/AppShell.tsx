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

/**
 * New screens open at the top; Back/Forward returns to where you were (like iOS), so going
 * from a long list into a PO and back doesn't lose your place.
 */
function useScrollRestoration(location: string) {
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef("");
  const poppedRef = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const onPop = () => {
      poppedRef.current = true;
    };
    const onScroll = () => {
      positions.current.set(currentKey.current, window.scrollY);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Layout effect: runs before paint, so scroll events caused by the new screen's height are
  // attributed to the new screen and never overwrite the previous screen's saved position.
  useLayoutEffect(() => {
    currentKey.current = location + window.location.search;
    if (!poppedRef.current) {
      window.scrollTo(0, 0);
      return;
    }
    poppedRef.current = false;
    const target = positions.current.get(currentKey.current) ?? 0;
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

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavHidden, setMobileNavHidden] = useState(false);
  const [location] = useLocation();
  useScrollRestoration(location);

  return (
    <MobileNavContext.Provider value={{ setHidden: setMobileNavHidden }}>
      <div className="min-h-dvh bg-background lg:pl-[260px]">
        <Sidebar path={location} />
        <main className="min-w-0">{children}</main>
        {!mobileNavHidden && <TabBar path={location} />}
      </div>
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
                active ? "text-primary" : "text-[hsl(240_2%_57%)] active:opacity-60",
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

  return (
    <>
      <header className="no-print sticky top-0 z-30">
        <div
          className={cn(
            "pt-safe transition-[background-color,box-shadow,backdrop-filter] duration-200",
            collapsed ? "material-bar hairline-b" : "bg-transparent",
          )}
        >
          <div className={cn("relative mx-auto flex h-[52px] items-center gap-2 px-2 md:px-4 lg:px-6", WIDTH[width])}>
            <div className="z-10 flex min-w-0 flex-1 items-center">
              {leading ??
                (backHref && (
                  <Link
                    href={backHref}
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
        <div className={cn("no-print mx-auto px-4 pb-1 md:px-6 lg:px-8", WIDTH[width])}>
          <h1 className="text-large-title break-words">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] leading-snug text-muted-foreground">{subtitle}</p>}
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
  return (
    <div className={cn("mx-auto px-4 pb-mobile-nav pt-4 md:px-6 lg:px-8 lg:pb-16 lg:pt-5", WIDTH[width], className)}>
      {children}
    </div>
  );
}
