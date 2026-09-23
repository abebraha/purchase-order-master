import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Eye, EyeOff, Loader2, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { signIn } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type SignInMode =
  /** Opening the app while signed out. */
  | "sign-in"
  /** Signed out while using the app; the screen underneath is kept. */
  | "expired"
  /** The server has no APP_EMAIL / APP_PASSWORD yet. */
  | "not-configured"
  /** Couldn't reach the server to check. */
  | "offline";

const COPY: Record<"sign-in" | "expired", { title: string; subtitle: string }> = {
  "sign-in": { title: "PO Master", subtitle: "Sign in with your company account." },
  expired: { title: "Sign In Again", subtitle: "You were signed out. Sign in to continue where you left off." },
};

/** Wrong password: a quick side-to-side shake, like the macOS login window. */
function shake(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [0, -8, 8, -6, 6, -3, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 400, easing: "ease-in-out" },
  );
}

// The last email used on this device, so signing back in only needs the password.
const EMAIL_KEY = "po-sign-in-email";
function readSavedEmail(): string {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveEmail(email: string) {
  try {
    window.localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // Storage blocked (private mode) — prefilling is only a convenience.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  // fetch() rejects with a TypeError when the network is down.
  return "Can't connect right now. Check your internet connection and try again.";
}

/** The Apple-style sign-in page. Also used for "sign-in isn't set up" and "can't connect". */
export function SignInScreen({
  mode,
  onRetry,
  retrying,
}: {
  mode: SignInMode;
  /** "Try Again" for the not-configured and offline states. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-safe pt-safe">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-[400px]">
          {mode === "not-configured" ? (
            <Notice
              icon={TriangleAlert}
              tone="warning"
              title="Sign-In Isn't Set Up"
              body={
                <>
                  Add <Code>APP_EMAIL</Code> and <Code>APP_PASSWORD</Code> variables to this app on Railway, then redeploy.
                  Your purchase orders stay locked until then.
                </>
              }
              onRetry={onRetry}
              retrying={retrying}
            />
          ) : mode === "offline" ? (
            <Notice
              icon={WifiOff}
              tone="muted"
              title="Can't Connect"
              body="Check your internet connection and try again."
              onRetry={onRetry}
              retrying={retrying}
            />
          ) : (
            <SignInForm mode={mode} />
          )}
        </div>
      </main>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-secondary px-1 py-0.5 text-[0.9em] text-foreground">{children}</code>;
}

function AppIcon() {
  return (
    <img
      src="/icon.svg"
      alt=""
      className="h-[72px] w-[72px] rounded-[16px] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(0,0,0,0.08)]"
    />
  );
}

function SignInForm({ mode }: { mode: "sign-in" | "expired" }) {
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState(readSavedEmail);
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const copy = COPY[mode];

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password.");
      (email.trim() ? inputRef : emailRef).current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await signIn(email.trim(), password, remember);
      saveEmail(email.trim());
      // Signed in: the app replaces this screen.
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 401) {
        setPassword("");
        shake(cardRef.current);
      }
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  const describedBy = error ? errorId : undefined;
  const inputClass =
    "h-[52px] w-full min-w-0 bg-transparent pl-4 text-[17px] text-foreground outline-none placeholder:text-muted-foreground read-only:opacity-60 md:h-12 md:text-[15px]";

  return (
    <>
      <header className="mb-8 flex flex-col items-center text-center">
        <AppIcon />
        <h1 className="mt-5 text-title-1">{copy.title}</h1>
        <p className="mt-1.5 max-w-[20rem] text-[15px] leading-snug text-muted-foreground">{copy.subtitle}</p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <div ref={cardRef} className="overflow-hidden rounded-xl bg-card">
          <label htmlFor={emailId} className="sr-only">
            Email
          </label>
          <input
            ref={emailRef}
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            autoFocus={!email}
            readOnly={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            className={cn(inputClass, "pr-4")}
          />

          <div className="ml-4 h-px bg-border/80" aria-hidden />

          <div className="relative flex items-center">
            <label htmlFor={passwordId} className="sr-only">
              Password
            </label>
            <input
              ref={inputRef}
              id={passwordId}
              name="password"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={onKey}
              onKeyUp={onKey}
              placeholder="Password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              autoFocus={Boolean(email)}
              readOnly={pending}
              aria-invalid={Boolean(error)}
              aria-describedby={describedBy}
              className={cn(inputClass, "pr-12")}
            />
            <button
              type="button"
              onClick={() => {
                setVisible((v) => !v);
                inputRef.current?.focus();
              }}
              aria-label={visible ? "Hide password" : "Show password"}
              aria-pressed={visible}
              className="absolute right-1.5 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30"
            >
              {visible ? <EyeOff className="h-[19px] w-[19px]" /> : <Eye className="h-[19px] w-[19px]" />}
            </button>
          </div>

          <div className="ml-4 h-px bg-border/80" aria-hidden />

          <label className="flex min-h-[52px] cursor-pointer items-center gap-3 pl-4 pr-3 md:min-h-12">
            <span className="flex-1 text-[17px] md:text-[15px]">Keep Me Signed In</span>
            <Switch checked={remember} onCheckedChange={setRemember} disabled={pending} />
          </label>
        </div>

        <div className="mt-1.5 min-h-[18px] px-4 text-[13px] leading-snug" aria-live="polite">
          {error ? (
            <p id={errorId} className="font-medium text-destructive">
              {error}
            </p>
          ) : capsLock ? (
            <p className="text-muted-foreground">Caps Lock is on.</p>
          ) : (
            <p className="text-muted-foreground">
              {remember ? "Stays signed in on this device." : "Signs out when you close the browser — best on a shared computer."}
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending} className="mt-6 h-12 w-full text-[17px] md:h-11 md:text-[15px]">
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Signing In…" : "Sign In"}
        </Button>
      </form>
    </>
  );
}

function Notice({
  icon: Icon,
  tone,
  title,
  body,
  onRetry,
  retrying,
}: {
  icon: LucideIcon;
  tone: "warning" | "muted";
  title: string;
  body: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <AppIcon />
      <div
        className={cn(
          "mt-6 flex h-11 w-11 items-center justify-center rounded-full",
          tone === "warning" ? "bg-ios-orange/15 text-ios-orange" : "bg-ios-gray/15 text-muted-foreground",
        )}
        aria-hidden
      >
        <Icon className="h-[22px] w-[22px]" strokeWidth={2} />
      </div>
      <h1 className="mt-3 text-title-2">{title}</h1>
      <p className="mt-1.5 max-w-[22rem] text-[15px] leading-snug text-muted-foreground">{body}</p>
      {onRetry && (
        <Button variant="tinted" onClick={onRetry} disabled={retrying} className="mt-6">
          {retrying && <Loader2 className="animate-spin" aria-hidden />}
          Try Again
        </Button>
      )}
    </div>
  );
}
