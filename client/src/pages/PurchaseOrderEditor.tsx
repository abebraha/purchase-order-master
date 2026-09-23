/**
 * Routes:
 *   /purchase-orders/new            create
 *   /purchase-orders/new?from=<id>  duplicate an existing PO
 *   /purchase-orders/new?customer=<id>  create, filled in from a saved customer
 *   /purchase-orders/:id/edit       edit
 * Loads what the form needs, then hands off to <PurchaseOrderForm/>.
 */
import { useMemo, type ReactNode } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { DEFAULT_SETTINGS } from "@shared/po";
import { PageContainer, PageHeader, useHideMobileNav } from "@/components/layout/AppShell";
import { ErrorState } from "@/components/common";
import { PurchaseOrderForm } from "@/components/po/PurchaseOrderForm";
import {
  leaveEditor,
  valuesForCreate,
  valuesForDuplicate,
  valuesFromPurchaseOrder,
  valuesWithCustomer,
  type EditorMode,
} from "@/components/po/editor-model";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, useCustomers, useNextPoNumber, usePurchaseOrder, useSettings } from "@/lib/api";

function parseId(value: string | null | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}

export default function PurchaseOrderEditor() {
  const [isEditRoute, params] = useRoute<{ id: string }>("/purchase-orders/:id/edit");
  const search = useSearch();
  const fromParam = isEditRoute ? null : new URLSearchParams(search).get("from");
  const customerParam = isEditRoute || fromParam ? undefined : parseId(new URLSearchParams(search).get("customer"));

  const editId = isEditRoute ? parseId(params?.id) : undefined;
  const fromId = parseId(fromParam);
  const mode: EditorMode = isEditRoute ? "edit" : fromId ? "duplicate" : "create";
  const loadId = mode === "edit" ? editId : mode === "duplicate" ? fromId : undefined;

  const settingsQ = useSettings();
  const poQ = usePurchaseOrder(loadId);
  const nextQ = useNextPoNumber(mode !== "edit");
  // Loaded here so the customer picker is ready when the form appears.
  const customersQ = useCustomers();

  const settings = settingsQ.data ?? (settingsQ.isError ? DEFAULT_SETTINGS : undefined);
  const po = poQ.data;
  // "New PO for this customer" waits for the customer list (if it fails, the form starts blank).
  const ready = !!settings && (mode === "create" || !!po) && !(customerParam && customersQ.isLoading);

  // Computed once per screen (the form keeps its own state after mounting).
  const formKey = `${mode}:${loadId ?? "new"}:${customerParam ?? ""}`;
  const defaultValues = useMemo(() => {
    if (!ready || !settings) return null;
    if (mode === "edit" && po) return valuesFromPurchaseOrder(po);
    if (mode === "duplicate" && po) return valuesForDuplicate(po, nextQ.data?.poNumber ?? "");
    const values = valuesForCreate(settings, nextQ.data?.poNumber ?? "");
    const customer = customerParam ? customersQ.data?.find((c) => c.id === customerParam) : undefined;
    return customer ? valuesWithCustomer(values, customer, settings) : values;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, ready]);

  const loadingTitle = mode === "edit" ? "Edit Purchase Order" : "New Purchase Order";
  const backHref = loadId ? `/purchase-orders/${loadId}` : "/purchase-orders";

  if (isEditRoute && !editId) {
    return <EditorError navTitle={loadingTitle} title="Purchase order not found" error="This link doesn't point to a purchase order." />;
  }
  if (!isEditRoute && fromParam && !fromId) {
    return <EditorError navTitle={loadingTitle} title="Can't duplicate this order" error="This link doesn't point to a purchase order." />;
  }
  if (loadId && poQ.isError) {
    const err = poQ.error;
    const notFound =
      (err instanceof ApiError && err.status === 404) || (err instanceof Error && /not found|^404\b/i.test(err.message));
    return (
      <EditorError
        navTitle={loadingTitle}
        title={notFound ? "Purchase order not found" : "Couldn't load this purchase order"}
        error={notFound ? "It may have been deleted." : poQ.error}
        onRetry={notFound ? undefined : () => void poQ.refetch()}
      />
    );
  }
  if (!ready || !defaultValues || !settings) {
    return <EditorSkeleton title={loadingTitle} backHref={backHref} />;
  }

  return (
    <PurchaseOrderForm
      key={formKey}
      mode={mode}
      defaultValues={defaultValues}
      settings={settings}
      po={mode === "edit" ? po : undefined}
      source={mode === "duplicate" ? po : undefined}
      suggestedPoNumber={mode === "edit" ? undefined : nextQ.data?.poNumber}
    />
  );
}

function EditorError({
  navTitle,
  title,
  error,
  onRetry,
}: {
  navTitle: string;
  title: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  return (
    <>
      <PageHeader largeTitle={false} width="default" title={navTitle} backHref="/purchase-orders" backLabel="Orders" />
      <PageContainer width="default">
        <ErrorState
          title={title}
          error={error}
          action={
            <>
              {onRetry && (
                <Button variant="tinted" onClick={onRetry}>
                  Try Again
                </Button>
              )}
              <Button asChild>
                <Link href="/purchase-orders">Back to Orders</Link>
              </Button>
            </>
          }
        />
      </PageContainer>
    </>
  );
}

function EditorSkeleton({ title, backHref }: { title: string; backHref: string }) {
  useHideMobileNav();
  const [, navigate] = useLocation();
  const field = (key: string, className = "") => (
    <div key={key} className={`space-y-2 ${className}`}>
      <Skeleton className="h-3 w-24 rounded-md" />
      <Skeleton className="h-11 rounded-[10px] md:h-9" />
    </div>
  );
  const group = (key: string, children: ReactNode) => (
    <div key={key} className="space-y-1.5">
      <Skeleton className="ml-4 h-3 w-16 rounded-md" />
      <div className="rounded-xl bg-card p-4 md:p-5">{children}</div>
    </div>
  );
  return (
    <>
      <PageHeader
        largeTitle={false}
        width="default"
        title={title}
        leading={
          <Button
            type="button"
            variant="plain"
            className="-ml-1 h-11 px-2 text-[17px] font-normal md:h-9 md:text-[15px]"
            onClick={() => leaveEditor(backHref, (href) => navigate(href, { replace: true }))}
          >
            Cancel
          </Button>
        }
      />
      <PageContainer width="default">
        <div className="space-y-7 md:space-y-8" aria-busy="true" aria-label="Loading purchase order">
          {group("customer", <Skeleton className="h-11 rounded-[10px] md:h-9" />)}
          {group(
            "order",
            <div className="grid gap-4 md:grid-cols-2 md:gap-x-5">
              {["a", "b", "c", "d"].map((k) => field(k))}
              {field("e")}
              {field("f")}
            </div>,
          )}
          {group(
            "addresses",
            <div className="grid gap-5 md:grid-cols-2 md:gap-x-5">
              {["a", "b"].map((k) => (
                <div key={k} className="space-y-2">
                  <Skeleton className="h-3 w-16 rounded-md" />
                  <Skeleton className="h-24 rounded-[10px]" />
                </div>
              ))}
            </div>,
          )}
          {group(
            "items",
            <div className="flex items-center gap-3">
              <Skeleton className="h-[29px] w-[29px] rounded-[7px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-3 w-48 rounded-md" />
              </div>
            </div>,
          )}
        </div>
      </PageContainer>
    </>
  );
}
