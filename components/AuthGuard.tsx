'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { COLORS } from '@/lib/theme';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/');
    }
  }, [user, loading, router]);

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

  return <>{children}</>;
}
