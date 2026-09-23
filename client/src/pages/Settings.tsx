import { forwardRef, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { CircleCheck, Loader2 } from "lucide-react";
import { DEFAULT_SETTINGS, type AppSettings } from "@shared/po";
import { PageContainer, PageHeader, ThemeToggle } from "@/components/layout/AppShell";
import { ListSection } from "@/components/kit";
import { ConfirmDialog, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { DataSection } from "@/components/settings/DataSection";
import { InstallSection } from "@/components/settings/InstallSection";
import { RecentlyDeletedSection } from "@/components/settings/RecentlyDeletedSection";
import { CompanySection, DefaultsSection, DocumentSection } from "@/components/settings/SettingsFormSections";
import { settingsFormSchema, toFormValues } from "@/components/settings/schema";
import { useToast } from "@/hooks/use-toast";
import { UnsavedChangesDialog, useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useSaveSettings, useSettings } from "@/lib/api";
import { cn } from "@/lib/utils";

const FORM_ID = "settings-form";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

// wouter patches pushState/replaceState to emit these events, so links like "/settings#deleted" are seen too.
const LOCATION_EVENTS = ["hashchange", "popstate", "pushState", "replaceState"];
function subscribeToLocation(onChange: () => void) {
  LOCATION_EVENTS.forEach((e) => window.addEventListener(e, onChange));
  return () => LOCATION_EVENTS.forEach((e) => window.removeEventListener(e, onChange));
}
const useLocationHash = () => useSyncExternalStore(subscribeToLocation, () => window.location.hash);

export default function Settings() {
  const { data } = useSettings();
  // Mount the form once the saved settings are here, so it starts from them (no flash of defaults).
  return <SettingsScreen key={data ? "ready" : "loading"} />;
}

function SettingsScreen() {
  const { data: settings, isLoading, error, refetch, isRefetching } = useSettings();
  const save = useSaveSettings();
  const { toast } = useToast();
  const [discardOpen, setDiscardOpen] = useState(false);
  // Remounts the payment-terms picker after a reset so its "Custom…" mode matches the value again.
  const [resetKey, setResetKey] = useState(0);

  const form = useForm<AppSettings>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: toFormValues(settings),
    mode: "onTouched",
  });
  const { isDirty } = form.formState;
  const saving = save.isPending;

  // Settings changed elsewhere (another device) while nothing is being edited here → show them.
  useEffect(() => {
    if (settings && !form.formState.isDirty) form.reset(toFormValues(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const onValid = async (values: AppSettings) => {
    try {
      const saved = await save.mutateAsync(values);
      form.reset(toFormValues(saved));
      setResetKey((k) => k + 1);
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't save settings", description: (e as Error).message });
    }
  };

  const onInvalid = (_errors: FieldErrors<AppSettings>) => {
    // react-hook-form focuses the first invalid input; make sure it's comfortably in view.
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>(`#${FORM_ID} [aria-invalid="true"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 30);
  };

  const submit = form.handleSubmit(onValid, onInvalid);

  // ⌘S / Ctrl+S saves (desktop).
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const canSaveRef = useRef(false);
  canSaveRef.current = isDirty && !saving;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (canSaveRef.current) void submitRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Unsaved edits are never dropped silently: the tab bar, sidebar and any other in-app link ask
  // "Discard Changes?" first, and closing the tab warns. (Once Save is tapped, leaving is fine: the
  // save carries on, and its "Settings saved" / "Couldn't save settings" toast still shows.)
  const guard = useUnsavedChanges(isDirty && !saving);

  // Links opened from code (the "Open" button on a toast) ask too — but a toast can outlive this
  // screen, and once it's gone there's nothing left to lose.
  const [, navigate] = useLocation();
  const guardRef = useRef(guard);
  guardRef.current = guard;
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const openLink = useCallback(
    (href: string) => (mountedRef.current ? guardRef.current.requestLeave(href) : navigate(href)),
    [navigate],
  );

  // While the save bar floats over the form (iPad, desktop), a field that gets focus — by Tab, or a tap
  // on one it half covers — is scrolled up so it isn't hidden under the bar.
  const saveBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = document.getElementById(FORM_ID);
    if (!isDirty || !form) return;
    let frame = 0;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      const bar = saveBarRef.current;
      if (!bar || bar.contains(el)) return;
      cancelAnimationFrame(frame);
      // Measure after the browser's own focus scrolling.
      frame = requestAnimationFrame(() => {
        const field = el.getBoundingClientRect();
        const covered = field.bottom + 12 - bar.getBoundingClientRect().top;
        if (covered <= 0) return;
        // Never push the top of a tall field (an address box) under the nav bar.
        const minTop = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const by = Math.min(covered, field.top - minTop);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (by > 0) window.scrollBy({ top: by, behavior: reduce ? "auto" : "smooth" });
      });
    };
    form.addEventListener("focusin", onFocusIn);
    return () => {
      form.removeEventListener("focusin", onFocusIn);
      cancelAnimationFrame(frame);
    };
  }, [isDirty]);

  // Deep links: /settings#deleted, #company, #defaults, #appearance, #data, #install.
  const hash = useLocationHash();
  const ready = !isLoading;
  useEffect(() => {
    if (!ready || !hash || hash.length < 2) return;
    const id = decodeURIComponent(hash.slice(1));
    // Wait a beat: the app shell scrolls new screens to the top first.
    const t = window.setTimeout(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [hash, ready]);

  const discard = () => {
    form.reset(toFormValues(settings));
    setResetKey((k) => k + 1);
    setDiscardOpen(false);
  };

  return (
    <>
      <PageHeader
        title="Settings"
        width="narrow"
        leading={
          isDirty ? (
            <Button
              type="button"
              variant="plain"
              onClick={() => setDiscardOpen(true)}
              disabled={saving}
              className="-ml-1 h-11 px-2 text-[17px] font-normal md:hidden"
            >
              Cancel
            </Button>
          ) : undefined
        }
        actions={
          isDirty ? (
            <Button
              type="submit"
              form={FORM_ID}
              variant="plain"
              disabled={saving}
              className="h-11 px-2 text-[17px] font-semibold md:hidden"
            >
              {saving ? <Loader2 className="animate-spin" aria-label="Saving" /> : "Save"}
            </Button>
          ) : undefined
        }
      />

      <PageContainer width="narrow">
        <div className="space-y-8 md:space-y-9">
          {settings ? (
            <Form {...form}>
              <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-8 md:space-y-9">
                <CompanySection />
                <DefaultsSection key={resetKey} />
                <DocumentSection />
                <SaveBar ref={saveBarRef} dirty={isDirty} saving={saving} onRevert={() => setDiscardOpen(true)} />
              </form>
            </Form>
          ) : error ? (
            <div className="rounded-2xl bg-card">
              <ErrorState
                title="Couldn't load settings"
                error={error}
                action={
                  <Button onClick={() => refetch()} disabled={isRefetching}>
                    {isRefetching && <Loader2 className="animate-spin" aria-hidden />}
                    Try Again
                  </Button>
                }
              />
            </div>
          ) : (
            <FormSkeleton />
          )}

          <div id="appearance" className="scroll-mt-20">
            <ListSection header="Appearance" footer="Automatic switches between light and dark with your device.">
              <div className="flex items-center gap-4 px-4 py-3 md:py-2.5">
                <span className="hidden flex-1 text-[15px] md:block">Theme</span>
                <ThemeToggle className="w-full md:w-80" />
              </div>
            </ListSection>
          </div>

          <div id="data" className="scroll-mt-20">
            <DataSection />
          </div>

          <div id="deleted" className="scroll-mt-20">
            <RecentlyDeletedSection settings={settings ?? DEFAULT_SETTINGS} onOpenLink={openLink} />
          </div>

          <div id="install" className="scroll-mt-20">
            <InstallSection />
          </div>

          <AboutFooter companyName={settings?.company.name} />
        </div>
      </PageContainer>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard Changes?"
        description="Your unsaved edits to Settings will be lost."
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        destructive
        onConfirm={discard}
      />
      <UnsavedChangesDialog
        guard={guard}
        title="Discard Changes?"
        description="Your unsaved edits to Settings will be lost."
      />
    </>
  );
}

/**
 * End of the form. iPad and desktop: always there, and it floats at the bottom of the window while
 * there are unsaved changes — above the tab bar where there is one (below lg). Being sticky inside
 * the form, it never floats past the form's end, so nothing after it is ever covered.
 * Phones: a full-width button that appears once something changed (the nav bar also gets Cancel / Save).
 */
const SaveBar = forwardRef<HTMLDivElement, { dirty: boolean; saving: boolean; onRevert: () => void }>(function SaveBar(
  { dirty, saving, onRevert },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "z-20 transition-[background-color,box-shadow] duration-200",
        dirty
          ? cn(
              "md:sticky md:bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+1rem)] lg:bottom-6",
              "md:rounded-2xl md:py-2.5 md:pl-5 md:pr-2.5",
              "md:bg-card/90 md:backdrop-blur-xl md:backdrop-saturate-150",
              "md:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(0,0,0,0.12)]",
              "md:dark:bg-popover/90 md:dark:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.9),0_0_0_0.5px_rgba(255,255,255,0.14)]",
            )
          : "max-md:hidden md:px-1",
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2">
        <p className="text-center text-[13px] text-muted-foreground md:mr-auto md:text-left" aria-live="polite">
          {dirty ? (
            <>
              <span className="mr-1.5 inline-block h-2 w-2 -translate-y-px rounded-full bg-ios-orange align-middle" aria-hidden />
              You have unsaved changes
              <span className="hidden md:inline">
                {" · "}
                Press {isMac ? "⌘S" : "Ctrl+S"} to save
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CircleCheck className="h-4 w-4 text-ios-green" aria-hidden />
              All changes saved
            </span>
          )}
        </p>
        <Button type="button" variant="plain" onClick={onRevert} disabled={!dirty || saving} className="hidden md:inline-flex">
          Revert
        </Button>
        <Button type="submit" disabled={!dirty || saving} className="max-md:h-12 max-md:w-full max-md:text-[17px]">
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          Save Changes
        </Button>
      </div>
    </div>
  );
});

function FormSkeleton() {
  return (
    <div className="space-y-8 md:space-y-9" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-[172px] rounded-2xl md:h-[196px]" />
      <div className="space-y-2">
        <Skeleton className="ml-4 h-3 w-20 rounded-md" />
        <Skeleton className="h-[318px] rounded-xl md:h-[250px]" />
      </div>
      <div className="space-y-2">
        <Skeleton className="ml-4 h-3 w-36 rounded-md" />
        <Skeleton className="h-[420px] rounded-xl md:h-[260px]" />
      </div>
    </div>
  );
}

function AboutFooter({ companyName }: { companyName?: string }) {
  return (
    <footer className="flex flex-col items-center gap-2.5 pb-2 pt-4 text-center text-[13px] leading-[18px] text-muted-foreground">
      <img src="/icon.svg" alt="" className="h-12 w-12 rounded-[11px] shadow-sm" />
      <div>
        <p className="font-semibold text-foreground/70">PO Master</p>
        {companyName && <p>{companyName}</p>}
      </div>
    </footer>
  );
}
