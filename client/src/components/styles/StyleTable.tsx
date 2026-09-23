import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, Ellipsis, Pencil, Trash2 } from "lucide-react";
import type { StyleRecord } from "@shared/po";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StyleSort } from "./styleUtils";

/**
 * Desktop layout — a clean, Numbers-like table. Click a row (or press Enter on it) to edit.
 * The Style #, Used On and Added headers double as sort buttons.
 */
export function StyleTable({
  styles,
  sort,
  onSortChange,
  onEdit,
  onDelete,
  footer,
}: {
  /** Already filtered, sorted and limited. */
  styles: StyleRecord[];
  sort: StyleSort;
  onSortChange: (sort: StyleSort) => void;
  onEdit: (style: StyleRecord) => void;
  onDelete: (style: StyleRecord) => void;
  footer?: ReactNode;
}) {
  const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, style: StyleRecord) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(style);
    } else if (e.key === "Delete" || (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      onDelete(style);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const row = e.currentTarget;
      const next = (e.key === "ArrowDown" ? row.nextElementSibling : row.previousElementSibling) as HTMLElement | null;
      next?.focus();
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-card">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[20%]" />
          <col className="w-[17%]" />
          <col />
          <col className="w-[120px]" />
          <col className="w-[124px]" />
          <col className="w-[52px]" />
        </colgroup>
        <thead>
          <tr className="h-9 border-b border-border/80 text-xs font-medium text-muted-foreground">
            <SortHeader active={sort === "az"} ascending onClick={() => onSortChange("az")} className="pl-5">
              Style #
            </SortHeader>
            <th scope="col" className="px-3 font-medium">Color</th>
            <th scope="col" className="px-3 font-medium">Description</th>
            <SortHeader active={sort === "used"} onClick={() => onSortChange("used")}>
              Used On
            </SortHeader>
            <SortHeader active={sort === "recent"} onClick={() => onSortChange("recent")}>
              Added
            </SortHeader>
            <th scope="col" className="pr-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {styles.map((style) => (
            <tr
              key={style.id}
              tabIndex={0}
              aria-label={`Style ${style.styleNumber}`}
              onClick={() => onEdit(style)}
              onKeyDown={(e) => onRowKeyDown(e, style)}
              className="group h-11 cursor-pointer border-b border-border/70 outline-none transition-colors duration-100 last:border-b-0 hover:bg-accent/60 focus-visible:bg-primary/[0.08] active:bg-accent"
            >
              <td className="truncate pl-5 pr-3 font-medium">{style.styleNumber}</td>
              <td className="truncate px-3">
                {style.color || <span className="text-muted-foreground/60">—</span>}
              </td>
              <td className="truncate px-3" title={style.description || undefined}>
                {style.description || <span className="text-muted-foreground/60">—</span>}
              </td>
              <td className="truncate px-3 tabular-nums">
                {style.usageCount > 0 ? (
                  pluralize(style.usageCount, "PO item")
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </td>
              <td className="truncate px-3 tabular-nums text-muted-foreground">{formatDate(style.createdAt) || "—"}</td>
              <td className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                <RowMenu style={style} onEdit={onEdit} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {footer}
    </div>
  );
}

function SortHeader({
  active,
  ascending,
  onClick,
  children,
  className,
}: {
  active: boolean;
  /** A–Z sorts ascending; "Most Used" and "Recently Added" sort descending. */
  ascending?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (ascending ? "ascending" : "descending") : undefined}
      className={cn("px-3 font-medium", className)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group/sort -mx-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
          active && "font-semibold text-foreground",
        )}
      >
        {children}
        <ChevronDown
          aria-hidden
          strokeWidth={2.75}
          className={cn(
            "h-3 w-3 transition-opacity",
            active ? "text-primary opacity-100" : "opacity-0 group-hover/sort:opacity-40",
            ascending && "rotate-180",
          )}
        />
      </button>
    </th>
  );
}

function RowMenu({
  style,
  onEdit,
  onDelete,
}: {
  style: StyleRecord;
  onEdit: (style: StyleRecord) => void;
  onDelete: (style: StyleRecord) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      {/* Same row "•••" button as the Orders table. */}
      <DropdownMenuTrigger
        aria-label={`Actions for ${style.styleNumber}`}
        onKeyDown={(e) => e.stopPropagation()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-primary/10 data-[state=open]:text-primary"
      >
        <Ellipsis className="h-[18px] w-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        <DropdownMenuItem onSelect={() => onEdit(style)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(style)}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
