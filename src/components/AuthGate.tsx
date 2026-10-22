import { useEffect, useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setSignedIn(!!data.session); setChecked(true); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) { setSignedIn(!!session); setChecked(true); }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  if (!checked) return <main className="login-page"><p>Checking your secure login…</p></main>;
  if (!signedIn) return <Navigate to={`/login?redirectTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}
