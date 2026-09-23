import { useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { TERM_PRESETS, type AppSettings } from "@shared/po";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
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
const isPreset = (v: string | undefined) => (TERM_PRESETS as readonly string[]).includes(v ?? "");

/** Default payment terms: a preset picker with a "Custom…" option that reveals a text field. */
export function TermsField() {
  const { control } = useFormContext<AppSettings>();
  const terms = useWatch({ control, name: "defaults.terms" });
  const [customMode, setCustomMode] = useState(() => !!terms && !isPreset(terms));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const showCustom = customMode || (!!terms && !isPreset(terms));

  return (
    <FormField
      control={control}
      name="defaults.terms"
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
              value={showCustom ? CUSTOM : field.value || undefined}
              onValueChange={(v) => {
                if (v === CUSTOM) {
                  setCustomMode(true);
                  if (isPreset(field.value)) field.onChange("");
                  window.setTimeout(() => inputRef.current?.focus(), 50);
                } else {
                  setCustomMode(false);
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
                  aria-label="Custom payment terms"
                  autoComplete="off"
                  enterKeyHint="done"
                  placeholder="e.g. Net 30 EOM or 50% deposit"
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
}
