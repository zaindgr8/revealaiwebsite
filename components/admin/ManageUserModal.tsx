'use client';
import { useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { GradientButton } from '@/components/GradientButton';
import type { AdminUserRow } from '@/lib/admin-data';
import { MONTHLY_PRICE_USD, MONTHLY_MINUTES, YEARLY_PRICE_USD, YEARLY_MINUTES, YEARLY_DISCOUNT_PCT, TRIAL_DAYS } from '@/lib/pricing';
import { StatusBadge } from './StatusBadge';

type PlanOption = {
  key: 'trial' | 'monthly' | 'yearly' | 'expire';
  title: string;
  price: string;
  detail: string;
  accent: string;
};

const PLAN_OPTIONS: PlanOption[] = [
  { key: 'trial', title: 'Free Trial', price: 'Free', detail: `${TRIAL_DAYS} days full access`, accent: COLORS.blue },
  { key: 'monthly', title: 'Pro · Monthly', price: `$${MONTHLY_PRICE_USD}/mo`, detail: `${MONTHLY_MINUTES} minutes · 30 days`, accent: COLORS.success },
  { key: 'yearly', title: 'Pro · Yearly', price: `$${YEARLY_PRICE_USD.toFixed(2)}/yr`, detail: `${YEARLY_DISCOUNT_PCT}% off · ${YEARLY_MINUTES.toLocaleString()} minutes · 365 days`, accent: COLORS.success },
  { key: 'expire', title: 'Expire Access', price: '—', detail: 'Revoke access immediately', accent: COLORS.danger },
];

export function ManageUserModal({ user, onClose, onChanged }: { user: AdminUserRow; onClose: () => void; onChanged: () => void }) {
  const [pending, setPending] = useState<PlanOption['key'] | null>(null);
  const [applying, setApplying] = useState(false);
  const [minutesInput, setMinutesInput] = useState(String(user.minutesRemaining));
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPlan = async (key: PlanOption['key']) => {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(key === 'expire' ? { action: 'expire' } : { action: 'grant', plan: key }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update this user.');
      }
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setPending(null);
    } finally {
      setApplying(false);
    }
  };

  const saveMinutes = async () => {
    const minutes = Number(minutesInput);
    if (!Number.isFinite(minutes) || minutes < 0) {
      setError('Enter a valid, non-negative number of minutes.');
      return;
    }
    setSavingMinutes(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_minutes', minutes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update minutes.');
      }
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingMinutes(false);
    }
  };

  const pendingOption = PLAN_OPTIONS.find((o) => o.key === pending);

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,24,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, background: COLORS.card, borderRadius: 20, border: `1px solid ${COLORS.cardBorder}`, overflow: 'hidden', boxShadow: '0 24px 60px rgba(17,17,24,0.25)' }}
      >
        <div style={{ padding: '20px 22px', borderBottom: `1px solid ${COLORS.cardBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.fullName || user.email}
              </div>
              <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{user.email}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: COLORS.surface, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="close" size={13} color={COLORS.textMuted} />
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <StatusBadge status={user.status} />
          </div>
        </div>

        <div style={{ padding: '18px 22px 22px' }}>
          {!pending && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Change plan
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {PLAN_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setPending(opt.key)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${COLORS.cardBorder}`,
                      background: COLORS.surface, textAlign: 'left', cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: opt.accent }}>{opt.title}</div>
                      <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{opt.detail}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.textPrimary, flexShrink: 0 }}>{opt.price}</div>
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Adjust minutes only
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={minutesInput}
                  onChange={(e) => setMinutesInput(e.target.value)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${COLORS.cardBorder}`, fontSize: 13.5, color: COLORS.textPrimary, background: COLORS.surface }}
                />
                <button
                  onClick={saveMinutes}
                  disabled={savingMinutes}
                  style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: COLORS.cardBorder, color: COLORS.textPrimary, fontSize: 13, fontWeight: 700, cursor: savingMinutes ? 'wait' : 'pointer' }}
                >
                  {savingMinutes ? 'Saving…' : 'Set'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 6 }}>
                Doesn&apos;t change status or period end — just tops up or reduces the minute balance.
              </div>
            </>
          )}

          {pending && pendingOption && (
            <div>
              <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.65, margin: '0 0 18px' }}>
                {pendingOption.key === 'expire' ? (
                  <>Revoke access for <strong>{user.email}</strong> immediately? Status becomes <strong>expired</strong> and minutes reset to 0.</>
                ) : (
                  <>
                    Grant <strong>{pendingOption.title}</strong> to <strong>{user.email}</strong>? This sets{' '}
                    {pendingOption.detail.toLowerCase()}{' '}and doesn&apos;t charge them via Ziina — it&apos;s a manual override.
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <GradientButton
                  title={applying ? 'Applying…' : 'Confirm'}
                  onClick={() => applyPlan(pending)}
                  disabled={applying}
                  style={{ borderRadius: 10, fontSize: 13.5, minHeight: 40 }}
                />
                <button
                  onClick={() => setPending(null)}
                  disabled={applying}
                  style={{ padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${COLORS.cardBorder}`, background: 'transparent', color: COLORS.textSecondary, fontSize: 13.5, fontWeight: 700 }}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: `${COLORS.danger}0f`, border: `1px solid ${COLORS.danger}33`, color: COLORS.danger, fontSize: 12.5, lineHeight: 1.5 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
