'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Re-fetches the current server page when result summaries change, so a college
// moves from "Yet to be announced" up into "Results announced" on its own — no
// refresh needed. Debounced so a 60s sync (many rows at once) triggers one reload.
export function LiveRefresh({ semesterId }: { semesterId: string | null }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 1200);
    };
    const filter = semesterId ? { filter: `semester_id=eq.${semesterId}` } : {};
    const channel = supabase
      .channel('overview-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'result_summaries', ...filter }, bump)
      .subscribe();
    return () => { if (timer.current) clearTimeout(timer.current); supabase.removeChannel(channel); };
  }, [router, semesterId]);
  return null;
}
