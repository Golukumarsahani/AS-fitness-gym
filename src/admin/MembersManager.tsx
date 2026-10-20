import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Search, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';

/* ------------------------------------------------------------------ */
/* Date helpers (India time, whole days)                               */
/* ------------------------------------------------------------------ */
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const toUTC = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const addDays = (d: string, n: number) => new Date(toUTC(d) + n * 86400000).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((toUTC(a) - toUTC(b)) / 86400000);
const fmt = (d?: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
const rupees = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const planAmount = (p: any) =>
  Math.round(Number(p?.price_inr || 0) * (1 - Number(p?.discount_percent || 0) / 100)) + Number(p?.joining_fee_inr || 0);

/* ------------------------------------------------------------------ */
/* Status model                                                        */
/* ------------------------------------------------------------------ */
type State = 'paid' | 'unpaid' | 'expired' | 'cancelled' | 'none';
type Row = {
  member: any;
  ms: any | null; // latest membership
  state: State;
  daysLeft: number | null;
  via: string;
};
type Filter = 'all' | 'paid' | 'unpaid' | 'expired' | 'soon';

const STATE_LABEL: Record<State, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
  expired: 'Expired',
  cancelled: 'Cancelled',
  none: 'No plan',
};

function buildRows(members: any[], memberships: any[], today: string): Row[] {
  const latest = new Map<string, any>();
  for (const m of memberships) {
    const cur = latest.get(m.member_id);
    if (!cur || m.end_date > cur.end_date || (m.end_date === cur.end_date && m.created_at > cur.created_at)) {
      latest.set(m.member_id, m);
    }
  }
  return members.map((member) => {
    const ms = latest.get(member.id) ?? null;
    let state: State = 'none';
    let daysLeft: number | null = null;
    if (ms) {
      daysLeft = diffDays(ms.end_date, today);
      if (ms.status === 'cancelled') state = 'cancelled';
      else if (ms.status === 'pending') state = 'unpaid';
      else state = ms.end_date < today || ms.status === 'expired' ? 'expired' : 'paid';
    }
    const via = !ms ? '—' : ms.source === 'online_payment' ? 'Online' : ms.status === 'pending' ? 'Manual (due)' : 'Manual';
    return { member, ms, state, daysLeft, via };
  });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
type PayTarget = { member: any; ms: Row['ms']; mode: 'pending' | 'new' };

export default function MembersManager() {
  const [members, setMembers] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [paying, setPaying] = useState<PayTarget | null>(null);

  const today = todayIST();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // Persist expiry in the database (ignored if the migration has not been run yet;
    // the table below computes "Expired" from the dates either way).
    await supabase.rpc('expire_memberships');
    const [m, ms, p] = await Promise.all([
      supabase.from('members').select('*').neq('status', 'archived').order('created_at', { ascending: false }).limit(1000),
      supabase.from('memberships').select('*').limit(5000),
      supabase.from('membership_plans').select('*').order('display_order', { ascending: true }),
    ]);
    const firstError = m.error || ms.error || p.error;
    if (firstError) setError(firstError.message);
    setMembers(m.data || []);
    setMemberships(ms.data || []);
    setPlans(p.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => buildRows(members, memberships, today), [members, memberships, today]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      paid: rows.filter((r) => r.state === 'paid').length,
      unpaid: rows.filter((r) => r.state === 'unpaid').length,
      expired: rows.filter((r) => r.state === 'expired').length,
      soon: rows.filter((r) => r.state === 'paid' && (r.daysLeft ?? 99) <= 5).length,
    }),
    [rows],
  );

  const visible = rows.filter((r) => {
    if (filter === 'paid' && r.state !== 'paid') return false;
    if (filter === 'unpaid' && r.state !== 'unpaid') return false;
    if (filter === 'expired' && r.state !== 'expired') return false;
    if (filter === 'soon' && !(r.state === 'paid' && (r.daysLeft ?? 99) <= 5)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [r.member.full_name, r.member.phone, r.member.email, r.ms?.plan_name_snapshot].some((v) =>
      String(v ?? '').toLowerCase().includes(q),
    );
  });

  const archive = async (member: any) => {
    if (!confirm(`Remove ${member.full_name} from the active member list? Payment history is kept.`)) return;
    const { error: e } = await supabase.from('members').update({ status: 'archived' }).eq('id', member.id);
    if (e) setError(e.message);
    else {
      setInfo(`${member.full_name} removed from the list.`);
      load();
    }
  };

  const exportCsv = () => {
    const header = ['Name', 'Phone', 'Email', 'Plan', 'Payment status', 'Start', 'End', 'Days left', 'Added via'];
    const lines = visible.map((r) =>
      [r.member.full_name, r.member.phone, r.member.email ?? '', r.ms?.plan_name_snapshot ?? '', STATE_LABEL[r.state], r.ms?.start_date ?? '', r.ms?.end_date ?? '', r.daysLeft ?? '', r.via]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(','),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'as-fitness-members.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const chips: [Filter, string][] = [
    ['all', 'All'],
    ['paid', 'Paid'],
    ['unpaid', 'Unpaid'],
    ['expired', 'Expired'],
    ['soon', 'Expiring in 5 days'],
  ];

  return (
    <>
      <div className="admin-title">
        <div>
          <h1>Members</h1>
          <p>{rows.length} members · membership validity is counted from the payment start date and expires automatically.</p>
        </div>
      </div>

      {error && <div className="notice error-notice">{error}</div>}
      {info && <div className="notice ok-notice">{info}</div>}

      <div className="member-chips" role="tablist" aria-label="Filter members">
        {chips.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'chip chip-on' : 'chip'} onClick={() => setFilter(key)}>
            {label} <b>{counts[key]}</b>
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, plan…" />
        </div>
        <button className="btn btn-red" onClick={() => { setAdding(true); setEditing(null); setInfo(''); }}>
          <Plus size={17} /> Add member
        </button>
        <button className="btn btn-light-border" onClick={exportCsv}>Export CSV</button>
      </div>

      {adding && (
        <AddMemberForm
          plans={plans}
          onCancel={() => setAdding(false)}
          onDone={(msg) => { setAdding(false); setInfo(msg); load(); }}
          onError={setError}
        />
      )}

      {editing && (
        <EditMemberForm
          member={editing}
          onCancel={() => setEditing(null)}
          onDone={() => { setEditing(null); setInfo('Member updated.'); load(); }}
          onError={setError}
        />
      )}

      {paying && (
        <PayDialog
          target={paying}
          plans={plans}
          onCancel={() => setPaying(null)}
          onDone={(msg) => { setPaying(null); setInfo(msg); load(); }}
          onError={setError}
        />
      )}

      <div className="admin-table-wrap">
        {loading && !rows.length ? (
          <p className="empty-state">Loading members…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th>Validity</th>
                <th>Payment</th>
                <th>Added via</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const needsPayment = r.state === 'unpaid';
                const canRenew = r.state === 'expired' || r.state === 'none' || r.state === 'cancelled' || (r.state === 'paid' && (r.daysLeft ?? 99) <= 7);
                return (
                  <tr key={r.member.id}>
                    <td>
                      <b>{r.member.full_name}</b>
                      <small>{r.member.phone}{r.member.email ? ` · ${r.member.email}` : ''}</small>
                    </td>
                    <td>{r.ms?.plan_name_snapshot ?? '—'}</td>
                    <td>
                      {r.ms ? (
                        <>
                          {fmt(r.ms.start_date)} → {fmt(r.ms.end_date)}
                          <small>
                            {r.state === 'paid' && `${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} left`}
                            {r.state === 'expired' && `Expired ${Math.abs(r.daysLeft ?? 0)} day(s) ago`}
                            {r.state === 'unpaid' && 'Starts when payment is marked paid'}
                          </small>
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`pill pill-${r.state}`}>{STATE_LABEL[r.state]}</span>
                      {r.state === 'paid' && (r.daysLeft ?? 99) <= 5 && <small>Expiring soon</small>}
                    </td>
                    <td>{r.via}</td>
                    <td>
                      <div className="row-actions">
                        {needsPayment && (
                          <button className="icon-action pay" onClick={() => { setPaying({ member: r.member, ms: r.ms, mode: 'pending' }); setInfo(''); }}>
                            <Wallet size={14} /> Mark paid
                          </button>
                        )}
                        {!needsPayment && canRenew && (
                          <button className="icon-action pay" onClick={() => { setPaying({ member: r.member, ms: r.ms, mode: 'new' }); setInfo(''); }}>
                            <Wallet size={14} /> {r.state === 'none' ? 'Assign plan' : 'Renew'}
                          </button>
                        )}
                        <button className="icon-action" onClick={() => { setEditing({ ...r.member }); setAdding(false); }}>Edit</button>
                        <button className="icon-action danger" onClick={() => archive(r.member)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!visible.length && !loading && <p className="empty-state">No members match. Add a member or change the filter.</p>}
      </div>
      <p className="fine-print">
        Online (Razorpay) payments appear here automatically as <b>Paid</b> after the server verifies them. Members added by you stay <b>Unpaid</b> until you press <b>Mark paid</b>; their validity then starts from the payment date.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Recording a manual payment + activating the membership              */
/* ------------------------------------------------------------------ */
type PayInput = {
  member: any;
  plan: any;
  start: string;
  days: number;
  amount: number;
  method: string;
  existingPending: any | null; // membership row to activate (unpaid), or null to create a new one
};

async function recordManualPayment(i: PayInput): Promise<string | null> {
  const end = addDays(i.start, i.days);
  const joining = Number(i.plan.joining_fee_inr || 0);

  // 1. Payment record (money received).
  const pay = await supabase
    .from('payments')
    .insert({
      member_id: i.member.id,
      plan_id: i.plan.id,
      plan_name_snapshot: i.plan.name,
      amount_inr: i.amount,
      currency: 'INR',
      status: 'manual_paid',
      provider: i.method,
      paid_at: new Date().toISOString(),
      metadata: { recorded_by: 'admin', start_date: i.start, validity_days: i.days },
    })
    .select('id')
    .single();
  if (pay.error) return pay.error.message;
  const paymentId = pay.data.id as string;

  // 2. Membership becomes active for the paid period.
  const fields = {
    plan_id: i.plan.id,
    plan_name_snapshot: i.plan.name,
    price_inr: Math.max(0, i.amount - joining),
    joining_fee_inr: Math.min(joining, i.amount),
    start_date: i.start,
    end_date: end,
    status: 'active',
    source: 'manual_payment',
    payment_id: paymentId,
  };
  const ms = i.existingPending
    ? await supabase.from('memberships').update(fields).eq('id', i.existingPending.id).select('id').single()
    : await supabase.from('memberships').insert({ member_id: i.member.id, ...fields }).select('id').single();
  if (ms.error) {
    await supabase.from('payments').delete().eq('id', paymentId); // no orphan payment
    return ms.error.message;
  }

  // 3. Link the payment back to the membership.
  const link = await supabase.from('payments').update({ membership_id: ms.data.id }).eq('id', paymentId);
  return link.error ? link.error.message : null;
}

const METHODS: [string, string][] = [
  ['cash', 'Cash'],
  ['upi', 'UPI (outside website)'],
  ['bank_transfer', 'Bank transfer'],
  ['other', 'Other'],
];

function PayDialog({ target, plans, onCancel, onDone, onError }: {
  target: PayTarget;
  plans: any[];
  onCancel: () => void;
  onDone: (msg: string) => void;
  onError: (m: string) => void;
}) {
  const today = todayIST();
  const current = target.ms;
  const activePlans = plans.filter((p) => p.is_active || p.id === current?.plan_id);
  const initialPlan = plans.find((p) => p.id === current?.plan_id) ?? activePlans[0];
  const stillRunning = target.mode === 'new' && current && current.status === 'active' && current.end_date >= today;

  const [planId, setPlanId] = useState(initialPlan?.id ?? '');
  const plan = plans.find((p) => p.id === planId);
  const [start, setStart] = useState(stillRunning ? current.end_date : today);
  const [days, setDays] = useState<number>(Number(initialPlan?.duration_days || 30));
  const [amount, setAmount] = useState<number>(planAmount(initialPlan));
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState(false);

  const pickPlan = (id: string) => {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (p) {
      setDays(Number(p.duration_days || 30));
      setAmount(planAmount(p));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return onError('Select a plan.');
    if (!Number.isInteger(days) || days < 1) return onError('Validity must be at least 1 day.');
    if (!Number.isInteger(amount) || amount < 0) return onError('Enter a valid amount.');
    setBusy(true);
    onError('');
    const err = await recordManualPayment({
      member: target.member,
      plan,
      start,
      days,
      amount,
      method,
      existingPending: target.mode === 'pending' ? current : null,
    });
    setBusy(false);
    if (err) onError(err);
    else onDone(`${target.member.full_name}: payment recorded. Valid ${fmt(start)} → ${fmt(addDays(start, days))}.`);
  };

  return (
    <form className="admin-panel edit-form" onSubmit={submit}>
      <h3>{target.mode === 'pending' ? 'Mark payment as received' : current ? 'Renew membership' : 'Assign plan & record payment'} — {target.member.full_name}</h3>
      <div className="form-grid">
        <label>
          Plan
          <select value={planId} onChange={(e) => pickPlan(e.target.value)} required>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {rupees(planAmount(p))}</option>
            ))}
          </select>
        </label>
        <label>
          Amount received (₹)
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required />
        </label>
        <label>
          Validity starts on
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label>
          Validity (days)
          <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} required />
        </label>
        <label className="span-two">
          Payment method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>
      <p className="valid-preview">Membership will be <b>Paid</b> from <b>{fmt(start)}</b> to <b>{fmt(addDays(start, Math.max(1, days || 1)))}</b>, then it expires automatically.</p>
      <div className="row-actions">
        <button className="btn btn-red" disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Confirm payment received'}</button>
        <button type="button" className="btn btn-light-border" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Add member                                                          */
/* ------------------------------------------------------------------ */
function AddMemberForm({ plans, onCancel, onDone, onError }: {
  plans: any[];
  onCancel: () => void;
  onDone: (msg: string) => void;
  onError: (m: string) => void;
}) {
  const today = todayIST();
  const activePlans = plans.filter((p) => p.is_active);
  const [f, setF] = useState({ full_name: '', phone: '', email: '', address: '', notes: '' });
  const [planId, setPlanId] = useState(activePlans[0]?.id ?? '');
  const [start, setStart] = useState(today);
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState('cash');
  const plan = plans.find((p) => p.id === planId);
  const [days, setDays] = useState<number>(Number(activePlans[0]?.duration_days || 30));
  const [amount, setAmount] = useState<number>(planAmount(activePlans[0]));
  const [busy, setBusy] = useState(false);

  const pickPlan = (id: string) => {
    setPlanId(id);
    const p = plans.find((x) => x.id === id);
    if (p) {
      setDays(Number(p.duration_days || 30));
      setAmount(planAmount(p));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    const name = f.full_name.trim();
    const phone = f.phone.trim();
    if (name.length < 2) return onError('Enter the member’s full name.');
    if (phone.length < 8 || phone.length > 20) return onError('Enter a valid phone number (8–20 characters).');
    setBusy(true);

    const created = await supabase
      .from('members')
      .insert({ full_name: name, phone, email: f.email.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null, status: 'active' })
      .select('*')
      .single();
    if (created.error) {
      setBusy(false);
      return onError(created.error.code === '23505' ? 'A member with this phone number already exists.' : created.error.message);
    }
    const member = created.data;

    if (!plan) {
      setBusy(false);
      return onDone(`${name} added without a plan. Use “Assign plan” when they join.`);
    }

    if (paid) {
      const err = await recordManualPayment({ member, plan, start, days, amount, method, existingPending: null });
      setBusy(false);
      if (err) return onError(`Member saved, but the payment could not be recorded: ${err}`);
      return onDone(`${name} added and marked Paid. Valid ${fmt(start)} → ${fmt(addDays(start, days))}.`);
    }

    // Unpaid: membership waits in 'pending' until the owner presses "Mark paid".
    const pending = await supabase.from('memberships').insert({
      member_id: member.id,
      plan_id: plan.id,
      plan_name_snapshot: plan.name,
      price_inr: Math.round(Number(plan.price_inr) * (1 - Number(plan.discount_percent || 0) / 100)),
      joining_fee_inr: Number(plan.joining_fee_inr || 0),
      start_date: start,
      end_date: addDays(start, Math.max(1, days)),
      status: 'pending',
      source: 'admin',
    });
    setBusy(false);
    if (pending.error) return onError(`Member saved, but the plan could not be attached: ${pending.error.message}`);
    onDone(`${name} added as Unpaid. Press “Mark paid” once the payment is received.`);
  };

  return (
    <form className="admin-panel edit-form" onSubmit={submit}>
      <h3>Add existing / walk-in member</h3>
      <div className="form-grid">
        <label>Full name<input value={f.full_name} maxLength={120} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></label>
        <label>Phone<input value={f.phone} maxLength={20} onChange={(e) => setF({ ...f, phone: e.target.value })} required /></label>
        <label>Email (optional)<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Address (optional)<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
        <label>
          Plan
          <select value={planId} onChange={(e) => pickPlan(e.target.value)}>
            <option value="">No plan yet</option>
            {activePlans.map((p) => <option key={p.id} value={p.id}>{p.name} — {rupees(planAmount(p))}</option>)}
          </select>
        </label>
        <label>
          {paid ? 'Validity starts on' : 'Joining date'}
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>

        <fieldset className="span-two pay-choice">
          <legend>Payment status</legend>
          <label className="consent"><input type="radio" name="paystate" checked={!paid} onChange={() => setPaid(false)} /> Unpaid — will pay later</label>
          <label className="consent"><input type="radio" name="paystate" checked={paid} onChange={() => setPaid(true)} /> Paid — already received</label>
        </fieldset>

        {paid && plan && (
          <>
            <label>Amount received (₹)<input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></label>
            <label>Validity (days)<input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
            <label className="span-two">
              Payment method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="span-two">Private notes<textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      {paid && plan && (
        <p className="valid-preview">Will be <b>Paid</b> from <b>{fmt(start)}</b> to <b>{fmt(addDays(start, Math.max(1, days || 1)))}</b>, then expires automatically.</p>
      )}
      <div className="row-actions">
        <button className="btn btn-red" disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save member'}</button>
        <button type="button" className="btn btn-light-border" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Edit member details                                                 */
/* ------------------------------------------------------------------ */
function EditMemberForm({ member, onCancel, onDone, onError }: {
  member: any;
  onCancel: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [f, setF] = useState({
    full_name: member.full_name ?? '',
    phone: member.phone ?? '',
    email: member.email ?? '',
    address: member.address ?? '',
    notes: member.notes ?? '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError('');
    if (f.full_name.trim().length < 2) return onError('Enter the member’s full name.');
    if (f.phone.trim().length < 8 || f.phone.trim().length > 20) return onError('Enter a valid phone number.');
    setBusy(true);
    const { error } = await supabase
      .from('members')
      .update({ full_name: f.full_name.trim(), phone: f.phone.trim(), email: f.email.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null })
      .eq('id', member.id);
    setBusy(false);
    if (error) onError(error.code === '23505' ? 'Another member already uses this phone number.' : error.message);
    else onDone();
  };

  return (
    <form className="admin-panel edit-form" onSubmit={submit}>
      <h3>Edit member</h3>
      <div className="form-grid">
        <label>Full name<input value={f.full_name} maxLength={120} onChange={(e) => setF({ ...f, full_name: e.target.value })} required /></label>
        <label>Phone<input value={f.phone} maxLength={20} onChange={(e) => setF({ ...f, phone: e.target.value })} required /></label>
        <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Address<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
        <label className="span-two">Private notes<textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      <div className="row-actions">
        <button className="btn btn-red" disabled={busy}><Save size={16} /> {busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="btn btn-light-border" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
