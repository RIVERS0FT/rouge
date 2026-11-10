import type { Flag } from '../game/flags.ts';
import { FlagImage } from './Flag.tsx';
import { memo, type CSSProperties } from 'react';
import type { Player } from '../game/types.ts';
import { leaderProgress } from './commanderIdentity.ts';
import { LeaderBust } from './LeaderBust.tsx';
import { t, playerName, type Language } from './i18n.ts';

const LABELS = {
  portrait: ['领袖上半身像', 'Leader half-body portrait'],
  experience: ['统帅经验', 'Command experience'], maximum: ['已达最高等级', 'Maximum level'],
  choose: ['有天赋待选择', 'Talent choice available'], open: ['查看领袖天赋', 'View leader talents'],
} as const;
function label(language: Language, key: keyof typeof LABELS) { return LABELS[key][language === 'zh' ? 0 : 1]; }

export const FactionIdentity = memo(function FactionIdentity({ actor, language, color, flag }: { flag?:Flag; actor: number; language: Language; color:string }) {
  return <div className="faction-identity" data-testid="faction-identity" data-actor={actor}>
    <div className="faction-emblem-frame" style={{'--faction-color':color} as CSSProperties}>{flag?<FlagImage flag={flag} language={language}/>:<span className="faction-emblem" aria-hidden="true">◇</span>}</div>
  </div>;
});

export function CommanderPortrait({ player, language, color, onTalents }: { player: Player; language: Language; color: string; onTalents: () => void }) {
  const progress = leaderProgress(player), leaderName = t(language, player.leader), pending = player.choices.length > 0;
  return <aside className={`commander-portrait${pending ? ' has-talent' : ''}`} style={{ '--commander-color': color } as CSSProperties}
    data-testid="commander-portrait" data-leader={player.leader} data-actor={player.id} aria-label={`${leaderName} · ${label(language, 'portrait')}`}>
    <div className="commander-art"><LeaderBust leader={player.leader} label={`${leaderName} · ${label(language, 'portrait')}`}/></div>
    <div className="commander-rank" title={`${t(language, 'level')} ${player.level}`}><small>{t(language,'levelShort')}</small><b>{player.level}</b></div>
    <div className="commander-portrait-copy"><span className="eyebrow">{t(language, 'commander')}</span><h2 title={leaderName}>{leaderName}</h2>
      <span className="commander-player" title={playerName(language,player)}><i/>{playerName(language,player)}</span>
    </div>
    <button className="commander-talents" data-testid="portrait-talents" onClick={onTalents} title={label(language, pending ? 'choose' : 'open')}
      aria-label={label(language, pending ? 'choose' : 'open')}><span aria-hidden="true">✧</span><span>{t(language, 'talents')}</span>{pending && <b aria-hidden="true">!</b>}</button>
    <div className="commander-experience" role="progressbar" aria-label={label(language, 'experience')} aria-valuemin={0} aria-valuemax={progress.maximum}
      aria-valuenow={Math.floor(progress.value)} aria-valuetext={progress.complete ? label(language, 'maximum') : `${Math.floor(progress.value)} / ${progress.maximum}`}>
      <i style={{ width: `${progress.percent}%` }}/>
    </div>
  </aside>;
}
