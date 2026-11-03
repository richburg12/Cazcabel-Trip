import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getMe } from '@/lib/auth';
import { ensureSchema, findPhotosByFace } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// "My photos": every photo with a face close enough to the saved selfie.
// Euclidean distance on 128-d face-api descriptors; 0.6 is the usual "same
// person" line, we sit a little stricter so misses beat false matches.
export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  await ensureSchema();
  const { rows } = await sql<{ d: string | null }>`SELECT descriptor::text AS d FROM profiles WHERE id = ${me.id}`;
  const d = rows[0]?.d;
  if (!d) return NextResponse.json({ photos: [], enrolled: false });
  const descriptor = JSON.parse(d) as number[];
  const threshold = Number(process.env.FACE_THRESHOLD) || 0.55;
  const photos = await findPhotosByFace(descriptor, threshold);
  return NextResponse.json({ photos, enrolled: true });
}
