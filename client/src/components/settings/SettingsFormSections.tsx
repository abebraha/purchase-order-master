/**
 * The editable parts of Settings (company letterhead, new-order defaults, document footer).
 * Render inside the Settings page's <Form> (react-hook-form context over AppSettings).
 */
import { useFormContext, useWatch } from "react-hook-form";
import { Building2 } from "lucide-react";
import { PO_TYPES, type AppSettings } from "@shared/po";
import { FormSection, SegmentedControl } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNextPoNumber } from "@/lib/api";
import { LetterheadPreview } from "./LetterheadPreview";
import { TermsField } from "./TermsField";
import { companyAddressBlock } from "./schema";

const ADDRESS_TEXTAREA = "min-h-[96px] resize-none leading-snug [field-sizing:content]";

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

export function CompanySection() {
  const { control } = useFormContext<AppSettings>();
  const { data: next } = useNextPoNumber();

  return (
    <div id="company" className="scroll-mt-20 space-y-6">
      <LetterheadPreview control={control} poNumber={next?.poNumber} />

      <FormSection title="Company" footer="Printed at the top of every purchase order.">
        <FormField
          control={control}
          name="company.name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company Name</FormLabel>
              <FormControl>
                <Input {...field} autoComplete="organization" enterKeyHint="next" placeholder="Your company name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="company.address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={2}
                  autoComplete="street-address"
                  placeholder={"Street and suite\nCity, State ZIP"}
                  className="min-h-[72px] resize-none leading-snug [field-sizing:content]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="company.email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    placeholder="orders@company.com"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="company.phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    enterKeyHint="done"
                    placeholder="+1 (555) 123-4567"
                    className="tabular-nums"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New purchase order defaults
// ---------------------------------------------------------------------------

export function DefaultsSection() {
  const { control, setValue, getValues } = useFormContext<AppSettings>();
  const company = useWatch({ control, name: "company" });
  const billTo = useWatch({ control, name: "defaults.billTo" });
  const companyBlock = companyAddressBlock(company);

  const fillCompanyAddress = () => {
    setValue("defaults.billTo", companyAddressBlock(getValues("company")), {
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  return (
    <FormSection id="defaults" title="New Purchase Orders" footer="Used to pre-fill new purchase orders.">
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <FormField
          control={control}
          name="defaults.poType"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="block">PO Type</FormLabel>
              <SegmentedControl
                aria-label="Default PO type"
                value={field.value}
                onChange={field.onChange}
                options={PO_TYPES.map((t) => ({ value: t, label: t }))}
                className="md:!h-9"
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <TermsField />
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <FormField
          control={control}
          name="defaults.shipTo"
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
              <FormDescription>Leave blank to enter it on each order.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="defaults.billTo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bill To</FormLabel>
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
              <div className="pt-1">
                <Button
                  type="button"
                  variant="tinted"
                  size="sm"
                  onClick={fillCompanyAddress}
                  disabled={!companyBlock || companyBlock === (billTo ?? "").trim()}
                >
                  <Building2 aria-hidden />
                  Use Company Address
                </Button>
              </div>
            </FormItem>
          )}
        />
      </div>
    </FormSection>
  );
}

// ---------------------------------------------------------------------------
// Document footer
// ---------------------------------------------------------------------------

export function DocumentSection() {
  const { control } = useFormContext<AppSettings>();
  return (
    <FormSection title="Document" footer="Printed at the bottom of every purchase order.">
      <FormField
        control={control}
        name="documentFooter"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Footer Note</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                rows={2}
                placeholder="e.g. Please include the PO number on all invoices and packing slips."
                className="min-h-[72px] resize-none leading-snug [field-sizing:content]"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </FormSection>
  );
}
