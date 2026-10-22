import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Chrome, ShieldCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import Logo from '../components/Logo';

export default function Login() {
  const location = useLocation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams(location.search);
  const requested = params.get('redirectTo') || '/';
  const destination = requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/admin') ? requested : '/';

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) navigate(destination, { replace: true });
    });
    return () => { alive = false; };
  }, [destination, navigate]);

  const google = async () => {
    if (!isSupabaseConfigured) { setError('Login service is not configured. Please contact AS FITNESS GYM.'); return; }
    setBusy(true); setError('');
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${destination}`, queryParams: { prompt: 'select_account' } },
    });
    if (e) { setError(e.message); setBusy(false); }
  };

  return <main className="login-page"><section className="login-card"><div className="login-brand"><Logo/><span>AS FITNESS <b>GYM</b></span></div><div className="login-shield"><ShieldCheck size={30}/></div><h1>Welcome to AS FITNESS GYM</h1><p>Login or create your account to continue to the website and manage your membership.</p><button className="btn btn-red btn-full login-google" onClick={google} disabled={busy}><Chrome size={19}/>{busy ? 'Connecting to Google…' : 'Continue with Google'}</button><small>New here? Google will create your account automatically. Already registered? Choose the same Google account to sign in.</small>{error && <p role="alert" className="form-status" data-kind="error">{error}</p>}<p className="login-secure"><ShieldCheck size={14}/> Secure sign-in powered by Google</p></section></main>;
}
