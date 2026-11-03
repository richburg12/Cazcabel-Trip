import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { countUntagged, ensureSchema, listUntagged, setPhotoTags } from '@/lib/db';
import { tagPhoto, taggingEnabled } from '@/lib/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Admin only. Tags a handful of photos that were uploaded before tagging was
// on (or whose tagging failed), and reports how many are left. The admin
// sheet calls this repeatedly until remaining is 0.
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  if (!taggingEnabled()) return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set' }, { status: 400 });
  await ensureSchema();
  const batch = await listUntagged(6);
  let done = 0, failed = 0;
  await Promise.all(
    batch.map(async (p) => {
      try {
        await setPhotoTags(p.id, await tagPhoto(p.thumb_url));
        done++;
      } catch (e) {
        console.error('Backfill tagging failed for', p.id, e);
        failed++;
      }
    })
  );
  return NextResponse.json({ done, failed, remaining: await countUntagged() });
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 401 });
  await ensureSchema();
  return NextResponse.json({ remaining: await countUntagged(), enabled: taggingEnabled() });
}
