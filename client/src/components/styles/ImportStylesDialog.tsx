import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Check,
  ClipboardList,
  ClipboardPaste,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  RotateCw,
  X,
  type LucideIcon,
} from "lucide-react";
import type { StyleImportResult, StyleRecord, StyleSuggestion } from "@shared/po";
import { ResponsiveDialog } from "@/components/common";
import { IconTile, ListRow, ListSection, SegmentedControl, type SegmentOption } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useBulkCreateStyles, useImportStylesCsv, useStyleSuggestions } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  checkImportFile,
  downloadStyleTemplate,
  formatFileSize,
  parsePastedStyles,
  parseStylesCsv,
  styleDetails,
  type ParsedPaste,
} from "./styleUtils";
import { styleKey, suggestionDetails, suggestionToStyle, suggestionUsage, useAddToLibrary } from "./suggestions";

export type ImportMode = "file" | "paste" | "orders";

/**
 * Three segments share a phone-width sheet, so phones get short labels without icons (and the
 * narrowest phones a shorter one still). VoiceOver always reads the full name.
 */
function modeLabel(Icon: LucideIcon, long: string, short = long, tiny = short) {
  return (
    <span className="flex min-w-0 items-center justify-center gap-1.5">
      <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden />
      <span className="sr-only">{long}</span>
      <span aria-hidden className="hidden truncate max-[359px]:inline">{tiny}</span>
      <span aria-hidden className="truncate max-[359px]:hidden sm:hidden">{short}</span>
      <span aria-hidden className="hidden truncate sm:inline">{long}</span>
    </span>
  );
}

const MODES: Array<SegmentOption<ImportMode>> = [
  { value: "file", label: modeLabel(FileUp, "Upload CSV") },
  { value: "paste", label: modeLabel(ClipboardPaste, "Paste from Excel", "Paste") },
  { value: "orders", label: modeLabel(ClipboardList, "From Orders", "From Orders", "Orders") },
];

const PREVIEW_ROWS = 5;

const COLUMNS: Array<{ name: string; required?: boolean }> = [
  { name: "style_number", required: true },
  { name: "color" },
  { name: "description" },
];

/**
 * Import styles from a CSV file, from cells pasted out of Excel / Google Sheets, or from the
 * style numbers typed on purchase orders that aren't in the library yet.
 */
export function ImportStylesDialog({
  open,
  onOpenChange,
  styles,
  initialMode = "file",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current catalog — used to show how many pasted styles are already there. */
  styles: StyleRecord[] | undefined;
  /** The tab shown each time the sheet opens. */
  initialMode?: ImportMode;
}) {
  const { toast } = useToast();
  const pasteId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importCsv = useImportStylesCsv();
  const bulkCreate = useBulkCreateStyles();
  const addToLibrary = useAddToLibrary();
  const suggestions = useStyleSuggestions();
  const pending = importCsv.isPending || bulkCreate.isPending || addToLibrary.isPending;

  const [mode, setMode] = useState<ImportMode>(initialMode);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");
  /** What the picked CSV file holds (read in the browser); null while reading or if it can't be read. */
  const [fileStyles, setFileStyles] = useState<ParsedPaste | null>(null);
  /** "From Orders": everything starts selected, so remember what was unticked. */
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());

  // Start clean each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setFile(null);
    setFileError(null);
    setDragging(false);
    setText("");
    setUnticked(new Set());
  }, [open, initialMode]);

  // Read the picked file so the sheet can say how many styles are new before anything is imported.
  useEffect(() => {
    setFileStyles(null);
    if (!file || fileError) return;
    let cancelled = false;
    file
      .text()
      .then((content) => {
        if (!cancelled) setFileStyles(parseStylesCsv(content));
      })
      .catch(() => {
        // Unreadable here: the server still checks the file when it's imported.
      });
    return () => {
      cancelled = true;
    };
  }, [file, fileError]);

  const parsed = useMemo(() => parsePastedStyles(text), [text]);
  const existingKeys = useMemo(
    () => new Set((styles ?? []).map((s) => s.styleNumber.trim().toLowerCase())),
    [styles],
  );
  const inCatalog = (style: { styleNumber: string }) => existingKeys.has(style.styleNumber.trim().toLowerCase());

  // The rows this import would send: pasted cells, or the picked file once it has been read.
  const incoming = mode === "paste" ? parsed : file && !fileError ? fileStyles : null;
  const found = incoming?.styles.length ?? 0;
  const alreadyInCatalog = incoming ? incoming.styles.filter(inCatalog).length : 0;
  const newCount = found - alreadyInCatalog;
  const fileHasNoStyles = mode === "file" && Boolean(fileStyles) && found === 0;
  const fileProblem = fileError ?? (fileHasNoStyles ? "No style numbers found. Make sure the CSV has a “style_number” column." : null);

  const pickFile = (picked: File | null | undefined) => {
    if (!picked) return;
    setFile(picked);
    setFileError(checkImportFile(picked));
  };

  const clearFile = () => {
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const finish = (result: StyleImportResult) => {
    toast({
      title: result.created > 0 ? "Import complete" : "No new styles",
      description: result.message,
    });
    onOpenChange(false);
  };

  const fromOrders = suggestions.data ?? [];
  const chosen = fromOrders.filter((s) => !unticked.has(styleKey(s.styleNumber)));

  // `pending` only disables the button on a later render, so a quick double tap could import twice.
  const submitting = useRef(false);
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await save();
    } finally {
      submitting.current = false;
    }
  };

  const save = async () => {
    if (mode === "orders") {
      if (chosen.length === 0) return;
      if (await addToLibrary.add(chosen.map((s) => suggestionToStyle(s)))) onOpenChange(false);
      return;
    }
    if (mode === "file") {
      if (!file || fileError) return;
      try {
        finish(await importCsv.mutateAsync(file));
      } catch (error) {
        // Keep the sheet open so the file can be fixed and tried again.
        setFileError(error instanceof Error ? error.message : "Couldn't import that file.");
      }
      return;
    }
    if (newCount === 0) return;
    try {
      finish(await bulkCreate.mutateAsync(parsed.styles));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't import styles",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  // Label the button with what will actually be added; styles already in the library are skipped.
  const canSubmit =
    mode === "orders"
      ? chosen.length > 0
      : mode === "file"
        ? Boolean(file) && !fileError && (!fileStyles || newCount > 0)
        : newCount > 0;
  const submitLabel =
    mode === "orders"
      ? chosen.length > 0
        ? `Add ${pluralize(chosen.length, "Style")}`
        : "Add Styles"
      : !incoming || found === 0
        ? "Import"
        : newCount > 0
          ? `Import ${pluralize(newCount, "New Style", "New Styles")}`
          : "Nothing New to Import";
  // "From Orders" with nothing to add (all set, or the orders couldn't be read): no dead primary.
  const ordersSettled = mode === "orders" && fromOrders.length === 0 && (Boolean(suggestions.data) || Boolean(suggestions.error));

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Import Styles"
      description="Add many styles at once. Styles already in your library are skipped."
      className="sm:max-w-xl"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="order-last md:order-none"
          >
            {ordersSettled && suggestions.data ? "Done" : "Cancel"}
          </Button>
          {!ordersSettled && (
            <Button type="button" onClick={submit} disabled={!canSubmit || pending}>
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          )}
        </>
      }
    >
      {/* min-w-0: a long row truncates instead of widening the dialog (it's a grid item). */}
      <div className="min-w-0 space-y-5 pt-1">
        <SegmentedControl aria-label="Import method" value={mode} onChange={setMode} options={MODES} />

        {mode === "orders" ? (
          <FromOrders
            suggestions={suggestions.data}
            error={suggestions.error}
            retrying={suggestions.isFetching}
            onRetry={() => suggestions.refetch()}
            unticked={unticked}
            onUntickedChange={setUnticked}
            disabled={pending}
          />
        ) : mode === "file" ? (
          <div className="space-y-4">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-6 text-center outline-none transition-colors focus-within:ring-4 focus-within:ring-primary/20 active:scale-[0.99]",
                dragging
                  ? "border-primary bg-primary/5"
                  : fileProblem
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-muted/60 hover:bg-accent/60",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                aria-label="Choose a CSV file to import"
                // Accept by extension as well as MIME: Windows reports .csv as application/vnd.ms-excel.
                accept=".csv,text/csv,application/vnd.ms-excel"
                className="sr-only"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <IconTile icon={FileSpreadsheet} color={file && !fileProblem ? "green" : "blue"} variant="tinted" size="lg" />
              {file ? (
                <div className="min-w-0 max-w-full">
                  <div className="truncate text-[17px] font-semibold md:text-[15px]">{file.name}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">
                    {formatFileSize(file.size)} · <span className="text-primary">Choose a Different File</span>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[17px] font-semibold text-primary md:text-[15px]">Choose CSV File</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">
                    <span className="md:hidden">From Files, iCloud Drive or Downloads</span>
                    <span className="hidden md:inline">or drag and drop it here</span>
                  </div>
                </div>
              )}
            </label>
            {file && (
              <div className="-mt-2 flex justify-center">
                <Button type="button" variant="plain" size="sm" onClick={clearFile} disabled={pending}>
                  <X />
                  Remove File
                </Button>
              </div>
            )}
            {fileProblem ? (
              <p role="alert" className="text-center text-[13px] font-medium leading-snug text-destructive">
                {fileProblem}
              </p>
            ) : (
              found > 0 && (
                <p role="status" className="text-center text-[13px] leading-snug text-muted-foreground">
                  {importSummary(found, alreadyInCatalog, incoming?.repeated ?? 0)}
                </p>
              )
            )}

            <div className="space-y-2.5 rounded-xl bg-muted px-3.5 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-[13px] font-medium text-muted-foreground">Columns</span>
                {COLUMNS.map((col) => (
                  <code
                    key={col.name}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[13px] md:text-xs",
                      col.required ? "bg-primary/10 font-semibold text-primary dark:bg-primary/20" : "bg-card text-foreground",
                    )}
                  >
                    {col.name}
                  </code>
                ))}
              </div>
              <p className="text-[13px] leading-snug text-muted-foreground">
                Only <span className="font-medium text-foreground">style_number</span> is required — headers like
                “Style Number”, “Style #” or “Style” work too. Other columns are ignored.
              </p>
            </div>

            <div className="flex justify-center md:justify-start">
              <Button type="button" variant="plain" size="sm" onClick={downloadStyleTemplate} className="md:-ml-3">
                <Download />
                Download Template
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={pasteId} className="block text-[13px] font-medium text-muted-foreground">
                Pasted Cells
              </label>
              <Textarea
                id={pasteId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                wrap="off"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                placeholder={"SL3100    Black    Microfiber T-shirt bra\nSL3105    Ivory    Lace trim bralette"}
                className="min-h-[124px] font-mono text-[14px] leading-relaxed [tab-size:12] md:text-[13px]"
              />
              <p className="text-[13px] leading-snug text-muted-foreground">
                Copy the Style #, Color and Description columns from Excel or Google Sheets and paste them here —
                one style per row.
              </p>
            </div>

            {text.trim() &&
              (parsed.styles.length > 0 ? (
                <ListSection
                  header={`${pluralize(parsed.styles.length, "style")} found`}
                  headerAction={
                    alreadyInCatalog > 0 && (
                      <span className="text-[13px] tabular-nums text-muted-foreground">
                        {newCount > 0 ? `${newCount} new · ${alreadyInCatalog} in library` : "All in library"}
                      </span>
                    )
                  }
                  footer={[
                    alreadyInCatalog > 0 && importSummary(found, alreadyInCatalog, 0),
                    parsed.skippedHeader && "Header row skipped.",
                    parsed.repeated > 0 && `${pluralize(parsed.repeated, "repeated row")} ignored.`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  className="[&>div.bg-card]:bg-muted"
                >
                  {parsed.styles.slice(0, PREVIEW_ROWS).map((s, i) => {
                    const existing = inCatalog(s);
                    return (
                      <ListRow key={`${s.styleNumber}-${i}`}>
                        <div className="flex items-baseline gap-2.5 text-[15px] md:text-sm">
                          <span className={cn("shrink-0 font-medium", existing && "text-muted-foreground")}>{s.styleNumber}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {styleDetails(s) || "No details"}
                          </span>
                          {existing && <span className="shrink-0 text-[13px] text-muted-foreground md:text-xs">In library</span>}
                        </div>
                      </ListRow>
                    );
                  })}
                  {parsed.styles.length > PREVIEW_ROWS && (
                    <ListRow>
                      <span className="text-[13px] text-muted-foreground">
                        and {pluralize(parsed.styles.length - PREVIEW_ROWS, "more style", "more styles")}
                      </span>
                    </ListRow>
                  )}
                </ListSection>
              ) : (
                <p role="status" className="rounded-xl bg-muted px-3.5 py-3 text-[13px] leading-snug text-muted-foreground">
                  No styles found yet. Make sure the first column is the style number.
                </p>
              ))}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/** "3 new styles will be added; 1 already in your library will be skipped." */
function importSummary(found: number, existing: number, repeated: number): string {
  const fresh = found - existing;
  const parts = [
    existing === 0
      ? `${pluralize(fresh, "new style")} will be added.`
      : fresh === 0
        ? found === 1
          ? "It's already in your library."
          : `All ${found} are already in your library.`
        : `${pluralize(fresh, "new style")} will be added; ${existing} already in your library will be skipped.`,
  ];
  if (repeated > 0) parts.push(`${pluralize(repeated, "repeated row")} ignored.`);
  return parts.join(" ");
}

/** "From Orders": style numbers typed on purchase orders that aren't in the library, all ticked. */
function FromOrders({
  suggestions,
  error,
  retrying,
  onRetry,
  unticked,
  onUntickedChange,
  disabled,
}: {
  suggestions: StyleSuggestion[] | undefined;
  error: Error | null;
  retrying: boolean;
  onRetry: () => void;
  unticked: Set<string>;
  onUntickedChange: (next: Set<string>) => void;
  disabled: boolean;
}) {
  if (!suggestions) {
    return error ? (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-muted px-4 py-6 text-center">
        <p className="text-[15px] leading-snug text-muted-foreground md:text-[13px]">
          Couldn't look through your orders. {error.message}
        </p>
        <Button type="button" variant="tinted" size="sm" onClick={onRetry} disabled={retrying}>
          <RotateCw className={retrying ? "animate-spin" : undefined} />
          Try Again
        </Button>
      </div>
    ) : (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-[15px] text-muted-foreground md:text-[13px]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Looking through your orders…
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-muted px-4 py-7 text-center">
        <IconTile icon={Check} color="green" variant="tinted" size="lg" />
        <div>
          <div className="text-[17px] font-semibold md:text-[15px]">You're all set</div>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
            Every style number on your purchase orders is in your library.
          </p>
        </div>
      </div>
    );
  }

  const keys = suggestions.map((s) => styleKey(s.styleNumber));
  const chosenCount = keys.filter((k) => !unticked.has(k)).length;
  const allChosen = chosenCount === keys.length;
  const toggle = (key: string) => {
    const next = new Set(unticked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onUntickedChange(next);
  };

  return (
    <ListSection
      header={allChosen ? pluralize(keys.length, "style") : `${chosenCount} of ${keys.length} selected`}
      headerAction={
        <button
          type="button"
          disabled={disabled}
          onClick={() => onUntickedChange(allChosen ? new Set(keys) : new Set())}
          className="relative shrink-0 rounded-md text-[15px] text-primary outline-none after:absolute after:-inset-x-2 after:-inset-y-3 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 md:text-[13px]"
        >
          {allChosen ? "Select None" : "Select All"}
        </button>
      }
      footer="Each style is saved with the color and description used most on your orders. Your purchase orders don't change."
      // Desktop: the list scrolls on its own, so Select All/None and the Add button stay in view
      // however many styles there are. (Phones scroll the sheet, whose buttons are pinned.)
      className="[&>div.bg-card]:bg-muted md:[&>div.bg-card]:max-h-[min(26rem,45dvh)] md:[&>div.bg-card]:overflow-y-auto md:[&>div.bg-card]:overscroll-contain"
    >
      {suggestions.map((s, i) => {
        const key = keys[i];
        const chosen = !unticked.has(key);
        const details = suggestionDetails(s);
        return (
          <ListRow
            key={key}
            role="checkbox"
            aria-checked={chosen}
            onClick={() => toggle(key)}
            disabled={disabled}
            inset="3.25rem"
            leading={<SelectionCircle checked={chosen} />}
          >
            <div className="text-[17px] font-semibold leading-[22px] md:text-[15px] md:leading-5">
              <span className="block truncate">{s.styleNumber}</span>
            </div>
            <div className="mt-0.5 truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4">
              {details || <span className="italic text-muted-foreground/70">No color or description</span>}
            </div>
            <div className="truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4">
              {suggestionUsage(s)}
            </div>
          </ListRow>
        );
      })}
    </ListSection>
  );
}

/** iOS-style selection circle (Mail / Photos "Select"). */
function SelectionCircle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-transparent",
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}
