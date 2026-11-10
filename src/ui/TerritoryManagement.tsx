import {useEffect,useMemo,useState} from 'react';
import {MAP,TERRITORY_TOPOLOGY} from '../game/map.ts';
import type {TerritoryGrouping} from '../game/territoryGrouping.ts';
import type {Command,GameState} from '../game/types.ts';
import {t,type Language} from './i18n.ts';
const atomIndex=new Map(MAP.map(p=>[p.code,p.id]));
export function TerritoryManagement({state,grouping,selected,actor,eliminated,language,onCommand}:{state:GameState;grouping:TerritoryGrouping;selected:number;actor:number;eliminated:boolean;language:Language;onCommand:(command:Command)=>void}){
 const text=(key:string)=>t(language,key),code=MAP[selected]?.code,groupId=grouping.atomToGroup[code];
 const groups=useMemo(()=>new Map(grouping.groups.map(g=>[g.id,g])),[grouping]);
 const group=groups.get(groupId),[merge,setMerge]=useState<string[]>([]),[split,setSplit]=useState<string[]>([]);
 useEffect(()=>{setMerge([]);setSplit([]);},[groupId,grouping.revision]);
 const owned=(atoms:readonly string[])=>atoms.every(id=>{const i=atomIndex.get(id);return i!==undefined&&MAP[i].playable&&state.provinces[i]?.owner===actor;});
 const editable=Boolean(group&&owned(group.atoms)&&!eliminated&&state.winner===null);
 const neighbors=useMemo(()=>{
  const ids=new Set<string>();for(const atom of group?.atoms??[]){const i=atomIndex.get(atom);if(i===undefined)continue;for(const neighbor of TERRITORY_TOPOLOGY.atoms[i].neighbors){const id=grouping.atomToGroup[neighbor];if(id&&id!==groupId)ids.add(id);}}
  return [...ids].sort().map(id=>groups.get(id)).filter((g):g is NonNullable<typeof g>=>Boolean(g));
 },[group,groupId,grouping,groups]);
 const eligible=neighbors.filter(g=>owned(g.atoms)),eligibleIds=new Set(eligible.map(g=>g.id));
 const canMerge=editable&&merge.length>0&&merge.every(id=>eligibleIds.has(id));
 const canSplit=editable&&split.length>0&&split.length<(group?.atoms.length??0)&&split.every(id=>group?.atoms.includes(id));
 const name=(id:string)=>{const i=atomIndex.get(id);return i===undefined?id:MAP[i].name[language==='zh'?0:1];};
 const toggle=(ids:string[],id:string)=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
 return <section className="territory-management" data-testid="territory-management" data-revision={grouping.revision}>
  {!group?<p role="status">{text('territoryUnavailable')}</p>:<>
   <h3>{text('territoryCurrentGroup')} · {name(group.atoms[0])}</h3>
   {!editable&&<p role="status">{text(eliminated?'error.eliminated':'territoryReadOnly')}</p>}
   <fieldset disabled={!editable}><legend>{text('territoryAtoms')} ({group.atoms.length})</legend>
    <div className="territory-atom-list" data-testid="territory-atom-list">{group.atoms.map(id=><label key={id}><input type="checkbox" data-testid="territory-split-atom" value={id} checked={split.includes(id)} onChange={()=>setSplit(toggle(split,id))}/><span>{name(id)}</span></label>)}</div>
    <button className="secondary" data-testid="split-territory-group" disabled={!canSplit} onClick={()=>{if(canSplit)onCommand({type:'splitGroup',group:group.id,atoms:[...split].sort(),expectedRevision:grouping.revision});}}>{text('territorySplit')} ({split.length}/{group.atoms.length})</button>
   </fieldset>
   <fieldset disabled={!editable}><legend>{text('territoryNeighborGroups')}</legend>
    {!eligible.length&&<p>{text('territoryNoNeighbors')}</p>}
    <div className="territory-neighbor-list">{eligible.map(g=><div className="territory-neighbor" key={g.id}><label><input type="checkbox" data-testid="territory-merge-neighbor" value={g.id} checked={merge.includes(g.id)} onChange={()=>setMerge(toggle(merge,g.id))}/><span>{name(g.atoms[0])} · {g.atoms.length} {text('territoryAtomCount')}</span></label><details><summary>{text('territoryAllNames')}</summary><ul>{g.atoms.map(id=><li key={id}>{name(id)} </li>)}</ul></details></div>)}</div>
    <button className="primary" data-testid="merge-territory-groups" disabled={!canMerge} onClick={()=>{if(canMerge)onCommand({type:'mergeGroups',groups:[group.id,...merge].sort(),expectedRevision:grouping.revision});}}>{text('territoryMerge')} ({merge.length+1})</button>
   </fieldset>
  </>}
 </section>;
}
