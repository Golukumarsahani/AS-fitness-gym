import { useState } from 'react'; import { Link } from 'react-router-dom'; import { useLang } from '../lib/i18n';
export default function CookieBanner() {
  const { t } = useLang(); const [show, setShow] = useState(() => { try { return !localStorage.getItem('asf_cookie'); } catch { return true; } });
  if (!show) return null;
  const set = (v: string) => { try { localStorage.setItem('asf_cookie', v); } catch {} setShow(false); };
  return <div className="cookie-banner" role="dialog" aria-label={t('cookieT')}><div><b>🍪 {t('cookieT')}</b><p>{t('cookieD')} <Link to="/privacy">{t('privacy')}</Link></p></div><div className="cookie-actions"><button className="btn btn-light-border" onClick={() => set('declined')}>{t('decline')}</button><button className="btn btn-red" onClick={() => set('accepted')}>{t('accept')}</button></div></div>;
}
