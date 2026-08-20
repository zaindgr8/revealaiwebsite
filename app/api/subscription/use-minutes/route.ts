import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const auth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: userError } = await auth.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { durationSeconds?: unknown };
    const durationSeconds = Number(body.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 24 * 60 * 60) {
      return NextResponse.json({ error: 'Invalid call duration.' }, { status: 400 });
    }
    const minutesToDeduct = Math.ceil(durationSeconds / 60);

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Optimistic compare-and-swap prevents two calls ending together from
    // overwriting each other's deduction. A conflict is re-read once.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { data: profile, error: fetchError } = await db
        .from('profiles')
        .select('subscription_status, subscription_minutes_remaining, total_minutes_used')
        .eq('id', user.id)
        .maybeSingle();

      if (fetchError || !profile) {
        console.error('[subscription/use-minutes] profile unavailable:', fetchError?.message);
        return NextResponse.json({ error: 'Could not update session minutes.' }, { status: 503 });
      }

      if (profile.subscription_status !== 'active') {
        return NextResponse.json({
          minutesDeducted: 0,
          minutesRemaining: Number(profile.subscription_minutes_remaining ?? 0),
          needsTopUp: false,
          skipped: true,
        });
      }

      const currentMinutes = Math.max(0, Number(profile.subscription_minutes_remaining ?? 0));
      const currentTotal = Math.max(0, Number(profile.total_minutes_used ?? 0));
      const newRemaining = Math.max(0, currentMinutes - minutesToDeduct);
      const newTotal = currentTotal + minutesToDeduct;

      const { data: updated, error: updateError } = await db
        .from('profiles')
        .update({
          subscription_minutes_remaining: newRemaining,
          total_minutes_used: newTotal,
        })
        .eq('id', user.id)
        .eq('subscription_minutes_remaining', currentMinutes)
        .eq('total_minutes_used', currentTotal)
        .select('subscription_minutes_remaining, total_minutes_used')
        .maybeSingle();

      if (updateError) {
        console.error('[subscription/use-minutes] update failed:', updateError.message);
        return NextResponse.json({ error: 'Could not update session minutes.' }, { status: 503 });
      }
      if (!updated) continue;

      return NextResponse.json({
        minutesDeducted: minutesToDeduct,
        minutesRemaining: Number(updated.subscription_minutes_remaining),
        totalMinutesUsed: Number(updated.total_minutes_used),
        needsTopUp: Number(updated.subscription_minutes_remaining) <= 0,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json(
      { error: 'Session minutes changed concurrently. Please refresh and try again.' },
      { status: 409 }
    );
  } catch (err) {
    console.error('[subscription/use-minutes] failed:', err);
    return NextResponse.json({ error: 'Could not update session minutes.' }, { status: 503 });
  }
}
