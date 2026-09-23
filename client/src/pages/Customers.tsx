import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Plus, SearchX, Users } from "lucide-react";
import { DEFAULT_SETTINGS, type CustomerRecord } from "@shared/po";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { SearchField } from "@/components/kit";
import { EmptyState, ErrorState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerFormDialog } from "@/components/customers/CustomerFormDialog";
import { CustomerList, CustomerTable } from "@/components/customers/CustomerList";
import { DeleteCustomerDialog } from "@/components/customers/DeleteCustomerDialog";
import { filterCustomers, sortCustomers } from "@/components/customers/customerUtils";
import { useIsDesktop } from "@/hooks/use-media-query";
import { useCustomers, useSettings } from "@/lib/api";
import { formatNumber, pluralize } from "@/lib/format";

export default function Customers() {
  const { data: customers, isLoading, error, refetch, isRefetching } = useCustomers();
  const { data: settings } = useSettings();
  const isDesktop = useIsDesktop();
  const [, navigate] = useLocation();
  const searchRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [prefillName, setPrefillName] = useState("");
  const [deleting, setDeleting] = useState<CustomerRecord | null>(null);

  // Desktop: "/" jumps to the search field (like Finder, Mail and GitHub).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = customers?.length ?? 0;
  const results = useMemo(() => sortCustomers(filterCustomers(customers ?? [], query)), [customers, query]);
  const searching = query.trim().length > 0;
  const defaultTerms = settings?.defaults.terms || DEFAULT_SETTINGS.defaults.terms;

  const openAdd = (name = "") => {
    setEditing(null);
    setPrefillName(name);
    setFormOpen(true);
  };
  const openEdit = (customer: CustomerRecord) => {
    setEditing(customer);
    setPrefillName("");
    setFormOpen(true);
  };
  const requestDelete = (customer: CustomerRecord) => {
    setFormOpen(false);
    setDeleting(customer);
  };
  const newOrder = (customer: CustomerRecord) => navigate(`/purchase-orders/new?customer=${customer.id}`);

  const headerActions = (
    <>
      <Button variant="plain" size="icon" aria-label="Add Customer" onClick={() => openAdd()} className="md:hidden">
        <Plus className="!h-[22px] !w-[22px]" strokeWidth={2.4} />
      </Button>
      <Button onClick={() => openAdd()} className="hidden md:inline-flex">
        <Plus strokeWidth={2.5} />
        Add Customer
      </Button>
    </>
  );

  let body;
  if (isLoading) {
    body = <CustomersSkeleton desktop={isDesktop} />;
  } else if (error && !customers) {
    body = (
      <ErrorState
        title="Couldn't Load Customers"
        error={error}
        action={
          <Button onClick={() => refetch()} disabled={isRefetching}>
            Try Again
          </Button>
        }
      />
    );
  } else if (total === 0) {
    body = (
      <div className="rounded-2xl bg-card">
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Save the customers you order for. Pick one on a new purchase order and their addresses, payment terms and instructions fill in for you."
          action={
            <Button onClick={() => openAdd()}>
              <Plus strokeWidth={2.5} />
              Add Customer
            </Button>
          }
        />
      </div>
    );
  } else {
    const trimmed = query.trim();
    body = (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <SearchField
            ref={searchRef}
            value={query}
            onChange={setQuery}
            placeholder="Search customers"
            aria-label="Search customers by name, contact or address"
            className="min-w-0 flex-1 md:max-w-sm"
            onKeyDown={(e) => {
              // Return hides the phone keyboard so the results are visible; Escape clears, then leaves.
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                if (query) setQuery("");
                else e.currentTarget.blur();
              }
            }}
          />
          {isDesktop && searching && (
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground" aria-live="polite">
              {formatNumber(results.length)} of {formatNumber(total)}
            </span>
          )}
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl bg-card">
            <EmptyState
              icon={SearchX}
              title={`No Results for “${trimmed}”`}
              description="Check the spelling, or search by a different name, contact or address."
              action={
                <Button variant="tinted" onClick={() => openAdd(trimmed.slice(0, 120))}>
                  <Plus strokeWidth={2.5} />
                  Add “{trimmed}”
                </Button>
              }
            />
          </div>
        ) : isDesktop ? (
          <CustomerTable
            customers={results}
            defaultTerms={defaultTerms}
            onEdit={openEdit}
            onDelete={setDeleting}
            onNewOrder={newOrder}
          />
        ) : (
          <CustomerList customers={results} onSelect={openEdit} />
        )}

        {results.length > 0 && (
          <p className="text-center text-[13px] tabular-nums text-muted-foreground md:text-xs" aria-live="polite">
            {searching
              ? `${pluralize(results.length, "match", "matches")} out of ${pluralize(total, "customer")}`
              : pluralize(total, "Customer", "Customers")}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={
          customers ? (total ? `${pluralize(total, "customer")} saved` : "No saved customers yet") : " "
        }
        actions={headerActions}
      />
      <PageContainer>{body}</PageContainer>

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editing}
        customers={customers}
        initialValues={prefillName ? { name: prefillName } : undefined}
        onDelete={requestDelete}
        onNewOrder={newOrder}
      />
      <DeleteCustomerDialog customer={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </>
  );
}

function CustomersSkeleton({ desktop }: { desktop: boolean }) {
  const rows = Array.from({ length: 6 });
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading customers">
      <Skeleton className="h-10 rounded-[10px] md:h-9 md:max-w-sm" />
      {desktop ? (
        <div className="overflow-hidden rounded-2xl bg-card">
          <div className="h-9 border-b border-border/80" />
          {rows.map((_, i) => (
            <div key={i} className="flex h-11 items-center gap-6 border-b border-border/70 px-5 last:border-b-0">
              <Skeleton className="h-3.5 w-32 rounded-md" />
              <Skeleton className="h-3.5 w-28 rounded-md" />
              <Skeleton className="h-3.5 flex-1 rounded-md" />
              <Skeleton className="h-3.5 w-16 rounded-md" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-card">
          {rows.map((_, i) => (
            <div key={i} className="flex h-[62px] flex-col justify-center gap-2 border-b border-border/70 px-4 last:border-b-0">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-48 rounded-md" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
