import {VERSION} from '../../game/content.ts';
import {Icon} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';

/** The pause-menu page of settings: language, archives entry, resume and leave.
 * A solo campaign is paused while it is open; a LAN match keeps running. */
export function SettingsGeneral({language, inGame, solo, onLanguage, onSaves, onResume, onLeave}: {
 language: Language; inGame: boolean; solo: boolean; onLanguage: (language: Language) => void; onSaves: () => void; onResume: () => void; onLeave: () => void;
}) {
 const text = (key: string) => t(language, key), savesDisabled = inGame && !solo;
 return <>
  {inGame && <p className="settings-status muted"><Icon name="hourglass" size={14}/>{text(solo ? 'settingsSoloPaused' : 'settingsLanRunning')}</p>}
  <section className="settings-language">
   <h3>{text('language')}</h3>
   <div className="settings-language-options">
    <button type="button" aria-label="简体中文" aria-pressed={language === 'zh'} onClick={() => onLanguage('zh')}>简体中文</button>
    <button type="button" aria-label="English" aria-pressed={language === 'en'} onClick={() => onLanguage('en')}>English</button>
   </div>
  </section>
  <div className="settings-actions">
   <button type="button" className="primary full" data-testid="settings-resume" onClick={onResume}>{text(inGame ? 'returnGame' : 'returnMenu')}<span aria-hidden="true">→</span></button>
   <button type="button" className="settings-save" data-testid="settings-save" onClick={onSaves} disabled={savesDisabled}>
    <span aria-hidden="true"><Icon name="archive" size={22}/></span>
    <div><strong>{text(inGame ? 'save' : 'saves')}</strong>{savesDisabled && <small>{text('settingsLanSaveUnavailable')}</small>}</div>
    <span aria-hidden="true">›</span>
   </button>
   {inGame && <button type="button" className="quiet settings-leave" onClick={onLeave}>{text('returnMenu')}</button>}
  </div>
  <small className="settings-version" data-testid="game-version">v{VERSION}</small>
 </>;
}
