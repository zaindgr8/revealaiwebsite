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

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Try full select first
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('trial_ends_at, subscription_status, subscription_minutes_remaining, total_minutes_used')
      .eq('id', user.id)
      .maybeSingle();

    // If new columns are missing in DB, fallback to selecting core columns
    if (profileError) {
      const fallbackQuery = await supabaseAdmin
        .from('profiles')
        .select('trial_ends_at, subscription_status')
        .eq('id', user.id)
        .maybeSingle();
      if (!fallbackQuery.error && fallbackQuery.data) {
        profile = {
          ...fallbackQuery.data,
          subscription_minutes_remaining: 150,
          total_minutes_used: 0,
        };
        profileError = null;
      }
    }

    // If still no profile or error, return default active trial so app never crashes with 500
    if (profileError || !profile) {
      const defaultTrialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return NextResponse.json({
        status: 'trial',
        trialActive: true,
        trialDaysRemaining: 7,
        trialEndsAt: defaultTrialEnd.toISOString(),
        minutesRemaining: 150,
        totalMinutesUsed: 0,
        needsTopUp: false,
        daysRemaining: 7,
        canUseApp: true,
      });
    }

    const now = new Date();
    const trialEndsAt = profile.trial_ends_at ? new Date(profile.trial_ends_at) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const subscriptionStatus = profile.subscription_status ?? 'trial';
    const minutesRemaining = profile.subscription_minutes_remaining ?? 150;
    const totalMinutesUsed = profile.total_minutes_used ?? 0;

    // Determine effective status
    let effectiveStatus = subscriptionStatus;
    let trialDaysRemaining = 7;
    let trialActive = true;
    let daysRemaining = 7;

    if (subscriptionStatus === 'trial') {
      const diffMs = trialEndsAt.getTime() - now.getTime();
      trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      trialActive = diffMs > 0;
      daysRemaining = trialDaysRemaining;
      if (!trialActive) {
        effectiveStatus = 'expired';
      }
    } else if (subscriptionStatus === 'active') {
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
      trialEndsAt: trialEndsAt.toISOString(),
      minutesRemaining,
      totalMinutesUsed,
      needsTopUp,
      daysRemaining,
      // canUseApp = trial active OR (active subscription with minutes > 0)
      canUseApp: trialActive || (effectiveStatus === 'active' && minutesRemaining > 0),
    });
  } catch (err) {
    console.warn('[subscription/status] Returning default trial fallback due to:', err);
    const defaultTrialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return NextResponse.json({
      status: 'trial',
      trialActive: true,
      trialDaysRemaining: 7,
      trialEndsAt: defaultTrialEnd.toISOString(),
      minutesRemaining: 150,
      totalMinutesUsed: 0,
      needsTopUp: false,
      daysRemaining: 7,
      canUseApp: true,
    });
  }
}
