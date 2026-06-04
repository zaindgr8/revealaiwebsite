'use client';
import { useCallback, useEffect, useState } from 'react';
import { COLORS, MODE_COLOR } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import {
  deleteAllTherapySessions,
  deleteTherapySession,
  getRecentTherapySessions,
  type TherapySession,
} from '@/lib/ai';
import { fmtFullDate, fmtTime } from '@/lib/format';

function HistoryInner() {
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getRecentTherapySessions(100)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this session from your history?')) return;
    setDeleting(id);
    try {
      await deleteTherapySession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!sessions.length) return;
    if (
      !confirm(
        `This will permanently delete all ${sessions.length} sessions from your history. This cannot be undone.`
      )
    )
      return;
    setLoading(true);
    try {
      await deleteAllTherapySessions();
      setSessions([]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell
      title="Session History"
      subtitle={sessions.length ? `${sessions.length} sessions` : 'Your past check-ins'}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.white }}>
            All sessions
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Tap any session to review or delete it.
          </div>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={handleDeleteAll}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: `1px solid ${COLORS.danger}55`,
              color: COLORS.danger,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Delete All
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: `3px solid ${COLORS.cardBorder}`,
              borderTopColor: COLORS.blue,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      ) : sessions.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px',
            gap: 10,
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 18,
          }}
        >
          <Icon name="inbox" size={48} color={COLORS.textMuted} />
          <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.textSecondary }}>
            No sessions yet
          </div>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textMuted,
              textAlign: 'center',
              maxWidth: 320,
            }}
          >
            Complete a check-in to see your history here.
          </div>
        </div>
      ) : (
        <Grid cols={2}>
          {sessions.map((item) => {
            const modeColor = MODE_COLOR[item.detected_mode] ?? COLORS.textMuted;
            const isDeleting = deleting === item.id;
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: COLORS.card,
                  border: `1px solid ${COLORS.cardBorder}`,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    border: `2px solid ${COLORS.green}50`,
                    background: COLORS.green + '10',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 800, color: COLORS.green }}>
                    {item.mood_score}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span
                      style={{
                        background: modeColor + '20',
                        color: modeColor,
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'capitalize',
                      }}
                    >
                      {item.detected_mode}
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                      {fmtTime(item.created_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.textSecondary,
                      marginBottom: 4,
                    }}
                  >
                    {fmtFullDate(item.created_at)}
                  </div>
                  {item.transcript && (
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.white,
                        fontStyle: 'italic',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        marginBottom: 4,
                      }}
                    >
                      &ldquo;{item.transcript}&rdquo;
                    </div>
                  )}
                  {item.insight && (
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.textMuted,
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.insight}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={isDeleting}
                  style={{ padding: 6, flexShrink: 0 }}
                  aria-label="Delete session"
                >
                  {isDeleting ? (
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        border: `2px solid ${COLORS.cardBorder}`,
                        borderTopColor: COLORS.danger,
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                  ) : (
                    <Icon name="trash" size={18} color={COLORS.danger + '99'} />
                  )}
                </button>
              </div>
            );
          })}
        </Grid>
      )}
    </AppShell>
  );
}

export default function HistoryPage() {
  return (
    <AuthGuard>
      <HistoryInner />
    </AuthGuard>
  );
}
