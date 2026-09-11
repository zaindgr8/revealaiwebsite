import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client authenticated with the service role key.
 * Bypasses Row Level Security, so it can read/aggregate every user's data —
 * which the admin panel needs and no normal (anon key + user JWT) client can
 * do. Never import this from a 'use client' file and never expose
 * SUPABASE_SERVICE_ROLE_KEY as a NEXT_PUBLIC_ variable.
 */

let cached: SupabaseClient | null = null;

/**
 * Catches the single most common mistake — pasting the anon/publishable key
 * (which is also public-safe and lying around in NEXT_PUBLIC_SUPABASE_ANON_KEY)
 * into SUPABASE_SERVICE_ROLE_KEY instead of the actual secret key. Handles
 * both of Supabase's key formats: the newer sb_publishable_/sb_secret_ pair,
 * and legacy anon/service_role JWTs (decoded just far enough to read `role`;
 * never verified, since we only need the label for a better error message).
 */
function describeWrongKey(key: string, anonKey: string | undefined): string | null {
  if (anonKey && key === anonKey) {
    return 'That\'s the same value as NEXT_PUBLIC_SUPABASE_ANON_KEY — the anon/publishable key, not the secret key.';
  }
  if (key.startsWith('sb_publishable_')) {
    return 'That looks like a publishable key (starts with sb_publishable_), not a secret key.';
  }
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (payload?.role && payload.role !== 'service_role') {
        return `That's a legacy "${payload.role}" key, not the service_role key.`;
      }
    } catch {
      // Not a decodable JWT — fall through and let Supabase's own error surface.
    }
  }
  return null;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env — Supabase dashboard → ' +
        'Project Settings → API → "service_role" secret key — to enable the admin panel. ' +
        'Keep it server-side only; never prefix it with NEXT_PUBLIC_.'
    );
  }

  const wrongKeyReason = describeWrongKey(serviceKey, anonKey);
  if (wrongKeyReason) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY doesn't look right: ${wrongKeyReason} In your project's newer ` +
        'key system, the one you need is under Project Settings → API → API Keys → "Secret keys" ' +
        '(starts with sb_secret_) — a different key than the "Publishable key" shown above it.'
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
