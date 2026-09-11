import { COLORS } from '@/lib/theme';

export function SignupsBarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
      {data.map((d) => {
        const heightPct = Math.max(4, Math.round((d.count / max) * 100));
        const day = new Date(`${d.date}T00:00:00`);
        const label = day.toLocaleDateString(undefined, { weekday: 'narrow' });
        return (
          <div
            key={d.date}
            title={`${d.date}: ${d.count} signup${d.count === 1 ? '' : 's'}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%' }}
          >
            <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  minHeight: 3,
                  borderRadius: 4,
                  background: d.count > 0
                    ? `linear-gradient(180deg, ${COLORS.gradientEnd}, ${COLORS.gradientStart})`
                    : COLORS.cardBorder,
                }}
              />
            </div>
            <span style={{ fontSize: 9.5, color: COLORS.textMuted, fontWeight: 600 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
