import { useEffect, useId, type ComponentProps, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FilePlus2, Loader2, Trash2 } from "lucide-react";
import { CustomerFormSchema, DEFAULT_SETTINGS, type CustomerFormValues, type CustomerRecord } from "@shared/po";
import { ResponsiveDialog } from "@/components/common";
import { TermsField } from "@/components/settings/TermsField";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-media-query";
import { ApiError, useCreateCustomer, useSettings, useUpdateCustomer } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { customerFormValues, findDuplicateCustomer } from "./customerUtils";

const ADDRESS_TEXTAREA = "min-h-[96px] resize-none leading-snug [field-sizing:content]";

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-[13px] font-normal uppercase tracking-[0.02em] text-muted-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Add a customer (customer === null) or edit one. Phones get a bottom sheet, desktop a dialog.
 * Duplicate names are caught before saving and again from the server's 409.
 */
export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  customers,
  initialValues,
  onDelete,
  onNewOrder,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The customer being edited; null to add a new one. */
  customer: CustomerRecord | null;
  /** All saved customers, for instant duplicate-name checks. */
  customers: CustomerRecord[] | undefined;
  /** Add mode: start with these values (e.g. the addresses already typed on a PO). */
  initialValues?: Partial<CustomerFormValues>;
  /** Edit mode: user tapped "Delete Customer". */
  onDelete?: (customer: CustomerRecord) => void;
  /** Edit mode: offer "New Purchase Order" for this customer. */
  onNewOrder?: (customer: CustomerRecord) => void;
  onSaved?: (customer: CustomerRecord) => void;
}) {
  const isEdit = Boolean(customer);
  const formId = useId();
  const isDesktop = useIsDesktop();
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const pending = create.isPending || update.isPending;
  const defaultTerms = settings?.defaults.terms || DEFAULT_SETTINGS.defaults.terms;

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(CustomerFormSchema),
    defaultValues: customerFormValues(customer, initialValues),
  });
  const shipTo = useWatch({ control: form.control, name: "shipTo" });
  const billTo = useWatch({ control: form.control, name: "billTo" });

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (open) form.reset(customerFormValues(customer, initialValues));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer?.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (customer) {
      const before = customerFormValues(customer);
      const unchanged = (Object.keys(before) as Array<keyof CustomerFormValues>).every(
        (key) => before[key].trim() === values[key].trim(),
      );
      if (unchanged) {
        onOpenChange(false);
        return;
      }
    }
    const duplicate = findDuplicateCustomer(customers, values.name, customer?.id);
    if (duplicate) {
      form.setError("name", { message: `A customer named ${duplicate.name} already exists.` }, { shouldFocus: true });
      return;
    }
    try {
      const saved = customer
        ? await update.mutateAsync({ id: customer.id, ...values })
        : await create.mutateAsync(values);
      toast({
        title: customer ? "Changes Saved" : "Customer Added",
        description: customer
          ? `${saved.name} is up to date.`
          : `Pick ${saved.name} on a purchase order to fill in their details.`,
      });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        form.setError("name", { message: error.message }, { shouldFocus: true });
        return;
      }
      toast({
        variant: "destructive",
        title: customer ? "Couldn't Save Changes" : "Couldn't Add Customer",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  });

  const deleteButton = customer && onDelete && (
    <Button
      type="button"
      variant="destructive-tinted"
      disabled={pending}
      onClick={() => onDelete(customer)}
      className={isDesktop ? "sm:mr-auto" : "h-11 w-full text-[17px]"}
    >
      {isDesktop && <Trash2 />}
      Delete Customer
    </Button>
  );

  const textField = (
    name: "name" | "contactName" | "email" | "phone",
    label: string,
    props: Partial<ComponentProps<typeof Input>>,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} autoComplete="off" {...props} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={isEdit ? "Edit Customer" : "Add Customer"}
      description={
        isEdit ? undefined : "Save a customer once, then pick them on a purchase order to fill in their details."
      }
      className="sm:max-w-xl"
      footer={
        <>
          {isDesktop && deleteButton}
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="order-last md:order-none"
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {isEdit ? "Save" : "Add Customer"}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={(e) => {
            // Keep the submit inside this dialog (it can open from within the PO editor's form).
            e.stopPropagation();
            void onSubmit(e);
          }}
          // Enter submits from any one-line field (the buttons live in the sheet footer, outside the form).
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) {
              e.preventDefault();
              if (!pending) void onSubmit();
            }
          }}
          noValidate
          className="space-y-7 pt-1"
        >
          <Group title="Customer">
            {textField("name", "Customer Name", {
              placeholder: "e.g. Nordstrom",
              autoComplete: "organization",
              autoCapitalize: "words",
              maxLength: 120,
            })}
            {textField("contactName", "Contact", {
              placeholder: "Buyer or contact person",
              autoComplete: "name",
              autoCapitalize: "words",
              maxLength: 120,
            })}
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("email", "Email", {
                type: "email",
                inputMode: "email",
                autoComplete: "email",
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: false,
                placeholder: "buyer@example.com",
                maxLength: 200,
              })}
              {textField("phone", "Phone", {
                type: "tel",
                inputMode: "tel",
                autoComplete: "tel",
                placeholder: "(212) 555-0100",
                maxLength: 60,
              })}
            </div>
          </Group>

          <Group
            title="Purchase Order Details"
            description="Filled in when you pick this customer on a purchase order. Leave anything blank to fill it in yourself."
          >
            <FormField
              control={form.control}
              name="shipTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ship To</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      autoComplete="off"
                      placeholder={"Company name\nStreet address\nCity, State ZIP"}
                      className={ADDRESS_TEXTAREA}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bill To</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={3}
                      autoComplete="off"
                      placeholder={"Who pays\nStreet address\nCity, State ZIP"}
                      className={ADDRESS_TEXTAREA}
                    />
                  </FormControl>
                  <FormMessage />
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="tinted"
                      size="sm"
                      disabled={!shipTo?.trim() || shipTo.trim() === billTo?.trim()}
                      onClick={() => form.setValue("billTo", shipTo, { shouldDirty: true })}
                    >
                      Same as Ship To
                    </Button>
                  </div>
                </FormItem>
              )}
            />
            <TermsField name="terms" blankLabel={`Your default (${defaultTerms})`} />
            <FormField
              control={form.control}
              name="specialInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="block">Special Instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="Packing, labeling or shipping requests for this customer"
                      className="resize-none [field-sizing:content]"
                    />
                  </FormControl>
                  <FormDescription>Printed on their purchase orders</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Group>

          <Group title="Notes">
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="block">Internal Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="Anything your team should know about this customer"
                      className="resize-none [field-sizing:content]"
                    />
                  </FormControl>
                  <FormDescription>Only visible to your team — never added to a purchase order</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Group>
        </form>
      </Form>

      {customer && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl bg-muted px-3.5 py-3 text-[13px] leading-snug text-muted-foreground">
            <p>Purchase orders already created keep the details they were saved with.</p>
            {customer.createdAt && <p className="mt-1.5 tabular-nums">Added {formatDate(customer.createdAt)}</p>}
          </div>
          {onNewOrder && (
            <Button
              type="button"
              variant="tinted"
              disabled={pending || form.formState.isDirty}
              onClick={() => onNewOrder(customer)}
              className={isDesktop ? undefined : "h-11 w-full text-[17px]"}
            >
              <FilePlus2 />
              New Purchase Order
            </Button>
          )}
          {!isDesktop && deleteButton}
        </div>
      )}
    </ResponsiveDialog>
  );
}
