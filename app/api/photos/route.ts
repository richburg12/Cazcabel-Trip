import { NextRequest, NextResponse } from 'next/server';
import { getMe, isAdmin } from '@/lib/auth';
import { ensureSchema, listPhotos, insertPhoto, countsByCategory, type Category } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATS: Category[] = ['people', 'group', 'scenery'];
const PAGE = 90;

export async function GET(req: NextRequest) {
  await ensureSchema();
  const url = new URL(req.url);
  const cat = url.searchParams.get('category') as Category | null;
  const before = url.searchParams.get('before') || undefined;
  const [photos, counts] = await Promise.all([
    listPhotos({ category: cat && CATS.includes(cat) ? cat : undefined, before, limit: PAGE }),
    before ? Promise.resolve(null) : countsByCategory(),
  ]);
  const last = photos[photos.length - 1];
  const next = photos.length === PAGE && last ? `${new Date(last.taken_at || last.created_at).toISOString()}|${last.id}` : null;
  return NextResponse.json({ photos, next, counts });
}

// Register an uploaded photo plus the faces found in it (computed on the phone).
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  const okUrl = (u: unknown) => {
    if (typeof u !== 'string') return false;
    try {
      const p = new URL(u);
      return p.protocol === 'https:' && p.hostname.endsWith('.blob.vercel-storage.com') && p.pathname.startsWith(`/photos/${me.id}/`);
    } catch {
      return false;
    }
  };
  if (!okUrl(b.url) || !okUrl(b.thumbUrl)) return NextResponse.json({ error: 'Bad photo URL' }, { status: 400 });
  const width = Number(b.width), height = Number(b.height);
  if (!(width > 0 && height > 0 && width < 20000 && height < 20000)) return NextResponse.json({ error: 'Bad size' }, { status: 400 });
  const takenAt = b.takenAt && !isNaN(new Date(b.takenAt).getTime()) ? new Date(b.takenAt).toISOString() : null;
  const faces = Array.isArray(b.faces) ? b.faces.slice(0, 100) : [];
  for (const f of faces) {
    if (!Array.isArray(f.descriptor) || f.descriptor.length !== 128 || !f.descriptor.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) {
      return NextResponse.json({ error: 'Bad face data' }, { status: 400 });
    }
  }

  await ensureSchema();
  const photo = await insertPhoto({
    profile_id: me.id,
    url: b.url,
    thumb_url: b.thumbUrl,
    width,
    height,
    taken_at: takenAt,
    faces: faces.map((f: { descriptor: number[]; box?: unknown }) => ({ descriptor: f.descriptor, box: f.box ?? null })),
  });
  return NextResponse.json({ photo, isAdmin: await isAdmin() });
}
