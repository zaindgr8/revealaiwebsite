import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('trial_ends_at, subscription_status, subscription_minutes_remaining, total_minutes_used')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const now = new Date();
    const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const subscriptionStatus = profile?.subscription_status ?? 'trial';
    const minutesRemaining = profile?.subscription_minutes_remaining ?? 0;
    const totalMinutesUsed = profile?.total_minutes_used ?? 0;

    // Determine effective status
    let effectiveStatus = subscriptionStatus;
    let trialDaysRemaining = 0;
    let trialActive = false;
    let daysRemaining = 0;

    if (subscriptionStatus === 'trial' && trialEndsAt) {
      const diffMs = trialEndsAt.getTime() - now.getTime();
      trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      trialActive = diffMs > 0;
      daysRemaining = trialDaysRemaining;
      if (!trialActive) {
        effectiveStatus = 'expired';
      }
    } else if (subscriptionStatus === 'active' && trialEndsAt) {
      const diffMs = trialEndsAt.getTime() - now.getTime();
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
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
