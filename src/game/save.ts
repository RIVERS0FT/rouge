import {isMarchFraction} from './countryActions.ts';
import {getSpawnCapacity} from './spawns.ts';
import {validCountryIdentity} from './countryNames.ts';
import { validFlag } from './flags.ts';
import { KINDS, LEADERS, MAP_ID, STATE_VERSION, TALENTS, STATS, stats } from './content.ts';
import {distanceToTravelSegment, terrainAt, terrainSegment, travelCorridorPoint, validateTravel} from './terrain-navigation.ts';
import {validGroupingState} from './territoryEconomy.ts';
import {isRegionGarrison} from './capacity.ts';
import {isConstructionKind,MAX_FUNDS,CAPTURE_RECOVERY_SECONDS} from './construction.ts';
import { MAP, BOUNDS, pointInProvince } from './map.ts';
import type { GameState } from './types.ts';
export interface StorageLike{readonly length:number;key(index:number):string|null;getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export interface SaveInfo{id:string;name:string;savedAt:string;tick:number;leader:string;corrupted?:boolean}
// Import byte guard is a resource-safety check, not a gameplay troop cap.
export const MAX_SAVE_BYTES=128*1024*1024;
export const SAVE_PREFIX=`rouge.save.natural-earth-admin1.regions.v${STATE_VERSION}.`;
const PREFIX=SAVE_PREFIX;
export const AUTOSAVE_ID='auto';
export const isAutosave=(id:string)=>id===AUTOSAVE_ID||id.startsWith('auto-');
const autosaveKey=PREFIX+AUTOSAVE_ID;
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateState(value:unknown):value is GameState{
  if(!value||typeof value!=='object')return false;const s=value as GameState;
  if(s.version!==STATE_VERSION||s.map!==MAP_ID||s.spawnModel!=='single'||s.neutralGarrisonModel!=='preplaced'||typeof s.campaign!=='string'||s.campaign.length>100||!integer(s.tick,0,1e10)||!integer(s.nextId,1,1e10)||!integer(s.topology,0,1e9)||!integer(s.rng,1,0xffffffff)||!integer(s.seed,0,0xffffffff))return false;
  if(!Array.isArray(s.players)||s.players.length<2||s.players.length>getSpawnCapacity()||!Array.isArray(s.provinces)||s.provinces.length!==MAP.length||!Array.isArray(s.units))return false;
  if(!validArmyLedgers(s))return false;
  if(!Array.isArray(s.events)||s.events.length>32||!Array.isArray(s.domination)||s.domination.length!==s.players.length||!s.domination.every(v=>number(v,0,31)))return false;
  if(s.winner!==null&&!integer(s.winner,0,s.players.length-1))return false;const talentIds=TALENTS.map(t=>t.id);
  for(const[i,p]of s.players.entries()){
    if(!p||((p.ai||p.country!==undefined)&&!validCountryIdentity(p.country))||(p.flag!==undefined&&!validFlag(p.flag))||p.id!==i||typeof p.name!=='string'||p.name.length>24||!LEADERS.includes(p.leader)||typeof p.ai!=='boolean'||!number(p.funds,0,MAX_FUNDS)||!number(p.xp,0,1e12)||!integer(p.level,1,8)||!integer(p.drafts,0,7)||!integer(p.rerollsUsed,0,Number.MAX_SAFE_INTEGER)||Object.hasOwn(p,'rerolls'))return false;
    if(!Array.isArray(p.loadout)||p.loadout.length!==1||!KINDS.includes(p.loadout[0]))return false;
    if(!Array.isArray(p.talents)||p.talents.length>7||new Set(p.talents).size!==p.talents.length||!p.talents.every(t=>talentIds.includes(t)))return false;
    if(!Array.isArray(p.choices)||p.choices.length>3||new Set(p.choices).size!==p.choices.length||!p.choices.every(t=>talentIds.includes(t)&&!p.talents.includes(t)))return false;
    if(!p.upgrades||!KINDS.every(k=>p.upgrades[k]&&STATS.every(st=>integer(p.upgrades[k][st],0,8))))return false;
  }
  for(const[i,p]of s.provinces.entries())if(!p||p.id!==i||!integer(p.owner,-1,s.players.length-1)||!KINDS.includes(p.kind)||!number(p.production,0,100)||!number(p.recovery,0,CAPTURE_RECOVERY_SECONDS)||!integer(p.captor,-1,s.players.length-1)||!number(p.capture,0,8.1)||(!MAP[i].playable&&(p.owner!==-1||p.production!==0||p.captor!==-1||p.capture!==0||p.recovery!==0))||(p.owner>=0&&!s.players[p.owner].loadout.includes(p.kind)))return false;
  for(const p of s.provinces)if(p.construction!==undefined){
    const b=p.construction;
    if(!b||!MAP[p.id].playable||p.owner<0||!isConstructionKind(b.kind)||(b.level!==1&&b.level!==2&&b.level!==3))return false;
  }
  if(!validGroupingState(s))return false;
  for(const p of s.provinces){
    if(p.lastMarchTick!==undefined&&(!MAP[p.id].playable||!integer(p.lastMarchTick,0,s.tick)))return false;
    if(p.march===undefined)continue;
    const order=p.march;
    if(!order||typeof order!=='object'||p.owner<0||!integer(order.to,0,MAP.length-1)||!MAP[order.to].playable)return false;
    if(order.owner!==p.owner||(order.reserved!==undefined&&order.reserved!==true)||(order.fraction!==undefined&&!isMarchFraction(order.fraction))||Object.hasOwn(order,'unitIds'))return false;
    if(order.army!==undefined&&s.armies.find(army=>army.id===order.army)?.owner!==order.owner)return false;
    const orderIds=order.pendingIds;
    if(!Array.isArray(orderIds)||orderIds.length<1||orderIds.length>s.units.length||new Set(orderIds).size!==orderIds.length||!orderIds.every(id=>integer(id,1,s.nextId-1)))return false;
  }
  const pending=new Map<number,number>();
  for(const p of s.provinces){const order=p.march;if(order)for(const id of order.pendingIds){if(pending.has(id))return false;pending.set(id,p.id);}}
  const ids=new Set<number>(),armies=new Map(s.armies.map(army=>[army.id,army]));
  for(const u of s.units){
    if(!u||!integer(u.id,1,s.nextId-1)||ids.has(u.id)||!integer(u.owner,-1,s.players.length-1)||!KINDS.includes(u.kind)||!number(u.x,BOUNDS.left,BOUNDS.right)||!number(u.z,BOUNDS.top,BOUNDS.bottom)||!number(u.hp,Number.MIN_VALUE,stats(s.players[u.owner],u.kind).hp+0.01)||!integer(u.province,0,MAP.length-1)||(u.target!==null&&!integer(u.target,0,MAP.length-1))||!integer(u.origin,0,MAP.length-1)||!number(u.cooldown,0,Math.max(1,1/stats(s.players[u.owner],u.kind).attackSpeed)+0.01))return false;
    if(!MAP[u.province].playable||!MAP[u.origin].playable||(u.target!==null&&!MAP[u.target].playable)||(!u.transport?.embarked&&!pointInProvince(u.province,u.x,u.z)))return false;
    const army=u.army===undefined?undefined:armies.get(u.army),formation=army?.formation;
    const source=pending.get(u.id);if(source!==undefined){
      if(u.armyStatus==='queued'){
        if(source!==formation?.from||s.provinces[source].march?.army!==u.army||u.province!==source)return false;
      }else if(!isRegionGarrison(u,s.provinces[source].owner,source))return false;
      pending.delete(u.id);
    }
    if(u.assault!==undefined&&(u.owner<0||u.assault!==(u.target??u.province)))return false;
    if(u.army!==undefined&&army?.owner!==u.owner)return false;
    if(!Array.isArray(u.route)||u.route.length!==0)return false;
    if(formation){
      const status=u.armyStatus;
      if(!status||!['queued','formed','field','sea','inside'].includes(status)||u.travel)return false;
      if(status==='queued'){
        if(source===undefined||u.target!==null||u.destination!==null||u.transport||u.origin!==u.province)return false;
      }else{
        if(u.origin!==formation.from||u.target!==army.to||u.destination!==army.to)return false;
        if(status==='sea'){
          if(formation.phase!=='sea'||!u.transport?.embarked||u.transport.from!==u.origin||u.transport.to!==u.target||u.transport.index!==formation.route.index||u.x!==formation.position.x||u.z!==formation.position.z)return false;
        }else if(u.transport||status==='inside'&&(u.province!==army.to||formation.phase!=='enter'))return false;
      }
      ids.add(u.id);continue;
    }
    if(u.armyStatus)return false;
    if(u.target===null){if(u.travel||u.transport||u.destination!==null||u.origin!==u.province)return false;}
    else {
      if(u.destination!==u.target)return false;
      if(u.travel){if(!validateTravel(u.travel,u,MAP[u.target].center))return false;}
      else if(u.province!==u.target||!pointInProvince(u.target,u.x,u.z))return false;
    }
    if(u.transport){
      if(!u.travel||u.transport.embarked!==true||u.transport.from!==u.origin||u.transport.to!==u.target||!integer(u.transport.index,1,u.travel.points.length-1)||!u.travel.points[u.transport.index].sea)return false;
    }
    // Legitimate arrivals can put more troops here than local training allows.
    ids.add(u.id);
  }
  return !pending.size&&s.events.every(e=>e&&integer(e.tick,0,s.tick)&&['capture','level','victory','battle'].includes(e.key)&&integer(e.player,0,s.players.length-1)&&(e.province===undefined||integer(e.province,0,MAP.length-1))
    &&(e.sides===undefined||(e.key==='battle'&&Array.isArray(e.sides)&&e.sides.length>=2&&e.sides.length<=s.players.length+1&&new Set(e.sides).size===e.sides.length&&e.sides.every(owner=>integer(owner,-1,s.players.length-1)))));
}
/** Rule v34 reworked talents that used to raise maximum health (Field Medicine, Infantry Line).
 * Clamp older troops to their current maximum instead of rejecting the save; validation still runs. */
function clampReworkedTalentHealth(state:unknown):void{
  if(!state||typeof state!=='object')return;const s=state as {units?:unknown;players?:unknown};
  if(!Array.isArray(s.units)||!Array.isArray(s.players))return;
  for(const unit of s.units){
    if(!unit||typeof unit!=='object')continue;const u=unit as {hp?:unknown;owner?:unknown;kind?:unknown};
    if(typeof u.hp!=='number'||!Number.isInteger(u.owner)||!KINDS.includes(u.kind as never))continue;
    try{const maximum=stats((u.owner as number)>=0?s.players[u.owner as number]:undefined,u.kind as never).hp;if(u.hp>maximum&&u.hp<=maximum*1.5+0.01)u.hp=maximum;}catch{/* Malformed players fail validation below. */}
  }
}
/** Armies exist while troops march or attack; battles are open fights per region. */
function validArmyLedgers(s:GameState):boolean{
  if(!Array.isArray(s.armies)||!integer(s.nextArmy,1,1e12)||!Array.isArray(s.battles)||!integer(s.nextBattle,1,1e12))return false;
  const armyIds=new Set<number>();
  for(const army of s.armies){
    if(!army||typeof army!=='object'||!integer(army.id,1,s.nextArmy-1)||armyIds.has(army.id)||!integer(army.owner,0,s.players.length-1)||!integer(army.to,0,MAP.length-1)||!MAP[army.to].playable||!integer(army.formed,0,s.tick)||!integer(army.size,1,1e9))return false;
    const f=army.formation;
    if(f!==undefined){
      if(!f||!integer(f.from,0,MAP.length-1)||!MAP[f.from].playable||!['assemble','march','sea','battle','enter'].includes(f.phase)||!number(f.heading,-Math.PI*4,Math.PI*4)||!integer(f.columns,1,Math.ceil(Math.sqrt(army.size)))||!integer(f.lastContact,0,s.tick))return false;
      if(!f.position||!number(f.position.x,BOUNDS.left,BOUNDS.right)||!number(f.position.z,BOUNDS.top,BOUNDS.bottom)||terrainAt(f.position,f.phase!=='sea')<0)return false;
      if(f.readyAt!==undefined&&!integer(f.readyAt,0,s.tick+1)||f.engaged!==undefined&&typeof f.engaged!=='boolean'||f.redirect!==undefined&&(!integer(f.redirect,0,MAP.length-1)||!MAP[f.redirect].playable))return false;
      if(f.retryAt!==undefined&&!integer(f.retryAt,0,s.tick+12)||f.readyCount!==undefined&&!integer(f.readyCount,0,army.size))return false;
      if(f.detour!==undefined&&(!Array.isArray(f.detour)||f.detour.length>250||f.detour.some(p=>!p||!number(p.x,BOUNDS.left,BOUNDS.right)||!number(p.z,BOUNDS.top,BOUNDS.bottom)||terrainAt(p,true)<0)))return false;
      const route=f.route,previous=route?.points?.[route.index-1];
      if(!previous||!validateTravel(route,previous,MAP[army.to].center))return false;
      if(f.phase==='sea'&&route.points[route.index].sea&&(distanceToTravelSegment(route,f.position)>3||!terrainSegment(f.position,travelCorridorPoint(route,f.position),true)))return false;
    }
    armyIds.add(army.id);
  }
  const battleIds=new Set<number>(),regions=new Set<number>();
  for(const battle of s.battles){
    if(!battle||typeof battle!=='object'||!integer(battle.id,1,s.nextBattle-1)||battleIds.has(battle.id)||!integer(battle.region,0,MAP.length-1)||!MAP[battle.region].playable||regions.has(battle.region))return false;
    if(!integer(battle.start,0,s.tick)||!integer(battle.last,battle.start,s.tick)||!Array.isArray(battle.sides)||battle.sides.length<1||battle.sides.length>s.players.length+1)return false;
    const owners=new Set<number>();
    for(const side of battle.sides){if(!side||!integer(side.owner,-1,s.players.length-1)||owners.has(side.owner)||!integer(side.losses,0,1e9))return false;owners.add(side.owner);}
    battleIds.add(battle.id);regions.add(battle.region);
  }
  return true;
}
/** Campaigns saved before armies existed load with empty army and battle ledgers. */
function addArmyLedgers(state:unknown):void{
  if(!state||typeof state!=='object')return;const s=state as Record<string,unknown>;
  if(!('armies' in s))s.armies=[];if(!('nextArmy' in s))s.nextArmy=1;if(!('battles' in s))s.battles=[];if(!('nextBattle' in s))s.nextBattle=1;
}
// Integrity checksum only, not an anti-cheat signature.
export function checksum(text:string):string{let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}
export function encodeSave(state:GameState,name:string):string{if(!validateState(state))throw new Error('invalidSave');const body=JSON.stringify(state);return JSON.stringify({version:1,name:name.slice(0,64),savedAt:new Date().toISOString(),hash:checksum(body),body});}
export function decodeSave(raw:string):{state:GameState;name:string;savedAt:string}{
  if(raw.length>MAX_SAVE_BYTES)throw new Error('invalidSave');
  try{const e=JSON.parse(raw);if(e.version!==1||typeof e.body!=='string'||e.hash!==checksum(e.body)||typeof e.name!=='string'||typeof e.savedAt!=='string'||!Number.isFinite(Date.parse(e.savedAt)))throw new Error();const state:unknown=JSON.parse(e.body);if(state&&typeof state==='object'&&'map' in state&&state.map!==MAP_ID)throw Error('incompatibleMap');clampReworkedTalentHealth(state);addArmyLedgers(state);if(!validateState(state))throw new Error();return{state,name:e.name,savedAt:e.savedAt};}catch(error){if(error instanceof Error&&error.message==='incompatibleMap')throw error;throw new Error('invalidSave');}
}
function slotKey(id:string){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('invalidSlot');return PREFIX+id;}
/** One atomic replacement, including when the previous automatic snapshot is unreadable. */
export function writeAutosave(storage:StorageLike,state:GameState,name:string):void{
  storage.setItem(autosaveKey,encodeSave(state,name));
}
export function writeSave(storage:StorageLike,id:string,state:GameState,name:string):void{
  if(isAutosave(id))throw new Error('invalidSlot');
  const key=slotKey(id),data=encodeSave(state,name),old=storage.getItem(key);
  // Never overwrite unreadable data; a current-format previous revision is backed up.
  if(old!==null){decodeSave(old);storage.setItem(key+'.backup',old);}
  storage.setItem(key,data);
}
export function readSave(storage:StorageLike,id:string):{state:GameState;recovered:boolean}{
  const key=slotKey(id);for(const[index,k]of(id===AUTOSAVE_ID?[key]:[key,key+'.backup']).entries()){const raw=storage.getItem(k);if(!raw)continue;try{return{state:decodeSave(raw).state,recovered:index===1};}catch{/* Try the previous committed revision when present. */}}throw new Error('invalidSave');
}
export function listSaves(storage:StorageLike):SaveInfo[]{
  const list:SaveInfo[]=[], current=storage.getItem(autosaveKey);
  let previous:SaveInfo|undefined;
  for(let i=0;i<storage.length;i++){
    const k=storage.key(i);if(!k?.startsWith(PREFIX)||k.endsWith('.backup'))continue;
    const id=k.slice(PREFIX.length), perCampaign=id.startsWith('auto-');
    if((perCampaign&&current!==null)||(id===AUTOSAVE_ID&&current===''))continue;
    let item:SaveInfo;
    try{const v=decodeSave(storage.getItem(k)!);item={id,name:v.name,savedAt:v.savedAt,tick:v.state.tick,leader:v.state.players[0].leader};}
    catch{item={id,name:id,savedAt:'',tick:0,leader:'warden',corrupted:true};}
    if(!perCampaign)list.push(item);
    else if(!previous||item.savedAt>previous.savedAt)previous=item;
  }
  // Before the first global autosave, offer the latest previous slot without rewriting it.
  if(previous)list.push(previous);
  return list.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
export function deleteSave(storage:StorageLike,id:string){
  const key=slotKey(id);
  if(isAutosave(id)){
    // An empty slot intentionally stays empty, rather than reviving per-campaign autosaves.
    storage.setItem(autosaveKey,'');
    if(id===AUTOSAVE_ID)return;
  }
  storage.removeItem(key);storage.removeItem(key+'.backup');
}
