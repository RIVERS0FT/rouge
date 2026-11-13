import {memo, type CSSProperties} from 'react';
import type {Flag} from '../game/flags.ts';
import type {Player} from '../game/types.ts';
import {FlagImage} from './Flag.tsx';
import {LeaderBust} from './LeaderBust.tsx';
import {leaderProgress} from './commanderIdentity.ts';
import {Icon} from './icons.tsx';
import {t, playerName, type Language} from './i18n.ts';

const LABELS = {
 portrait: ['领袖上半身像', 'Leader half-body portrait'],
 level: ['等级', 'Level'],
 choose: ['有天赋待选择', 'Talent choice available'], open: ['查看领袖天赋', 'View leader talents'],
} as const;
function label(language: Language, key: keyof typeof LABELS) {return LABELS[key][language === 'zh' ? 0 : 1];}

/** The nation's colours in a brass mount at the top-left, like a state banner. */
export const FactionIdentity = memo(function FactionIdentity({actor, language, color, flag}: {flag?: Flag; actor: number; language: Language; color: string}) {
 return <div className="faction-identity" data-testid="faction-identity" data-actor={actor}>
  <div className="faction-emblem-frame" style={{'--faction-color': color} as CSSProperties}>
   {flag ? <FlagImage flag={flag} language={language}/> : <span className="faction-emblem" aria-hidden="true">◇</span>}
  </div>
 </div>;
});

/** A framed character card: half-body art, rank medallion, name plate and a
 * whole-card talent entry. Only the player's own name is written on it. */
export function CommanderPortrait({player, language, color, onTalents}: {player: Player; language: Language; color: string; onTalents: () => void}) {
 const name = playerName(language, player), leaderName = t(language, player.leader), pending = player.choices.length > 0;
 const progress = leaderProgress(player);
 const action = `${name} · ${label(language, pending ? 'choose' : 'open')}`;
 return <aside className={`commander-portrait${pending ? ' has-talent' : ''}`} style={{'--commander-color': color, '--commander-progress': `${progress.percent}%`} as CSSProperties}
  data-testid="commander-portrait" data-leader={player.leader} data-actor={player.id} aria-label={name}>
  <div className="commander-art"><LeaderBust leader={player.leader} label={`${leaderName} · ${label(language, 'portrait')}`}/></div>
  {/* The numeral is drawn from data-level so the card's text stays the player's name alone. */}
  <div className="commander-rank" role="img" data-testid="commander-level" data-level={player.level} aria-label={`${label(language, 'level')} ${player.level}`}/>
  {pending && <span className="commander-alert" aria-hidden="true"><Icon name="laurel" size={16}/></span>}
  <div className="commander-portrait-copy"><h2 className="commander-player" title={name}>{name}</h2></div>
  <button type="button" className="commander-talents" data-testid="portrait-talents" onClick={onTalents} title={action} aria-haspopup="dialog" aria-label={action}/>
 </aside>;
}
