import Link from 'next/link';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { getAdminOverview } from '@/lib/admin-data';
import { StatCard } from '@/components/admin/StatCard';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { SignupsBarChart } from '@/components/admin/SignupsBarChart';
import { SetupNeeded } from '@/components/admin/SetupNeeded';
import { MONTHLY_PRICE_USD } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  let overview;
  try {
    overview = await getAdminOverview();
  } catch (err) {
    return <SetupNeeded message={(err as Error).message} />;
  }

  return (
    <div>
      <PageHeader title="Overview" subtitle="Registrations, trials, and paid subscriptions at a glance." />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <StatCard label="Registered users" value={overview.totalUsers.toLocaleString()} icon="users" />
        <StatCard
          label="On free trial"
          value={overview.trialActive.toLocaleString()}
          sub={`${overview.trialExpired.toLocaleString()} trial(s) expired`}
          icon="time"
          accent={COLORS.blue}
        />
        <StatCard
          label="Paid (Pro)"
          value={overview.proActive.toLocaleString()}
          sub={`${overview.proExpired.toLocaleString()} lapsed`}
          icon="checkmark"
          accent={COLORS.success}
        />
        <StatCard
          label="Est. monthly revenue"
          value={`$${overview.estimatedMrr.toLocaleString()}`}
          sub={`Active Pro users x $${MONTHLY_PRICE_USD}/mo`}
          icon="trending-up"
          accent={COLORS.success}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          marginBottom: 28,
        }}
      >
        <StatCard label="Total sessions" value={overview.totalSessions.toLocaleString()} sub="Reflect + Live Call + Intent" icon="pulse" />
        <StatCard label="Minutes used" value={overview.totalMinutesUsed.toLocaleString()} sub="Across all users, all time" icon="mic" />
        <StatCard
          label="Avg. mood score"
          value={overview.avgMoodScore !== null ? String(overview.avgMoodScore) : '—'}
          sub="Across all Reflect check-ins"
          icon="sparkles"
        />
        <StatCard label="No profile row" value={overview.noProfile.toLocaleString()} sub="Signed up, profile not yet created" icon="warning" accent={COLORS.warning} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card>
          <CardHeader title="Recent sign-ups" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {overview.recentUsers.length === 0 && <EmptyRow text="No users yet." />}
            {overview.recentUsers.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '11px 0', borderBottom: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.fullName || u.email}
                  </div>
                  <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>
                    {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <StatusBadge status={u.status} />
              </div>
            ))}
          </div>
          <Link
            href="/admin/users"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14,
              fontSize: 13, fontWeight: 700, color: COLORS.blue, textDecoration: 'none',
            }}
          >
            View all users
            <Icon name="arrow-forward" size={13} color={COLORS.blue} />
          </Link>
        </Card>

        <Card>
          <CardHeader title="Sign-ups, last 14 days" />
          <SignupsBarChart data={overview.signupsByDay} />
        </Card>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 4px', fontFamily: 'var(--font-syne)', letterSpacing: '-0.4px' }}>
        {title}
      </h1>
      <p style={{ fontSize: 13.5, color: COLORS.textSecondary, margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 18, padding: 20 }}>
      {children}
    </div>
  );
}

function CardHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 14, fontFamily: 'var(--font-syne)' }}>
      {title}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ fontSize: 13, color: COLORS.textMuted, padding: '10px 0' }}>{text}</div>;
}
