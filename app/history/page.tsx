'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, MODE_COLOR } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import {
  deleteAllTherapySessions,
  deleteHistoryItem,
  getHistoryFeed,
  getMoodTrend,
  HISTORY_PAGE_SIZE,
  type HistoryItem,
  type MoodPoint,
} from '@/lib/ai';
import { MiniChart } from '@/components/MiniChart';
import { fmtFullDate, fmtTime } from '@/lib/format';

/**
 * What each row actually is, in the user's terms rather than the schema's.
 *
 * "Recorded conversation" rather than "Intent Detector": the feature name means
 * nothing to someone six weeks after they used it, and what they will remember
 * is that they recorded a conversation with a person.
 */
const KIND_LABEL: Record<HistoryItem['kind'], string> = {
  checkin: 'Voice check-in',
  chat: 'Chat',
  intent: 'Recorded conversation',
};

function HistoryInner() {
  const router = useRouter();
  const [sessions, setSessions] = useState<HistoryItem[]>([]);
  const [trend, setTrend] = useState<MoodPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // `loading` already initialises to true, so there is no setState before the
  // first await — which is what react-hooks/set-state-in-effect objects to.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // In parallel, and the chart is allowed to fail on its own. The feed is
        // the screen; a chart that cannot load should not take the list of
        // sessions down with it.
        const [items, points] = await Promise.all([
          getHistoryFeed(),
          getMoodTrend().catch((e) => {
            console.error('[history] mood trend unavailable:', (e as Error).message);
            return [] as MoodPoint[];
          }),
        ]);
        if (cancelled) return;
        setSessions(items);
        setTrend(points);
        setHasMore(items.length === HISTORY_PAGE_SIZE);
      } catch {
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    const oldest = sessions[sessions.length - 1];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await getHistoryFeed({ before: oldest.created_at });
      setSessions((prev) => [...prev, ...next]);
      setHasMore(next.length === HISTORY_PAGE_SIZE);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  // T-6. getMoodTrend already returns check-ins oldest-first with null scores
  // excluded, so there is nothing to derive here — which is the point. This
  // used to be computed from `sessions`, and therefore redrew whenever the user
  // paged the feed.

  const handleDelete = async (item: HistoryItem) => {
    if (!confirm('Remove this session from your history?')) return;
    setDeleting(item.id);
    try {
      await deleteHistoryItem(item);
      setSessions((prev) => prev.filter((s) => s.id !== item.id));
      // The chart is its own query now, so it no longer falls out of the feed
      // for free. Without this a deleted check-in stays on the line until the
      // next page load.
      if (item.kind === 'checkin') {
        setTrend((prev) => prev.filter((p) => p.id !== item.id));
      }
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
      setTrend([]);
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
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.6px' }}>
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
        <>
        {/* T-6: renders for any user with 2 or more scored check-ins. */}
        {trend.length >= 2 && (
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 18,
              padding: '18px 18px 12px',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 10,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary }}>
                Mood over time
              </div>
              {/*
                Says what is on the line, because it is not everything on this
                page. Chats carry a mood score too, but a model reading a
                transcript and acoustic analysis of a recording are different
                measurements, and an unlabelled line mixing them would let a dip
                mean either "felt worse" or "typed instead of recording".
              */}
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                {trend.length} voice check-in{trend.length === 1 ? '' : 's'}
              </div>
            </div>
            <MiniChart
              data={trend.map((s) => s.mood_score)}
              color={COLORS.blue}
              height={110}
              labels={trend.map((s) => fmtFullDate(s.created_at))}
            />
          </div>
        )}

        <Grid cols={2} gap={12}>
          {sessions.map((item) => {
            const modeColor = item.label
              ? MODE_COLOR[item.label] ?? COLORS.blue
              : COLORS.textMuted;
            const isDeleting = deleting === item.id;
            const score = item.mood_score;
            // A conversation that has not been summarised yet has no score.
            const scoreColor =
              score === null
                ? COLORS.textMuted
                : score >= 70
                  ? COLORS.blue
                  : score >= 50
                    ? COLORS.warning
                    : COLORS.danger;
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  background: COLORS.card,
                  border: `1px solid ${COLORS.cardBorder}`,
                  borderRadius: 18,
                  padding: '16px 16px',
                }}
              >
                {/* Score bubble */}
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    background: scoreColor + '12',
                    border: `1.5px solid ${scoreColor}30`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {/*
                    An Intent Detector row has no mood score — it is a reading of
                    someone else, not of the user. Showing "— mood" there would
                    imply a missing value rather than an inapplicable one.
                  */}
                  {item.kind === 'intent' ? (
                    <Icon name="users" size={20} color={scoreColor} />
                  ) : (
                    <>
                      <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor, fontFamily: 'var(--font-syne)', lineHeight: 1 }}>
                        {score ?? '—'}
                      </span>
                      <span style={{ fontSize: 8, color: scoreColor, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.04em' }}>mood</span>
                    </>
                  )}
                </div>

                {/*
                  Every row opens. I-6 requires it for Intent Detector results;
                  check-ins and chats are not required to open, but a list where
                  some rows respond to a click and others do not reads as broken
                  rather than as a deliberate distinction.
                */}
                <div
                  style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  onClick={() =>
                    router.push(
                      item.kind === 'intent'
                        ? `/intent/${item.id}`
                        : `/history/${item.kind}/${item.id}`
                    )
                  }
                >
                  {/* Top row: what kind of session, then date + mode badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                    {/*
                      Three different features land in this one feed and were
                      previously hard to tell apart: a chat row carried the chip
                      "conversation" while an Intent Detector row carried
                      "general", neither of which says what actually happened.
                      Plain description first, since it is what the reader needs
                      to orient before the date means anything.
                    */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: COLORS.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>·</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      {fmtFullDate(item.created_at)}
                    </span>
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>·</span>
                    <span style={{ fontSize: 10, color: COLORS.textMuted }}>{fmtTime(item.created_at)}</span>
                  </div>

                  {/* Mode / kind chip */}
                  <div style={{ marginBottom: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {item.label && (
                      <span
                        style={{
                          background: modeColor + '18',
                          color: modeColor,
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        }}
                      >
                        {item.label}
                      </span>
                    )}
                    {item.crisis_flagged && (
                      <span
                        style={{
                          background: COLORS.danger + '18',
                          color: COLORS.danger,
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        Support shown
                      </span>
                    )}
                  </div>

                  {item.excerpt && (
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.textSecondary,
                        fontStyle: item.kind === 'checkin' ? 'italic' : 'normal',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.kind === 'checkin'
                        ? `“${item.excerpt}”`
                        : item.excerpt}
                    </div>
                  )}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(item)}
                  disabled={isDeleting}
                  style={{ padding: 6, flexShrink: 0, marginTop: 2 }}
                  aria-label="Delete session"
                >
                  {isDeleting ? (
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        border: `2px solid ${COLORS.cardBorder}`,
                        borderTopColor: COLORS.danger,
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                  ) : (
                    <Icon name="trash" size={16} color={COLORS.danger + '88'} />
                  )}
                </button>
              </div>
            );
          })}
        </Grid>

        {hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button
              onClick={loadMore}
              disabled={loadingMore}
              style={{
                padding: '11px 22px',
                borderRadius: 12,
                border: `1px solid ${COLORS.cardBorder}`,
                background: COLORS.card,
                color: COLORS.textSecondary,
                fontSize: 13,
                fontWeight: 700,
                cursor: loadingMore ? 'wait' : 'pointer',
                opacity: loadingMore ? 0.6 : 1,
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
        </>
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
