'use client';

// Everything the phone does to a photo before upload: read the taken-at time,
// decode (honouring EXIF rotation), and render a 1800px display JPEG plus a
// 480px thumbnail. HEIC from iPhones is already converted to JPEG by Safari's
// file picker, so canvas can always decode what we get.

export interface Rendered {
  blob: Blob;
  width: number;
  height: number;
}

export async function readTakenAt(file: File): Promise<string | null> {
  try {
    const exifr = (await import('exifr')).default;
    const out = await exifr.parse(file, { pick: ['DateTimeOriginal', 'CreateDate'] });
    const d: unknown = out?.DateTimeOriginal || out?.CreateDate;
    if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  } catch {
    /* no EXIF */
  }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null;
}

export async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* fall through */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

export type Decoded = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

export function drawScaled(src: Decoded, maxSide: number): HTMLCanvasElement {
  const sw = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const sh = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Rendered> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error('Encode failed'))),
      'image/jpeg',
      quality
    );
  });
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'photo';
