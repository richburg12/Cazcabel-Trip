import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, clearCookie, safeEqual, setCookie, sign } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '');
  const expected = process.env.ADMIN_CODE || '';
  if (expected.length < 4 || !safeEqual(code, expected)) {
    return NextResponse.json({ error: 'Wrong admin code.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  setCookie(res, ADMIN_COOKIE, await sign({ admin: 1 }), 400);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearCookie(res, ADMIN_COOKIE);
  return res;
}
