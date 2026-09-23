/**
 * Sign-in state. The server keeps the session in an httpOnly cookie; the client only asks
 * whether it's signed in (GET /api/auth/session) and reacts when any request comes back 401.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { onUnauthorized, queryClient } from "./queryClient";

export interface AuthSession {
  /** False until APP_EMAIL and APP_PASSWORD are set on the server. */
  configured: boolean;
  authenticated: boolean;
  /** The account this device is signed in to. */
  email: string | null;
  signedInAt: string | null;
  /** "Keep me signed in" was on when this device signed in. */
  remembered: boolean;
}

export const SESSION_KEY = ["/api/auth/session"] as const;

export function useAuthSession() {
  return useQuery<AuthSession>({
    queryKey: SESSION_KEY,
    // Checked once per launch; after that, any 401 re-checks it (below).
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

// A 401 from any other request means this device may have been signed out (e.g. the password
// was changed). Ask the server rather than assuming, so a stray late response can't sign out a
// session that is actually fine.
onUnauthorized(() => {
  // Several requests can fail together (e.g. on returning to the app): share one re-check.
  void queryClient.invalidateQueries({ queryKey: SESSION_KEY }, { cancelRefetch: false });
});

export async function signIn(email: string, password: string, remember: boolean): Promise<void> {
  const session = await api<AuthSession>("POST", "/api/auth/login", { email, password, remember });
  queryClient.setQueryData(SESSION_KEY, session);
  // Reload whatever failed or went stale while signed out.
  void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
}

export async function signOut(): Promise<void> {
  await api("POST", "/api/auth/logout");
  // Start over from a clean page, so nothing from the signed-in session stays in memory.
  window.location.replace("/");
}
