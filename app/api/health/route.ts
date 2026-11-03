import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';
import { blobCheck, blobMode } from '@/lib/blob';
import { taggingEnabled } from '@/lib/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Open /api/health (after following the secret link) to see what is and isn't
// wired up. Behind the album cookie like everything else; never shows secrets.
export async function GET() {
  const out: Record<string, unknown> = {
    build: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
    env: process.env.VERCEL_ENV || 'local',
    // Names only, never values: anything that looks like a storage credential.
    tokenVarsSeen: Object.keys(process.env).filter((k) => /BLOB|READ_WRITE|STORE/i.test(k)),
    albumToken: !!process.env.ALBUM_TOKEN,
    adminCode: !!process.env.ADMIN_CODE,
    blobMode: blobMode(),
    blob: await blobCheck(),
    postgresUrl: !!(process.env.POSTGRES_URL || process.env.DATABASE_URL),
    sceneTagging: taggingEnabled() ? 'on' : 'off (set ANTHROPIC_API_KEY)',
  };
  try {
    await ensureSchema();
    const { rows } = await sql<{ profiles: number; photos: number; faces: number }>`
      SELECT (SELECT COUNT(*) FROM profiles)::int AS profiles,
             (SELECT COUNT(*) FROM photos)::int AS photos,
             (SELECT COUNT(*) FROM faces)::int AS faces`;
    out.database = 'ok';
    out.counts = rows[0];
  } catch (e) {
    out.database = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
