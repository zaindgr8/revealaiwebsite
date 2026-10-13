'use client';
import React, { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { useAuth } from '@/lib/auth-context';
import { signOut } from '@/lib/auth';
import { useIsMobile } from '@/hooks/useMediaQuery';

type NavItem = { href: string; label: string; icon: string };

const NAV: NavItem[] = [
  { href: '/home', label: 'Dashboard', icon: 'home' },
  { href: '/live', label: 'Talk to Therapist', icon: 'phone' },
  { href: '/chat', label: 'Chat with Therapist', icon: 'chat' },
  // Real-time spoken call with Freya, over the Gemini Multimodal Live API.
  // Also where check-in results live now: the recorded Reflect flow on
  // /therapy was retired and its results screen follows every call.
  
  // Feature 2, complete end to end since 15 August: consent, record or upload,
  // speaker-labelled transcript, and the I-5 analysis in /api/intent/analyse.
  // It was reachable here for two demos before it could finish, which was a
  // deliberate call and an uncomfortable one — a nav entry is a promise that
  // the thing behind it finishes.
  { href: '/intent', label: 'Intent Detector', icon: 'users' },
  { href: '/trends', label: 'Healing Journey', icon: 'trending-up' },
  { href: '/history', label: 'Sessions', icon: 'time' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

const SIDEBAR_WIDTH = 240;

const NavigationContext = createContext({ isMobile: false, openSidebar: () => {} });

export function AppNavigation({ children }: { children: React.ReactNode }) {
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
          // A faint brand wash at the top fading into white gives the rail
          // depth without introducing a new colour.
          background: `linear-gradient(180deg, rgba(37,99,235,0.045) 0%, ${COLORS.card} 220px)`,
          borderRight: `1px solid ${COLORS.cardBorder}`,
          display: 'flex',
          flexDirection: 'column',
          padding: '22px 14px 16px',
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
            padding: '4px 10px 20px',
            marginBottom: 14,
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            textDecoration: 'none',
          }}
        >
          <Logo size={24} />
        </Link>

        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: COLORS.textMuted,
            padding: '0 12px 8px',
          }}
        >
          Menu
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflowY: 'auto' }}>
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

        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              borderRadius: 16,
              background: COLORS.surface,
              border: `1px solid ${COLORS.cardBorder}`,
            }}
          >
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt="avatar"
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${COLORS.white}`, boxShadow: '0 0 0 1px rgba(37,99,235,0.25)' }}
              />
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                  boxShadow: '0 4px 12px -4px rgba(37,99,235,0.5)',
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
              aria-label="Sign out"
              className="rv-icon-btn"
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                background: COLORS.card,
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
            background: 'rgba(17,17,24,0.35)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 30,
          }}
        />
      )}

      <NavigationContext.Provider value={{ isMobile, openSidebar: () => setSidebarOpen(true) }}>
        {children}
      </NavigationContext.Provider>
    </div>
  );
}

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
  const { isMobile, openSidebar } = useContext(NavigationContext);
  return (
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
            background: 'rgba(247,247,249,0.8)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            padding: isMobile ? '12px 16px' : '14px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {isMobile && (
            <button
              onClick={openSidebar}
              aria-label="Open menu"
              className="rv-icon-btn"
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
              className="rv-icon-btn"
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
  const color = active || hover ? COLORS.textPrimary : COLORS.textSecondary;

  return (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: '100%',
        padding: '7px 10px',
        borderRadius: 12,
        background: active ? COLORS.card : hover ? 'rgba(17,17,24,0.04)' : 'transparent',
        boxShadow: active
          ? '0 1px 2px rgba(17,17,24,0.05), 0 6px 16px -8px rgba(37,99,235,0.35)'
          : 'none',
        border: active ? `1px solid ${COLORS.cardBorder}` : '1px solid transparent',
        color,
        fontSize: 13.5,
        fontWeight: active ? 700 : 600,
        textAlign: 'left',
        textDecoration: 'none',
        transition: 'background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease',
      }}
    >
      {/* Brand accent rail on the active item. */}
      {active && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -14,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: '0 3px 3px 0',
            background: `linear-gradient(180deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
          }}
        />
      )}
      <span
        aria-hidden="true"
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active
            ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
            : hover
            ? COLORS.card
            : 'transparent',
          boxShadow: active ? '0 4px 10px -4px rgba(37,99,235,0.6)' : 'none',
          transition: 'background 0.18s ease',
        }}
      >
        <Icon name={icon} size={16} color={active ? COLORS.white : color} />
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </Link>
  );
}
