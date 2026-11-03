import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Open /api/health (after following the secret link) to see what is and isn't
// wired up. Behind the album cookie like everything else; never shows secrets.
export async function GET() {
  const out: Record<string, unknown> = {
    albumToken: !!process.env.ALBUM_TOKEN,
    adminCode: !!process.env.ADMIN_CODE,
    blobToken: !!process.env.BLOB_READ_WRITE_TOKEN,
    postgresUrl: !!(process.env.POSTGRES_URL || process.env.DATABASE_URL),
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
