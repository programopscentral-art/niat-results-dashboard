'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export type Change = { field: string; old: string; new: string };
export type CollegeOpt = { id: string; name: string };
export type Event = {
  id: string; uid: string | null; studentName: string | null; op: string;
  changes: Change[]; editor: string | null; trigger: string | null; detectedAt: string;
  collegeId: string | null; collegeName: string; collegeSlug: string | null; semester: string | null;
};

const OP_LABEL: Record<string, string> = { insert: 'Added', update: 'Updated', delete: 'Removed' };

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
function absTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function ActivityFeed({ initial, colleges, isOps }: {
  initial: Event[]; colleges: CollegeOpt[]; isOps: boolean;
}) {
  const [events, setEvents] = useState<Event[]>(initial);
  const [filter, setFilter] = useState<string>('all');
  const [live, setLive] = useState(false);
  const [, force] = useState(0);
  const collegeName = useRef(new Map(colleges.map((c) => [c.id, c.name])));

  // Re-render every 30s so relative timestamps stay fresh.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Realtime: prepend new change events as they land (RLS scopes staff to their college).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'change_events' }, (payload) => {
        const r = payload.new as any;
        const e: Event = {
          id: r.id, uid: r.uid, studentName: r.student_name, op: r.op,
          changes: Array.isArray(r.changes) ? r.changes : [],
          editor: r.editor, trigger: r.trigger, detectedAt: r.detected_at,
          collegeId: r.college_id,
          collegeName: collegeName.current.get(r.college_id) ?? '—',
          collegeSlug: null, semester: null,
        };
        setEvents((prev) => (prev.some((x) => x.id === e.id) ? prev : [e, ...prev].slice(0, 300)));
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, []);

  const shown = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.collegeId === filter)),
    [events, filter],
  );

  return (
    <main>
      <div className="view acc-wrap">
        <div className="page-h" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>Activity <span className="g">log</span></h1>
          <span className={`live-dot ${live ? 'on' : ''}`} title={live ? 'Live — updates stream in automatically' : 'Connecting…'}>
            {live ? 'Live' : '…'}
          </span>
        </div>
        <p className="sub">
          Every add, edit, or removal detected in the Google Sheets — the college, the student, exactly which
          fields changed, and when. New activity appears here automatically (within ~60 seconds of the edit).
        </p>

        {isOps && colleges.length > 0 && (
          <div className="act-filter">
            <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All colleges</button>
            {colleges.map((c) => (
              <button key={c.id} className={`chip ${filter === c.id ? 'on' : ''}`} onClick={() => setFilter(c.id)}>{c.name}</button>
            ))}
          </div>
        )}

        <div className="act-feed">
          {shown.map((e) => (
            <div key={e.id} className="act-item">
              <div className={`act-op ${e.op}`}>{OP_LABEL[e.op] ?? e.op}</div>
              <div className="act-body">
                <div className="act-line">
                  {e.collegeSlug
                    ? <Link href={`/colleges/${e.collegeSlug}`} className="act-college">{e.collegeName}</Link>
                    : <span className="act-college">{e.collegeName}</span>}
                  <span className="act-student">
                    {e.uid
                      ? <Link href={`/students/${e.uid}`}>{e.studentName || e.uid}</Link>
                      : (e.studentName || '—')}
                  </span>
                  {e.semester && <span className="act-sem">{e.semester}</span>}
                </div>
                {e.changes.length > 0 && (
                  <ul className="act-changes">
                    {e.changes.slice(0, 8).map((c, i) => (
                      <li key={i}>
                        <span className="act-field">{c.field}</span>
                        <span className="act-old">{c.old || '∅'}</span>
                        <span className="act-arrow">→</span>
                        <span className="act-new">{c.new || '∅'}</span>
                      </li>
                    ))}
                    {e.changes.length > 8 && <li className="act-more">+{e.changes.length - 8} more field(s)</li>}
                  </ul>
                )}
                <div className="act-meta">
                  <span title={absTime(e.detectedAt)}>{relTime(e.detectedAt)}</span>
                  {e.editor && <><span className="act-sep">·</span><span>last edited by {e.editor}</span></>}
                </div>
              </div>
            </div>
          ))}
          {!shown.length && <div className="empty">No activity yet. Edits to the Google Sheets will show up here.</div>}
        </div>
      </div>
    </main>
  );
}
