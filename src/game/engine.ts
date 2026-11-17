import {updateUnitsFallback} from './unitFallback.ts';
import {initializeBattleMemory,kernel,blockedByBuildings,type UnitCensus,separateGround,updateBattleUnits} from './groundKernel.ts';
import {countryActions,isMarchFraction,marchDispatchCount,type CountryAction} from './countryActions.ts';
import {availableTalentIds,canRerollTalent,talentRerollCost} from './talentReroll.ts';
import {assignCountryNames} from './countryNames.ts';
import { isEliminated, settleEliminations } from './elimination.ts';
export { isEliminated } from './elimination.ts';
import { chooseSpawnRegions, getSpawnCapacity } from './spawns.ts';
import { MAP, BOUNDS, provinceAt, pointInProvince, PLAYABLE_COUNT } from './map.ts';
import {TerrainNavigator,terrainAt,terrainSegment,terrainLocalSegment,terrainClearance,travelCorridorPoint,distanceToTravelSegment,TRAVEL_LOCAL_OFFSET} from './terrain-navigation.ts';
import {UNIT_RADIUS,COLLISION_MAX_PUSH,separateCircles,motionAngle,type CollisionReport} from './collision.ts';
import {buildingSegment,buildingStep} from './buildings.ts';
import {INITIAL_TERRITORY_GROUPING} from './map.ts';
import {regionCapacity,regionProductionRate,applyGroupingCommand,reconcileGrouping,capacityFor} from './territoryEconomy.ts';

import {STARTING_FUNDS,MAX_FUNDS,captureReward,recoveryDuration,constructionCost,isConstructionKind,recoveryMultiplier,fundsIncomeRate,constructionProductionMultiplier,captureSpeedMultiplier,maxConstructionLevel,plunderMultiplier,salvageValue,treasuryInterest} from './construction.ts';
import {talentContext,combatLanes,tradeBonus,academyExperience,bastionAttrition,encircledBy,PULSE_TICKS,SAPPER_INTERVAL_TICKS,type TalentContext,type CombatLanes} from './talentEffects.ts';
import {aiTalentChoice} from './talentBuilds.ts';
import {settleArmies} from './armies.ts';
import {CombatLog,settleBattles} from './battles.ts';
import {isRegionGarrison} from './capacity.ts';
import { DT, MAP_ID, STATE_VERSION, KINDS, STATS, UNITS, stats, upgradeCostFor, validateSetup, TALENT_BY_ID, talentApplies, talentAppliesToKind, hasTalent } from './content.ts';
import type { GameState, PlayerSetup, Player, Province, Unit, Kind, Result, MarchOrder } from './types.ts';
import type { MarchFraction } from './countryActions.ts';
/** States from before armies (v0.32 and older) start with empty army and battle ledgers. */
export function normalizeArmyState(s:GameState):void{
  if(!Array.isArray(s.armies))s.armies=[];if(!Number.isInteger(s.nextArmy))s.nextArmy=1;
  if(!Array.isArray(s.battles))s.battles=[];if(!Number.isInteger(s.nextBattle))s.nextBattle=1;
}
function random(s:GameState):number{let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
export function createGame(setups:PlayerSetup[],seed=20261108,campaign=`campaign-${seed}`):GameState{
  if(setups.length<2||setups.length>getSpawnCapacity()||!setups.every(validateSetup))throw new Error('invalidSetup');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||campaign.length>100)throw new Error('invalidSetup');
  const s:GameState={version:STATE_VERSION,map:MAP_ID,neutralGarrisonModel:'preplaced',campaign,seed,rng:(seed>>>0)||1,tick:0,nextId:1,topology:0,grouping:structuredClone(INITIAL_TERRITORY_GROUPING),spawnModel:'single',players:[],provinces:MAP.map(p=>({id:p.id,owner:-1,production:0,kind:'infantry',recovery:0,captor:-1,capture:0})),units:[],events:[],winner:null,domination:setups.map(()=>0),armies:[],nextArmy:1,battles:[],nextBattle:1};
  s.players=setups.map((p,id)=>({id,name:p.name.trim(),leader:p.leader,...(p.flag?{flag:structuredClone(p.flag)}:{}),loadout:[...p.loadout],ai:p.ai??false,funds:STARTING_FUNDS,xp:0,level:1,upgrades:Object.fromEntries(KINDS.map(k=>[k,{attack:0,health:0,speed:0}])) as Player['upgrades'],talents:[],choices:[],drafts:0,rerollsUsed:0}));
  // Start every seat on exactly one locked gameplay province, with five units.
  const spawnRegions=chooseSpawnRegions(seed,setups.length);
  assignCountryNames(s.players,spawnRegions.map(id=>MAP[id]));
  spawnRegions.forEach((id,actor)=>{s.provinces[id].owner=actor;});
  // Five garrison units per playable tile, including untouched neutral land.
  // During setup, use a local spatial lookup rather than scanning thousands of
  // units for each placement. Normal reinforcements still use live positions.
  const cellSize=9,key=(x:number,z:number)=>`${x}:${z}`,placed=new Map<string,Unit[]>();
  for(const p of s.provinces) {
    if(!MAP[p.id].playable)continue;
    if(p.owner>=0)p.kind=s.players[p.owner].loadout[0];
    const center=MAP[p.id].center,nearby:Unit[]=[];
    for(let x=Math.floor((center.x-9)/cellSize);x<=Math.floor((center.x+9)/cellSize);x++)
      for(let z=Math.floor((center.z-9)/cellSize);z<=Math.floor((center.z+9)/cellSize);z++)
        for(const u of placed.get(key(x,z))??[])
          if(Math.abs(u.x-center.x)<9&&Math.abs(u.z-center.z)<9)nearby.push(u);
    for(let i=0;i<5;i++)if(spawn(s,p.id,p.kind,nearby)){
      const u=s.units[s.units.length-1],slot=key(Math.floor(u.x/cellSize),Math.floor(u.z/cellSize));
      const bucket=placed.get(slot)??[];bucket.push(u);placed.set(slot,bucket);
      nearby.push(u);
    }
  }
  s.grouping=reconcileGrouping(s);return s;
}
function spawn(s:GameState,province:number,kind:Kind,initialNearby?:readonly Unit[],nearbyHint?:readonly Unit[]):boolean{
  const p=s.provinces[province],id=s.nextId,c=MAP[province].center,radius=UNIT_RADIUS[kind];
  let x=c.x,z=c.z,best=-Infinity;
  const nearby=initialNearby??nearbyHint??s.units.filter(u=>!u.transport?.embarked&&Math.abs(u.x-c.x)<9&&Math.abs(u.z-c.z)<9);
  // Search a deterministic small formation; don't spawn every reinforcement on
  // the same center. Tiny islands may still have less room than a full footprint.
  for(let i=0;i<512;i++){
    const a=(id+i)*2.399963,r=i<384?3*Math.sqrt(i/383):3+5*Math.sqrt((i-384)/127),candidate={x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r};
    let gap=radius;
    for(const u of nearby){
      gap=Math.min(gap,Math.hypot(u.x-candidate.x,u.z-candidate.z)-UNIT_RADIUS[u.kind]);
      if(gap<=best)break;
    }
    if(gap<=best)continue;
    if(!pointInProvince(province,candidate.x,candidate.z)||!(initialNearby?terrainLocalSegment(c,candidate):terrainAt(candidate,true)>=0&&terrainSegment(c,candidate,false))||!buildingSegment(candidate,candidate,radius))continue;
    const score=Math.min(gap,terrainClearance(candidate,radius));if(score>best){best=score;x=candidate.x;z=candidate.z;}if(score>=radius-1e-6)break;
  }
  if(!Number.isFinite(best))return false;s.nextId++;
  s.units.push({id,owner:p.owner,kind,x,z,hp:stats(s.players[p.owner],kind).hp,province,target:null,origin:province,destination:null,route:[],cooldown:0});return true;
}
function draft(s:GameState,p:Player,previous:readonly string[]=[],keep?:string):void{
  if(p.choices.length||p.drafts<=0)return;
  // Offers are uniform: no build weighting. A reroll may keep one card in its first slot.
  const available=keep===undefined?availableTalentIds(p):availableTalentIds(p).filter(id=>id!==keep);
  for(let i=available.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  p.choices=keep===undefined?available.slice(0,3):[keep,...available.slice(0,2)];
  // A paid reroll must change at least one offered talent, not just its slot.
  if(previous.length===p.choices.length&&p.choices.every(id=>previous.includes(id))){
    const replacement=available.find(id=>!previous.includes(id));if(replacement)p.choices[p.choices.length-1]=replacement;
  }
  if(!p.choices.length)p.drafts=0;
}
function experience(s:GameState,id:number,amount:number):void{
  const p=s.players[id];if(!p)return;p.xp+=amount;
  while(p.level<8&&p.xp>=60+p.level*45){p.xp-=60+p.level*45;p.level++;p.drafts++;s.events.push({tick:s.tick,key:'level',player:id});}draft(s,p);
}
export const MARCH_INTERVAL_TICKS=Math.max(1,Math.round(.25/DT));
// Static land certificates cover the entire cell, all collision displacement,
// battalion footprints and the optional short corridor connector.
const openLandCells=new Map<number,Map<number,boolean>>();
function openLandCell(p:{x:number;z:number},reach:number):boolean {
 let cells=openLandCells.get(reach);if(!cells){cells=new Map();openLandCells.set(reach,cells);}
 const x=Math.floor(p.x/4),z=Math.floor(p.z/4),key=z*4096+x,cached=cells.get(key);if(cached!==undefined)return cached;
 const center={x:(x+.5)*4,z:(z+.5)*4},safety=reach+Math.SQRT2*2+1e-5;
 const clear=terrainAt(center,true)>=0&&terrainClearance(center,safety,true)===safety;
 if(cells.size>=32768)cells.delete(cells.keys().next().value!);cells.set(key,clear);return clear;
}
function buildUnitCensus(s:GameState,counts:Uint32Array,occupants:Uint32Array,nearOwner:Int32Array,engineers:Uint8Array):void {
 counts.fill(0);occupants.fill(0);nearOwner.fill(-2);engineers.fill(0);
 for(const u of s.units){
  if(u.transport?.embarked)continue;const id=u.province,center=MAP[id].center;occupants[id]++;counts[(u.owner+1)*MAP.length+id]++;
  if(Math.hypot(u.x-center.x,u.z-center.z)>=3.7)continue;
  if(nearOwner[id]===-2)nearOwner[id]=u.owner;else if(nearOwner[id]!==u.owner)nearOwner[id]=-3;
  if(u.kind==='engineer')engineers[id]=1;
 }
}
function addSleepingCensus(units:readonly Unit[],counts:Uint32Array,occupants:Uint32Array,nearOwner:Int32Array,engineers:Uint8Array):void {

 for(const u of units){
  if(u.transport?.embarked)continue;const id=u.province,center=MAP[id].center;occupants[id]++;counts[(u.owner+1)*MAP.length+id]++;
  if(Math.hypot(u.x-center.x,u.z-center.z)>=3.7)continue;
  if(nearOwner[id]===-2)nearOwner[id]=u.owner;else if(nearOwner[id]!==u.owner)nearOwner[id]=-3;
  if(u.kind==='engineer')engineers[id]=1;
 }
}
const WAKE_SIZE=16,WAKE_MIN_X=Math.floor(BOUNDS.left/WAKE_SIZE)-2,WAKE_MIN_Z=Math.floor(BOUNDS.top/WAKE_SIZE)-2,WAKE_COLS=Math.floor(BOUNDS.right/WAKE_SIZE)-WAKE_MIN_X+3,WAKE_ROWS=Math.floor(BOUNDS.bottom/WAKE_SIZE)-WAKE_MIN_Z+3;
export class Engine{
  private censusCounts:Uint32Array=new Uint32Array(0);private censusOccupants:Uint32Array=new Uint32Array(MAP.length);private censusNearOwner:Int32Array=new Int32Array(MAP.length);private censusEngineers:Uint8Array=new Uint8Array(MAP.length);
  private physicsDirty={all:false,units:new Set<Unit>(),owners:new Set<number>()};
  state:GameState;navigation=new TerrainNavigator();
  collision:CollisionReport={candidates:0,contacts:0,maxPenetration:0,limited:0,constraints:0,constraintLimited:0};
  constructor(state:GameState){initializeBattleMemory();this.state=structuredClone(state);normalizeArmyState(this.state);settleEliminations(this.state);this.clearBuildings();}
  invalidatePhysicsCache():void{this.physicsDirty.all=true;}
  command(actor:number,input:unknown):Result{
    if(this.awaitingPhysics)throw Error('A simulation step is already running');
    const s=this.state,p=Number.isInteger(actor)&&actor>=0?s.players[actor]:undefined,fail=(error:string):Result=>({ok:false,error});
    if(!p||s.winner!==null)return fail('notPlaying');if(isEliminated(s,actor))return fail('eliminated');if(!input||typeof input!=='object'||Array.isArray(input))return fail('invalidCommand');const c=input as CountryAction;
    switch(c.type){
      case 'mergeGroups':case 'splitGroup':{
        const input=c.type==='mergeGroups'?{type:'merge',mapId:MAP_ID,groups:c.groups,expectedRevision:c.expectedRevision}:{type:'split',mapId:MAP_ID,group:c.group,atoms:c.atoms,expectedRevision:c.expectedRevision};
        const result=applyGroupingCommand(s,actor,input);if(!result.ok)return fail(result.error);s.grouping=result.state;return{ok:true};
      }
      case 'march':{
        if(!Number.isInteger(c.from)||!Number.isInteger(c.to)||!isMarchFraction(c.fraction))return fail('invalidCommand');
        return this.muster(actor,[c.from],c.to,c.fraction);
      }
      case 'muster':{
        if(!Array.isArray(c.sources)||!c.sources.length||c.sources.length>MAP.length||!c.sources.every(id=>Number.isInteger(id))||new Set(c.sources).size!==c.sources.length||!Number.isInteger(c.to)||!isMarchFraction(c.fraction))return fail('invalidCommand');
        return this.muster(actor,c.sources,c.to,c.fraction);
      }
      case 'armyMarch':{
        if(!Number.isInteger(c.army)||!Number.isInteger(c.to))return fail('invalidCommand');
        const army=s.armies.find(candidate=>candidate.id===c.army);if(!army||army.owner!==actor)return fail('notOwner');
        if(!MAP[c.to]?.playable)return fail('invalidCommand');
        if(army.to===c.to)return{ok:true};
        const friendly=s.provinces[c.to].owner===actor,members=s.units.filter(u=>u.army===army.id&&u.target!==null);
        // Troops under way re-plan from where they stand. A battalion at sea, or one with no
        // route from its position, keeps its old order and leaves the army.
        const plans=new Map<Unit,NonNullable<Unit['travel']>>();
        for(const u of members){if(u.transport?.embarked)continue;const travel=this.planMarch(u,c.to);if(travel)plans.set(u,travel);}
        const queued=s.provinces.some(p=>p.march?.army===army.id);
        if(!plans.size&&!queued)return fail('unreachable');
        for(const u of members){
          const travel=plans.get(u);if(!travel){delete u.army;continue;}
          u.target=c.to;u.origin=u.province;u.destination=c.to;u.route=[];u.travel=travel;delete u.transport;this.physicsDirty.units.add(u);
          if(!friendly)u.assault=c.to;else delete u.assault;
        }
        for(const p of s.provinces){
          const order=p.march;if(order?.army!==army.id)continue;
          const next:MarchOrder={...order,to:c.to};if(friendly&&s.provinces[c.to].owner===p.owner)next.reserved=true;else delete next.reserved;
          if(c.to===p.id)delete p.march;else p.march=next;
        }
        army.to=c.to;return{ok:true};
      }
      case 'construct':{
        // Level 3 exists only for countries with Industrial Base; a forged third level is malformed.
        if(!Number.isInteger(c.province)||!isConstructionKind(c.kind)||(c.expectedLevel!==0&&c.expectedLevel!==1&&(c.expectedLevel!==2||maxConstructionLevel(p)<3)))return fail('invalidCommand');
        const province=s.provinces[c.province];
        if(!province||!MAP[c.province]?.playable||province.owner!==actor)return fail('notOwner');
        if(province.capture>0)return fail('constructionContested');
        const level=province.construction?.level??0;
        if(province.construction&&province.construction.kind!==c.kind)return fail('slotOccupied');
        if(level>=maxConstructionLevel(p))return fail('maxLevel');
        if(level!==c.expectedLevel)return fail('constructionChanged');
        const cost=constructionCost(c.kind,level,p),funds=p.funds;
        if(funds<cost)return fail('noFunds');
        p.funds=funds-cost;
        province.construction={kind:c.kind,level:level===0?1:level===1?2:3};
        return{ok:true};
      }
      case 'production':{
        if(!Number.isInteger(c.province)||!KINDS.includes(c.kind)||!p.loadout.includes(c.kind))return fail('invalidCommand');
        const province=s.provinces[c.province];if(!province||!MAP[c.province].playable||province.owner!==actor)return fail('notOwner');
        // Keep the fractional work when changing the queue; switching never grants a free unit.
        province.production=Math.min(province.production/UNITS[province.kind].train,0.99)*UNITS[c.kind].train;province.kind=c.kind;return{ok:true};
      }
      case 'upgrade':{
        if(!KINDS.includes(c.kind)||!STATS.includes(c.stat)||!p.loadout.includes(c.kind))return fail('invalidCommand');
        const level=p.upgrades[c.kind][c.stat],cost=upgradeCostFor(p,level);if(level>=8)return fail('maxLevel');if(p.funds<cost)return fail('noFunds');
        const oldHp=stats(p,c.kind).hp;p.funds-=cost;p.upgrades[c.kind][c.stat]++;this.physicsDirty.owners.add(actor);
        if(c.stat==='health'){const newHp=stats(p,c.kind).hp;for(const u of s.units)if(u.owner===actor&&u.kind===c.kind)u.hp=u.hp/oldHp*newHp;}return{ok:true};
      }
      case 'talent':{
        const talent=typeof c.id==='string'?TALENT_BY_ID.get(c.id):undefined;
        if(!talent||p.drafts<1||!p.choices.includes(talent.id)||p.talents.includes(talent.id)||!talentApplies(talent,p.loadout)||p.level<(talent.minLevel??1))return fail('invalidChoice');
        this.physicsDirty.owners.add(actor);
        for(const mod of talent.unit??[])if(mod.stat==='hp'||mod.stat==='attackSpeed'){
          // The selected modifier applies to deployed troops as well as future ones.
          // Keep both the current HP fraction and progress through a running attack cooldown.
          const factor=mod.factor??1;
          for(const u of s.units)if(u.owner===actor&&talentAppliesToKind(talent,u.kind)){
            if(mod.stat==='hp')u.hp*=factor;else u.cooldown/=factor;
          }
        }
        if(talent.id==='rapidRecovery'){
          const before=recoveryDuration(p);
          p.talents.push(talent.id);
          const ratio=recoveryDuration(p)/before;
          for(const province of s.provinces)if(province.owner===actor)province.recovery*=ratio;
        }else p.talents.push(talent.id);
        p.choices=[];p.drafts--;draft(s,p);return{ok:true};
      }
      case 'reroll':{
        if(c.keep!==undefined&&(typeof c.keep!=='string'||!p.choices.includes(c.keep)))return fail('invalidCommand');
        if(!canRerollTalent(p,c.keep))return fail('noTalentReroll');
        const cost=talentRerollCost(p);
        if(c.expectedCost!==undefined){
          if(!Number.isSafeInteger(c.expectedCost)||c.expectedCost<1)return fail('invalidCommand');
          if(c.expectedCost!==cost)return fail('talentRerollPriceChanged');
        }
        if(p.funds<cost)return fail('noFunds');
        const previous=p.choices;
        p.funds-=cost;p.rerollsUsed++;
        p.choices=[];draft(s,p,previous,c.keep);return{ok:true};
      }
      default:return fail('invalidCommand');
    }
  }
  prewarmNavigation():void {
    const s=this.state,units=new Map(s.units.map(u=>[u.id,u]));
    for(const province of s.provinces){const order=province.march;if(!order||order.owner!==province.owner)continue;
      for(const id of order.pendingIds){const u=units.get(id);if(!u||!isRegionGarrison(u,order.owner,province.id))continue;const st=stats(s.players[u.owner],u.kind);if(this.navigation.plan(u,MAP[order.to].center,st.speed,st.seaSpeed))break;}
    }
  }
  step(count=1):void{if(this.parallelBusy)throw Error('A simulation step is already running');this.physicsDirty.all=true;for(let n=0;n<count;n++){if(this.state.winner!==null)return;this.tick();}}
  private activeUnitsLegacy():Unit[]{
    const s=this.state;
    // Preplaced neutral guards never travel on their own. Keep them as actual
    // units for rendering, saves and province accounting, but skip remote idle
    // simulation. A full cell of padding exceeds any attack/splash range plus
    // movement and collision correction budget in a tick. Embarked hostiles
    // also wake nearby guards before a possible same-tick disembarkation.
    const size=16,key=(x:number,z:number)=>x>=-32768&&x<32768&&z>=-32768&&z<32768?(z+32768)*65536+x+32768:`${x}:${z}`,occupied=new Set<number|string>(),active=new Set<number|string>();
    for(const u of s.units)if(u.owner>=0){
      const x=Math.floor(u.x/size),z=Math.floor(u.z/size),cell=key(x,z);
      if(occupied.has(cell))continue;occupied.add(cell);
      for(let a=x-1;a<=x+1;a++)for(let b=z-1;b<=z+1;b++)active.add(key(a,b));
    }
    // Guards leaving the active area finish an already-running cooldown.
    // Nonstandard imported movement orders are never put to sleep.
    return s.units.filter(u=>u.owner>=0||u.cooldown>0||u.target!==null||u.travel||u.transport||
      active.has(key(Math.floor(u.x/size),Math.floor(u.z/size))));
  }
  private wakeOwned=new Uint32Array(WAKE_COLS*WAKE_ROWS);private wakeActive=new Uint32Array(WAKE_COLS*WAKE_ROWS);private wakeEpoch=0;private awake:Unit[]=[];private sleeping:Unit[]=[];
  private activeUnits():Unit[]{
    let epoch=++this.wakeEpoch;if(epoch>=0xffffffff){this.wakeEpoch=epoch=1;this.wakeOwned.fill(0);this.wakeActive.fill(0);}
    const owned=this.wakeOwned,active=this.wakeActive,units=this.state.units,result=this.awake;result.length=0;this.sleeping=[];
    for(let i=0;i<units.length;i++){
      const u=units[i];if(u.owner<0)continue;const x=Math.floor(u.x/16)-WAKE_MIN_X,z=Math.floor(u.z/16)-WAKE_MIN_Z;
      if(x<1||z<1||x>=WAKE_COLS-1||z>=WAKE_ROWS-1){const legacy=this.activeUnitsLegacy(),seen=new Set(legacy);this.sleeping=units.filter(u=>!seen.has(u));return legacy;}
      const cell=z*WAKE_COLS+x;if(owned[cell]===epoch)continue;owned[cell]=epoch;
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)active[cell+dz*WAKE_COLS+dx]=epoch;
    }
    for(let i=0;i<units.length;i++){
      const u=units[i];if(u.owner>=0||u.cooldown>0||u.target!==null||u.travel||u.transport){result.push(u);continue;}
      const x=Math.floor(u.x/16)-WAKE_MIN_X,z=Math.floor(u.z/16)-WAKE_MIN_Z;
      if(x>=0&&z>=0&&x<WAKE_COLS&&z<WAKE_ROWS&&active[z*WAKE_COLS+x]===epoch)result.push(u);else this.sleeping.push(u);
    }
    return result;
  }
  /** Positions of the prepared active units before movement, for head-on contacts in `separate`. */
  private departure=new Float64Array(0);
  private prepareTick(){
    const s=this.state,topologyBefore=s.topology;s.tick++;
    const active=this.activeUnits();this.clearBuildings(active);
    if(this.departure.length<active.length*2)this.departure=new Float64Array(active.length*2);
    // Like the native solver, units with a transport have no recorded start (motion NaN).
    for(let i=0;i<active.length;i++){const u=active[i];this.departure[i*2]=u.transport?NaN:u.x;this.departure[i*2+1]=u.transport?NaN:u.z;}
    const statCache=new Map<number,Map<Kind,ReturnType<typeof stats>>>();
    const unitStats=(owner:number,kind:Kind)=>{let values=statCache.get(owner);if(!values){values=new Map();statCache.set(owner,values);}let value=values.get(kind);if(!value){value=stats(s.players[owner],kind);values.set(kind,value);}return value;};
    // Talent combat lanes from orders, positions and ownership at the start of the tick.
    const lanes=combatLanes(active,s,unitStats);
    return {active,unitStats,topologyBefore,lanes};
  }
  private updatePrepared(frame:ReturnType<Engine['prepareTick']>):void {
    const damage=new Map<number,{amount:number;attacker:number}>();
    try{updateBattleUnits(frame.active,frame.unitStats,this.state,damage,frame.lanes);}
    catch{damage.clear();updateUnitsFallback(frame.active,frame.unitStats,this.state,damage,u=>this.halt(u));}
    this.finishTick(frame.active,damage,frame.topologyBefore);
  }
  private tick():void{this.updatePrepared(this.prepareTick());}
  private parallelBusy=false;private awaitingPhysics=false;
  async stepParallel(run:(active:readonly Unit[],statsFor:(owner:number,kind:Kind)=>ReturnType<typeof stats>,state:GameState,dirty:{all:boolean;units:Set<Unit>;owners:Set<number>},lanes:CombatLanes)=>Promise<{damage:Map<number,{amount:number;attacker:number}>;collision:CollisionReport;census?:UnitCensus}>,count=1):Promise<void>{
    if(this.parallelBusy)throw Error('A simulation step is already running');this.parallelBusy=true;
    try{for(let i=0;i<count;i++){
      if(this.state.winner!==null)return;const frame=this.prepareTick();
      if(frame.active.length<256){this.physicsDirty.all=true;this.updatePrepared(frame);continue;}
      let result;
      try{this.awaitingPhysics=true;result=await run(frame.active,frame.unitStats,this.state,this.physicsDirty,frame.lanes);}
      catch{this.awaitingPhysics=false;this.physicsDirty.all=true;this.updatePrepared(frame);continue;}
      finally{this.awaitingPhysics=false;}
      this.physicsDirty={all:false,units:new Set<Unit>(),owners:new Set<number>()};this.finishTick(frame.active,result.damage,frame.topologyBefore,result.collision,result.census);
    }}finally{this.parallelBusy=false;}
  }
  private spawnIndex:Map<number|string,Unit[]>|undefined;private nativeSpawnUnits:readonly Unit[]|undefined;private freshSpawns:Unit[]=[];
  private finishTick(active:readonly Unit[],damage:Map<number,{amount:number;attacker:number}>,topologyBefore:number,collision?:CollisionReport,census?:UnitCensus):void{
    this.spawnIndex=undefined;this.nativeSpawnUnits=census?active:undefined;this.freshSpawns=[];const s=this.state,popKey=(owner:number,region:number)=>(owner+1)*MAP.length+region;
    // Talent state is fixed at the start of the tick for every rule below.
    const context=talentContext(s),pulse=s.tick%PULSE_TICKS===0,attrition=pulse&&context.profiles.some(p=>p.bastionGuns),combat=new CombatLog();
    // Apply accumulated damage simultaneously, so entity iteration order cannot prevent retaliation.
    // Bastion attrition joins the daily pass: enemies inside a holder's fortress region lose health.
    for(const u of s.units){
      const hit=damage.get(u.id);let amount=hit?hit.amount:0,killer=hit?hit.attacker:-1;
      if(attrition&&!u.transport?.embarked){
        const region=s.provinces[u.province],holder=region?region.owner:-1;
        if(holder>=0&&holder!==u.owner&&context.profiles[holder].bastionGuns&&region.construction?.kind==='fortress'){amount+=bastionAttrition(region)*stats(s.players[u.owner],u.kind).hp;if(!hit)killer=holder;this.physicsDirty.units.add(u);}
      }
      if(amount){u.hp-=amount;if(u.hp<=0)this.unitKilled(u,killer);}
      if(hit)combat.note(u.province,u.owner,hit.attacker,u.hp<=0);
    }
    s.units=s.units.filter(u=>u.hp>0);settleBattles(s,combat);
    if(collision)this.collision=collision;else this.separate(active);
    // Incoming orders and physical occupants affect training only, never march orders.
    // Sparse destinations scale with moving armies, not players × the entire map.
    const reservations=new Map<number,number>();
    for(const u of s.units)if(u.destination!==null&&u.province!==u.destination){const key=popKey(u.owner,u.destination);reservations.set(key,(reservations.get(key)??0)+1);}
    const queuedReservations=new Map<number,number>();
    for(const province of s.provinces){
      const order=province.march;
      if(!order||!order.reserved||province.owner!==order.owner||s.provinces[order.to].owner!==order.owner)continue;
      const key=popKey(order.owner,order.to);queuedReservations.set(key,(queuedReservations.get(key)??0)+order.pendingIds.length);
    }
    if(census){this.censusCounts=census.counts;this.censusOccupants=census.occupants;this.censusNearOwner=census.nearOwner;this.censusEngineers=census.engineers;addSleepingCensus(this.sleeping,this.censusCounts,this.censusOccupants,this.censusNearOwner,this.censusEngineers);}else{
    if(this.censusCounts.length!==(s.players.length+1)*MAP.length)this.censusCounts=new Uint32Array((s.players.length+1)*MAP.length);
    if(this.censusOccupants.length!==MAP.length){this.censusOccupants=new Uint32Array(MAP.length);this.censusNearOwner=new Int32Array(MAP.length);this.censusEngineers=new Uint8Array(MAP.length);}
    buildUnitCensus(s,this.censusCounts,this.censusOccupants,this.censusNearOwner,this.censusEngineers);
    }
    const raiders=context.profiles.flatMap((profile,id)=>profile.raid?[id]:[]),academy=new Float64Array(s.players.length);
    for(const province of s.provinces){
      if(!MAP[province.id].playable||(province.owner<0&&!this.censusOccupants[province.id]))continue;
      const nearOwner=this.censusNearOwner[province.id],attacker=nearOwner>=0&&nearOwner!==province.owner?nearOwner:-1;
      if(attacker>=0){
        if(province.captor!==attacker){province.captor=attacker;province.capture=0;}
        const player=s.players[attacker],engineers=Boolean(this.censusEngineers[province.id]),profile=context.profiles[attacker];
        province.capture+=DT*(profile.stormTroops?1:captureSpeedMultiplier(province))*(engineers?1.5:1)*(player.talents.includes('conqueror')?1.3:1)*(profile.encirclement&&encircledBy(context,province.id,attacker)?1.5:1);
        if(province.capture>=8){const previous=province.owner;province.owner=attacker;province.capture=0;province.captor=-1;province.recovery=recoveryDuration(player);province.production=0;province.kind=player.loadout[0];s.topology++;experience(s,attacker,50);player.funds=Math.min(MAX_FUNDS,player.funds+captureReward(player));s.events.push({tick:s.tick,key:'capture',player:attacker,province:province.id});this.captureTalents(province,previous,player);for(const u of s.units)if(!u.transport?.embarked&&u.province===province.id&&Math.hypot(u.x-MAP[province.id].center.x,u.z-MAP[province.id].center.z)<3.7&&u.owner===attacker&&u.target===province.id){u.province=province.id;this.advance(u);}}
      }else if(!(nearOwner===-2&&province.captor>=0&&context.profiles[province.captor]?.siegeLines)){province.capture=Math.max(0,province.capture-DT*2);if(!province.capture)province.captor=-1;}
      if(province.owner<0)continue;
      const owner=s.players[province.owner],profile=context.profiles[province.owner],rate=regionProductionRate(province.id),recovery=recoveryMultiplier(province.recovery,owner);
      // Raiding cavalry present in an enemy region stops its income and training.
      let raided=false;for(const raider of raiders)if(raider!==province.owner&&this.censusCounts[popKey(raider,province.id)]){raided=true;break;}
      if(!raided)owner.funds=Math.min(MAX_FUNDS,owner.funds+DT*fundsIncomeRate(province,rate,owner,profile.tradeRoutes?tradeBonus(s,province.id,owner):0));
      province.recovery=province.recovery<=DT+1e-7?0:province.recovery-DT;
      if(profile.academy)academy[province.owner]+=academyExperience(province);
      const contested=nearOwner!==-2&&nearOwner!==province.owner;
      if((contested&&!profile.militia)||raided||context.encirclers.has(province.id))continue;
      const garrison=this.censusCounts[popKey(province.owner,province.id)];
      const key=popKey(province.owner,province.id);
      if(garrison+(reservations.get(key)??0)+(queuedReservations.get(key)??0)>=capacityFor(s,province.id))continue;
      const levy=profile.levy&&owner.funds>=5,besieged=profile.militia&&(contested||province.capture>0);
      province.production+=DT*rate*recovery*constructionProductionMultiplier(province)*profile.trainingFactor*(levy?1.5:1)*(besieged?2:1);
      if(province.production>=UNITS[province.kind].train){
        province.production-=UNITS[province.kind].train;
        if(!spawn(s,province.id,province.kind,undefined,this.spawnNeighbors(province.id)))province.production=UNITS[province.kind].train;
        else{
          if(levy)owner.funds=Math.max(0,owner.funds-5);
          const fresh=s.units[s.units.length-1];this.indexSpawned(fresh);
          // Full departures pull in fresh recruits only until the queue closes.
          // Replace the order object so LAN/broadcast deltas see the new ID.
          const order=province.march;
          if(order?.fraction===1&&order.owner===province.owner){province.march={...order,pendingIds:[...order.pendingIds,fresh.id]};if(order.army!==undefined)fresh.army=order.army;}
        }
      }
    }
    this.dailyTalents(context,academy,damage,pulse);
    this.releaseMarches();settleArmies(s);
    // All captures have settled: losing then gaining a region in this tick is not defeat.
    if(s.topology!==topologyBefore)s.grouping=reconcileGrouping(s);settleEliminations(s);
    if(s.tick>=80)this.ai();
    const territoryCounts=new Map<number,number>();
    for(const v of s.provinces)if(MAP[v.id].playable&&v.owner>=0)territoryCounts.set(v.owner,(territoryCounts.get(v.owner)??0)+1);
    const survivingOwners=new Set(territoryCounts.keys());
    for(const u of s.units)if(u.owner>=0)survivingOwners.add(u.owner);
    for(const p of s.players){
      const owned=territoryCounts.get(p.id)??0;s.domination[p.id]=owned>=Math.ceil(PLAYABLE_COUNT*0.6)?s.domination[p.id]+DT:0;
      if(s.domination[p.id]>=30||(owned>0&&survivingOwners.size===1)){s.winner=p.id;s.events.push({tick:s.tick,key:'victory',player:p.id});break;}
    }
    if(s.events.length>32)s.events.splice(0,s.events.length-32);
  }
  /** Kill rewards for the killer's country and death effects for the victim's. */
  private unitKilled(unit:Unit,killer:number):void {
    const s=this.state,attacker=s.players[killer],victim=s.players[unit.owner];
    if(attacker){
      experience(s,killer,hasTalent(attacker,'battleHardened')?24:12);
      if(hasTalent(attacker,'bounty'))attacker.funds=Math.min(MAX_FUNDS,attacker.funds+3*plunderMultiplier(attacker));
    }
    if(!victim)return;
    if(hasTalent(victim,'pensions'))victim.funds=Math.min(MAX_FUNDS,victim.funds+5);
    const region=s.provinces[unit.province];
    if(region?.owner===unit.owner&&!unit.transport?.embarked&&hasTalent(victim,'martyrs')){const train=UNITS[region.kind].train;region.production=Math.min(train,region.production+train*.5);}
  }
  /** Capture effects of the new owner's talents, after the standard reward. */
  private captureTalents(province:Province,previous:number,player:Player):void {
    const s=this.state,gain=plunderMultiplier(player),victim=previous>=0?s.players[previous]:undefined;
    if(victim&&hasTalent(player,'tribute')){const taken=Math.min(80,Math.floor(victim.funds*.1));victim.funds-=taken;player.funds=Math.min(MAX_FUNDS,player.funds+taken*gain);}
    if(province.construction&&hasTalent(player,'salvage')){player.funds=Math.min(MAX_FUNDS,player.funds+salvageValue(province.construction)*gain);delete province.construction;}
    if(!province.construction&&hasTalent(player,'fortify'))province.construction={kind:'fortress',level:1};
    if(hasTalent(player,'pressGang'))for(let i=0;i<2;i++)if(spawn(s,province.id,province.kind,undefined,this.spawnNeighbors(province.id)))this.indexSpawned(s.units[s.units.length-1]);
  }
  /** Continuous and daily talent effects after regions have produced this tick. */
  private dailyTalents(context:TalentContext,academy:Float64Array,damage:Map<number,{amount:number;attacker:number}>,pulse:boolean):void {
    const s=this.state;
    for(const p of s.players){
      const profile=context.profiles[p.id];
      if(profile.treasury)p.funds=Math.min(MAX_FUNDS,p.funds+DT*treasuryInterest(p));
      if(academy[p.id])experience(s,p.id,DT*academy[p.id]);
    }
    // Field Medicine heals troops at rest in friendly regions; Supply Columns heals troops under orders.
    if(pulse&&context.profiles.some(p=>p.fieldMedicine||p.supplyColumns)){
      for(const u of s.units){
        if(u.owner<0)continue;const profile=context.profiles[u.owner];if(!profile.fieldMedicine&&!profile.supplyColumns)continue;
        let heal=0;
        if(profile.supplyColumns&&u.target!==null)heal+=.02;
        if(profile.fieldMedicine&&!u.transport?.embarked&&u.cooldown<=0&&!damage.has(u.id)&&s.provinces[u.province]?.owner===u.owner)heal+=.03;
        if(!heal)continue;const maximum=stats(s.players[u.owner],u.kind).hp;if(u.hp>=maximum)continue;
        u.hp=Math.min(maximum,u.hp+maximum*heal);this.physicsDirty.units.add(u);
      }
    }
    // Sappers: every ten days, a building with the owner's troops present gains a level.
    if(s.tick%SAPPER_INTERVAL_TICKS===0&&context.profiles.some(p=>p.sappers)){
      for(const province of s.provinces){
        const building=province.construction;if(!building||province.owner<0||!context.profiles[province.owner].sappers)continue;
        if(building.level>=maxConstructionLevel(s.players[province.owner])||!this.censusCounts[(province.owner+1)*MAP.length+province.id])continue;
        province.construction={kind:building.kind,level:building.level===1?2:3};
      }
    }
  }
  private spawnCell(x:number,z:number):number|string {return x>=0&&x<1024&&z>=0&&z<1024?z*1024+x:x+':'+z;}
  private indexSpawned(u:Unit):void {
    if(this.nativeSpawnUnits){this.freshSpawns.push(u);return;}if(u.transport?.embarked)return;const key=this.spawnCell(Math.floor(u.x/8),Math.floor(u.z/8)),list=this.spawnIndex!.get(key);if(list)list.push(u);else this.spawnIndex!.set(key,[u]);
  }
  private spawnNeighbors(province:number):Unit[] {
    if(this.nativeSpawnUnits){
      const center=MAP[province].center,count=kernel.spawnNeighbors(center.x,center.z,48*1024*1024),indices=new Uint32Array(kernel.memory.buffer,48*1024*1024,count),nearby:Unit[]=[];
      for(const index of indices)nearby.push(this.nativeSpawnUnits[index]);
      for(const u of this.sleeping)if(!u.transport?.embarked&&Math.abs(u.x-center.x)<9&&Math.abs(u.z-center.z)<9)nearby.push(u);
      for(const u of this.freshSpawns)if(!u.transport?.embarked&&Math.abs(u.x-center.x)<9&&Math.abs(u.z-center.z)<9)nearby.push(u);
      return nearby;
    }
    if(!this.spawnIndex){this.spawnIndex=new Map();for(const unit of this.state.units)this.indexSpawned(unit);}
    const c=MAP[province].center,result:Unit[]=[];
    for(let x=Math.floor((c.x-9)/8);x<=Math.floor((c.x+9)/8);x++)for(let z=Math.floor((c.z-9)/8);z<=Math.floor((c.z+9)/8);z++)for(const u of this.spawnIndex.get(this.spawnCell(x,z))??[])if(Math.abs(u.x-c.x)<9&&Math.abs(u.z-c.z)<9)result.push(u);
    return result;
  }
  private releaseMarches():void {
    const s=this.state;
    if(!s.provinces.some(p=>p.march))return;
    const units=new Map(s.units.map(u=>[u.id,u]));
    for(const province of s.provinces){
      const order=province.march;if(!order)continue;
      const owner=province.owner;
      if(owner<0||order.owner!==owner){delete province.march;continue;}
      const pending=order.pendingIds.filter(id=>{const u=units.get(id);return u&&isRegionGarrison(u,owner,province.id);});
      if(!pending.length){delete province.march;continue;}
      if(province.lastMarchTick!==undefined&&s.tick-province.lastMarchTick<MARCH_INTERVAL_TICKS){
        if(pending.length!==order.pendingIds.length)province.march={...order,pendingIds:pending};
        continue;
      }
      let started:number|null=null;
      while(pending.length&&!started)started=this.dispatchOne([units.get(pending.shift()!)!],order.to);
      if(started)province.lastMarchTick=s.tick;
      if(pending.length)province.march={...order,pendingIds:pending};else delete province.march;
    }
  }
  /** One dispatch across one or more source regions forms one army. Each source keeps the
   * original rules: an identical queued order is a no-op, a new order replaces troops still
   * waiting there, and departures leave one by one. Fails only if no source could send troops. */
  private muster(actor:number,sources:readonly number[],to:number,fraction:MarchFraction):Result{
    const s=this.state,target=s.provinces[to],fail=(error:string):Result=>({ok:false,error});
    // Same error order as the original single-region march command.
    for(const from of sources){const p=s.provinces[from];if(!p||!target||p.owner!==actor)return fail('notOwner');}
    for(const from of sources)if(!MAP[from].playable||!MAP[to].playable||from===to)return fail('invalidCommand');
    const army={id:s.nextArmy,owner:actor,to,formed:s.tick,size:0};let unchanged=false,unreachable=false;
    for(const from of sources){
      const result=this.orderFrom(actor,from,to,fraction,army.id);
      if(result==='unchanged')unchanged=true;else if(result==='unreachable')unreachable=true;else if(result>0)army.size+=result;
    }
    if(army.size){s.nextArmy++;s.armies.push(army);return{ok:true};}
    return unchanged?{ok:true}:fail(unreachable?'unreachable':'noTroops');
  }
  private orderFrom(actor:number,from:number,to:number,fraction:MarchFraction,army:number):number|'unchanged'|'unreachable'{
    const s=this.state,province=s.provinces[from];
    const queued=province.march?.owner===actor?province.march:undefined;
    if(queued?.to===to&&(queued.fraction??1)===fraction)return 'unchanged';
    // A new order chooses from troops still at the source. Marchers have
    // their own routes and must not be changed, even while near the source.
    const garrison=s.units.filter(u=>isRegionGarrison(u,actor,from));
    const available=garrison.slice(0,marchDispatchCount(garrison.length,fraction));
    if(!available.length)return 0;
    const friendly=s.provinces[to].owner===actor;
    const startsNow=province.lastMarchTick===undefined||s.tick-province.lastMarchTick>=MARCH_INTERVAL_TICKS;
    // Check reachability before replacing a valid order even when the
    // current departure interval prevents us from sending anyone now.
    if(!startsNow&&!available.some(u=>this.planMarch(u,to)))return 'unreachable';
    // Troops still waiting for a replaced order return to the garrison before joining the new army.
    if(queued?.army!==undefined){const waiting=new Set(queued.pendingIds);for(const u of s.units)if(waiting.has(u.id)&&u.army===queued.army)delete u.army;}
    const first=startsNow?this.dispatchOne(available,to):null;
    if(startsNow&&!first)return 'unreachable';
    if(first)province.lastMarchTick=s.tick;
    for(const u of available)u.army=army;
    const pendingIds=available.filter(u=>u.id!==first).map(u=>u.id);
    if(pendingIds.length)province.march={to,owner:actor,pendingIds,fraction,army,...(friendly?{reserved:true}:{})};else delete province.march;
    return available.length;
  }
  private planMarch(unit:Unit,to:number){
    const st=stats(this.state.players[unit.owner],unit.kind);
    return this.navigation.plan(unit,MAP[to].center,st.speed,st.seaSpeed);
  }
  private dispatchOne(units:Unit[],to:number):number|null{
    for(const u of units){
      const travel=this.planMarch(u,to);if(!travel)continue;
      u.target=to;u.origin=u.province;u.destination=to;u.route=[];u.travel=travel;delete u.transport;this.physicsDirty.units.add(u);
      if(this.state.provinces[to].owner!==u.owner)u.assault=to;else delete u.assault;
      return u.id;
    }
    return null;
  }
  private halt(unit:Unit):void {this.physicsDirty.units.add(unit);delete unit.army;delete unit.travel;delete unit.transport;if(unit.assault!==unit.province)delete unit.assault;unit.target=null;unit.destination=null;unit.route=[];unit.origin=unit.province;}
  /** Keep loaded and newly disembarked units clear of houses.
   * Only same-land, same-province (or certified route corridor) candidates count. */
  private clearBuildings(units:readonly Unit[]=this.state.units):void {
    let ordered=units;for(let i=1;i<units.length;i++)if(units[i].id<units[i-1].id){ordered=[...units].sort((a,b)=>a.id-b.id);break;}
    const blocked=units.length<=65536?blockedByBuildings(ordered):ordered.filter(u=>!(u.transport?.embarked&&u.travel?.points[u.travel.index]?.sea!==false)&&!buildingSegment(u,u,UNIT_RADIUS[u.kind]));
    for(const u of blocked){
      const radius=UNIT_RADIUS[u.kind];if((u.transport?.embarked&&u.travel?.points[u.travel.index]?.sea!==false)||buildingSegment(u,u,radius))continue;
      const neighbors=this.state.units.filter(v=>v.id!==u.id&&!v.transport?.embarked&&Math.abs(v.x-u.x)<4.3&&Math.abs(v.z-u.z)<4.3),beforeClearance=terrainClearance(u,radius);
      let found=false,fallback:{x:number;z:number}|undefined,bestGap=-Infinity;
      for(let ring=1;ring<=15&&!found;ring++)for(let i=0;i<32;i++){
        const angle=(i+(u.id%32))*Math.PI/16,to={x:u.x+Math.cos(angle)*ring*.2,z:u.z+Math.sin(angle)*ring*.2};
        if(!buildingSegment(to,to,radius)||!terrainLocalSegment(u,to)||terrainClearance(to,radius)+1e-8<beforeClearance)continue;
        if(u.travel?(distanceToTravelSegment(u.travel,to)>TRAVEL_LOCAL_OFFSET||!terrainLocalSegment(to,travelCorridorPoint(u.travel,to))):!pointInProvince(u.province,to.x,to.z))continue;
        const gap=Math.min(radius,...neighbors.map(v=>Math.hypot(v.x-to.x,v.z-to.z)-radius-UNIT_RADIUS[v.kind]));
        if(gap>bestGap){bestGap=gap;fallback=to;}
        if(gap<.02)continue;
        u.x=to.x;u.z=to.z;this.physicsDirty.units.add(u);if(u.travel)u.province=provinceAt(to.x,to.z);found=true;break;
      }
      // A physically overcrowded old garrison may have no non-overlapping unit
      // slot. Never leave it inside a solid house: choose the best legal ground
      // and let the bounded unit solver continue resolving the softer crowd.
      if(!found&&fallback){u.x=fallback.x;u.z=fallback.z;this.physicsDirty.units.add(u);if(u.travel)u.province=provinceAt(u.x,u.z);}
    }
  }
  private separate(active:readonly Unit[]):void {
    const bodies=[];
    for(let i=0;i<active.length;i++){
      const unit=active[i];if(unit.hp<=0||unit.transport?.embarked)continue;
      const motion=unit.travel?motionAngle(unit.x-this.departure[i*2],unit.z-this.departure[i*2+1]):undefined;
      bodies.push({id:unit.id,x:unit.x,z:unit.z,radius:UNIT_RADIUS[unit.kind],mobility:unit.travel ? .15 : 1,motion,unit,terrainX:NaN,terrainZ:NaN,triangle:-1,freeTerrain:undefined as boolean|undefined});
    }
    try{this.collision=separateGround(bodies,this.state.tick);}catch{const clearance=new Map<number,number>();this.collision=separateCircles(bodies,(body,to)=>{
      const u=body.unit,travel=u.travel;if(!buildingSegment(body,to,body.radius))return false;
      if(travel){if(distanceToTravelSegment(travel,to)>TRAVEL_LOCAL_OFFSET)return false;}
      else if(!pointInProvince(u.province,to.x,to.z))return false;
      if(travel&&provinceAt(to.x,to.z)<0)return false;
      if(body.freeTerrain===undefined)body.freeTerrain=openLandCell(body,body.radius+COLLISION_MAX_PUSH+(travel?TRAVEL_LOCAL_OFFSET:0));
      if(body.freeTerrain)return true;
      // Rejected pushes share a start point; accepted movement invalidates it.
      if(body.terrainX!==body.x||body.terrainZ!==body.z){body.triangle=terrainAt(body,true);body.terrainX=body.x;body.terrainZ=body.z;}
      if(!terrainLocalSegment(body,to,body.triangle))return false;
      // Existing narrow-corridor/old-save footprints can be clipped. A push may
      // improve their clearance, never force them farther through a physical wall.
      let before=clearance.get(body.id);if(before===undefined){before=terrainClearance(body,body.radius,true);clearance.set(body.id,before);}
      const after=terrainClearance(to,body.radius,true);if(after+1e-8<before)return false;
      if(travel&&!terrainLocalSegment(to,travelCorridorPoint(travel,to)))return false;
      clearance.set(body.id,after);return true;
    },this.state.tick);}
    for(const b of bodies){const u=b.unit;if(u.x===b.x&&u.z===b.z)continue;u.x=b.x;u.z=b.z;if(u.travel)u.province=provinceAt(u.x,u.z);}
  }
  private advance(unit:Unit):void {this.halt(unit);}
  private ai():void{
    const s=this.state;
    // Each faction still acts once per 80 ticks, but stagger the expensive
    // navigation work. Actor 1 retains its original first action at tick 80.
    const scheduled=s.players.filter(p=>p.ai&&(p.id+79)%80===(s.tick-80)%80);
    if(!scheduled.length)return;
    const actors=new Set(scheduled.map(p=>p.id)),territories=new Map<number,number[]>(),garrisons=new Map<number,Unit[]>(),occupants=new Uint32Array(MAP.length);
    // Only actors due this tick need ready-garrison lists. Target strength still
    // counts every physical unit, matching the existing decision policy.
    for(const v of s.provinces)if(MAP[v.id].playable&&actors.has(v.owner)){const ids=territories.get(v.owner)??[];ids.push(v.id);territories.set(v.owner,ids);}
    for(const u of s.units){occupants[u.province]++;if(!actors.has(u.owner)||s.provinces[u.province]?.owner!==u.owner||!isRegionGarrison(u,u.owner,u.province))continue;const units=garrisons.get(u.province)??[];units.push(u);garrisons.set(u.province,units);}
    for(const p of scheduled.filter(p=>territories.has(p.id))){
      if(p.choices.length)this.command(p.id,countryActions.talent(aiTalentChoice(s,p)));
      if(p.funds>160)this.command(p.id,countryActions.upgrade(p.loadout[Math.floor(random(s)*p.loadout.length)],STATS[Math.floor(random(s)*3)]));
      for(const id of territories.get(p.id)??[]){
        const province=s.provinces[id];if(province.march)continue;
        const units=garrisons.get(id)??[];
        // Small administrative atoms must be able to move a full garrison.
        if(units.length<Math.min(4,regionCapacity(province.id))||!units.length)continue;
        const neighbors=MAP[province.id].neighbors,targets=neighbors.filter(id=>s.provinces[id].owner!==p.id).sort((a,b)=>occupants[a]-occupants[b]);
        let destination:number|undefined=targets[0]??neighbors.filter(id=>MAP[id].neighbors.some(n=>s.provinces[n].owner!==p.id))[0];
        if(destination===undefined){
          // Keep the same nearest four and tie order without sorting the atlas
          // or recomputing each distance for every sort comparison.
          const candidates:{id:number;distance:number}[]=[],center=MAP[province.id].center;
          for(const m of MAP)if(m.playable&&s.provinces[m.id].owner!==p.id){
            const distance=Math.hypot(m.center.x-center.x,m.center.z-center.z);let index=0;
            while(index<candidates.length&&(candidates[index].distance<distance||(candidates[index].distance===distance&&candidates[index].id<m.id)))index++;
            if(index<4){candidates.splice(index,0,{id:m.id,distance});if(candidates.length>4)candidates.pop();}
          }
          destination=candidates.find(m=>this.navigation.plan(center,MAP[m.id].center))?.id;
        }
        if(destination!==undefined)this.command(p.id,countryActions.march(province.id,destination));
      }
    }
  }
}
