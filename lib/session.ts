// Signed cookies, Web Crypto only so the same code runs in middleware (edge)
// and in route handlers (node). Three cookies:
//   cz_album — the browser arrived via the secret link
//   cz_me    — a profile (name + PIN) is signed in
//   cz_admin — the admin code was entered
import type { NextResponse } from 'next/server';

export const ALBUM_COOKIE = 'cz_album';
export const ME_COOKIE = 'cz_me';
export const ADMIN_COOKIE = 'cz_admin';

export interface MeSession {
  id: string;
  name: string;
}

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET || `${process.env.ALBUM_TOKEN || ''}|${process.env.ADMIN_CODE || ''}|cazcabel`;
  if (s.length < 12) throw new Error('Set ALBUM_TOKEN and ADMIN_CODE (or SESSION_SECRET)');
  return s;
}

const b64u = (bytes: ArrayBuffer | Uint8Array) => {
  const u = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function key() {
  return crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sign(payload: object): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(body));
  return `${body}.${b64u(sig)}`;
}

export async function verify<T>(token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), unb64u(token.slice(dot + 1)), enc.encode(body));
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(unb64u(body))) as T;
  } catch {
    return null;
  }
}

export function setCookie(res: NextResponse, name: string, value: string, days = 365) {
  res.cookies.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: days * 24 * 60 * 60,
  });
}

export function clearCookie(res: NextResponse, name: string) {
  res.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

// Constant-time string compare for the secret link and admin code.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
