import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase/server';

// Ops-only: paste a Google Sheet URL → register + load that semester via the worker.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['ops', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only ops/admin can add semesters.' }, { status: 403 });
  }

  const { url } = await req.json().catch(() => ({}));
  const m = String(url ?? '').match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || String(url ?? '').match(/^([a-zA-Z0-9_-]{30,})$/);
  const spreadsheetId = m?.[1];
  if (!spreadsheetId) return NextResponse.json({ error: 'That doesn’t look like a Google Sheets link.' }, { status: 400 });

  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.SYNC_WEBHOOK_SECRET;
  if (!workerUrl || !secret) return NextResponse.json({ error: 'Sync worker is not configured (WORKER_URL / SYNC_WEBHOOK_SECRET).' }, { status: 500 });

  const body = JSON.stringify({ spreadsheetId });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  try {
    const res = await fetch(`${workerUrl.replace(/\/$/, '')}/admin/register-semester`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-signature': signature },
      body,
      // loading a whole semester can take a while
      signal: AbortSignal.timeout(180_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    const msg = e?.name === 'TimeoutError' ? 'The load is taking longer than expected — check back shortly.' : `Could not reach the sync worker: ${String(e?.message ?? e)}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
