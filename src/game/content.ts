import pkg from '../../package.json' with {type: 'json'};
import {validAppearance} from './portrait.ts';
import { validFlag } from './flags.ts';
import { BALANCE, BALANCE_ID } from './balance.ts';
import type { Kind, Leader, Upgrade, Player } from './types.ts';
export const DT=0.05;
export const VERSION=pkg.version;
// Bump the LAN protocol identity when shared simulation rules, commands, or state shape change.
export const RULES_ID='admin1-locked-game-regions-v47';
/** What LAN peers compare: the rules identity plus a fingerprint of every number in
 * balance.ts, so a retune alone already keeps mismatched builds out of the same room. */
export const LAN_RULES_ID=`${RULES_ID}+balance-${BALANCE_ID}`;
export const STATE_VERSION=30;
export const MAP_ID='earth-natural-earth-admin1-511-regions-v28' as const;
// Base training slots in one town.
export const PROVINCE_CAP=BALANCE.regions.slots;
export const KINDS:Kind[]=['infantry','cavalry','artillery','engineer','skirmisher','grenadier','heavyCavalry','horseArtillery'];
export type UnitFamily='infantry'|'cavalry'|'artillery'|'engineer';
export const UNIT_FAMILY:Record<Kind,UnitFamily>={infantry:'infantry',cavalry:'cavalry',artillery:'artillery',engineer:'engineer',skirmisher:'infantry',grenadier:'infantry',heavyCavalry:'cavalry',horseArtillery:'artillery'};
export function talentApplies(t:{kinds?:readonly Kind[]},loadout:readonly Kind[]):boolean{return !t.kinds||loadout.some(k=>t.kinds!.includes(k));}
export const LEADERS:Leader[]=['warden','vanguard','steward'];
export const STATS:Upgrade[]=['attack','health','speed'];
export interface UnitStats {hp:number;attack:number;defense:number;attackSpeed:number;splash:number;range:number;train:number;speed:number;seaSpeed:number}
export const UNIT_ATTRIBUTES:(keyof UnitStats)[]=['hp','attack','defense','attackSpeed','splash','range','train','speed','seaSpeed'];
export const UNITS:Record<Kind,UnitStats>=BALANCE.units;
const UPGRADES=BALANCE.upgrades,T=BALANCE.talents;
export const MAX_UPGRADE_LEVEL=UPGRADES.maxLevel,MAX_LEADER_LEVEL=BALANCE.leader.maxLevel;
/** Experience needed to rise from `level` to the next leader level. */
export function experienceForLevel(level:number):number{return BALANCE.leader.xpBase+level*BALANCE.leader.xpPerLevel;}
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
  talent('forcedMarch',[],['march'],{unit:[{stat:'speed',factor:T.forcedMarch.speed}]}),
  talent('entrenchment',['territory'],['hp']),
  talent('veterans',[],['kill'],{unit:[{stat:'attack',factor:T.veterans.attack}]}),
  talent('conqueror',[],['capture','territory']),
  talent('protectiveGear',[],['hp'],{unit:[{stat:'defense',bonus:T.protectiveGear.defense}]}),
  talent('combatDrills',[],['kill'],{unit:[{stat:'attackSpeed',factor:T.combatDrills.attackSpeed}]}),
  talent('rangefinding',[],['kill'],{unit:[{stat:'range',factor:T.rangefinding.range}]}),
  talent('navalLogistics',[],['march'],{unit:[{stat:'seaSpeed',factor:T.navalLogistics.seaSpeed}]}),
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
  talent('livingOffLand',['kill','capture'],['funds'],{tradeoff:true,minLevel:T.livingOffLand.minLevel}),
  talent('massedRanks',['garrison'],['hp']),
  talent('grandGarrison',['training'],['garrison','death'],{tradeoff:true}),
  talent('militia',['territory'],['training','garrison','death']),
  talent('shockAssault',['march'],['kill','capture','territory','death'],{tradeoff:true}),
  talent('supplyColumns',['march'],['hp']),
  talent('encirclement',['territory'],['capture','territory','kill'],{minLevel:T.encirclement.minLevel}),
  talent('treasury',['funds'],['funds']),
  talent('warChest',['funds'],['kill']),
  talent('levy',['funds'],['training','garrison']),
  talent('arsenal',['funds'],['kill','hp']),
  talent('mercantilism',['territory'],['funds'],{tradeoff:true,unit:[{stat:'attack',factor:T.mercantilism.attack}]}),
  talent('fortressDoctrine',['fortress'],['hp','building','fortress']),
  talent('bastionGuns',['fortress'],['kill']),
  talent('tradeRoutes',['market'],['funds']),
  talent('academy',['barracks'],['xp']),
  talent('conscription',['barracks'],['garrison']),
  talent('industrialBase',['building','funds'],['fortress','market','barracks','building'],{minLevel:T.industrialBase.minLevel}),
  // Signature talents: one unit kind each.
  talent('shieldWall',['training'],['garrison','death'],{kinds:['infantry'],tradeoff:true,unit:[{stat:'hp',factor:T.shieldWall.hp}]}),
  talent('pensions',['death'],['funds'],{kinds:['infantry']}),
  talent('forwardMarksmen',['march'],['kill'],{kinds:['skirmisher']}),
  talent('lightInfantry',['territory'],['march','hp'],{kinds:['skirmisher'],unit:[{stat:'speed',factor:T.lightInfantry.speed}]}),
  talent('stormTroops',['fortress','capture'],['capture','territory','hp'],{kinds:['grenadier']}),
  talent('grenadeVolley',['garrison'],['kill'],{kinds:['grenadier']}),
  talent('charge',['march'],['kill','capture'],{kinds:['cavalry']}),
  talent('lightSaddles',['march'],['funds','training'],{kinds:['cavalry']}),
  talent('cuirass',['garrison'],['hp'],{kinds:['heavyCavalry'],unit:[{stat:'defense',bonus:T.cuirass.defense}]}),
  talent('breakthrough',['garrison'],['kill'],{kinds:['heavyCavalry'],unit:[{stat:'splash',bonus:T.breakthrough.splash}]}),
  talent('barrage',['garrison','fortress'],['kill','capture'],{kinds:['artillery']}),
  talent('wideSalvo',['garrison'],['kill'],{kinds:['artillery'],unit:[{stat:'splash',factor:T.wideSalvo.splash}]}),
  talent('flyingBattery',['march'],['hp'],{kinds:['horseArtillery']}),
  talent('pointBlank',[],['kill'],{kinds:['horseArtillery']}),
  talent('sappers',['building','garrison'],['building','fortress','market','barracks'],{kinds:['engineer']}),
  talent('breachDrills',['capture'],['kill','capture','territory'],{kinds:['engineer']}),
  talent('armoredSappers',['capture'],['hp','capture','territory'],{kinds:['engineer']}),
];
export const TALENT_BY_ID:ReadonlyMap<string,Talent>=new Map(TALENTS.map(t=>[t.id,t]));
export function talentAppliesToKind(t:Pick<Talent,'kinds'>,kind:Kind):boolean{return !t.kinds||t.kinds.includes(kind);}
export function hasTalent(p:Pick<Player,'talents'>|undefined,id:string):boolean{return p?.talents.includes(id)??false;}
export function upgradeCost(level:number):number {return Math.floor(UPGRADES.costBase*Math.pow(level+1,UPGRADES.costExponent));}
/** Funds for the next unit upgrade, including the Arsenal discount. */
export function upgradeCostFor(p:Pick<Player,'talents'>|undefined,level:number):number {
  const base=upgradeCost(level);return hasTalent(p,'arsenal')?Math.floor(base*T.arsenal.cost):base;
}
export function stats(p:Pick<Player,'talents'|'upgrades'>|undefined,kind:Kind):UnitStats {
  const b=UNITS[kind],u=p?.upgrades[kind];
  const result={...b,hp:b.hp+(u?.health??0)*UPGRADES.healthPerLevel,attack:b.attack+(u?.attack??0)*UPGRADES.attackPerLevel,speed:b.speed+(u?.speed??0)*UPGRADES.speedPerLevel};
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
    &&(v.appearance===undefined||validAppearance(v.appearance))
    &&(v.flag===undefined||validFlag(v.flag))
    &&(v.ai===undefined||typeof v.ai==='boolean');
}
