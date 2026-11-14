import {Icon, type IconName} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';
import {Tip, TipNote, TipTitle} from '../Tooltip.tsx';

export type Dock = 'region' | 'military' | 'nations';

type RailItem = {
 key: string; icon: IconName; label: string; testId: string; hint?: string;
 expanded?: boolean; controls?: string; popup?: boolean; disabled?: boolean; badge?: number; onClick: () => void;
};

/**
 * The left command rail uses the same controls across screen sizes. The
 * compact layout lets it scroll vertically if it cannot show all buttons.
 */
export function CommandRail({language, dock, outlinerOpen, hasRegion, pendingTalents, onDock, onTalents, onOutliner}: {
 language: Language; dock: Dock | null; outlinerOpen: boolean; hasRegion: boolean; pendingTalents: number;
 onDock: (dock: Dock) => void; onTalents: () => void; onOutliner: () => void;
}) {
 const text = (key: string) => t(language, key);
 const items: RailItem[] = [
  {key: 'region', icon: 'region', label: text('railRegion'), testId: 'toggle-province-panel', hint: text('province'),
   expanded: hasRegion && dock === 'region', controls: hasRegion ? 'province-panel' : undefined, disabled: !hasRegion, onClick: () => onDock('region')},
  {key: 'outliner', icon: 'scroll', label: text('railOutliner'), testId: 'toggle-strategic-panel', hint: text('outliner'),
   expanded: outlinerOpen, controls: 'strategic-panel', onClick: onOutliner},
  {key: 'military', icon: 'military', label: text('railMilitary'), testId: 'open-upgrades', hint: text('upgrades'),
   expanded: dock === 'military', controls: dock === 'military' ? 'military-panel' : undefined, onClick: () => onDock('military')},
  {key: 'nations', icon: 'globe', label: text('railNations'), testId: 'open-nations', hint: text('nationsTitle'),
   expanded: dock === 'nations', controls: dock === 'nations' ? 'nations-panel' : undefined, onClick: () => onDock('nations')},
  {key: 'talents', icon: 'laurel', label: text('railTalents'), testId: 'mobile-talents', hint: text('talents'),
   popup: true, badge: pendingTalents, onClick: onTalents},
 ];
 return <nav className="hud-rail" aria-label={text('commandRail')}>
  {items.map(item => <Tip key={item.key} className="rail-slot" placement="right" content={<><TipTitle>{item.hint}</TipTitle>{item.badge ? <TipNote>{text('talentAvailable')}</TipNote> : null}</>}>
   <button type="button" className="rail-button" data-rail={item.key} data-testid={item.testId} disabled={item.disabled}
    aria-expanded={item.expanded === undefined ? undefined : item.expanded} aria-controls={item.controls}
    aria-haspopup={item.popup ? 'dialog' : undefined} onClick={item.onClick}>
    <span className="rail-medallion"><Icon name={item.icon} size={22}/>{item.badge ? <b className="rail-badge" aria-hidden="true">{item.badge}</b> : null}</span>
    <span className="rail-label">{item.label}</span>
   </button>
  </Tip>)}
 </nav>;
}
