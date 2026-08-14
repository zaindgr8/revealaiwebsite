'use client';
import { useState } from 'react';
import { COLORS } from '@/lib/theme';

/**
 * I-3: a consent screen is shown before the conversation is submitted and
 * requires explicit confirmation.
 *
 * WHAT CHANGED, AND WHY IT MATTERS LEGALLY
 *
 * This screen originally gated a microphone: the app recorded the conversation
 * itself, so withholding consent physically prevented a recording from
 * existing. The product now takes an upload of audio the user captured
 * elsewhere, which means by the time anyone sees this screen the recording has
 * already been made.
 *
 * It can therefore only ask the user to ATTEST that consent was obtained. It
 * cannot enforce it. That is a materially weaker position than the PRD wording
 * implies, and D-2 and D-3 should be answered with this in mind rather than
 * against the original flow.
 *
 * The copy below is written honestly about that: it asks what happened at the
 * time of recording, in the past tense, instead of pretending to be a gate.
 *
 * WHO THIS SCREEN IS FOR
 *
 * Not the user. The user agreed to everything at signup. The person with no
 * relationship to this product, whose voice is about to be analysed, is the
 * one whose consent carries weight — and under UAE law that is the part with
 * legal force.
 *
 * It is deliberately plain and slightly uncomfortable to read, because a
 * consent screen that is easy to click past is not consent, it is a formality
 * that happens to be logged.
 *
 * The two checkboxes are separate on purpose. "I told them" and "they agreed"
 * are different facts, and collapsing them into one tick invites the user to
 * confirm something they did not actually do.
 *
 * LEGAL COPY IS PLACEHOLDER — pending D-2 (is second-party consent required)
 * and D-3 (who is writing the policies). The mechanism is real; the wording
 * needs a lawyer, and it should not ship as written.
 */

export function ConsentGate({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [told, setTold] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const ready = told && agreed && !busy;

  return (
    <div>
      <div
        style={{
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 16,
          padding: '20px 20px 18px',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: COLORS.textMuted,
            marginBottom: 12,
          }}
        >
          Before you upload
        </div>

        <h2
          style={{
            fontSize: 19,
            fontWeight: 800,
            color: COLORS.textPrimary,
            fontFamily: 'var(--font-syne)',
            letterSpacing: '-0.4px',
            lineHeight: 1.3,
            marginBottom: 12,
          }}
        >
          Did the other person know they were being recorded?
        </h2>

        <div
          style={{
            fontSize: 14,
            lineHeight: 1.65,
            color: COLORS.textSecondary,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <p>
            You are about to upload a recording of someone who is not a user of
            this product. It will be analysed by software that describes how
            they sounded.
          </p>
          <p>
            Recording a person without their knowledge carries real legal
            consequences in the UAE. If they did not know, do not upload it.
          </p>
          <p style={{ color: COLORS.textMuted, fontSize: 13 }}>
            {/* TODO(D-3): replace with reviewed legal copy covering retention,
                deletion, third-party processing, and the right to withdraw.
                Note for whoever reviews this: the app cannot verify any of the
                statements below. It records an assertion by the uploader. */}
            Placeholder: retention period, deletion rights, and who processes
            the audio to be confirmed before launch.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {/*
          Past tense, and separated. The recording already exists, so these are
          two distinct claims about what happened at the time — telling someone
          and them agreeing are not the same event, and one checkbox would
          invite confirming something that did not occur.
        */}
        <CheckRow
          checked={told}
          onChange={setTold}
          label="The other person knew they were being recorded"
        />
        <CheckRow
          checked={agreed}
          onChange={setAgreed}
          label="They agreed to it, and to it being analysed"
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={onConfirm}
          disabled={!ready}
          style={{
            flex: 1,
            minWidth: 180,
            padding: '13px 20px',
            borderRadius: 14,
            border: 'none',
            background: ready
              ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
              : COLORS.cardBorder,
            color: ready ? COLORS.white : COLORS.textMuted,
            fontSize: 14,
            fontWeight: 700,
            cursor: ready ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'One moment…' : 'Confirm and continue'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: '13px 20px',
            borderRadius: 14,
            border: `1px solid ${COLORS.cardBorder}`,
            background: 'transparent',
            color: COLORS.textSecondary,
            fontSize: 14,
            fontWeight: 700,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '13px 14px',
        borderRadius: 12,
        border: `1.5px solid ${checked ? COLORS.blue : COLORS.cardBorder}`,
        background: checked ? COLORS.blue + '0A' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          border: `1.5px solid ${checked ? COLORS.blue : COLORS.cardBorder}`,
          background: checked ? COLORS.blue : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={COLORS.white} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <span style={{ fontSize: 13.5, color: COLORS.textPrimary, lineHeight: 1.5 }}>
        {label}
      </span>
    </button>
  );
}
