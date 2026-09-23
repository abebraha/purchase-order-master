import session from "express-session";
import { sql } from "drizzle-orm";
import { db } from "@db";

/** Server-side lifetime of a session whose cookie has no expiry ("keep me signed in" off). */
const BROWSER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Rolling sessions only rewrite their expiry once it has moved at least this much. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

function expiryOf(sess: session.SessionData): Date {
  const expires = sess.cookie?.expires;
  if (expires) {
    const d = new Date(expires);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() + BROWSER_SESSION_TTL_MS);
}

type Callback = (err?: unknown) => void;

function run(promise: Promise<unknown>, callback?: Callback) {
  promise.then(
    () => callback?.(),
    (err) => callback?.(err),
  );
}

/**
 * express-session store backed by the app's Postgres (table `auth_sessions`, created additively
 * in db/index.ts), so sign-ins survive restarts and redeploys. Uses the same connection as the
 * rest of the app.
 */
export class PgSessionStore extends session.Store {
  private pruneTimer: NodeJS.Timeout;

  constructor() {
    super();
    this.pruneTimer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    this.pruneTimer.unref();
    void this.prune();
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void) {
    db.execute(sql`SELECT sess FROM auth_sessions WHERE sid = ${sid} AND expire > NOW()`).then(
      (rows) => callback(null, ((rows as unknown as Array<{ sess: session.SessionData }>)[0]?.sess) ?? null),
      (err) => callback(err),
    );
  }

  set(sid: string, sess: session.SessionData, callback?: Callback) {
    const expire = expiryOf(sess);
    run(
      db.execute(sql`
        INSERT INTO auth_sessions (sid, sess, expire)
        VALUES (${sid}, ${JSON.stringify(sess)}::text::jsonb, ${expire})
        ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire
      `),
      callback,
    );
  }

  destroy(sid: string, callback?: Callback) {
    run(db.execute(sql`DELETE FROM auth_sessions WHERE sid = ${sid}`), callback);
  }

  /** Extends a rolling session. Throttled so ordinary browsing doesn't write on every request. */
  touch(sid: string, sess: session.SessionData, callback?: () => void) {
    const expire = expiryOf(sess);
    const threshold = new Date(expire.getTime() - TOUCH_INTERVAL_MS);
    run(
      db.execute(sql`UPDATE auth_sessions SET expire = ${expire} WHERE sid = ${sid} AND expire < ${threshold}`),
      callback,
    );
  }

  private async prune() {
    try {
      await db.execute(sql`DELETE FROM auth_sessions WHERE expire <= NOW()`);
    } catch (err) {
      console.error("Couldn't remove expired sessions:", err);
    }
  }
}
