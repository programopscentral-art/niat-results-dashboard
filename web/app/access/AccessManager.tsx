'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type CollegeOpt = { id: string; name: string };
export type UserRow = { id: string; email: string; name: string; role: string; collegeId: string | null };
export type GrantRow = { email: string; role: string; collegeId: string | null };

async function post(body: any) {
  const res = await fetch('/api/access', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
}
async function revoke(email: string) {
  const res = await fetch('/api/access', {
    method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
}

// One editable access row: role + (conditional) college + Save/Revoke.
function AccessRow({ email, name, role, collegeId, colleges, isSelf, onDone }: {
  email: string; name?: string; role: string; collegeId: string | null;
  colleges: CollegeOpt[]; isSelf: boolean; onDone: () => void;
}) {
  const [r, setR] = useState(role === 'super_admin' ? 'ops' : role);
  const [cid, setCid] = useState<string>(collegeId ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const collegeName = colleges.find((c) => c.id === collegeId)?.name;
  const dirty = r !== role || (r === 'college_staff' && cid !== (collegeId ?? ''));

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      await post({ email, role: r, collegeId: r === 'college_staff' ? cid || null : null });
      onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const doRevoke = async () => {
    setErr(null); setBusy(true);
    try { await revoke(email); onDone(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const hasAccess = role === 'ops' || role === 'super_admin' || (role === 'college_staff' && !!collegeId);

  return (
    <div className="acc-row">
      <div className="acc-who">
        <div className="acc-email">{email}{isSelf && <span className="acc-you">you</span>}</div>
        <div className="acc-meta">
          {name && <span>{name}</span>}
          <span className={`acc-state ${hasAccess ? 'ok' : 'none'}`}>
            {role === 'ops' || role === 'super_admin' ? 'Full access (ops)'
              : hasAccess ? `College · ${collegeName ?? '—'}`
              : 'No access yet'}
          </span>
        </div>
      </div>
      <div className="acc-ctl">
        <select className="acc-sel" value={r} onChange={(e) => setR(e.target.value)} disabled={busy || isSelf}>
          <option value="ops">Ops — full access</option>
          <option value="college_staff">College staff</option>
        </select>
        {r === 'college_staff' && (
          <select className="acc-sel" value={cid} onChange={(e) => setCid(e.target.value)} disabled={busy}>
            <option value="">Choose college…</option>
            {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button className="btn-p acc-save" onClick={save} disabled={busy || !dirty || (r === 'college_staff' && !cid)}>
          {busy ? '…' : 'Save'}
        </button>
        {hasAccess && !isSelf && (
          <button className="acc-revoke" onClick={doRevoke} disabled={busy} title="Remove all access">Revoke</button>
        )}
      </div>
      {err && <div className="acc-err">{err}</div>}
    </div>
  );
}

export function AccessManager({ meEmail, users, pending, colleges }: {
  meEmail: string; users: UserRow[]; pending: GrantRow[]; colleges: CollegeOpt[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  // Invite form
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ops');
  const [cid, setCid] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const invite = async () => {
    setErr(null); setOk(null); setBusy(true);
    try {
      await post({ email, role, collegeId: role === 'college_staff' ? cid || null : null });
      setOk(`Access granted to ${email.trim().toLowerCase()}. They'll see it the moment they log in.`);
      setEmail(''); setCid('');
      refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <main>
      <div className="view acc-wrap">
        <div className="page-h"><h1>Access <span className="g">management</span></h1></div>
        <p className="sub">
          Grant dashboard access by email and choose what each person sees. Ops see everything;
          college staff see only their assigned college. New grants apply the instant that person logs in.
        </p>

        {/* Invite / pre-authorize */}
        <section className="acc-card">
          <h2 className="acc-h2">Give access to someone</h2>
          <p className="acc-note">
            Works whether or not they’ve logged in yet — enter their NIAT Google email, pick a role, and save.
          </p>
          <div className="acc-invite">
            <input
              className="acc-input" type="email" placeholder="name@nxtwave.in"
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy}
            />
            <select className="acc-sel" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
              <option value="ops">Ops — full access</option>
              <option value="college_staff">College staff</option>
            </select>
            {role === 'college_staff' && (
              <select className="acc-sel" value={cid} onChange={(e) => setCid(e.target.value)} disabled={busy}>
                <option value="">Choose college…</option>
                {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <button className="btn-p" onClick={invite}
              disabled={busy || !email || (role === 'college_staff' && !cid)}>
              {busy ? 'Saving…' : 'Grant access'}
            </button>
          </div>
          {err && <div className="acc-err">{err}</div>}
          {ok && <div className="acc-ok">{ok}</div>}
        </section>

        {/* People who have logged in */}
        <section className="acc-card">
          <h2 className="acc-h2">Team members <span className="acc-count">{users.length}</span></h2>
          <p className="acc-note">Everyone who has signed in. Change a role or college and hit Save — it applies on their next page load.</p>
          <div className="acc-list">
            {users.map((u) => (
              <AccessRow key={u.id} email={u.email} name={u.name} role={u.role} collegeId={u.collegeId}
                colleges={colleges} isSelf={u.email.toLowerCase() === meEmail.toLowerCase()} onDone={refresh} />
            ))}
            {!users.length && <div className="empty">No one has signed in yet.</div>}
          </div>
        </section>

        {/* Pre-authorized but not yet logged in */}
        {pending.length > 0 && (
          <section className="acc-card">
            <h2 className="acc-h2">Invited — awaiting first login <span className="acc-count">{pending.length}</span></h2>
            <p className="acc-note">These emails are pre-authorized. They become active automatically when the person logs in.</p>
            <div className="acc-list">
              {pending.map((g) => (
                <AccessRow key={g.email} email={g.email} role={g.role} collegeId={g.collegeId}
                  colleges={colleges} isSelf={false} onDone={refresh} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
