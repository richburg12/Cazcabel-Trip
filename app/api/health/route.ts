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
    const { rows } = await sql<{ profiles: number; photos: number; faces: number; untagged: number; newest: string | null; db: string; host: string | null; now: string }>`
      SELECT (SELECT COUNT(*) FROM profiles)::int AS profiles,
             (SELECT COUNT(*) FROM photos)::int AS photos,
             (SELECT COUNT(*) FROM faces)::int AS faces,
             (SELECT COUNT(*) FROM photos WHERE tagged_at IS NULL)::int AS untagged,
             (SELECT MAX(created_at) FROM photos)::text AS newest,
             current_database() AS db,
             inet_server_addr()::text AS host,
             NOW()::text AS now`;
    const r = rows[0];
    out.database = 'ok';
    out.counts = { profiles: r.profiles, photos: r.photos, faces: r.faces, untagged: r.untagged };
    out.newestPhoto = r.newest;
    out.dbName = r.db;
    out.dbServer = r.host;
    out.dbTime = r.now;
    // Which connection-string variables exist, and the host each points at (no credentials).
    out.dbVars = Object.fromEntries(
      Object.keys(process.env)
        .filter((k) => /^(POSTGRES|DATABASE)_URL/.test(k))
        .map((k) => {
          try {
            return [k, new URL(process.env[k] as string).host];
          } catch {
            return [k, 'unparseable'];
          }
        })
    );
  } catch (e) {
    out.database = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
