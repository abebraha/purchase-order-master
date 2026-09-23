import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { ApiError, queryClient, reportUnauthorized } from "./queryClient";
import type {
  AddressBook,
  AppSettings,
  CustomerFormValues,
  CustomerRecord,
  DeletedPurchaseOrder,
  POFormValues,
  POStatus,
  PORevision,
  PurchaseOrder,
  StyleFormValues,
  StyleImportResult,
  StyleRecord,
} from "@shared/po";

export { ApiError };

/** JSON fetch helper. Throws ApiError with the server's message on non-2xx responses. */
export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    // Sign-in requests answer 401 for a wrong password; anything else means the session ended.
    if (res.status === 401 && !url.startsWith("/api/auth/")) reportUnauthorized();
    const message =
      (data && typeof data === "object" && (data.message || data.error)) ||
      (typeof data === "string" && data) ||
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Query keys & invalidation
// ---------------------------------------------------------------------------

export type ArchivedFilter = "exclude" | "only" | "include";

export const keys = {
  purchaseOrders: (archived: ArchivedFilter = "exclude") =>
    [archived === "exclude" ? "/api/purchase-orders" : `/api/purchase-orders?archived=${archived}`] as const,
  purchaseOrder: (id: number | string) => [`/api/purchase-orders/${id}`] as const,
  revisions: (id: number | string) => [`/api/purchase-orders/${id}/revisions`] as const,
  nextNumber: () => ["/api/purchase-orders/next-number"] as const,
  deleted: () => ["/api/deleted-purchase-orders"] as const,
  styles: () => ["/api/styles"] as const,
  customers: () => ["/api/customers"] as const,
  addresses: () => ["/api/addresses"] as const,
  settings: () => ["/api/settings"] as const,
};

function invalidateByPrefix(client: QueryClient, ...prefixes: string[]) {
  return client.invalidateQueries({
    predicate: (q) => {
      const k = String(q.queryKey[0] ?? "");
      return prefixes.some((p) => k.startsWith(p));
    },
  });
}

/** Refresh everything that depends on purchase-order data. */
export function invalidatePurchaseOrders(client: QueryClient = queryClient) {
  return invalidateByPrefix(
    client,
    "/api/purchase-orders",
    "/api/deleted-purchase-orders",
    "/api/addresses",
    "/api/styles", // style usage counts
  );
}

export function invalidateStyles(client: QueryClient = queryClient) {
  return invalidateByPrefix(client, "/api/styles", "/api/purchase-orders");
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePurchaseOrders(archived: ArchivedFilter = "exclude") {
  return useQuery<PurchaseOrder[]>({ queryKey: keys.purchaseOrders(archived) });
}

export function usePurchaseOrder(id: number | string | undefined) {
  return useQuery<PurchaseOrder>({ queryKey: keys.purchaseOrder(id ?? ""), enabled: !!id });
}

export function useRevisions(id: number | string | undefined) {
  return useQuery<PORevision[]>({ queryKey: keys.revisions(id ?? ""), enabled: !!id });
}

export function useNextPoNumber(enabled = true) {
  return useQuery<{ poNumber: string }>({ queryKey: keys.nextNumber(), enabled, staleTime: 0 });
}

export function useDeletedPurchaseOrders() {
  return useQuery<DeletedPurchaseOrder[]>({ queryKey: keys.deleted() });
}

export function useStyles() {
  return useQuery<StyleRecord[]>({ queryKey: keys.styles() });
}

export function useCustomers() {
  return useQuery<CustomerRecord[]>({ queryKey: keys.customers() });
}

export function useAddresses() {
  return useQuery<AddressBook>({ queryKey: keys.addresses() });
}

export function useSettings() {
  return useQuery<AppSettings>({ queryKey: keys.settings(), staleTime: 5 * 60_000 });
}

/** Returns true if another PO already uses this number (case-insensitive). */
export async function checkPoNumberTaken(poNumber: string, excludeId?: number): Promise<boolean> {
  const qs = excludeId ? `?excludeId=${excludeId}` : "";
  const res = await api<{ exists: boolean }>(
    "GET",
    `/api/purchase-orders/check/${encodeURIComponent(poNumber.trim())}${qs}`,
  );
  return res.exists;
}

// ---------------------------------------------------------------------------
// Purchase-order mutations
// ---------------------------------------------------------------------------

function cachePO(po: PurchaseOrder) {
  queryClient.setQueryData(keys.purchaseOrder(po.id), po);
}

export function useCreatePurchaseOrder() {
  return useMutation({
    mutationFn: (values: POFormValues) => api<PurchaseOrder>("POST", "/api/purchase-orders", values),
    onSuccess: (po) => {
      cachePO(po);
      invalidatePurchaseOrders();
    },
  });
}

export function useUpdatePurchaseOrder(id: number) {
  return useMutation({
    mutationFn: (values: POFormValues) => api<PurchaseOrder>("PUT", `/api/purchase-orders/${id}`, values),
    onSuccess: (po) => {
      cachePO(po);
      invalidatePurchaseOrders();
    },
  });
}

export function useSetPurchaseOrderStatus() {
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: POStatus }) =>
      api<PurchaseOrder>("PATCH", `/api/purchase-orders/${id}/status`, { status }),
    onSuccess: (po) => {
      cachePO(po);
      invalidatePurchaseOrders();
    },
  });
}

/** Give older POs (created before status tracking) a status; each gets a history entry. */
export function useReviewPurchaseOrders() {
  return useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: POStatus }) =>
      api<{ updated: number }>("POST", "/api/purchase-orders/review", { ids, status }),
    onSuccess: () => invalidatePurchaseOrders(),
  });
}

export function useArchivePurchaseOrder() {
  return useMutation({
    mutationFn: (id: number) => api<PurchaseOrder>("POST", `/api/purchase-orders/${id}/archive`),
    onSuccess: (po) => {
      cachePO(po);
      invalidatePurchaseOrders();
    },
  });
}

export function useRestorePurchaseOrder() {
  return useMutation({
    mutationFn: (id: number) => api<PurchaseOrder>("POST", `/api/purchase-orders/${id}/restore`),
    onSuccess: (po) => {
      cachePO(po);
      invalidatePurchaseOrders();
    },
  });
}

/** Permanently deletes an ARCHIVED PO (server rejects active ones). A snapshot stays recoverable. */
export function useDeletePurchaseOrder() {
  return useMutation({
    mutationFn: (id: number) => api<{ success: true }>("DELETE", `/api/purchase-orders/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: keys.purchaseOrder(id) });
      invalidatePurchaseOrders();
    },
  });
}

export function useRecoverDeletedPurchaseOrder() {
  return useMutation({
    mutationFn: (revisionId: number) =>
      api<PurchaseOrder>("POST", `/api/deleted-purchase-orders/${revisionId}/recover`),
    onSuccess: (po) => {
      cachePO(po);
      invalidatePurchaseOrders();
    },
  });
}

// ---------------------------------------------------------------------------
// Style mutations
// ---------------------------------------------------------------------------

export function useCreateStyle() {
  return useMutation({
    mutationFn: (values: StyleFormValues) => api<StyleRecord>("POST", "/api/styles", values),
    onSuccess: () => invalidateStyles(),
  });
}

export function useUpdateStyle() {
  return useMutation({
    mutationFn: ({ id, ...values }: StyleFormValues & { id: number }) =>
      api<StyleRecord>("PUT", `/api/styles/${id}`, values),
    onSuccess: () => invalidateStyles(),
  });
}

export function useDeleteStyle() {
  return useMutation({
    mutationFn: (id: number) => api<{ success: true }>("DELETE", `/api/styles/${id}`),
    onSuccess: () => invalidateStyles(),
  });
}

export function useBulkCreateStyles() {
  return useMutation({
    mutationFn: (styles: StyleFormValues[]) =>
      api<StyleImportResult>("POST", "/api/styles/bulk", { styles }),
    onSuccess: () => invalidateStyles(),
  });
}

export function useImportStylesCsv() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<StyleImportResult>("POST", "/api/styles/import", form);
    },
    onSuccess: () => invalidateStyles(),
  });
}

// ---------------------------------------------------------------------------
// Customer mutations
// ---------------------------------------------------------------------------

function invalidateCustomers() {
  return invalidateByPrefix(queryClient, "/api/customers");
}

export function useCreateCustomer() {
  return useMutation({
    mutationFn: (values: CustomerFormValues) => api<CustomerRecord>("POST", "/api/customers", values),
    onSuccess: () => invalidateCustomers(),
  });
}

export function useUpdateCustomer() {
  return useMutation({
    mutationFn: ({ id, ...values }: CustomerFormValues & { id: number }) =>
      api<CustomerRecord>("PUT", `/api/customers/${id}`, values),
    onSuccess: () => invalidateCustomers(),
  });
}

export function useDeleteCustomer() {
  return useMutation({
    mutationFn: (id: number) => api<{ success: true }>("DELETE", `/api/customers/${id}`),
    onSuccess: () => invalidateCustomers(),
  });
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function useSaveSettings() {
  return useMutation({
    mutationFn: (settings: AppSettings) => api<AppSettings>("PUT", "/api/settings", settings),
    onSuccess: (settings) => queryClient.setQueryData(keys.settings(), settings),
  });
}
