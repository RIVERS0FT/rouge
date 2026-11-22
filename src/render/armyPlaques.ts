import {factionFlags} from '../game/factionFlags.ts';
import type {Flag} from '../game/flags.ts';
import type {Player} from '../game/types.ts';
import type {ArmyView} from './armyViews.ts';
import {staticPlaqueFlag} from './provincePlaqueFlag.ts';

type Entry={node:HTMLButtonElement;flag:HTMLImageElement;flagArt?:Flag;count:HTMLSpanElement;view:ArmyView};
type Position={x:number;y:number};
const MAX_VISIBLE=60;

/** Army nameplates: only the country's flag and the army's strength. The layer itself never
 * takes map input; own nameplates are buttons that select the army for a redirect. */
export class ArmyPlaques {
 private readonly layer=document.createElement('div');
 private entries=new Map<number,Entry>();
 private flags=new WeakMap<Flag,string>();
 private ranked?:{views:readonly ArmyView[];actor:number;selected:ReadonlySet<number>;indices:number[]};
 constructor(host:HTMLElement,private onSelect:(id:number)=>void){
  this.layer.className='army-plaque-layer';host.append(this.layer);
 }
 private make(view:ArmyView):Entry{
  const node=document.createElement('button'),flag=document.createElement('img'),count=document.createElement('span');
  node.type='button';node.className='army-plaque';node.dataset.testid='army-plaque';
  flag.className='army-plaque-flag';flag.alt='';flag.draggable=false;count.className='army-plaque-count';
  node.append(flag,count);this.layer.append(node);
  // The map captures mouse gestures first. Touch and keyboard activation use the button.
  node.addEventListener('pointerdown',event=>event.stopPropagation());
  node.addEventListener('click',event=>{event.stopPropagation();const entry=[...this.entries.values()].find(e=>e.node===node);if(entry&&node.dataset.own==='true')this.onSelect(entry.view.id);});
  return {node,flag,count,view};
 }
 draw(views:readonly ArmyView[],players:readonly Player[],actor:number,selected:ReadonlySet<number>,project:(view:ArmyView)=>Position|null,color:(owner:number)=>string,label:(view:ArmyView)=>string){
  const flags=factionFlags(players),seen=new Set<number>(),shown:{x:number;y:number;half:number}[]=[];
  if(this.ranked?.views!==views||this.ranked.actor!==actor||this.ranked.selected!==selected){
   const indices=views.map((_,i)=>i);
   indices.sort((i,j)=>{const a=views[i],b=views[j];return Number(selected.has(b.id))-Number(selected.has(a.id))||Number(b.owner===actor)-Number(a.owner===actor)||b.count-a.count||a.id-b.id;});
   this.ranked={views,actor,selected,indices};
  }
  // Project in ledger order so that stacked siege labels retain their rows.
  const positions=views.map(project);
  for(const index of this.ranked.indices){
   if(shown.length>=MAX_VISIBLE)break;
   const at=positions[index],view=views[index];if(!at)continue;
   const count=view.ready===undefined?String(view.count):`${view.ready}/${view.count}`,half=(30+count.length*8)/2;
   if(shown.some(p=>Math.abs(at.x-p.x)<half+p.half+2&&Math.abs(at.y-p.y)<22))continue;
   shown.push({x:at.x,y:at.y,half});seen.add(view.id);
   let e=this.entries.get(view.id);if(!e){e=this.make(view);this.entries.set(view.id,e);}
   e.view=view;
   const flag=flags[view.owner];
   if(e.flag.hidden!==!flag)e.flag.hidden=!flag;
   if(flag&&flag!==e.flagArt){let url=this.flags.get(flag);if(!url){url=staticPlaqueFlag(flag);this.flags.set(flag,url);}e.flag.src=url;}
   e.flagArt=flag;
   if(e.count.textContent!==count)e.count.textContent=count;
   const own=String(view.owner===actor&&actor>=0),name=label(view);
   if(e.node.dataset.own!==own){e.node.dataset.own=own;e.node.tabIndex=own==='true'?0:-1;}
   if(e.node.getAttribute('aria-label')!==name){e.node.setAttribute('aria-label',name);e.node.title=name;}
   if(e.node.dataset.army!==String(view.id))e.node.dataset.army=String(view.id);
   if(e.node.dataset.owner!==String(view.owner)){e.node.dataset.owner=String(view.owner);e.node.style.setProperty('--army-color',color(view.owner));}
   if(e.node.dataset.selected!==String(selected.has(view.id)))e.node.dataset.selected=String(selected.has(view.id));
   if(e.node.dataset.phase!==(view.phase??''))e.node.dataset.phase=view.phase??'';
   // Lifted above the lead battalion so it clears the region plaque at a town anchor.
   e.node.style.transform=`translate3d(${at.x.toFixed(1)}px,${(at.y-12).toFixed(1)}px,0) translate(-50%,-100%)`;
  }
  for(const [id,e] of this.entries)if(!seen.has(id)){this.entries.delete(id);e.node.remove();}
  return seen;
 }
 dispose(){this.layer.remove();this.entries.clear();}
}
