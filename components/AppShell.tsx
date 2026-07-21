'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Icon } from './Icon';
import { Logo, LogoText } from './Logo';
import { useAuth } from '@/lib/auth-context';
import { signOut } from '@/lib/auth';
import { useIsMobile } from '@/hooks/useMediaQuery';

type NavItem = { href: string; label: string; icon: string };

const NAV: NavItem[] = [
  { href: '/home', label: 'Dashboard', icon: 'home' },
  { href: '/live-call', label: 'Live Call', icon: 'mic' },
  { href: '/therapy', label: 'Reflect', icon: 'pulse' },
  // { href: '/chat', label: 'AI Chat', icon: 'chat' },
  { href: '/journey', label: 'Journey', icon: 'trending-up' },
  { href: '/sessions', label: 'Sessions', icon: 'time' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const SIDEBAR_WIDTH = 240;

export function AppShell({
  children,
  title,
  subtitle,
  contentMaxWidth = 1180,
  contentPadding,
  disableContentPadding = false,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  contentMaxWidth?: number;
  contentPadding?: string;
  disableContentPadding?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'You';
  const initials = displayName
    .trim()
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const closeSidebar = () => setSidebarOpen(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch {}
  };

  const showSidebar = !isMobile || sidebarOpen;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.background,
        position: 'relative',
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: isMobile ? 260 : SIDEBAR_WIDTH,
          background: COLORS.card,
          borderRight: `1px solid ${COLORS.cardBorder}`,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 16px',
          zIndex: 40,
          transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          boxShadow: isMobile && sidebarOpen ? '0 0 30px rgba(0,0,0,0.12)' : 'none',
        }}
      >
        {/* Top gradient accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#2563eb,#0ea5e9)', borderRadius: '0 0 0 0' }} />
        <Link
          href="/home"
          prefetch
          onClick={closeSidebar}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px 18px',
            marginBottom: 8,
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            textDecoration: 'none',
          }}
        >
          <Logo size={24} />
        </Link>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
          {NAV.map((item) => {
            const active = !!pathname && pathname.startsWith(item.href);
            return (
              <SidebarItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={active}
                onClick={closeSidebar}
              />
            );
          })}
        </nav>

        <div
          style={{
            borderTop: `1px solid ${COLORS.cardBorder}`,
            paddingTop: 12,
            marginTop: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt="avatar"
                style={{ width: 34, height: 34, borderRadius: 10, objectFit: 'cover', border: `1px solid ${COLORS.cardBorder}` }}
              />
            ) : (
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  color: COLORS.white,
                  flexShrink: 0,
                  fontFamily: 'var(--font-syne)',
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-syne)',
                }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: COLORS.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: 1,
                }}
              >
                {user?.email}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: COLORS.surface,
                border: `1px solid ${COLORS.cardBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon name="log-out" size={14} color={COLORS.textMuted} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 30,
          }}
        />
      )}

      {/* Main area */}
      <div
        style={{
          marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(247,247,249,0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            padding: isMobile ? '12px 16px' : '14px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: COLORS.card,
                border: `1px solid ${COLORS.cardBorder}`,
                flexShrink: 0,
              }}
            >
              <Icon name="menu" size={20} color={COLORS.textPrimary} />
            </button>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: COLORS.textPrimary,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-syne)',
                  letterSpacing: '-0.4px',
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.textSecondary,
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-dm)',
                }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {!isMobile && (
            <Link
              href="/settings"
              prefetch
              aria-label="Settings"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: COLORS.card,
                border: `1px solid ${COLORS.cardBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              <Icon name="settings" size={18} color={COLORS.textSecondary} />
            </Link>
          )}
        </header>

        <main
          style={{
            flex: 1,
            width: '100%',
            maxWidth: contentMaxWidth,
            margin: '0 auto',
            padding: disableContentPadding
              ? 0
              : contentPadding ?? (isMobile ? '18px 16px 60px' : '28px 32px 60px'),
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  href,
  icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [pending, setPending] = useState(false);

  // Clear pending once pathname settles on this item
  useEffect(() => {
    if (active) setPending(false);
  }, [active]);

  const isActive = active || pending;
  const bg = isActive
    ? 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(14, 165, 233, 0.1))'
    : hover
    ? COLORS.cardBorder
    : 'transparent';
  const color = isActive || hover ? COLORS.textPrimary : COLORS.textSecondary;

  return (
    <Link
      href={href}
      prefetch
      onClick={() => {
        setPending(true);
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 12,
        background: bg,
        border: isActive ? '1px solid rgba(37, 99, 235, 0.3)' : '1px solid transparent',
        color,
        fontSize: 14,
        fontWeight: 600,
        textAlign: 'left',
        textDecoration: 'none',
        transition: 'background 0.15s ease, color 0.15s ease',
      }}
    >
      <Icon name={icon} size={18} color={color} />
      <span>{label}</span>
    </Link>
  );
}
