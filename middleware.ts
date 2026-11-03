import { NextRequest, NextResponse } from 'next/server';
import { ALBUM_COOKIE, verify } from '@/lib/session';

// Everything useful lives behind the secret link. A browser that has not
// followed it (and so has no album cookie) sees the blank root page, and the
// API answers 401. The link itself is /<ALBUM_TOKEN>, handled in app/[token].
export async function middleware(req: NextRequest) {
  // Blob storage calls /api/upload back when an upload finishes. It carries no
  // cookie but a signature that handleUpload verifies itself.
  if (req.nextUrl.pathname === '/api/upload' && req.headers.get('x-vercel-signature')) return NextResponse.next();
  const ok = await verify<{ a: number }>(req.cookies.get(ALBUM_COOKIE)?.value);
  if (ok && ok.a === 1) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  return NextResponse.rewrite(new URL('/', req.url));
}

export const config = { matcher: ['/album/:path*', '/api/:path*'] };
