import {useMemo, useState} from 'react';
import {factionColor} from '../../game/factionColors.ts';
import {searchProvinces} from '../../game/map.ts';
import type {GameState} from '../../game/types.ts';
import {Icon} from '../icons.tsx';
import {t, playerName, type Language} from '../i18n.ts';

/** Region finder: matches localized names and source codes, shows the current
 * owner of each hit and jumps the camera on selection. */
export function MapSearch({state, language, onPick}: {state: GameState; language: Language; onPick: (id: number) => void}) {
 const [query, setQuery] = useState('');
 const results = useMemo(() => query.trim() ? searchProvinces(query) : [], [query]);
 const text = (key: string) => t(language, key);
 return <div className="map-search" role="search">
  <span className="map-search-icon" aria-hidden="true"><Icon name="search" size={18}/></span>
  <input data-testid="map-search" aria-label={text('mapSearch')} placeholder={text('mapSearch')} value={query}
   onChange={event => setQuery(event.target.value)} onKeyDown={event => {if(event.key === 'Enter' && results[0]) {onPick(results[0].id); setQuery('');}}}/>
  {query.trim().length > 0 && <div className="map-search-results">{results.map(province => {
   const owner = state.provinces[province.id]?.owner ?? -1;
   return <button type="button" key={province.id} onClick={() => {onPick(province.id); setQuery('');}}>
    <span className="faction-dot" style={{background: factionColor(owner)}} aria-hidden="true"/>
    <b>{province.name[language === 'zh' ? 0 : 1]}</b>
    <small>{owner < 0 ? text('neutralOwner') : playerName(language, state.players[owner])}</small>
   </button>;
  })}</div>}
 </div>;
}
