import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  try {
    // Read existing streak row
    const { data: existing } = await supabaseAuth
      .from('user_streaks')
      .select('current_streak, longest_streak, last_checkin_date')
      .eq('user_id', user.id)
      .single();

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    let current_streak = 1;
    let longest_streak = existing?.longest_streak ?? 1;

    if (existing?.last_checkin_date) {
      const last = new Date(existing.last_checkin_date);
      const today = new Date(todayStr);
      const diffDays = Math.round(
        (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 0) {
        // Already checked in today — no change
        return NextResponse.json({
          current_streak: existing.current_streak,
          longest_streak: existing.longest_streak,
          last_checkin_date: existing.last_checkin_date,
        });
      } else if (diffDays === 1) {
        // Consecutive day — increment
        current_streak = (existing.current_streak ?? 0) + 1;
      } else {
        // Streak broken — reset to 1
        current_streak = 1;
      }
    }

    longest_streak = Math.max(longest_streak, current_streak);

    const { error: upsertError } = await supabaseAuth
      .from('user_streaks')
      .upsert({
        user_id: user.id,
        current_streak,
        longest_streak,
        last_checkin_date: todayStr,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.error('[update-streak] upsert error:', upsertError.message);
      // Non-fatal — return best-effort data
    }

    return NextResponse.json({ current_streak, longest_streak, last_checkin_date: todayStr });
  } catch (err) {
    console.error('[update-streak] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Streak update failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data, error } = await supabaseAuth
    .from('user_streaks')
    .select('current_streak, longest_streak, last_checkin_date')
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ current_streak: 0, longest_streak: 0, last_checkin_date: null });
  }

  return NextResponse.json(data);
}
