import { NextRequest, NextResponse } from 'next/server';
import { hasValidAdminSession } from '@/lib/admin-auth';
import { grantAccess, expireAccess, setMinutesRemaining, type GrantPlan } from '@/lib/admin-actions';

const VALID_PLANS: GrantPlan[] = ['trial', 'monthly', 'yearly'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasValidAdminSession())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;

  try {
    if (action === 'grant') {
      if (!VALID_PLANS.includes(body.plan)) {
        return NextResponse.json({ error: 'plan must be trial, monthly, or yearly.' }, { status: 400 });
      }
      await grantAccess(id, body.plan as GrantPlan);
      return NextResponse.json({ ok: true });
    }

    if (action === 'expire') {
      await expireAccess(id);
      return NextResponse.json({ ok: true });
    }

    if (action === 'set_minutes') {
      const minutes = Number(body.minutes);
      if (!Number.isFinite(minutes) || minutes < 0) {
        return NextResponse.json({ error: 'minutes must be a non-negative number.' }, { status: 400 });
      }
      await setMinutesRemaining(id, minutes);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
