import {GameVersion} from '../GameVersion.ts';
import {Icon} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';

/** The pause-menu page of settings: language, archives entry, then leave and resume.
 * A solo campaign is paused while it is open; a LAN match keeps running. */
export function SettingsGeneral({language, inGame, solo, onLanguage, onSaves, onResume, onLeave}: {
 language: Language; inGame: boolean; solo: boolean; onLanguage: (language: Language) => void; onSaves: () => void; onResume: () => void; onLeave: () => void;
}) {
 const text = (key: string) => t(language, key), savesDisabled = inGame && !solo;
 return <>
  {inGame && <p className="settings-status" data-state={solo ? 'paused' : 'live'}>
   <span className="settings-status-mark" aria-hidden="true"><Icon name="hourglass" size={14}/></span>{text(solo ? 'settingsSoloPaused' : 'settingsLanRunning')}
  </p>}
  <section className="settings-language" aria-labelledby="settings-language-title">
   <h3 id="settings-language-title"><Icon name="globe" size={18}/>{text('language')}</h3>
   <div className="settings-language-options" role="group" aria-labelledby="settings-language-title">
    <button type="button" aria-label="简体中文" aria-pressed={language === 'zh'} onClick={() => onLanguage('zh')}>简体中文</button>
    <button type="button" aria-label="English" aria-pressed={language === 'en'} onClick={() => onLanguage('en')}>English</button>
   </div>
  </section>
  <button type="button" className="settings-save" data-testid="settings-save" onClick={onSaves} disabled={savesDisabled}>
   <span className="settings-medallion" aria-hidden="true"><Icon name="archive" size={20}/></span>
   <div><strong>{text(inGame ? 'save' : 'saves')}</strong>{savesDisabled && <small>{text('settingsLanSaveUnavailable')}</small>}</div>
   <Icon name="forward" size={18}/>
  </button>
  <div className="settings-footer">
   {inGame && <button type="button" className="secondary settings-leave" onClick={onLeave}><Icon name="back" size={16}/>{text('returnMenu')}</button>}
   <button type="button" className="primary settings-resume" data-testid="settings-resume" onClick={onResume}>{text(inGame ? 'returnGame' : 'returnMenu')}<Icon name="forward" size={18}/></button>
  </div>
  <GameVersion className="settings-version" testId="game-version"/>
 </>;
}
