/**
 * "Order" group of the PO editor: number (with live availability check), type, status,
 * payment terms and the ship window dates.
 */
import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Check, XCircle } from "lucide-react";
import { PO_STATUSES, PO_STATUS_LABELS, PO_TYPES, TERM_PRESETS } from "@shared/po";
import { FormSection, SegmentedControl } from "@/components/kit";
import { StatusDot } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { checkPoNumberTaken } from "@/lib/api";
import { parseDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays } from "date-fns";
import { addDaysInput, type EditorMode, type EditorValues } from "./editor-model";

const CUSTOM_TERMS = "__custom";

type Availability = { value: string; state: "checking" | "available" | "taken" } | null;

/** Debounced "is this PO number free?" check. Skips the PO's own current number when editing. */
function usePoNumberAvailability(poNumber: string, excludeId?: number, originalNumber?: string): Availability {
  const [result, setResult] = useState<Availability>(null);
  useEffect(() => {
    const value = (poNumber ?? "").trim();
    if (!value || value.length > 64 || (originalNumber && value.toLowerCase() === originalNumber.trim().toLowerCase())) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setResult((prev) => (prev && prev.value === value ? prev : { value, state: "checking" }));
    const timer = window.setTimeout(async () => {
      try {
        const taken = await checkPoNumberTaken(value, excludeId);
        if (!cancelled) setResult({ value, state: taken ? "taken" : "available" });
      } catch {
        if (!cancelled) setResult(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [poNumber, excludeId, originalNumber]);
  return result;
}

function Divider() {
  return <div aria-hidden className="-mr-4 h-px bg-border/70 md:-mr-5" />;
}

export function OrderSection({
  mode,
  poId,
  originalNumber,
  suggestedPoNumber,
}: {
  mode: EditorMode;
  poId?: number;
  originalNumber?: string;
  suggestedPoNumber?: string;
}) {
  const { control, setValue, getFieldState, getValues, trigger, formState } = useFormContext<EditorValues>();
  const poNumber = useWatch({ control, name: "poNumber" });
  const terms = useWatch({ control, name: "terms" });
  const startShipDate = useWatch({ control, name: "startShipDate" });
  const availability = usePoNumberAvailability(poNumber, poId, mode === "edit" ? originalNumber : undefined);
  const [customTerms, setCustomTerms] = useState(() => !!terms && !(TERM_PRESETS as readonly string[]).includes(terms));
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const isEdit = mode === "edit";

  const isPreset = (TERM_PRESETS as readonly string[]).includes(terms ?? "");
  const showCustom = customTerms || (!!terms && !isPreset);

  const canSuggest =
    availability?.state === "taken" &&
    !!suggestedPoNumber &&
    suggestedPoNumber.trim().toLowerCase() !== (poNumber ?? "").trim().toLowerCase();

  const revalidateCancel = () => {
    if (formState.isSubmitted || getFieldState("cancelDate").isTouched) void trigger("cancelDate");
  };

  /**
   * Moving the start date past the cancel date keeps the ship window length (like moving an event
   * in Calendar). Applied when the user commits the new date (blur), measured from the start date
   * they began with — so half-typed dates don't skew the window.
   */
  const startAtFocusRef = useRef<string | null>(null);
  const commitStartDate = () => {
    const next = getValues("startShipDate");
    const prev = startAtFocusRef.current ?? next;
    startAtFocusRef.current = null;
    const nextD = parseDate(next);
    const prevD = parseDate(prev);
    const cancelD = parseDate(getValues("cancelDate"));
    if (nextD && cancelD && nextD > cancelD) {
      const windowDays = prevD ? Math.max(0, differenceInCalendarDays(cancelD, prevD)) : 0;
      setValue("cancelDate", addDaysInput(next, windowDays), { shouldDirty: true });
    }
    revalidateCancel();
  };

  const poNumberField = (
    <FormField
      control={control}
      name="poNumber"
      render={({ field }) => (
        <FormItem>
          <div className="flex h-[13px] items-center justify-between gap-3">
            <FormLabel>PO Number</FormLabel>
            <AvailabilityLabel availability={availability} current={field.value} />
          </div>
          <FormControl>
            <Input
              {...field}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder={suggestedPoNumber || "e.g. 1001"}
              className="font-medium"
            />
          </FormControl>
          <FormMessage />
          {!getFieldState("poNumber", formState).error && availability?.state === "taken" && (
            <p className="text-[13px] leading-snug text-muted-foreground">
              Another purchase order already uses this number.
              {canSuggest && (
                <>
                  {" "}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-[13px] font-medium"
                    onClick={() => setValue("poNumber", suggestedPoNumber!, { shouldDirty: true, shouldValidate: true })}
                  >
                    Use {suggestedPoNumber}
                  </Button>
                </>
              )}
            </p>
          )}
        </FormItem>
      )}
    />
  );

  const poTypeField = (
    <FormField
      control={control}
      name="poType"
      render={({ field }) => (
        <FormItem>
          <div className="text-[13px] font-medium leading-none text-muted-foreground">PO Type</div>
          <SegmentedControl
            aria-label="PO type"
            value={field.value}
            onChange={(v) => field.onChange(v)}
            options={PO_TYPES.map((t) => ({ value: t, label: t }))}
            className="h-11 md:h-9"
          />
        </FormItem>
      )}
    />
  );

  const statusField = (
    <FormField
      control={control}
      name="status"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="block">Status</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {PO_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="flex items-center gap-2">
                    <StatusDot status={s} />
                    {PO_STATUS_LABELS[s]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const termsField = (
    <FormField
      control={control}
      name="terms"
      render={({ field, fieldState }) => {
        const trigger = (
          <SelectTrigger aria-label={showCustom ? "Payment terms preset" : undefined}>
            <SelectValue placeholder="Choose terms" />
          </SelectTrigger>
        );
        return (
          <FormItem>
            <FormLabel className="block">Payment Terms</FormLabel>
            <Select
              value={showCustom ? CUSTOM_TERMS : field.value || undefined}
              onValueChange={(v) => {
                if (v === CUSTOM_TERMS) {
                  setCustomTerms(true);
                  if (isPreset) field.onChange("");
                  window.setTimeout(() => customInputRef.current?.focus(), 50);
                } else {
                  setCustomTerms(false);
                  field.onChange(v);
                }
              }}
            >
              {showCustom ? trigger : <FormControl>{trigger}</FormControl>}
              <SelectContent>
                {TERM_PRESETS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={CUSTOM_TERMS}>Custom…</SelectItem>
              </SelectContent>
            </Select>
            {showCustom && (
              <FormControl>
                <Input
                  {...field}
                  ref={(el) => {
                    field.ref(el);
                    customInputRef.current = el;
                  }}
                  aria-label="Custom payment terms"
                  autoComplete="off"
                  placeholder="e.g. Net 30 EOM"
                  aria-invalid={!!fieldState.error}
                />
              </FormControl>
            )}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );

  const orderDateField = (
    <FormField
      control={control}
      name="orderDate"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="block">Order Date</FormLabel>
          <FormControl>
            <Input type="date" className="px-3 dark:[color-scheme:dark]" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const startDateField = (
    <FormField
      control={control}
      name="startShipDate"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="block">Start Ship Date</FormLabel>
          <FormControl>
            <Input
              type="date"
              className="px-3 dark:[color-scheme:dark]"
              {...field}
              onFocus={() => {
                if (startAtFocusRef.current === null) startAtFocusRef.current = field.value;
              }}
              onChange={(e) => {
                if (startAtFocusRef.current === null) startAtFocusRef.current = field.value;
                field.onChange(e);
                revalidateCancel();
              }}
              onBlur={() => {
                field.onBlur();
                commitStartDate();
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const cancelDateField = (
    <FormField
      control={control}
      name="cancelDate"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="block">Cancel Date</FormLabel>
          <FormControl>
            <Input type="date" className="px-3 dark:[color-scheme:dark]" min={startShipDate || undefined} {...field} />
          </FormControl>
          <FormMessage />
          {!getFieldState("cancelDate", formState).error && <FormDescription>Last day the order can ship</FormDescription>}
        </FormItem>
      )}
    />
  );

  return (
    <FormSection title="Order" id="po-order">
      {isEdit ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-5">
            {poNumberField}
            {statusField}
            {poTypeField}
            {termsField}
          </div>
          <Divider />
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4 md:grid-cols-3 md:gap-x-5">
            <div className="col-span-2 md:col-span-1">{orderDateField}</div>
            {startDateField}
            {cancelDateField}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 md:gap-x-5">
            {poNumberField}
            {poTypeField}
            {termsField}
            {orderDateField}
          </div>
          <Divider />
          <div className="grid grid-cols-2 items-start gap-x-3 gap-y-4 md:gap-x-5">
            {startDateField}
            {cancelDateField}
          </div>
        </>
      )}
    </FormSection>
  );
}

function AvailabilityLabel({ availability, current }: { availability: Availability; current: string }) {
  if (!availability || availability.value !== (current ?? "").trim()) return null;
  // Stay quiet while checking so the label doesn't flicker as the user types.
  if (availability.state === "checking") return null;
  const available = availability.state === "available";
  return (
    <span
      aria-live="polite"
      className={cn(
        "flex items-center gap-1 text-[13px] font-medium leading-none",
        available ? "text-[hsl(135_62%_30%)] dark:text-ios-green" : "text-destructive",
      )}
    >
      {available ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <XCircle className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
      {available ? "Available" : "Already used"}
    </span>
  );
}
