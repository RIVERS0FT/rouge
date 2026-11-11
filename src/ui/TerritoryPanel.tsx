import {useLayoutEffect,useRef} from 'react';
import {regionGarrison} from '../game/capacity.ts';
import {UNITS} from '../game/content.ts';
import {factionColor} from '../game/factionColors.ts';
import {MAP} from '../game/map.ts';
import {regionCapacity} from '../game/territoryEconomy.ts';
import type {Command,GameState,Kind} from '../game/types.ts';
import {t,playerName,type Language} from './i18n.ts';

type Props={
 state:GameState;selected:number;actor:number;eliminated:boolean;language:Language;mobileOpen:boolean;
 onFocus:()=>void;onManage:()=>void;onCommand:(command:Command)=>void;
};

/** One information hierarchy for desktop and both mobile orientations. */
export function TerritoryPanel({state,selected,actor,eliminated,language,mobileOpen,onFocus,onManage,onCommand}:Props){
 const panel=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{if(panel.current)panel.current.scrollTop=0;},[selected,mobileOpen]);
 const province=state.provinces[selected],player=state.players[actor],text=(key:string)=>t(language,key);
 const status=province.capture>0?'contested':province.recovery>0?'recovering':'stable';
 const productionTime=UNITS[province.kind].train;
 return <aside ref={panel} id="province-panel" aria-labelledby="province-title" className={`province-panel panel ${mobileOpen?'mobile-panel-open':''}`}>
  <header className="province-heading">
   <div className="panel-kicker"><span>{text('province')}</span><button className="icon-button" onClick={onFocus} title={text('focus')} aria-label={text('focus')}>⌖</button></div>
   <h2 id="province-title">{MAP[selected].name[language==='zh'?0:1]}</h2>
   <div className="province-meta" data-state={status}><span className="status-dot" aria-hidden="true"/>{text(status)}</div>
  </header>
  <dl className="province-summary province-owner">
   <div className="province-ownership"><dt>{text('owner')}</dt><dd><span className="faction-dot" style={{background:factionColor(province.owner)}} aria-hidden="true"/><span data-testid="province-owner-name">{province.owner<0?text('neutralOwner'):playerName(language,state.players[province.owner])}</span></dd></div>
   <div className="province-garrison"><dt>{text('garrison')}</dt><dd data-testid="region-capacity" title={text('garrisonCapacityHint')}>{regionGarrison(state,province.owner,selected)}<span> / {regionCapacity(selected)}</span></dd></div>
  </dl>
  {province.capture>0&&<section className="province-capture"><span>{text('capture')}</span><div className="progress" role="progressbar" aria-label={text('capture')} aria-valuemin={0} aria-valuemax={8} aria-valuenow={Math.min(8,province.capture)}><i style={{width:`${Math.min(100,province.capture/8*100)}%`}}/></div></section>}
  {province.owner===actor&&<section className="province-production">
   <label htmlFor="province-production-kind">{text('production')}</label>
   <select id="province-production-kind" disabled={eliminated} value={province.kind} onChange={e=>onCommand({type:'production',province:selected,kind:e.target.value as Kind})}>{player.loadout.map(kind=><option key={kind} value={kind}>{text(kind)}</option>)}</select>
   <div className="production-line"><div className="progress" role="progressbar" aria-label={text('production')} aria-valuemin={0} aria-valuemax={productionTime} aria-valuenow={Math.min(productionTime,province.production)}><i style={{width:`${Math.min(100,province.production/productionTime*100)}%`}}/></div><span>{Math.floor(province.production)} / {productionTime}{text('seconds')}</span></div>
  </section>}
  <footer className="province-actions"><button className="secondary full territory-manage-trigger" data-testid="open-territory-management" aria-haspopup="dialog" onClick={onManage}><span>{text('territories')}</span><span aria-hidden="true">›</span></button></footer>
 </aside>;
}
