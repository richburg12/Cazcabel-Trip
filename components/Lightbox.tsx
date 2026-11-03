'use client';

import { useEffect, useRef, useState } from 'react';
import type { Photo } from '@/lib/db';
import { btnDanger, btnGhost, btnPrimary } from './Sheet';
import { tagLabel } from '@/lib/tag-list';

const when = (p: Photo) => {
  const d = new Date(p.taken_at || p.created_at);
  return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export function Lightbox({
  photos,
  index,
  onClose,
  onIndex,
  canDelete,
  onDelete,
}: {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
  canDelete: (p: Photo) => boolean;
  onDelete: (p: Photo) => Promise<void>;
}) {
  const p = photos[index];
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Save to the phone: hand the file to the native share sheet (Save Image,
  // AirDrop, Messages…) where available, otherwise download it. If the image
  // can't be fetched cross-origin, fall back to opening it full size.
  const save = async (photo: Photo) => {
    setSaving(true);
    try {
      const res = await fetch(photo.url);
      if (!res.ok) throw new Error('fetch');
      const blob = await res.blob();
      const name = `cazcabel-trip-${photo.id.slice(0, 8)}.jpg`;
      const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file] });
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return; // user closed the share sheet
      window.open(photo.url, '_blank', 'noopener');
    } finally {
      setSaving(false);
    }
  };
  const startX = useRef<number | null>(null);

  useEffect(() => {
    setConfirm(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndex]);

  if (!p) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (startX.current == null) return;
        const dx = e.changedTouches[0].clientX - startX.current;
        startX.current = null;
        if (dx < -50 && index < photos.length - 1) onIndex(index + 1);
        if (dx > 50 && index > 0) onIndex(index - 1);
      }}
    >
      <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 text-sm text-cream/70">
        <button onClick={onClose} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-cream">Close</button>
        <span>{index + 1} / {photos.length}</span>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={p.id} src={p.url} alt="" className="max-h-full max-w-full select-none object-contain" draggable={false} />
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} aria-label="Previous" className="absolute left-0 top-0 h-full w-1/4" />
        )}
        {index < photos.length - 1 && (
          <button onClick={() => onIndex(index + 1)} aria-label="Next" className="absolute right-0 top-0 h-full w-1/4" />
        )}
      </div>
      <div className="safe-b px-4 pt-3">
        <div className="flex items-center justify-between gap-3 text-xs text-cream/60">
          <span>
            <span className="font-semibold text-cream/90">{p.uploader}</span> · {when(p)}
          </span>
          <span>
            {(p.tags || []).map((t) => (
              <span key={t} className="mr-1 rounded-full border border-honey/30 px-2 py-0.5 text-[10px] text-honey/90">{tagLabel(t)}</span>
            ))}
            {p.faces_count === 0 ? 'No faces' : p.faces_count === 1 ? '1 face' : `${p.faces_count} faces`}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => save(p)} disabled={saving} className={`${btnPrimary} flex-1 text-sm`}>
            {saving ? 'Preparing…' : 'Save'}
          </button>
          <a href={p.url} target="_blank" rel="noreferrer" className={`${btnGhost} text-sm`}>
            Full size
          </a>
          {canDelete(p) &&
            (confirm ? (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onDelete(p);
                  } finally {
                    setBusy(false);
                    setConfirm(false);
                  }
                }}
                className={`${btnDanger} flex-1 text-sm`}
              >
                {busy ? 'Deleting…' : 'Really delete?'}
              </button>
            ) : (
              <button onClick={() => setConfirm(true)} className={`${btnGhost} text-sm text-coral`}>
                Delete
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
