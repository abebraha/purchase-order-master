import type { ReactNode } from "react";
import { Download, FileText, Loader2, Rows3, Tags } from "lucide-react";
import { IconTile, ListRow, ListSection } from "@/components/kit";
import { useToast } from "@/hooks/use-toast";
import { usePurchaseOrders, useStyles } from "@/lib/api";
import { exportLineItemsCsv, exportOrdersCsv, exportStylesCsv } from "@/lib/export";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A ListRow-looking <a> for real file downloads (so the browser handles the
 * Content-Disposition, and "Save Link As…" works on desktop).
 */
function DownloadRow({
  href,
  leading,
  title,
  subtitle,
  value,
  onClick,
}: {
  href: string;
  leading: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      download
      onClick={onClick}
      style={{ ["--row-inset" as string]: "3.5625rem" }}
      className={cn(
        "relative flex min-h-11 w-full items-center gap-3 px-4 text-left outline-none",
        "after:absolute after:bottom-0 after:left-[var(--row-inset)] after:right-0 after:h-px after:bg-border/80 last:after:hidden",
        "cursor-pointer transition-colors duration-100 hover:bg-accent/60 focus-visible:bg-accent active:bg-accent",
      )}
    >
      {leading}
      <div className="min-w-0 flex-1 py-[11px]">
        <div className="truncate text-[17px] leading-[22px] md:text-[15px] md:leading-5">{title}</div>
        {subtitle && (
          <div className="mt-0.5 truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4">{subtitle}</div>
        )}
      </div>
      {value && <div className="shrink-0 text-right text-[17px] text-muted-foreground md:text-[15px]">{value}</div>}
    </a>
  );
}

function FileKind({ loading, children }: { loading?: boolean; children: ReactNode }) {
  return loading ? (
    <Loader2 className="h-[18px] w-[18px] animate-spin text-muted-foreground" aria-label="Loading" />
  ) : (
    <span className="text-[15px] md:text-[13px]">{children}</span>
  );
}

export function DataSection() {
  const { toast } = useToast();
  const orders = usePurchaseOrders("include");
  const styles = useStyles();

  const orderList = orders.data ?? [];
  const styleList = styles.data ?? [];
  const lineCount = orderList.reduce((n, po) => n + (po.items?.length ?? 0), 0);
  const archivedCount = orderList.filter((po) => po.archivedAt).length;

  const exportOrders = () => {
    if (!orders.data) return;
    exportOrdersCsv(orders.data);
    toast({ title: "Purchase orders exported", description: `${pluralize(orders.data.length, "order")} saved as a CSV file.` });
  };
  const exportLines = () => {
    if (!orders.data) return;
    exportLineItemsCsv(orders.data);
    toast({ title: "Line items exported", description: `${pluralize(lineCount, "line item")} saved as a CSV file.` });
  };
  const exportStyles = () => {
    if (!styles.data) return;
    exportStylesCsv(styles.data);
    toast({ title: "Styles exported", description: `${pluralize(styles.data.length, "style")} saved as a CSV file.` });
  };

  const counts =
    orders.data && styles.data
      ? ` ${pluralize(orderList.length, "purchase order")} · ${pluralize(styleList.length, "style")}.`
      : "";

  return (
    <ListSection
      header="Data & Backup"
      footer={`Every change to a purchase order is saved in its history, and deleted orders can be recovered below.${counts}`}
    >
      <DownloadRow
        href="/api/backup"
        leading={<IconTile icon={Download} color="green" />}
        title="Download Full Backup"
        subtitle="Orders, history, styles, customers and settings"
        value={<FileKind>JSON</FileKind>}
        onClick={() => toast({ title: "Preparing backup", description: "Your download will start in a moment." })}
      />
      <ListRow
        onClick={exportOrders}
        disabled={!orders.data}
        leading={<IconTile icon={FileText} color="blue" />}
        title="Export Purchase Orders"
        subtitle={
          orders.data
            ? archivedCount
              ? `${pluralize(orderList.length, "order")}, including ${archivedCount} archived`
              : pluralize(orderList.length, "order")
            : "One row per order"
        }
        value={<FileKind loading={orders.isLoading}>CSV</FileKind>}
      />
      <ListRow
        onClick={exportLines}
        disabled={!orders.data}
        leading={<IconTile icon={Rows3} color="indigo" />}
        title="Export Line Items"
        subtitle={orders.data ? `${pluralize(lineCount, "line")} · great for pivot tables` : "One row per style on each order"}
        value={<FileKind loading={orders.isLoading}>CSV</FileKind>}
      />
      <ListRow
        onClick={exportStyles}
        disabled={!styles.data}
        leading={<IconTile icon={Tags} color="orange" />}
        title="Export Styles"
        subtitle={styles.data ? pluralize(styleList.length, "style") : "Your style library"}
        value={<FileKind loading={styles.isLoading}>CSV</FileKind>}
      />
    </ListSection>
  );
}
