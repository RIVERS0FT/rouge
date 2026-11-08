import { KINDS, LEADERS, MAP_ID, TALENTS, STATS, MAX_UNITS, stats } from './content.ts';
import { MAP, BOUNDS } from './map.ts';
import type { GameState } from './types.ts';
export interface StorageLike{readonly length:number;key(index:number):string|null;getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export interface SaveInfo{id:string;name:string;savedAt:string;tick:number;leader:string;corrupted?:boolean}
export const SAVE_PREFIX='rouge.save.earth.miller.v1.';
const PREFIX=SAVE_PREFIX;
const integer=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateState(value:unknown):value is GameState{
  if(!value||typeof value!=='object')return false;const s=value as GameState;
  if(s.version!==3||s.map!==MAP_ID||typeof s.campaign!=='string'||s.campaign.length>100||!integer(s.tick,0,1e10)||!integer(s.nextId,1,1e10)||!integer(s.topology,0,1e9)||!integer(s.rng,1,0xffffffff)||!integer(s.seed,0,0xffffffff))return false;
  if(!Array.isArray(s.players)||s.players.length<2||s.players.length>4||!Array.isArray(s.provinces)||s.provinces.length!==MAP.length||!Array.isArray(s.units)||s.units.length>MAX_UNITS)return false;
  if(!Array.isArray(s.events)||s.events.length>32||!Array.isArray(s.domination)||s.domination.length!==s.players.length||!s.domination.every(v=>number(v,0,31)))return false;
  if(s.winner!==null&&!integer(s.winner,0,s.players.length-1))return false;const talentIds=TALENTS.map(t=>t.id);
  for(const[i,p]of s.players.entries()){
    if(!p||p.id!==i||typeof p.name!=='string'||p.name.length>24||!LEADERS.includes(p.leader)||typeof p.ai!=='boolean'||!number(p.gold,0,1e12)||!number(p.xp,0,1e12)||!integer(p.level,1,8)||!integer(p.drafts,0,7)||!integer(p.rerolls,0,1))return false;
    if(!Array.isArray(p.loadout)||p.loadout.length<1||p.loadout.length>3||!p.loadout.includes('infantry')||new Set(p.loadout).size!==p.loadout.length||!p.loadout.every(k=>KINDS.includes(k)))return false;
    if(!Array.isArray(p.talents)||p.talents.length>7||new Set(p.talents).size!==p.talents.length||!p.talents.every(t=>talentIds.includes(t)))return false;
    if(!Array.isArray(p.choices)||p.choices.length>3||new Set(p.choices).size!==p.choices.length||!p.choices.every(t=>talentIds.includes(t)&&!p.talents.includes(t)))return false;
    if(!p.upgrades||!KINDS.every(k=>p.upgrades[k]&&STATS.every(st=>integer(p.upgrades[k][st],0,8))))return false;
  }
  for(const[i,p]of s.provinces.entries())if(!p||p.id!==i||!integer(p.owner,-1,s.players.length-1)||!KINDS.includes(p.kind)||!number(p.production,0,100)||!number(p.recovery,0,15)||!integer(p.captor,-1,s.players.length-1)||!number(p.capture,0,8.1)||(p.owner>=0&&!s.players[p.owner].loadout.includes(p.kind)))return false;
  const ids=new Set<number>();
  for(const u of s.units){
    if(!u||!integer(u.id,1,s.nextId-1)||ids.has(u.id)||!integer(u.owner,-1,s.players.length-1)||!KINDS.includes(u.kind)||!number(u.x,BOUNDS.left,BOUNDS.right)||!number(u.z,BOUNDS.top,BOUNDS.bottom)||!number(u.hp,0.00001,stats(s.players[u.owner],u.kind).hp+0.01)||!integer(u.province,0,MAP.length-1)||(u.target!==null&&!integer(u.target,0,MAP.length-1))||!integer(u.origin,0,MAP.length-1)||!number(u.cooldown,0,1.01))return false;ids.add(u.id);
  }
  return s.events.every(e=>e&&integer(e.tick,0,s.tick)&&['capture','level','victory'].includes(e.key)&&integer(e.player,0,s.players.length-1)&&(e.province===undefined||integer(e.province,0,MAP.length-1)));
}
// Integrity checksum only, not an anti-cheat signature.
export function checksum(text:string):string{let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16);}
export function encodeSave(state:GameState,name:string):string{if(!validateState(state))throw new Error('invalidSave');const body=JSON.stringify(state);return JSON.stringify({version:1,name:name.slice(0,64),savedAt:new Date().toISOString(),hash:checksum(body),body});}
export function decodeSave(raw:string):{state:GameState;name:string;savedAt:string}{
  if(raw.length>3_000_000)throw new Error('invalidSave');
  try{const e=JSON.parse(raw);if(e.version!==1||typeof e.body!=='string'||e.hash!==checksum(e.body)||typeof e.name!=='string'||typeof e.savedAt!=='string'||!Number.isFinite(Date.parse(e.savedAt)))throw new Error();const state:unknown=JSON.parse(e.body);if(!validateState(state))throw new Error();return{state,name:e.name,savedAt:e.savedAt};}catch{throw new Error('invalidSave');}
}
function slotKey(id:string){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('invalidSlot');return PREFIX+id;}
export function writeSave(storage:StorageLike,id:string,state:GameState,name:string):void{
  const key=slotKey(id),data=encodeSave(state,name),old=storage.getItem(key);
  // setItem is atomic; preserve a verified previous revision before replacing current data.
  if(old){try{decodeSave(old);storage.setItem(key+'.backup',old);}catch(e){if(e instanceof Error&&e.message!=='invalidSave')throw e;}}
  storage.setItem(key,data);
}
export function readSave(storage:StorageLike,id:string):{state:GameState;recovered:boolean}{
  const key=slotKey(id);for(const[index,k]of[key,key+'.backup'].entries()){const raw=storage.getItem(k);if(!raw)continue;try{return{state:decodeSave(raw).state,recovered:index===1};}catch{/* Try the previous committed revision. */}}throw new Error('invalidSave');
}
export function listSaves(storage:StorageLike):SaveInfo[]{
  const list:SaveInfo[]=[];
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(!k?.startsWith(PREFIX)||k.endsWith('.backup'))continue;const id=k.slice(PREFIX.length);try{const v=decodeSave(storage.getItem(k)!);list.push({id,name:v.name,savedAt:v.savedAt,tick:v.state.tick,leader:v.state.players[0].leader});}catch{list.push({id,name:id,savedAt:'',tick:0,leader:'warden',corrupted:true});}}
  return list.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));
}
export function deleteSave(storage:StorageLike,id:string){const key=slotKey(id);storage.removeItem(key);storage.removeItem(key+'.backup');}
