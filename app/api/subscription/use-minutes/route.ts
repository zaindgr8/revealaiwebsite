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

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    // durationSeconds from the session — convert to minutes (ceiling)
    const durationSeconds: number = body.durationSeconds ?? 60;
    const minutesToDeduct = Math.ceil(durationSeconds / 60);

    // Get current profile
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('subscription_status, subscription_minutes_remaining, total_minutes_used')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    // Only deduct if subscription is active (not during trial)
    if (profile?.subscription_status !== 'active') {
      return NextResponse.json({ skipped: true, reason: 'Trial user — no deduction' });
    }

    const currentMinutes = profile.subscription_minutes_remaining ?? 0;
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
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      minutesDeducted: minutesToDeduct,
      minutesRemaining: newRemaining,
      totalMinutesUsed: newTotal,
      needsTopUp: newRemaining <= 0,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
