import { getSupabaseAdmin } from './supabaseAdmin';
import { MONTHLY_PRICE_USD } from './pricing';

/**
 * Data aggregation for the admin panel. Everything here uses the service-role
 * client (getSupabaseAdmin), so it bypasses RLS by design — these functions
 * must only ever be called from admin-guarded server code
 * (see requireAdminSession in lib/admin-auth.ts).
 */

export type AccountStatus = 'trial_active' | 'trial_expired' | 'pro_active' | 'pro_expired' | 'no_profile';

export const STATUS_LABEL: Record<AccountStatus, string> = {
  trial_active: 'Trial',
  trial_expired: 'Trial expired',
  pro_active: 'Pro',
  pro_expired: 'Pro expired',
  no_profile: 'No profile',
};

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  status: AccountStatus;
  /** trial_ends_at on the profile — doubles as the paid-period end once a user subscribes. */
  periodEndsAt: string | null;
  minutesRemaining: number;
  totalMinutesUsed: number;
  currentStreak: number;
  longestStreak: number;
  sessionsCount: number;
};

export type AdminOverview = {
  totalUsers: number;
  trialActive: number;
  trialExpired: number;
  proActive: number;
  proExpired: number;
  noProfile: number;
  /** Active-paid-subscriber count x the $12/mo list price. An estimate from
   *  this app's own data, not a reconciled figure from Ziina's ledger. */
  estimatedMrr: number;
  totalSessions: number;
  totalMinutesUsed: number;
  avgMoodScore: number | null;
  signupsByDay: { date: string; count: number }[];
  recentUsers: AdminUserRow[];
};

const MAX_AUTH_USER_PAGES = 10; // 10 x 1000 = up to 10,000 users
const AUTH_USERS_PER_PAGE = 1000;

type ProfileRow = {
  id: string;
  full_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  subscription_minutes_remaining: number | null;
  total_minutes_used: number | null;
};

function computeStatus(profile: ProfileRow | undefined): { status: AccountStatus; periodEndsAt: string | null } {
  if (!profile) return { status: 'no_profile', periodEndsAt: null };
  const endsAtMs = profile.trial_ends_at ? new Date(profile.trial_ends_at).getTime() : null;
  const periodActive = endsAtMs !== null && Number.isFinite(endsAtMs) && endsAtMs > Date.now();
  if (profile.subscription_status === 'active') {
    return { status: periodActive ? 'pro_active' : 'pro_expired', periodEndsAt: profile.trial_ends_at };
  }
  return { status: periodActive ? 'trial_active' : 'trial_expired', periodEndsAt: profile.trial_ends_at };
}

async function listAllAuthUsers() {
  const supabase = getSupabaseAdmin();
  const all: { id: string; email: string; created_at: string; last_sign_in_at: string | null }[] = [];

  for (let page = 1; page <= MAX_AUTH_USER_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE });
    if (error) throw error;
    for (const u of data.users) {
      all.push({
        id: u.id,
        email: u.email ?? '(no email)',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < AUTH_USERS_PER_PAGE) break;
  }
  return all;
}

async function fetchAllProfiles(): Promise<ProfileRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, subscription_status, trial_ends_at, subscription_minutes_remaining, total_minutes_used');
  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

async function fetchAllStreaks() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('user_streaks').select('user_id, current_streak, longest_streak');
  if (error) throw error;
  return (data ?? []) as { user_id: string; current_streak: number | null; longest_streak: number | null }[];
}

/**
 * Per-user session counts across the three session tables. Pulls only the
 * user_id column and aggregates in memory — fine at today's scale; if the
 * user base grows large this should become a SQL view/RPC doing GROUP BY
 * server-side instead.
 */
async function fetchSessionCountsByUser(): Promise<Map<string, number>> {
  const supabase = getSupabaseAdmin();
  const [t, c, i] = await Promise.all([
    supabase.from('therapy_sessions').select('user_id'),
    supabase.from('coach_sessions').select('user_id'),
    supabase.from('intent_sessions').select('user_id'),
  ]);
  const counts = new Map<string, number>();
  for (const result of [t, c, i]) {
    for (const row of (result.data ?? []) as { user_id: string }[]) {
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
    }
  }
  return counts;
}

async function fetchAvgMoodScore(): Promise<number | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('therapy_sessions')
    .select('mood_score')
    .not('mood_score', 'is', null);
  if (error || !data || data.length === 0) return null;
  const rows = data as { mood_score: number }[];
  const sum = rows.reduce((acc, r) => acc + r.mood_score, 0);
  return Math.round(sum / rows.length);
}

export async function getAllUsers(): Promise<AdminUserRow[]> {
  const [authUsers, profiles, streaks, sessionCounts] = await Promise.all([
    listAllAuthUsers(),
    fetchAllProfiles(),
    fetchAllStreaks(),
    fetchSessionCountsByUser(),
  ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const streakById = new Map(streaks.map((s) => [s.user_id, s]));

  return authUsers
    .map((u): AdminUserRow => {
      const profile = profileById.get(u.id);
      const { status, periodEndsAt } = computeStatus(profile);
      const streak = streakById.get(u.id);
      return {
        id: u.id,
        email: u.email,
        fullName: profile?.full_name ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
        status,
        periodEndsAt,
        minutesRemaining: profile?.subscription_minutes_remaining ?? 0,
        totalMinutesUsed: profile?.total_minutes_used ?? 0,
        currentStreak: streak?.current_streak ?? 0,
        longestStreak: streak?.longest_streak ?? 0,
        sessionsCount: sessionCounts.get(u.id) ?? 0,
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const users = await getAllUsers();

  const counts: Record<AccountStatus, number> = {
    trial_active: 0,
    trial_expired: 0,
    pro_active: 0,
    pro_expired: 0,
    no_profile: 0,
  };
  let totalMinutesUsed = 0;
  for (const u of users) {
    counts[u.status]++;
    totalMinutesUsed += u.totalMinutesUsed;
  }

  const supabase = getSupabaseAdmin();
  const [tCount, cCount, iCount, avgMoodScore] = await Promise.all([
    supabase.from('therapy_sessions').select('id', { count: 'exact', head: true }),
    supabase.from('coach_sessions').select('id', { count: 'exact', head: true }),
    supabase.from('intent_sessions').select('id', { count: 'exact', head: true }),
    fetchAvgMoodScore(),
  ]);
  const totalSessions = (tCount.count ?? 0) + (cCount.count ?? 0) + (iCount.count ?? 0);

  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const signupsByDay = Array.from({ length: 14 }, (_, i) => {
    const offset = 13 - i;
    const d = new Date(todayStart.getTime() - offset * dayMs);
    const key = d.toISOString().slice(0, 10);
    const count = users.filter((u) => u.createdAt.slice(0, 10) === key).length;
    return { date: key, count };
  });

  return {
    totalUsers: users.length,
    trialActive: counts.trial_active,
    trialExpired: counts.trial_expired,
    proActive: counts.pro_active,
    proExpired: counts.pro_expired,
    noProfile: counts.no_profile,
    estimatedMrr: counts.pro_active * MONTHLY_PRICE_USD,
    totalSessions,
    totalMinutesUsed,
    avgMoodScore,
    signupsByDay,
    recentUsers: users.slice(0, 8),
  };
}
