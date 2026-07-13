'use client';
import { supabase } from './supabase';

export type SubscriptionStatus = {
  status: 'trial' | 'active' | 'expired' | 'error';
  trialActive: boolean;
  trialDaysRemaining: number;
  trialEndsAt: string | null;
  minutesRemaining: number;
  totalMinutesUsed: number;
  needsTopUp: boolean;
  canUseApp: boolean;
  daysRemaining: number;
};

/** Fetch current subscription status for the logged-in user */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return {
      status: 'expired',
      trialActive: false,
      trialDaysRemaining: 0,
      trialEndsAt: null,
      minutesRemaining: 0,
      totalMinutesUsed: 0,
      needsTopUp: false,
      canUseApp: false,
      daysRemaining: 0,
    };
  }

  const res = await fetch('/api/subscription/status', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch subscription status: ${res.status}`);
  }

  return res.json();
}

/** Create a Ziina payment and return the redirect URL */
export async function createZiinaPayment(): Promise<{ redirectUrl: string; paymentIntentId: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/subscription/create-payment', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? 'Failed to create payment');
  }

  return res.json();
}

/** Verify a Ziina payment intent after user returns from checkout */
export async function verifyZiinaPayment(paymentIntentId: string): Promise<{
  verified: boolean;
  status: string;
  minutesGranted?: number;
  newMinutesRemaining?: number;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/subscription/verify-payment', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paymentIntentId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? 'Failed to verify payment');
  }

  return res.json();
}

/** Deduct session minutes from the subscription (call after each therapy session) */
export async function deductSessionMinutes(durationSeconds: number): Promise<{
  minutesDeducted: number;
  minutesRemaining: number;
  needsTopUp: boolean;
  skipped?: boolean;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch('/api/subscription/use-minutes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ durationSeconds }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error ?? 'Failed to deduct minutes');
  }

  return res.json();
}
