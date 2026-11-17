import pkg from '../../package.json' with {type: 'json'};
import { validFlag } from './flags.ts';
import type { Kind, Leader, Upgrade, Player } from './types.ts';
export const DT=0.05;
export const VERSION=pkg.version;
// Bump the LAN protocol identity when shared simulation rules, commands, or state shape change.
export const RULES_ID='admin1-locked-game-regions-v44';
export const STATE_VERSION=29;
export const MAP_ID='earth-natural-earth-admin1-511-regions-v28' as const;
// Per-faction physical capacity in one management region; no player/world army cap.
export const PROVINCE_CAP=12;
export const KINDS:Kind[]=['infantry','cavalry','artillery','engineer','skirmisher','grenadier','heavyCavalry','horseArtillery'];
export type UnitFamily='infantry'|'cavalry'|'artillery'|'engineer';
export const UNIT_FAMILY:Record<Kind,UnitFamily>={infantry:'infantry',cavalry:'cavalry',artillery:'artillery',engineer:'engineer',skirmisher:'infantry',grenadier:'infantry',heavyCavalry:'cavalry',horseArtillery:'artillery'};
export function talentApplies(t:{kinds?:readonly Kind[]},loadout:readonly Kind[]):boolean{return !t.kinds||loadout.some(k=>t.kinds!.includes(k));}
export const LEADERS:Leader[]=['warden','vanguard','steward'];
export const STATS:Upgrade[]=['attack','health','speed'];
export interface UnitStats {hp:number;attack:number;defense:number;attackSpeed:number;splash:number;range:number;train:number;speed:number;seaSpeed:number}
export const UNIT_ATTRIBUTES:(keyof UnitStats)[]=['hp','attack','defense','attackSpeed','splash','range','train','speed','seaSpeed'];
export const UNITS:Record<Kind,UnitStats>={
  infantry:{hp:100,attack:14,defense:10,attackSpeed:1,splash:0,range:3.1,train:14,speed:2.4,seaSpeed:3},
  cavalry:{hp:120,attack:24,defense:15,attackSpeed:0.8,splash:0,range:1.8,train:22,speed:4,seaSpeed:3},
  artillery:{hp:80,attack:40,defense:0,attackSpeed:0.5,splash:1.2,range:7.2,train:28,speed:1.8,seaSpeed:3},
  engineer:{hp:100,attack:12,defense:10,attackSpeed:1,splash:0,range:2.6,train:18,speed:2.5,seaSpeed:3},
  skirmisher:{hp:75,attack:12,defense:0,attackSpeed:1,splash:0,range:4.6,train:18,speed:3,seaSpeed:3},
  grenadier:{hp:130,attack:18,defense:20,attackSpeed:0.8,splash:0.7,range:2.3,train:24,speed:2.2,seaSpeed:3},
  heavyCavalry:{hp:155,attack:30,defense:25,attackSpeed:0.65,splash:0,range:1.6,train:32,speed:3.4,seaSpeed:3},
  horseArtillery:{hp:70,attack:28,defense:0,attackSpeed:0.55,splash:0.8,range:5.8,train:30,speed:2.8,seaSpeed:3},
};
type UnitModifier={readonly stat:keyof UnitStats;readonly factor?:number;readonly bonus?:number};
/** Shared quantities that talents read (trigger/condition) or write (effect).
 * Design metadata only: rules never read it. Builds are not tagged anywhere;
 * they emerge where one talent writes what another reads. */
export type TalentKeyword='capture'|'kill'|'death'|'garrison'|'march'|'territory'|'fortress'|'market'|'barracks'|'building'|'funds'|'hp'|'training'|'xp';
export interface Talent{
  readonly id:string;
  /** Exact unit kinds that may draw it (signature talents); omitted = every country. */
  readonly kinds?:readonly Kind[];
  readonly unit?:readonly UnitModifier[];
  /** Rule-changing talents enter drafts from this leader level (pacing only). */
  readonly minLevel?:number;
  /** The description states an explicit cost. */
  readonly tradeoff?:true;
  readonly reads:readonly TalentKeyword[];
  readonly writes:readonly TalentKeyword[];
}
const talent=(id:string,reads:readonly TalentKeyword[],writes:readonly TalentKeyword[],extra:Omit<Talent,'id'|'reads'|'writes'>={}):Talent=>({id,reads,writes,...extra});
// Preserve existing IDs: current saves may contain these talents or pending offers.
// The nine former family talents and fieldMedicine/logistics keep their IDs with new effects.
export const TALENTS:readonly Talent[]=[
  // Existing universal talents, unchanged.
  talent('industry',[],['training','garrison']),
  talent('forcedMarch',[],['march'],{unit:[{stat:'speed',factor:1.2}]}),
  talent('entrenchment',['territory'],['hp']),
  talent('veterans',[],['kill'],{unit:[{stat:'attack',factor:1.12}]}),
  talent('conqueror',[],['capture','territory']),
  talent('protectiveGear',[],['hp'],{unit:[{stat:'defense',bonus:8}]}),
  talent('combatDrills',[],['kill'],{unit:[{stat:'attackSpeed',factor:1.12}]}),
  talent('rangefinding',[],['kill'],{unit:[{stat:'range',factor:1.10}]}),
  talent('navalLogistics',[],['march'],{unit:[{stat:'seaSpeed',factor:1.25}]}),
  talent('warSpoils',['capture'],['funds']),
  talent('taxReform',['territory'],['funds']),
  talent('publicWorks',['funds'],['building','market','barracks','fortress']),
  talent('rapidRecovery',['capture'],['funds','training']),
  // Reworked universal talents.
  talent('fieldMedicine',['territory'],['hp']),
  talent('logistics',['territory','march'],['garrison']),
  // New building blocks.
  talent('pressGang',['capture'],['garrison']),
  talent('fortify',['capture'],['fortress','building']),
  talent('salvage',['capture','building'],['funds']),
  talent('tribute',['capture'],['funds']),
  talent('pursuit',['capture'],['kill','hp']),
  talent('siegeLines',['march'],['capture','territory']),
  talent('bounty',['kill'],['funds']),
  talent('battleHardened',['kill'],['xp']),
  talent('martyrs',['death','territory'],['training','garrison']),
  talent('livingOffLand',['kill','capture'],['funds'],{tradeoff:true,minLevel:4}),
  talent('massedRanks',['garrison'],['hp']),
  talent('grandGarrison',['training'],['garrison','death'],{tradeoff:true}),
  talent('militia',['territory'],['training','garrison','death']),
  talent('shockAssault',['march'],['kill','capture','territory','death'],{tradeoff:true}),
  talent('supplyColumns',['march'],['hp']),
  talent('encirclement',['territory'],['capture','territory','kill'],{minLevel:4}),
  talent('treasury',['funds'],['funds']),
  talent('warChest',['funds'],['kill']),
  talent('levy',['funds'],['training','garrison']),
  talent('arsenal',['funds'],['kill','hp']),
  talent('mercantilism',['territory'],['funds'],{tradeoff:true,unit:[{stat:'attack',factor:.9}]}),
  talent('fortressDoctrine',['fortress'],['hp','building','fortress']),
  talent('bastionGuns',['fortress'],['kill']),
  talent('tradeRoutes',['market'],['funds']),
  talent('academy',['barracks'],['xp']),
  talent('conscription',['barracks'],['garrison']),
  talent('industrialBase',['building','funds'],['fortress','market','barracks','building'],{minLevel:4}),
  // Signature talents: one unit kind each.
  talent('shieldWall',['training'],['garrison','death'],{kinds:['infantry'],tradeoff:true,unit:[{stat:'hp',factor:.9}]}),
  talent('pensions',['death'],['funds'],{kinds:['infantry']}),
  talent('forwardMarksmen',['march'],['kill'],{kinds:['skirmisher']}),
  talent('lightInfantry',['territory'],['march','hp'],{kinds:['skirmisher'],unit:[{stat:'speed',factor:1.15}]}),
  talent('stormTroops',['fortress','capture'],['capture','territory','hp'],{kinds:['grenadier']}),
  talent('grenadeVolley',['garrison'],['kill'],{kinds:['grenadier']}),
  talent('charge',['march'],['kill','capture'],{kinds:['cavalry']}),
  talent('lightSaddles',['march'],['funds','training'],{kinds:['cavalry']}),
  talent('cuirass',['garrison'],['hp'],{kinds:['heavyCavalry'],unit:[{stat:'defense',bonus:10}]}),
  talent('breakthrough',['garrison'],['kill'],{kinds:['heavyCavalry'],unit:[{stat:'splash',bonus:1}]}),
  talent('barrage',['garrison','fortress'],['kill','capture'],{kinds:['artillery']}),
  talent('wideSalvo',['garrison'],['kill'],{kinds:['artillery'],unit:[{stat:'splash',factor:1.25}]}),
  talent('flyingBattery',['march'],['hp'],{kinds:['horseArtillery']}),
  talent('pointBlank',[],['kill'],{kinds:['horseArtillery']}),
  talent('sappers',['building','garrison'],['building','fortress','market','barracks'],{kinds:['engineer']}),
  talent('breachDrills',['capture'],['kill','capture','territory'],{kinds:['engineer']}),
  talent('armoredSappers',['capture'],['hp','capture','territory'],{kinds:['engineer']}),
];
export const TALENT_BY_ID:ReadonlyMap<string,Talent>=new Map(TALENTS.map(t=>[t.id,t]));
export function talentAppliesToKind(t:Pick<Talent,'kinds'>,kind:Kind):boolean{return !t.kinds||t.kinds.includes(kind);}
export function hasTalent(p:Pick<Player,'talents'>|undefined,id:string):boolean{return p?.talents.includes(id)??false;}
export function upgradeCost(level:number):number {return Math.floor(30*Math.pow(level+1,1.65));}
/** Funds for the next unit upgrade, including the Arsenal discount. */
export function upgradeCostFor(p:Pick<Player,'talents'>|undefined,level:number):number {
  const base=upgradeCost(level);return hasTalent(p,'arsenal')?Math.floor(base*.7):base;
}
export function stats(p:Pick<Player,'talents'|'upgrades'>|undefined,kind:Kind):UnitStats {
  const b=UNITS[kind],u=p?.upgrades[kind];
  const result={...b,hp:b.hp+(u?.health??0)*12,attack:b.attack+(u?.attack??0)*2,speed:b.speed+(u?.speed??0)*0.16};
  if(p)for(const id of p.talents){
    const definition=TALENT_BY_ID.get(id);
    if(!definition?.unit||!talentAppliesToKind(definition,kind))continue;
    for(const mod of definition.unit)result[mod.stat]=result[mod.stat]*(mod.factor??1)+(mod.bonus??0);
  }
  return result;
}
export function validateSetup(value:unknown):value is {name:string;leader:Leader;loadout:Kind[];ai?:boolean} {
  if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
  return typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=24
    &&LEADERS.includes(v.leader as Leader)&&Array.isArray(v.loadout)
    &&v.loadout.length===1&&v.loadout.every(k=>KINDS.includes(k))
    &&(v.flag===undefined||validFlag(v.flag))
    &&(v.ai===undefined||typeof v.ai==='boolean');
}
