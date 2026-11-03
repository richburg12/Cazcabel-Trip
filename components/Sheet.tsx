'use client';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="sheet safe-b relative w-full max-w-lg rounded-t-3xl border border-white/10 bg-smoke px-5 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        {title && <h2 className="mb-4 font-display text-3xl tracking-wide text-honey">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export const field =
  'w-full rounded-xl border border-white/15 bg-ash/70 px-4 py-3 text-base text-cream placeholder:text-cream/30 outline-none focus:border-honey/70 focus:ring-2 focus:ring-honey/20';
export const btn =
  'inline-flex items-center justify-center rounded-xl px-4 py-3 font-semibold transition active:scale-[0.98] disabled:opacity-50';
export const btnPrimary = `${btn} bg-honey text-ink hover:bg-[#f0b64a]`;
export const btnGhost = `${btn} border border-white/15 text-cream/80 hover:border-white/30`;
export const btnDanger = `${btn} bg-coral/15 text-coral border border-coral/30`;
