/**
 * Apple-style building blocks shared by every screen. Compose pages from these so the whole
 * app feels like one native iOS / macOS app:
 *
 *   ListSection + ListRow   iOS "inset grouped" lists (Settings, Mail, Contacts…)
 *   IconTile                colored rounded-square icon (like iOS Settings)
 *   SegmentedControl        iOS segmented control with a sliding thumb
 *   SearchField             iOS search bar
 *   Section                 content section with a prominent title and optional "See All"
 *   FormSection + Field     grouped form cards with labels, hints and errors
 */
import {
  forwardRef,
  useRef,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Link } from "wouter";
import { ChevronRight, Search, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// IconTile
// ---------------------------------------------------------------------------

export type IosColor =
  | "blue"
  | "green"
  | "indigo"
  | "orange"
  | "pink"
  | "purple"
  | "red"
  | "teal"
  | "yellow"
  | "gray";

const TILE_BG: Record<IosColor, string> = {
  blue: "bg-ios-blue",
  green: "bg-ios-green",
  indigo: "bg-ios-indigo",
  orange: "bg-ios-orange",
  pink: "bg-ios-pink",
  purple: "bg-ios-purple",
  red: "bg-ios-red",
  teal: "bg-ios-teal",
  yellow: "bg-ios-yellow",
  gray: "bg-ios-gray",
};

/** Soft tinted variant (colored glyph on a 15% tint) for denser UIs. */
const TILE_TINT: Record<IosColor, string> = {
  blue: "bg-ios-blue/[0.12] text-ios-blue",
  green: "bg-ios-green/15 text-ios-green",
  indigo: "bg-ios-indigo/[0.12] text-ios-indigo",
  orange: "bg-ios-orange/15 text-ios-orange",
  pink: "bg-ios-pink/[0.12] text-ios-pink",
  purple: "bg-ios-purple/[0.12] text-ios-purple",
  red: "bg-ios-red/[0.12] text-ios-red",
  teal: "bg-ios-teal/15 text-ios-teal",
  yellow: "bg-ios-yellow/20 text-[hsl(40_100%_35%)] dark:text-ios-yellow",
  gray: "bg-ios-gray/15 text-ios-gray",
};

const TILE_SIZE = {
  sm: "h-[29px] w-[29px] rounded-[7px] [&_svg]:h-[17px] [&_svg]:w-[17px]",
  md: "h-9 w-9 rounded-[9px] [&_svg]:h-5 [&_svg]:w-5",
  lg: "h-12 w-12 rounded-[12px] [&_svg]:h-6 [&_svg]:w-6",
};

export function IconTile({
  icon: Icon,
  color = "blue",
  size = "sm",
  variant = "solid",
  className,
}: {
  icon: LucideIcon;
  color?: IosColor;
  size?: keyof typeof TILE_SIZE;
  variant?: "solid" | "tinted";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        variant === "solid" ? cn(TILE_BG[color], "text-white") : TILE_TINT[color],
        TILE_SIZE[size],
        className,
      )}
    >
      <Icon strokeWidth={2.25} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// ListSection / ListRow — inset grouped list
// ---------------------------------------------------------------------------

export function ListSection({
  header,
  headerAction,
  footer,
  children,
  className,
}: {
  /** Small uppercase caption above the group (e.g. "COMPANY"). */
  header?: ReactNode;
  /** Right-aligned control on the header line (e.g. an "Edit" plain button). */
  headerAction?: ReactNode;
  /** Explanatory text under the group. */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1.5", className)}>
      {(header || headerAction) && (
        <div className="flex min-h-5 items-end justify-between gap-3 px-4">
          {header && <h2 className="text-[13px] font-normal uppercase tracking-[0.02em] text-muted-foreground">{header}</h2>}
          {headerAction}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-card">{children}</div>
      {footer && <p className="px-4 text-[13px] leading-snug text-muted-foreground">{footer}</p>}
    </section>
  );
}

interface ListRowBaseProps {
  /** Leading visual — usually an <IconTile/>, avatar or StatusDot. */
  leading?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Trailing secondary text (e.g. a value or date). */
  value?: ReactNode;
  /** Trailing element after the value. Defaults to a chevron for links. */
  accessory?: ReactNode | "chevron" | "none";
  /** Free-form content instead of title/subtitle. */
  children?: ReactNode;
  destructive?: boolean;
  className?: string;
}

function RowInner({ leading, title, subtitle, value, accessory, children, destructive }: ListRowBaseProps) {
  return (
    <>
      {leading}
      <div className="min-w-0 flex-1 py-[11px]">
        {children ?? (
          <>
            <div className={cn("truncate text-[17px] leading-[22px] md:text-[15px] md:leading-5", destructive && "text-destructive")}>
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4">{subtitle}</div>
            )}
          </>
        )}
      </div>
      {value !== undefined && value !== null && (
        <div className="shrink-0 text-right text-[17px] text-muted-foreground tabular-nums md:text-[15px]">{value}</div>
      )}
      {accessory === "chevron" ? (
        <ChevronRight className="-mr-1 h-[18px] w-[18px] shrink-0 text-muted-foreground/45" strokeWidth={2.5} aria-hidden />
      ) : accessory !== "none" ? (
        accessory
      ) : null}
    </>
  );
}

const rowBase =
  "relative flex min-h-11 w-full items-center gap-3 pl-4 pr-4 text-left outline-none " +
  // inset hairline separator between rows (starts at the text, like iOS)
  "after:absolute after:bottom-0 after:right-0 after:left-[var(--row-inset)] after:h-px after:bg-border/80 last:after:hidden";

const rowInteractive =
  "cursor-pointer transition-colors duration-100 hover:bg-accent/60 active:bg-accent focus-visible:bg-accent";

export type ListRowProps = ListRowBaseProps & {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /**
   * Where the separator line starts (CSS length). Defaults to the text column: 1rem without a
   * leading element, 3.5625rem with a small IconTile. Pass e.g. "2.25rem" for a StatusDot.
   */
  inset?: string;
} & Omit<ComponentPropsWithoutRef<"div">, "title" | "onClick" | "children">;

/**
 * A row in a ListSection. Renders a Link when `href` is set, a button when `onClick` is set,
 * otherwise a static row. Links/buttons show a chevron by default.
 */
export function ListRow({
  href,
  onClick,
  disabled,
  leading,
  title,
  subtitle,
  value,
  accessory,
  children,
  destructive,
  className,
  inset,
  style,
  ...rest
}: ListRowProps) {
  const rowStyle = { ...style, ["--row-inset" as string]: inset ?? (leading ? "3.5625rem" : "1rem") };
  const interactive = Boolean(href || onClick) && !disabled;
  const inner = (
    <RowInner
      leading={leading}
      title={title}
      subtitle={subtitle}
      value={value}
      accessory={accessory ?? (href ? "chevron" : "none")}
      destructive={destructive}
    >
      {children}
    </RowInner>
  );
  const classes = cn(rowBase, interactive && rowInteractive, disabled && "opacity-50", className);

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} style={rowStyle} {...(rest as Record<string, unknown>)}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={classes}
        style={rowStyle}
        {...(rest as ComponentPropsWithoutRef<"button">)}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={classes} style={rowStyle} {...rest}>
      {inner}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentOption<T>>;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "relative grid select-none rounded-[9px] bg-secondary p-[2px]",
        size === "sm" ? "h-8 md:h-7" : "h-9 md:h-8",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute bottom-[2px] left-[2px] top-[2px] rounded-[7px] bg-card shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-out dark:bg-[hsl(240_2%_39%)]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-[7px] px-2 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "font-semibold text-foreground" : "font-medium text-foreground/80 hover:text-foreground",
            )}
          >
            {opt.icon && <opt.icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchField
// ---------------------------------------------------------------------------

type SearchFieldProps = Omit<ComponentPropsWithoutRef<"input">, "onChange" | "value" | "type"> & {
  value: string;
  onChange: (value: string) => void;
};

/** iOS-style search bar: filled, rounded, magnifier on the left, clear button on the right. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, className, placeholder = "Search", ...props },
  ref,
) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        ref={ref}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[10px] border-0 bg-ios-gray/[0.12] pl-8 pr-9 text-[17px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-4 focus-visible:ring-primary/15 md:h-9 md:text-sm dark:bg-ios-gray/[0.24] [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/70 hover:text-muted-foreground"
        >
          <XCircle className="h-[17px] w-[17px] fill-current text-muted-foreground/60 [&>path]:stroke-card [&>line]:stroke-card" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Section — prominent content section (dashboard-style)
// ---------------------------------------------------------------------------

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: ReactNode;
  /** e.g. <SectionLink href="/purchase-orders">See All</SectionLink> */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-title-3">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="shrink-0 text-[15px] text-primary hover:opacity-70 md:text-sm">
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// FormSection + Field — grouped form card
// ---------------------------------------------------------------------------

export function FormSection({
  title,
  description,
  footer,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20 space-y-1.5", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-4">
          <div>
            {title && <h2 className="text-[13px] font-normal uppercase tracking-[0.02em] text-muted-foreground">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className="space-y-4 rounded-xl bg-card p-4 md:p-5">
        {description && <p className="-mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>}
        {children}
      </div>
      {footer && <p className="px-4 text-[13px] leading-snug text-muted-foreground">{footer}</p>}
    </section>
  );
}

/** Label + control + hint/error, for forms not using react-hook-form's <FormField>. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[13px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
