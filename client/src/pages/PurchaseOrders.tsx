import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Archive, ChevronDown, Ellipsis, FileSpreadsheet, FileText, Plus, SearchX, Share } from "lucide-react";
import { PO_STATUSES, type POStatus, type PurchaseOrder } from "@shared/po";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { SearchField, SegmentedControl } from "@/components/kit";
import { EmptyState, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterChips } from "@/components/po-list/FilterChips";
import { ReviewOlderOrders } from "@/components/po/ReviewOlderOrders";
import { FiltersSheet } from "@/components/po-list/FiltersSheet";
import { OrdersList, OrdersListSkeleton } from "@/components/po-list/OrdersList";
import { OrdersTable, OrdersTableSkeleton } from "@/components/po-list/OrdersTable";
import { usePOActions } from "@/components/po-list/usePOActions";
import { clearedFilters, displayOrder, hasActiveFilters } from "@/components/po-list/utils";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { usePurchaseOrders } from "@/lib/api";
import { exportLineItemsCsv, exportOrdersCsv } from "@/lib/export";
import {
  applyOrderFilters,
  isDueSoon,
  isOverdue,
  matchesFilters,
  ordersHref,
  parseOrderFilters,
  type DueFilter,
  type OrderFilters,
} from "@/lib/filters";
import { formatMoney, formatNumber, pluralize } from "@/lib/format";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 150;

type View = OrderFilters["view"];
const VIEW_OPTIONS: Array<{ value: View; label: string }> = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

// ---------------------------------------------------------------------------
// URL-backed filter state
// ---------------------------------------------------------------------------

function useOrderFilters() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const filters = useMemo(() => {
    const f = parseOrderFilters(search);
    // "Cancel soon" / "overdue" only apply to the active list.
    return f.view === "archived" && f.due ? { ...f, due: "" as const } : f;
  }, [search]);

  const latest = useRef(filters);
  latest.current = filters;

  const update = useCallback(
    (patch: Partial<OrderFilters>) => {
      navigate(ordersHref({ ...latest.current, ...patch }), { replace: true });
    },
    [navigate],
  );

  return { filters, update, search };
}

// ---------------------------------------------------------------------------
// Header menus
// ---------------------------------------------------------------------------

function useExport(orders: PurchaseOrder[]) {
  const { toast } = useToast();
  return (kind: "orders" | "lines") => {
    if (!orders.length) return;
    if (kind === "orders") exportOrdersCsv(orders);
    else exportLineItemsCsv(orders);
    toast({
      title: kind === "orders" ? "Orders exported" : "Line items exported",
      description: `${pluralize(orders.length, "order")} saved as a CSV file.`,
    });
  };
}

function MoreMenu({ orders }: { orders: PurchaseOrder[] }) {
  const exportCsv = useExport(orders);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="plain" size="icon" aria-label="More">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/20">
            <Ellipsis className="!h-5 !w-5" strokeWidth={2.25} />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[13px] font-normal text-muted-foreground">
          {orders.length ? `Exports the ${pluralize(orders.length, "order")} shown` : "Nothing to export"}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={!orders.length} onSelect={() => exportCsv("orders")}>
          <FileText />
          Export Orders CSV
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!orders.length} onSelect={() => exportCsv("lines")}>
          <FileSpreadsheet />
          Export Line Items CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExportMenu({ orders }: { orders: PurchaseOrder[] }) {
  const exportCsv = useExport(orders);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="tinted" size="sm">
          <Share strokeWidth={2.25} />
          Export
          <ChevronDown className="-ml-0.5 opacity-70" strokeWidth={2.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {orders.length ? `Exports the ${pluralize(orders.length, "order")} shown` : "Nothing to export"}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={!orders.length} onSelect={() => exportCsv("orders")} className="items-start">
          <FileText className="mt-0.5" />
          <div>
            <div>Orders CSV</div>
            <div className="text-xs text-muted-foreground">One row per purchase order</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!orders.length} onSelect={() => exportCsv("lines")} className="items-start">
          <FileSpreadsheet className="mt-0.5" />
          <div>
            <div>Line Items CSV</div>
            <div className="text-xs text-muted-foreground">One row per style, great for pivot tables</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function noMatchText(f: OrderFilters): string {
  const narrowed = Boolean(f.status.length || f.due || f.type || f.from || f.to);
  if (f.q && narrowed) return `Nothing matches “${f.q}” with these filters. Try a different search or clear your filters.`;
  if (f.q) return `Nothing matches “${f.q}”. Check the spelling or try a PO #, style or store name.`;
  return "No orders match these filters. Try removing one, or clear them all.";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PurchaseOrders() {
  const { filters, update, search } = useOrderFilters();
  const isDesktop = useIsDesktop();
  const actions = usePOActions();

  // Both lists are small; loading both makes the Active / Archived switch instant.
  const activeQuery = usePurchaseOrders();
  const archivedQuery = usePurchaseOrders("only");
  const query = filters.view === "archived" ? archivedQuery : activeQuery;
  const list = query.data;

  // --- Search: typed text is debounced into the URL -------------------------
  const [searchText, setSearchText] = useState(filters.q);
  const pushed = useRef(filters.q);
  useEffect(() => {
    // Back/forward or a link changed the URL: follow it.
    if (filters.q !== pushed.current) {
      pushed.current = filters.q;
      setSearchText(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    const next = searchText.trim();
    if (next === filters.q) return;
    const t = window.setTimeout(() => {
      pushed.current = next;
      update({ q: next });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const commitSearch = () => {
    const next = searchText.trim();
    if (next === filters.q) return;
    pushed.current = next;
    update({ q: next });
  };

  const searchRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']")) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [search]);

  // --- Derived data ----------------------------------------------------------
  const filtered = useMemo(
    () => (list ? displayOrder(applyOrderFilters(list, filters), filters) : []),
    [list, filters],
  );

  const statusCounts = useMemo(() => {
    if (!list) return undefined;
    const counts = Object.fromEntries(PO_STATUSES.map((s) => [s, 0])) as Record<POStatus, number>;
    const f = { ...filters, status: [] };
    for (const po of list) if (matchesFilters(po, f)) counts[po.status] = (counts[po.status] ?? 0) + 1;
    return counts;
  }, [list, filters]);

  const dueCounts = useMemo(() => {
    if (!list) return undefined;
    const f: OrderFilters = { ...filters, due: "" };
    const base = list.filter((po) => matchesFilters(po, f));
    return {
      soon: base.filter((po) => isDueSoon(po)).length,
      overdue: base.filter((po) => isOverdue(po)).length,
    } satisfies Record<DueFilter, number>;
  }, [list, filters]);

  const reviewCount = useMemo(() => {
    if (!list) return undefined;
    const f: OrderFilters = { ...filters, review: false };
    return list.filter((po) => po.needsReview && matchesFilters(po, f)).length;
  }, [list, filters]);
  const toReview = useMemo(() => (list ?? []).filter((po) => po.needsReview), [list]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, po) => ({
          units: acc.units + (Number(po.totalQuantity) || 0),
          amount: acc.amount + (Number(po.totalAmount) || 0),
        }),
        { units: 0, amount: 0 },
      ),
    [filtered],
  );

  const filtering = hasActiveFilters(filters);
  const clearAll = () => {
    setSearchText("");
    pushed.current = "";
    update(clearedFilters(filters));
  };
  const setView = (view: View) => update({ view, due: view === "archived" ? "" : filters.due });

  const archived = filters.view === "archived";
  const subtitle = list
    ? archived
      ? pluralize(list.length, "archived order")
      : pluralize(list.length, "order")
    : " ";

  // --- Body ------------------------------------------------------------------
  let body: ReactNode;
  if (query.isError) {
    body = (
      <ErrorState
        title="Couldn't load purchase orders"
        error={query.error}
        action={<Button onClick={() => query.refetch()}>Try Again</Button>}
      />
    );
  } else if (!list) {
    body = isDesktop ? <OrdersTableSkeleton /> : <OrdersListSkeleton />;
  } else if (list.length === 0 && archived) {
    body = (
      <EmptyState
        icon={Archive}
        title="No archived orders"
        description="Archived purchase orders are kept safely out of the way, and you can restore them anytime."
        action={
          <Button variant="tinted" onClick={() => setView("active")}>
            Show Active Orders
          </Button>
        }
      />
    );
  } else if (list.length === 0) {
    body = (
      <EmptyState
        icon={FileText}
        title="No purchase orders yet"
        description="Create your first purchase order and it will show up here."
        action={
          <Button asChild>
            <Link href="/purchase-orders/new">
              <Plus strokeWidth={2.5} />
              New Purchase Order
            </Link>
          </Button>
        }
      />
    );
  } else if (filtered.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title="No matching orders"
        description={noMatchText(filters)}
        action={<Button onClick={clearAll}>Clear Filters</Button>}
      />
    );
  } else if (isDesktop) {
    body = (
      <OrdersTable
        orders={filtered}
        filters={filters}
        onSort={(sort) => update({ sort })}
        limit={limit}
        onShowMore={() => setLimit((n) => n + PAGE_SIZE)}
        actions={actions}
      />
    );
  } else {
    body = (
      <OrdersList
        orders={filtered}
        filters={filters}
        limit={limit}
        onShowMore={() => setLimit((n) => n + PAGE_SIZE)}
      />
    );
  }

  const showFilters = !list || list.length > 0;

  return (
    <>
      <PageHeader
        title="Purchase Orders"
        subtitle={subtitle}
        width="wide"
        actions={
          <>
            <div className="flex items-center md:hidden">
              <MoreMenu orders={filtered} />
              <Button variant="plain" size="icon" asChild>
                <Link href="/purchase-orders/new" aria-label="New Purchase Order">
                  <Plus className="!h-[22px] !w-[22px]" strokeWidth={2.25} />
                </Link>
              </Button>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <ExportMenu orders={filtered} />
              <Button size="sm" asChild>
                <Link href="/purchase-orders/new">
                  <Plus strokeWidth={2.5} />
                  New Purchase Order
                </Link>
              </Button>
            </div>
          </>
        }
      />
      <PageContainer width="wide" className="pt-3 lg:pt-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative md:flex-1">
            <SearchField
              ref={searchRef}
              value={searchText}
              onChange={setSearchText}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (searchText) setSearchText("");
                  else e.currentTarget.blur();
                } else if (e.key === "Enter") {
                  // Search right away. Desktop: jump to the first result (Enter again opens it).
                  // Phone: dismiss the keyboard so the results are visible.
                  e.preventDefault();
                  commitSearch();
                  if (isDesktop) {
                    window.setTimeout(() => document.querySelector<HTMLElement>("tbody tr[tabindex]")?.focus(), 30);
                  } else {
                    e.currentTarget.blur();
                  }
                }
              }}
              placeholder="Search PO #, style, color, address"
              aria-label="Search purchase orders"
            />
            {!searchText && !searchFocused && (
              <kbd
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-[5px] border border-border bg-card px-1.5 font-sans text-[11px] font-medium text-muted-foreground md:flex"
              >
                /
              </kbd>
            )}
          </div>
          <SegmentedControl
            aria-label="Show active or archived orders"
            value={filters.view}
            onChange={setView}
            options={VIEW_OPTIONS}
            className="md:w-56"
          />
        </div>

        {showFilters && (
          <div className="mt-1.5 md:mt-3">
            <FilterChips
              filters={filters}
              onChange={update}
              onOpenFilters={() => setSheetOpen(true)}
              statusCounts={statusCounts}
              dueCounts={dueCounts}
              reviewCount={filters.view === "active" ? reviewCount : 0}
            />
          </div>
        )}

        {filters.review && filters.view === "active" && toReview.length > 0 && (
          <div className="mt-3">
            <ReviewOlderOrders orders={toReview} showReviewLink={false} />
          </div>
        )}

        {list && list.length > 0 && (
          <div className="mb-2 mt-1 flex min-h-8 items-center justify-between gap-3 px-1 md:mt-2 md:px-1">
            <p className="min-w-0 truncate text-[13px] tabular-nums text-muted-foreground" aria-live="polite">
              {pluralize(filtered.length, "order")} · {formatNumber(totals.units)} units · {formatMoney(totals.amount)}
            </p>
            {filtering && (
              <Button
                variant="plain"
                size="sm"
                className="-my-1.5 -mr-2 h-11 shrink-0 px-2 text-[15px] md:my-0 md:h-8 md:text-[13px]"
                onClick={clearAll}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        <div className={list && list.length > 0 ? undefined : "mt-4"}>{body}</div>
      </PageContainer>

      <FiltersSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        filters={filters}
        onChange={update}
        resultCount={list ? filtered.length : undefined}
      />
    </>
  );
}
