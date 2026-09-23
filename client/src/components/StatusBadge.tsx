import { Archive } from "lucide-react";
import { PO_STATUS_LABELS, type POStatus } from "@shared/po";
import { cn } from "@/lib/utils";

// iOS system colors: a translucent tint for the pill, with a darker (light mode) or lighter
// (dark mode) text shade so labels keep AA contrast.
export const STATUS_STYLES: Record<POStatus, { badge: string; dot: string; text: string }> = {
  draft: {
    badge: "bg-ios-gray/15 text-[hsl(240_3%_36%)] dark:bg-ios-gray/25 dark:text-[hsl(240_4%_76%)]",
    dot: "bg-ios-gray",
    text: "text-[hsl(240_3%_36%)] dark:text-[hsl(240_4%_76%)]",
  },
  open: {
    badge: "bg-ios-blue/[0.12] text-[hsl(211_100%_40%)] dark:bg-ios-blue/20 dark:text-[hsl(210_100%_70%)]",
    dot: "bg-ios-blue",
    text: "text-[hsl(211_100%_40%)] dark:text-[hsl(210_100%_70%)]",
  },
  in_production: {
    badge: "bg-ios-orange/15 text-[hsl(28_100%_33%)] dark:bg-ios-orange/20 dark:text-[hsl(36_100%_62%)]",
    dot: "bg-ios-orange",
    text: "text-[hsl(28_100%_33%)] dark:text-[hsl(36_100%_62%)]",
  },
  shipped: {
    badge: "bg-ios-indigo/[0.12] text-[hsl(241_52%_47%)] dark:bg-ios-indigo/25 dark:text-[hsl(241_90%_80%)]",
    dot: "bg-ios-indigo",
    text: "text-[hsl(241_52%_47%)] dark:text-[hsl(241_90%_80%)]",
  },
  received: {
    badge: "bg-ios-green/15 text-[hsl(135_62%_26%)] dark:bg-ios-green/20 dark:text-[hsl(135_60%_62%)]",
    dot: "bg-ios-green",
    text: "text-[hsl(135_62%_26%)] dark:text-[hsl(135_60%_62%)]",
  },
  cancelled: {
    badge: "bg-ios-red/[0.12] text-[hsl(3_80%_44%)] dark:bg-ios-red/20 dark:text-[hsl(3_100%_72%)]",
    dot: "bg-ios-red",
    text: "text-[hsl(3_80%_44%)] dark:text-[hsl(3_100%_72%)]",
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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold leading-none",
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2.5 py-[3px] text-xs font-semibold leading-none text-muted-foreground",
        className,
      )}
    >
      <Archive className="h-3 w-3" aria-hidden />
      Archived
    </span>
  );
}
