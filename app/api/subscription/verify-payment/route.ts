import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ZIINA_API_KEY = process.env.ZIINA_API_KEY!;
const SUBSCRIPTION_MINUTES = 150;

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
    const paymentIntentId: string | undefined = body.paymentIntentId;

    if (!paymentIntentId) {
      return NextResponse.json({ error: 'Missing paymentIntentId' }, { status: 400 });
    }

    // Fetch payment intent status from Ziina
    const ziinaRes = await fetch(`https://api-v2.ziina.com/api/payment_intent/${paymentIntentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ZIINA_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!ziinaRes.ok) {
      const errText = await ziinaRes.text();
      return NextResponse.json({ error: 'Failed to fetch payment intent', details: errText }, { status: 502 });
    }

    const paymentIntent = await ziinaRes.json();
    const status: string = paymentIntent.status;

    if (status === 'completed') {
      // Activate subscription: add 150 minutes
      const { data: currentProfile } = await supabaseAdmin
        .from('profiles')
        .select('subscription_minutes_remaining')
        .eq('id', user.id)
        .single();

      const currentMinutes = currentProfile?.subscription_minutes_remaining ?? 0;
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30); // 30-day cycle

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_minutes_remaining: currentMinutes + SUBSCRIPTION_MINUTES,
          trial_ends_at: newExpiry.toISOString(),
          pending_payment_intent_id: null,
        })
        .eq('id', user.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({
        verified: true,
        status: 'active',
        minutesGranted: SUBSCRIPTION_MINUTES,
        newMinutesRemaining: currentMinutes + SUBSCRIPTION_MINUTES,
      });
    }

    // Payment not yet completed
    return NextResponse.json({
      verified: false,
      status,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
