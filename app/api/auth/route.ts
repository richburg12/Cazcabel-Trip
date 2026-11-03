import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ensureSchema, getProfileByName, createProfile } from '@/lib/db';
import { ME_COOKIE, clearCookie, setCookie, sign } from '@/lib/session';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sign in, or create a profile if the name is new. A profile is a name plus a
// PIN — the PIN is what stops someone else uploading or searching as you.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const pin = String(body.pin || '').trim();
  if (name.length < 2) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
  if (!/^\d{4,6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be 4 to 6 digits.' }, { status: 400 });

  try {
    await ensureSchema();
  } catch (e) {
    console.error('Database not ready:', e);
    return NextResponse.json(
      { error: `Database problem: ${e instanceof Error ? e.message : 'unknown'}. Check Storage in Vercel.` },
      { status: 500 }
    );
  }
  let profile = await getProfileByName(name);
  let created = false;
  if (profile) {
    if (!(await bcrypt.compare(pin, profile.pin_hash))) {
      return NextResponse.json(
        { error: `Someone has already used the name "${profile.name}" with a different PIN. Try your PIN again, or add a surname.` },
        { status: 401 }
      );
    }
  } else {
    profile = await createProfile(name, await bcrypt.hash(pin, 10));
    created = true;
  }

  const res = NextResponse.json({
    me: { id: profile.id, name: profile.name, hasFace: profile.has_face, isAdmin: await isAdmin() },
    created,
  });
  setCookie(res, ME_COOKIE, await sign({ id: profile.id, name: profile.name }), 400);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearCookie(res, ME_COOKIE);
  return res;
}
