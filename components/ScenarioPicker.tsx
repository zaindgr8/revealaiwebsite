'use client';
import { COLORS } from '@/lib/theme';
import type { IntentScenario } from '@/lib/audioStorage';

/**
 * I-3: the user selects one of three scenarios before recording, and the
 * selection is stored with the session.
 *
 * This is not cosmetic. The scenario picks which rubric the analysis runs
 * against, and "guarded" means something very different across a dinner table
 * than across a hiring desk. Choosing it up front rather than inferring it
 * later is what makes the output defensible.
 */

const SCENARIOS: {
  id: IntentScenario;
  title: string;
  blurb: string;
  icon: string;
}[] = [
  {
    id: 'date',
    title: 'Date',
    blurb: 'Social, personal. Reading warmth, interest, and hesitation.',
    icon: 'heart',
  },
  {
    id: 'interview',
    title: 'Interview',
    blurb: 'Professional, high-stakes. Reading engagement and evasion.',
    icon: 'briefcase',
  },
  {
    id: 'general',
    title: 'Something else',
    blurb: 'Any other conversation you want to understand better.',
    icon: 'chat',
  },
];

export function ScenarioPicker({
  value,
  onChange,
  disabled,
}: {
  value: IntentScenario | null;
  onChange: (s: IntentScenario) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Conversation type"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {SCENARIOS.map((s) => {
        const selected = value === s.id;
        return (
          <button
            key={s.id}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(s.id)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 13,
              textAlign: 'left',
              width: '100%',
              padding: '15px 16px',
              borderRadius: 14,
              border: `1.5px solid ${selected ? COLORS.blue : COLORS.cardBorder}`,
              background: selected ? COLORS.blue + '0A' : COLORS.card,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.55 : 1,
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                border: `1.5px solid ${selected ? COLORS.blue : COLORS.cardBorder}`,
                background: selected ? COLORS.blue : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {selected && (
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    background: COLORS.white,
                  }}
                />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  marginBottom: 3,
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>
                {s.blurb}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
