'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { useIsMobile } from '@/hooks/useMediaQuery';

const NAV = [
  { href: '/admin', label: 'Overview', icon: 'home', exact: true },
  { href: '/admin/users', label: 'Users', icon: 'users', exact: false },
];

const SIDEBAR_WIDTH = 232;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const showSidebar = !isMobile || sidebarOpen;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: COLORS.background, fontFamily: 'var(--font-dm)' }}>
      <aside
        style={{
          position: 'fixed', top: 0, left: 0, height: '100vh',
          width: isMobile ? 250 : SIDEBAR_WIDTH,
          background: COLORS.card, borderRight: `1px solid ${COLORS.cardBorder}`,
          display: 'flex', flexDirection: 'column', padding: '22px 14px',
          zIndex: 40, transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s ease',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 16px', marginBottom: 8, borderBottom: `1px solid ${COLORS.cardBorder}` }}>
          <Logo size={22} />
          <span
            style={{
              fontSize: 9.5, fontWeight: 800, color: COLORS.blue, background: 'rgba(37,99,235,0.08)',
              border: '1px solid rgba(37,99,235,0.2)', padding: '2px 7px', borderRadius: 6,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            Admin
          </span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                onClick={() => setSidebarOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 11,
                  textDecoration: 'none', fontSize: 13.5, fontWeight: 600,
                  color: active ? COLORS.textPrimary : COLORS.textSecondary,
                  background: active ? 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(14,165,233,0.1))' : 'transparent',
                  border: active ? '1px solid rgba(37,99,235,0.3)' : '1px solid transparent',
                }}
              >
                <Icon name={item.icon} size={16} color={active ? COLORS.blue : COLORS.textSecondary} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11,
            border: `1px solid ${COLORS.cardBorder}`, background: COLORS.surface,
            color: COLORS.textSecondary, fontSize: 13, fontWeight: 600,
            marginTop: 8, cursor: loggingOut ? 'wait' : 'pointer',
          }}
        >
          <Icon name="log-out" size={15} color={COLORS.textSecondary} />
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </aside>

      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 30 }} />
      )}

      <div style={{ marginLeft: isMobile ? 0 : SIDEBAR_WIDTH, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {isMobile && (
          <header
            style={{
              position: 'sticky', top: 0, zIndex: 20, background: 'rgba(247,247,249,0.92)',
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              borderBottom: `1px solid ${COLORS.cardBorder}`, padding: '12px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`,
              }}
            >
              <Icon name="menu" size={18} color={COLORS.textPrimary} />
            </button>
            <Logo size={20} />
          </header>
        )}

        <main style={{ flex: 1, width: '100%', maxWidth: 1280, margin: '0 auto', padding: isMobile ? '20px 16px 48px' : '32px 36px 56px' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
