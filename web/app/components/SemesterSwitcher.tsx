'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Semester } from '@/lib/semester';

export function SemesterSwitcher({
  semesters, selectedId, isOps,
}: { semesters: Semester[]; selectedId: string | null; isOps: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const pick = (id: string) => {
    document.cookie = `sel_sem=${id}; path=/; max-age=31536000`;
    router.refresh();
  };

  return (
    <div className="semwrap">
      {semesters.length > 0 && (
        <select className="semsel" value={selectedId ?? ''} onChange={(e) => pick(e.target.value)} aria-label="Semester">
          {semesters.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}
      {isOps && <button className="ghost" onClick={() => setOpen(true)} title="Add a semester from a Google Sheet">+ Add semester</button>}
      {open && <AddSemesterModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); router.refresh(); }} />}
    </div>
  );
}

function AddSemesterModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/semesters', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add semester'); }
      else setResult(data.report);
    } catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add a semester</h3>
        <p className="modal-sub">Paste the Google Sheet link. The sheet must be shared with the service account (Viewer) and follow the standard template. Reading only — nothing is written back to the sheet.</p>
        <input className="modal-input" placeholder="https://docs.google.com/spreadsheets/d/…" value={url}
          onChange={(e) => setUrl(e.target.value)} disabled={busy} />
        {error && <div className="modal-err">⚠ {error}</div>}
        {result && (
          <div className="modal-ok">
            <b>✓ {result.registered?.length ?? 0} college tab(s) registered{result.semester ? ` for ${result.semester}` : ''}.</b>
            <div className="mo-line">Data is loading now — it appears in the dashboard within ~60 seconds. Pick it from the semester switcher.</div>
            {result.unmatchedTabs?.length ? <div className="mo-line warn">Unknown tabs (add these colleges to the registry first): {result.unmatchedTabs.join(', ')}</div> : null}
          </div>
        )}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>Close</button>
          {!result
            ? <button className="btn-p" onClick={submit} disabled={busy || !url.trim()}>{busy ? 'Loading… (up to ~2 min)' : 'Load semester'}</button>
            : <button className="btn-p" onClick={onDone}>Done</button>}
        </div>
      </div>
    </div>
  );
}
