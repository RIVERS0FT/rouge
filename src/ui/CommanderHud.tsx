import { memo, type CSSProperties } from 'react';
import type { Player } from '../game/types.ts';
import { commanderIdentity, FLAG_SPECS, isFlagCode, leaderProgress } from './commanderIdentity.ts';
import { LeaderBust } from './LeaderBust.tsx';
import { t, type Language } from './i18n.ts';

const LABELS = {
  flag: ['国旗', 'National flag'], homeland: ['初始地区', 'Starting homeland'],
  identity: ['本方势力', 'Your faction'], portrait: ['领袖上半身像', 'Leader half-body portrait'],
  experience: ['统帅经验', 'Command experience'], maximum: ['已达最高等级', 'Maximum level'],
  choose: ['有天赋待选择', 'Talent choice available'], open: ['查看领袖天赋', 'View leader talents'],
} as const;
function label(language: Language, key: keyof typeof LABELS) { return LABELS[key][language === 'zh' ? 0 : 1]; }

export const CountryFlag = memo(function CountryFlag({ country, name, language }: { country: string; name: string; language: Language }) {
  const spec = isFlagCode(country) ? FLAG_SPECS[country] : null;
  const accessibleName = `${name} · ${label(language, 'flag')}`;
  return <svg className="country-flag" viewBox={`0 0 ${spec?.width ?? 5} ${spec?.height ?? 3}`} role="img" aria-label={accessibleName} data-testid="country-flag" data-country={country || 'unknown'} focusable="false">
    <title>{accessibleName}</title>
    {spec ? spec.colors.map((color, i) => <rect key={color}
      x={spec.axis === 'vertical' ? i * spec.width / spec.colors.length : 0}
      y={spec.axis === 'horizontal' ? i * spec.height / spec.colors.length : 0}
      width={spec.axis === 'vertical' ? spec.width / spec.colors.length : spec.width}
      height={spec.axis === 'horizontal' ? spec.height / spec.colors.length : spec.height}
      fill={color}/>) : <><rect width="5" height="3" fill="#30434a"/><path d="M2 1.5h1" stroke="#d3c5a0" strokeWidth=".12"/></>}
  </svg>;
});

export const CountryIdentity = memo(function CountryIdentity({ actor, language }: { actor: number; language: Language }) {
  const identity = commanderIdentity(actor), name = identity.names[language === 'zh' ? 0 : 1];
  return <div className="country-identity" data-testid="country-identity" data-actor={actor} title={`${label(language, 'homeland')} · ${name}`}>
    <div className="country-flag-frame"><CountryFlag country={identity.country} name={name} language={language}/></div>
    <div className="country-copy"><small>{label(language, 'identity')}</small><b>{name}</b></div>
  </div>;
});

export function CommanderPortrait({ player, language, color, onTalents }: { player: Player; language: Language; color: string; onTalents: () => void }) {
  const progress = leaderProgress(player), leaderName = t(language, player.leader), pending = player.choices.length > 0;
  return <aside className={`commander-portrait${pending ? ' has-talent' : ''}`} style={{ '--commander-color': color } as CSSProperties}
    data-testid="commander-portrait" data-leader={player.leader} data-actor={player.id} aria-label={`${leaderName} · ${label(language, 'portrait')}`}>
    <div className="commander-art"><LeaderBust leader={player.leader} label={`${leaderName} · ${label(language, 'portrait')}`}/></div>
    <div className="commander-rank" title={`${t(language, 'level')} ${player.level}`}><small>LV</small><b>{player.level}</b></div>
    <div className="commander-portrait-copy"><span className="eyebrow">{t(language, 'commander')}</span><h2>{leaderName}</h2>
      <span className="commander-player" title={player.name}><i/>{player.name}</span>
    </div>
    <button className="commander-talents" data-testid="portrait-talents" onClick={onTalents} title={label(language, pending ? 'choose' : 'open')}
      aria-label={label(language, pending ? 'choose' : 'open')}><span aria-hidden="true">✧</span><span>{t(language, 'talents')}</span>{pending && <b aria-hidden="true">!</b>}</button>
    <div className="commander-experience" role="progressbar" aria-label={label(language, 'experience')} aria-valuemin={0} aria-valuemax={progress.maximum}
      aria-valuenow={Math.floor(progress.value)} aria-valuetext={progress.complete ? label(language, 'maximum') : `${Math.floor(progress.value)} / ${progress.maximum}`}>
      <i style={{ width: `${progress.percent}%` }}/>
    </div>
  </aside>;
}
