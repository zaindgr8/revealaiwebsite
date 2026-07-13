'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getSubscriptionStatus, type SubscriptionStatus } from '@/lib/subscription';
import { COLORS } from '@/lib/theme';

// Pages that are allowed even without a subscription (so paywall doesn't loop)
const PAYMENT_PATHS = ['/payment'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  // Redirect unauthenticated users to landing
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  // Check subscription status once user is known
  useEffect(() => {
    if (!user || loading) return;
    if (PAYMENT_PATHS.some((p) => pathname?.startsWith(p))) {
      setSubLoading(false);
      return;
    }

    getSubscriptionStatus()
      .then((s) => {
        setSubStatus(s);
        if (!s.canUseApp) {
          // Trial expired or out of minutes → go to paywall
          router.replace('/payment');
        }
      })
      .catch(() => {
        // If subscription check fails (e.g., DB migration not run yet),
        // fail OPEN — allow the user through. Don't lock them out.
        setSubStatus(null);
      })
      .finally(() => setSubLoading(false));
  }, [user, loading, pathname, router]);

  const isLoading = loading || subLoading;

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COLORS.background,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: `3px solid ${COLORS.cardBorder}`,
            borderTopColor: COLORS.blue,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    );
  }

  if (!user) return null;

  // On payment pages, allow through regardless of subscription
  if (PAYMENT_PATHS.some((p) => pathname?.startsWith(p))) {
    return <>{children}</>;
  }

  // If subStatus loaded and user can't use app, render nothing (redirect in flight)
  if (subStatus && !subStatus.canUseApp) return null;

  return <>{children}</>;
}
