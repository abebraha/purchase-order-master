import { QueryClient } from "@tanstack/react-query";

/** Error thrown by API calls; carries the HTTP status and the server's human-readable message. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Signed out (HTTP 401)
// ---------------------------------------------------------------------------

const unauthorizedListeners = new Set<() => void>();

/** Runs `listener` whenever the server says this device isn't signed in (see lib/auth.ts). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/** Call when a request comes back 401: the session ended (signed out, or the password changed). */
export function reportUnauthorized() {
  unauthorizedListeners.forEach((listener) => listener());
}

export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The query key's first element is the URL to GET.
      queryFn: async ({ queryKey }): Promise<unknown> => {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
        });

        if (res.status === 401) {
          reportUnauthorized();
          // Keep showing what's already loaded (the sign-in sheet covers it) rather than turning
          // the screen into an error — an open editor must not lose its unsaved changes.
          const cached: unknown = queryClient.getQueryData(queryKey);
          if (cached !== undefined) return cached;
        }

        if (!res.ok) {
          let message = `${res.status}: ${res.statusText}`;
          try {
            const data = await res.json();
            message = data.message || data.error || message;
          } catch {
            // non-JSON error body
          }
          throw new ApiError(res.status, message);
        }

        return res.json();
      },
      // Keep data reasonably fresh when the app is used from a phone and a desktop.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Retry once for network/server hiccups, never for 4xx (e.g. a PO that doesn't exist).
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
    mutations: {
      retry: false,
    }
  },
});
