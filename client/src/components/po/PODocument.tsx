import type { ReactNode } from "react";
import { PackageOpen } from "lucide-react";
import { DEFAULT_SETTINGS, PO_STATUS_LABELS, lineTotal, type AppSettings } from "@shared/po";
import type { PODocumentData } from "@/lib/document";
import { formatDate, formatMoney, formatNumber, formatUnitPrice, pluralize } from "@/lib/format";
import { STATUS_STYLES } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export interface PODocumentProps {
  data: PODocumentData;
  settings: AppSettings;
  className?: string;
}

// The sheet adapts to its own width (CSS container queries), not the viewport, so it lays out
// correctly in the detail page's main column, the editor's live preview and history sheets alike.
//   ≥ 30rem  letterhead and PO number side by side, Ship To / Bill To side by side
//   ≥ 40rem  roomier padding, five-column meta row, line items as a table
// Note: the wrapper uses `container-type: inline-size`, so give it a definite width (block
// flow, grid track or flex-1) — never shrink-to-fit.

/** Small uppercase section label ("SHIP TO"). */
const EYEBROW = "text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground";

function Dash() {
  return (
    <>
      <span aria-hidden className="text-muted-foreground/60">
        —
      </span>
      <span className="sr-only">Not set</span>
    </>
  );
}

function orDash(value: string | null | undefined): ReactNode {
  const text = (value ?? "").trim();
  return text ? text : <Dash />;
}

function Rule() {
  return <hr className="my-6 h-px border-0 hairline-b [@container_(min-width:40rem)]:my-8" />;
}

/** Paper-style, responsive on-screen rendering of a purchase order. */
export default function PODocument({ data, settings, className }: PODocumentProps) {
  const company = settings?.company ?? DEFAULT_SETTINGS.company;
  const companyName = company.name?.trim() ?? "";
  const address = company.address?.trim() ?? "";
  const email = company.email?.trim() ?? "";
  const phone = company.phone?.trim() ?? "";
  const footer = settings?.documentFooter?.trim() ?? "";
  const items = data.items ?? [];
  const instructions = data.specialInstructions?.trim() ?? "";
  const flag = data.status === "draft" || data.status === "cancelled" ? data.status : null;
  const poNumber = data.poNumber?.trim() ?? "";

  const meta: Array<{ label: string; value: string; className?: string }> = [
    { label: "Order date", value: formatDate(data.orderDate) },
    { label: "PO type", value: data.poType },
    // On narrow sheets terms go last so the two ship dates share a row.
    { label: "Payment terms", value: data.terms, className: "order-last [@container_(min-width:40rem)]:order-none" },
    { label: "Start ship", value: formatDate(data.startShipDate) },
    { label: "Cancel date", value: formatDate(data.cancelDate) },
  ];

  return (
    <div className={cn("rounded-2xl bg-card text-card-foreground [container-type:inline-size]", className)}>
      <article
        aria-label={poNumber ? `Purchase order ${poNumber}` : "Purchase order"}
        className="p-5 [@container_(min-width:40rem)]:p-10"
      >
        {/* Letterhead + PO number */}
        <header className="flex flex-col gap-5 [@container_(min-width:30rem)]:flex-row [@container_(min-width:30rem)]:items-start [@container_(min-width:30rem)]:justify-between [@container_(min-width:30rem)]:gap-8">
          <div className="min-w-0">
            {companyName && <p className="text-title-2 [overflow-wrap:anywhere]">{companyName}</p>}
            {(address || email || phone) && (
              <div className="mt-1.5 space-y-0.5 text-[13px] leading-[18px] text-muted-foreground [overflow-wrap:anywhere]">
                {address && <p className="whitespace-pre-line">{address}</p>}
                {email && <p>{email}</p>}
                {phone && <p className="tabular-nums">{phone}</p>}
              </div>
            )}
          </div>

          <div className="min-w-0 shrink-0 [@container_(min-width:30rem)]:max-w-[55%] [@container_(min-width:30rem)]:text-right">
            <h2>
              <span className="block text-[11px] font-semibold uppercase leading-4 tracking-[0.12em] text-primary">
                Purchase Order
              </span>
              <span className="mt-1 block text-[28px] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums [overflow-wrap:anywhere]">
                {poNumber ? `#${poNumber}` : <span className="text-muted-foreground/50">#—</span>}
              </span>
            </h2>
            {flag && (
              <span
                className={cn(
                  "mt-2.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase leading-none tracking-[0.08em]",
                  STATUS_STYLES[flag].badge,
                )}
              >
                {PO_STATUS_LABELS[flag]}
              </span>
            )}
          </div>
        </header>

        <Rule />

        {/* Order details */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 [@container_(min-width:40rem)]:grid-cols-5 [@container_(min-width:40rem)]:gap-x-6">
          {meta.map((m) => (
            <div key={m.label} className={cn("min-w-0", m.className)}>
              <dt className="text-[13px] leading-[18px] text-muted-foreground">{m.label}</dt>
              <dd className="mt-0.5 text-[15px] font-medium leading-5 [overflow-wrap:anywhere]">{orDash(m.value)}</dd>
            </div>
          ))}
        </dl>

        <Rule />

        {/* Ship To (left) / Bill To (right) */}
        <div className="grid gap-5 [@container_(min-width:30rem)]:grid-cols-2 [@container_(min-width:30rem)]:gap-8">
          <AddressBlock label="Ship To" value={data.shipTo} />
          <AddressBlock label="Bill To" value={data.billTo} />
        </div>

        {instructions && (
          <section className="mt-6 rounded-xl bg-muted px-4 py-3.5 [@container_(min-width:40rem)]:mt-8 [@container_(min-width:40rem)]:px-5 [@container_(min-width:40rem)]:py-4">
            <h3 className={EYEBROW}>Special Instructions</h3>
            <p className="mt-1.5 whitespace-pre-line text-[15px] leading-[22px] [overflow-wrap:anywhere]">{instructions}</p>
          </section>
        )}

        {/* Line items */}
        <section aria-label="Line items" className="mt-8 [@container_(min-width:40rem)]:mt-10">
          {items.length === 0 ? <NoItems /> : <Items items={items} />}
        </section>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <dl className="w-full text-[15px] [@container_(min-width:30rem)]:w-72 [@container_(min-width:40rem)]:w-80">
            <div className="flex items-baseline justify-between gap-4 py-1.5 [@container_(min-width:40rem)]:px-3">
              <dt className="text-muted-foreground">Total units</dt>
              <dd className="font-medium tabular-nums">{formatNumber(data.totalQuantity)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4 pt-3 hairline-t [@container_(min-width:40rem)]:px-3">
              <dt className="font-semibold">
                Total <span className="ml-0.5 text-[12px] font-normal text-muted-foreground">USD</span>
              </dt>
              <dd className="text-title-2 tabular-nums">{formatMoney(data.totalAmount)}</dd>
            </div>
          </dl>
        </div>

        {footer && (
          <footer className="mt-8 whitespace-pre-line pt-4 text-[13px] leading-[18px] text-muted-foreground hairline-t [overflow-wrap:anywhere] [@container_(min-width:40rem)]:mt-10">
            {footer}
          </footer>
        )}
      </article>
    </div>
  );
}

function AddressBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="min-w-0">
      <h3 className={EYEBROW}>{label}</h3>
      <p className="mt-1.5 whitespace-pre-line text-[15px] leading-[22px] [overflow-wrap:anywhere]">{orDash(value)}</p>
    </section>
  );
}

function NoItems() {
  return (
    <div className="flex flex-col items-center rounded-xl bg-muted px-6 py-8 text-center">
      <PackageOpen className="h-7 w-7 text-muted-foreground/70" strokeWidth={1.75} aria-hidden />
      <p className="mt-2 text-[15px] font-semibold">No items yet</p>
      <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">Line items you add will show up here.</p>
    </div>
  );
}

type Item = PODocumentData["items"][number];

const TH = "whitespace-nowrap bg-muted px-3 py-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted-foreground first:rounded-l-lg last:rounded-r-lg";
const TD = "px-3 py-3 align-top hairline-b";

/**
 * Text for an auto-sized table column that keeps ordinary words on one line ("SL3100-BLK", "Ivory")
 * but still wraps a very long unbroken value instead of widening the sheet. The visible text may
 * break anywhere, so it doesn't set the column's minimum width; the invisible zero-height strut
 * does: its longest word, capped at `cap` (container units, so the caps shrink with the sheet).
 */
function CellText({ cap, children }: { cap: string; children: ReactNode }) {
  return (
    <>
      <span aria-hidden className="invisible block h-0 select-none overflow-hidden break-words" style={{ maxWidth: cap }}>
        {children}
      </span>
      <span className="[overflow-wrap:anywhere]">{children}</span>
    </>
  );
}

function Items({ items }: { items: Item[] }) {
  return (
    <>
      {/* Wide sheets: an Apple Numbers–style table */}
      <table className="hidden w-full border-separate border-spacing-0 text-left text-[14px] leading-5 [@container_(min-width:40rem)]:table">
        <thead>
          <tr>
            <th scope="col" className={TH}>Style #</th>
            <th scope="col" className={TH}>Color</th>
            <th scope="col" className={TH}>Description</th>
            <th scope="col" className={cn(TH, "text-right")}>Qty</th>
            <th scope="col" className={cn(TH, "text-right")}>Unit Price</th>
            <th scope="col" className={cn(TH, "text-right")}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td className={cn(TD, "font-semibold")}>
                <CellText cap="16cqi">{orDash(item.styleNumber)}</CellText>
              </td>
              <td className={TD}>
                <CellText cap="12cqi">{orDash(item.color)}</CellText>
              </td>
              <td className={cn(TD, "min-w-[14cqi] whitespace-pre-line text-foreground/80 [overflow-wrap:anywhere]")}>
                {orDash(item.description)}
              </td>
              <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{formatNumber(item.quantity)}</td>
              <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{formatUnitPrice(item.price)}</td>
              <td className={cn(TD, "whitespace-nowrap text-right font-medium tabular-nums")}>
                {formatMoney(lineTotal(item))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Narrow sheets (phones): stacked rows */}
      <div className="[@container_(min-width:40rem)]:hidden">
        <div className="flex items-baseline justify-between gap-3 pb-2 hairline-b">
          <h3 className={EYEBROW}>Items</h3>
          <span className="text-[13px] text-muted-foreground">{pluralize(items.length, "line")}</span>
        </div>
        <ul>
          {items.map((item, i) => {
            const detail = [item.color?.trim(), item.description?.trim()].filter(Boolean).join(" · ");
            return (
              <li key={i} className="py-3 hairline-b">
                <p className="text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{orDash(item.styleNumber)}</p>
                <p className="mt-0.5 whitespace-pre-line text-[13px] leading-[18px] text-muted-foreground [overflow-wrap:anywhere]">
                  {detail || <Dash />}
                </p>
                <div className="mt-1.5 flex items-baseline justify-between gap-3 tabular-nums">
                  <span className="text-[13px] text-muted-foreground">
                    {formatNumber(item.quantity)} × {formatUnitPrice(item.price)}
                  </span>
                  <span className="text-[15px] font-medium">{formatMoney(lineTotal(item))}</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
