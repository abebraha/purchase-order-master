import { QueryClient } from "@tanstack/react-query";

/** Error thrown by API calls; carries the HTTP status and the server's human-readable message. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The query key's first element is the URL to GET.
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
        });

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
