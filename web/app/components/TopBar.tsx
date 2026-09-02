'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SemesterSwitcher } from './SemesterSwitcher';
import { GlobalSearch } from './GlobalSearch';
import type { Semester } from '@/lib/semester';

const THEMES = ['light', 'dark'] as const;

export function TopBar({ email, role, semesters, selectedId }:
  { email: string; role: string | null; semesters: Semester[]; selectedId: string | null }) {
  const isOps = role === 'ops' || role === 'super_admin';
  const router = useRouter();
  const [theme, setTheme] = useState<string>('light');

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(t);
  }, []);

  const apply = (t: string) => {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('niat-theme', t); } catch {}
    setTheme(t);
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="bar-wrap">
      <div className="bar">
        <Link href="/" className="logo" aria-label="NIAT Records — home">
          <img src="/niat-logo.png" alt="NIAT" className="logo-img" />
          <span className="logo-sub">Records</span>
        </Link>
        <SemesterSwitcher semesters={semesters} selectedId={selectedId} isOps={isOps} />
        <GlobalSearch />
        <div className="spacer" />
        <Link href="/activity" className="ghost navlink">⚡ Activity</Link>
        {isOps && <Link href="/sources" className="ghost navlink">📄 Sheets</Link>}
        {isOps && <Link href="/access" className="ghost navlink">👥 Access</Link>}
        {role && <span className="pillrole" title={email}>{role === 'college_staff' ? 'College' : role.toUpperCase()}</span>}
        <div className="seg" role="group" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t} className={theme === t ? 'on' : ''} onClick={() => apply(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={signOut}>Sign out</button>
      </div>
    </header>
  );
}
