import {useRef} from 'react';
import type {SaveInfo} from '../../game/save.ts';
import {Icon} from '../icons.tsx';
import {t, timeLabel, type Language} from '../i18n.ts';

/** Campaign archives: local slots with load / overwrite / delete, a new-save
 * row for the running solo campaign, and JSON import / export. */
export function SavesView({saves, language, canSave, canExport, saveName, onSaveName, onCreate, onLoad, onOverwrite, onDelete, onExport, onImport}: {
 saves: SaveInfo[]; language: Language; canSave: boolean; canExport: boolean; saveName: string; onSaveName: (name: string) => void;
 onCreate: () => void; onLoad: (id: string) => void; onOverwrite: (save: SaveInfo) => void; onDelete: (id: string) => void;
 onExport: () => void; onImport: (file: File | undefined) => void;
}) {
 const text = (key: string) => t(language, key), file = useRef<HTMLInputElement>(null);
 return <div className="saves-view">
  <p className="muted saves-hint">{text('saveHint')}</p>
  {canSave && <div className="new-save">
   <input placeholder={text('saveName')} value={saveName} onChange={event => onSaveName(event.target.value)} maxLength={64}/>
   <button type="button" className="primary" data-testid="create-save" onClick={onCreate}>{text('newSave')}</button>
  </div>}
  <div className="save-list">{saves.length ? saves.map(save => <article key={save.id} className="save-card" data-corrupt={save.corrupted}>
   <div className="save-icon" aria-hidden="true"><Icon name="archive" size={22}/></div>
   <div className="save-description">
    <h3>{save.name}</h3>
    <small>{save.corrupted ? text('corrupt') : `${text(save.leader)} · ${timeLabel(save.tick)} · ${new Date(save.savedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}`}</small>
   </div>
   <div className="save-actions">
    <button type="button" className="secondary" onClick={() => onLoad(save.id)}>{text('load')}</button>
    {canSave && <button type="button" className="quiet" onClick={() => onOverwrite(save)}>{text('overwrite')}</button>}
    <button type="button" className="quiet danger" onClick={() => onDelete(save.id)}>{text('delete')}</button>
   </div>
  </article>) : <div className="empty-state">{text('emptySaves')}</div>}</div>
  <div className="row saves-io">
   {canExport && <button type="button" className="secondary" onClick={onExport}>{text('export')} ↗</button>}
   <button type="button" className="secondary" onClick={() => file.current?.click()}>{text('import')}</button>
   <input hidden type="file" accept="application/json,.json" ref={file} onChange={event => {onImport(event.target.files?.[0]); event.target.value = '';}}/>
  </div>
 </div>;
}
