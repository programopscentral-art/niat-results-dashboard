'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Hit { uid: string; full_name: string | null; university_id: string | null; college: { name: string } | null; }

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const safe = q.replace(/[,()%\\*]/g, ' ').trim();
    if (safe.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('students')
        .select('uid, full_name, university_id, college:colleges(name)')
        .or(`full_name.ilike.%${safe}%,uid.ilike.%${safe}%,university_id.ilike.%${safe}%`)
        .limit(8);
      setHits((data as any) ?? []); setActive(0); setOpen(true);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const go = (h: Hit) => { setOpen(false); setQ(''); setHits([]); router.push(`/students/${encodeURIComponent(h.uid)}`); };

  return (
    <div className="gsearch" ref={boxRef}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
      <input
        value={q}
        placeholder="Search any student — name, UID, University ID…"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && hits.length > 0 && (
        <div className="gs-drop">
          {hits.map((h, i) => (
            <button key={h.uid} className={`gs-item ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
              <span className="gs-name">{h.full_name ?? '—'}</span>
              <span className="gs-meta"><span className="mono">{h.uid}</span> · {h.college?.name ?? '—'}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.replace(/[,()%\\*]/g, ' ').trim().length >= 2 && hits.length === 0 && (
        <div className="gs-drop"><div className="gs-empty">No students found for “{q}”.</div></div>
      )}
    </div>
  );
}
