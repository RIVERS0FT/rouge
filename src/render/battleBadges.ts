import {factionFlags} from '../game/factionFlags.ts';
import {staticPlaqueFlag} from './provincePlaqueFlag.ts';
import type {Player} from '../game/types.ts';
import type {BattleView} from './armyViews.ts';
import type {Flag} from '../game/flags.ts';

type Side={node:HTMLSpanElement;flag:HTMLImageElement;flagArt?:Flag;count:HTMLSpanElement};
type Entry={node:HTMLDivElement;sides:Side[];power:HTMLSpanElement;segments:HTMLElement[];x:number;y:number;battle:BattleView};
type Position={x:number;y:number};
const swordSvg='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7.3 15.6 8.5-9.3L21 3l-3 5.6-8.5 9.3m-5.4-4.1 7.3 6.4m-3.6-2.2-3.5 3.5M16.7 15.6 8.2 6.3 3 3l3 5.6 8.5 9.3m5.4-4.1-7.3 6.4m3.6-2.2 3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MAX_VISIBLE=35,MAX_SIDES=4;

/** One badge per regional battle: crossed swords, then each side's flag and troops there,
 * over a thin bar of each side's share of the fighting strength (see game/strength.ts).
 * Three or more countries fighting in one region share a single badge. */
export class BattleBadges {
 private readonly layer=document.createElement('div');
 private entries=new Map<string,Entry>();
 private flags=new WeakMap<Flag,string>();
 constructor(host:HTMLElement){
  this.layer.className='battle-badge-layer';host.append(this.layer);
 }
 private make(battle:BattleView):Entry{
  const node=document.createElement('div'),swords=document.createElement('span');
  node.className='battle-badge';node.dataset.testid='battle-badge';
  swords.className='battle-swords';swords.innerHTML=swordSvg;node.append(swords);this.layer.append(node);
  const power=document.createElement('span');power.className='battle-power';power.hidden=true;power.dataset.testid='battle-power';node.append(power);
  return {node,sides:[],power,segments:[],x:0,y:0,battle};
 }
 private side(entry:Entry,index:number):Side{
  let side=entry.sides[index];if(side)return side;
  const node=document.createElement('span'),flag=document.createElement('img'),count=document.createElement('span');
  node.className='battle-side';flag.className='battle-flag';flag.alt='';flag.draggable=false;count.className='battle-count';
  node.append(flag,count);entry.node.insertBefore(node,entry.power);side={node,flag,count};entry.sides[index]=side;return side;
 }
 /** `power`: battle id → side owner → strength; without it the bars stay hidden. */
 draw(battles:readonly BattleView[],players:readonly Player[],actor:number,project:(battle:BattleView)=>Position|null,color:(owner:number)=>string,power?:ReadonlyMap<number,ReadonlyMap<number,number>>){
  const flags=factionFlags(players),seen=new Set<string>();
  const visible=battles.flatMap(battle=>{const at=project(battle);return at?[{battle,at}]:[];});
  const involved=(battle:BattleView)=>Number(battle.sides.some(side=>side.owner===actor));
  const total=(battle:BattleView)=>battle.sides.reduce((sum,side)=>sum+side.count,0);
  visible.sort((a,b)=>involved(b.battle)-involved(a.battle)||total(b.battle)-total(a.battle)||a.battle.id-b.battle.id);
  const shown:Position[]=[];
  for(const {battle,at} of visible){
   if(shown.length>=MAX_VISIBLE)break;
   if(shown.some(p=>Math.abs(at.x-p.x)<90&&Math.abs(at.y-p.y)<29))continue;
   shown.push(at);seen.add(battle.key);
   let e=this.entries.get(battle.key);if(!e){e=this.make(battle);this.entries.set(battle.key,e);}
   e.x=at.x;e.y=at.y;e.battle=battle;
   const sides=battle.sides.slice(0,MAX_SIDES);
   sides.forEach((entry,index)=>{
    const side=this.side(e!,index),flag=flags[entry.owner],count=String(entry.count);
    if(side.node.hidden)side.node.hidden=false;
    if(side.node.dataset.owner!==String(entry.owner)){side.node.dataset.owner=String(entry.owner);side.node.style.setProperty('--side-color',color(entry.owner));}
    if(side.flag.hidden!==!flag)side.flag.hidden=!flag;
    if(flag&&flag!==side.flagArt){let url=this.flags.get(flag);if(!url){url=staticPlaqueFlag(flag);this.flags.set(flag,url);}side.flag.src=url;}
    side.flagArt=flag;
    if(side.count.textContent!==count)side.count.textContent=count;
   });
   for(let i=sides.length;i<e.sides.length;i++)e.sides[i].node.hidden=true;
   this.drawPower(e,sides,power?.get(battle.id),color);
   e.node.dataset.sides=String(sides.length);e.node.dataset.region=String(battle.region);
   e.node.dataset.involved=String(involved(battle)===1);
   e.node.style.transform=`translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0) translate(-50%,-100%)`;
  }
  for(const [key,e] of this.entries)if(!seen.has(key)){this.entries.delete(key);e.node.remove();}
 }
 private drawPower(e:Entry,sides:readonly BattleView['sides'][number][],power:ReadonlyMap<number,number>|undefined,color:(owner:number)=>string){
  const values=sides.map(side=>power?.get(side.owner)??0),total=values.reduce((sum,value)=>sum+value,0);
  e.power.hidden=!(total>0);if(!(total>0))return;
  sides.forEach((side,index)=>{
   let segment=e.segments[index];if(!segment){segment=document.createElement('i');e.power.append(segment);e.segments[index]=segment;}
   if(segment.hidden)segment.hidden=false;
   if(segment.dataset.owner!==String(side.owner)){segment.dataset.owner=String(side.owner);segment.style.background=color(side.owner);}
   const width=`${(values[index]/total*100).toFixed(1)}%`;
   if(segment.style.width!==width)segment.style.width=width;
  });
  for(let i=sides.length;i<e.segments.length;i++)e.segments[i].hidden=true;
 }
 dispose(){this.layer.remove();this.entries.clear();}
}
