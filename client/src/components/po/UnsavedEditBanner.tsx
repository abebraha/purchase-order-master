import { useState } from "react";
import { Link } from "wouter";
import { PencilLine } from "lucide-react";
import { IconTile } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

/** Same key the editor autosaves to in edit mode (see draftKey() in editor-model.tsx). */
const editDraftKey = (id: number) => `po-editor-draft-${id}`;

function readSavedAt(id: number): string | null {
  try {
    const raw = window.localStorage.getItem(editDraftKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.savedAt === "string" ? parsed.savedAt : null;
  } catch {
    return null;
  }
}

/**
 * If the owner left the editor (e.g. with Back) before saving, their changes were autosaved on
 * this device — say so here and offer to pick up where they left off.
 */
export function UnsavedEditBanner({ poId }: { poId: number }) {
  const [savedAt, setSavedAt] = useState(() => readSavedAt(poId));
  if (!savedAt) return null;

  const discard = () => {
    try {
      window.localStorage.removeItem(editDraftKey(poId));
    } catch {
      // ignore
    }
    setSavedAt(null);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 md:flex-row md:items-center md:p-5" role="status">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconTile icon={PencilLine} color="orange" size="md" />
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug md:text-[15px]">You have unsaved changes</h2>
          <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground md:text-[13px]">
            Edits from {formatDateTime(savedAt)} weren't saved yet. They're kept on this device.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 md:flex-nowrap">
        <Button variant="secondary" className="flex-1 md:flex-none" onClick={discard}>
          Discard
        </Button>
        <Button asChild variant="tinted" className="flex-1 md:flex-none">
          <Link href={`/purchase-orders/${poId}/edit`}>Continue Editing</Link>
        </Button>
      </div>
    </div>
  );
}
