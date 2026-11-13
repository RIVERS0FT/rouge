import {t, type Language} from './i18n.ts';

export type StartAction = 'setupSolo' | 'setupLan' | 'saves' | 'settings' | 'settingsSaves' | 'resumeLan';
export function storedLanguage(): Language {try {return localStorage.getItem('rouge.language') === 'en' ? 'en' : 'zh';} catch {return 'zh';}}

/** Left-aligned title column over the living atlas, with brass-framed plaques. */
export function StartMenu({language, onAction, resumeCode}: {language: Language; onAction: (action: StartAction) => void; resumeCode?: string}) {
 const text = (key: string) => t(language, key);
 return <main className="main-menu"><section className="menu-content">
  <div className="menu-crest" aria-hidden="true"><span/><i/><span/></div>
  <h1>{text('title')}</h1>
  <div className="menu-rule" aria-hidden="true"/>
  <nav className="menu-actions">
   <button type="button" className="primary large" onClick={() => onAction('setupSolo')} data-testid="single-player"><span>01</span>{text('single')}<b>↗</b></button>
   <button type="button" className="menu-button" data-testid="multiplayer" onClick={() => onAction('setupLan')}><span>02</span>{text('multiplayer')}<b>→</b></button>
   <button type="button" className="menu-button" onClick={() => onAction('saves')} data-testid="open-saves"><span>03</span>{text('saves')}<b>→</b></button>
   <button type="button" className="menu-button" data-testid="home-settings" onClick={() => onAction('settings')} aria-haspopup="dialog"><span>04</span>{text('settings')}<b>⚙</b></button>
   {resumeCode && <button type="button" className="quiet" data-testid="resume-lan" onClick={() => onAction('resumeLan')}>{text('resumeLan')} · {resumeCode}</button>}
  </nav>
 </section></main>;
}
