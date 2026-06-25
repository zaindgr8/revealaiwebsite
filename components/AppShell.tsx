'use client';
import React, { useState } from 'react';
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
  { href: '/therapy', label: 'Reflect', icon: 'pulse' },
  { href: '/chat', label: 'AI Chat', icon: 'chat' },
  { href: '/trends', label: 'Trends', icon: 'trending-up' },
  { href: '/history', label: 'History', icon: 'time' },
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
          boxShadow: isMobile && sidebarOpen ? '0 0 30px rgba(0,0,0,0.5)' : 'none',
        }}
      >
        <Link
          href="/home"
          prefetch
          onClick={closeSidebar}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 8px 18px',
            marginBottom: 8,
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            textDecoration: 'none',
          }}
        >
          <Logo size={32} />
          <LogoText size={18} />
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
            paddingTop: 14,
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt="avatar"
              style={{ width: 36, height: 36, borderRadius: 18, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 800,
                color: COLORS.white,
                flexShrink: 0,
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
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: COLORS.textMuted,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.email}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            style={{
              padding: 8,
              borderRadius: 10,
              background: COLORS.cardBorder,
              flexShrink: 0,
            }}
          >
            <Icon name="log-out" size={16} color={COLORS.textSecondary} />
          </button>
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
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
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
  const bg = active
    ? 'linear-gradient(135deg, rgba(111, 98, 88, 0.18), rgba(201, 184, 168, 0.12))'
    : hover
    ? COLORS.cardBorder
    : 'transparent';
  const color = active || hover ? COLORS.textPrimary : COLORS.textSecondary;

  return (
    <Link
      href={href}
      prefetch
      onClick={onClick}
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
        border: active ? '1px solid rgba(111, 98, 88, 0.35)' : '1px solid transparent',
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
