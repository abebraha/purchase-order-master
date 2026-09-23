import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { IconTile, type IosColor } from "@/components/kit";
import { cn } from "@/lib/utils";

/** A small, friendly inline empty state for a dashboard section ("You're all caught up"). */
export function QuietCard({
  icon,
  color,
  title,
  description,
  className,
}: {
  icon: LucideIcon;
  color: IosColor;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3.5 rounded-xl bg-card px-4 py-4", className)}>
      <IconTile icon={icon} color={color} size="md" />
      <div className="min-w-0">
        <div className="text-[17px] font-semibold leading-[22px] md:text-[15px] md:leading-5">{title}</div>
        {description && (
          <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
