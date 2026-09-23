import { QueryClient } from "@tanstack/react-query";

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
          throw new Error(message);
        }

        return res.json();
      },
      // Keep data reasonably fresh when the app is used from a phone and a desktop.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
    mutations: {
      retry: false,
    }
  },
});
