/**
 * "History" — every change to a purchase order, newest first. Each row opens that exact
 * version of the document (and can download it as a PDF), so nothing is ever lost.
 */
import { useMemo, useState } from "react";
import {
  differenceInCalendarDays,
  differenceInHours,
  differenceInMinutes,
  format,
  isSameYear,
} from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowRightLeft,
  Clock,
  Loader2,
  MonitorSmartphone,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_SETTINGS,
  REVISION_ACTION_LABELS,
  computeTotals,
  type AppSettings,
  type PORevision,
  type PurchaseOrder,
  type RevisionAction,
} from "@shared/po";
import PODocument from "@/components/po/PODocument";
import { usePdfActions } from "@/components/po/POActions";
import { IconTile, ListRow, ListSection, type IosColor } from "@/components/kit";
import { ResponsiveDialog } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useRevisions } from "@/lib/api";
import { documentFromPurchaseOrder, type PODocumentData } from "@/lib/document";
import { formatDateTime, parseDate } from "@/lib/format";

const VISIBLE_ROWS = 8;

const ACTION_STYLE: Record<RevisionAction, { icon: LucideIcon; color: IosColor }> = {
  created: { icon: Plus, color: "green" },
  updated: { icon: Pencil, color: "blue" },
  status: { icon: ArrowRightLeft, color: "orange" },
  archived: { icon: Archive, color: "gray" },
  restored: { icon: ArchiveRestore, color: "teal" },
  deleted: { icon: Trash2, color: "red" },
  recovered: { icon: RotateCcw, color: "green" },
  baseline: { icon: Clock, color: "gray" },
  external: { icon: MonitorSmartphone, color: "purple" },
};

// Apple title case: lowercase articles, short conjunctions and prepositions of ≤ 4 letters.
const MINOR_WORDS = new Set(["a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet", "as", "at", "by", "in", "of", "on", "to", "up", "from", "into", "onto", "with", "via"]);

function titleCase(text: string): string {
  const words = text.split(" ");
  return words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && i < words.length - 1 && MINOR_WORDS.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

export function revisionTitle(action: RevisionAction | string): string {
  if (action === "baseline") return "History Started";
  const label = REVISION_ACTION_LABELS[action as RevisionAction];
  return label ? titleCase(label) : titleCase(String(action));
}

/** "Just now", "12 min ago", "3 hr ago", "Yesterday", "4 days ago", "Sep 21", "Mar 4, 2025". */
export function formatWhen(iso: string): string {
  const d = parseDate(iso);
  if (!d) return "";
  const now = new Date();
  const minutes = differenceInMinutes(now, d);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const days = differenceInCalendarDays(now, d);
  if (days === 0) return `${differenceInHours(now, d)} hr ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return isSameYear(d, now) ? format(d, "MMM d") : format(d, "MMM d, yyyy");
}

function summaryLines(summary: string): string[] {
  return (summary ?? "")
    .split(/;\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Older snapshots may miss derived fields — fill them in so the document always renders. */
function documentFromSnapshot(snapshot: PurchaseOrder): PODocumentData {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const totals = computeTotals(items);
  return documentFromPurchaseOrder({
    ...snapshot,
    poNumber: snapshot?.poNumber ?? "",
    poType: snapshot?.poType ?? "",
    terms: snapshot?.terms ?? "",
    shipTo: snapshot?.shipTo ?? "",
    billTo: snapshot?.billTo ?? "",
    specialInstructions: snapshot?.specialInstructions ?? "",
    items,
    totalQuantity: typeof snapshot?.totalQuantity === "number" ? snapshot.totalQuantity : totals.totalQuantity,
    totalAmount: typeof snapshot?.totalAmount === "number" ? snapshot.totalAmount : totals.totalAmount,
  });
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function RevisionRow({ revision, current, onOpen }: { revision: PORevision; current: boolean; onOpen: () => void }) {
  const style = ACTION_STYLE[revision.action] ?? ACTION_STYLE.baseline;
  const lines = summaryLines(revision.summary);
  const shown = lines.slice(0, 4);
  const hidden = lines.length - shown.length;
  const title = revisionTitle(revision.action);

  return (
    <ListRow
      onClick={onOpen}
      leading={<IconTile icon={style.icon} color={style.color} variant="tinted" />}
      accessory="chevron"
      className="items-start [&>span:first-child]:mt-2 [&>svg:last-child]:mt-[13px] md:[&>svg:last-child]:mt-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[17px] leading-[22px] md:text-[15px] md:leading-5">{title}</span>
        <time
          dateTime={revision.createdAt}
          title={formatDateTime(revision.createdAt)}
          className="shrink-0 text-[15px] leading-5 text-muted-foreground tabular-nums md:text-[13px]"
        >
          {formatWhen(revision.createdAt)}
        </time>
      </div>
      {shown.map((line, i) => (
        <span key={i} className="mt-0.5 block break-words text-[15px] leading-5 text-muted-foreground md:text-[13px] md:leading-[18px]">
          {line}
        </span>
      ))}
      {hidden > 0 && (
        <span className="mt-0.5 block text-[15px] leading-5 text-muted-foreground md:text-[13px] md:leading-[18px]">
          and {hidden} more {hidden === 1 ? "change" : "changes"}
        </span>
      )}
      {current && (
        <span className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2 py-[3px] text-[11px] font-semibold leading-none text-primary dark:bg-primary/20">
          Current Version
        </span>
      )}
    </ListRow>
  );
}

// ---------------------------------------------------------------------------
// Version viewer
// ---------------------------------------------------------------------------

function VersionDialog({
  revision,
  open,
  current,
  settings,
  onOpenChange,
}: {
  revision: PORevision;
  open: boolean;
  current: boolean;
  settings: AppSettings | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const data = useMemo(() => documentFromSnapshot(revision.snapshot), [revision]);
  const pdf = usePdfActions(data, settings);
  // Phones get the button in the sheet's pinned footer; on desktop the dialog scrolls as a
  // whole, so the action goes above the document where it's always visible.
  const isDesktop = useIsDesktop();

  const download = (
    <Button onClick={pdf.downloadPdf} disabled={pdf.busy === "pdf"} size={isDesktop ? "sm" : "default"}>
      {pdf.busy === "pdf" ? <Loader2 className="animate-spin" aria-hidden /> : <ArrowDownToLine aria-hidden />}
      Download PDF of This Version
    </Button>
  );
  const note = current
    ? "This is the order as it is now."
    : "This is how the order looked after this change. It's kept in History, so nothing is ever lost.";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={current ? "Current Version" : "Earlier Version"}
      description={`${revisionTitle(revision.action)} · ${formatDateTime(revision.createdAt)}`}
      className="sm:max-w-4xl"
      footer={
        isDesktop ? undefined : (
          <>
            {download}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </>
        )
      }
    >
      {isDesktop ? (
        <div className="flex items-center justify-between gap-4 rounded-xl bg-primary/[0.08] py-2 pl-3.5 pr-2 dark:bg-primary/15">
          <p className="text-[13px] leading-snug text-foreground/80">{note}</p>
          {download}
        </div>
      ) : (
        !current && (
          <p className="mb-3 rounded-xl bg-primary/[0.08] px-3.5 py-2.5 text-[15px] leading-snug text-foreground/80 dark:bg-primary/15">
            {note}
          </p>
        )
      )}
      <PODocument data={data} settings={settings ?? DEFAULT_SETTINGS} />
    </ResponsiveDialog>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export function RevisionTimeline({
  poId,
  settings,
  className,
}: {
  poId: number;
  settings: AppSettings | undefined;
  className?: string;
}) {
  const { data: revisions, isLoading, isError, refetch } = useRevisions(poId);
  const [showAll, setShowAll] = useState(false);
  // The selected version stays mounted while the sheet animates closed.
  const [openId, setOpenId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const sorted = useMemo(
    () =>
      [...(revisions ?? [])].sort(
        (a, b) => (parseDate(b.createdAt)?.getTime() ?? 0) - (parseDate(a.createdAt)?.getTime() ?? 0) || b.id - a.id,
      ),
    [revisions],
  );
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_ROWS);
  const selected = sorted.find((r) => r.id === openId) ?? null;
  const currentId = sorted[0]?.id;

  return (
    <>
      <ListSection
        header="History"
        footer={sorted.length > 0 ? "Every change is saved automatically — open one to see that version." : undefined}
        className={className}
      >
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
              <Skeleton className="h-[29px] w-[29px] rounded-[7px]" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32 rounded-md" />
                <Skeleton className="h-3 w-48 rounded-md" />
              </div>
            </div>
          ))
        ) : isError ? (
          <ListRow
            onClick={() => refetch()}
            title="Couldn't load history"
            subtitle="Tap to try again"
            accessory="none"
          />
        ) : sorted.length === 0 ? (
          <ListRow title={<span className="text-muted-foreground">No changes recorded yet</span>} />
        ) : (
          <>
            {visible.map((rev) => (
              <RevisionRow key={rev.id} revision={rev} current={rev.id === currentId} onOpen={() => {
                  setOpenId(rev.id);
                  setDialogOpen(true);
                }}
              />
            ))}
            {sorted.length > VISIBLE_ROWS && (
              <ListRow
                onClick={() => setShowAll((v) => !v)}
                title={<span className="text-primary">{showAll ? "Show Less" : "Show All History"}</span>}
                value={showAll ? undefined : formatCount(sorted.length)}
                accessory="none"
              />
            )}
          </>
        )}
      </ListSection>
      {selected && (
        <VersionDialog
          revision={selected}
          open={dialogOpen}
          current={selected.id === currentId}
          settings={settings}
          onOpenChange={setDialogOpen}
        />
      )}
    </>
  );
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
