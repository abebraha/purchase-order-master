import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ConfirmDialog } from "@/components/common";
import { isIntentionalUnload } from "@/lib/unload";

/**
 * Protects unsaved form changes:
 *  - closing/reloading the tab shows the browser's "Leave site?" prompt;
 *  - tapping an in-app link (tab bar, sidebar, back link…) asks "Discard changes?" first.
 * (Browser Back isn't intercepted — screens that need it should autosave a draft instead.)
 *
 *   const guard = useUnsavedChanges(isDirty);
 *   …
 *   <UnsavedChangesDialog guard={guard} />
 *   // after a successful save that navigates away: guard.leave(`/purchase-orders/${id}`)
 */
export function useUnsavedChanges(dirty: boolean) {
  const [, navigate] = useLocation();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leavingRef.current || isIntentionalUnload()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (leavingRef.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // opening in a new tab is fine
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const href = url.pathname + url.search + url.hash;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  /** Navigate away without asking (e.g. after saving). */
  const leave = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      leavingRef.current = true;
      navigate(href, options);
    },
    [navigate],
  );

  /** Ask before going to `href` when there are unsaved changes (e.g. a Cancel button). */
  const requestLeave = useCallback(
    (href: string) => {
      if (dirty) setPendingHref(href);
      else leave(href);
    },
    [dirty, leave],
  );

  const confirm = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) leave(href);
  }, [pendingHref, leave]);

  const cancel = useCallback(() => setPendingHref(null), []);

  return { dirty, pendingHref, leave, requestLeave, confirm, cancel };
}

export type UnsavedChangesGuard = ReturnType<typeof useUnsavedChanges>;

export function UnsavedChangesDialog({
  guard,
  title = "Discard Changes?",
  description = "You have changes that haven't been saved.",
}: {
  guard: UnsavedChangesGuard;
  title?: string;
  description?: string;
}) {
  return (
    <ConfirmDialog
      open={guard.pendingHref !== null}
      onOpenChange={(open) => !open && guard.cancel()}
      title={title}
      description={description}
      cancelLabel="Keep Editing"
      confirmLabel="Discard Changes"
      destructive
      onConfirm={guard.confirm}
    />
  );
}
