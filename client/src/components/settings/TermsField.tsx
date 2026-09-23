import { useRef, useState, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { TERM_PRESETS } from "@shared/po";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUSTOM = "__custom";
const BLANK = "__blank";
const isPreset = (v: string | undefined) => (TERM_PRESETS as readonly string[]).includes(v ?? "");

/**
 * Payment terms: a preset picker with a "Custom…" option that reveals a text field.
 * With `blankLabel`, the first option stands for "no terms of its own" and stores "".
 */
export function TermsField({
  name = "defaults.terms",
  label = "Payment Terms",
  blankLabel,
  description,
}: {
  /** Field path in the surrounding form (defaults to Settings' default terms). */
  name?: string;
  label?: string;
  blankLabel?: string;
  description?: ReactNode;
}) {
  const { control } = useFormContext();
  const terms: string | undefined = useWatch({ control, name });
  const [customMode, setCustomMode] = useState(() => !!terms && !isPreset(terms));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const showCustom = customMode || (!!terms && !isPreset(terms));

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const trigger = (
          <SelectTrigger aria-label={showCustom ? `${label} preset` : undefined}>
            <SelectValue placeholder="Choose terms" />
          </SelectTrigger>
        );
        return (
          <FormItem>
            <FormLabel className="block">{label}</FormLabel>
            <Select
              value={showCustom ? CUSTOM : field.value || (blankLabel ? BLANK : undefined)}
              onValueChange={(v) => {
                if (v === CUSTOM) {
                  setCustomMode(true);
                  if (isPreset(field.value)) field.onChange("");
                  window.setTimeout(() => inputRef.current?.focus(), 50);
                } else {
                  setCustomMode(false);
                  field.onChange(v === BLANK ? "" : v);
                }
              }}
            >
              {showCustom ? trigger : <FormControl>{trigger}</FormControl>}
              <SelectContent>
                {blankLabel && (
                  <>
                    <SelectItem value={BLANK}>{blankLabel}</SelectItem>
                    <SelectSeparator />
                  </>
                )}
                {TERM_PRESETS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={CUSTOM}>Custom…</SelectItem>
              </SelectContent>
            </Select>
            {showCustom && (
              <FormControl>
                <Input
                  {...field}
                  ref={(el) => {
                    field.ref(el);
                    inputRef.current = el;
                  }}
                  aria-label={`Custom ${label.toLowerCase()}`}
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder="e.g. Net 30 EOM or 50% deposit"
                  aria-invalid={!!fieldState.error}
                />
              </FormControl>
            )}
            {description && !fieldState.error && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
