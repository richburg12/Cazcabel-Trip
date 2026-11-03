import { NextRequest, NextResponse } from 'next/server';
import { getMe, isAdmin } from '@/lib/auth';
import { ensureSchema, getProfile, setProfileDescriptor } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validDescriptor(d: unknown): d is number[] {
  return Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === 'number' && Number.isFinite(n));
}

export async function GET() {
  const me = await getMe();
  const admin = await isAdmin();
  if (!me) return NextResponse.json({ me: null, isAdmin: admin });
  await ensureSchema();
  const p = await getProfile(me.id);
  if (!p) return NextResponse.json({ me: null, isAdmin: admin });
  return NextResponse.json({ me: { id: p.id, name: p.name, hasFace: p.has_face, isAdmin: admin } });
}

// Save (or replace) the face fingerprint from the user's own selfie.
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!validDescriptor(body.descriptor)) return NextResponse.json({ error: 'Bad face data.' }, { status: 400 });
  await ensureSchema();
  await setProfileDescriptor(me.id, body.descriptor);
  return NextResponse.json({ ok: true });
}

// Forget the face fingerprint. Photos are untouched.
export async function DELETE() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  await ensureSchema();
  await setProfileDescriptor(me.id, null);
  return NextResponse.json({ ok: true });
}
