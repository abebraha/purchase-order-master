import type { KeyboardEvent, MouseEvent, ReactNode, SyntheticEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleDot,
  Clock,
  Copy,
  Download,
  Ellipsis,
  FileText,
  Pencil,
} from "lucide-react";
import { PO_STATUSES, PO_STATUS_LABELS, type PurchaseOrder } from "@shared/po";
import { StatusBadge, StatusDot } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { firstLine, formatDate, formatMoney, formatNumber } from "@/lib/format";
import { isDueSoon, isOverdue, type OrderFilters, type OrderSort } from "@/lib/filters";
import { cn } from "@/lib/utils";
import type { POActions } from "./usePOActions";
import { cancelDateHint, formatShipWindow } from "./utils";

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/**
 * Which widths show a column. The content area next to the 260px sidebar is only ≈700px at
 * 1024 and ≈956px at 1280, so columns come in as room allows:
 *   - below xl (1280): Ship To folds under the PO # as a second line; no Type / Units.
 *   - xl (1280–1439):  Ship To gets its own flexible column (≥ 240px).
 *   - 1440 and up:     Type and Units join (Ship To keeps ≥ 210px).
 */
type Tier = "xl" | "wide";

const TIER_COL: Record<Tier, string> = { xl: "hidden xl:table-column", wide: "hidden min-[1440px]:table-column" };
const TIER_CELL: Record<Tier, string> = { xl: "hidden xl:table-cell", wide: "hidden min-[1440px]:table-cell" };

interface Column {
  key: string;
  label: string;
  /** Width classes for the <col>; omit for a flexible column. */
  width?: string;
  align?: "right";
  /** Only shown from this width up (see Tier); always shown when omitted. */
  tier?: Tier;
  /** Sort chosen by clicking the header; "date" toggles newest/oldest. */
  sort?: OrderSort | "date";
}

const COLUMNS: Column[] = [
  // Flexible below xl, where it also carries the folded Ship To line.
  { key: "po", label: "PO #", width: "xl:w-[124px]", sort: "po" },
  // Fixed widths fit their longest usual content ("In Production", "Regular PO", "Sep 23, 2026").
  { key: "status", label: "Status", width: "w-[136px]" },
  { key: "type", label: "Type", width: "w-[108px]", tier: "wide" },
  { key: "ordered", label: "Ordered", width: "w-[120px]", sort: "date" },
  { key: "ship", label: "Ship Window", width: "w-[160px] xl:w-[176px]", sort: "cancel" },
  { key: "shipTo", label: "Ship To", tier: "xl" },
  { key: "units", label: "Units", width: "w-[80px]", align: "right", tier: "wide" },
  { key: "total", label: "Total", width: "w-[116px]", align: "right", sort: "amount" },
  { key: "menu", label: "", width: "w-[44px]" },
];

const STICKY_TOP = "top-[calc(52px+env(safe-area-inset-top))]";

function cellPad(i: number, total: number) {
  return cn("px-3", i === 0 && "pl-5", i === total - 1 && "pl-1 pr-2");
}

function Colgroup() {
  return (
    <colgroup>
      {COLUMNS.map((c) => (
        <col key={c.key} className={cn(c.width, c.tier && TIER_COL[c.tier])} />
      ))}
    </colgroup>
  );
}

function HeaderRow({ filters, onSort }: { filters?: OrderFilters; onSort?: (sort: OrderSort) => void }) {
  return (
    <tr>
      {COLUMNS.map((c, i) => {
        const active =
          filters &&
          (c.sort === "date" ? filters.sort === "newest" || filters.sort === "oldest" : c.sort === filters.sort);
        const ascending =
          filters && (c.sort === "date" ? filters.sort === "oldest" : c.sort === "po" || c.sort === "cancel");
        const next: OrderSort | undefined =
          c.sort === "date" ? (filters?.sort === "newest" ? "oldest" : "newest") : c.sort;
        return (
          <th
            key={c.key}
            scope="col"
            aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
            className={cn(
              "sticky z-10 h-9 whitespace-nowrap bg-card align-middle text-[12px] font-medium text-muted-foreground shadow-[inset_0_-0.5px_0_hsl(var(--border))]",
              STICKY_TOP,
              cellPad(i, COLUMNS.length),
              c.align === "right" ? "text-right" : "text-left",
              c.tier && TIER_CELL[c.tier],
            )}
          >
            {c.key === "menu" ? (
              <span className="sr-only">Actions</span>
            ) : c.sort && onSort && next ? (
              <button
                type="button"
                onClick={() => onSort(next)}
                className={cn(
                  "relative -mx-1 inline-flex items-center rounded px-1 align-middle leading-4 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                  active && "text-foreground",
                )}
                title={`Sort by ${c.label.toLowerCase()}`}
              >
                {c.label}
                {active && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 text-primary",
                      c.align === "right" ? "-left-3.5" : "-right-3.5",
                    )}
                  >
                    {ascending ? (
                      <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
                    )}
                  </span>
                )}
              </button>
            ) : (
              <span className="inline-block align-middle leading-4">{c.label}</span>
            )}
          </th>
        );
      })}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

function ShipWindow({ po }: { po: PurchaseOrder }) {
  const text = formatShipWindow(po.startShipDate, po.cancelDate);
  const overdue = isOverdue(po);
  const soon = !overdue && isDueSoon(po);
  if (!overdue && !soon) return <span className="text-foreground">{text}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1 font-medium",
            overdue ? "text-destructive" : "text-[hsl(28_100%_38%)] dark:text-ios-orange",
          )}
        >
          {overdue ? (
            <CircleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          ) : (
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          )}
          <span className="truncate">{text}</span>
          <span className="sr-only">({cancelDateHint(po.cancelDate)})</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{cancelDateHint(po.cancelDate)}</TooltipContent>
    </Tooltip>
  );
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

function RowMenu({ po, actions }: { po: PurchaseOrder; actions: POActions }) {
  return (
    <DropdownMenu modal={false}>
      {/* Same row "•••" button as the Styles table. */}
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for PO #${po.poNumber}`}
          className="text-muted-foreground opacity-60 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
        >
          <Ellipsis className="!h-5 !w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => actions.open(po)}>
          <FileText />
          Open
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.edit(po)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(po)}>
          <Copy />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void actions.downloadPdf(po)}>
          <Download />
          Download PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <CircleDot />
            Change Status
          </DropdownMenuSubTrigger>
          {/* Same rows as the Status menu on the order's page: check for the current status, dot trailing. */}
          <DropdownMenuSubContent className="min-w-[13.5rem] p-1.5">
            {PO_STATUSES.map((s) => {
              const current = s === po.status;
              return (
                <DropdownMenuItem
                  key={s}
                  role="menuitemradio"
                  aria-checked={current}
                  onSelect={() => actions.changeStatus(po, s)}
                  className={cn(current && "font-semibold")}
                >
                  <Check
                    className={cn("!h-4 !w-4 text-primary", current ? "opacity-100" : "opacity-0")}
                    strokeWidth={2.75}
                    aria-hidden
                  />
                  <span className="flex-1">{PO_STATUS_LABELS[s]}</span>
                  <StatusDot status={s} className="h-2.5 w-2.5" />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {po.archivedAt ? (
          <DropdownMenuItem onSelect={() => actions.restore(po)}>
            <ArchiveRestore />
            Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => actions.archive(po)}>
            <Archive />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({ po, actions }: { po: PurchaseOrder; actions: POActions }) {
  const [, navigate] = useLocation();
  const href = `/purchase-orders/${po.id}`;
  const shipTo = firstLine(po.shipTo);
  const total = formatMoney(po.totalAmount);

  const onClick = (e: MouseEvent<HTMLTableRowElement>) => {
    if (window.getSelection()?.toString()) return; // let people select text
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
    else navigate(href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter") {
      e.preventDefault();
      navigate(href);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sibling = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      (sibling as HTMLElement | null)?.focus();
    }
  };

  const cells: Record<string, ReactNode> = {
    po: (
      <>
        <Link
          href={href}
          onClick={stop}
          tabIndex={-1}
          className="block truncate font-semibold text-foreground outline-none hover:text-primary"
          title={po.poNumber.length > 10 ? po.poNumber : undefined}
        >
          {po.poNumber || "—"}
        </Link>
        <span
          className="mt-0.5 block truncate text-[12px] leading-4 text-muted-foreground xl:hidden"
          title={po.shipTo || undefined}
        >
          {shipTo || "No ship-to address"}
        </span>
      </>
    ),
    status: <StatusBadge status={po.status} />,
    type: <span className="block truncate text-muted-foreground">{po.poType || "—"}</span>,
    ordered: <span className="block truncate">{formatDate(po.orderDate) || "—"}</span>,
    ship: <ShipWindow po={po} />,
    shipTo: (
      <span className={cn("block truncate", !shipTo && "text-muted-foreground")} title={po.shipTo || undefined}>
        {shipTo || "No ship-to address"}
      </span>
    ),
    units: <span className="block truncate tabular-nums text-muted-foreground">{formatNumber(po.totalQuantity)}</span>,
    total: (
      <span className="block truncate font-medium tabular-nums" title={total.length > 12 ? total : undefined}>
        {total}
      </span>
    ),
    menu: (
      <div onClick={stop} onKeyDown={stop} className="flex justify-end">
        <RowMenu po={po} actions={actions} />
      </div>
    ),
  };

  return (
    <tr
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={`PO #${po.poNumber}, ${PO_STATUS_LABELS[po.status] ?? po.status}, ${formatMoney(po.totalAmount)}`}
      className="group cursor-pointer outline-none transition-colors duration-100 hover:bg-accent/60 focus-visible:bg-primary/[0.08] active:bg-accent [&:last-child>td]:after:hidden"
    >
      {COLUMNS.map((c, i) => (
        <td
          key={c.key}
          className={cn(
            "relative h-[52px] whitespace-nowrap text-[14px]",
            // hairline row separator, inset like the rest of the app
            "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-border/70",
            i === 0 && "after:left-5",
            cellPad(i, COLUMNS.length),
            c.align === "right" && "text-right",
            c.tier && TIER_CELL[c.tier],
          )}
        >
          {cells[c.key]}
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

const cardClass = "overflow-clip rounded-2xl bg-card";

/** Desktop layout: a clean, Numbers-like table with a sticky header and sortable columns. */
export function OrdersTable({
  orders,
  filters,
  onSort,
  limit,
  onShowMore,
  actions,
}: {
  orders: PurchaseOrder[];
  filters: OrderFilters;
  onSort: (sort: OrderSort) => void;
  limit: number;
  onShowMore: () => void;
  actions: POActions;
}) {
  const visible = orders.slice(0, limit);
  const remaining = orders.length - visible.length;
  return (
    <div className={cardClass}>
      <table className="w-full table-fixed border-separate border-spacing-0">
        <caption className="sr-only">Purchase orders</caption>
        <Colgroup />
        <thead>
          <HeaderRow filters={filters} onSort={onSort} />
        </thead>
        <tbody>
          {visible.map((po) => (
            <Row key={po.id} po={po} actions={actions} />
          ))}
        </tbody>
      </table>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onShowMore}
          className="flex h-12 w-full items-center justify-center gap-2 text-[14px] font-medium text-primary outline-none transition-colors hairline-t hover:bg-accent/60 focus-visible:bg-accent"
        >
          Show More
          <span className="font-normal text-muted-foreground">
            · {visible.length.toLocaleString("en-US")} of {orders.length.toLocaleString("en-US")}
          </span>
        </button>
      )}
    </div>
  );
}

export function OrdersTableSkeleton() {
  return (
    <div className={cardClass} aria-busy="true" aria-label="Loading purchase orders">
      <table className="w-full table-fixed border-separate border-spacing-0">
        <Colgroup />
        <thead>
          <HeaderRow />
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, r) => (
            <tr key={r}>
              {COLUMNS.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    "h-[52px]",
                    cellPad(i, COLUMNS.length),
                    c.tier && TIER_CELL[c.tier],
                    r < 7 && "shadow-[inset_0_-0.5px_0_hsl(var(--border))]",
                  )}
                >
                  {c.key === "menu" ? null : c.key === "status" ? (
                    <Skeleton className="h-5 w-24 rounded-full" />
                  ) : (
                    <Skeleton
                      className={cn(
                        "h-3.5 rounded-md",
                        c.key === "shipTo" ? "w-3/5" : "w-4/5",
                        c.align === "right" && "ml-auto w-3/5",
                      )}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
