import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const durationSeconds: number = body.durationSeconds ?? 60;
    const minutesToDeduct = Math.ceil(durationSeconds / 60);

    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status, subscription_minutes_remaining, total_minutes_used')
      .eq('id', user.id)
      .maybeSingle();

    if (fetchError || !profile) {
      return NextResponse.json({ skipped: true, reason: 'Profile or columns unavailable' });
    }

    if (profile.subscription_status !== 'active') {
      return NextResponse.json({ skipped: true, reason: 'Trial user — no deduction' });
    }

    const currentMinutes = profile.subscription_minutes_remaining ?? 150;
    const currentTotal = profile.total_minutes_used ?? 0;
    const newRemaining = Math.max(0, currentMinutes - minutesToDeduct);
    const newTotal = currentTotal + minutesToDeduct;

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_minutes_remaining: newRemaining,
        total_minutes_used: newTotal,
      })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json({ skipped: true, reason: 'Update failed' });
    }

    return NextResponse.json({
      minutesDeducted: minutesToDeduct,
      minutesRemaining: newRemaining,
      totalMinutesUsed: newTotal,
      needsTopUp: newRemaining <= 0,
    });
  } catch {
    return NextResponse.json({ skipped: true, reason: 'Deduction error' });
  }
}
