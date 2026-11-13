import {forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import {factionColor} from '../../game/factionColors.ts';
import {searchProvinces} from '../../game/map.ts';
import type {GameState} from '../../game/types.ts';
import {Icon} from '../icons.tsx';
import {t, playerName, type Language} from '../i18n.ts';

/** Region finder: matches localized names and source codes, shows the current
 * owner of each hit and jumps the camera on selection. */
export interface MapSearchHandle {open: () => void}
export const MapSearch = forwardRef<MapSearchHandle, {state: GameState; language: Language; onPick: (id: number) => void; enabled?: boolean}>(function MapSearch({state, language, onPick, enabled = true}, ref) {
 const [query, setQuery] = useState(''), [open, setOpen] = useState(false);
 const container = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
 const results = useMemo(() => query.trim() ? searchProvinces(query) : [], [query]);
 const text = (key: string) => t(language, key);
 const show = useCallback(() => {if(enabled) {setOpen(true); input.current?.focus({preventScroll: true});}}, [enabled]);
 useImperativeHandle(ref, () => ({open: show}), [show]);
 const close = useCallback((restoreFocus = false) => {
  if(restoreFocus && container.current?.contains(document.activeElement)) document.querySelector<HTMLElement>('.world canvas')?.focus({preventScroll: true});
  setOpen(false); setQuery('');
 }, []);
 useEffect(() => {if(!enabled) close();}, [enabled, close]);
 useEffect(() => {if(open && enabled) input.current?.focus({preventScroll: true});}, [open, enabled]);
 useEffect(() => {
  if(!enabled) return;
  const key = (event: KeyboardEvent) => {
   if(event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
   if(event.key === 'Escape' && open) {event.preventDefault(); event.stopPropagation(); close(true); return;}
   const target = event.target;
   if(target instanceof HTMLElement && (target.isContentEditable || target.closest('input,textarea,select,[contenteditable]'))) return;
   if(event.code === 'KeyF' || event.key.toLowerCase() === 'f') {event.preventDefault(); show();}
  };
  window.addEventListener('keydown', key, true);
  return () => window.removeEventListener('keydown', key, true);
 }, [enabled, open, close, show]);
 useEffect(() => {
  if(!open || !enabled) return;
  const outside = (event: PointerEvent) => {if(event.target instanceof Node && !container.current?.contains(event.target)) close();};
  document.addEventListener('pointerdown', outside, true);
  return () => document.removeEventListener('pointerdown', outside, true);
 }, [open, enabled, close]);
 if(!open || !enabled) return null;
 const pick = (id: number) => {onPick(id); close(true);};
 return <div ref={container} className="map-search" role="search" aria-label={text('mapSearch')}>
  <span className="map-search-icon" aria-hidden="true"><Icon name="search" size={18}/></span>
  <input ref={input} data-testid="map-search" aria-label={text('mapSearch')} aria-keyshortcuts="F" placeholder={text('mapSearch')} value={query}
   onChange={event => setQuery(event.target.value)} onKeyDown={event => {if(event.key === 'Enter' && !event.nativeEvent.isComposing && results[0]) {event.preventDefault(); pick(results[0].id);}}}/>
  {query.trim().length > 0 && <div className="map-search-results">{results.map(province => {
   const owner = state.provinces[province.id]?.owner ?? -1;
   return <button type="button" key={province.id} onClick={() => pick(province.id)}>
    <span className="faction-dot" style={{background: factionColor(owner)}} aria-hidden="true"/>
    <b>{province.name[language === 'zh' ? 0 : 1]}</b>
    <small>{owner < 0 ? text('neutralOwner') : playerName(language, state.players[owner])}</small>
   </button>;
  })}</div>}
 </div>;
});
