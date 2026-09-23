/**
 * "Add to library" for style numbers that were typed on purchase orders but never saved to the
 * styles catalog (older versions of the app couldn't save them). Adding only creates catalog
 * entries — the purchase orders themselves never change.
 */
import { useRef } from "react";
import type { StyleFormValues, StyleSuggestion } from "@shared/po";
import { useToast } from "@/hooks/use-toast";
import { useBulkCreateStyles } from "@/lib/api";
import { formatNumber, pluralize } from "@/lib/format";
import { styleDetails } from "./styleUtils";

/** How style numbers are compared: the catalog ignores case and surrounding spaces. */
export function styleKey(styleNumber: string): string {
  return styleNumber.trim().toLowerCase();
}

/** The catalog entry for a suggestion: its most common color and description on the orders. */
export function suggestionToStyle(s: StyleSuggestion, fallbackDescription = ""): StyleFormValues {
  return { styleNumber: s.styleNumber, color: s.color, description: s.description || fallbackDescription };
}

/** "Black · Lace bralette · 3 colors" — "" when there's nothing to show. */
export function suggestionDetails(s: StyleSuggestion): string {
  return [styleDetails(s), s.colors.length > 1 ? `${s.colors.length} colors` : ""].filter(Boolean).join(" · ");
}

/** "Used on 3 orders · 1,200 units" (units leave out cancelled orders). */
export function suggestionUsage(s: StyleSuggestion): string {
  const orders = `Used on ${pluralize(s.orders, "order")}`;
  return s.units > 0 ? `${orders} · ${formatNumber(s.units)} ${s.units === 1 ? "unit" : "units"}` : orders;
}

/**
 * Saves styles to the catalog and confirms with a toast. Resolves to true when it worked, and to
 * false when it failed or there was nothing to do (including a second tap while a save is running).
 * `onSaved` runs as soon as they're saved, in the same update as the toast.
 */
export function useAddToLibrary() {
  const bulkCreate = useBulkCreateStyles();
  const { toast } = useToast();
  // A ref, not isPending: the pending state only reaches the buttons on the next render, so a fast
  // double tap would otherwise send the same styles twice (and end on "Nothing new to add").
  const inFlight = useRef(false);

  const add = async (styles: StyleFormValues[], onSaved?: () => void): Promise<boolean> => {
    if (styles.length === 0 || inFlight.current) return false;
    inFlight.current = true;
    try {
      // Resolves once the styles are saved; the library and suggestions refresh behind the toast.
      const { created, skipped } = await bulkCreate.mutateAsync(styles);
      onSaved?.();
      if (created === 0) {
        toast({
          title: styles.length === 1 ? `${styles[0].styleNumber} is already in your library` : "Already in your library",
          description: "Nothing new to add.",
        });
      } else {
        toast({
          title:
            styles.length === 1
              ? `Added ${styles[0].styleNumber} to your library`
              : `Added ${pluralize(created, "style")} to your library`,
          description: skipped > 0 ? `${pluralize(skipped, "style")} ${skipped === 1 ? "was" : "were"} already there.` : undefined,
        });
      }
      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't add styles",
        description: error instanceof Error ? error.message : "Please try again.",
      });
      return false;
    } finally {
      inFlight.current = false;
    }
  };

  return { add, isPending: bulkCreate.isPending };
}
