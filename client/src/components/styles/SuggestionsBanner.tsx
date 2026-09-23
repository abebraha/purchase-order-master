import { useState } from "react";
import { Tags } from "lucide-react";
import type { StyleSuggestion } from "@shared/po";
import { ConfirmDialog } from "@/components/common";
import { IconTile } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/format";
import { suggestionToStyle, useAddToLibrary } from "./suggestions";

/**
 * Friendly prompt at the top of Styles when style numbers typed on purchase orders aren't in
 * the library yet: review them in the import sheet, or add them all in one step.
 */
export function SuggestionsBanner({
  suggestions,
  onReview,
}: {
  /** Renders nothing when empty. */
  suggestions: StyleSuggestion[];
  onReview: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { add, isPending } = useAddToLibrary();
  const count = suggestions.length;
  if (count === 0) return null;
  const one = count === 1;

  const addAll = async () => {
    if (await add(suggestions.map((s) => suggestionToStyle(s)))) setConfirming(false);
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 md:flex-row md:items-center md:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconTile icon={Tags} color="purple" size="md" />
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug md:text-[15px]">
            {pluralize(count, "style")} on your orders {one ? "isn't" : "aren't"} in your library
          </h2>
          <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground md:text-[13px]">
            {one ? "It was" : "They were"} typed on purchase orders but never saved. Add {one ? "it" : "them"} so{" "}
            {one ? "it's" : "they're"} ready to pick next time.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 md:justify-end">
        <Button variant="secondary" className="flex-1 md:flex-none" onClick={onReview}>
          Review
        </Button>
        <Button variant="tinted" className="flex-1 md:flex-none" onClick={() => setConfirming(true)}>
          Add All
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Add ${pluralize(count, "style")} to your library?`}
        description="Each one is saved with the color and description used most on your orders. Your purchase orders stay exactly as they are."
        confirmLabel="Add All"
        pending={isPending}
        onConfirm={addAll}
      />
    </div>
  );
}
