/**
 * "Customer" group of the PO editor. Picking a saved customer fills in their addresses, payment
 * terms and special instructions; everything stays editable, and "No Customer" is always there
 * for orders typed by hand — a PO never needs a saved customer.
 */
import { useEffect, useMemo } from "react";
import { useController, type UseFormReturn } from "react-hook-form";
import type { AppSettings, CustomerRecord, POFormValues } from "@shared/po";
import { FormSection } from "@/components/kit";
import { ToastAction } from "@/components/ui/toast";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCustomers } from "@/lib/api";
import { firstLine } from "@/lib/format";
import {
  PREFILL_FIELDS,
  contactLine,
  listFields,
  matchCustomer,
  pickPrefill,
  sortCustomers,
  switchCustomer,
  type PrefillValues,
} from "@/components/customers/customerUtils";
import { noCustomerDetails, type EditorValues } from "./editor-model";

const NONE = "__none";
const ADD = "__add";

export type CustomerPicker = ReturnType<typeof useCustomerPicker>;

/** Customer selection for the editor form; `choose` fills the form in from a customer. */
export function useCustomerPicker(form: UseFormReturn<EditorValues, unknown, POFormValues>, settings: AppSettings) {
  const { data: customers, isLoading } = useCustomers();
  const { toast } = useToast();
  const { control, getValues, setValue, getFieldState, resetField, formState } = form;
  // Registered like an input (it has none), so resetField and dirty tracking work for it.
  const {
    field: { value: customerId },
  } = useController({ control, name: "customerId" });
  const selected = customers?.find((c) => c.id === customerId) ?? null;
  const fallback = useMemo(() => noCustomerDetails(settings), [settings]);

  // Addresses that belong to exactly one saved customer (editing or copying their order) → show
  // that customer as picked. Not a change the user made, so it doesn't count as unsaved.
  useEffect(() => {
    if (!customers?.length || getValues("customerId") !== null || getFieldState("customerId").isDirty) return;
    const match = matchCustomer(customers, getValues());
    if (match) resetField("customerId", { defaultValue: match.id });
  }, [customers, getValues, getFieldState, resetField]);

  const apply = (values: PrefillValues, id: number | null) => {
    setValue("customerId", id, { shouldDirty: true });
    for (const field of PREFILL_FIELDS) {
      if (getValues(field) === values[field]) continue;
      setValue(field, values[field], {
        shouldDirty: true,
        shouldValidate: formState.isSubmitted || getFieldState(field).isTouched,
      });
    }
  };

  const choose = (next: CustomerRecord | null) => {
    const previousId = getValues("customerId");
    const before = pickPrefill(getValues());
    const after = switchCustomer(before, selected, next, fallback);
    const changed = PREFILL_FIELDS.filter((f) => after[f] !== before[f]);
    apply(after, next?.id ?? null);
    if (!changed.length) return;
    toast({
      title: next ? `Filled in from ${next.name}` : "Customer removed",
      description: next
        ? `Updated ${listFields(changed)}.`
        : `${listFields(changed).replace(/^./, (c) => c.toUpperCase())} went back to your defaults.`,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => apply(before, previousId)}
          className="h-8 rounded-full border-0 bg-primary/10 px-3.5 font-semibold text-primary hover:bg-primary/15 focus:ring-0 focus:ring-offset-0 dark:bg-primary/20"
        >
          Undo
        </ToastAction>
      ),
    });
  };

  return { customers, isLoading, selected, choose };
}

export function CustomerSection({ picker, onAddCustomer }: { picker: CustomerPicker; onAddCustomer: () => void }) {
  const { customers, isLoading, selected, choose } = picker;
  const sorted = useMemo(() => sortCustomers(customers ?? []), [customers]);

  const footer = selected
    ? "Their saved details are filled in below. Changes you make here only affect this order."
    : sorted.length
      ? "Optional. Pick a saved customer to fill in their addresses and terms, or type the details yourself below."
      : "Optional. Save customers you order for often and their addresses and terms fill in for you.";

  return (
    <FormSection title="Customer" id="po-customer" footer={footer}>
      <Select
        value={selected ? String(selected.id) : NONE}
        disabled={isLoading}
        onValueChange={(v) => {
          if (v === ADD) onAddCustomer();
          else if (v === NONE) choose(null);
          else {
            const customer = sorted.find((c) => String(c.id) === v);
            if (customer) choose(customer);
          }
        }}
      >
        <SelectTrigger aria-label="Customer" className="font-medium">
          <SelectValue>{isLoading ? "Loading customers…" : selected ? selected.name : "No Customer"}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[min(24rem,var(--radix-select-content-available-height))]">
          <SelectItem value={NONE} textValue="No Customer">
            <span className="block">No Customer</span>
            <span className="block text-[13px] opacity-70 md:text-xs">Type the details yourself</span>
          </SelectItem>
          {sorted.length > 0 && <SelectSeparator />}
          {sorted.map((c) => {
            const detail = contactLine(c) || firstLine(c.shipTo);
            return (
              <SelectItem key={c.id} value={String(c.id)} textValue={c.name}>
                <span className="block truncate">{c.name}</span>
                {detail && <span className="block truncate text-[13px] opacity-70 md:text-xs">{detail}</span>}
              </SelectItem>
            );
          })}
          <SelectSeparator />
          <SelectItem value={ADD} textValue="New Customer" className="text-primary">
            New Customer…
          </SelectItem>
        </SelectContent>
      </Select>
    </FormSection>
  );
}
