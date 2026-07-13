import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ZIINA_API_URL = 'https://api-v2.ziina.com/api/payment_intent';
const ZIINA_API_KEY = process.env.ZIINA_API_KEY!;
// $12 USD = 1200 cents
const SUBSCRIPTION_AMOUNT = 1200;
const SUBSCRIPTION_CURRENCY = 'USD';

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    // We pass a placeholder ID first, then update after we get the real ID
    const tempExpiry = Date.now() + 30 * 60 * 1000; // 30 min window

    const ziinaRes = await fetch(ZIINA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ZIINA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: SUBSCRIPTION_AMOUNT,
        currency_code: SUBSCRIPTION_CURRENCY,
        message: 'RevealAI — 150 minutes subscription ($12)',
        success_url: `${appUrl}/payment/success?paymentIntentId={PAYMENT_INTENT_ID}`,
        cancel_url: `${appUrl}/payment?cancelled=true`,
        failure_url: `${appUrl}/payment?failed=true`,
        expiry: String(tempExpiry),
        test: true,
      }),
    });

    if (!ziinaRes.ok) {
      const errText = await ziinaRes.text();
      console.error('[ziina] create-payment error:', errText);
      return NextResponse.json({ error: 'Failed to create payment intent', details: errText }, { status: 502 });
    }

    const paymentIntent = await ziinaRes.json();

    // Store payment intent ID in user's profile so we can verify on success page
    await supabaseAdmin
      .from('profiles')
      .update({ pending_payment_intent_id: paymentIntent.id })
      .eq('id', user.id);

    return NextResponse.json({
      paymentIntentId: paymentIntent.id,
      redirectUrl: paymentIntent.redirect_url,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

