import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
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
                <SaveBar dirty={isDirty} saving={saving} onRevert={() => setDiscardOpen(true)} />
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
            <RecentlyDeletedSection settings={settings ?? DEFAULT_SETTINGS} />
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
    </>
  );
}

/**
 * End of the form. Desktop: always there, and it floats at the bottom of the window while there
 * are unsaved changes. Phones: a full-width button that appears once something changed
 * (the nav bar also gets Cancel / Save).
 */
function SaveBar({ dirty, saving, onRevert }: { dirty: boolean; saving: boolean; onRevert: () => void }) {
  return (
    <div
      className={cn(
        "z-20 transition-[background-color,box-shadow] duration-200",
        dirty
          ? cn(
              "md:sticky md:bottom-6 md:rounded-2xl md:py-2.5 md:pl-5 md:pr-2.5",
              "md:bg-card/90 md:backdrop-blur-xl md:backdrop-saturate-150",
              "md:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(0,0,0,0.12)]",
              "md:dark:bg-[hsl(240_3%_17%/0.9)] md:dark:shadow-[0_14px_40px_-12px_rgba(0,0,0,0.9),0_0_0_0.5px_rgba(255,255,255,0.14)]",
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
}

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
