'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Semester } from '@/lib/semester';
import { AddSemesterModal } from './AddSemesterModal';

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
