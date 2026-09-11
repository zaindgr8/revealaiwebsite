import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';

export function SetupNeeded({ message }: { message: string }) {
  return (
    <div
      style={{
        maxWidth: 620,
        margin: '40px auto',
        background: COLORS.card,
        border: `1px solid ${COLORS.warning}33`,
        borderRadius: 18,
        padding: 28,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 38, height: 38, borderRadius: 11, background: `${COLORS.warning}14`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Icon name="warning" size={18} color={COLORS.warning} />
        </div>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 8px', fontFamily: 'var(--font-syne)' }}>
            One setup step left
          </h2>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.7, margin: '0 0 14px' }}>
            {message}
          </p>
          <ol style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.9, margin: 0, paddingLeft: 20, listStyleType: 'decimal' }}>
            <li>Open your Supabase project dashboard.</li>
            <li>Go to <strong>Project Settings → API</strong>.</li>
            <li>Copy the <strong>service_role</strong> secret key (not the anon/public key).</li>
            <li>
              Add it to <code style={codeStyle}>.env</code> as{' '}
              <code style={codeStyle}>SUPABASE_SERVICE_ROLE_KEY=...</code>
            </li>
            <li>Restart the dev server (or redeploy) and refresh this page.</li>
          </ol>
          <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 14, lineHeight: 1.6 }}>
            This key bypasses row-level security, so it must stay server-only — never commit it,
            never prefix it with <code style={codeStyle}>NEXT_PUBLIC_</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

const codeStyle: React.CSSProperties = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 5,
  padding: '1px 6px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
};
