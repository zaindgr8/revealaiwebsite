'use client';
import { COLORS } from '@/lib/theme';
import { CRISIS_RESOURCES_PENDING, type CrisisResource } from '@/lib/crisis';

/**
 * T-8: when crisis indicators are detected, the user is shown appropriate
 * support resources and the standard conversational flow is interrupted.
 *
 * Interruption is the point. This replaces the composer rather than sitting
 * above it — if the user can keep typing, the flow was not interrupted and the
 * requirement is not met.
 *
 * Visual language is deliberately quiet. Alarm styling — red, warning icons,
 * shouting — makes people feel caught rather than helped, and the likeliest
 * response to feeling caught is to close the tab.
 */
export function CrisisEscalation({
  resources,
  onAcknowledge,
  acknowledging = false,
}: {
  resources: CrisisResource[];
  onAcknowledge: () => void;
  acknowledging?: boolean;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Support resources"
      style={{
        borderTop: `1px solid ${COLORS.cardBorder}`,
        background: COLORS.card,
        padding: '20px 24px 22px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: 4,
            background: COLORS.blue,
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: COLORS.textMuted,
          }}
        >
          Support
        </span>
      </div>

      {resources.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {resources.map((r) => (
            <div
              key={`${r.region}-${r.name}`}
              style={{
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  marginBottom: 2,
                }}
              >
                {r.name}
              </div>
              <a
                href={
                  r.contact.startsWith('http')
                    ? r.contact
                    : `tel:${r.contact.replace(/\s/g, '')}`
                }
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: COLORS.blue,
                  textDecoration: 'none',
                }}
              >
                {r.contact}
              </a>
              {r.note && (
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>
                  {r.note}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /*
         * Resource list not yet populated — see D-7. The escalation must still
         * lead somewhere, so it points at emergency services and a trusted
         * person, neither of which depends on a number we have not verified.
         */
        <div
          style={{
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: COLORS.textSecondary,
            }}
          >
            Please contact your local emergency services, or reach out to
            someone you trust and tell them how you are feeling right now.
          </div>
          {CRISIS_RESOURCES_PENDING && process.env.NODE_ENV !== 'production' && (
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: `1px solid ${COLORS.cardBorder}`,
                fontSize: 11,
                color: COLORS.warning,
                fontWeight: 600,
              }}
            >
              DEV: CRISIS_RESOURCES is empty. Blocked on PRD decision D-7 —
              verified regional helpline numbers required before shipping.
            </div>
          )}
        </div>
      )}

      <button
        onClick={onAcknowledge}
        disabled={acknowledging}
        style={{
          width: '100%',
          padding: '13px 18px',
          borderRadius: 14,
          border: 'none',
          background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
          color: COLORS.white,
          fontSize: 14,
          fontWeight: 700,
          cursor: acknowledging ? 'wait' : 'pointer',
          opacity: acknowledging ? 0.6 : 1,
        }}
      >
        {acknowledging ? 'One moment…' : 'I understand'}
      </button>

      <p
        style={{
          fontSize: 11,
          color: COLORS.textMuted,
          textAlign: 'center',
          marginTop: 10,
          lineHeight: 1.5,
        }}
      >
        Reveal AI is not a crisis service and cannot provide emergency help.
      </p>
    </div>
  );
}
