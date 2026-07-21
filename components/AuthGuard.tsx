'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { COLORS } from '@/lib/theme';

// Pages that are allowed even without a subscription (so paywall doesn't loop)
const PAYMENT_PATHS = ['/payment'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, subStatus, subLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Redirect unauthenticated users to landing
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

  // Redirect if subscription expired — only after both auth + sub are loaded
  useEffect(() => {
    if (loading || subLoading) return;
    if (!user) return;
    if (PAYMENT_PATHS.some((p) => pathname?.startsWith(p))) return;
    if (subStatus && !subStatus.canUseApp) {
      router.replace('/payment');
    }
  }, [user, loading, subStatus, subLoading, pathname, router]);

  // Only show spinner on initial app load (auth not yet resolved)
  // Sub loading runs in parallel and doesn't block navigation
  if (loading) {
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

  // If sub loaded and user can't use app, render nothing (redirect in flight)
  if (!subLoading && subStatus && !subStatus.canUseApp) return null;

  // Render children immediately — no spinner for subscription check on navigation
  return <>{children}</>;
}
