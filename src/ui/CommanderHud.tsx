import type { Flag } from '../game/flags.ts';
import { FlagImage } from './Flag.tsx';
import { memo, type CSSProperties } from 'react';
import type { Player } from '../game/types.ts';
import { LeaderBust } from './LeaderBust.tsx';
import { t, playerName, type Language } from './i18n.ts';

const LABELS = {
  portrait: ['领袖上半身像', 'Leader half-body portrait'],
  level: ['等级', 'Level'],
  choose: ['有天赋待选择', 'Talent choice available'], open: ['查看领袖天赋', 'View leader talents'],
} as const;
function label(language: Language, key: keyof typeof LABELS) { return LABELS[key][language === 'zh' ? 0 : 1]; }

export const FactionIdentity = memo(function FactionIdentity({ actor, language, color, flag }: { flag?:Flag; actor: number; language: Language; color:string }) {
  return <div className="faction-identity" data-testid="faction-identity" data-actor={actor}>
    <div className="faction-emblem-frame" style={{'--faction-color':color} as CSSProperties}>{flag?<FlagImage flag={flag} language={language}/>:<span className="faction-emblem" aria-hidden="true">◇</span>}</div>
  </div>;
});

export function CommanderPortrait({ player, language, color, onTalents }: { player: Player; language: Language; color: string; onTalents: () => void }) {
  const name = playerName(language, player), leaderName = t(language, player.leader), pending = player.choices.length > 0;
  return <aside className={`commander-portrait${pending ? ' has-talent' : ''}`} style={{ '--commander-color': color } as CSSProperties}
    data-testid="commander-portrait" data-leader={player.leader} data-actor={player.id} aria-label={name}>
    <div className="commander-art"><LeaderBust leader={player.leader} label={`${leaderName} · ${label(language, 'portrait')}`}/></div>
    <div className="commander-rank" data-testid="commander-level" aria-label={`${label(language, 'level')} ${player.level}`}><span>{label(language, 'level')}</span><strong>{player.level}</strong></div>
    <div className="commander-portrait-copy"><h2 className="commander-player" title={name}>{name}</h2></div>
    <button type="button" className="commander-talents" data-testid="portrait-talents" onClick={onTalents}
      title={`${name} · ${label(language, pending ? 'choose' : 'open')}`} aria-haspopup="dialog" aria-label={`${name} · ${label(language, pending ? 'choose' : 'open')}`}/>
  </aside>;
}
