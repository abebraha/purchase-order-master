/**
 * Multi-line address with a "Saved Addresses" picker (addresses used on past POs).
 * Must be rendered inside the editor's <Form> (react-hook-form context).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { BookUser, Check, MapPin } from "lucide-react";
import type { AddressSuggestion } from "@shared/po";
import { IconTile, ListRow, ListSection, SearchField } from "@/components/kit";
import { ResponsiveDialog } from "@/components/common";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useIsDesktop } from "@/hooks/use-media-query";
import { firstLine, pluralize } from "@/lib/format";
import type { EditorValues } from "./editor-model";

interface AddressFieldProps {
  name: "shipTo" | "billTo";
  label: string;
  suggestions: AddressSuggestion[] | undefined;
  loading?: boolean;
  placeholder?: string;
  /** Quick actions under the field (small tinted buttons). */
  actions?: ReactNode;
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function restOfAddress(value: string): string {
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.slice(1).join(", ");
}

export function AddressField({ name, label, suggestions, loading, placeholder, actions }: AddressFieldProps) {
  const { control, setValue, getFieldState, formState } = useFormContext<EditorValues>();
  const [open, setOpen] = useState(false);

  const choose = (value: string) => {
    setValue(name, value, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: formState.isSubmitted || getFieldState(name).isTouched,
    });
    setOpen(false);
  };

  return (
    <>
      <FormField
        control={control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <div className="flex min-h-8 items-center justify-between gap-3">
              <FormLabel>{label}</FormLabel>
              <Button
                type="button"
                variant="plain"
                size="sm"
                className="-mr-2 h-8 gap-1.5 px-2 md:h-7"
                onClick={() => setOpen(true)}
                aria-label={`Saved addresses for ${label}`}
              >
                <BookUser aria-hidden />
                Saved Addresses
              </Button>
            </div>
            <FormControl>
              <Textarea
                {...field}
                rows={3}
                placeholder={placeholder ?? "Company name\nStreet address\nCity, State ZIP"}
                autoComplete="off"
                className="min-h-[96px] resize-none leading-snug [field-sizing:content]"
              />
            </FormControl>
            <FormMessage />
            {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
          </FormItem>
        )}
      />
      <SavedAddressesDialog
        open={open}
        onOpenChange={setOpen}
        label={label}
        suggestions={suggestions}
        loading={loading}
        currentName={name}
        onChoose={choose}
      />
    </>
  );
}

function SavedAddressesDialog({
  open,
  onOpenChange,
  label,
  suggestions,
  loading,
  currentName,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  suggestions: AddressSuggestion[] | undefined;
  loading?: boolean;
  currentName: "shipTo" | "billTo";
  onChoose: (value: string) => void;
}) {
  const { getValues } = useFormContext<EditorValues>();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const current = open ? normalize(getValues(currentName) ?? "") : "";

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Desktop: type right away. Phones: don't pop the keyboard over the list.
    if (!isDesktop) return;
    const t = window.setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [open, isDesktop]);

  const list = useMemo(() => {
    const all = [...(suggestions ?? [])].sort((a, b) => b.count - a.count);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const tokens = q.split(/\s+/);
    return all.filter((s) => {
      const hay = s.value.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [suggestions, query]);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Saved Addresses"
      description={`Addresses from your past orders. Choose one to use as the ${label} address.`}
    >
      <div className="sticky top-0 z-10 -mx-4 bg-card px-4 pb-3 pt-1 md:static md:mx-0 md:px-0 md:pt-0">
        <SearchField ref={searchRef} value={query} onChange={setQuery} placeholder="Search addresses" aria-label="Search addresses" />
      </div>
      <div className="min-h-[40dvh] md:min-h-0">
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[62px] rounded-xl" />
            ))}
          </div>
        ) : list.length > 0 ? (
          <ListSection className="-mx-4 md:mx-0 md:[&>div]:bg-muted/60">
            {list.map((s) => {
              const selected = current && normalize(s.value) === current;
              const rest = restOfAddress(s.value);
              return (
                <ListRow
                  key={s.value}
                  onClick={() => onChoose(s.value)}
                  leading={<IconTile icon={MapPin} color="red" />}
                  accessory={selected ? <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={2.5} aria-label="Current" /> : "none"}
                >
                  <div className="truncate text-[17px] leading-[22px] md:text-[15px] md:leading-5">{firstLine(s.value)}</div>
                  {rest && (
                    <div className="mt-0.5 truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4">{rest}</div>
                  )}
                  <div className="mt-0.5 text-[12px] leading-4 text-muted-foreground/80">Used {pluralize(s.count, "time")}</div>
                </ListRow>
              );
            })}
          </ListSection>
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-[17px] font-semibold md:text-[15px]">{query ? "No Matches" : "No Saved Addresses Yet"}</p>
            <p className="mt-1 text-[15px] leading-snug text-muted-foreground md:text-sm">
              {query
                ? "Try a different company, street or city."
                : "Addresses you use on purchase orders will show up here."}
            </p>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
