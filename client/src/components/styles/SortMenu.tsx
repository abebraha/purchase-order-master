import { ArrowUpDown, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { STYLE_SORT_OPTIONS, sortLabel, type StyleSort } from "./styleUtils";

/**
 * Sort picker that sits next to the search field. Phones: a compact square with the sort glyph
 * (same fill as the search bar). Desktop: a small pill that names the current order.
 */
export function SortMenu({ value, onChange, className }: { value: StyleSort; onChange: (sort: StyleSort) => void; className?: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Sort styles: ${sortLabel(value)}`}
        className={cn(
          "flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-ios-gray/[0.12] px-3 text-[15px] font-medium text-primary outline-none transition-colors hover:bg-ios-gray/20 focus-visible:ring-4 focus-visible:ring-primary/15 active:opacity-70 data-[state=open]:bg-ios-gray/20 md:h-9 md:text-sm dark:bg-ios-gray/[0.24]",
          "w-10 px-0 md:w-auto md:px-3",
          className,
        )}
      >
        <ArrowUpDown className="h-[17px] w-[17px] md:h-4 md:w-4" strokeWidth={2.2} aria-hidden />
        <span className="hidden md:inline">{sortLabel(value)}</span>
        <ChevronDown className="hidden h-3.5 w-3.5 opacity-70 md:block" strokeWidth={2.5} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13rem]">
        <DropdownMenuLabel className="px-2.5 pb-1 pt-1.5 text-[13px] font-normal text-muted-foreground md:text-xs">
          Sort By
        </DropdownMenuLabel>
        {STYLE_SORT_OPTIONS.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.value}
            checked={value === opt.value}
            onCheckedChange={() => onChange(opt.value)}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
