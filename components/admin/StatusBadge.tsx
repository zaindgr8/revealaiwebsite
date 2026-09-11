import { COLORS } from '@/lib/theme';
import { STATUS_LABEL, type AccountStatus } from '@/lib/admin-data';

const STATUS_COLOR: Record<AccountStatus, string> = {
  trial_active: COLORS.blue,
  trial_expired: COLORS.textMuted,
  pro_active: COLORS.success,
  pro_expired: COLORS.warning,
  no_profile: COLORS.textMuted,
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 100,
        background: `${color}14`, border: `1px solid ${color}33`,
        color, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 3, background: color }} />
      {STATUS_LABEL[status]}
    </span>
  );
}
