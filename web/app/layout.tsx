import type { Metadata } from 'next';
import './globals.css';
import { TopBar } from './components/TopBar';
import { Footer } from './components/Footer';
import { createClient } from '@/lib/supabase/server';
import { getSemesters, getSelectedSemester } from '@/lib/semester';

export const metadata: Metadata = {
  title: 'NIAT Records Console',
  description: 'Real-time student records for NIAT collaborated colleges.',
};

// Runs before paint — sets the saved theme so there is no flash of the wrong one.
const themeScript = `(function(){try{var t=localStorage.getItem('niat-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let role: string | null = null;
  let semesters: Awaited<ReturnType<typeof getSemesters>> = [];
  let selectedId: string | null = null;
  if (user) {
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    role = data?.role ?? null;
    semesters = await getSemesters();
    selectedId = (await getSelectedSemester())?.id ?? null;
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Satoshi — NIAT's display face (Fontshare) */}
        <link href="https://api.fontshare.com/v2/css?f%5B%5D=satoshi@400,500,700,900&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="aurora" />
        {user && <TopBar email={user.email ?? ''} role={role} semesters={semesters} selectedId={selectedId} />}
        {children}
        {user && <Footer />}
      </body>
    </html>
  );
}
