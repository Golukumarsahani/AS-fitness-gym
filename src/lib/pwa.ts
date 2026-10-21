import { useEffect, useState } from 'react';
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || (navigator as any).standalone === true);
export function useAppMode() {
  const [app, setApp] = useState(isStandalone());
  useEffect(() => { const m = window.matchMedia('(display-mode: standalone)'); const f = () => setApp(isStandalone()); m.addEventListener?.('change', f); return () => m.removeEventListener?.('change', f); }, []);
  useEffect(() => { document.documentElement.classList.toggle('app-mode', app); }, [app]);
  return app;
}
let deferred: any = null; const subs = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; subs.forEach(f => f()); });
  window.addEventListener('appinstalled', () => { deferred = null; subs.forEach(f => f()); });
}
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(x => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone();
  return { canInstall: !!deferred, ios, install: async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; tick(x => x + 1); } };
}
export function registerSW() { if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {})); }
