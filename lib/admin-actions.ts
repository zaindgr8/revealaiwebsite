import { getSupabaseAdmin } from './supabaseAdmin';
import { MONTHLY_MINUTES, YEARLY_MINUTES, TRIAL_DAYS } from './pricing';

/**
 * Manual admin overrides for a user's access — used from /admin/users to
 * comp an account, fix a support issue, or hand-grant a plan outside the
 * normal Ziina checkout. These write straight to `profiles` with the
 * service-role client, bypassing RLS the same way the real payment webhook
 * does; they do not touch Ziina or charge anyone.
 */

export type GrantPlan = 'trial' | 'monthly' | 'yearly';

const DAY_MS = 24 * 60 * 60 * 1000;

function planToUpdate(plan: GrantPlan): {
  subscription_status: 'trial' | 'active';
  trial_ends_at: string;
  subscription_minutes_remaining: number;
} {
  const now = Date.now();
  switch (plan) {
    case 'trial':
      // Mirrors initTrialIfNeeded in lib/auth-context.tsx: trial access is
      // time-boxed, not minute-limited, so minutes start at 0.
      return {
        subscription_status: 'trial',
        trial_ends_at: new Date(now + TRIAL_DAYS * DAY_MS).toISOString(),
        subscription_minutes_remaining: 0,
      };
    case 'monthly':
      return {
        subscription_status: 'active',
        trial_ends_at: new Date(now + 30 * DAY_MS).toISOString(),
        subscription_minutes_remaining: MONTHLY_MINUTES,
      };
    case 'yearly':
      return {
        subscription_status: 'active',
        trial_ends_at: new Date(now + 365 * DAY_MS).toISOString(),
        subscription_minutes_remaining: YEARLY_MINUTES,
      };
  }
}

export async function grantAccess(userId: string, plan: GrantPlan): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('profiles').update(planToUpdate(plan)).eq('id', userId);
  if (error) throw error;
}

/** Matches the expiry shape lib/profile.ts itself writes when an account lapses. */
export async function expireAccess(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('profiles')
    .update({ subscription_status: 'expired', subscription_minutes_remaining: 0 })
    .eq('id', userId);
  if (error) throw error;
}

export async function setMinutesRemaining(userId: string, minutes: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('profiles')
    .update({ subscription_minutes_remaining: Math.max(0, Math.round(minutes)) })
    .eq('id', userId);
  if (error) throw error;
}
