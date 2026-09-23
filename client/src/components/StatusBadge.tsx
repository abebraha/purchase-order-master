import { Archive } from "lucide-react";
import { PO_STATUS_LABELS, type POStatus } from "@shared/po";
import { cn } from "@/lib/utils";

export const STATUS_STYLES: Record<POStatus, { badge: string; dot: string }> = {
  draft: {
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/25",
    dot: "bg-slate-400",
  },
  open: {
    badge: "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/30",
    dot: "bg-blue-500",
  },
  in_production: {
    badge: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30",
    dot: "bg-amber-500",
  },
  shipped: {
    badge: "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/30",
    dot: "bg-violet-500",
  },
  received: {
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
    dot: "bg-emerald-500",
  },
  cancelled: {
    badge: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/30",
    dot: "bg-red-500",
  },
};

export function StatusDot({ status, className }: { status: POStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 shrink-0 rounded-full", STATUS_STYLES[status]?.dot, className)} />;
}

export function StatusBadge({ status, className }: { status: POStatus; className?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.open;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        style.badge,
        className,
      )}
    >
      <StatusDot status={status} className="h-1.5 w-1.5" />
      {PO_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function ArchivedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border",
        className,
      )}
    >
      <Archive className="h-3 w-3" aria-hidden />
      Archived
    </span>
  );
}
