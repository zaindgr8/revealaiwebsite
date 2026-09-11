'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import type { AccountStatus, AdminUserRow } from '@/lib/admin-data';
import { StatusBadge } from './StatusBadge';
import { ManageUserModal } from './ManageUserModal';

type FilterKey = 'all' | 'trial' | 'pro' | 'expired';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'trial', label: 'On trial' },
  { key: 'pro', label: 'Paid' },
  { key: 'expired', label: 'Expired' },
];

function matchesFilter(status: AccountStatus, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'trial') return status === 'trial_active';
  if (filter === 'pro') return status === 'pro_active';
  if (filter === 'expired') return status === 'trial_expired' || status === 'pro_expired';
  return true;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [managing, setManaging] = useState<AdminUserRow | null>(null);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: users.length, trial: 0, pro: 0, expired: 0 };
    for (const u of users) {
      if (matchesFilter(u.status, 'trial')) c.trial++;
      if (matchesFilter(u.status, 'pro')) c.pro++;
      if (matchesFilter(u.status, 'expired')) c.expired++;
    }
    return c;
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (!matchesFilter(u.status, filter)) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || (u.fullName ?? '').toLowerCase().includes(q);
    });
  }, [users, query, filter]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, padding: 4, background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 100 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 14px', borderRadius: 100, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                  background: active ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})` : 'transparent',
                  color: active ? COLORS.white : COLORS.textSecondary,
                }}
              >
                {f.label} · {counts[f.key]}
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 100,
              border: `1.5px solid ${COLORS.cardBorder}`, background: COLORS.card,
              fontSize: 13, color: COLORS.textPrimary, outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      <div
        style={{
          background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 16,
          overflow: 'auto',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr>
              {['User', 'Status', 'Joined', 'Period ends', 'Minutes', 'Streak', 'Sessions', ''].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '28px 16px', textAlign: 'center', fontSize: 13, color: COLORS.textMuted }}>
                  No users match this filter.
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} style={{ borderTop: `1px solid ${COLORS.cardBorder}` }}>
                <td style={tdStyle}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.textPrimary }}>
                    {u.fullName || '(no name set)'}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>{u.email}</div>
                </td>
                <td style={tdStyle}><StatusBadge status={u.status} /></td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{formatDate(u.createdAt)}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{formatDate(u.periodEndsAt)}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>
                    {u.minutesRemaining} left · {u.totalMinutesUsed} used
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>
                    {u.currentStreak}d {u.longestStreak > u.currentStreak ? `(best ${u.longestStreak}d)` : ''}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{u.sessionsCount}</span>
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => setManaging(u)}
                    style={{
                      padding: '7px 14px', borderRadius: 100, border: `1.5px solid ${COLORS.cardBorder}`,
                      background: COLORS.surface, color: COLORS.textPrimary, fontSize: 12, fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {managing && (
        <ManageUserModal
          user={managing}
          onClose={() => setManaging(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700,
  color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap',
};
