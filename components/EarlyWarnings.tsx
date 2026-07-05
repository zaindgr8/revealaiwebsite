'use client';
import { useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Card } from './Card';
import { Icon } from './Icon';
import {
  computeEarlyWarnings,
  WARNING_RULES_DOC,
  type EarlyWarning,
  type TherapySession,
  type WarningSeverity,
} from '@/lib/ai';

const SEVERITY_COLOR: Record<WarningSeverity, string> = {
  high: COLORS.danger,
  caution: COLORS.warning,
  info: COLORS.blue,
};

const SEVERITY_LABEL: Record<WarningSeverity, string> = {
  high: 'Action recommended',
  caution: 'Worth noticing',
  info: 'Gentle nudge',
};

export function EarlyWarnings({ sessions }: { sessions: TherapySession[] }) {
  const warnings = computeEarlyWarnings(sessions);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showHow, setShowHow] = useState(false);

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>
            <Icon name="warning" size={15} color={COLORS.danger} />
            Early Warning Alerts
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            {warnings.length
              ? `${warnings.length} active signal${warnings.length === 1 ? '' : 's'} based on your recent check-ins`
              : 'No active signals — your recent patterns look stable'}
          </div>
        </div>
        <button
          onClick={() => setShowHow((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: COLORS.cardBorder,
            border: `1px solid ${COLORS.cardBorder}`,
            color: COLORS.textSecondary,
            padding: '7px 12px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Icon name="bulb" size={12} color={COLORS.textSecondary} />
          {showHow ? 'Hide' : 'How this works'}
        </button>
      </div>

      {warnings.length === 0 && (
        <div
          style={{
            background: 'rgba(22, 163, 74, 0.06)',
            border: `1px solid rgba(22, 163, 74, 0.18)`,
            borderRadius: 12,
            padding: 14,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <Icon name="checkmark" size={16} color={COLORS.success} style={{ marginTop: 2 }} />
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.55 }}>
            We monitor your last 3–5 sessions for burnout, sustained stress, mood slumps and pattern
            loops. Right now nothing has crossed our thresholds.
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {warnings.map((w) => (
            <WarningRow
              key={w.id}
              warning={w}
              expanded={expandedRule === w.id}
              onToggle={() => setExpandedRule(expandedRule === w.id ? null : w.id)}
            />
          ))}
        </div>
      )}

      {showHow && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: `1px solid ${COLORS.cardBorder}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: COLORS.textMuted,
              lineHeight: 1.6,
              marginBottom: 12,
            }}
          >
            Every alert is a pattern detected across your recent sessions — never a one-off bad
            reading. Each rule has an exact threshold so you can see why it fired:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {WARNING_RULES_DOC.map((rule) => (
              <div
                key={rule.title}
                style={{
                  background: 'rgba(17, 17, 24, 0.025)',
                  border: `1px solid ${COLORS.cardBorder}`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
                  {rule.title}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55, marginBottom: 6 }}>
                  {rule.description}
                </div>
                {rule.examples.map((ex, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 11,
                      color: COLORS.textMuted,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    }}
                  >
                    • {ex}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function WarningRow({
  warning,
  expanded,
  onToggle,
}: {
  warning: EarlyWarning;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = SEVERITY_COLOR[warning.severity];

  return (
    <div
      style={{
        background: 'rgba(17, 17, 24, 0.025)',
        border: `1px solid ${color}33`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 8px',
              background: `${color}1a`,
              border: `1px solid ${color}33`,
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              color,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            {SEVERITY_LABEL[warning.severity]}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
            {warning.title}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>
            {warning.detail}
          </div>
        </div>
        <button
          onClick={onToggle}
          aria-label={expanded ? 'Hide rule' : 'Why this fired'}
          style={{
            padding: 6,
            borderRadius: 8,
            background: COLORS.cardBorder,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={COLORS.textSecondary}
          />
        </button>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${COLORS.cardBorder}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Why this fired
            </div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>
              {warning.rule}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: COLORS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 4,
              }}
            >
              Recommendation
            </div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>
              {warning.recommendation}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
