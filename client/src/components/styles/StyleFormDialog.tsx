import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { StyleFormSchema, type StyleFormValues, type StyleRecord } from "@shared/po";
import { ResponsiveDialog } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-media-query";
import { ApiError, useCreateStyle, useUpdateStyle } from "@/lib/api";
import { formatDate, pluralize } from "@/lib/format";
import { findDuplicate } from "./styleUtils";

const EMPTY: StyleFormValues = { styleNumber: "", color: "", description: "" };

function valuesOf(style: StyleRecord | null | undefined, initialStyleNumber = ""): StyleFormValues {
  return style
    ? { styleNumber: style.styleNumber, color: style.color ?? "", description: style.description ?? "" }
    : { ...EMPTY, styleNumber: initialStyleNumber };
}

/**
 * Add a style (style === null) or edit one. Phones get a bottom sheet, desktop a dialog.
 * Duplicate style numbers are caught before saving and again from the server's 409.
 */
export function StyleFormDialog({
  open,
  onOpenChange,
  style,
  styles,
  initialStyleNumber,
  onDelete,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The style being edited; null to add a new one. */
  style: StyleRecord | null;
  /** The whole catalog, for instant duplicate checks. */
  styles: StyleRecord[] | undefined;
  /** Add mode: prefill the style # (e.g. from a search that found nothing). */
  initialStyleNumber?: string;
  /** Edit mode: user tapped "Delete Style". */
  onDelete?: (style: StyleRecord) => void;
  onSaved?: (style: StyleRecord) => void;
}) {
  const isEdit = Boolean(style);
  const formId = useId();
  const isDesktop = useIsDesktop();
  const { toast } = useToast();
  const create = useCreateStyle();
  const update = useUpdateStyle();
  const pending = create.isPending || update.isPending;

  const form = useForm<StyleFormValues>({
    resolver: zodResolver(StyleFormSchema),
    defaultValues: valuesOf(style, initialStyleNumber),
  });

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (open) form.reset(valuesOf(style, initialStyleNumber));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, style?.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (style) {
      const before = valuesOf(style);
      const unchanged = (Object.keys(before) as Array<keyof StyleFormValues>).every(
        (key) => before[key].trim() === values[key].trim(),
      );
      if (unchanged) {
        onOpenChange(false);
        return;
      }
    }
    const duplicate = findDuplicate(styles, values.styleNumber, style?.id);
    if (duplicate) {
      form.setError(
        "styleNumber",
        { message: `Style ${duplicate.styleNumber} already exists.` },
        { shouldFocus: true },
      );
      return;
    }
    try {
      const saved = style
        ? await update.mutateAsync({ id: style.id, ...values })
        : await create.mutateAsync(values);
      toast({
        title: style ? "Changes Saved" : "Style Added",
        description: style
          ? `${saved.styleNumber} is up to date.`
          : `${saved.styleNumber} is ready to use on purchase orders.`,
      });
      onSaved?.(saved);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        form.setError("styleNumber", { message: error.message }, { shouldFocus: true });
        return;
      }
      toast({
        variant: "destructive",
        title: style ? "Couldn't Save Changes" : "Couldn't Add Style",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  });

  const deleteButton = style && onDelete && (
    <Button
      type="button"
      variant="destructive-tinted"
      disabled={pending}
      onClick={() => onDelete(style)}
      className={isDesktop ? "sm:mr-auto" : "h-11 w-full text-[17px]"}
    >
      {isDesktop && <Trash2 />}
      Delete Style
    </Button>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={isEdit ? "Edit Style" : "Add Style"}
      description={
        isEdit
          ? undefined
          : "Save a style once and pick it in seconds when you fill in a purchase order."
      }
      footer={
        <>
          {isDesktop && deleteButton}
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className="order-last md:order-none"
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {isEdit ? "Save" : "Add Style"}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={formId}
          onSubmit={onSubmit}
          // Enter submits from any field (the buttons live in the sheet footer, outside the form).
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) {
              e.preventDefault();
              if (!pending) void onSubmit();
            }
          }}
          noValidate
          className="space-y-4 pt-1"
        >
          <FormField
            control={form.control}
            name="styleNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Style #</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="e.g. SL3100"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={64}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g. Black" autoComplete="off" autoCapitalize="words" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="e.g. Microfiber T-shirt bra"
                    autoComplete="off"
                    autoCapitalize="sentences"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>

      {style && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl bg-muted px-3.5 py-3 text-[13px] leading-snug text-muted-foreground">
            <p>Purchase orders already created keep the style number they were saved with.</p>
            <p className="mt-1.5 tabular-nums">
              {style.usageCount > 0 ? `Used on ${pluralize(style.usageCount, "PO item")}` : "Not used on any purchase orders yet"}
              {style.createdAt && ` · Added ${formatDate(style.createdAt)}`}
            </p>
          </div>
          {!isDesktop && deleteButton}
        </div>
      )}
    </ResponsiveDialog>
  );
}
