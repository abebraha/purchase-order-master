import { useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useAuthSession } from "@/lib/auth";
import { SignInScreen } from "./SignInScreen";

/**
 * Shows the sign-in screen until this device is signed in, then the app.
 *
 * If the session ends while the app is open (e.g. the password was changed), the app stays
 * mounted under a full-screen sign-in sheet, so an open form keeps its unsaved changes and the
 * user can save again right after signing back in.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: session, isError, isFetching, refetch } = useAuthSession();
  const authenticated = Boolean(session?.authenticated);
  const [appShown, setAppShown] = useState(false);
  if (authenticated && !appShown) setAppShown(true);

  const retry = () => void refetch();

  if (appShown) {
    return (
      <>
        {children}
        <DialogPrimitive.Root open={!authenticated}>
          <DialogPrimitive.Portal>
            {/* Above any dialog that was already open; can't be dismissed without signing in. */}
            <DialogPrimitive.Content
              aria-describedby={undefined}
              onEscapeKeyDown={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
              className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-background outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-6 data-[state=open]:duration-300"
            >
              <DialogPrimitive.Title className="sr-only">Signed Out</DialogPrimitive.Title>
              <SignInScreen mode="expired" />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </>
    );
  }

  if (!session) {
    return isError ? <SignInScreen mode="offline" onRetry={retry} retrying={isFetching} /> : <LaunchScreen />;
  }
  if (!session.configured) {
    return <SignInScreen mode="not-configured" onRetry={retry} retrying={isFetching} />;
  }
  return <SignInScreen mode="sign-in" />;
}

/** While checking the session: the app icon fades in only if it takes a moment. */
function LaunchScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background" aria-busy="true" aria-label="Loading">
      <img
        src="/icon.svg"
        alt=""
        className="h-[72px] w-[72px] rounded-[16px] animate-in fade-in fill-mode-both delay-300 duration-500"
      />
    </div>
  );
}
