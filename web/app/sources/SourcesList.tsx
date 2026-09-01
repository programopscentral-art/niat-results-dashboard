'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddSemesterModal } from '../components/AddSemesterModal';

export interface Source {
  id: string; batch: string; name: string; title: string | null; spreadsheetId: string;
  url: string; tabs: number; colleges: number; students: number; awaiting: number; lastSynced: string | null;
}

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function SourcesList({ sources, serviceAccount }: { sources: Source[]; serviceAccount: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const shown = useMemo(() => {
    const qq = q.toLowerCase();
    return sources.filter((s) => !qq ||
      `${s.batch} ${s.name} ${s.title ?? ''} ${s.spreadsheetId}`.toLowerCase().includes(qq));
  }, [sources, q]);

  const copy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 1500); });
  };

  return (
    <>
      <div className="toolbar">
        <div className="search" style={{ maxWidth: 340 }}>
          <input placeholder="Search semester, batch, title…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-p" style={{ marginLeft: 'auto' }} onClick={() => setAdd(true)}>+ Add semester</button>
      </div>

      <div className="src-list">
        {shown.map((s) => (
          <div key={s.id} className="src-card">
            <div className="src-main">
              <div className="src-title">{s.batch} · {s.name}</div>
              {s.title && <div className="src-sub">{s.title}</div>}
              <div className="src-stats">
                <span><b>{s.colleges}</b> colleges</span>
                <span><b>{s.tabs}</b> tabs</span>
                <span><b>{s.students.toLocaleString()}</b> students</span>
                {s.awaiting > 0 && <span className="src-await">{s.awaiting} awaiting results</span>}
                <span className="src-sync"><i /> synced {ago(s.lastSynced)}</span>
              </div>
            </div>
            <div className="src-actions">
              <a className="btn-p" href={s.url} target="_blank" rel="noopener noreferrer">Open sheet ↗</a>
              <button className="ghost" onClick={() => copy(s.url, s.id)}>{copied === s.id ? '✓ Copied' : 'Copy link'}</button>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="empty">No semesters match “{q}”.</div>}
      </div>

      <div className="src-note">
        To add a new semester, share its sheet with <span className="mono">{serviceAccount}</span> (Viewer), then click <b>+ Add semester</b> and paste the link. It reads only — nothing is written back.
      </div>

      {add && <AddSemesterModal onClose={() => setAdd(false)} onDone={() => { setAdd(false); router.refresh(); }} />}
    </>
  );
}
