import { issueSignedToken } from '@vercel/blob';

// Vercel Blob credentials come in two shapes:
//  - a read-write token (BLOB_READ_WRITE_TOKEN or <PREFIX>_READ_WRITE_TOKEN)
//  - OIDC: the project only gets BLOB_STORE_ID and the function exchanges its
//    identity token at runtime (this is what new stores get).
// The SDK handles both on its own; we only need to pass `token` when the
// explicit kind exists, and tell the browser which upload flow to use.

export function readWriteToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const k = Object.keys(process.env).find((k) => k.endsWith('READ_WRITE_TOKEN') && process.env[k]);
  return k ? process.env[k] : undefined;
}

export type BlobMode = 'token' | 'oidc' | 'none';
export function blobMode(): BlobMode {
  if (readWriteToken()) return 'token';
  if (process.env.BLOB_STORE_ID) return 'oidc';
  return 'none';
}

export function blobOpts(): { token?: string } {
  const t = readWriteToken();
  return t ? { token: t } : {};
}

// Proves the credentials actually work by asking for a throwaway signed token.
export async function blobCheck(): Promise<string> {
  try {
    await issueSignedToken({ ...blobOpts(), pathname: 'healthcheck/probe', operations: ['head'], validUntil: Date.now() + 60_000 });
    return 'ok';
  } catch (e) {
    return `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }
}
