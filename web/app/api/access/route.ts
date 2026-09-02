import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ROLES = ['ops', 'college_staff'] as const;
type Role = (typeof ROLES)[number];

// Verify the caller is ops/admin; returns their supabase client + email or an error response.
async function requireOps() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!me || !['ops', 'super_admin'].includes(me.role)) {
    return { error: NextResponse.json({ error: 'Only ops/admin can manage access.' }, { status: 403 }) };
  }
  return { supabase, actor: user.email ?? '' };
}

// POST — grant/assign access for an email (works before OR after the user's first login).
export async function POST(req: Request) {
  const gate = await requireOps();
  if ('error' in gate) return gate.error;
  const { supabase, actor } = gate;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? '') as Role;
  let collegeId: string | null = body.collegeId ? String(body.collegeId) : null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (!ROLES.includes(role))
    return NextResponse.json({ error: 'Pick a valid role.' }, { status: 400 });
  if (role === 'ops') collegeId = null; // ops sees everything — no college scope
  if (role === 'college_staff' && !collegeId)
    return NextResponse.json({ error: 'Choose a college for college staff.' }, { status: 400 });

  // 1) Pre-authorize (applied by the signup trigger on first login).
  const { error: gErr } = await supabase.from('access_grants')
    .upsert({ email, role, college_id: collegeId, created_by: actor }, { onConflict: 'email' });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  // 2) If the user has already logged in, update their live profile so it applies now.
  const { error: pErr } = await supabase.from('profiles')
    .update({ role, college_id: collegeId }).eq('email', email);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE — revoke access for an email (removes the grant; existing profile loses data access).
export async function DELETE(req: Request) {
  const gate = await requireOps();
  if ('error' in gate) return gate.error;
  const { supabase, actor } = gate;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Missing email.' }, { status: 400 });
  if (email === actor.toLowerCase())
    return NextResponse.json({ error: 'You can’t revoke your own access.' }, { status: 400 });

  await supabase.from('access_grants').delete().eq('email', email);
  // Downgrade any existing profile to no-data (college_staff with no college).
  await supabase.from('profiles').update({ role: 'college_staff', college_id: null }).eq('email', email);
  return NextResponse.json({ ok: true });
}
