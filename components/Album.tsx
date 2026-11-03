'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { upload, uploadPresigned } from '@vercel/blob/client';
import type { Photo } from '@/lib/db';
import { detectFaces, loadFaceApi } from '@/lib/client/face';
import { decode, drawScaled, readTakenAt, slug, toJpeg } from '@/lib/client/image';
import { Lightbox } from './Lightbox';
import { Sheet, btnDanger, btnGhost, btnPrimary, field } from './Sheet';
import { TAGS, tagLabel } from '@/lib/tag-list';

interface Me {
  id: string;
  name: string;
  hasFace: boolean;
  isAdmin: boolean;
}

type Tab = 'all' | 'people' | 'group' | 'scenery' | 'me' | `tag:${string}`;
// Fixed tabs; scene-tag tabs (Distillery, Food & drink, ...) are appended when
// photos carry them. Distillery is the headline, so it goes right after Find me.
const FIXED: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'me', label: 'Find me' },
  { id: 'tag:distillery', label: 'Distillery' },
  { id: 'people', label: 'People' },
  { id: 'group', label: 'Groups' },
  { id: 'scenery', label: 'Scenery' },
];
function buildTabs(counts: Record<string, number>): { id: Tab; label: string }[] {
  const extra = TAGS.filter((t) => t.id !== 'distillery' && counts[`tag:${t.id}`] > 0).map((t) => ({
    id: `tag:${t.id}` as Tab,
    label: t.label,
  }));
  return [...FIXED.filter((t) => t.id !== 'tag:distillery' || counts['tag:distillery'] > 0), ...extra];
}

interface Progress {
  done: number;
  total: number;
  stage: string;
  failed: number;
  lastError?: string;
}

// One entry per selected file, shown as a strip of thumbnails while uploading.
interface QueueItem {
  key: string;
  preview: string; // object URL
  status: 'pending' | 'working' | 'done' | 'failed';
}

const initials = (n: string) =>
  n
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Album({ tripName }: { tripName: string }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('all');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'profile' | null>(null);
  const [afterSignIn, setAfterSignIn] = useState<'upload' | 'selfie' | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  // True from tapping "Add photos" until the browser hands us the files. On
  // iPhone that gap can be long (iCloud downloads, HEIC conversion) and looks
  // like nothing is happening, so we say so.
  const [picking, setPicking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'presigned' | 'token'>('presigned');
  const [logoOk, setLogoOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const say = useCallback((msg: string, ms = 3500) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), ms);
  }, []);

  // ---- data -------------------------------------------------------------
  useEffect(() => {
    // Show /logo.png only once we know it exists (an <img onError> fired before
    // hydration is missed by React, leaving a broken-image icon).
    const probe = new Image();
    probe.onload = () => setLogoOk(true);
    probe.src = '/logo.png';
  }, []);
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        setMe(d.me ? { ...d.me, isAdmin: d.isAdmin ?? d.me.isAdmin } : null);
        if (d.uploadMode === 'token') setUploadMode('token');
      })
      .catch(() => setMe(null));
  }, []);

  const load = useCallback(
    async (t: Tab, before?: string) => {
      setLoading(true);
      try {
        if (t === 'me') {
          const r = await fetch('/api/find');
          if (r.status === 401) {
            setPhotos([]);
            return;
          }
          const d = await r.json();
          setPhotos(d.photos || []);
          setNext(null);
        } else {
          const q = new URLSearchParams();
          if (t.startsWith('tag:')) q.set('tag', t.slice(4));
          else if (t !== 'all') q.set('category', t);
          if (before) q.set('before', before);
          const d = await (await fetch(`/api/photos?${q}`)).json();
          setPhotos((prev) => (before ? [...prev, ...d.photos] : d.photos));
          setNext(d.next);
          if (d.counts) setCounts(d.counts);
        }
      } catch {
        say('Could not load photos. Check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [say]
  );

  useEffect(() => {
    if (me === undefined) return;
    load(tab);
  }, [tab, me, load]);

  // The picker's "cancel" event isn't in React's typings; listen natively.
  useEffect(() => {
    const el = fileRef.current;
    if (!el) return;
    const onCancel = () => setPicking(false);
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  // ---- uploading -----------------------------------------------------------
  const startUpload = () => {
    if (!me) {
      setAfterSignIn('upload');
      setSheet('profile');
      return;
    }
    loadFaceApi().catch(() => {});
    fileRef.current?.click();
    setPicking(true);
  };

  const processFiles = async (files: File[]) => {
    setPicking(false);
    if (!me || files.length === 0) return;
    const prog: Progress = { done: 0, total: files.length, stage: 'Getting ready…', failed: 0 };
    setProgress({ ...prog });
    const items: QueueItem[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, preview: URL.createObjectURL(f), status: 'pending' }));
    setQueue(items);
    const mark = (i: number, status: QueueItem['status']) =>
      setQueue((q) => q.map((it, j) => (j === i ? { ...it, status } : it)));
    try {
      await loadFaceApi((s) => setProgress({ ...prog, stage: s }));
    } catch {
      say('Face models failed to load; photos will upload without face search.', 6000);
    }
    const added: Photo[] = [];
    const showsHere = (p: Photo) =>
      tab === 'all' || p.category === tab || (tab.startsWith('tag:') && (p.tags || []).includes(tab.slice(4)));
    for (const [idx, file] of files.entries()) {
      const label = `Photo ${prog.done + 1} of ${prog.total}`;
      mark(idx, 'working');
      try {
        setProgress({ ...prog, stage: `${label} · preparing` });
        const takenAt = await readTakenAt(file);
        const src = await decode(file);
        const big = drawScaled(src, 1800);
        const small = drawScaled(big, 480);
        if ('close' in src) src.close();
        const [bigJpeg, smallJpeg] = await Promise.all([toJpeg(big, 0.86), toJpeg(small, 0.78)]);
        const base = `photos/${me.id}/${slug(file.name)}`;

        setProgress({ ...prog, stage: `${label} · uploading & finding faces` });
        const facesP = detectFaces(big).catch(() => []);
        let b, s;
        try {
          const put = uploadMode === 'token' ? upload : uploadPresigned;
          [b, s] = await Promise.all([
            put(`${base}.jpg`, bigJpeg.blob, { access: 'public', handleUploadUrl: '/api/upload', contentType: 'image/jpeg' }),
            put(`${base}-thumb.jpg`, smallJpeg.blob, { access: 'public', handleUploadUrl: '/api/upload', contentType: 'image/jpeg' }),
          ]);
        } catch (e) {
          throw new Error(`Upload to storage failed: ${e instanceof Error ? e.message : String(e)}`);
        }
        const faces = await facesP;

        const r = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: b.url,
            thumbUrl: s.url,
            width: bigJpeg.width,
            height: bigJpeg.height,
            takenAt,
            faces: faces.map((f) => ({ descriptor: f.descriptor, box: f.box })),
          }),
        });
        const saved = await r.text();
        let parsed: { error?: string; photo?: Photo } = {};
        try {
          parsed = JSON.parse(saved);
        } catch {
          /* non-JSON */
        }
        if (!r.ok || !parsed.photo) throw new Error(`Saving failed (${r.status}): ${parsed.error || saved.slice(0, 120)}`);
        const { photo } = parsed as { photo: Photo };
        added.push(photo);
        mark(idx, 'done');
        // Straight into the grid so each finished photo is visible immediately.
        if (showsHere(photo)) setPhotos((prev) => [photo, ...prev]);
        setCounts((c) => ({ ...c, all: (c.all || 0) + 1, [photo.category]: (c[photo.category] || 0) + 1 }));
        big.width = 0;
        small.width = 0;
      } catch (e) {
        console.error('Upload failed', file.name, e);
        mark(idx, 'failed');
        prog.failed++;
        prog.lastError = e instanceof Error ? e.message : String(e);
      }
      prog.done++;
      setProgress({ ...prog });
    }
    // Leave the finished strip up for a moment so the ticks register.
    await new Promise((r) => setTimeout(r, prog.failed ? 1500 : 900));
    setProgress(null);
    setQueue((q) => {
      q.forEach((it) => URL.revokeObjectURL(it.preview));
      return [];
    });
    if (prog.failed) setLastError(prog.lastError || 'Unknown error');
    if (added.length) load(tab);
    say(prog.failed ? `${added.length} added · ${prog.failed} failed` : `${added.length} photo${added.length === 1 ? '' : 's'} added 🎉`);
  };

  // ---- find me (selfie) --------------------------------------------------------
  const startSelfie = () => {
    if (!me) {
      setAfterSignIn('selfie');
      setSheet('profile');
      return;
    }
    loadFaceApi().catch(() => {});
    selfieRef.current?.click();
  };

  const processSelfie = async (file: File) => {
    setProgress({ done: 0, total: 1, stage: 'Looking for your face…', failed: 0 });
    try {
      await loadFaceApi((s) => setProgress({ done: 0, total: 1, stage: s, failed: 0 }));
      const src = await decode(file);
      const canvas = drawScaled(src, 1000);
      if ('close' in src) src.close();
      const faces = await detectFaces(canvas, 0.6);
      if (faces.length === 0) throw new Error('No face found. Try facing the camera in better light.');
      if (faces.length > 1) throw new Error('More than one face found. Make sure it is just you in the frame.');
      const r = await fetch('/api/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor: faces[0].descriptor }),
      });
      if (!r.ok) throw new Error('Could not save. Try again.');
      setMe((m) => (m ? { ...m, hasFace: true } : m));
      setSheet(null);
      setTab('me');
      say('Selfie saved. Finding you…');
    } catch (e) {
      say(e instanceof Error ? e.message : 'Something went wrong', 6000);
    } finally {
      setProgress(null);
    }
  };

  const forgetFace = async () => {
    await fetch('/api/me', { method: 'DELETE' });
    setMe((m) => (m ? { ...m, hasFace: false } : m));
    if (tab === 'me') setPhotos([]);
    say('Your face data has been removed.');
  };

  // ---- delete -----------------------------------------------------------------
  const canDelete = (p: Photo) => !!me && (me.isAdmin || p.profile_id === me.id);
  const onDelete = async (p: Photo) => {
    const r = await fetch(`/api/photos/${p.id}`, { method: 'DELETE' });
    if (!r.ok) {
      say('Could not delete that photo.');
      return;
    }
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    setOpen((i) => (i == null ? null : photos.length - 1 <= 0 ? null : Math.min(i, photos.length - 2)));
    setCounts((c) => ({ ...c, all: Math.max(0, (c.all || 1) - 1), [p.category]: Math.max(0, (c[p.category] || 1) - 1) }));
  };

  // ---- render ---------------------------------------------------------------------
  const empty = !loading && photos.length === 0;

  return (
    <main className="mx-auto min-h-dvh max-w-3xl pb-32">
      {/* Header */}
      <header className="px-5 pt-[max(env(safe-area-inset-top),1.25rem)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            {logoOk ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="Cazcabel" className="h-24 w-auto" />
                <h1 className="mt-3 font-display text-3xl leading-none tracking-[0.08em] text-cream">
                  {tripName.replace(/cazcabel\s*/i, '')}
                </h1>
              </>
            ) : (
              <>
                <div className="font-display text-4xl leading-none tracking-[0.12em] text-honey">CAZCABEL</div>
                <h1 className="mt-2 font-display text-5xl leading-[0.9] tracking-wide text-cream">{tripName}</h1>
              </>
            )}
            <p className="mt-1 text-xs uppercase tracking-[0.3em] text-sand/60">
              {counts.all ? `${counts.all} photo${counts.all === 1 ? '' : 's'} and counting` : 'The shared album'}
            </p>
          </div>
          {me ? (
            <button
              onClick={() => setSheet('profile')}
              aria-label="Your profile"
              className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-honey/50 bg-honey/15 font-semibold text-honey"
            >
              {initials(me.name)}
            </button>
          ) : (
            <button
              onClick={() => setSheet('profile')}
              className="mt-1 shrink-0 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-cream/85"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="no-scrollbar sticky top-0 z-20 mt-5 flex gap-2 overflow-x-auto bg-ink/85 px-5 py-3 backdrop-blur">
        {buildTabs(counts).map((t) => {
          const active = tab === t.id;
          const n = t.id === 'all' ? counts.all : t.id === 'me' ? undefined : counts[t.id];
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active ? 'border-honey bg-honey text-ink' : 'border-white/12 bg-white/5 text-cream/70'
              }`}
            >
              {t.id === 'me' && <span className="mr-1">✦</span>}
              {t.label}
              {n ? <span className={`ml-1.5 ${active ? 'text-ink/60' : 'text-cream/35'}`}>{n}</span> : null}
            </button>
          );
        })}
      </nav>

      {/* Find-me states */}
      {tab === 'me' && me !== undefined && (!me || !me.hasFace) && (
        <section className="mx-5 mt-4 rounded-2xl border border-honey/25 bg-honey/[0.07] p-5">
          <h2 className="font-display text-3xl tracking-wide text-honey">Find every photo of you</h2>
          <p className="mt-2 text-sm leading-relaxed text-cream/75">
            Take one selfie and the album picks out the photos you&rsquo;re in, including ones added later. Your selfie is turned
            into a set of numbers on your phone and only those numbers are saved. You can remove them any time, and nobody can
            search for anyone but themselves.
          </p>
          <button onClick={startSelfie} className={`${btnPrimary} mt-4 w-full`}>
            {me ? 'Take a selfie' : 'Sign in, then take a selfie'}
          </button>
        </section>
      )}

      {/* Grid */}
      {empty && (tab !== 'me' || me?.hasFace) ? (
        <div className="px-5 py-20 text-center text-cream/40">
          {tab === 'me' ? (
            <>
              <p className="font-display text-3xl tracking-wide text-cream/60">No matches yet</p>
              <p className="mt-2 text-sm">As people add photos, the ones with you in them will show up here.</p>
            </>
          ) : (
            <>
              <p className="font-display text-3xl tracking-wide text-cream/60">Nothing here yet</p>
              <p className="mt-2 text-sm">{tab.startsWith('tag:') ? 'No photos have been tagged with this yet.' : 'Be the first — tap Add photos.'}</p>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-0.5 px-0.5 sm:grid-cols-4">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setOpen(i)} className="relative aspect-square overflow-hidden bg-ash">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              {p.faces_count >= 5 && (
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-cream/80">{p.faces_count}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {loading && <p className="py-8 text-center text-sm text-cream/40">Loading…</p>}
      {!loading && next && (
        <div className="px-5 py-6 text-center">
          <button onClick={() => load(tab, next)} className={`${btnGhost} text-sm`}>
            Load more
          </button>
        </div>
      )}

      {/* Add photos */}
      <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(env(safe-area-inset-bottom),1rem)] ${progress || picking ? 'invisible' : ''}`}>
        <button
          onClick={startUpload}
          disabled={!!progress}
          className="pointer-events-auto rounded-full bg-honey px-7 py-4 font-display text-2xl tracking-wider text-ink shadow-glow transition active:scale-95 disabled:opacity-70"
        >
          {progress ? 'WORKING…' : '+ ADD PHOTOS'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          processFiles(files);
        }}
      />
      <input
        ref={selfieRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) processSelfie(f);
        }}
      />

      {lastError && (
        <div className="fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-2xl border border-coral/40 bg-smoke/95 p-4 text-sm shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-coral">Upload problem</p>
              <p className="mt-1 select-all break-words text-cream/80">{lastError}</p>
            </div>
            <button onClick={() => setLastError(null)} className="shrink-0 text-cream/50">Close</button>
          </div>
        </div>
      )}

      {/* Waiting for the phone to hand over the files */}
      {picking && !progress && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
          <div className="sheet safe-b w-full max-w-lg rounded-t-3xl border border-white/10 bg-smoke px-5 pt-5 shadow-2xl">
            <div className="flex items-center gap-4">
              <Spinner />
              <div className="min-w-0">
                <p className="font-display text-2xl tracking-wide text-honey">Getting your photos ready</p>
                <p className="mt-1 text-sm leading-snug text-cream/65">
                  Your phone prepares each picture before handing it over. With iCloud photos or slow internet this can
                  take a little while. Keep this page open.
                </p>
              </div>
            </div>
            <button onClick={() => setPicking(false)} className="mt-4 w-full py-2 text-center text-xs text-cream/40">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {progress && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center">
          <div className="sheet safe-b w-full max-w-lg rounded-t-3xl border border-white/10 bg-smoke px-5 pt-5 shadow-2xl">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-3xl tracking-wide text-honey">
                {progress.done >= progress.total
                  ? progress.failed
                    ? 'Finished, with problems'
                    : 'All done'
                  : progress.total === 1
                    ? 'Adding your photo'
                    : `Adding ${progress.done + 1} of ${progress.total}`}
              </p>
              <span className="text-sm text-cream/50">{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-honey transition-all duration-500"
                style={{ width: `${Math.max(3, (progress.done / progress.total) * 100)}%` }}
              />
            </div>
            {queue.length > 0 && (
              <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto">
                {queue.map((it) => (
                  <div key={it.key} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-ash">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.preview}
                      alt=""
                      className={`h-full w-full object-cover transition ${it.status === 'pending' ? 'opacity-35' : 'opacity-100'}`}
                    />
                    {it.status === 'working' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Spinner small />
                      </div>
                    )}
                    {it.status === 'done' && (
                      <div className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-honey text-xs font-bold text-ink">
                        ✓
                      </div>
                    )}
                    {it.status === 'failed' && (
                      <div className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-xs font-bold text-ink">
                        !
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-sm text-cream/60">
              {progress.done >= progress.total ? 'Your photos are in the album.' : progress.stage.replace(/^Photo \d+ of \d+ · /, '').replace(/^\w/, (c) => c.toUpperCase())}
            </p>
            <p className="mt-1 text-xs text-cream/35">
              Each photo is resized and checked for faces on your phone, then uploaded. Keep this page open until it&rsquo;s done.
            </p>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-xl border border-white/10 bg-smoke/95 px-4 py-3 text-center text-sm text-cream shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}

      {open != null && photos[open] && (
        <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} onIndex={setOpen} canDelete={canDelete} onDelete={onDelete} />
      )}

      <ProfileSheet
        open={sheet === 'profile'}
        onClose={() => {
          setSheet(null);
          setAfterSignIn(null);
        }}
        me={me ?? null}
        onSignedIn={(m) => {
          setMe(m);
          setSheet(null);
          const next = afterSignIn;
          setAfterSignIn(null);
          // Give the sheet a beat to close before opening the native picker.
          if (next === 'upload') setTimeout(() => fileRef.current?.click(), 250);
          if (next === 'selfie') setTimeout(() => selfieRef.current?.click(), 250);
        }}
        onSignOut={async () => {
          await fetch('/api/auth', { method: 'DELETE' });
          setMe((m) => (m ? { ...m, id: '', name: '', hasFace: false } : m));
          setMe(null);
          setSheet(null);
          if (tab === 'me') setTab('all');
        }}
        onSelfie={() => {
          setSheet(null);
          setTimeout(startSelfie, 250);
        }}
        onForgetFace={forgetFace}
        onAdmin={(on) => setMe((m) => (m ? { ...m, isAdmin: on } : m))}
      />
    </main>
  );
}

// ---- Profile sheet: sign in / create, selfie, admin --------------------------
function ProfileSheet({
  open,
  onClose,
  me,
  onSignedIn,
  onSignOut,
  onSelfie,
  onForgetFace,
  onAdmin,
}: {
  open: boolean;
  onClose: () => void;
  me: Me | null;
  onSignedIn: (m: Me) => void;
  onSignOut: () => void;
  onSelfie: () => void;
  onForgetFace: () => void;
  onAdmin: (on: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin }),
      });
      const text = await r.text();
      let d: { error?: string; me?: Me } = {};
      try {
        d = JSON.parse(text);
      } catch {
        /* non-JSON error page */
      }
      if (!r.ok || !d.me) throw new Error(d.error || `Server error ${r.status}. Open /api/health to see what's missing.`);
      setPin('');
      onSignedIn(d.me);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const adminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    const r = await fetch('/api/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (!r.ok) {
      setErr('Wrong admin code.');
      return;
    }
    setCode('');
    setShowAdmin(false);
    onAdmin(true);
  };

  if (!me) {
    return (
      <Sheet open={open} onClose={onClose} title="Who are you?">
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-cream/65">
            Your name goes on the photos you add. The PIN is yours alone — it lets you delete your own uploads and use Find me.
            Coming back later? Same name, same PIN.
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Your name" autoComplete="name" autoFocus required />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={`${field} ${pin ? 'tracking-[0.3em]' : ''}`}
            placeholder="PIN (4–6 digits)"
            inputMode="numeric"
            autoComplete="off"
            required
          />
          {err && <p className="text-sm text-coral">{err}</p>}
          <button type="submit" disabled={busy || name.trim().length < 2 || pin.length < 4} className={`${btnPrimary} w-full`}>
            {busy ? 'One sec…' : 'Continue'}
          </button>
        </form>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Hey ${me.name.split(' ')[0]}`}>
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-ash/50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-cream/70">Find me</span>
            <span className={me.hasFace ? 'font-semibold text-honey' : 'text-cream/40'}>{me.hasFace ? 'Selfie saved' : 'Not set up'}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={onSelfie} className={`${btnPrimary} flex-1 text-sm`}>
              {me.hasFace ? 'Retake selfie' : 'Take a selfie'}
            </button>
            {me.hasFace && (
              <button onClick={onForgetFace} className={`${btnGhost} text-sm`}>
                Forget my face
              </button>
            )}
          </div>
        </div>

        {me.isAdmin ? (
          <>
            <p className="text-center text-xs text-honey/80">Admin mode on · you can delete any photo</p>
            <BackfillButton />
          </>
        ) : showAdmin ? (
          <form onSubmit={adminSubmit} className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} className={field} placeholder="Admin code" autoFocus />
            <button type="submit" className={`${btnGhost} shrink-0`}>Go</button>
          </form>
        ) : null}
        {err && <p className="text-sm text-coral">{err}</p>}

        <div className="flex items-center justify-between pt-1">
          {!me.isAdmin && !showAdmin ? (
            <button onClick={() => setShowAdmin(true)} className="text-xs text-cream/30">Admin</button>
          ) : (
            <span />
          )}
          <button onClick={onSignOut} className={`${btnDanger} px-3 py-2 text-xs`}>Sign out</button>
        </div>
      </div>
    </Sheet>
  );
}


// Admin: tag photos uploaded before scene tagging was switched on.
function BackfillButton() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    fetch('/api/tags/backfill')
      .then((r) => r.json())
      .then((d) => {
        setRemaining(d.remaining ?? 0);
        setEnabled(d.enabled !== false);
      })
      .catch(() => {});
  }, []);

  const run = async () => {
    setRunning(true);
    setNote('');
    try {
      let left = remaining ?? 0;
      let failures = 0;
      while (left > 0) {
        const r = await fetch('/api/tags/backfill', { method: 'POST' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Tagging failed');
        failures += d.failed || 0;
        if (d.done === 0 && d.failed > 0) throw new Error('Tagging keeps failing; check the API key.');
        left = d.remaining;
        setRemaining(left);
      }
      setNote(failures ? `Done, ${failures} could not be tagged.` : 'All photos tagged.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Tagging failed');
    } finally {
      setRunning(false);
    }
  };

  if (remaining == null) return null;
  if (!enabled) return <p className="text-center text-xs text-cream/40">Scene tagging is off (ANTHROPIC_API_KEY not set).</p>;
  if (remaining === 0 && !note) return <p className="text-center text-xs text-cream/40">All photos have scene tags.</p>;
  return (
    <div className="text-center">
      {remaining > 0 && (
        <button onClick={run} disabled={running} className={`${btnGhost} w-full text-sm`}>
          {running ? `Tagging… ${remaining} left` : `Tag ${remaining} older photo${remaining === 1 ? '' : 's'}`}
        </button>
      )}
      {note && <p className="mt-2 text-xs text-cream/50">{note}</p>}
    </div>
  );
}


function Spinner({ small = false }: { small?: boolean }) {
  const size = small ? 'h-5 w-5 border-2' : 'h-9 w-9 border-[3px]';
  return <span className={`${size} inline-block shrink-0 animate-spin rounded-full border-honey/25 border-t-honey`} aria-label="Working" />;
}
