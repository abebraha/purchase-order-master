import type { ReactNode } from "react";
import { CircleCheck, EllipsisVertical, Laptop, Share, Smartphone, SquarePlus, type LucideIcon } from "lucide-react";
import { IconTile, ListRow, ListSection, type IosColor } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { detectPlatform, useInstallPrompt, type DevicePlatform } from "./install";

/** An inline glyph inside instructions ("tap [􀈂] Share"). */
function Glyph({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="whitespace-nowrap font-medium text-foreground">
      <Icon className="mx-0.5 inline-block h-[15px] w-[15px] -translate-y-px align-middle text-primary" strokeWidth={2.25} aria-hidden />
      {label}
    </span>
  );
}

interface Step {
  platform: DevicePlatform;
  icon: LucideIcon;
  color: IosColor;
  title: string;
  body: ReactNode;
}

const STEPS: Step[] = [
  {
    platform: "ios",
    icon: Smartphone,
    color: "blue",
    title: "iPhone & iPad",
    body: (
      <>
        In Safari, tap <Glyph icon={Share} label="Share" />, then <Glyph icon={SquarePlus} label="Add to Home Screen" />.
      </>
    ),
  },
  {
    platform: "android",
    icon: Smartphone,
    color: "green",
    title: "Android",
    body: (
      <>
        In Chrome, tap the <Glyph icon={EllipsisVertical} label="menu" />, then <span className="whitespace-nowrap font-medium text-foreground">Install App</span>.
      </>
    ),
  },
  {
    platform: "desktop",
    icon: Laptop,
    color: "gray",
    title: "Mac & PC",
    body: (
      <>
        In Safari, choose <span className="font-medium text-foreground">File › Add to Dock</span>. In Chrome or Edge, click
        the install icon at the right of the address bar.
      </>
    ),
  },
];

export function InstallSection() {
  const { canInstall, install, installed } = useInstallPrompt();
  const { toast } = useToast();
  const platform = detectPlatform();
  // The instructions for this device come first.
  const steps = [...STEPS].sort((a, b) => Number(b.platform === platform) - Number(a.platform === platform));

  const onInstall = async () => {
    try {
      const accepted = await install();
      if (accepted) toast({ title: "PO Master installed", description: "Open it from your Home Screen or Dock." });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't install", description: (e as Error).message });
    }
  };

  return (
    <ListSection
      header="Add to Home Screen"
      footer="PO Master opens full screen like any other app — no browser bars, one tap away."
    >
      {installed ? (
        <ListRow
          leading={<IconTile icon={CircleCheck} color="green" />}
          title="Installed on This Device"
          subtitle="You're using PO Master as an app."
        />
      ) : canInstall ? (
        <div className="relative flex min-h-11 items-center gap-3 py-2.5 pl-4 pr-3 after:absolute after:bottom-0 after:left-[3.5625rem] after:right-0 after:h-px after:bg-border/80">
          <img src="/icon.svg" alt="" className="h-[29px] w-[29px] shrink-0 rounded-[7px]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] leading-[22px] md:text-[15px] md:leading-5">PO Master</div>
            <div className="mt-0.5 truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4">
              Install it on this device
            </div>
          </div>
          <Button size="sm" onClick={onInstall} className="shrink-0">
            Install App
          </Button>
        </div>
      ) : null}
      {steps.map((s) => (
        <ListRow key={s.title} leading={<IconTile icon={s.icon} color={s.color} />} className="items-start [&>span:first-child]:mt-2 md:[&>span:first-child]:mt-[7px]">
          <div className="text-[17px] leading-[22px] md:text-[15px] md:leading-5">
            {s.title}
            {s.platform === platform && (
              <span className="ml-2 align-[1px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                This Device
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[15px] leading-5 text-muted-foreground md:text-[13px] md:leading-[18px]">{s.body}</p>
        </ListRow>
      ))}
    </ListSection>
  );
}
