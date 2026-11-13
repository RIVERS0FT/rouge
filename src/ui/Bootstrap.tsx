import {useEffect, useRef, useState} from 'react';
import {SettingsGeneral} from './dialogs/SettingsDialog.tsx';
import {Icon} from './icons.tsx';
import {ModalDialog} from './ModalDialog.tsx';
import {StartMenu, storedLanguage, type StartAction} from './StartMenu.tsx';
import {t, type Language} from './i18n.ts';
import type {App} from './App.tsx';

/** The first graph contains the menu only, never the map, simulation or Three.js.
 * Two animation frames give the menu a paint before downloading the game graph. */
export function Bootstrap() {
 const [language, setLanguage] = useState<Language>(storedLanguage), [action, setAction] = useState<StartAction | null>(null);
 const [Runtime, setRuntime] = useState<typeof App | null>(null), [failed, setFailed] = useState(false);
 const focusReturn = useRef<string | null>(null);
 const [resumeCode] = useState(() => {
  try {const ticket = JSON.parse(sessionStorage.getItem('rouge.ticket.ne-admin1-groups.v1') ?? 'null'); return typeof ticket?.code === 'string' ? ticket.code : undefined;}
  catch {return undefined;}
 });
 const text = (key: string) => t(language, key);
 useEffect(() => {document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; document.title = text('title'); try {localStorage.setItem('rouge.language', language);} catch {/* optional */}}, [language]);
 useEffect(() => {
  let active = true, second = 0;
  const first = requestAnimationFrame(() => {second = requestAnimationFrame(() => {
   void import('./App.tsx').then(module => {if(active) setRuntime(() => module.App);}).catch(() => {if(active) setFailed(true);});
  });});
  return () => {active = false; cancelAnimationFrame(first); cancelAnimationFrame(second);};
 }, []);
 function open(next: StartAction) {focusReturn.current = (document.activeElement as HTMLElement | null)?.dataset.testid ?? null; setAction(next);}
 function close() {setAction(current => current === 'settingsSaves' ? 'settings' : null);}
 useEffect(() => {
  const key = (event: KeyboardEvent) => {if(!Runtime && event.key === 'Escape' && action) {event.preventDefault(); close();}};
  window.addEventListener('keydown', key);
  return () => window.removeEventListener('keydown', key);
 }, [action, Runtime]);
 if(Runtime) return <Runtime initialAction={action} initialFocus={focusReturn.current} initialLanguage={language}/>;
 const settings = action === 'settings';
 return <div className="app is-menu is-loading" data-resource-state={failed ? 'failed' : 'loading'}>
  <div className="menu-placeholder" aria-hidden="true"/><div className="map-vignette"/>
  <div className="language-switch">
   <button type="button" className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')} aria-label="简体中文">中</button><span>/</span>
   <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')} aria-label="English">EN</button>
  </div>
  <StartMenu language={language} onAction={open} resumeCode={resumeCode}/>
  <div className="resource-status" role="status" data-testid="resource-status">
   {!failed && <span className="resource-spinner" aria-hidden="true"><Icon name="hourglass" size={14}/></span>}
   {text(failed ? 'resourceFailed' : 'backgroundLoading')}
   {failed && <button type="button" className="secondary" data-testid="reload-resources" onClick={() => location.reload()}>{text('reloadResources')}</button>}
  </div>
  {action && <ModalDialog className={settings ? 'settings-modal' : 'starting-modal'} label={text(settings ? 'settings' : 'loadingResources')} closeLabel={text('close')}
   onClose={close} pageKey={action} title={settings ? text('settings') : undefined}>
   {settings
    ? <SettingsGeneral language={language} inGame={false} solo onLanguage={setLanguage} onSaves={() => setAction('settingsSaves')} onResume={close} onLeave={close}/>
    : <><p role="status" data-testid="resource-loading"><Icon name="hourglass" size={18}/>{text(failed ? 'resourceFailed' : 'loadingResources')}</p>
     {failed && <button type="button" className="primary" onClick={() => location.reload()}>{text('reloadResources')}</button>}</>}
  </ModalDialog>}
 </div>;
}
