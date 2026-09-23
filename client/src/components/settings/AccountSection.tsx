import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { IconTile, ListRow, ListSection } from "@/components/kit";
import { ConfirmDialog } from "@/components/common";
import { useToast } from "@/hooks/use-toast";
import { signOut, useAuthSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export function AccountSection() {
  const { data: session } = useAuthSession();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const onSignOut = async () => {
    setPending(true);
    try {
      await signOut(); // reloads the app on the sign-in screen
    } catch (e) {
      setPending(false);
      setConfirmOpen(false);
      toast({ variant: "destructive", title: "Couldn't sign out", description: (e as Error).message });
    }
  };

  return (
    <>
      <ListSection
        header="Account"
        footer="All purchase orders, styles and settings belong to this account. To sign out every device at once, change APP_PASSWORD on Railway."
      >
        <ListRow
          leading={<IconTile icon={ShieldCheck} color="green" />}
          title={session?.email ?? "Signed In"}
          subtitle={session?.remembered ? "Stays signed in on this device" : "Signed in until you close this browser"}
          value={session?.signedInAt ? <span className="text-[15px] md:text-[13px]">{formatDate(session.signedInAt, "MMM d")}</span> : undefined}
        />
        <ListRow onClick={() => setConfirmOpen(true)} accessory="none" inset="1rem">
          <div className="text-center text-[17px] leading-[22px] text-destructive md:text-[15px] md:leading-5">Sign Out</div>
        </ListRow>
      </ListSection>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !pending && setConfirmOpen(open)}
        title="Sign Out?"
        description="You'll need your email and password to sign in again on this device."
        confirmLabel="Sign Out"
        destructive
        pending={pending}
        onConfirm={onSignOut}
      />
    </>
  );
}
