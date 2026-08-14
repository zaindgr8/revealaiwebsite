import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * N-5: recordings are automatically deleted after the retention period.
 *
 * WHY THIS IS AN API ROUTE AND NOT A pg_cron SQL JOB
 *
 * The obvious implementation is a scheduled SQL job deleting rows from
 * storage.objects. That does not work, and fails in the worst possible way:
 * storage.objects is only metadata. The audio itself lives in object storage,
 * and deleting the metadata row orphans the file rather than removing it.
 *
 * The result would be a retention job that appears to work, an admin dashboard
 * showing nothing retained, and every recording still sitting in the bucket.
 * For biometric data under GDPR and the UAE PDPL, "we thought it was deleted"
 * is not a position anyone wants to defend.
 *
 * So deletion goes through the storage API, which removes both.
 *
 * SCHEDULING: see vercel.json. Requires CRON_SECRET and
 * SUPABASE_SERVICE_ROLE_KEY in the deployment environment.
 */

export const maxDuration = 60;

/** Deleted per run. Bounded so a large backlog cannot exceed maxDuration. */
const BATCH_SIZE = 100;

const RECORDING_BUCKET = 'intent-recordings';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured. Refusing to run unauthenticated.' },
      { status: 500 }
    );
  }

  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Supabase's newer key scheme names this SUPABASE_SECRET_KEY (sb_secret_...)
  // and deprecates the service_role JWT. Both are accepted so the job works
  // whichever the project is issuing.
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is not configured.' },
      { status: 500 }
    );
  }

  // Service role: this runs on behalf of no user and must reach every
  // expired recording regardless of who owns it.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    const now = new Date().toISOString();

    const { data: expired, error: selectErr } = await admin
      .from('intent_sessions')
      .select('id, storage_path')
      .lt('expires_at', now)
      .not('storage_path', 'is', null)
      .limit(BATCH_SIZE);

    if (selectErr) throw new Error(selectErr.message);

    if (!expired || expired.length === 0) {
      return NextResponse.json({ ok: true, purged: 0, remaining: false });
    }

    const paths = expired.map((r) => r.storage_path as string);
    const { error: removeErr } = await admin.storage
      .from(RECORDING_BUCKET)
      .remove(paths);

    // Stop here on failure. Clearing storage_path while the audio still exists
    // would make the file unreachable AND unfindable by the next run — the
    // recording would persist forever with nothing pointing at it.
    if (removeErr) {
      console.error('[purge-recordings] storage delete failed:', removeErr.message);
      return NextResponse.json(
        { error: `Storage delete failed, no rows modified: ${removeErr.message}` },
        { status: 500 }
      );
    }

    // The audio is gone. The session row is kept so the user's history still
    // shows the conversation happened and what the analysis said — N-5 covers
    // the recording, not the result. I-7 expects results to remain retrievable.
    const { error: updateErr } = await admin
      .from('intent_sessions')
      .update({ storage_path: null, expires_at: null })
      .in(
        'id',
        expired.map((r) => r.id)
      );

    if (updateErr) throw new Error(updateErr.message);

    console.log(`[purge-recordings] deleted ${paths.length} expired recordings`);

    return NextResponse.json({
      ok: true,
      purged: paths.length,
      // True when the batch was full, so the caller knows more remain.
      remaining: expired.length === BATCH_SIZE,
    });
  } catch (err) {
    console.error('[purge-recordings] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Purge failed' },
      { status: 500 }
    );
  }
}
