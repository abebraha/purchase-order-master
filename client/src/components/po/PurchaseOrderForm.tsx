/**
 * The purchase-order compose screen (create / duplicate / edit), modeled on composing in Mail
 * or adding an event in Calendar: Cancel on the left, the save action on the right, grouped
 * form cards, and — on phones — a bottom toolbar with live totals and the primary button.
 *
 * Nothing the owner typed is lost silently:
 *  - unsaved changes autosave to this device (per PO) and are offered again on reopening;
 *  - in-app links and tab close ask first (useUnsavedChanges);
 *  - a save made on top of changes from another device/screen is refused by the server (412)
 *    and the owner chooses: review the latest version (their edits are kept to restore) or
 *    save their version anyway.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, type Control, type FieldErrors, type FieldPath } from "react-hook-form";
import { Archive, ArrowDownToLine, CopyPlus, Eye, History, Loader2, RefreshCw } from "lucide-react";
import type { AppSettings, CustomerFormValues, CustomerRecord, POFormValues, PurchaseOrder, StyleRecord } from "@shared/po";
import { PageContainer, PageHeader, useHideMobileNav } from "@/components/layout/AppShell";
import { ResponsiveDialog } from "@/components/common";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { PREFILL_FIELDS, matchCustomer } from "@/components/customers/customerUtils";
import { FormSection, IconTile, ListRow, ListSection, type IosColor } from "@/components/kit";
import PODocument from "@/components/po/PODocument";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { UnsavedChangesDialog, useUnsavedChanges, type UnsavedChangesGuard } from "@/hooks/use-unsaved-changes";
import {
  ApiError,
  api,
  invalidateStyles,
  keys,
  useAddresses,
  useCreatePurchaseOrder,
  useUpdatePurchaseOrder,
} from "@/lib/api";
import { documentFromFormValues, type PODocumentData } from "@/lib/document";
import { formatDateTime, formatMoney, formatNumber, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AddressField } from "./AddressField";
import { CustomerSection, useCustomerPicker } from "./CustomerSection";
import { LineItemsEditor } from "./LineItemsEditor";
import type { StyleSelection } from "./StyleCombobox";
import { OrderSection } from "./editor-order-section";
import {
  clearDraft,
  companyAddressText,
  draftKey,
  editorResolver,
  editorTotals,
  formatDraftTime,
  leaveEditor,
  loadDraft,
  noCustomerDetails,
  sameEditorValues,
  saveDraft,
  toFormValues,
  validateDraft,
  valuesFromPurchaseOrder,
  withOriginalDates,
  type DraftIssue,
  type EditorDraft,
  type EditorMode,
  type EditorValues,
} from "./editor-model";

export interface PurchaseOrderFormProps {
  mode: EditorMode;
  defaultValues: EditorValues;
  settings: AppSettings;
  /** The PO being edited (edit mode). May be refreshed in the background while editing. */
  po?: PurchaseOrder;
  /** The PO being copied (duplicate mode). */
  source?: PurchaseOrder;
  /** Next free PO number from the server (create/duplicate), filled in once it arrives. */
  suggestedPoNumber?: string;
}

/** What the editor sends: form values plus, when editing, the version it started from. */
type POWrite = POFormValues & { expectedVersion?: string };

/** Unsaved changes offered at the top of the form. */
type HeldDraft = EditorDraft & {
  /** "autosave": left without saving earlier; "conflict": set aside by Review Latest. */
  reason: "autosave" | "conflict";
};

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

function issueMessage(issue: DraftIssue | undefined): string | undefined {
  if (!issue) return undefined;
  const item = issue.path.match(/^items\.(\d+)\./);
  return item ? `Item ${Number(item[1]) + 1}: ${issue.message}` : issue.message;
}

export function PurchaseOrderForm({ mode, defaultValues, settings, po, source, suggestedPoNumber }: PurchaseOrderFormProps) {
  useHideMobileNav();
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: addresses, isLoading: addressesLoading } = useAddresses();
  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder(po?.id ?? 0);

  const isEdit = mode === "edit";

  /**
   * Edit mode: the saved PO the form was filled from. The page refreshes `po` in the background;
   * saves are checked against what the owner actually started from (`expectedVersion`).
   */
  const [base, setBase] = useState<PurchaseOrder | undefined>(po);
  const expectedVersionRef = useRef<string | undefined>(po?.version);
  const storageKey = draftKey(mode, isEdit ? po?.id : source?.id);

  const form = useForm<EditorValues, unknown, POFormValues>({
    defaultValues,
    resolver: editorResolver,
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: false,
  });
  const { control, handleSubmit, getValues, reset, resetField, setError, clearErrors, getFieldState, watch, formState } = form;
  /** FormField expects an untransformed Control; same object. */
  const fieldControl = control as unknown as Control<EditorValues>;
  const isDirty = formState.isDirty;
  const saving = createMutation.isPending || updateMutation.isPending;

  const guard = useUnsavedChanges(isDirty);

  const formRef = useRef<HTMLFormElement>(null);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  /** Synchronous "a save is in progress" flag: ⌘S, Enter and the buttons can't send twice. */
  const busyRef = useRef(false);
  /** Saved or discarded — the editor is on its way out; stop autosaving. */
  const doneRef = useRef(false);
  /** Styles added to the catalog from this editor ("Add “X” to Styles"). */
  const createdStylesRef = useRef(new Map<number, StyleSelection>());

  const [focusRequest, setFocusRequest] = useState(0);
  const [preview, setPreview] = useState<PODocumentData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [conflict, setConflict] = useState<{ values: POFormValues; asDraft: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [draft, setDraft] = useState<HeldDraft | null>(() => {
    const stored = loadDraft(storageKey, defaultValues);
    if (!stored) return null;
    if (sameEditorValues(stored.values, defaultValues)) {
      clearDraft(storageKey); // nothing unsaved after all
      return null;
    }
    return { ...stored, reason: "autosave" };
  });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [newCustomer, setNewCustomer] = useState<Partial<CustomerFormValues> | null>(null);
  const newCustomerOpenRef = useRef(false);
  newCustomerOpenRef.current = newCustomer !== null;
  const customerPicker = useCustomerPicker(form, settings);

  const backHref = isEdit && base ? `/purchase-orders/${base.id}` : mode === "duplicate" && source ? `/purchase-orders/${source.id}` : "/purchase-orders";
  const title = isEdit && base ? `Edit PO #${base.poNumber}` : "New Purchase Order";

  // Fill in the suggested PO number once it loads — unless the user already typed one. If they're
  // in the field right now, wait until they leave it (so it never lands in the middle of typing).
  useEffect(() => {
    if (!suggestedPoNumber || isEdit) return;
    const apply = () => {
      if (getFieldState("poNumber").isDirty || getValues("poNumber")?.trim()) return;
      resetField("poNumber", { defaultValue: suggestedPoNumber });
    };
    const input = formRef.current?.querySelector<HTMLInputElement>('input[name="poNumber"]');
    if (input && document.activeElement === input) {
      input.addEventListener("blur", apply, { once: true });
      return () => input.removeEventListener("blur", apply);
    }
    apply();
  }, [suggestedPoNumber, isEdit, getFieldState, getValues, resetField]);

  // ---- Leaving -------------------------------------------------------------

  /** Cancel / discard: back to where the owner came from (or the fallback page). */
  const exit = useCallback(() => {
    leaveEditor(backHref, (href) => guard.leave(href, { replace: true }));
  }, [backHref, guard]);

  const cancelRequestedRef = useRef(false);

  const onCancel = () => {
    if (!isDirty) {
      doneRef.current = true;
      exit();
      return;
    }
    cancelRequestedRef.current = true;
    guard.requestLeave(backHref);
  };

  /** The "Discard changes?" dialog (Cancel and in-app links). Discarding also drops the autosave. */
  const discardGuard: UnsavedChangesGuard = {
    ...guard,
    confirm: () => {
      doneRef.current = true;
      clearDraft(storageKey);
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false;
        guard.cancel();
        exit();
      } else {
        guard.confirm();
      }
    },
    cancel: () => {
      cancelRequestedRef.current = false;
      guard.cancel();
    },
  };

  // ---- Autosave (every mode) ------------------------------------------------

  useEffect(() => {
    let timer: number | undefined;
    const flush = () => {
      timer = undefined;
      if (doneRef.current) return;
      if (isDirtyRef.current) saveDraft(storageKey, getValues(), isEdit ? expectedVersionRef.current : undefined);
      else if (!draftRef.current) clearDraft(storageKey);
    };
    const sub = watch(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 800);
    });
    // iOS may close a backgrounded page without warning: save right away.
    const onHide = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        flush();
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      sub.unsubscribe();
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      // Leaving (e.g. browser Back) within the debounce: keep the last keystrokes too.
      onHide();
    };
  }, [watch, getValues, storageKey, isEdit]);

  const restoreDraft = () => {
    if (!draft) return;
    reset(draft.values, { keepDefaultValues: true });
    // Changes made on an older version stay checked against that version when saving.
    if (isEdit && draft.baseVersion) expectedVersionRef.current = draft.baseVersion;
    setDraft(null);
    toast(
      isEdit
        ? { title: "Changes restored", description: "Save to keep them." }
        : { title: "Draft restored", description: "Pick up where you left off." },
    );
  };

  const discardDraft = () => {
    clearDraft(storageKey);
    setDraft(null);
  };

  // ---- Changes made elsewhere ------------------------------------------------

  /**
   * Show `latest` in the form. `held` (the owner's unsaved values) is kept at the top of the form
   * so it can be restored — nothing typed disappears without a way back.
   */
  const showLatest = useCallback(
    (latest: PurchaseOrder, held?: EditorValues) => {
      const loaded = valuesFromPurchaseOrder(latest);
      // A full reset clears the picked customer; match it again the way the picker does on load
      // (against the list as it is now: Review Latest runs this after an await).
      const customers = queryClient.getQueryData<CustomerRecord[]>(keys.customers());
      const match = customers?.length ? matchCustomer(customers, loaded) : null;
      const next: EditorValues = { ...loaded, customerId: match?.id ?? null };
      setBase(latest);
      expectedVersionRef.current = latest.version;
      reset(next);
      if (held && !sameEditorValues(held, next)) {
        const kept: HeldDraft = { savedAt: new Date().toISOString(), values: held, baseVersion: latest.version, reason: "conflict" };
        setDraft(kept);
        saveDraft(storageKey, held, latest.version);
      }
      return !!held && !sameEditorValues(held, next);
    },
    [reset, storageKey, queryClient],
  );

  const reviewLatest = async () => {
    if (!base || reviewing) return;
    const held = getValues();
    setReviewing(true);
    try {
      // Straight from the server: the cached copy is what the editor started from (and a
      // signed-out device must see an error here, not that copy presented as the latest).
      const latest = await api<PurchaseOrder>("GET", `/api/purchase-orders/${base.id}`);
      queryClient.setQueryData(keys.purchaseOrder(base.id), latest);
      setConflict(null);
      const keptEdits = showLatest(latest, held);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast({
        title: "Latest version loaded",
        description: keptEdits ? "Your edits weren't saved. You can restore them at the top of the form." : undefined,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't load the latest version",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setReviewing(false);
    }
  };

  // The page refreshes the PO in the background (e.g. when the window regains focus).
  const outdated =
    isEdit && !!po?.version && !!expectedVersionRef.current && po.version !== expectedVersionRef.current && !saving && !doneRef.current;

  useEffect(() => {
    // Nothing typed yet (and nothing waiting to be restored): just show the latest version.
    if (!outdated || !po || isDirtyRef.current || draftRef.current || conflict) return;
    if (po.version === expectedVersionRef.current) return;
    showLatest(po);
    toast({ title: "Order updated", description: "Showing changes saved somewhere else." });
  }, [outdated, po, conflict, showLatest, toast]);

  // ---- Saving --------------------------------------------------------------

  /** Fills in color/description of styles added from this editor (they're usually blank when added). */
  const completeNewStyles = (saved: PurchaseOrder) => {
    const catalog = queryClient.getQueryData<StyleRecord[]>(keys.styles()) ?? [];
    createdStylesRef.current.forEach((added, id) => {
      const line = saved.items.find((i) => i.styleId === id);
      if (!line) return;
      const current = catalog.find((s) => s.id === id);
      const styleNumber = current?.styleNumber ?? added.styleNumber;
      const color = (current?.color ?? added.color ?? "").trim();
      const description = (current?.description ?? added.description ?? "").trim();
      const next = { styleNumber, color: color || line.color.trim(), description: description || line.description.trim() };
      if (next.color === color && next.description === description) return;
      void api("PUT", `/api/styles/${id}`, next)
        .then(() => invalidateStyles())
        .catch(() => {
          // Best effort: the PO line keeps its details either way.
        });
    });
  };

  /** Sends the PO. Returns true when it was saved (and the editor is leaving). */
  const save = async (values: POFormValues, asDraft: boolean, { overwrite = false } = {}): Promise<boolean> => {
    let payload: POWrite = asDraft ? { ...values, status: "draft" } : { ...values };
    if (isEdit) {
      payload = withOriginalDates(payload, base);
      if (!overwrite) payload.expectedVersion = expectedVersionRef.current;
    }
    try {
      const saved = isEdit ? await updateMutation.mutateAsync(payload) : await createMutation.mutateAsync(payload);
      doneRef.current = true;
      clearDraft(storageKey);
      completeNewStyles(saved);
      setConflict(null);
      toast({
        title: isEdit ? "Changes saved" : asDraft ? "Draft saved" : "Purchase order created",
        description: `PO #${saved.poNumber} · ${formatMoney(saved.totalAmount)}`,
      });
      const href = `/purchase-orders/${saved.id}`;
      // The compose screen doesn't stay in history: Back from the saved PO goes where you were.
      if (isEdit) leaveEditor(href, (to) => guard.leave(to, { replace: true }), { onlyIfPrevious: true });
      else guard.leave(href, { replace: true });
      return true;
    } catch (err) {
      if (isEdit && err instanceof ApiError && err.status === 412) {
        setConflict({ values, asDraft });
        return false;
      }
      setConflict(null);
      if (err instanceof ApiError && err.status === 409) {
        setError("poNumber", { type: "server", message: "This PO number is already used. Try another one." });
        setFocusRequest((n) => n + 1);
        toast({ variant: "destructive", title: "PO number already used", description: err.message });
        return false;
      }
      toast({
        variant: "destructive",
        title: isEdit ? "Couldn't save changes" : "Couldn't create the purchase order",
        description: err instanceof Error ? err.message : "Please try again.",
      });
      return false;
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

  /** "Save as Draft": only the PO number and dates need to be valid; empty item rows are dropped. */
  const saveAsDraft = async (): Promise<boolean> => {
    const result = validateDraft({ ...getValues(), status: "draft" });
    clearErrors();
    if (!result.ok) {
      for (const issue of result.issues) {
        setError(issue.path as FieldPath<EditorValues>, { type: "draft", message: issue.message });
      }
      setFocusRequest((n) => n + 1);
      toast({ variant: "destructive", title: "Check the highlighted fields", description: issueMessage(result.issues[0]) });
      return false;
    }
    return save(result.values, true);
  };

  /** Every way of saving goes through here (buttons, ⌘S, Enter), one at a time. */
  const runSave = async (asDraft: boolean, options?: { overwrite?: boolean }) => {
    // While the "changed since you opened it" question is open, only its buttons save.
    if (busyRef.current || (conflict && !options?.overwrite)) return;
    busyRef.current = true;
    let left = false;
    try {
      if (isEdit && !asDraft && !options?.overwrite && !isDirtyRef.current && base) {
        // Nothing changed: just close (no request, so no "saved with no changes" history entry,
        // and no "changed since you opened it" question about edits nobody made).
        left = true;
        doneRef.current = true;
        toast({ title: "No changes to save" });
        const href = `/purchase-orders/${base.id}`;
        leaveEditor(href, (to) => guard.leave(to, { replace: true }), { onlyIfPrevious: true });
      } else if (options?.overwrite && conflict) {
        left = await save(conflict.values, conflict.asDraft, { overwrite: true });
      } else if (asDraft) {
        left = await saveAsDraft();
      } else {
        // A PO whose status is Draft is validated like a draft (see editorResolver).
        await handleSubmit(async (values) => {
          left = await save(values, false);
        }, onInvalid)();
      }
    } finally {
      // After a successful save the editor is leaving: stay locked so nothing is sent twice.
      if (!left) busyRef.current = false;
    }
  };

  const submit = () => void runSave(false);
  const submitDraft = () => void runSave(true);

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

  // ⌘S / Ctrl+S saves (not while adding a customer on top of the order).
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!busyRef.current && !newCustomerOpenRef.current) submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- New customer --------------------------------------------------------

  /** Opens "Add Customer"; with no customer picked, it starts from the details typed on this order. */
  const openNewCustomer = () => {
    const values = getValues();
    const defaults = noCustomerDetails(settings);
    const seed: Partial<CustomerFormValues> = {};
    if (!customerPicker.selected) {
      for (const field of PREFILL_FIELDS) {
        const value = (values[field] ?? "").trim();
        if (value && value !== defaults[field].trim()) seed[field] = value;
      }
    }
    setNewCustomer(seed);
  };

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
  const companyAddress = companyAddressText(settings);

  const setBillTo = (value: string) =>
    form.setValue("billTo", value, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: formState.isSubmitted || getFieldState("billTo").isTouched,
    });

  const onStyleAdded = (selection: StyleSelection) => {
    if (selection.styleId) createdStylesRef.current.set(selection.styleId, selection);
  };

  const draftNotice = draft && (() => {
    const when = formatDraftTime(draft.savedAt);
    if (draft.reason === "conflict") {
      return {
        title: "Your edits weren't saved",
        description: "You're seeing the latest version. Restore your edits to replace it with your version.",
      };
    }
    if (isEdit) {
      const changedSince = !!draft.baseVersion && !!base?.version && draft.baseVersion !== base.version;
      return {
        title: "Continue editing?",
        description: `You have unsaved changes from ${when}.${changedSince ? " This order has been changed since then." : ""}`,
      };
    }
    return {
      title: "Continue your unsaved purchase order?",
      description: mode === "duplicate" ? `You started a copy ${when}.` : `You started one ${when}.`,
    };
  })();

  const showNotices = !!draftNotice || (outdated && isDirty) || (isEdit && base?.archivedAt) || (mode === "duplicate" && source);

  return (
    <>
      <PageHeader
        largeTitle={false}
        width="default"
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
              onClick={submit}
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
                <Button type="button" variant="tinted" size="sm" onClick={submitDraft} disabled={saving}>
                  Save as Draft
                </Button>
              )}
              <Button type="button" size="sm" onClick={submit} disabled={saving}>
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

      <PageContainer width="default">
        <Form {...form}>
          <form
            id={FORM_ID}
            ref={formRef}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-7 md:space-y-8"
          >
            {showNotices && (
              <div className="space-y-3">
                {draftNotice && (
                  <Notice
                    icon={History}
                    color="orange"
                    title={draftNotice.title}
                    description={draftNotice.description}
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
                {outdated && isDirty && !draftNotice && (
                  <Notice
                    icon={RefreshCw}
                    color="orange"
                    title="This order was changed somewhere else"
                    description="Someone (or another device) saved changes after you started editing."
                    actions={
                      <Button type="button" size="sm" variant="tinted" onClick={() => void reviewLatest()} disabled={reviewing}>
                        Review Latest
                      </Button>
                    }
                  />
                )}
                {isEdit && base?.archivedAt && (
                  <Notice
                    icon={Archive}
                    color="gray"
                    title="This purchase order is archived"
                    description={`Archived ${formatDateTime(base.archivedAt)}. You can still edit it; restore it from the order page to make it active again.`}
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

            <CustomerSection picker={customerPicker} onAddCustomer={openNewCustomer} />

            <OrderSection mode={mode} poId={base?.id} originalNumber={base?.poNumber} suggestedPoNumber={suggestedPoNumber} />

            <FormSection title="Addresses" id="po-addresses">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-x-5">
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

            <LineItemsEditor onStyleAdded={onStyleAdded} />

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
                <ListRow onClick={submitDraft} disabled={saving} title={<span className="text-primary">Save as Draft</span>} />
              </ListSection>
            )}

            {/* Room for the phone toolbar */}
            <div aria-hidden className="h-6 md:hidden" />
            {/* Desktop: Enter in a text field submits. Phones have no implicit submit, so the
                keyboard's return key never sends a half-finished order. */}
            {isDesktop && (
              <button type="submit" tabIndex={-1} aria-hidden disabled={saving} className="sr-only">
                Save
              </button>
            )}
          </form>
        </Form>
      </PageContainer>

      <PhoneToolbar control={control} primaryLabel={primaryLabel} saving={saving} onSubmit={submit} onPreview={openPreview} />

      <UnsavedChangesDialog
        guard={discardGuard}
        description={
          isEdit
            ? "Your changes to this purchase order won't be saved."
            : "This purchase order hasn't been saved yet. If you leave, it will be discarded."
        }
      />

      <ConflictDialog
        open={conflict !== null}
        saving={saving}
        reviewing={reviewing}
        onReviewLatest={() => void reviewLatest()}
        onSaveMine={() => void runSave(false, { overwrite: true })}
        onKeepEditing={() => setConflict(null)}
      />

      <CustomerFormDialog
        open={newCustomer !== null}
        onOpenChange={(open) => !open && setNewCustomer(null)}
        customer={null}
        customers={customerPicker.customers}
        initialValues={newCustomer ?? undefined}
        onSaved={(saved) => customerPicker.choose(saved)}
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

/** Shown when the server refuses a save because the PO changed after the editor loaded it. */
function ConflictDialog({
  open,
  saving,
  reviewing,
  onReviewLatest,
  onSaveMine,
  onKeepEditing,
}: {
  open: boolean;
  saving: boolean;
  reviewing: boolean;
  onReviewLatest: () => void;
  onSaveMine: () => void;
  onKeepEditing: () => void;
}) {
  const busy = saving || reviewing;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onKeepEditing()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This order changed since you opened it</AlertDialogTitle>
          <AlertDialogDescription>
            Someone (or another device) saved changes after you started editing. Saving your version replaces theirs.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex sm:flex-col">
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onReviewLatest();
            }}
          >
            {reviewing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Review Latest
          </AlertDialogAction>
          <Button type="button" variant="tinted" disabled={busy} onClick={onSaveMine}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save My Version
          </Button>
          <AlertDialogCancel disabled={busy} className="bg-transparent text-primary hover:bg-primary/10">
            Keep Editing
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
