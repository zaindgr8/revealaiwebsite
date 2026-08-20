import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const auth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: userError } = await auth.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run the profile read under the caller's JWT. The anon client without
    // this header is not an admin client and can be rejected by RLS.
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('trial_ends_at, subscription_status, subscription_minutes_remaining, total_minutes_used')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      console.error('[subscription/status] profile unavailable:', profileError?.message);
      return NextResponse.json(
        { error: 'Could not verify subscription status.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const now = new Date();
    const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const subscriptionStatus = profile.subscription_status ?? 'expired';
    const minutesRemaining = Math.max(0, Number(profile.subscription_minutes_remaining ?? 0));
    const totalMinutesUsed = profile.total_minutes_used ?? 0;

    // Determine effective status
    let effectiveStatus = subscriptionStatus;
    let trialDaysRemaining = 0;
    let trialActive = false;
    let daysRemaining = 0;

    if (subscriptionStatus === 'trial') {
      const diffMs = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : 0;
      trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      trialActive = diffMs > 0;
      daysRemaining = trialDaysRemaining;
      if (!trialActive) {
        effectiveStatus = 'expired';
      }
    } else if (subscriptionStatus === 'active') {
      const diffMs = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : 0;
      const subscriptionDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      const subscriptionActive = diffMs > 0;
      daysRemaining = subscriptionDaysRemaining;
      if (!subscriptionActive) {
        effectiveStatus = 'expired';
      }
    }

    // If active subscription but no minutes left
    const needsTopUp = effectiveStatus === 'active' && minutesRemaining <= 0;

    return NextResponse.json({
      status: effectiveStatus,
      trialActive,
      trialDaysRemaining,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      minutesRemaining,
      totalMinutesUsed,
      needsTopUp,
      daysRemaining,
      // canUseApp = trial active OR (active subscription with minutes > 0)
      canUseApp: trialActive || (effectiveStatus === 'active' && minutesRemaining > 0),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[subscription/status] failed:', err);
    return NextResponse.json(
      { error: 'Could not verify subscription status.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
