'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Card } from '@/components/Card';
import { Logo, LogoText } from '@/components/Logo';
import { Icon } from '@/components/Icon';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import { useAuth } from '@/lib/auth-context';
import { signOut } from '@/lib/auth';
import { deleteAccount, updateProfileName, uploadAvatar, cancelSubscription } from '@/lib/profile';
import { getAllSessionsForExport } from '@/lib/ai';
import { VoiceEnrollment } from '@/components/VoiceEnrollment';
import { TherapistVoicePicker } from '@/components/TherapistVoicePicker';

function SettingsInner() {
  const router = useRouter();
  const { user, profile, setProfile, refreshProfile } = useAuth();

  const fileRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cancellingSub, setCancellingSub] = useState(false);

  const handleCancelSubscription = async () => {
    if (!user?.id) return;
    const confirmCancel = window.confirm(
      'Are you sure you want to cancel your subscription? This will immediately end your access and clear any remaining minutes.'
    );
    if (!confirmCancel) return;
    setCancellingSub(true);
    try {
      await cancelSubscription(user.id);
      refreshProfile();
      alert('Subscription cancelled successfully.');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCancellingSub(false);
    }
  };
  const [notifications, setNotifications] = useState({
    morning: true,
    burnout: true,
    weekly: true,
  });

  useEffect(() => {
    const fallbackName =
      profile?.full_name ||
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email?.split('@')[0] ||
      '';
    setNameInput(fallbackName);
  }, [profile, user]);

  /*
    Scroll to the card a fragment names, for example /settings#elena-voice
    from the Live Call page.

    The browser does this itself, but it does it before this client page has
    rendered, so the element does not exist yet and nothing moves. One frame
    later it does. AuthGuard can delay the render further, so the lookup
    repeats for a short time and then gives up.
  */
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.clearInterval(timer);
        return;
      }
      attempts += 1;
      if (attempts > 20) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, []);

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'User';
  const displayEmail = user?.email ?? '';
  const initials = displayName
    .trim()
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const onPickAvatar = () => fileRef.current?.click();

  const onAvatarPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(user.id, file);
      setProfile((prev) =>
        prev ? { ...prev, avatar_url: url } : { full_name: displayName, avatar_url: url, trial_ends_at: null, subscription_status: null, subscription_minutes_remaining: null, total_minutes_used: null, pending_payment_intent_id: null, therapist_voice: null }
      );
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onSaveName = async () => {
    if (!nameInput.trim() || !user?.id) return;
    setSavingName(true);
    try {
      await updateProfileName(user.id, nameInput);
      setProfile((prev) =>
        prev
          ? { ...prev, full_name: nameInput.trim() }
          : { full_name: nameInput.trim(), avatar_url: null, trial_ends_at: null, subscription_status: null, subscription_minutes_remaining: null, total_minutes_used: null, pending_payment_intent_id: null, therapist_voice: null }
      );
      setEditingName(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const onSignOut = async () => {
    try {
      await signOut();
      router.replace('/');
    } catch {}
  };

  const onExport = async () => {
    const choice = window.prompt('Export format? Type "json" or "csv".', 'json');
    if (!choice) return;
    try {
      const sessions = await getAllSessionsForExport();
      if (choice.toLowerCase() === 'csv') {
        const header =
          'Date,Mood Score,Energy,Stress,Positivity,Confidence,Pace,Mode,Duration (s)\n';
        const rows = sessions
          .map((s) =>
            [
              s.created_at,
              s.mood_score,
              s.energy,
              s.stress,
              s.positivity,
              s.confidence,
              s.pace,
              s.detected_mode,
              s.duration_seconds ?? '',
            ].join(',')
          )
          .join('\n');
        downloadBlob(header + rows, 'reveal-ai-sessions.csv', 'text/csv');
      } else {
        const json = JSON.stringify(
          { exported_at: new Date().toISOString(), sessions },
          null,
          2
        );
        downloadBlob(json, 'reveal-ai-sessions.json', 'application/json');
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const onDeleteAccount = async () => {
    if (
      !confirm(
        'This will permanently delete your account and all your session data. Continue?'
      )
    )
      return;
    if (!confirm('Final confirmation: all your data will be lost forever. Proceed?')) return;
    try {
      await deleteAccount();
      await signOut();
      router.replace('/');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <AppShell title="Profile & Settings" subtitle="Manage your account and preferences">
      <Grid cols={2} gap={14}>
        <Card style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <button
              onClick={onPickAvatar}
              style={{ position: 'relative', cursor: 'pointer' }}
            >
              {uploadingAvatar ? (
                <div style={avatarFallbackStyle}>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      border: `2px solid ${COLORS.cardBorder}`,
                      borderTopColor: COLORS.white,
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                </div>
              ) : profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt="avatar"
                  style={{ width: 100, height: 100, borderRadius: 50, objectFit: 'cover' }}
                />
              ) : (
                <div style={avatarFallbackStyle}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: COLORS.white }}>
                    {initials}
                  </span>
                </div>
              )}
              <span
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: COLORS.blue,
                  border: `2px solid ${COLORS.card}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="camera" size={14} color={COLORS.white} />
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onAvatarPicked}
            />
          </div>

          <Field iconName="user" label="Full Name">
            {editingName ? (
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveName();
                }}
                autoFocus
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1.5px solid ${COLORS.blue}`,
                  padding: '2px 0',
                  width: '100%',
                }}
              />
            ) : (
              <div style={fieldValueStyle}>{displayName}</div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              {editingName ? (
                <>
                  <button
                    onClick={() => {
                      setEditingName(false);
                      setNameInput(profile?.full_name || displayName);
                    }}
                    style={{
                      padding: 6,
                      borderRadius: 8,
                      background: COLORS.cardBorder,
                    }}
                  >
                    <Icon name="close" size={18} color={COLORS.textMuted} />
                  </button>
                  <button
                    onClick={onSaveName}
                    disabled={savingName}
                    style={{
                      padding: 6,
                      borderRadius: 8,
                      background: COLORS.blue,
                    }}
                  >
                    {savingName ? (
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          border: `2px solid rgba(255,255,255,0.3)`,
                          borderTopColor: COLORS.white,
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }}
                      />
                    ) : (
                      <Icon name="checkmark" size={18} color={COLORS.white} />
                    )}
                  </button>
                </>
              ) : (
                <button onClick={() => setEditingName(true)} style={{ padding: 6 }}>
                  <Icon name="pencil" size={16} color={COLORS.blue} />
                </button>
              )}
            </div>
          </Field>

          <div style={{ height: 1, background: COLORS.cardBorder, margin: '12px 0' }} />

          <Field iconName="mail" label="Email">
            <div style={fieldValueStyle}>{displayEmail}</div>
            <span style={{ padding: 6 }}>
              <Icon name="lock" size={12} color={COLORS.textMuted} />
            </span>
          </Field>
        </Card>

        <Card style={{ marginBottom: 0 }}>
          <SectionTitle>Notifications</SectionTitle>
          {[
            {
              key: 'morning' as const,
              label: 'Daily Morning Reminder',
              sub: 'Remind you to do your check-in',
            },
            {
              key: 'burnout' as const,
              label: 'Burnout Alerts',
              sub: 'Alert when energy drops significantly',
            },
            {
              key: 'weekly' as const,
              label: 'Weekly Summary',
              sub: 'Your mood trends every Sunday',
            },
          ].map((item, i) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 0',
                borderBottom: i < 2 ? `1px solid ${COLORS.cardBorder}` : 'none',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={rowLabelStyle}>{item.label}</div>
                <div style={rowSubStyle}>{item.sub}</div>
              </div>
              <Toggle
                value={notifications[item.key]}
                onChange={() =>
                  setNotifications((p) => ({ ...p, [item.key]: !p[item.key] }))
                }
              />
            </div>
          ))}
        </Card>
      </Grid>

      <Card style={{ marginTop: 14 }}>
        <SectionTitle>Subscription & Billing</SectionTitle>
        {(() => {
          const subStatus = profile?.subscription_status ?? 'trial';
          const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
          const now = new Date();
          const diffMs = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : 0;
          const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
          const minutesRemaining = profile?.subscription_minutes_remaining ?? 0;

          let planName = 'Free Trial';
          let planPrice = '$0 (Free)';
          let expiryText = `${daysLeft} days remaining`;
          let detailsText = 'Test AI-powered therapy and voice wellness insights';

          if (subStatus === 'active') {
            planName = 'Premium Plan';
            planPrice = '$12 / month';
            expiryText = `Renews in ${daysLeft} days`;
            detailsText = 'Full access to voice decoding, mood trends, and therapy';
          } else if (subStatus === 'expired') {
            planName = 'Plan Expired';
            planPrice = '$12 / month';
            expiryText = 'Subscription inactive';
            detailsText = 'Subscribe to reactivate your AI therapy access';
          }

          return (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16,
                  padding: '12px 0',
                  borderBottom: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <div>
                  <div style={rowLabelStyle}>Current Plan</div>
                  <div style={rowSubStyle}>{detailsText}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      background: 'rgba(37,99,235,0.06)',
                      color: COLORS.blue,
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {planName}
                  </span>
                  <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 4 }}>{planPrice}</div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16,
                  padding: '12px 0',
                  borderBottom: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <div>
                  <div style={rowLabelStyle}>Minutes & Expiry</div>
                  <div style={rowSubStyle}>{expiryText}</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                  {minutesRemaining} mins left
                </div>
              </div>

              {/* Action Buttons row */}
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                {subStatus !== 'active' ? (
                  <button
                    onClick={() => router.push('/payment')}
                    style={{
                      padding: '10px 18px',
                      background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                      color: '#fff',
                      border: 'none',
                      borderRadius: 10,
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'var(--font-syne)',
                    }}
                  >
                    Upgrade to Premium — $12/month
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => router.push('/payment')}
                      style={{
                        padding: '10px 18px',
                        background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                        color: '#fff',
                        border: 'none',
                        borderRadius: 10,
                        fontSize: 13.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-syne)',
                      }}
                    >
                      Top-Up Minutes — $12
                    </button>
                    <button
                      onClick={handleCancelSubscription}
                      disabled={cancellingSub}
                      style={{
                        padding: '10px 18px',
                        background: 'transparent',
                        color: COLORS.danger,
                        border: `1.5px solid ${COLORS.danger}33`,
                        borderRadius: 10,
                        fontSize: 13.5,
                        fontWeight: 700,
                        cursor: cancellingSub ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font-syne)',
                      }}
                    >
                      {cancellingSub ? 'Cancelling…' : 'Cancel Subscription'}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </Card>

      {/*
        Re-recording the voice sample.

        Not I-2 — that is the scenario picker. This is the first item on PRD
        section 8's cut list: "Re-recording your voice sample from settings.
        Enrol once, support handles resets." So it is scope that was traded away
        for the three-week date and then put back.

        Cheap to put back, because VoiceEnrollment already exists for I-1 and
        this is only a second mount point. Worth flagging anyway: work the
        client agreed to lose should reappear visibly, not silently.
      */}
      <Card style={{ marginTop: 14 }}>
        <SectionTitle>Your Voice</SectionTitle>
        <div style={{ padding: '0 2px' }}>
          <VoiceEnrollment />
        </div>
        <p
          style={{
            fontSize: 11,
            color: COLORS.textMuted,
            lineHeight: 1.6,
            marginTop: 12,
          }}
        >
          Your voice sample is stored privately and is only used to tell which
          speaker is you in a recorded conversation. It is not used to verify
          your identity or to sign you in.
        </p>
      </Card>

      {/*
        Which voice Elena speaks with on a live call.

        Sits next to "Your Voice" on purpose, and is deliberately titled so the
        two cannot be confused: that card is the user's own voice sample, used
        to tell speakers apart in a recording. This one is the therapist's
        voice. Same word, opposite meaning.
      */}
      <Card id="elena-voice" style={{ marginTop: 14 }}>
        <SectionTitle>Elena&apos;s Voice</SectionTitle>
        <TherapistVoicePicker />
        <p
          style={{
            fontSize: 11,
            color: COLORS.textMuted,
            lineHeight: 1.6,
            marginTop: 12,
          }}
        >
          Choose how Elena sounds on a live call. Only the voice changes — she is
          the same Elena whichever one you pick. A saved change applies to your
          next call, not to one already running.
        </p>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionTitle>Privacy & Data</SectionTitle>

        <Row
          icon="phone"
          label="Audio Storage"
          sub="Check-in recordings are deleted after analysis"
          border
        >
          <span
            style={{
              background: 'rgba(22,163,74,0.1)',
              color: COLORS.success,
              padding: '3px 9px',
              borderRadius: 7,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Private
          </span>
        </Row>

        <ButtonRow
          icon="time"
          label="Session History"
          sub="View and delete past sessions"
          onClick={() => router.push('/history')}
          border
        />
        <ButtonRow
          icon="download"
          label="Export My Data"
          sub="Download your sessions as JSON or CSV"
          onClick={onExport}
          border
        />
        <ButtonRow
          icon="close-circle"
          label="Delete Account"
          sub="Permanently remove all data"
          onClick={onDeleteAccount}
          danger
        />
      </Card>

      {/* Footer strip: logo + sign-out */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 14,
          padding: '18px 22px',
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 20,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Logo size={22} />
          <div style={{ fontSize: 11, color: COLORS.textMuted }}>Version 1.0.0</div>
        </div>
        <button
          onClick={onSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 12,
            border: `1px solid ${COLORS.danger}44`,
            background: 'transparent',
            color: COLORS.danger,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          <Icon name="log-out" size={16} color={COLORS.danger} />
          Sign Out
        </button>
      </div>
    </AppShell>
  );
}

function Field({
  iconName,
  label,
  children,
}: {
  iconName: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <Icon name={iconName} size={16} color={COLORS.textMuted} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>{label}</div>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: COLORS.textMuted,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  icon,
  label,
  sub,
  children,
  border,
}: {
  icon: string;
  label: string;
  sub: string;
  children?: React.ReactNode;
  border?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '14px 0',
        borderBottom: border ? `1px solid ${COLORS.cardBorder}` : 'none',
      }}
    >
      <Icon name={icon} size={18} color={COLORS.textSecondary} style={{ marginRight: 12 }} />
      <div style={{ flex: 1 }}>
        <div style={rowLabelStyle}>{label}</div>
        <div style={rowSubStyle}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

function ButtonRow({
  icon,
  label,
  sub,
  onClick,
  border,
  danger,
}: {
  icon: string;
  label: string;
  sub: string;
  onClick: () => void;
  border?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        padding: '14px 0',
        borderBottom: border ? `1px solid ${COLORS.cardBorder}` : 'none',
        textAlign: 'left',
      }}
    >
      <Icon
        name={icon}
        size={18}
        color={danger ? COLORS.danger : COLORS.textSecondary}
        style={{ marginRight: 12 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ ...rowLabelStyle, color: danger ? COLORS.danger : COLORS.textPrimary }}>
          {label}
        </div>
        <div style={rowSubStyle}>{sub}</div>
      </div>
      <Icon
        name="chevron-forward"
        size={16}
        color={danger ? COLORS.danger + '88' : COLORS.textMuted}
      />
    </button>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: value ? COLORS.green : COLORS.cardBorder,
        position: 'relative',
        transition: 'background 0.2s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: value ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: 10,
          background: COLORS.white,
          transition: 'left 0.2s',
        }}
      />
    </button>
  );
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const avatarFallbackStyle: React.CSSProperties = {
  width: 100,
  height: 100,
  borderRadius: 50,
  background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const fieldValueStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: COLORS.textPrimary,
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: 14,
  color: COLORS.textPrimary,
  fontWeight: 600,
};

const rowSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: COLORS.textMuted,
  marginTop: 1,
};

export default function SettingsPage() {
  return (
    <>
      <SettingsInner />
    </>
  );
}
