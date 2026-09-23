import { useWatch, type Control } from "react-hook-form";
import type { AppSettings } from "@shared/po";
import { cn } from "@/lib/utils";

/**
 * A small, live "top of the page" preview of the purchase-order letterhead. Mirrors the
 * letterhead of the real document (company block on the left, PO number on the right) and
 * fades out into placeholder lines, like a page thumbnail.
 */
export function LetterheadPreview({
  control,
  poNumber,
  className,
}: {
  control: Control<AppSettings>;
  poNumber?: string;
  className?: string;
}) {
  const company = useWatch({ control, name: "company" });
  const name = company?.name?.trim() ?? "";
  const address = company?.address?.trim() ?? "";
  const email = company?.email?.trim() ?? "";
  const phone = company?.phone?.trim() ?? "";
  const hasContact = Boolean(address || email || phone);

  return (
    <figure
      aria-label="Letterhead preview"
      className={cn(
        "relative select-none overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_-18px_rgba(0,0,0,0.18)] dark:shadow-none",
        className,
      )}
    >
      <div className="px-5 pb-3 pt-5 md:px-7 md:pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-[19px] font-bold leading-6 tracking-[-0.018em] [overflow-wrap:anywhere] md:text-title-2",
                !name && "text-muted-foreground/50",
              )}
            >
              {name || "Company Name"}
            </p>
            <div className="mt-1 space-y-px text-[12px] leading-4 text-muted-foreground [overflow-wrap:anywhere] md:mt-1.5 md:text-[13px] md:leading-[18px]">
              {address && <p className="whitespace-pre-line">{address}</p>}
              {email && <p>{email}</p>}
              {phone && <p className="tabular-nums">{phone}</p>}
              {!hasContact && <p className="text-muted-foreground/60">Address, email and phone</p>}
            </div>
          </div>
          <div className="min-w-0 max-w-[42%] shrink-0 text-right">
            <span className="block text-[10px] font-semibold uppercase leading-4 tracking-[0.12em] text-primary md:text-[11px]">
              Purchase Order
            </span>
            <span className="mt-0.5 block truncate text-[19px] font-bold leading-6 tracking-[-0.02em] tabular-nums md:text-[24px] md:leading-7">
              #{poNumber || "1001"}
            </span>
          </div>
        </div>

        {/* Placeholder body, fading out like the top of a page */}
        <div
          aria-hidden
          className="mt-4 pt-4 hairline-t [mask-image:linear-gradient(to_bottom,black_20%,transparent)] md:mt-5 md:pt-5"
        >
          <div className="grid grid-cols-4 gap-3 md:gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-1.5 w-2/3 rounded-full bg-foreground/[0.07]" />
                <div className="h-2 w-full rounded-full bg-foreground/[0.11]" />
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2 w-full rounded-full bg-foreground/[0.06]" />
            <div className="h-2 w-5/6 rounded-full bg-foreground/[0.06]" />
          </div>
        </div>
      </div>
      <figcaption className="sr-only">
        {`Preview of the letterhead printed on every purchase order: ${[name, address, email, phone]
          .filter(Boolean)
          .join(", ")}`}
      </figcaption>
    </figure>
  );
}
