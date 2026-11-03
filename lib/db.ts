import { sql } from '@vercel/postgres';

// Schema is created on first use so deploying needs no manual SQL step.
let ready: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      await sql`CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        pin_hash TEXT NOT NULL,
        descriptor vector(128),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS photos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id UUID NOT NULL REFERENCES profiles(id),
        url TEXT NOT NULL,
        thumb_url TEXT NOT NULL,
        width INT NOT NULL,
        height INT NOT NULL,
        taken_at TIMESTAMPTZ,
        faces_count INT NOT NULL DEFAULT 0,
        category TEXT NOT NULL DEFAULT 'people',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS faces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        descriptor vector(128) NOT NULL,
        box JSONB
      )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_photos_sort ON photos (COALESCE(taken_at, created_at) DESC, id DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces (photo_id)`;
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export interface Profile {
  id: string;
  name: string;
  name_key: string;
  pin_hash: string;
  has_face: boolean;
}

export interface Photo {
  id: string;
  profile_id: string;
  uploader: string;
  url: string;
  thumb_url: string;
  width: number;
  height: number;
  taken_at: string | null;
  faces_count: number;
  category: 'people' | 'group' | 'scenery';
  created_at: string;
  dist?: number;
}

export type Category = Photo['category'];

export const vec = (d: number[]) => `[${d.map((n) => (Number.isFinite(n) ? n.toFixed(6) : '0')).join(',')}]`;

export function categorise(faces: number): Category {
  if (faces === 0) return 'scenery';
  if (faces >= 5) return 'group';
  return 'people';
}

export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export async function getProfileByName(name: string): Promise<Profile | null> {
  const { rows } = await sql<Profile>`
    SELECT id, name, name_key, pin_hash, (descriptor IS NOT NULL) AS has_face FROM profiles WHERE name_key = ${nameKey(name)}`;
  return rows[0] || null;
}

export async function getProfile(id: string): Promise<Profile | null> {
  const { rows } = await sql<Profile>`
    SELECT id, name, name_key, pin_hash, (descriptor IS NOT NULL) AS has_face FROM profiles WHERE id = ${id}`;
  return rows[0] || null;
}

export async function createProfile(name: string, pinHash: string): Promise<Profile> {
  const { rows } = await sql<Profile>`
    INSERT INTO profiles (name, name_key, pin_hash) VALUES (${name.trim()}, ${nameKey(name)}, ${pinHash})
    RETURNING id, name, name_key, pin_hash, false AS has_face`;
  return rows[0];
}

export async function setProfileDescriptor(id: string, descriptor: number[] | null) {
  if (descriptor) await sql`UPDATE profiles SET descriptor = ${vec(descriptor)}::vector WHERE id = ${id}`;
  else await sql`UPDATE profiles SET descriptor = NULL WHERE id = ${id}`;
}

const PHOTO_COLS = `p.id, p.profile_id, pr.name AS uploader, p.url, p.thumb_url, p.width, p.height,
  p.taken_at, p.faces_count, p.category, p.created_at`;

export async function listPhotos(opts: { category?: Category; before?: string; limit: number }): Promise<Photo[]> {
  // Sorted newest first by when the photo was taken (upload time if unknown).
  // `before` is the sort key of the last row seen: "<iso>|<id>".
  const [bTime, bId] = (opts.before || '').split('|');
  const { rows } = await sql.query<Photo>(
    `SELECT ${PHOTO_COLS} FROM photos p JOIN profiles pr ON pr.id = p.profile_id
     WHERE ($1::text IS NULL OR p.category = $1)
       AND ($2::timestamptz IS NULL OR (COALESCE(p.taken_at, p.created_at), p.id) < ($2::timestamptz, $3::uuid))
     ORDER BY COALESCE(p.taken_at, p.created_at) DESC, p.id DESC
     LIMIT $4`,
    [opts.category || null, bTime || null, bId || null, opts.limit]
  );
  return rows;
}

export async function countsByCategory(): Promise<Record<string, number>> {
  const { rows } = await sql<{ category: string; n: number }>`SELECT category, COUNT(*)::int AS n FROM photos GROUP BY category`;
  const out: Record<string, number> = { all: 0 };
  for (const r of rows) {
    out[r.category] = r.n;
    out.all += r.n;
  }
  return out;
}

export async function findPhotosByFace(descriptor: number[], threshold: number): Promise<Photo[]> {
  const v = vec(descriptor);
  const { rows } = await sql.query<Photo>(
    `SELECT * FROM (
       SELECT DISTINCT ON (p.id) ${PHOTO_COLS}, (f.descriptor <-> $1::vector) AS dist
       FROM faces f JOIN photos p ON p.id = f.photo_id JOIN profiles pr ON pr.id = p.profile_id
       WHERE f.descriptor <-> $1::vector < $2
       ORDER BY p.id, dist
     ) m ORDER BY COALESCE(m.taken_at, m.created_at) DESC, m.id DESC LIMIT 1000`,
    [v, threshold]
  );
  return rows;
}

export async function insertPhoto(data: {
  profile_id: string;
  url: string;
  thumb_url: string;
  width: number;
  height: number;
  taken_at: string | null;
  faces: { descriptor: number[]; box: unknown }[];
}): Promise<Photo> {
  const { rows } = await sql<{ id: string }>`
    INSERT INTO photos (profile_id, url, thumb_url, width, height, taken_at, faces_count, category)
    VALUES (${data.profile_id}, ${data.url}, ${data.thumb_url}, ${data.width}, ${data.height},
            ${data.taken_at}, ${data.faces.length}, ${categorise(data.faces.length)})
    RETURNING id`;
  const id = rows[0].id;
  for (const f of data.faces) {
    await sql`INSERT INTO faces (photo_id, descriptor, box) VALUES (${id}, ${vec(f.descriptor)}::vector, ${JSON.stringify(f.box)}::jsonb)`;
  }
  const { rows: out } = await sql.query<Photo>(
    `SELECT ${PHOTO_COLS} FROM photos p JOIN profiles pr ON pr.id = p.profile_id WHERE p.id = $1`,
    [id]
  );
  return out[0];
}

export async function getPhoto(id: string): Promise<Photo | null> {
  const { rows } = await sql.query<Photo>(
    `SELECT ${PHOTO_COLS} FROM photos p JOIN profiles pr ON pr.id = p.profile_id WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function deletePhoto(id: string) {
  await sql`DELETE FROM photos WHERE id = ${id}`; // faces cascade
}
