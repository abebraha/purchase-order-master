import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { ClipboardPaste, Download, FileSpreadsheet, FileUp, Loader2, X } from "lucide-react";
import type { StyleImportResult, StyleRecord } from "@shared/po";
import { ResponsiveDialog } from "@/components/common";
import { IconTile, ListRow, ListSection, SegmentedControl } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useBulkCreateStyles, useImportStylesCsv } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  checkImportFile,
  downloadStyleTemplate,
  formatFileSize,
  parsePastedStyles,
  styleDetails,
} from "./styleUtils";

type Mode = "file" | "paste";

const MODES = [
  { value: "file" as const, label: "Upload CSV", icon: FileUp },
  { value: "paste" as const, label: "Paste from Excel", icon: ClipboardPaste },
];

const PREVIEW_ROWS = 5;

const COLUMNS: Array<{ name: string; required?: boolean }> = [
  { name: "style_number", required: true },
  { name: "color" },
  { name: "description" },
];

/** Import styles from a CSV file or from cells pasted out of Excel / Google Sheets. */
export function ImportStylesDialog({
  open,
  onOpenChange,
  styles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current catalog — used to show how many pasted styles are already there. */
  styles: StyleRecord[] | undefined;
}) {
  const { toast } = useToast();
  const pasteId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importCsv = useImportStylesCsv();
  const bulkCreate = useBulkCreateStyles();
  const pending = importCsv.isPending || bulkCreate.isPending;

  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");

  // Start clean each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setFileError(null);
    setDragging(false);
    setText("");
  }, [open]);

  const parsed = useMemo(() => parsePastedStyles(text), [text]);
  const existingKeys = useMemo(
    () => new Set((styles ?? []).map((s) => s.styleNumber.trim().toLowerCase())),
    [styles],
  );
  const alreadyInCatalog = parsed.styles.filter((s) => existingKeys.has(s.styleNumber.toLowerCase())).length;
  const newCount = parsed.styles.length - alreadyInCatalog;

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
      title: result.created > 0 ? "Import Complete" : "No New Styles",
      description: result.message,
    });
    onOpenChange(false);
  };

  const submit = async () => {
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
    if (!parsed.styles.length) return;
    try {
      finish(await bulkCreate.mutateAsync(parsed.styles));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't Import Styles",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const canSubmit = mode === "file" ? Boolean(file) && !fileError : parsed.styles.length > 0;
  const submitLabel =
    mode === "paste" && parsed.styles.length > 0
      ? `Import ${pluralize(parsed.styles.length, "Style", "Styles")}`
      : "Import";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title="Import Styles"
      description="Add many styles at once. Styles already in your catalog are skipped."
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
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5 pt-1">
        <SegmentedControl aria-label="Import method" value={mode} onChange={setMode} options={MODES} />

        {mode === "file" ? (
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
                  : fileError
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
              <IconTile icon={FileSpreadsheet} color={file && !fileError ? "green" : "blue"} variant="tinted" size="lg" />
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
            {fileError && (
              <p role="alert" className="text-center text-[13px] font-medium leading-snug text-destructive">
                {fileError}
              </p>
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
                Pasted cells
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
                  footer={previewFooter(parsed.styles.length, alreadyInCatalog, newCount, parsed.skippedHeader, parsed.repeated)}
                  className="[&>div.bg-card]:bg-muted"
                >
                  {parsed.styles.slice(0, PREVIEW_ROWS).map((s, i) => {
                    const inCatalog = existingKeys.has(s.styleNumber.toLowerCase());
                    return (
                      <ListRow key={`${s.styleNumber}-${i}`}>
                        <div className="flex items-baseline gap-2.5 text-[15px] md:text-sm">
                          <span className={cn("shrink-0 font-medium", inCatalog && "text-muted-foreground")}>{s.styleNumber}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {styleDetails(s) || "No details"}
                          </span>
                          {inCatalog && <span className="shrink-0 text-[13px] text-muted-foreground md:text-xs">In catalog</span>}
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

function previewFooter(total: number, existing: number, fresh: number, skippedHeader: boolean, repeated: number): string {
  const parts: string[] = [];
  if (existing > 0) {
    parts.push(
      fresh > 0
        ? `${pluralize(fresh, "new style")} will be added; ${existing} already in your catalog will be skipped.`
        : total === 1
          ? "It's already in your catalog."
          : `All ${total} are already in your catalog.`,
    );
  }
  if (skippedHeader) parts.push("Header row skipped.");
  if (repeated > 0) parts.push(`${pluralize(repeated, "repeated row")} ignored.`);
  return parts.join(" ");
}
