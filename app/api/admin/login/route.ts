import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminCredentials, issueAdminSessionCookie, ADMIN_SESSION_COOKIE } from '@/lib/admin-auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.json({ error: 'Incorrect username or password.' }, { status: 401 });
  }

  const { value, maxAgeSeconds } = issueAdminSessionCookie();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
  return res;
}
