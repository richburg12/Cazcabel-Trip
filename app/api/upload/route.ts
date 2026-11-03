import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getMe } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Issues short-lived tokens so the phone uploads straight to Blob storage
// (no 4.5 MB function-body limit). Only signed-in profiles get a token, and
// only for paths under their own folder, only for JPEG/WebP, max 12 MB.
export async function POST(req: NextRequest) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`photos/${me.id}/`)) throw new Error('Wrong folder');
        return {
          allowedContentTypes: ['image/jpeg', 'image/webp'],
          maximumSizeInBytes: 12 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: me.id,
        };
      },
      onUploadCompleted: async () => {
        // The browser registers the photo itself (with the face data) via POST /api/photos.
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upload refused' }, { status: 400 });
  }
}
