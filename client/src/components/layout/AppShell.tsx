import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  FileText,
  LayoutDashboard,
  Monitor,
  Moon,
  Plus,
  Settings,
  Sun,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "@/components/theme";
import { useSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that should highlight this item. */
  match?: (path: string) => boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
  {
    href: "/purchase-orders",
    label: "Purchase Orders",
    icon: FileText,
    match: (p) => p.startsWith("/purchase-orders") && p !== "/purchase-orders/new",
  },
  { href: "/styles", label: "Styles", icon: Tags, match: (p) => p.startsWith("/styles") },
  { href: "/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings") },
];

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href;
}

// ---------------------------------------------------------------------------
// Mobile nav visibility (form screens hide it and show their own action bar)
// ---------------------------------------------------------------------------

const MobileNavContext = createContext<{ setHidden: (hidden: boolean) => void }>({ setHidden: () => {} });

/** Call from a page that renders its own fixed bottom action bar on mobile. */
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

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavHidden, setMobileNavHidden] = useState(false);
  const [location] = useLocation();

  // Scroll to top on navigation (keeps list → detail → back feeling native).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <MobileNavContext.Provider value={{ setHidden: setMobileNavHidden }}>
      <div className="min-h-dvh bg-background lg:pl-64">
        <Sidebar path={location} />
        <main className="min-w-0">{children}</main>
        {!mobileNavHidden && <MobileNav path={location} />}
      </div>
    </MobileNavContext.Provider>
  );
}

function Brand() {
  const { data: settings } = useSettings();
  return (
    <Link href="/" className="flex items-center gap-3 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0 rounded-[10px]" />
      <div className="min-w-0 leading-tight">
        <div className="font-semibold tracking-tight">PO Master</div>
        <div className="truncate text-xs text-muted-foreground">{settings?.company.name ?? " "}</div>
      </div>
    </Link>
  );
}

function Sidebar({ path }: { path: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="px-4 pb-2 pt-5">
        <Brand />
      </div>
      <div className="px-4 py-3">
        <Button asChild className="w-full justify-start shadow-sm">
          <Link href="/purchase-orders/new">
            <Plus />
            New purchase order
          </Link>
        </Button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main">
        {NAV.map((item) => {
          const active = isActive(item, path);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className={cn("h-4 w-4", active ? "text-primary" : "opacity-70")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <ThemeToggle />
      </div>
    </aside>
  );
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Segmented Light / Dark / Auto control. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("grid grid-cols-3 gap-1 rounded-lg bg-muted p-1", className)}>
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={theme === opt.value}
          onClick={() => setTheme(opt.value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            theme === opt.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <opt.icon className="h-3.5 w-3.5" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MobileNav({ path }: { path: string }) {
  const [dashboard, orders, styles, settings] = NAV;
  const items: Array<NavItem | "new"> = [dashboard, orders, "new", styles, settings];
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-safe backdrop-blur-lg supports-[backdrop-filter]:bg-background/75 lg:hidden"
    >
      <div className="mx-auto grid h-[var(--mobile-nav-height)] max-w-lg grid-cols-5">
        {items.map((item) => {
          if (item === "new") {
            return (
              <div key="new" className="flex items-center justify-center">
                <Link
                  href="/purchase-orders/new"
                  aria-label="New purchase order"
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Plus className="h-6 w-6" />
                </Link>
              </div>
            );
          }
          const active = isActive(item, path);
          const label = item.label === "Purchase Orders" ? "Orders" : item.label === "Dashboard" ? "Home" : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none transition-colors focus-visible:text-primary",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Page scaffolding
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  title: ReactNode;
  /** Shown under the title on desktop only. */
  description?: ReactNode;
  /** Renders a back chevron (always on mobile, on desktop too). */
  backHref?: string;
  /** Right-aligned actions. Keep to icon buttons or 1–2 compact buttons on mobile. */
  actions?: ReactNode;
  /** Optional content under the title row (e.g. badges) */
  meta?: ReactNode;
}

/**
 * Sticky, translucent app bar on mobile; roomy page title on desktop.
 * Place as the first child of a page, followed by <PageContainer>.
 */
export function PageHeader({ title, description, backHref, actions, meta }: PageHeaderProps) {
  return (
    <header className="no-print sticky top-0 z-30 border-b bg-background/85 pt-safe backdrop-blur-lg supports-[backdrop-filter]:bg-background/70 lg:static lg:border-0 lg:bg-transparent lg:pt-0 lg:backdrop-blur-none">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-2 px-4 py-2 lg:gap-3 lg:px-8 lg:pb-2 lg:pt-8">
        {backHref && (
          <Button variant="ghost" size="icon" asChild className="-ml-2 shrink-0 lg:-ml-3">
            <Link href={backHref} aria-label="Back">
              <ChevronLeft className="!h-5 !w-5" />
            </Link>
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight lg:text-2xl">{title}</h1>
          {description && <p className="mt-0.5 hidden text-sm text-muted-foreground lg:block">{description}</p>}
          {meta && <div className="mt-1 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Standard page body width/padding. Leaves room for the mobile bottom nav. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-7xl px-4 pb-mobile-nav pt-4 lg:px-8 lg:pb-12 lg:pt-4", className)}>{children}</div>;
}
