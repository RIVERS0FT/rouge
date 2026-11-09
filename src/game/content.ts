import type { Kind, Leader, Upgrade, Player } from './types.ts';
export const DT=0.05;
export const VERSION='0.5.0';
// Network protocol identity; independent of backwards-compatible local save schema.
export const RULES_ID='nine-attributes-sea-transport-v1';
export const MAP_ID='earth-state-regions-1137-v1' as const;
// Per-faction physical capacity in one management region; no player/world army cap.
export const PROVINCE_CAP=12;
export const KINDS:Kind[]=['infantry','cavalry','artillery','engineer'];
export const LEADERS:Leader[]=['warden','vanguard','steward'];
export const STATS:Upgrade[]=['attack','health','speed'];
export interface UnitStats {hp:number;attack:number;defense:number;attackSpeed:number;splash:number;range:number;train:number;speed:number;seaSpeed:number}
export const UNIT_ATTRIBUTES:(keyof UnitStats)[]=['hp','attack','defense','attackSpeed','splash','range','train','speed','seaSpeed'];
export const UNITS:Record<Kind,UnitStats>={
  infantry:{hp:100,attack:14,defense:10,attackSpeed:1,splash:0,range:3.1,train:14,speed:2.4,seaSpeed:3},
  cavalry:{hp:120,attack:24,defense:15,attackSpeed:0.8,splash:0,range:1.8,train:22,speed:4,seaSpeed:3},
  artillery:{hp:80,attack:40,defense:0,attackSpeed:0.5,splash:1.2,range:7.2,train:28,speed:1.8,seaSpeed:3},
  engineer:{hp:100,attack:12,defense:10,attackSpeed:1,splash:0,range:2.6,train:18,speed:2.5,seaSpeed:3},
};
export const TALENTS:{id:string;kind?:Kind}[]=[
  {id:'industry'},{id:'forcedMarch'},{id:'entrenchment'},{id:'veterans'},
  {id:'logistics'},{id:'conqueror'},{id:'charge',kind:'cavalry'},
  {id:'barrage',kind:'artillery'},{id:'sappers',kind:'engineer'},
];
export function upgradeCost(level:number):number {return Math.floor(30*Math.pow(level+1,1.65));}
export function stats(p:Player|undefined,kind:Kind):UnitStats {
  const b=UNITS[kind],u=p?.upgrades[kind],has=(id:string)=>p?.talents.includes(id)??false;
  return {
    ...b,
    hp:b.hp+(u?.health??0)*12,
    attack:(b.attack+(u?.attack??0)*2)*(has('veterans')?1.12:1)*(kind==='cavalry'&&has('charge')?1.25:1)*(kind==='artillery'&&has('barrage')?1.25:1),
    speed:(b.speed+(u?.speed??0)*0.16)*(p?.leader==='vanguard'?1.12:1)*(has('forcedMarch')?1.2:1),
    range:b.range,
  };
}
export function validateSetup(value:unknown):value is {name:string;leader:Leader;loadout:Kind[];ai?:boolean} {
  if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
  return typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=24
    &&LEADERS.includes(v.leader as Leader)&&Array.isArray(v.loadout)
    &&v.loadout.length===1&&v.loadout.every(k=>KINDS.includes(k))
    &&(v.ai===undefined||typeof v.ai==='boolean');
}
