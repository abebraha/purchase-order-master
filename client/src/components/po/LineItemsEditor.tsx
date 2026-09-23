/**
 * Line items for the PO editor.
 *   Phones  — one rounded card per item (style row → Color, Description, Qty + Unit Price, Amount).
 *   Desktop — a compact Numbers-like grid inside one card.
 * Both end with an "Add Item" row and a totals line. Must be rendered inside the editor's <Form>.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFieldArray, useFormContext, useWatch, type FieldError } from "react-hook-form";
import { ArrowDown, ArrowUp, CopyPlus, Ellipsis, Plus, Trash2, type LucideIcon } from "lucide-react";
import { Field, IconTile, ListRow, ListSection } from "@/components/kit";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToastAction } from "@/components/ui/toast";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, formatNumber, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  editorTotals,
  emptyItem,
  formatPriceInput,
  formatQuantityInput,
  isBlankItem,
  itemAmount,
  parseAmount,
  type EditorItem,
  type EditorValues,
} from "./editor-model";
import { StyleCombobox, type StyleSelection } from "./StyleCombobox";

type ItemErrors = Partial<Record<keyof EditorItem, FieldError>> | undefined;

interface ItemActions {
  index: number;
  count: number;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}

// Numbers-style grid: Style # | Color | Description | Qty | Unit Price | Amount | •••
const GRID_COLS =
  "grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)_minmax(0,1.6fr)_76px_96px_minmax(88px,auto)_32px]";

export function LineItemsEditor() {
  const { control, getValues, setValue, formState } = useFormContext<EditorValues>();
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const isDesktop = useIsDesktop();
  const { toast } = useToast();
  const [openStyleFor, setOpenStyleFor] = useState<string | null>(null);
  const pendingAddRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const totals = editorTotals(items);
  const errors = formState.errors.items as unknown as
    | (Array<ItemErrors> & { message?: string; root?: FieldError })
    | undefined;
  const listError = errors?.root?.message ?? errors?.message;

  // After "Add Item": scroll the new item into view and open its style picker.
  useEffect(() => {
    if (!pendingAddRef.current) return;
    pendingAddRef.current = false;
    const last = fields[fields.length - 1];
    if (!last) return;
    setOpenStyleFor(last.id);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-item-id="${last.id}"]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [fields]);

  const addItem = () => {
    pendingAddRef.current = true;
    append(emptyItem(), { shouldFocus: false });
  };

  const selectStyle = (index: number, sel: StyleSelection) => {
    const opts = { shouldDirty: true, shouldValidate: formState.isSubmitted };
    const current = getValues(`items.${index}`);
    setValue(`items.${index}.styleId`, sel.styleId, { shouldDirty: true });
    setValue(`items.${index}.manualStyleNumber`, sel.styleNumber, { ...opts, shouldTouch: true });
    if (sel.color?.trim() && !current?.color?.trim()) setValue(`items.${index}.color`, sel.color.trim(), opts);
    if (sel.description?.trim() && !current?.description?.trim()) {
      setValue(`items.${index}.description`, sel.description.trim(), opts);
    }
  };

  const actionsFor = (index: number): ItemActions => ({
    index,
    count: fields.length,
    onDuplicate: () => {
      const copy = { ...getValues(`items.${index}`) };
      insert(index + 1, copy, { shouldFocus: false });
      toast({ title: "Item duplicated", description: copy.manualStyleNumber ? `A copy of ${copy.manualStyleNumber} was added below.` : undefined });
    },
    onMove: (delta) => {
      const to = index + delta;
      if (to >= 0 && to < fields.length) move(index, to);
    },
    onDelete: () => {
      const removed = { ...getValues(`items.${index}`) };
      remove(index);
      if (isBlankItem(removed)) return;
      toast({
        title: "Item deleted",
        description: removed.manualStyleNumber ? `${removed.manualStyleNumber} was removed from this order.` : undefined,
        action: (
          <ToastAction
            altText="Undo delete"
            onClick={() => insert(Math.min(index, getValues("items").length), removed, { shouldFocus: false })}
          >
            Undo
          </ToastAction>
        ),
      });
    },
  });

  const reformat = (name: `items.${number}.quantity` | `items.${number}.price`, format: (n: number) => string) => {
    const raw = getValues(name) ?? "";
    const n = parseAmount(raw);
    if (!Number.isFinite(n)) return;
    const next = format(n);
    if (next !== raw) setValue(name, next, { shouldDirty: true, shouldValidate: formState.isSubmitted });
  };

  const summary = `${pluralize(totals.itemCount, "item")} · ${formatNumber(totals.totalQuantity)} units`;

  const common = { items, errors, openStyleFor, setOpenStyleFor, selectStyle, actionsFor, reformat };

  return (
    <section id="po-items" className="scroll-mt-20 space-y-1.5" data-invalid-section={listError ? "true" : undefined}>
      <div className="flex items-end justify-between gap-3 px-4">
        <h2 className="text-[13px] font-normal uppercase tracking-[0.02em] text-muted-foreground">Items</h2>
      </div>

      <div ref={listRef}>
        {isDesktop ? (
          <div className="overflow-hidden rounded-xl bg-card">
            {fields.length > 0 && (
              <div className={cn("grid items-center gap-2 px-4 pb-1.5 pt-3 text-xs font-medium text-muted-foreground", GRID_COLS)}>
                <span>Style #</span>
                <span>Color</span>
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit Price</span>
                <span className="text-right">Amount</span>
                <span className="sr-only">Actions</span>
              </div>
            )}
            <div className="divide-y divide-border/70">
              {fields.map((field, index) => (
                <ItemGridRow key={field.id} fieldId={field.id} index={index} {...common} />
              ))}
            </div>
            <AddItemRow onClick={addItem} className={cn(fields.length > 0 && "hairline-t")} />
            <TotalsRow summary={summary} amount={totals.totalAmount} />
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, index) => (
              <ItemCard key={field.id} fieldId={field.id} index={index} {...common} />
            ))}
            <ListSection>
              <AddItemRow onClick={addItem} />
              <TotalsRow summary={summary} amount={totals.totalAmount} />
            </ListSection>
          </div>
        )}
      </div>

      {listError ? (
        <p className="px-4 text-[13px] font-medium text-destructive" role="alert">
          {listError}
        </p>
      ) : fields.length === 0 ? (
        <p className="px-4 text-[13px] leading-snug text-muted-foreground">Add at least one item to this order.</p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

interface RowProps {
  fieldId: string;
  index: number;
  items: EditorItem[] | undefined;
  errors: Array<ItemErrors> | undefined;
  openStyleFor: string | null;
  setOpenStyleFor: (id: string | null) => void;
  selectStyle: (index: number, sel: StyleSelection) => void;
  actionsFor: (index: number) => ItemActions;
  reformat: (name: `items.${number}.quantity` | `items.${number}.price`, format: (n: number) => string) => void;
}

function AddItemRow({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <ListRow
      onClick={onClick}
      className={cn("min-h-[52px] md:min-h-11", className)}
      leading={<IconTile icon={Plus} color="green" />}
      title={<span className="font-medium">Add Item</span>}
    />
  );
}

function TotalsRow({ summary, amount }: { summary: string; amount: number }) {
  return (
    <ListRow
      className="bg-card"
      title={<span className="font-semibold">Total</span>}
      subtitle={summary}
      value={<span className="font-semibold text-foreground">{formatMoney(amount)}</span>}
    />
  );
}

function MenuItem({ icon: Icon, children, onSelect, destructive, disabled }: {
  icon: LucideIcon;
  children: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      disabled={disabled}
      className={cn("justify-between gap-6", destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive")}
    >
      {children}
      <Icon aria-hidden className={cn("opacity-90", destructive ? "text-destructive" : "text-foreground")} />
    </DropdownMenuItem>
  );
}

function ItemMenu({ actions, compact }: { actions: ItemActions; compact?: boolean }) {
  const { index, count } = actions;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Item ${index + 1} options`}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
            compact ? "h-8 w-8" : "h-11 w-11",
          )}
        >
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/15 dark:bg-primary/20",
              compact ? "h-7 w-7" : "h-[30px] w-[30px]",
            )}
          >
            <Ellipsis className={compact ? "h-4 w-4" : "h-[18px] w-[18px]"} strokeWidth={2.5} />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[13.5rem]">
        <MenuItem icon={CopyPlus} onSelect={actions.onDuplicate}>
          Duplicate Item
        </MenuItem>
        <MenuItem icon={ArrowUp} onSelect={() => actions.onMove(-1)} disabled={index === 0}>
          Move Up
        </MenuItem>
        <MenuItem icon={ArrowDown} onSelect={() => actions.onMove(1)} disabled={index >= count - 1}>
          Move Down
        </MenuItem>
        <DropdownMenuSeparator />
        <MenuItem icon={Trash2} onSelect={actions.onDelete} destructive>
          Delete Item
        </MenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "$" adornment for price inputs. */
function PriceAdornment({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground md:left-2.5", className)}>
      $
    </span>
  );
}

// ---------------------------------------------------------------------------
// Phone: one card per item
// ---------------------------------------------------------------------------

function ItemCard({ fieldId, index, items, errors, openStyleFor, setOpenStyleFor, selectStyle, actionsFor, reformat }: RowProps) {
  const { register } = useFormContext<EditorValues>();
  const item = items?.[index];
  const err = errors?.[index];
  const label = `Item ${index + 1}`;
  const id = (f: string) => `item-${fieldId}-${f}`;

  return (
    <div data-item-id={fieldId} className="scroll-mt-20 overflow-hidden rounded-xl bg-card">
      <div className="relative flex items-center pr-1 after:absolute after:bottom-0 after:left-[3.5625rem] after:right-0 after:h-px after:bg-border/80">
        <StyleCombobox
          variant="row"
          id={id("style")}
          label={label}
          value={item?.manualStyleNumber ?? ""}
          styleId={item?.styleId ?? null}
          color={item?.color}
          description={item?.description}
          invalid={!!err?.manualStyleNumber}
          errorMessage={err?.manualStyleNumber?.message}
          open={openStyleFor === fieldId}
          onOpenChange={(o) => setOpenStyleFor(o ? fieldId : null)}
          onSelect={(sel) => selectStyle(index, sel)}
        />
        <ItemMenu actions={actionsFor(index)} />
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 px-4 pb-3 pt-3.5">
        <Field label="Color" htmlFor={id("color")} error={err?.color?.message} className="col-span-2">
          <Input
            id={id("color")}
            placeholder="e.g. Black"
            autoCapitalize="words"
            aria-invalid={!!err?.color}
            {...register(`items.${index}.color`)}
          />
        </Field>
        <Field label="Description" htmlFor={id("description")} error={err?.description?.message} className="col-span-2">
          <Input
            id={id("description")}
            placeholder="Optional"
            aria-invalid={!!err?.description}
            {...register(`items.${index}.description`)}
          />
        </Field>
        <Field label="Quantity" htmlFor={id("quantity")} error={err?.quantity?.message}>
          <Input
            id={id("quantity")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            className="tabular-nums"
            aria-invalid={!!err?.quantity}
            {...register(`items.${index}.quantity`, {
              onBlur: () => reformat(`items.${index}.quantity`, formatQuantityInput),
            })}
          />
        </Field>
        <Field label="Unit Price" htmlFor={id("price")} error={err?.price?.message}>
          <div className="relative">
            <PriceAdornment />
            <Input
              id={id("price")}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="pl-7 tabular-nums"
              aria-invalid={!!err?.price}
              {...register(`items.${index}.price`, {
                onBlur: () => reformat(`items.${index}.price`, formatPriceInput),
              })}
            />
          </div>
        </Field>
      </div>

      <div className="flex items-baseline justify-between gap-3 px-4 pb-3.5">
        <span className="text-[15px] text-muted-foreground">Amount</span>
        <span className="text-[17px] font-semibold tabular-nums">{formatMoney(itemAmount(item))}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop: grid row
// ---------------------------------------------------------------------------

function ItemGridRow({ fieldId, index, items, errors, openStyleFor, setOpenStyleFor, selectStyle, actionsFor, reformat }: RowProps) {
  const { register } = useFormContext<EditorValues>();
  const item = items?.[index];
  const err = errors?.[index];
  const label = `Item ${index + 1}`;
  const messages = err
    ? (["manualStyleNumber", "color", "description", "quantity", "price"] as const)
        .map((k) => err[k]?.message)
        .filter(Boolean)
    : [];

  return (
    <div data-item-id={fieldId} className="scroll-mt-24 px-4 py-2 transition-colors hover:bg-accent/30">
      <div className={cn("grid items-center gap-2", GRID_COLS)}>
        <StyleCombobox
          variant="field"
          id={`item-${fieldId}-style`}
          label={label}
          value={item?.manualStyleNumber ?? ""}
          styleId={item?.styleId ?? null}
          color={item?.color}
          description={item?.description}
          invalid={!!err?.manualStyleNumber}
          errorMessage={err?.manualStyleNumber?.message}
          open={openStyleFor === fieldId}
          onOpenChange={(o) => setOpenStyleFor(o ? fieldId : null)}
          onSelect={(sel) => selectStyle(index, sel)}
        />
        <Input
          aria-label={`${label} color`}
          placeholder="Color"
          className="px-2.5"
          aria-invalid={!!err?.color}
          {...register(`items.${index}.color`)}
        />
        <Input
          aria-label={`${label} description`}
          placeholder="Description"
          className="px-2.5"
          title={item?.description || undefined}
          aria-invalid={!!err?.description}
          {...register(`items.${index}.description`)}
        />
        <Input
          aria-label={`${label} quantity`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          className="px-2.5 text-right tabular-nums"
          aria-invalid={!!err?.quantity}
          {...register(`items.${index}.quantity`, {
            onBlur: () => reformat(`items.${index}.quantity`, formatQuantityInput),
          })}
        />
        <div className="relative">
          <PriceAdornment />
          <Input
            aria-label={`${label} unit price`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            className="pl-6 pr-2.5 text-right tabular-nums"
            aria-invalid={!!err?.price}
            {...register(`items.${index}.price`, {
              onBlur: () => reformat(`items.${index}.price`, formatPriceInput),
            })}
          />
        </div>
        <span className="truncate text-right text-sm font-medium tabular-nums">{formatMoney(itemAmount(item))}</span>
        <ItemMenu actions={actionsFor(index)} compact />
      </div>
      {messages.length > 0 && (
        <p className="pt-1.5 text-[13px] font-medium text-destructive">{messages.join(" · ")}</p>
      )}
    </div>
  );
}
