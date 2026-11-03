import { cookies } from 'next/headers';
import { ADMIN_COOKIE, ME_COOKIE, verify, type MeSession } from '@/lib/session';

export async function getMe(): Promise<MeSession | null> {
  const me = await verify<MeSession>(cookies().get(ME_COOKIE)?.value);
  return me && typeof me.id === 'string' && typeof me.name === 'string' ? me : null;
}

export async function isAdmin(): Promise<boolean> {
  const a = await verify<{ admin: number }>(cookies().get(ADMIN_COOKIE)?.value);
  return !!a && a.admin === 1;
}
