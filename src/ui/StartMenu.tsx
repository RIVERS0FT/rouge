import {useState, type CSSProperties} from 'react';
import {GameVersion} from './GameVersion.ts';
import {Icon, type IconName} from './icons.tsx';
import {t, type Language} from './i18n.ts';

export type StartAction = 'createGame' | 'setupJoin' | 'saves' | 'settings' | 'settingsSaves' | 'resumeLan';
export function storedLanguage(): Language {try {return localStorage.getItem('rouge.language') === 'en' ? 'en' : 'zh';} catch {return 'zh';}}

// The entrance plays once per page. The runtime remounts the menu when it takes over from
// the bootstrap; a remount during the entrance resumes it at the elapsed time instead of jumping.
const ENTRANCE_MS = 800;
let entranceStart: number | null = null;
function entranceElapsed(): number {
 const now = performance.now();
 if(entranceStart === null) entranceStart = now;
 return now - entranceStart;
}

/** Two-language plaque in the top-right corner of the menu and lobby. Each option keeps its own language's name. */
export function LanguageSwitch({language, onLanguage}: {language: Language; onLanguage: (language: Language) => void}) {
 return <div className="language-switch" role="group" aria-label={t(language, 'language')}>
  <button type="button" aria-pressed={language === 'zh'} onClick={() => onLanguage('zh')} aria-label="简体中文">中</button>
  <button type="button" aria-pressed={language === 'en'} onClick={() => onLanguage('en')} aria-label="English">EN</button>
 </div>;
}

/** One create action shared by the LAN client and the standalone game. */
export function StartMenu({language, onAction, resumeCode, creating = false}: {language: Language; onAction: (action: StartAction) => void; resumeCode?: string; creating?: boolean}) {
 const text = (key: string) => t(language, key), desktop = import.meta.env.MODE === 'desktop';
 const [elapsed] = useState(entranceElapsed), entrance = elapsed < ENTRANCE_MS;
 // The desktop window closes (and the app quits); a browser may keep a tab it did not open by script.
 const [exitBlocked, setExitBlocked] = useState(false);
 function exit() {window.close(); setTimeout(() => setExitBlocked(true), 300);}
 const entry = (icon: IconName, label: string, onward = true) => <>
  <span className="menu-medallion" aria-hidden="true"><Icon name={icon} size={19}/></span>
  <span className="menu-label">{text(label)}</span>
  {onward && <Icon name="forward" size={18}/>}
 </>;
 return <main className="main-menu" data-entrance={entrance || undefined}
  style={entrance ? {'--entrance-offset': `${-Math.round(elapsed)}ms`} as CSSProperties : undefined}><section className="menu-content">
  <div className="menu-crest" aria-hidden="true"><span/><i/><span/></div>
  <h1>{text('title')}</h1>
  <div className="menu-rule" aria-hidden="true"/>
  <nav className="menu-actions">
   <button type="button" className="primary large" onClick={() => onAction('createGame')} data-testid="single-player" disabled={creating} aria-busy={creating}>{entry('sabres', creating ? 'creatingRoom' : 'createGame')}</button>
   <button type="button" className="menu-button" data-testid="join-game" aria-haspopup="dialog" disabled={desktop || creating}
    title={desktop ? text('desktopSoloOnly') : undefined} onClick={() => onAction('setupJoin')}>{entry('march', 'joinGame')}</button>
   {resumeCode && <button type="button" className="quiet menu-resume" data-testid="resume-lan" disabled={creating} onClick={() => onAction('resumeLan')}><Icon name="march" size={16}/>{text('resumeLan')} · {resumeCode}</button>}
   <button type="button" className="menu-button" onClick={() => onAction('saves')} data-testid="open-saves" disabled={creating} aria-haspopup="dialog">{entry('archive', 'saves')}</button>
   <button type="button" className="menu-button" data-testid="home-settings" disabled={creating} onClick={() => onAction('settings')} aria-haspopup="dialog">{entry('gear', 'settings')}</button>
   <button type="button" className="menu-button menu-exit" data-testid="exit-game" onClick={exit}>{entry('exit', 'exitGame', false)}</button>
   {exitBlocked && <small className="menu-note" role="status">{text('exitBlocked')}</small>}
  </nav>
  <GameVersion className="menu-version" testId="start-menu-version"/>
 </section></main>;
}
