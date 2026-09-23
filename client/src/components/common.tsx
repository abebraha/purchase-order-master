import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { AlertTriangle, Loader2, type LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { buttonVariants } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Focus return: these dialogs are opened from state (no Radix trigger), so remember what had
// focus when they opened and put focus back there when they close.
// ---------------------------------------------------------------------------

function useReturnFocus(open: boolean, fallback?: RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement as HTMLElement | null;
    opener.current =
      active && active !== document.body && !active.closest("[role=menu],[role=dialog],[role=alertdialog]") ? active : null;
  }, [open]);
  return (e: Event) => {
    const target = opener.current?.isConnected ? opener.current : fallback?.current;
    if (!target) return; // let Radix do its default
    e.preventDefault();
    target.focus({ preventScroll: true });
  };
}

// ---------------------------------------------------------------------------
// ResponsiveDialog — centered dialog on desktop, bottom sheet (drawer) on mobile
// ---------------------------------------------------------------------------

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Buttons. On mobile they stack full-width at the bottom of the sheet. */
  footer?: ReactNode;
  /** Extra classes for the desktop dialog (e.g. "sm:max-w-2xl"). */
  className?: string;
  /** Where focus goes on close if the element that opened the dialog is gone (e.g. a menu item). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  returnFocusRef,
}: ResponsiveDialogProps) {
  const isDesktop = useIsDesktop();
  const restoreFocus = useReturnFocus(open, returnFocusRef);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn("max-h-[90dvh] overflow-y-auto sm:max-w-lg", className)} onCloseAutoFocus={restoreFocus}>
          <DialogHeader className="pr-8">
            <DialogTitle className="text-[19px] font-semibold tracking-tight">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          {footer && <DialogFooter className="gap-2 pt-2 sm:gap-2 sm:space-x-0">{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]" onCloseAutoFocus={restoreFocus}>
        <DrawerHeader className="px-5 pb-3 pt-3 text-center">
          <DrawerTitle className="text-[17px] font-semibold">{title}</DrawerTitle>
          {description && <DrawerDescription className="text-[13px]">{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-3">{children}</div>
        {footer && (
          <DrawerFooter className="gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 [&>*]:h-12 [&>*]:w-full [&>*]:text-[17px]">
            {footer}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
  /** Where focus goes on close if the element that opened the dialog is gone (e.g. a menu item). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  pending,
  onConfirm,
  children,
  returnFocusRef,
}: ConfirmDialogProps) {
  const restoreFocus = useReturnFocus(open, returnFocusRef);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onCloseAutoFocus={restoreFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-8 w-8" strokeWidth={1.75} />
      </div>
      <h3 className="text-title-3">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[15px] leading-snug text-muted-foreground">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Full-page error with a retry/back action. */
export function ErrorState({ title = "Something went wrong", error, action }: { title?: string; error?: unknown; action?: ReactNode }) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-8 w-8" strokeWidth={1.75} />
      </div>
      <h3 className="text-title-3">{title}</h3>
      {message && <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">{message}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
