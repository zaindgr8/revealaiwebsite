import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Admin-panel auth. This is a single shared operator login — not a Supabase
 * user — so it's kept completely separate from lib/auth.ts / auth-context.tsx.
 *
 * Credentials default to the values requested for the panel, but can be
 * overridden with ADMIN_USERNAME / ADMIN_PASSWORD env vars without touching
 * code. Sessions are a signed, HttpOnly cookie: `${expiresAt}.${hmac}`, where
 * the hmac is over `admin:${expiresAt}` keyed by ADMIN_SESSION_SECRET. No
 * server-side session store is needed — the signature is the proof.
 */

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'revealvoice';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Wegrowtogether@yo';

// Falls back to a fixed default so the panel works out of the box. Set
// ADMIN_SESSION_SECRET in .env for a production deployment so sessions can't
// be forged by anyone who reads this source file.
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'revealai-admin-panel-default-secret-change-me';

export const ADMIN_SESSION_COOKIE = 'ra_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function sign(expiresAt: number): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`admin:${expiresAt}`).digest('hex');
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  if (!username || !password) return false;
  return timingSafeStringEqual(username, ADMIN_USERNAME) && timingSafeStringEqual(password, ADMIN_PASSWORD);
}

export function issueAdminSessionCookie(): { value: string; maxAgeSeconds: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  return { value: `${expiresAt}.${sign(expiresAt)}`, maxAgeSeconds: SESSION_TTL_MS / 1000 };
}

export function isValidAdminSessionValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const dot = value.indexOf('.');
  if (dot === -1) return false;
  const expiresAtStr = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return timingSafeStringEqual(sig, sign(expiresAt));
}

/** Call at the top of a server component/layout that must be admin-only. */
export async function requireAdminSession(): Promise<void> {
  const store = await cookies();
  const value = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSessionValue(value)) {
    redirect('/admin/login');
  }
}

/** True/false version for places that want to branch instead of redirect. */
export async function hasValidAdminSession(): Promise<boolean> {
  const store = await cookies();
  return isValidAdminSessionValue(store.get(ADMIN_SESSION_COOKIE)?.value);
}
