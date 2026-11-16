import {factionFlags} from '../game/factionFlags.ts';
import {staticPlaqueFlag} from './provincePlaqueFlag.ts';
import type {Player} from '../game/types.ts';
import type {BattleContact} from './battleContacts.ts';
import type {Flag} from '../game/flags.ts';

type Entry={node:HTMLDivElement;first:HTMLSpanElement;second:HTMLSpanElement;left:HTMLImageElement;right:HTMLImageElement;x:number;y:number;battle:BattleContact};
type Position={x:number;y:number};
const swordSvg='<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7.3 15.6 8.5-9.3L21 3l-3 5.6-8.5 9.3m-5.4-4.1 7.3 6.4m-3.6-2.2-3.5 3.5M16.7 15.6 8.2 6.3 3 3l3 5.6 8.5 9.3m5.4-4.1-7.3 6.4m3.6-2.2 3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MAX_VISIBLE=35;
export class BattleBadges {
 private readonly layer=document.createElement('div');
 private entries=new Map<string,Entry>();
 private flags=new WeakMap<Flag,string>();
 private players:readonly Player[]=[];
 private cursor:Position|null=null;
 private hovered:Entry|null=null;
 constructor(private host:HTMLElement){
  this.layer.className='battle-badge-layer';host.append(this.layer);
  host.addEventListener('pointermove',this.point,true);host.addEventListener('pointerleave',this.leave);host.addEventListener('pointercancel',this.leave);
 }
 private point=(event:PointerEvent)=>{
  if(event.pointerType==='touch'||event.buttons||!event.target){this.leave();return;}
  const rect=this.host.getBoundingClientRect();this.cursor={x:event.clientX-rect.x,y:event.clientY-rect.y};this.refreshHover();
 };
 private leave=()=>{this.cursor=null;this.refreshHover();};
 private refreshHover(){
  const p=this.cursor,hovered=p?[...this.entries.values()].find(e=>Math.abs(e.x-p.x)<42&&Math.abs(e.y-12-p.y)<16)??null:null;
  if(hovered!==this.hovered){this.hovered?.node.removeAttribute('data-hovered');this.hovered=hovered;}
  if(!hovered)return;
  hovered.node.dataset.hovered='true';
  const flags=factionFlags(this.players);
  const set=(image:HTMLImageElement,owner:number)=>{
   const flag=flags[owner];image.hidden=!flag;if(!flag)return;
   let url=this.flags.get(flag);if(!url){url=staticPlaqueFlag(flag);this.flags.set(flag,url);}
   if(image.getAttribute('src')!==url)image.setAttribute('src',url);
  };
  set(hovered.left,hovered.battle.first);set(hovered.right,hovered.battle.second);
 }
 private make(battle:BattleContact):Entry{
  const node=document.createElement('div');node.className='battle-badge';node.dataset.testid='battle-badge';
  const first=document.createElement('span'),second=document.createElement('span'),swords=document.createElement('span');
  first.className='battle-side battle-side-first';second.className='battle-side battle-side-second';
  const left=document.createElement('img'),right=document.createElement('img');
  left.className='battle-flag battle-flag-first';right.className='battle-flag battle-flag-second';
  left.alt=right.alt='';left.hidden=right.hidden=true;
  swords.className='battle-swords';swords.innerHTML=swordSvg;
  node.append(first,swords,second,left,right);this.layer.append(node);
  return {node,first,second,left,right,x:0,y:0,battle};
 }
 draw(battles:readonly BattleContact[],players:readonly Player[],actor:number,project:(battle:BattleContact)=>Position|null,color:(owner:number)=>string){
  this.players=players;
  const seen=new Set<string>();
  const visible=battles.flatMap(battle=>{const at=project(battle);return at?[{battle,at}]:[];});
  visible.sort((a,b)=>Number(b.battle.first===actor||b.battle.second===actor)-Number(a.battle.first===actor||a.battle.second===actor)
    ||(b.battle.firstCount+b.battle.secondCount)-(a.battle.firstCount+a.battle.secondCount)||a.battle.key.localeCompare(b.battle.key));
  const shown:Position[]=[];
  for(const {battle,at} of visible){
   if(shown.length>=MAX_VISIBLE)break;
   if(shown.some(p=>Math.abs(at.x-p.x)<72&&Math.abs(at.y-p.y)<29))continue;
   shown.push(at);seen.add(battle.key);
   let e=this.entries.get(battle.key);if(!e){e=this.make(battle);this.entries.set(battle.key,e);}
   e.x=at.x;e.y=at.y;e.battle=battle;
   const first=String(battle.firstCount),second=String(battle.secondCount);
   if(e.first.textContent!==first)e.first.textContent=first;if(e.second.textContent!==second)e.second.textContent=second;
   e.node.style.transform=`translate3d(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px,0) translate(-50%,-100%)`;
   e.node.style.setProperty('--battle-first',color(battle.first));e.node.style.setProperty('--battle-second',color(battle.second));
   e.node.style.setProperty('--battle-share',`${100*battle.firstCount/(battle.firstCount+battle.secondCount)}%`);
  }
  for(const [key,e] of this.entries)if(!seen.has(key)){this.entries.delete(key);e.node.remove();}
  this.refreshHover();
 }
 dispose(){this.leave();this.host.removeEventListener('pointermove',this.point,true);this.host.removeEventListener('pointerleave',this.leave);this.host.removeEventListener('pointercancel',this.leave);this.layer.remove();this.entries.clear();}
}
