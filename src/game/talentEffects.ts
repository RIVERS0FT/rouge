import {TALENTS,type UnitStats} from './content.ts';
import {MAP} from './map.ts';
import type {GameState,Kind,Player,Province,Unit} from './types.ts';

// Imported by groundKernel.ts while map.ts is still loading: keep top-level code free of map/economy reads.
/** Per-unit combat lanes shared by the WASM kernels and the exact JS fallback.
 * Lane 18 carries these bits, lane 30 the damage-taken reduction (negative =
 * extra damage), lane 31 the additive damage-dealt bonus. */
export const MODE_TARGET_MASK=3,MODE_VS_MARCHING=1,MODE_VS_GARRISON=2,MODE_POINT_BLANK=3;
export const MODE_SECONDARY_HEAVY=4,MODE_SECONDARY_HALF=8,MODE_WIDE_SALVO=16,MODE_SPLASH_RESIST=32;
export const TARGET_BONUS=.4,POINT_BLANK_BONUS=.5,POINT_BLANK_RANGE_SQUARED=9,SPLASH_RESIST_FACTOR=.4;
export const MAX_DAMAGE_REDUCTION=.75,MAX_DAMAGE_INCREASE=.5,ENCIRCLED_DAMAGE=.3;
export const FORTRESS_GUARD=[.25,.4,.5] as const,BASTION_ATTRITION=[.04,.06,.08] as const,ACADEMY_XP=[.5,1,1.5] as const;
export const SAPPER_INTERVAL_TICKS=200,PULSE_TICKS=20;
export function secondaryMultiplier(mode:number):number{const value=(mode>>2)&3;return value===1?.7:value===2?.5:.35;}
export function secondaryTargets(mode:number):number{return mode&MODE_WIDE_SALVO?4:2;}

const kindOf=(id:string):Kind|undefined=>TALENTS.find(t=>t.id===id)?.kinds?.[0];
const SIGNATURE_KIND={
 charge:kindOf('charge'),breachDrills:kindOf('breachDrills'),armoredSappers:kindOf('armoredSappers'),stormTroops:kindOf('stormTroops'),
 lightInfantry:kindOf('lightInfantry'),flyingBattery:kindOf('flyingBattery'),
} as const;
const MODE_BITS:[string,number][]=[['forwardMarksmen',MODE_VS_MARCHING],['barrage',MODE_VS_GARRISON],['pointBlank',MODE_POINT_BLANK],
 ['grenadeVolley',MODE_SECONDARY_HEAVY],['breakthrough',MODE_SECONDARY_HALF],['wideSalvo',MODE_WIDE_SALVO],['cuirass',MODE_SPLASH_RESIST]];

/** Talent flags read in hot loops. Talents are only ever added, so the count keys the cache. */
export interface TalentProfile{
 readonly count:number;
 readonly combat:boolean;readonly mode:number;readonly modeKind:Kind|undefined;
 readonly entrenchment:boolean;readonly fortressDoctrine:boolean;readonly massedRanks:boolean;readonly pursuit:boolean;
 readonly shockAssault:boolean;readonly charge:boolean;readonly breachDrills:boolean;readonly armoredSappers:boolean;
 readonly stormTroops:boolean;readonly lightInfantry:boolean;readonly flyingBattery:boolean;readonly warChest:boolean;readonly logistics:boolean;
 readonly encirclement:boolean;readonly siegeLines:boolean;readonly raid:boolean;readonly militia:boolean;readonly levy:boolean;
 readonly tradeRoutes:boolean;readonly academy:boolean;readonly sappers:boolean;readonly bastionGuns:boolean;
 readonly fieldMedicine:boolean;readonly supplyColumns:boolean;readonly treasury:boolean;
 readonly trainingFactor:number;readonly capacityFactor:number;readonly capacityBonus:number;readonly barracksCapacity:boolean;
}
const profiles=new WeakMap<Pick<Player,'talents'>,TalentProfile>();
export function talentProfile(player:Pick<Player,'talents'>):TalentProfile{
 const cached=profiles.get(player);if(cached&&cached.count===player.talents.length)return cached;
 const has=(id:string)=>player.talents.includes(id);
 let mode=0,modeKind:Kind|undefined;
 for(const [id,bit]of MODE_BITS)if(has(id)){mode|=bit;modeKind=kindOf(id);}
 const flags={
  entrenchment:has('entrenchment'),fortressDoctrine:has('fortressDoctrine'),massedRanks:has('massedRanks'),pursuit:has('pursuit'),
  shockAssault:has('shockAssault'),charge:has('charge'),breachDrills:has('breachDrills'),armoredSappers:has('armoredSappers'),
  stormTroops:has('stormTroops'),lightInfantry:has('lightInfantry'),flyingBattery:has('flyingBattery'),warChest:has('warChest'),logistics:has('logistics'),
 };
 // Training speed: Mobilization, Grand Garrison's cost and Human Wave's 25% shorter training time.
 let trainingFactor=1;if(has('industry'))trainingFactor*=1.2;if(has('grandGarrison'))trainingFactor*=.85;if(has('shieldWall'))trainingFactor/=.75;
 const profile:TalentProfile={count:player.talents.length,mode,modeKind,...flags,combat:mode!==0||Object.values(flags).some(Boolean),
  encirclement:has('encirclement'),siegeLines:has('siegeLines'),raid:has('lightSaddles'),militia:has('militia'),levy:has('levy'),
  tradeRoutes:has('tradeRoutes'),academy:has('academy'),sappers:has('sappers'),bastionGuns:has('bastionGuns'),
  fieldMedicine:has('fieldMedicine'),supplyColumns:has('supplyColumns'),treasury:has('treasury'),
  trainingFactor,capacityFactor:has('grandGarrison')?1.5:1,capacityBonus:has('shieldWall')?4:0,barracksCapacity:has('conscription')};
 profiles.set(player,profile);return profile;
}

/** Talent state shared by everything that runs within one simulation tick. */
export interface TalentContext{
 readonly tick:number;readonly topology:number;readonly players:readonly Player[];readonly profiles:readonly TalentProfile[];
 /** Province → countries that currently encircle it (only holders of Encirclement). */
 readonly encirclers:ReadonlyMap<number,readonly number[]>;
 readonly warChest:Float64Array;readonly anyCombat:boolean;readonly anyMassed:boolean;
}
const contexts=new WeakMap<GameState,TalentContext>();
export function talentContext(state:GameState):TalentContext{
 const cached=contexts.get(state);
 if(cached&&cached.tick===state.tick&&cached.topology===state.topology&&cached.players.length===state.players.length&&cached.players.every((p,i)=>p===state.players[i]&&cached.profiles[i].count===p.talents.length))return cached;
 const list=state.players.map(talentProfile),warChest=new Float64Array(state.players.length);
 for(const p of state.players)if(list[p.id].warChest)warChest[p.id]=Math.min(.3,.03*Math.floor(p.funds/100));
 const context:TalentContext={tick:state.tick,topology:state.topology,players:state.players.slice(),profiles:list,
  encirclers:list.some(p=>p.encirclement)?findEncirclements(state,list):new Map(),
  warChest,anyCombat:list.some(p=>p.combat),anyMassed:list.some(p=>p.massedRanks)};
 contexts.set(state,context);return context;
}
/** A region is encircled by a holder that owns at least two of its playable
 * neighbours and at least half of them. Neutral regions can be encircled. */
function findEncirclements(state:GameState,list:readonly TalentProfile[]):Map<number,number[]>{
 const result=new Map<number,number[]>(),owners:number[]=[],counts:number[]=[];
 for(const region of MAP){
  if(!region.playable)continue;const owner=state.provinces[region.id].owner;let total=0;owners.length=0;counts.length=0;
  for(const id of region.neighbors){
   if(!MAP[id]?.playable)continue;total++;const neighbor=state.provinces[id].owner;
   if(neighbor<0||neighbor===owner||!list[neighbor]?.encirclement)continue;
   const at=owners.indexOf(neighbor);if(at<0){owners.push(neighbor);counts.push(1);}else counts[at]++;
  }
  for(let i=0;i<owners.length;i++)if(counts[i]>=2&&counts[i]*2>=total){const ids=result.get(region.id);if(ids)ids.push(owners[i]);else result.set(region.id,[owners[i]]);}
 }
 return result;
}
export function encircledBy(context:TalentContext,region:number,player:number):boolean{return context.encirclers.get(region)?.includes(player)??false;}

export interface CombatLanes{mode:Float64Array;taken:Float64Array;dealt:Float64Array;speed:Float64Array}
let lanes:CombatLanes={mode:new Float64Array(0),taken:new Float64Array(0),dealt:new Float64Array(0),speed:new Float64Array(0)};
let massedCounts=new Uint32Array(0);const massedTouched:number[]=[];
/** Per-unit combat modifiers for this tick. `speed` is NaN where the land speed stays unchanged.
 * The returned arrays are reused by the next call. */
export function combatLanes(units:readonly Unit[],state:GameState,statsFor:(owner:number,kind:Kind)=>UnitStats,context=talentContext(state)):CombatLanes{
 const n=units.length;
 if(lanes.mode.length<n){const size=Math.max(n,lanes.mode.length*2,64);lanes={mode:new Float64Array(size),taken:new Float64Array(size),dealt:new Float64Array(size),speed:new Float64Array(size)};}
 const {mode,taken,dealt,speed}=lanes;mode.fill(0,0,n);taken.fill(0,0,n);dealt.fill(0,0,n);speed.fill(NaN,0,n);
 const encircled=context.encirclers.size>0;
 if(!context.anyCombat&&!encircled)return lanes;
 const regions=MAP.length,provinces=state.provinces;
 if(context.anyMassed){
  if(massedCounts.length<(state.players.length)*regions)massedCounts=new Uint32Array(state.players.length*regions);
  for(const u of units)if(u.owner>=0&&!u.transport?.embarked&&context.profiles[u.owner].massedRanks){const key=u.owner*regions+u.province;if(!massedCounts[key])massedTouched.push(key);massedCounts[key]++;}
 }
 for(let i=0;i<n;i++){
  const u=units[i],province=u.province,region=provinces[province],regionOwner=region?region.owner:-1;
  let reduction=0,bonus=0;
  if(encircled&&u.owner===regionOwner&&context.encirclers.has(province))reduction-=ENCIRCLED_DAMAGE;
  if(u.owner>=0){
   const profile=context.profiles[u.owner];
   if(profile.combat){
    const kind=u.kind,own=regionOwner===u.owner,marching=u.target!==null,embarked=Boolean(u.transport?.embarked);
    const assault=marching&&provinces[u.target!].owner!==u.owner,capturing=marching&&u.target===province&&!own;
    if(profile.modeKind===kind)mode[i]=profile.mode;
    if(profile.entrenchment&&own)reduction+=.15;
    if(profile.fortressDoctrine&&own&&region.construction?.kind==='fortress')reduction+=FORTRESS_GUARD[region.construction.level-1];
    if(profile.massedRanks&&!embarked&&massedCounts[u.owner*regions+province]>=8)reduction+=.2;
    if(profile.pursuit&&own&&region.recovery>0){reduction+=.15;bonus+=.2;}
    if(profile.lightInfantry&&!own&&kind===SIGNATURE_KIND.lightInfantry)reduction+=.15;
    if(capturing){
     if(profile.stormTroops&&kind===SIGNATURE_KIND.stormTroops)reduction+=.2;
     if(profile.armoredSappers&&kind===SIGNATURE_KIND.armoredSappers)reduction+=.25;
     if(profile.breachDrills&&kind===SIGNATURE_KIND.breachDrills)bonus+=.25;
    }
    if(marching){
     if(profile.flyingBattery&&kind===SIGNATURE_KIND.flyingBattery)reduction+=.3;
     if(profile.charge&&kind===SIGNATURE_KIND.charge)bonus+=.35;
    }
    if(profile.shockAssault)bonus+=assault?.25:marching?0:-.1;
    if(profile.warChest)bonus+=context.warChest[u.owner];
    if(profile.logistics)speed[i]=statsFor(u.owner,kind).speed*(marching&&!assault?1.4:1);
   }
  }
  taken[i]=Math.max(-MAX_DAMAGE_INCREASE,Math.min(MAX_DAMAGE_REDUCTION,reduction));dealt[i]=bonus;
 }
 for(const key of massedTouched)massedCounts[key]=0;massedTouched.length=0;
 return lanes;
}

/** Trade Routes: +0.25 funds/day for each neighbouring market of the same owner. */
export function tradeBonus(state:Pick<GameState,'provinces'>,region:number,owner:Pick<Player,'talents'>|undefined):number{
 if(!owner||!talentProfile(owner).tradeRoutes)return 0;const ownerId=state.provinces[region].owner;let markets=0;
 for(const id of MAP[region].neighbors){const neighbor=state.provinces[id];if(neighbor&&MAP[id].playable&&neighbor.owner===ownerId&&neighbor.construction?.kind==='market')markets++;}
 return markets*.25;
}
/** Experience per day from barracks under the Academy talent. */
export function academyExperience(province:Pick<Province,'construction'>):number{
 const b=province.construction;return b?.kind==='barracks'?ACADEMY_XP[b.level-1]:0;
}
export function bastionAttrition(province:Pick<Province,'construction'>):number{
 const b=province.construction;return b?.kind==='fortress'?BASTION_ATTRITION[b.level-1]:0;
}
