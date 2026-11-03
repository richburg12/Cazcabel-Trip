import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { getMe, isAdmin } from '@/lib/auth';
import { blobOpts } from '@/lib/blob';
import { deletePhoto, ensureSchema, getPhoto } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Uploader removes their own photo; the admin code removes any.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getMe();
  const admin = await isAdmin();
  if (!me && !admin) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  await ensureSchema();
  const photo = await getPhoto(params.id);
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!admin && photo.profile_id !== me?.id) return NextResponse.json({ error: 'Not your photo.' }, { status: 403 });
  await deletePhoto(photo.id);
  try {
    await del([photo.url, photo.thumb_url], blobOpts());
  } catch (e) {
    console.error('Blob delete failed (row already removed):', e);
  }
  return NextResponse.json({ ok: true });
}
