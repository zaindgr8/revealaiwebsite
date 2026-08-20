import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GEMINI_LIVE_MODEL } from '@/lib/geminiModel';

/**
 * Issues a one-use, short-lived credential for a Gemini Live connection.
 * GEMINI_API_KEY never leaves this server. The token is also constrained to
 * the one Live model and AUDIO responses, so copying it cannot unlock the
 * rest of the Gemini API.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY environment variable is missing' },
      { status: 500 }
    );
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Query under the caller's JWT. RLS remains the ownership boundary and the
  // token endpoint fails closed if subscription data cannot be verified.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('trial_ends_at, subscription_status, subscription_minutes_remaining')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error('[gemini-token] entitlement unavailable:', profileError?.message);
    return NextResponse.json(
      { error: 'Could not verify your plan. Please try again.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const expiresAtMs = profile.trial_ends_at
    ? new Date(profile.trial_ends_at).getTime()
    : Number.NaN;
  const withinPlanWindow = Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  const remaining = Number(profile.subscription_minutes_remaining ?? 0);
  const canStartCall =
    (profile.subscription_status === 'trial' && withinPlanWindow) ||
    (profile.subscription_status === 'active' && withinPlanWindow && remaining > 0);

  if (!canStartCall) {
    return NextResponse.json(
      { error: 'Your plan has no live-call time available.' },
      { status: 402, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();
  const provision = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/auth_tokens',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime,
        newSessionExpireTime,
        // AuthToken's current REST schema exposes the constrained setup as
        // bidiGenerateContentSetup plus a field mask. The higher-level SDK
        // calls this liveConnectConstraints, but sending that SDK name over
        // REST is rejected as an unknown field.
        bidiGenerateContentSetup: {
          model: `models/${GEMINI_LIVE_MODEL}`,
          generationConfig: { responseModalities: ['AUDIO'] },
        },
        fieldMask:
          'model,generationConfig.responseModalities',
      }),
    }
  );

  if (!provision.ok) {
    const detail = await provision.text().catch(() => provision.statusText);
    console.error('[gemini-token] ephemeral token failed:', provision.status, detail);
    return NextResponse.json(
      { error: 'Live Call is temporarily unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const issued = (await provision.json()) as { name?: unknown };
  if (typeof issued.name !== 'string' || !issued.name) {
    console.error('[gemini-token] provisioning returned no token name');
    return NextResponse.json(
      { error: 'Live Call is temporarily unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      token: issued.name,
      expiresAt: expireTime,
      model: GEMINI_LIVE_MODEL,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
