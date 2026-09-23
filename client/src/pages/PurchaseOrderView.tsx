/**
 * Purchase order detail (/purchase-orders/:id) — Apple Contacts/Wallet-style detail view.
 *
 * Phones: quick action tiles, status, summary, the document, notes and history, stacked.
 * Tablet / small laptop (md+): status + summary beside notes + history, document below.
 * Desktop (xl+): the document on the left; a sticky column with status, summary, notes and
 * history on the right. Actions live in the nav bar (toolbar on md+, "Edit" + ••• on phones).
 * Keyboard (desktop): E edits, ⌘P / Ctrl+P prints the PO document.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useRoute } from "wouter";
import { DEFAULT_SETTINGS, type AppSettings, type PurchaseOrder } from "@shared/po";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/common";
import { ArchivedBadge, StatusBadge } from "@/components/StatusBadge";
import PODocument from "@/components/po/PODocument";
import { PONavActions, POQuickActions, usePOActions, type POActionsApi } from "@/components/po/POActions";
import { RevisionTimeline } from "@/components/po/RevisionTimeline";
import { UnsavedEditBanner } from "@/components/po/UnsavedEditBanner";
import {
  ArchivedBanner,
  DetailSkeleton,
  NotesSection,
  StatusSection,
  SummarySection,
} from "@/components/po/detail-sections";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePurchaseOrder, useSettings } from "@/lib/api";
import { documentFromPurchaseOrder } from "@/lib/document";
import { firstLine } from "@/lib/format";

type Layout = "phone" | "tablet" | "desktop";

/**
 * phone: one column. tablet (md+): info lists side by side, document below.
 * desktop (xl+): document beside a sticky info column — it needs room to stay readable.
 */
function useLayout(): Layout {
  const desktop = useMediaQuery("(min-width: 1280px)");
  const tablet = useMediaQuery("(min-width: 768px)");
  return desktop ? "desktop" : tablet ? "tablet" : "phone";
}

function isNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /not found|invalid id|^404/i.test(message);
}

export default function PurchaseOrderView() {
  const [, params] = useRoute("/purchase-orders/:id");
  const rawId = params?.id ?? "";
  const id = /^\d+$/.test(rawId) ? rawId : undefined;
  const query = usePurchaseOrder(id);
  const { data: settings } = useSettings();
  const layout = useLayout();

  // While a permanent delete settles, keep showing the order instead of flashing "not found".
  const [held, setHeld] = useState<PurchaseOrder | null>(null);
  const po = query.data ?? (held && String(held.id) === id ? held : undefined);

  if (!id || (!po && query.isError && isNotFound(query.error))) {
    return <NotFound />;
  }

  if (!po && query.isError) {
    return (
      <>
        <PageHeader title="Purchase Order" backHref="/purchase-orders" backLabel="Orders" largeTitle={false} />
        <PageContainer>
          <ErrorState
            title="Couldn't load this purchase order"
            error={query.error}
            action={
              <>
                <Button onClick={() => query.refetch()}>Try Again</Button>
                <Button variant="tinted" asChild>
                  <Link href="/purchase-orders">Back to Orders</Link>
                </Button>
              </>
            }
          />
        </PageContainer>
      </>
    );
  }

  if (!po) {
    return (
      <>
        <PageHeader
          title={<Skeleton className="h-9 w-44 rounded-lg" />}
          compactTitle="Purchase Order"
          meta={<Skeleton className="h-[22px] w-28 rounded-full" />}
          backHref="/purchase-orders"
          backLabel="Orders"
          width="wide"
        />
        <PageContainer width="wide">
          <DetailSkeleton layout={layout} />
        </PageContainer>
      </>
    );
  }

  return (
    <PODetail
      key={po.id}
      po={po}
      settings={settings}
      layout={layout}
      onDeleteStart={() => setHeld(po)}
      onDeleteEnd={() => setHeld(null)}
    />
  );
}

// ---------------------------------------------------------------------------
// Loaded
// ---------------------------------------------------------------------------

function PODetail({
  po,
  settings,
  layout,
  onDeleteStart,
  onDeleteEnd,
}: {
  po: PurchaseOrder;
  settings: AppSettings | undefined;
  layout: Layout;
  onDeleteStart: () => void;
  onDeleteEnd: () => void;
}) {
  const { api, dialogs } = usePOActions(po, settings, { onDeleteStart, onDeleteEnd });
  const data = useMemo(() => documentFromPurchaseOrder(po), [po]);
  const title = `PO #${po.poNumber}`;
  const customer = firstLine(po.shipTo);
  useShortcuts(api);

  const meta = (
    <>
      <StatusBadge status={po.status} />
      {po.archivedAt && <ArchivedBadge />}
      {po.poType && <span className="text-[15px] text-muted-foreground md:text-sm">{po.poType}</span>}
    </>
  );

  const document = <PODocument data={data} settings={settings ?? DEFAULT_SETTINGS} />;
  const status = <StatusSection po={po} />;
  const summary = <SummarySection po={po} />;
  const notes = po.notes?.trim() ? <NotesSection notes={po.notes} /> : null;
  const history = <RevisionTimeline poId={po.id} settings={settings} />;
  const documentSection = (
    <section aria-label="Purchase order document" className="space-y-1.5">
      <h2 className="px-4 text-[13px] font-normal uppercase tracking-[0.02em] text-muted-foreground">Document</h2>
      {document}
    </section>
  );

  return (
    <>
      <PageHeader
        title={title}
        subtitle={customer || undefined}
        meta={meta}
        backHref="/purchase-orders"
        backLabel="Orders"
        actions={<PONavActions actions={api} />}
        width="wide"
      />
      <PageContainer width="wide" className="space-y-6">
        <UnsavedEditBanner key={po.id} poId={po.id} />
        {api.archived && (
          <ArchivedBanner onRestore={api.restore} onDelete={api.requestDelete} restoring={api.restoring} />
        )}
        {layout === "desktop" ? (
          <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0">{document}</div>
            <StickyColumn>
              {status}
              {summary}
              {notes}
              {history}
            </StickyColumn>
          </div>
        ) : layout === "tablet" ? (
          <>
            <div className="grid grid-cols-2 items-start gap-6">
              <div className="min-w-0 space-y-6">
                {status}
                {summary}
              </div>
              <div className="min-w-0 space-y-6">
                {notes}
                {history}
              </div>
            </div>
            {documentSection}
          </>
        ) : (
          <div className="space-y-6">
            <POQuickActions actions={api} />
            {status}
            {summary}
            {documentSection}
            {notes}
            {history}
          </div>
        )}
      </PageContainer>
      {dialogs}
    </>
  );
}

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

function NotFound() {
  return (
    <>
      <PageHeader title="Purchase Order" backHref="/purchase-orders" backLabel="Orders" largeTitle={false} />
      <PageContainer>
        <ErrorState
          title="This purchase order doesn't exist"
          error="It may have been deleted. Deleted orders can be recovered from Recently Deleted in Settings."
          action={
            <>
              <Button asChild>
                <Link href="/purchase-orders">Back to Orders</Link>
              </Button>
              <Button variant="tinted" asChild>
                <Link href="/settings#deleted">Recently Deleted</Link>
              </Button>
            </>
          }
        />
      </PageContainer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Nav bar (52px) + breathing room. */
const STICKY_TOP = 68;

/**
 * Side column that stays in view while the document scrolls. When it's taller than the window
 * it scrolls along until its end is visible, then sticks — no nested scroll area.
 */
function StickyColumn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [top, setTop] = useState(STICKY_TOP);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setTop(Math.min(STICKY_TOP, window.innerHeight - el.offsetHeight - 24));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <aside ref={ref} className="sticky min-w-0 space-y-6" style={{ top }}>
      {children}
    </aside>
  );
}


/** Desktop keyboard shortcuts: E edits, ⌘P / Ctrl+P prints the PO (not the web page). */
function useShortcuts(api: POActionsApi) {
  const latest = useRef(api);
  latest.current = api;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      // Leave shortcuts alone while a dialog, sheet or menu is open.
      if (document.querySelector("[role='dialog'], [role='alertdialog'], [role='menu']")) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === "p" && !e.shiftKey) {
        e.preventDefault();
        latest.current.printPdf();
      } else if (!e.metaKey && !e.ctrlKey && !e.shiftKey && key === "e") {
        e.preventDefault();
        latest.current.edit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
