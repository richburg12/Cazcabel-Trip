import { NextRequest, NextResponse } from 'next/server';
import { issueSignedToken } from '@vercel/blob';
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { getMe } from '@/lib/auth';
import { blobOpts } from '@/lib/blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSTRAINTS = { allowedContentTypes: ['image/jpeg', 'image/webp'], maximumSizeInBytes: 12 * 1024 * 1024 };

// The phone uploads straight to Blob storage (no 4.5 MB function-body limit).
// This route only hands out short-lived permission to do so: signed-in
// profiles only, only into their own folder, JPEG/WebP, max 12 MB.
// Two wire formats depending on how the store is connected:
//   blob.generate-presigned-url  — new stores (OIDC), browser uses uploadPresigned()
//   blob.generate-client-token   — read-write-token stores, browser uses upload()
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = (await req.json()) as { type?: string };
  const folder = `photos/${me.id}/`;
  const guard = (pathname: string) => {
    if (!pathname.startsWith(folder)) throw new Error('Wrong folder');
  };

  try {
    if (body.type === 'blob.generate-presigned-url') {
      const json = await handleUploadPresigned({
        body: body as HandleUploadPresignedBody,
        request: req,
        getSignedToken: async (pathname) => {
          guard(pathname);
          const token = await issueSignedToken({
            ...blobOpts(),
            pathname,
            operations: ['put'],
            validUntil: Date.now() + 15 * 60_000,
            ...CONSTRAINTS,
          });
          return { token, urlOptions: { addRandomSuffix: true, ...CONSTRAINTS } };
        },
      });
      return NextResponse.json(json);
    }
    if (body.type === 'blob.generate-client-token') {
      const json = await handleUpload({
        ...blobOpts(),
        body: body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          guard(pathname);
          return { ...CONSTRAINTS, addRandomSuffix: true, tokenPayload: me.id };
        },
      });
      return NextResponse.json(json);
    }
    return NextResponse.json({ error: 'Unsupported upload event' }, { status: 400 });
  } catch (e) {
    console.error('Upload permission failed:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload refused' }, { status: 400 });
  }
}
