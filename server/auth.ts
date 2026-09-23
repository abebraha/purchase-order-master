/**
 * Sign-in for the whole app: one shared team password (APP_PASSWORD, set on Railway) and
 * long-lived, httpOnly session cookies stored in Postgres.
 *
 *   POST /api/auth/login    { password, remember? }  → signs this device in
 *   POST /api/auth/logout                            → signs this device out
 *   GET  /api/auth/session                           → { configured, authenticated, … }
 *
 * Every other /api route answers 401 without a valid session. Changing APP_PASSWORD signs every
 * device out. If APP_PASSWORD isn't set, sign-in is disabled and the API stays locked.
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db";
import { PgSessionStore } from "./session-store";
import { log } from "./vite";

declare module "express-session" {
  interface SessionData {
    /** Set on sign-in. `v` identifies the password that was used (see `fingerprint`). */
    auth?: { v: string; at: number };
  }
}

export const SESSION_COOKIE = "po.sid";
/** "Keep me signed in": a year, extended on every visit, so the Home Screen app stays signed in. */
const REMEMBER_MS = 365 * 24 * 60 * 60 * 1000;

const NOT_CONFIGURED_MESSAGE =
  "Sign-in isn't set up yet. Add an APP_PASSWORD variable to this app on Railway, then redeploy.";
const SIGN_IN_REQUIRED_MESSAGE = "Please sign in to continue.";

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

function scryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.trim().normalize("NFC"), salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

interface PasswordConfig {
  /** scrypt(APP_PASSWORD); null when no password is configured. */
  key: Buffer | null;
  salt: Buffer;
  /** Stored in each session; changes whenever APP_PASSWORD does, which ends older sessions. */
  fingerprint: string | null;
}

async function loadPasswordConfig(secret: string): Promise<PasswordConfig> {
  const salt = createHmac("sha256", secret).update("po-master:password-salt").digest();
  const password = process.env.APP_PASSWORD?.trim() ?? "";
  if (!password) {
    log("APP_PASSWORD is not set: sign-in is disabled and every API request will be refused.", "auth");
    return { key: null, salt, fingerprint: null };
  }
  if (password.length < 8) log("APP_PASSWORD is shorter than 8 characters; a longer one is safer.", "auth");
  const key = await scryptKey(password, salt);
  return { key, salt, fingerprint: createHash("sha256").update(key).digest("hex").slice(0, 32) };
}

// ---------------------------------------------------------------------------
// Session signing secret
// ---------------------------------------------------------------------------

/**
 * SESSION_SECRET if set; otherwise a random secret generated once and kept in the database, so
 * sessions stay valid across restarts without any extra setup.
 */
async function loadSessionSecret(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const generated = randomBytes(32).toString("base64url");
  await db.execute(
    sql`INSERT INTO app_secrets (key, value) VALUES ('session_secret', ${generated}) ON CONFLICT (key) DO NOTHING`,
  );
  const rows = (await db.execute(sql`SELECT value FROM app_secrets WHERE key = 'session_secret'`)) as unknown as Array<{
    value: string;
  }>;
  return rows[0].value;
}

// ---------------------------------------------------------------------------
// Rate limiting (failed sign-ins only)
// ---------------------------------------------------------------------------

class FailureLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    setInterval(() => this.sweep(), windowMs).unref();
  }

  private recent(key: string, now = Date.now()): number[] {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Milliseconds until another attempt is allowed (0 = allowed now). */
  retryAfterMs(key: string): number {
    const now = Date.now();
    const list = this.recent(key, now);
    return list.length < this.limit ? 0 : list[list.length - this.limit] + this.windowMs - now;
  }

  fail(key: string) {
    this.failures.set(key, [...this.recent(key), Date.now()]);
  }

  reset(key: string) {
    this.failures.delete(key);
  }

  private sweep() {
    for (const key of Array.from(this.failures.keys())) this.recent(key);
  }
}

const WINDOW_MS = 15 * 60 * 1000;
/** Per device/IP: 10 wrong passwords per 15 minutes. */
const perIpLimiter = new FailureLimiter(10, WINDOW_MS);
/** Across everyone: caps guessing spread over many IPs. Signed-in devices are unaffected. */
const globalLimiter = new FailureLimiter(100, WINDOW_MS);

function describeWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  password: z.string().max(256),
  remember: z.boolean().optional().default(true),
});

function promisified(fn: (cb: (err?: unknown) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => fn((err) => (err ? reject(err) : resolve())));
}

/**
 * Installs sessions, the /api/auth endpoints and the guard that locks every other /api route.
 * Must run before the API routes (and body parsers) are registered.
 */
export async function setupAuth(app: Express) {
  const secret = await loadSessionSecret();
  const password = await loadPasswordConfig(secret);

  // Railway terminates HTTPS in front of the app: trust its one proxy hop so secure cookies
  // work and req.ip is the visitor's address (for rate limiting).
  app.set("trust proxy", 1);

  const cookie: session.CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    // Secure whenever the visit is HTTPS (always, on Railway: see "trust proxy" above).
    secure: "auto",
    path: "/",
  };

  const isAuthenticated = (req: Request) =>
    Boolean(password.fingerprint && req.session?.auth?.v === password.fingerprint);

  const sessionInfo = (req: Request) => {
    const authenticated = isAuthenticated(req);
    return {
      configured: Boolean(password.key),
      authenticated,
      signedInAt: authenticated ? new Date(req.session.auth!.at).toISOString() : null,
      remembered: authenticated && typeof req.session.cookie.originalMaxAge === "number",
    };
  };

  app.use(
    "/api",
    (_req, res, next) => {
      // Order data must never linger in a shared computer's browser cache.
      res.setHeader("Cache-Control", "no-store");
      next();
    },
    session({
      name: SESSION_COOKIE,
      secret,
      store: new PgSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie,
    }),
  );

  const authJson = express.json({ limit: "10kb" });

  app.get("/api/auth/session", (req, res) => {
    res.json(sessionInfo(req));
  });

  app.post("/api/auth/login", authJson, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!password.key) {
        return res.status(503).json({ error: NOT_CONFIGURED_MESSAGE, message: NOT_CONFIGURED_MESSAGE });
      }

      const ip = req.ip || "unknown";
      const wait = Math.max(perIpLimiter.retryAfterMs(ip), globalLimiter.retryAfterMs("*"));
      if (wait > 0) {
        const message = `Too many attempts. Try again in ${describeWait(wait)}.`;
        res.setHeader("Retry-After", String(Math.ceil(wait / 1000)));
        return res.status(429).json({ error: message, message });
      }

      const body = loginSchema.safeParse(req.body ?? {});
      if (!body.success || !body.data.password.trim()) {
        return res.status(400).json({ error: "Enter the password.", message: "Enter the password." });
      }

      const attempt = await scryptKey(body.data.password, password.salt);
      if (!timingSafeEqual(attempt, password.key)) {
        perIpLimiter.fail(ip);
        globalLimiter.fail("*");
        log(`sign-in failed from ${ip}`, "auth");
        const message = "That password isn't right. Try again.";
        return res.status(401).json({ error: message, message });
      }

      perIpLimiter.reset(ip);
      // New session id on sign-in (prevents session fixation).
      await promisified((cb) => req.session.regenerate(cb));
      req.session.auth = { v: password.fingerprint!, at: Date.now() };
      // Without "keep me signed in" the cookie lasts until the browser is closed.
      if (body.data.remember) req.session.cookie.maxAge = REMEMBER_MS;
      await promisified((cb) => req.session.save(cb));
      log(`signed in from ${ip}${body.data.remember ? " (remembered)" : ""}`, "auth");
      res.json(sessionInfo(req));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/logout", (req, res, next) => {
    const done = () => {
      res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: req.secure });
      res.json({ configured: Boolean(password.key), authenticated: false, signedInAt: null, remembered: false });
    };
    if (!req.session) return done();
    req.session.destroy((err) => (err ? next(err) : done()));
  });

  // Everything else under /api requires a signed-in session.
  app.use("/api", (req, res, next) => {
    if (isAuthenticated(req)) return next();
    // A session from before a password change: remove it so it can't be tried again.
    if (req.session?.auth) req.session.destroy(() => {});
    res.status(401).json({ error: "Sign in required", message: SIGN_IN_REQUIRED_MESSAGE });
  });

  if (password.key) log("sign-in enabled", "auth");
}
