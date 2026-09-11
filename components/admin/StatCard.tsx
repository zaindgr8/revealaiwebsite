import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = COLORS.blue,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 18,
        padding: '20px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          {label}
        </span>
        <div
          style={{
            width: 30, height: 30, borderRadius: 9, background: `${accent}14`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Icon name={icon} size={14} color={accent} />
        </div>
      </div>
      <div>
        <div
          style={{
            fontSize: 26, fontWeight: 800, color: COLORS.textPrimary,
            fontFamily: 'var(--font-syne)', letterSpacing: '-0.6px', lineHeight: 1,
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 6, lineHeight: 1.4 }}>{sub}</div>
        )}
      </div>
    </div>
  );
}
