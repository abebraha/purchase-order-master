import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Plus, RotateCw } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/common";
import { ListSection, Section, SectionLink } from "@/components/kit";
import { PORow } from "@/components/po/PORow";
import { ReviewOlderOrders } from "@/components/po/ReviewOlderOrders";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiTiles, KpiTilesSkeleton } from "@/components/dashboard/KpiTiles";
import { MonthlyChart } from "@/components/dashboard/MonthlyChart";
import { NeedsAttention, attentionHref } from "@/components/dashboard/NeedsAttention";
import { StatusBreakdown } from "@/components/dashboard/StatusBreakdown";
import { TopStyles } from "@/components/dashboard/TopStyles";
import { Welcome } from "@/components/dashboard/Welcome";
import { greeting, summarize } from "@/components/dashboard/metrics";
import { usePurchaseOrders } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Re-render once a minute so the greeting and date stay current if Home is left open. */
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * The one "New Purchase Order" action on phones and tablets (the nav bar stays clear so it isn't
 * offered twice). From lg up the sidebar's button covers it.
 */
function NewOrderButton() {
  return (
    <Button asChild size="lg" className="mb-6 w-full md:w-auto md:px-8 lg:hidden">
      <Link href="/purchase-orders/new">
        <Plus strokeWidth={2.5} />
        New Purchase Order
      </Link>
    </Button>
  );
}

function SectionSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("min-w-0", className)} aria-hidden>
      <Skeleton className="mb-3 ml-1 h-6 w-40 rounded-lg" />
      <div className="overflow-hidden rounded-xl bg-card">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="space-y-2 px-4 py-3.5">
            <div className="flex justify-between gap-6">
              <Skeleton className="h-4 w-28 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-40 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-9" aria-busy="true" aria-label="Loading summary">
      <KpiTilesSkeleton />
      <div className="grid grid-cols-1 gap-9 lg:grid-cols-2 lg:gap-6">
        <SectionSkeleton />
        <SectionSkeleton />
      </div>
      <div className="grid grid-cols-1 gap-9 lg:grid-cols-5 lg:gap-6 xl:grid-cols-3">
        <div className="min-w-0 lg:col-span-3 xl:col-span-2">
          <Skeleton className="mb-3 ml-1 h-6 w-44 rounded-lg" />
          <div className="rounded-2xl bg-card p-4 md:p-5">
            <Skeleton className="h-3 w-12 rounded-full" />
            <Skeleton className="mt-2.5 h-7 w-36 rounded-lg" />
            <Skeleton className="mt-2 h-3 w-48 rounded-full" />
            <div className="mt-6 flex h-[168px] items-end gap-[3%] pr-11 md:h-[208px]">
              {[18, 26, 22, 34, 30, 42, 38, 52, 46, 60, 55, 72].map((h, i) => (
                <Skeleton key={i} className="flex-1 rounded-b-none rounded-t-[4px]" style={{ height: `${h}%` }} />
              ))}
            </div>
            <Skeleton className="mt-2 h-3 w-full rounded-full opacity-60" />
          </div>
        </div>
        <SectionSkeleton rows={5} className="lg:col-span-2 xl:col-span-1" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const now = useNow();
  const { data: orders, isLoading, error, refetch, isRefetching } = usePurchaseOrders();
  const summary = useMemo(() => (orders ? summarize(orders, now) : null), [orders, now]);
  const isEmpty = !!orders && orders.length === 0;
  const toReview = useMemo(() => (orders ?? []).filter((po) => po.needsReview), [orders]);
  // Hidden only on the first-run welcome (it has its own button) and when nothing could load.
  // A failed background refresh keeps the last data on screen, so keep the button with it.
  const showNewOrder = !isEmpty && !(error && !orders);

  return (
    <>
      <PageHeader
        title={greeting(now)}
        compactTitle="Home"
        subtitle={format(now, "EEEE, MMMM d")}
        width="wide"
      />
      <PageContainer width="wide">
        {showNewOrder && <NewOrderButton />}

        {isLoading ? (
          <DashboardSkeleton />
        ) : error && !orders ? (
          <ErrorState
            title="Couldn't load your summary"
            error={error}
            action={
              <Button variant="tinted" onClick={() => refetch()} disabled={isRefetching}>
                <RotateCw className={isRefetching ? "animate-spin" : undefined} />
                Try Again
              </Button>
            }
          />
        ) : isEmpty || !summary ? (
          <Welcome />
        ) : (
          <div className="space-y-9">
            <KpiTiles summary={summary} />

            <ReviewOlderOrders orders={toReview} />

            {/* grid-cols-1 = minmax(0, 1fr): long store names / PO numbers truncate instead of widening the page. */}
            <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-2 lg:gap-6">
              <Section
                title="Needs Attention"
                className="min-w-0"
                action={
                  summary.attention.length > 0 && (
                    <SectionLink href={attentionHref(summary.overdueCount)}>See All</SectionLink>
                  )
                }
              >
                <NeedsAttention
                  orders={summary.attention}
                  total={summary.attentionTotal}
                  overdueCount={summary.overdueCount}
                  dueSoonCount={summary.dueSoonCount}
                />
              </Section>

              <Section
                title="Recent Orders"
                className="min-w-0"
                action={<SectionLink href="/purchase-orders">See All</SectionLink>}
              >
                <ListSection>
                  {summary.recent.map((po) => (
                    <PORow key={po.id} po={po} />
                  ))}
                </ListSection>
              </Section>
            </div>

            <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-5 lg:gap-6 xl:grid-cols-3">
              <Section title="Monthly Orders" className="min-w-0 lg:col-span-3 xl:col-span-2">
                <MonthlyChart data={summary.monthly} />
              </Section>
              <Section title="By Status" className="min-w-0 lg:col-span-2 xl:col-span-1">
                <StatusBreakdown
                  statuses={summary.statuses}
                  totalCount={summary.totalCount}
                  totalValue={summary.totalValue}
                />
              </Section>
            </div>

            <TopStyles styles={summary.topStyles} />
          </div>
        )}
      </PageContainer>
    </>
  );
}
