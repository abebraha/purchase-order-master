/**
 * The purchase-order compose screen (create / duplicate / edit), modeled on composing in Mail
 * or adding an event in Calendar: Cancel on the left, the save action on the right, grouped
 * form cards, and — on phones — a bottom toolbar with live totals and the primary button.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useForm, useWatch, type Control, type FieldErrors } from "react-hook-form";
import { Archive, ArrowDownToLine, CopyPlus, Eye, History, Loader2 } from "lucide-react";
import type { AppSettings, POFormValues, PurchaseOrder } from "@shared/po";
import { PageContainer, PageHeader, useHideMobileNav } from "@/components/layout/AppShell";
import { ConfirmDialog, ResponsiveDialog } from "@/components/common";
import { FormSection, IconTile, ListRow, ListSection, type IosColor } from "@/components/kit";
import PODocument from "@/components/po/PODocument";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { ApiError, useAddresses, useCreatePurchaseOrder, useUpdatePurchaseOrder } from "@/lib/api";
import { documentFromFormValues, type PODocumentData } from "@/lib/document";
import { formatDateTime, formatMoney, formatNumber, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddressField } from "./AddressField";
import { LineItemsEditor } from "./LineItemsEditor";
import { OrderSection } from "./editor-order-section";
import {
  clearDraft,
  editorResolver,
  editorTotals,
  formatDraftTime,
  loadDraft,
  saveDraft,
  toFormValues,
  type EditorDraft,
  type EditorMode,
  type EditorValues,
} from "./editor-model";

export interface PurchaseOrderFormProps {
  mode: EditorMode;
  defaultValues: EditorValues;
  settings: AppSettings;
  /** The PO being edited (edit mode). */
  po?: PurchaseOrder;
  /** The PO being copied (duplicate mode). */
  source?: PurchaseOrder;
  /** Next free PO number from the server (create/duplicate), filled in once it arrives. */
  suggestedPoNumber?: string;
}

const FORM_ID = "po-editor-form";

/** Field order on screen — used to describe the first problem in the validation toast. */
const FIELD_LABELS: Array<[keyof EditorValues, string]> = [
  ["poNumber", "PO number"],
  ["status", "Status"],
  ["poType", "PO type"],
  ["terms", "Payment terms"],
  ["orderDate", "Order date"],
  ["startShipDate", "Start ship date"],
  ["cancelDate", "Cancel date"],
  ["shipTo", "Ship To"],
  ["billTo", "Bill To"],
];
const ITEM_FIELDS = ["manualStyleNumber", "color", "description", "quantity", "price"] as const;

function firstErrorMessage(errors: FieldErrors<EditorValues>): string | undefined {
  for (const [key] of FIELD_LABELS) {
    const e = errors[key] as { message?: string } | undefined;
    if (e?.message) return e.message;
  }
  const items = errors.items as unknown as
    | (Array<Partial<Record<(typeof ITEM_FIELDS)[number], { message?: string }>> | undefined> & {
        message?: string;
        root?: { message?: string };
      })
    | undefined;
  if (items) {
    if (items.root?.message) return items.root.message;
    if (items.message) return items.message;
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (!row) continue;
      for (const f of ITEM_FIELDS) {
        if (row[f]?.message) return `Item ${i + 1}: ${row[f]!.message}`;
      }
    }
  }
  return undefined;
}

export function PurchaseOrderForm({ mode, defaultValues, settings, po, source, suggestedPoNumber }: PurchaseOrderFormProps) {
  useHideMobileNav();
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: addresses, isLoading: addressesLoading } = useAddresses();
  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder(po?.id ?? 0);

  const form = useForm<EditorValues, unknown, POFormValues>({
    defaultValues,
    resolver: editorResolver,
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: false,
  });
  const { control, handleSubmit, getValues, reset, resetField, setError, getFieldState, watch, formState } = form;
  /** FormField expects an untransformed Control; same object. */
  const fieldControl = control as unknown as Control<EditorValues>;
  const isDirty = formState.isDirty;
  const saving = createMutation.isPending || updateMutation.isPending;

  const formRef = useRef<HTMLFormElement>(null);
  const leavingRef = useRef(false);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const [confirmHref, setConfirmHref] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [preview, setPreview] = useState<PODocumentData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [draft, setDraft] = useState<EditorDraft | null>(() => (mode === "create" ? loadDraft(defaultValues) : null));

  const isEdit = mode === "edit";
  const backHref = isEdit && po ? `/purchase-orders/${po.id}` : mode === "duplicate" && source ? `/purchase-orders/${source.id}` : "/purchase-orders";
  const title = isEdit && po ? `Edit PO #${po.poNumber}` : "New Purchase Order";

  // Fill in the suggested PO number once it loads — unless the user already typed one.
  useEffect(() => {
    if (!suggestedPoNumber || isEdit) return;
    if (getFieldState("poNumber").isDirty || getValues("poNumber") === suggestedPoNumber) return;
    resetField("poNumber", { defaultValue: suggestedPoNumber });
  }, [suggestedPoNumber, isEdit, getFieldState, getValues, resetField]);

  // ---- Leaving safely ------------------------------------------------------

  // Browser reload / tab close.
  useEffect(() => {
    if (!isDirty || saving) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, saving]);

  // In-app links (sidebar, etc.) while there are unsaved changes → ask first.
  useEffect(() => {
    if (!isDirty) return;
    const onClick = (e: MouseEvent) => {
      if (leavingRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const href = url.pathname + url.search;
      if (href === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setConfirmHref(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [isDirty]);

  const leave = useCallback(
    (href: string) => {
      leavingRef.current = true;
      navigate(href);
    },
    [navigate],
  );

  const onCancel = () => {
    if (isDirty) setConfirmHref(backHref);
    else leave(backHref);
  };

  const discardAndLeave = () => {
    const href = confirmHref ?? backHref;
    setConfirmHref(null);
    if (mode === "create") clearDraft();
    leave(href);
  };

  // ---- Local draft (create mode) -------------------------------------------

  useEffect(() => {
    if (mode !== "create") return;
    let timer: number | undefined;
    const sub = watch(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!leavingRef.current && isDirtyRef.current) saveDraft(getValues());
      }, 800);
    });
    return () => {
      sub.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [mode, watch, getValues]);

  const restoreDraft = () => {
    if (!draft) return;
    reset(draft.values, { keepDefaultValues: true });
    setDraft(null);
    toast({ title: "Draft restored", description: "Pick up where you left off." });
  };

  const discardDraft = () => {
    clearDraft();
    setDraft(null);
  };

  // ---- Saving --------------------------------------------------------------

  const save = async (values: POFormValues, asDraft = false) => {
    const payload: POFormValues = asDraft ? { ...values, status: "draft" } : values;
    try {
      const saved = isEdit ? await updateMutation.mutateAsync(payload) : await createMutation.mutateAsync(payload);
      if (mode === "create") clearDraft();
      toast({
        title: isEdit ? "Changes saved" : asDraft ? "Draft saved" : "Purchase order created",
        description: `PO #${saved.poNumber} · ${formatMoney(saved.totalAmount)}`,
      });
      leave(`/purchase-orders/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("poNumber", { type: "server", message: "This PO number is already used. Try another one." });
        setFocusRequest((n) => n + 1);
        toast({ variant: "destructive", title: "PO number already used", description: err.message });
        return;
      }
      toast({
        variant: "destructive",
        title: isEdit ? "Couldn't save changes" : "Couldn't create the purchase order",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  const onInvalid = (errors: FieldErrors<EditorValues>) => {
    setFocusRequest((n) => n + 1);
    toast({
      variant: "destructive",
      title: "Check the highlighted fields",
      description: firstErrorMessage(errors),
    });
  };

  const submit = handleSubmit((values) => save(values), onInvalid);
  const submitDraft = handleSubmit((values) => save(values, true), onInvalid);

  // Scroll to and focus the first invalid field (in screen order) after a failed submit.
  useEffect(() => {
    if (!focusRequest) return;
    const raf = requestAnimationFrame(() => {
      const root = formRef.current;
      if (!root) return;
      const el =
        root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        root.querySelector<HTMLElement>('[data-invalid-section="true"]');
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      if (typeof el.focus === "function") el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusRequest]);

  // ⌘S / Ctrl+S saves.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Preview -------------------------------------------------------------

  const openPreview = () => setPreview(documentFromFormValues(toFormValues(getValues())));

  const downloadPdf = async () => {
    if (!preview) return;
    setDownloading(true);
    try {
      const { downloadPOPdf } = await import("@/lib/pdf");
      await downloadPOPdf(preview, settings);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't create the PDF",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  // ---- Render --------------------------------------------------------------

  const primaryLabel = isEdit ? "Save" : "Create";
  const spinner = <Loader2 className="animate-spin" aria-hidden />;

  const shipTo = useWatch({ control, name: "shipTo" });
  const billTo = useWatch({ control, name: "billTo" });
  const companyAddress = [settings.company?.name, settings.company?.address].map((v) => v?.trim()).filter(Boolean).join("\n");

  const setBillTo = (value: string) =>
    form.setValue("billTo", value, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: formState.isSubmitted || getFieldState("billTo").isTouched,
    });

  return (
    <>
      <PageHeader
        largeTitle={false}
        width="wide"
        title={title}
        leading={
          <Button type="button" variant="plain" onClick={onCancel} className="-ml-1 h-11 px-2 text-[17px] font-normal md:h-9 md:text-[15px]">
            Cancel
          </Button>
        }
        actions={
          <>
            <Button
              type="button"
              variant="plain"
              onClick={() => void submit()}
              disabled={saving}
              className="h-11 px-2 text-[17px] font-semibold md:hidden"
            >
              {saving ? spinner : primaryLabel}
            </Button>
            <div className="hidden items-center gap-2 md:flex">
              <Button type="button" variant="tinted" size="sm" onClick={openPreview} aria-label="Preview" className="max-xl:w-8 max-xl:px-0">
                <Eye aria-hidden />
                <span className="hidden xl:inline">Preview</span>
              </Button>
              {!isEdit && (
                <Button type="button" variant="tinted" size="sm" onClick={() => void submitDraft()} disabled={saving}>
                  Save as Draft
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => void submit()} disabled={saving}>
                {saving && spinner}
                {isEdit ? (
                  "Save Changes"
                ) : (
                  <>
                    <span className="xl:hidden">Create</span>
                    <span className="hidden xl:inline">Create Purchase Order</span>
                  </>
                )}
              </Button>
            </div>
          </>
        }
      />

      <PageContainer width="narrow">
        <Form {...form}>
          <form
            id={FORM_ID}
            ref={formRef}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-7 md:space-y-8"
          >
            {(draft || (isEdit && po?.archivedAt) || (mode === "duplicate" && source)) && (
              <div className="space-y-3">
                {draft && (
                  <Notice
                    icon={History}
                    color="orange"
                    title="Continue your unsaved purchase order?"
                    description={`You started one ${formatDraftTime(draft.savedAt)}.`}
                    actions={
                      <>
                        <Button type="button" size="sm" variant="tinted" onClick={restoreDraft}>
                          Restore
                        </Button>
                        <Button type="button" size="sm" variant="plain" className="text-muted-foreground" onClick={discardDraft}>
                          Discard
                        </Button>
                      </>
                    }
                  />
                )}
                {isEdit && po?.archivedAt && (
                  <Notice
                    icon={Archive}
                    color="gray"
                    title="This purchase order is archived"
                    description={`Archived ${formatDateTime(po.archivedAt)}. You can still edit it; restore it from the order page to make it active again.`}
                  />
                )}
                {mode === "duplicate" && source && (
                  <p className="flex items-center gap-1.5 px-4 text-[13px] text-muted-foreground">
                    <CopyPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Copied from PO #{source.poNumber} · dates start today
                  </p>
                )}
              </div>
            )}

            <OrderSection
              mode={mode}
              poId={po?.id}
              originalNumber={po?.poNumber}
              suggestedPoNumber={suggestedPoNumber}
            />

            <FormSection title="Addresses" id="po-addresses">
              <div className="grid gap-5 md:grid-cols-2 md:gap-x-5">
                <AddressField
                  name="shipTo"
                  label="Ship To"
                  suggestions={addresses?.shipTo}
                  loading={addressesLoading}
                  placeholder={"Where the goods go\nStreet address\nCity, State ZIP"}
                />
                <AddressField
                  name="billTo"
                  label="Bill To"
                  suggestions={addresses?.billTo}
                  loading={addressesLoading}
                  placeholder={"Who pays\nStreet address\nCity, State ZIP"}
                  actions={
                    <>
                      <Button
                        type="button"
                        variant="tinted"
                        size="sm"
                        disabled={!shipTo?.trim() || shipTo.trim() === billTo?.trim()}
                        onClick={() => setBillTo(shipTo)}
                      >
                        Same as Ship To
                      </Button>
                      {companyAddress && (
                        <Button
                          type="button"
                          variant="tinted"
                          size="sm"
                          disabled={companyAddress === billTo?.trim()}
                          onClick={() => setBillTo(companyAddress)}
                        >
                          Company Address
                        </Button>
                      )}
                    </>
                  }
                />
              </div>
            </FormSection>

            <LineItemsEditor />

            <FormSection title="Notes" id="po-notes">
              <FormField
                control={fieldControl}
                name="specialInstructions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block">Special Instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Packing, labeling or shipping requests"
                        className="resize-none [field-sizing:content]"
                      />
                    </FormControl>
                    <FormDescription>Printed on the purchase order</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={fieldControl}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="block">Internal Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={3}
                        placeholder="Anything your team should know"
                        className="resize-none [field-sizing:content]"
                      />
                    </FormControl>
                    <FormDescription>Only visible to your team — not printed</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            {!isEdit && (
              <ListSection className="md:hidden" footer="Save it now and finish it later. Drafts stay in your orders list.">
                <ListRow
                  onClick={() => void submitDraft()}
                  disabled={saving}
                  title={<span className="text-primary">Save as Draft</span>}
                />
              </ListSection>
            )}

            {/* Room for the phone toolbar */}
            <div aria-hidden className="h-6 md:hidden" />
            {/* Desktop: Enter in a text field submits. Phones have no implicit submit, so the
                keyboard's return key never sends a half-finished order. */}
            {isDesktop && (
              <button type="submit" tabIndex={-1} aria-hidden className="sr-only">
                Save
              </button>
            )}
          </form>
        </Form>
      </PageContainer>

      <PhoneToolbar
        control={control}
        primaryLabel={primaryLabel}
        saving={saving}
        onSubmit={() => void submit()}
        onPreview={openPreview}
      />

      <ConfirmDialog
        open={confirmHref !== null}
        onOpenChange={(open) => !open && setConfirmHref(null)}
        title="Discard changes?"
        description={
          isEdit
            ? "Your changes to this purchase order won't be saved."
            : "This purchase order hasn't been saved yet. If you leave, it will be discarded."
        }
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        destructive
        onConfirm={discardAndLeave}
      />

      <ResponsiveDialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
        title="Preview"
        description={preview ? `PO #${preview.poNumber || "—"} · ${formatMoney(preview.totalAmount)}` : undefined}
        className="sm:max-w-4xl"
        footer={
          <>
            <Button type="button" onClick={() => void downloadPdf()} disabled={downloading}>
              {downloading ? spinner : <ArrowDownToLine aria-hidden />}
              Download PDF
            </Button>
            <Button type="button" variant="secondary" className="order-last md:order-first" onClick={() => setPreview(null)}>
              Done
            </Button>
          </>
        }
      >
        {preview && <PODocument data={preview} settings={settings} />}
      </ResponsiveDialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Notice({
  icon,
  color,
  title,
  description,
  actions,
}: {
  icon: typeof History;
  color: IosColor;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconTile icon={icon} color={color} />
        <div className="min-w-0 pt-0.5">
          <p className="text-[15px] font-semibold leading-5">{title}</p>
          {description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1 pl-[41px] sm:pl-0">{actions}</div>}
    </div>
  );
}

function PhoneToolbar({
  control,
  primaryLabel,
  saving,
  onSubmit,
  onPreview,
}: {
  control: Control<EditorValues, unknown, POFormValues>;
  primaryLabel: string;
  saving: boolean;
  onSubmit: () => void;
  onPreview: () => void;
}) {
  const items = useWatch({ control, name: "items" });
  const totals = editorTotals(items);
  return (
    <div className="material-bar hairline-t no-print fixed inset-x-0 bottom-0 z-40 pb-safe md:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] leading-4 text-muted-foreground tabular-nums">
            {pluralize(totals.itemCount, "item")} · {formatNumber(totals.totalQuantity)} units
          </div>
          <div className="truncate text-[17px] font-semibold leading-6 tabular-nums">{formatMoney(totals.totalAmount)}</div>
        </div>
        <Button type="button" variant="tinted" onClick={onPreview} className="px-4">
          Preview
        </Button>
        <Button type="button" onClick={onSubmit} disabled={saving} className={cn("min-w-[92px] px-5")}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : primaryLabel}
        </Button>
      </div>
    </div>
  );
}
