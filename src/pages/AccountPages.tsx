import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, LogIn, LogOut, UserRound } from 'lucide-react';
import { supabase, requireSupabase } from '../lib/supabase';

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = new URLSearchParams(location.search).get('next') || '/profile';
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate(next.startsWith('/') ? next : '/profile', { replace: true }); });
  }, [navigate, next]);
  const google = async () => {
    setBusy(true); setError('');
    try {
      const client = requireSupabase();
      const redirect = new URL(next.startsWith('/') ? next : '/profile', window.location.origin).toString();
      const { error: e } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect, queryParams: { prompt: 'select_account' } } });
      if (e) throw e;
    } catch (e) { setError(e instanceof Error ? e.message : 'Google login could not start. Please try again.'); setBusy(false); }
  };
  return <section className="section account-section"><div className="account-card"><div className="account-icon"><LogIn size={28}/></div><span className="eyebrow">AS FITNESS GYM ACCOUNT</span><h1>Login to continue</h1><p>Browse the website freely. Sign in with Google when you want to buy a membership or view your profile.</p><button className="btn btn-red btn-full" onClick={google} disabled={busy}>{busy ? 'Opening Google…' : 'Continue with Google'}</button>{error && <p className="account-error">{error}</p>}<small>Your existing membership is saved in the gym database and is not deleted when you log out.</small><Link className="text-link" to="/membership">Back to membership plans</Link></div></section>;
}

const dateLabel = (value?: string) => value ? new Date(`${value.slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : 'Not available';
export function ProfilePage() {
  const [session, setSession] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({data}) => {
      if (!alive) return;
      const s = data.session; setSession(s);
      if (!s) { setBusy(false); return; }
      const client = requireSupabase();
      const { data: m, error: me } = await client.from('members').select('id,full_name,phone,email,status,created_at').or(`auth_user_id.eq.${s.user.id},email.eq.${s.user.email || '__no_email__'}`).maybeSingle();
      if (!alive) return;
      if (me) setError('Your account is signed in, but member details could not be loaded. Please contact the gym if you have already paid.');
      if (m) {
        setMember(m);
        const { data: rows, error: msErr } = await client.from('memberships').select('id,plan_name_snapshot,price_inr,start_date,end_date,status,created_at').eq('member_id',m.id).order('created_at',{ascending:false});
        if (msErr) setError('Could not load membership history. Please refresh or contact the gym.');
        setMemberships(rows || []);
      }
      setBusy(false);
    }).catch(() => { if (alive) { setError('Could not load your profile. Please refresh.'); setBusy(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); if (!s) { setMember(null); setMemberships([]); } });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);
  const logout = async () => { await supabase.auth.signOut(); navigate('/', {replace:true}); };
  if (busy) return <section className="section"><div className="container"><p>Loading your profile…</p></div></section>;
  if (!session) return <section className="section account-section"><div className="account-card"><div className="account-icon"><UserRound size={28}/></div><h1>Your profile</h1><p>Please sign in with Google to see your membership details.</p><Link className="btn btn-red btn-full" to={`/login?next=${encodeURIComponent('/profile')}`}>Continue with Google</Link></div></section>;
  const active = memberships.find(x => x.status === 'active' && x.end_date >= new Date().toISOString().slice(0,10));
  return <section className="section profile-section"><div className="container"><div className="profile-head"><div><span className="eyebrow">MY ACCOUNT</span><h1>My Profile</h1><p>Account and membership details for AS FITNESS GYM.</p></div><button className="btn btn-light-border" onClick={logout}><LogOut size={16}/> Logout</button></div><div className="profile-grid"><article className="profile-card"><div className="profile-avatar"><UserRound size={28}/></div><h2>{member?.full_name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Gym member'}</h2><p>{session.user.email || member?.email || 'Email not available'}</p>{member?.phone && <p>{member.phone}</p>}<span className="profile-status">{member?.status || 'Account connected'}</span></article><article className="profile-card membership-current"><span className="eyebrow">CURRENT MEMBERSHIP</span>{active ? <><h2>{active.plan_name_snapshot}</h2><p className="profile-price">₹{Number(active.price_inr || 0).toLocaleString('en-IN')}</p><div className="profile-detail"><CalendarDays size={18}/><span>Started<b>{dateLabel(active.start_date)}</b></span></div><div className="profile-detail"><CalendarDays size={18}/><span>Expires on<b>{dateLabel(active.end_date)}</b></span></div><p className="profile-status"><CheckCircle2 size={14}/> Active</p></> : <><h2>No active membership</h2><p>Choose a plan to become a member. Your profile will update after payment is verified.</p><Link className="btn btn-red" to="/membership">View membership plans</Link></>}</article></div><div className="profile-card profile-history"><h2>Membership history</h2>{error && <p className="account-error">{error}</p>}{memberships.length ? <div className="profile-table-wrap"><table className="profile-table"><thead><tr><th>Plan</th><th>Start date</th><th>Expiry</th><th>Status</th></tr></thead><tbody>{memberships.map(x=><tr key={x.id}><td><b>{x.plan_name_snapshot}</b><small>₹{Number(x.price_inr || 0).toLocaleString('en-IN')}</small></td><td>{dateLabel(x.start_date)}</td><td>{dateLabel(x.end_date)}</td><td><span className={`history-status ${x.status}`}>{x.status}</span></td></tr>)}</tbody></table></div> : <p>No membership history is linked to this Google account yet. If you paid previously with another account or before this feature was added, contact the gym so the existing record can be linked safely.</p>}</div></div></section>;
}
