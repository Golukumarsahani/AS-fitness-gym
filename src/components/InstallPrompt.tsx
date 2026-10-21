import { useEffect, useState } from 'react'; import { Download, X } from 'lucide-react'; import { useLang } from '../lib/i18n'; import { useAppMode, useInstall } from '../lib/pwa'; import { useSiteContent } from '../lib/content'; import Logo from './Logo';
export const apkLink = (c: any) => (/^https:\/\//i.test(c?.apk_url || '') ? c.apk_url : '');
export default function InstallPrompt() {
  const { t } = useLang(); const app = useAppMode(); const ins = useInstall(); const c = useSiteContent(); const [show, setShow] = useState(false);
  useEffect(() => { if (app) return; let d = 0; try { d = Number(localStorage.getItem('asf_install_dismiss') || 0); } catch {} if (Date.now() - d < 3 * 864e5) return; const id = setTimeout(() => setShow(true), 2500); return () => clearTimeout(id); }, [app]);
  const apk = apkLink(c);
  if (app || !show || c.install_popup_enabled === false || (!ins.canInstall && !ins.ios && !apk)) return null;
  const close = () => { try { localStorage.setItem('asf_install_dismiss', String(Date.now())); } catch {} setShow(false); };
  return <div className="install-popup" role="dialog" aria-label={t('instT')}><button className="install-x" onClick={close} aria-label="Close"><X size={18} /></button><div className="install-head"><Logo size={46} src={c.logo_image} /><div><b>{t('instT')}</b><p>{t('instD')}</p></div></div>{ins.ios && !ins.canInstall && <small className="muted">{t('iosSteps')}</small>}<div className="install-actions"><button className="btn btn-light-border" onClick={close}>{t('later')}</button>{ins.canInstall && <button className="btn btn-red" onClick={async () => { await ins.install(); close(); }}><Download size={16} /> {t('installApp')}</button>}{apk && <a className={ins.canInstall ? 'btn btn-light-border' : 'btn btn-red'} href={apk} rel="noopener noreferrer"><Download size={16} /> {t('apkBtn')}</a>}</div></div>;
}
