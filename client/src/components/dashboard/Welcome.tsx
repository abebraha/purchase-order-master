import { Link } from "wouter";
import { Building2, Plus, Tags, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile, ListRow, ListSection } from "@/components/kit";
import { useSettings } from "@/lib/api";

/** First-run Home: a warm welcome with one obvious next step and a few setup shortcuts. */
export function Welcome() {
  const { data: settings } = useSettings();
  const needsAddress = !!settings && !settings.company.address.trim();

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="rounded-2xl bg-card px-6 pb-7 pt-9 text-center md:px-10">
        <img src="/icon.svg" alt="" className="mx-auto h-16 w-16 rounded-[15px] shadow-sm" />
        <h2 className="mt-5 text-title-2">Welcome to PO Master</h2>
        <p className="mx-auto mt-2 max-w-sm text-[15px] leading-snug text-muted-foreground">
          Write purchase orders in minutes, share them as PDFs, and keep an eye on every cancel date.
        </p>
        <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
          <Link href="/purchase-orders/new">
            <Plus strokeWidth={2.5} />
            Create Your First Purchase Order
          </Link>
        </Button>
      </div>

      <ListSection header="Get Set Up" footer="You can change these any time.">
        <ListRow
          href="/settings"
          leading={<IconTile icon={Building2} color="gray" />}
          title="Set Up Company Profile"
          subtitle={needsAddress ? "Add your address so it prints on every PO" : "Your name and address on every PO"}
        />
        <ListRow
          href="/customers"
          leading={<IconTile icon={Users} color="blue" />}
          title="Add Customers"
          subtitle="Fill in addresses and terms in one tap"
        />
        <ListRow
          href="/styles"
          leading={<IconTile icon={Tags} color="purple" />}
          title="Add Styles"
          subtitle="Pick styles quickly when writing orders"
        />
      </ListSection>
    </div>
  );
}
