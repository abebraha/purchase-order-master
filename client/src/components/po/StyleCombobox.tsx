/**
 * Style picker for a PO line.
 *   Phones  — a tappable row that opens a bottom sheet with a search field and the catalog.
 *   Desktop — an input-like trigger that opens a keyboard-friendly Popover + Command list.
 * Picking a catalog style links it (styleId). Free text can be used as-is ("Use “X”") or saved
 * to the catalog first ("Add “X” to Styles").
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight, ChevronsUpDown, Loader2, PenLine, Plus, Tag } from "lucide-react";
import type { StyleRecord } from "@shared/po";
import { IconTile, ListRow, ListSection, SearchField } from "@/components/kit";
import { ResponsiveDialog } from "@/components/common";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCreateStyle, useStyles } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface StyleSelection {
  styleId: number | null;
  styleNumber: string;
  color?: string;
  description?: string;
}

export interface StyleComboboxProps {
  /** Style # currently on the line. */
  value: string;
  styleId: number | null;
  /** The line's color/description — saved with "Add to Styles". */
  color?: string;
  description?: string;
  onSelect: (selection: StyleSelection) => void;
  /** "row" = phone card header + sheet; "field" = desktop grid cell + popover. */
  variant: "row" | "field";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Item 1" */
  label: string;
  invalid?: boolean;
  errorMessage?: string;
  id?: string;
}

const MAX_RESULTS = 60;

function styleDetails(s: Pick<StyleRecord, "color" | "description">): string {
  return [s.color, s.description].map((v) => v?.trim()).filter(Boolean).join(" · ");
}

/** Catalog matches for `query` (style #, color or description), best matches first. */
export function matchStyles(styles: StyleRecord[], query: string): StyleRecord[] {
  const byNumber = (a: StyleRecord, b: StyleRecord) =>
    a.styleNumber.localeCompare(b.styleNumber, undefined, { numeric: true, sensitivity: "base" });
  const q = query.trim().toLowerCase();
  if (!q) return [...styles].sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0) || byNumber(a, b));
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<[number, StyleRecord]> = [];
  for (const s of styles) {
    const num = s.styleNumber.toLowerCase();
    const hay = `${num} ${s.color ?? ""} ${s.description ?? ""}`.toLowerCase();
    let score = -1;
    if (num === q) score = 0;
    else if (num.startsWith(q)) score = 1;
    else if (num.includes(q)) score = 2;
    else if (hay.includes(q)) score = 3;
    else if (tokens.every((t) => hay.includes(t))) score = 4;
    if (score >= 0) scored.push([score, s]);
  }
  return scored.sort((a, b) => a[0] - b[0] || byNumber(a[1], b[1])).map(([, s]) => s);
}

function useStylePicker({
  value,
  styleId,
  color,
  description,
  onSelect,
  open,
  onOpenChange,
}: Pick<StyleComboboxProps, "value" | "styleId" | "color" | "description" | "onSelect" | "open" | "onOpenChange">) {
  const { data: styles, isLoading } = useStyles();
  const createStyle = useCreateStyle();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const readyRef = useRef(false);

  useEffect(() => {
    readyRef.current = open;
  }, [open]);

  /** Opens with a fresh search (reset in the same update, so the first frame is already empty). */
  const handleOpenChange = (next: boolean) => {
    if (next && !open) setQuery("");
    onOpenChange(next);
  };

  const typed = query.trim();
  const all = styles ?? [];
  const matches = useMemo(() => matchStyles(all, query), [all, query]);
  const exact = typed ? all.some((s) => s.styleNumber.trim().toLowerCase() === typed.toLowerCase()) : false;
  const showFreeText = typed.length > 0 && !exact;

  const close = () => onOpenChange(false);

  const chooseStyle = (s: StyleRecord) => {
    onSelect({ styleId: s.id, styleNumber: s.styleNumber, color: s.color, description: s.description });
    close();
  };

  const pickTyped = () => {
    if (!typed) return;
    onSelect({ styleId: null, styleNumber: typed });
    close();
  };

  const addTyped = async () => {
    if (!typed || createStyle.isPending) return;
    try {
      const rec = await createStyle.mutateAsync({
        styleNumber: typed,
        color: color?.trim() ?? "",
        description: description?.trim() ?? "",
      });
      onSelect({ styleId: rec.id, styleNumber: rec.styleNumber, color: rec.color, description: rec.description });
      toast({ title: "Added to Styles", description: `${rec.styleNumber} is now in your style catalog.` });
      close();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't add the style",
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  /**
   * Typing on the closed field opens the picker with that character already searched. Keys that
   * arrive before the search input takes focus are appended, so fast typists keep every key.
   */
  const openWith = (seed: string) => {
    if (open || readyRef.current) {
      if (seed) setQuery((q) => q + seed);
      return;
    }
    setQuery(seed);
    onOpenChange(true);
  };

  return {
    query,
    setQuery,
    typed,
    matches,
    visible: matches.slice(0, MAX_RESULTS),
    hiddenCount: Math.max(0, matches.length - MAX_RESULTS),
    showFreeText,
    isLoading,
    hasCatalog: all.length > 0,
    chooseStyle,
    pickTyped,
    addTyped,
    adding: createStyle.isPending,
    openWith,
    handleOpenChange,
    value,
    styleId,
  };
}

export function StyleCombobox(props: StyleComboboxProps) {
  return props.variant === "row" ? <StyleSheetPicker {...props} /> : <StylePopoverPicker {...props} />;
}

// ---------------------------------------------------------------------------
// Phone: row trigger + bottom sheet
// ---------------------------------------------------------------------------

function StyleSheetPicker(props: StyleComboboxProps) {
  const { value, styleId, open, label, invalid, errorMessage, id } = props;
  const picker = useStylePicker(props);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (picker.visible[0] && picker.typed) picker.chooseStyle(picker.visible[0]);
    else if (picker.showFreeText) picker.pickTyped();
  };

  const subtitle = invalid && errorMessage
    ? errorMessage
    : value
      ? `${label} · ${styleId ? "From your styles" : "Custom style"}`
      : `${label} · Tap to search your styles`;

  return (
    <>
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        aria-label={value ? `${label}: style ${value}. Change style` : `${label}: choose style`}
        onClick={() => picker.handleOpenChange(true)}
        className="flex min-h-[62px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-1 text-left outline-none transition-colors duration-100 active:bg-accent focus-visible:bg-accent"
      >
        <IconTile icon={Tag} color={invalid ? "red" : value ? "indigo" : "blue"} variant={value ? "solid" : "tinted"} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[17px] leading-[22px]",
              value ? "font-semibold text-foreground" : "text-primary",
            )}
          >
            {value || "Choose Style"}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-[13px] leading-[18px]",
              invalid ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {subtitle}
          </span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground/45" strokeWidth={2.5} aria-hidden />
      </button>

      <ResponsiveDialog open={open} onOpenChange={picker.handleOpenChange} title="Choose Style">
        <div className="sticky top-0 z-10 -mx-4 bg-card px-4 pb-3 pt-1">
          <SearchField
            ref={searchRef}
            value={picker.query}
            onChange={picker.setQuery}
            onKeyDown={onSearchKeyDown}
            placeholder="Style #, color or description"
            aria-label="Search styles"
          />
        </div>
        <div className="min-h-[64dvh] space-y-6 pb-2">
          {picker.isLoading ? (
            <div className="space-y-2 pt-1" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[58px] rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {picker.visible.length > 0 && (
                <ListSection
                  className="-mx-4"
                  header={picker.typed ? "Matching Styles" : "Your Styles"}
                  footer={picker.hiddenCount > 0 ? `${picker.hiddenCount} more — keep typing to narrow the list.` : undefined}
                >
                  {picker.visible.map((s) => (
                    <ListRow
                      key={s.id}
                      onClick={() => picker.chooseStyle(s)}
                      title={<span className="font-medium">{s.styleNumber}</span>}
                      subtitle={styleDetails(s) || "No color or description"}
                      accessory={
                        s.id === styleId ? (
                          <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} aria-label="Selected" />
                        ) : (
                          "none"
                        )
                      }
                    />
                  ))}
                </ListSection>
              )}

              {picker.showFreeText && (
                <ListSection
                  className="-mx-4"
                  header="New Style"
                  footer="Adding it to Styles saves it with this item's color and description so you can reuse it."
                >
                  <ListRow
                    onClick={picker.pickTyped}
                    leading={<IconTile icon={PenLine} color="gray" />}
                    title={<>Use “{picker.typed}”</>}
                    subtitle="Just for this order"
                  />
                  <ListRow
                    onClick={() => void picker.addTyped()}
                    disabled={picker.adding}
                    leading={<IconTile icon={Plus} color="green" />}
                    title={<>Add “{picker.typed}” to Styles</>}
                    subtitle="Save it to your catalog"
                    accessory={picker.adding ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : "none"}
                  />
                </ListSection>
              )}

              {!picker.typed && !picker.hasCatalog && (
                <p className="px-2 pt-6 text-center text-[15px] leading-snug text-muted-foreground">
                  Your style catalog is empty. Type a style number above to use it on this order.
                </p>
              )}
              {picker.typed && picker.visible.length === 0 && !picker.showFreeText && (
                <p className="px-2 pt-6 text-center text-[15px] text-muted-foreground">No matching styles.</p>
              )}
            </>
          )}
        </div>
      </ResponsiveDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop: input-like trigger + Popover/Command
// ---------------------------------------------------------------------------

function StylePopoverPicker(props: StyleComboboxProps) {
  const { value, styleId, open, label, invalid, id } = props;
  const picker = useStylePicker(props);
  const inputRef = useRef<HTMLInputElement>(null);

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      picker.openWith("");
    } else if (e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Start typing on the closed field → open with that character already searched.
      e.preventDefault();
      picker.openWith(e.key);
    }
  };

  return (
    <Popover open={open} onOpenChange={picker.handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          aria-label={`${label} style number`}
          title={value || undefined}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex h-9 w-full min-w-0 items-center gap-1 rounded-[10px] border border-input bg-muted pl-2.5 pr-1.5 text-left text-sm outline-none transition-[background-color,border-color,box-shadow] duration-150",
            "hover:bg-accent focus-visible:border-primary/70 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-primary/15",
            "aria-[expanded=true]:border-primary/70 aria-[expanded=true]:bg-card aria-[expanded=true]:ring-4 aria-[expanded=true]:ring-primary/15",
            "aria-[invalid=true]:border-destructive/70",
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", value ? "font-medium text-foreground" : "text-muted-foreground/70")}>
            {value || "Style #"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[340px] overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          // Focus the search with the caret at the end (Radix would select the text, and the
          // next key typed after opening-by-typing would replace the first one).
          e.preventDefault();
          const el = inputRef.current;
          if (!el) return;
          el.focus({ preventScroll: true });
          el.setSelectionRange(el.value.length, el.value.length);
        }}
      >
        <Command shouldFilter={false} loop className="bg-transparent">
          <CommandInput
            ref={inputRef}
            value={picker.query}
            onValueChange={picker.setQuery}
            placeholder="Search or type a style #"
            aria-label="Search styles"
          />
          <CommandList className="max-h-[320px] p-1">
            {picker.isLoading ? (
              <div className="space-y-1.5 p-1.5" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 rounded-lg" />
                ))}
              </div>
            ) : (
              <>
                <CommandEmpty className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {picker.hasCatalog ? "No matching styles." : "Your style catalog is empty. Type a style number."}
                </CommandEmpty>
                {picker.visible.length > 0 && (
                  <CommandGroup heading={picker.typed ? "Matching Styles" : "Your Styles"}>
                    {picker.visible.map((s) => (
                      <CommandItem key={s.id} value={`style-${s.id}`} onSelect={() => picker.chooseStyle(s)} className="gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{s.styleNumber}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {styleDetails(s) || "No color or description"}
                          </span>
                        </span>
                        {s.id === styleId && <Check className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.5} aria-label="Selected" />}
                      </CommandItem>
                    ))}
                    {picker.hiddenCount > 0 && (
                      <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">
                        {picker.hiddenCount} more — keep typing to narrow the list.
                      </p>
                    )}
                  </CommandGroup>
                )}
                {picker.showFreeText && (
                  <CommandGroup heading="New Style">
                    <CommandItem value="__use" onSelect={picker.pickTyped} className="gap-3">
                      <IconTile icon={PenLine} color="gray" className="!h-6 !w-6 !rounded-md [&_svg]:!h-3.5 [&_svg]:!w-3.5" />
                      <span className="min-w-0 flex-1 truncate">
                        Use “{picker.typed}”
                        <span className="ml-1.5 text-xs text-muted-foreground">just for this order</span>
                      </span>
                    </CommandItem>
                    <CommandItem value="__add" onSelect={() => void picker.addTyped()} disabled={picker.adding} className="gap-3">
                      <IconTile icon={Plus} color="green" className="!h-6 !w-6 !rounded-md [&_svg]:!h-3.5 [&_svg]:!w-3.5" />
                      <span className="min-w-0 flex-1 truncate">Add “{picker.typed}” to Styles</span>
                      {picker.adding && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
