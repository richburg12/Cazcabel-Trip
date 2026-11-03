import { NextRequest, NextResponse } from 'next/server';
import { ALBUM_COOKIE, safeEqual, setCookie, sign } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The secret link. Matching token → remember this browser and go to the album.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const expected = process.env.ALBUM_TOKEN || '';
  if (expected.length < 8 || !safeEqual(params.token, expected)) {
    return new NextResponse(null, { status: 404 });
  }
  const res = NextResponse.redirect(new URL('/album', req.url));
  setCookie(res, ALBUM_COOKIE, await sign({ a: 1 }), 400);
  return res;
}
