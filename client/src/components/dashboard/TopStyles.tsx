import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Check, ChevronRight, Loader2, Tags } from "lucide-react";
import type { StyleFormValues } from "@shared/po";
import { ListSection, Section, SectionLink } from "@/components/kit";
import { styleKey, suggestionToStyle, useAddToLibrary } from "@/components/styles/suggestions";
import { useStyles, useStyleSuggestions } from "@/lib/api";
import { formatMoney, formatNumber, pluralize } from "@/lib/format";
import { ordersHref } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { TOP_STYLES_DAYS, type TopStyle } from "./metrics";
import { QuietCard } from "./QuietCard";

/** "in": in the styles library · "missing": typed on orders but never saved · "unknown": still loading. */
type LibraryStatus = "in" | "missing" | "unknown";

/**
 * Whether each top style is in the styles library, and what to save for the ones that aren't
 * (the color and description used most on their orders).
 */
function useLibraryStatus(styles: TopStyle[]) {
  const library = useStyles();
  const suggestions = useStyleSuggestions();

  return useMemo(() => {
    const inLibrary = new Map((library.data ?? []).map((s) => [styleKey(s.styleNumber), s.styleNumber]));
    const suggested = new Map((suggestions.data ?? []).map((s) => [styleKey(s.styleNumber), s]));

    const statusOf = (s: TopStyle): LibraryStatus => {
      if (!library.data) return "unknown";
      const key = styleKey(s.styleNumber);
      if (inLibrary.has(key)) return "in";
      if (suggested.has(key)) return "missing";
      // Suggestions couldn't load: go by the library alone. Otherwise they're still loading, or
      // the orders link this style to a library entry that was renamed since (nothing to add).
      return suggestions.error ? "missing" : "unknown";
    };

    /** The spelling saved in the library (or that "Add" will save), not just the first one typed. */
    const nameOf = (s: TopStyle): string => {
      const key = styleKey(s.styleNumber);
      return inLibrary.get(key) ?? suggested.get(key)?.styleNumber ?? s.styleNumber;
    };

    const toStyle = (s: TopStyle): StyleFormValues => {
      const suggestion = suggested.get(styleKey(s.styleNumber));
      return suggestion
        ? suggestionToStyle(suggestion, s.description)
        : { styleNumber: s.styleNumber, color: "", description: s.description };
    };

    return { statusOf, nameOf, toStyle, missing: styles.filter((s) => statusOf(s) === "missing") };
  }, [styles, library.data, suggestions.data, suggestions.error]);
}

/**
 * Top styles by units, in the style of Screen Time's "Most Used": each row carries a thin
 * bar scaled to the leader. Phones stack name / numbers / bar; wider screens lay the row
 * out as one line so the bars read as a horizontal bar chart. Styles that were typed on
 * orders but never saved to the library get an "Add" button (and the header an "Add All").
 */
export function TopStyles({ styles }: { styles: TopStyle[] }) {
  const { statusOf, nameOf, toStyle, missing } = useLibraryStatus(styles);
  const { add, isPending } = useAddToLibrary();
  /** Keys of the styles being added right now (one row, or every missing row). */
  const [adding, setAdding] = useState<string[]>([]);

  const addStyles = async (list: TopStyle[]) => {
    if (isPending || list.length === 0) return;
    setAdding(list.map((s) => styleKey(s.styleNumber)));
    await add(list.map(toStyle));
    setAdding([]);
  };

  const action =
    missing.length > 0 ? (
      <button
        type="button"
        onClick={() => addStyles(missing)}
        disabled={isPending}
        className="relative shrink-0 rounded-md text-[15px] text-primary outline-none transition-opacity after:absolute after:-inset-x-2 after:-inset-y-3 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 md:text-sm"
      >
        Add All to Library
      </button>
    ) : (
      <SectionLink href="/styles">See All</SectionLink>
    );

  return (
    <Section title="Top Styles" action={action}>
      {styles.length === 0 ? (
        <QuietCard
          icon={Tags}
          color="purple"
          title="No styles ordered lately"
          description={`Styles from orders placed in the last ${TOP_STYLES_DAYS} days will show up here.`}
        />
      ) : (
        <TopStylesList
          styles={styles}
          statusOf={statusOf}
          nameOf={nameOf}
          adding={adding}
          disabled={isPending}
          onAdd={(s) => addStyles([s])}
        />
      )}
    </Section>
  );
}

function TopStylesList({
  styles,
  statusOf,
  nameOf,
  adding,
  disabled,
  onAdd,
}: {
  styles: TopStyle[];
  statusOf: (s: TopStyle) => LibraryStatus;
  nameOf: (s: TopStyle) => string;
  adding: string[];
  disabled: boolean;
  onAdd: (s: TopStyle) => void;
}) {
  const max = Math.max(...styles.map((s) => s.units), 1);
  // Phones: the status column only needs room for an Add button while some row has one.
  const roomForAdd = adding.length > 0 || styles.some((s) => statusOf(s) === "missing");

  return (
    <ListSection
      footer={`Units ordered in the last ${TOP_STYLES_DAYS} days, not counting cancelled orders. Tap a style to see its orders.`}
    >
      {styles.map((s, i) => {
        const pct = Math.max((s.units / max) * 100, 2);
        const bar = (
          <div className="h-1.5 w-full" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        );
        const description = s.description || "No description";
        const status = statusOf(s);
        const name = nameOf(s);
        return (
          // The row body is the link (stretched over the whole row); the Add button sits beside it.
          <div
            key={s.styleNumber}
            className={cn(
              "relative flex items-center gap-3 pr-4 transition-colors duration-100",
              "has-[a:hover]:bg-accent/60 has-[a:active]:bg-accent has-[a:focus-visible]:bg-accent has-[a:focus-visible]:shadow-[inset_0_0_0_2px_hsl(var(--ring))]",
              "after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border/80 last:after:hidden",
            )}
          >
            <Link
              href={ordersHref({ q: s.styleNumber })}
              className="min-w-0 flex-1 py-[11px] pl-4 outline-none before:absolute before:inset-0"
            >
              {/* Phone: three lines */}
              <div className="md:hidden">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[17px] font-semibold leading-[22px]">{name}</span>
                  <span className="shrink-0 text-[15px] tabular-nums">{formatNumber(s.units)} units</span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] leading-[18px] text-muted-foreground">
                  <span className="truncate">{description}</span>
                  <span className="shrink-0 tabular-nums">{formatMoney(s.value)}</span>
                </div>
                <div className="mt-2 pb-0.5">{bar}</div>
              </div>

              {/* Tablet & desktop: one line */}
              <div className="hidden items-center gap-4 md:flex">
                <span className="w-5 shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">{i + 1}</span>
                <div className="w-48 min-w-0 shrink-0 lg:w-56">
                  <div className="truncate text-[15px] font-semibold leading-5">{name}</div>
                  <div className="truncate text-xs leading-4 text-muted-foreground">
                    {description} · {pluralize(s.orders, "order")}
                  </div>
                </div>
                <div className="min-w-0 flex-1">{bar}</div>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums">{formatNumber(s.units)} units</span>
                <span className="w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                  {formatMoney(s.value)}
                </span>
              </div>
            </Link>

            {/* Same width on every row so the bars stay comparable. */}
            <div className={cn("flex shrink-0 justify-end md:w-[6.5rem]", roomForAdd ? "w-[3.25rem]" : "w-4")}>
              {status === "missing" ? (
                <AddButton
                  styleNumber={name}
                  pending={adding.includes(styleKey(s.styleNumber))}
                  disabled={disabled}
                  onClick={() => onAdd(s)}
                />
              ) : status === "in" ? (
                <span className="flex items-center gap-1 text-[13px] text-muted-foreground md:text-xs">
                  <Check className="h-4 w-4 shrink-0 text-muted-foreground/70 md:h-3.5 md:w-3.5" strokeWidth={2.5} aria-hidden />
                  <span className="sr-only md:not-sr-only">In Library</span>
                </span>
              ) : null}
            </div>
            <ChevronRight
              // The narrowest phones need the room for the style # while Add buttons are shown.
              className={cn(
                "-ml-1 -mr-1 h-[18px] w-[18px] shrink-0 text-muted-foreground/45",
                roomForAdd && "max-[359px]:hidden",
              )}
              strokeWidth={2.5}
              aria-hidden
            />
          </div>
        );
      })}
    </ListSection>
  );
}

/** Small tinted capsule, like the App Store's "Get" button. The hit area grows to 44pt on phones. */
function AddButton({
  styleNumber,
  pending,
  disabled,
  onClick,
}: {
  styleNumber: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Add ${styleNumber} to Library`}
      aria-busy={pending || undefined}
      className={cn(
        "relative z-10 flex h-[30px] min-w-[3.25rem] items-center justify-center rounded-full bg-primary/10 px-3 text-[15px] font-semibold text-primary outline-none",
        "transition-[background-color,transform,opacity] duration-150 hover:bg-primary/15 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring dark:bg-primary/20 dark:hover:bg-primary/25",
        "before:absolute before:-inset-x-1 before:-inset-y-[7px] md:h-7 md:min-w-[3rem] md:text-[13px]",
        disabled && !pending && "opacity-40",
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Add"}
    </button>
  );
}
