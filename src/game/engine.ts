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
import {UNIT_RADIUS,COLLISION_MAX_PUSH,separateCircles,type CollisionReport} from './collision.ts';
import {buildingSegment,buildingStep} from './buildings.ts';
import {INITIAL_TERRITORY_GROUPING} from './map.ts';
import {regionCapacity,regionProductionRate,applyGroupingCommand,reconcileGrouping} from './territoryEconomy.ts';

import {STARTING_FUNDS,MAX_FUNDS,captureReward,recoveryDuration,constructionCost,isConstructionKind,recoveryMultiplier,fundsIncomeRate,constructionProductionMultiplier,captureSpeedMultiplier} from './construction.ts';
import {isRegionGarrison} from './capacity.ts';
import { DT, MAP_ID, STATE_VERSION, KINDS, STATS, UNITS, stats, upgradeCost, validateSetup, TALENT_BY_ID, talentApplies, UNIT_FAMILY } from './content.ts';
import type { GameState, PlayerSetup, Player, Unit, Kind, Result } from './types.ts';
function random(s:GameState):number{let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
export function createGame(setups:PlayerSetup[],seed=20261108,campaign=`campaign-${seed}`):GameState{
  if(setups.length<2||setups.length>getSpawnCapacity()||!setups.every(validateSetup))throw new Error('invalidSetup');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||campaign.length>100)throw new Error('invalidSetup');
  const s:GameState={version:STATE_VERSION,map:MAP_ID,neutralGarrisonModel:'preplaced',campaign,seed,rng:(seed>>>0)||1,tick:0,nextId:1,topology:0,grouping:structuredClone(INITIAL_TERRITORY_GROUPING),spawnModel:'single',players:[],provinces:MAP.map(p=>({id:p.id,owner:-1,production:0,kind:'infantry',recovery:0,captor:-1,capture:0})),units:[],events:[],winner:null,domination:setups.map(()=>0)};
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
function draft(s:GameState,p:Player,previous:readonly string[]=[]):void{
  if(p.choices.length||p.drafts<=0)return;
  const available=availableTalentIds(p);
  for(let i=available.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  p.choices=available.slice(0,3);
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
  constructor(state:GameState){initializeBattleMemory();this.state=structuredClone(state);settleEliminations(this.state);this.clearBuildings();}
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
        const from=s.provinces[c.from],to=s.provinces[c.to];if(!from||!to||from.owner!==actor)return fail('notOwner');
        if(!MAP[c.from].playable||!MAP[c.to].playable||c.from===c.to)return fail('invalidCommand');
        const queued=from.march?.owner===actor?from.march:undefined;
        if(queued?.to===c.to&&(queued.fraction??1)===c.fraction)return{ok:true};
        // A new order chooses from troops still at the source. Marchers have
        // their own routes and must not be changed, even while near the source.
        const garrison=s.units.filter(u=>isRegionGarrison(u,actor,c.from));
        const available=garrison.slice(0,marchDispatchCount(garrison.length,c.fraction));
        if(!available.length)return fail('noTroops');
        const friendly=to.owner===actor;
        const startsNow=from.lastMarchTick===undefined||s.tick-from.lastMarchTick>=MARCH_INTERVAL_TICKS;
        // Check reachability before replacing a valid order even when the
        // current departure interval prevents us from sending anyone now.
        if(!startsNow&&!available.some(u=>this.planMarch(u,c.to)))return fail('unreachable');
        const first=startsNow?this.dispatchOne(available,c.to):null;
        if(startsNow&&!first)return fail('unreachable');
        if(first)from.lastMarchTick=s.tick;
        const pendingIds=available.filter(u=>u.id!==first).map(u=>u.id);
        if(pendingIds.length)from.march={to:c.to,owner:actor,pendingIds,fraction:c.fraction,...(friendly?{reserved:true}:{})};else delete from.march;
        return{ok:true};
      }
      case 'construct':{
        if(!Number.isInteger(c.province)||!isConstructionKind(c.kind)||(c.expectedLevel!==0&&c.expectedLevel!==1))return fail('invalidCommand');
        const province=s.provinces[c.province];
        if(!province||!MAP[c.province]?.playable||province.owner!==actor)return fail('notOwner');
        if(province.capture>0)return fail('constructionContested');
        const level=province.construction?.level??0;
        if(province.construction&&province.construction.kind!==c.kind)return fail('slotOccupied');
        if(level===2)return fail('maxLevel');
        if(level!==c.expectedLevel)return fail('constructionChanged');
        const cost=constructionCost(c.kind,level,p),funds=p.funds;
        if(funds<cost)return fail('noFunds');
        p.funds=funds-cost;
        province.construction={kind:c.kind,level:level===0?1:2};
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
        const level=p.upgrades[c.kind][c.stat],cost=upgradeCost(level);if(level>=8)return fail('maxLevel');if(p.funds<cost)return fail('noFunds');
        const oldHp=stats(p,c.kind).hp;p.funds-=cost;p.upgrades[c.kind][c.stat]++;this.physicsDirty.owners.add(actor);
        if(c.stat==='health'){const newHp=stats(p,c.kind).hp;for(const u of s.units)if(u.owner===actor&&u.kind===c.kind)u.hp=u.hp/oldHp*newHp;}return{ok:true};
      }
      case 'talent':{
        const talent=typeof c.id==='string'?TALENT_BY_ID.get(c.id):undefined;
        if(!talent||p.drafts<1||!p.choices.includes(talent.id)||p.talents.includes(talent.id)||!talentApplies(talent,p.loadout))return fail('invalidChoice');
        this.physicsDirty.owners.add(actor);const stat=talent.unit?.stat;
        if(stat==='hp'||stat==='attackSpeed'){
          // The selected modifier applies to deployed troops as well as future ones.
          // Keep both the current HP fraction and progress through a running attack cooldown.
          const factor=talent.unit?.factor??1;
          for(const u of s.units)if(u.owner===actor&&(!talent.kind||UNIT_FAMILY[u.kind]===UNIT_FAMILY[talent.kind])){
            if(stat==='hp')u.hp*=factor;else u.cooldown/=factor;
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
        if(!canRerollTalent(p))return fail('noTalentReroll');
        const cost=talentRerollCost(p);
        if(c.expectedCost!==undefined){
          if(!Number.isSafeInteger(c.expectedCost)||c.expectedCost<1)return fail('invalidCommand');
          if(c.expectedCost!==cost)return fail('talentRerollPriceChanged');
        }
        if(p.funds<cost)return fail('noFunds');
        const previous=p.choices;
        p.funds-=cost;p.rerollsUsed++;
        p.choices=[];draft(s,p,previous);return{ok:true};
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
  private prepareTick(){
    const s=this.state,topologyBefore=s.topology;s.tick++;
    const active=this.activeUnits();this.clearBuildings(active);
    const statCache=new Map<number,Map<Kind,ReturnType<typeof stats>>>();
    const unitStats=(owner:number,kind:Kind)=>{let values=statCache.get(owner);if(!values){values=new Map();statCache.set(owner,values);}let value=values.get(kind);if(!value){value=stats(s.players[owner],kind);values.set(kind,value);}return value;};
    return {active,unitStats,topologyBefore};
  }
  private updatePrepared(frame:ReturnType<Engine['prepareTick']>):void {
    const damage=new Map<number,{amount:number;attacker:number}>();
    try{updateBattleUnits(frame.active,frame.unitStats,this.state,damage);}
    catch{damage.clear();updateUnitsFallback(frame.active,frame.unitStats,this.state,damage,u=>this.halt(u));}
    this.finishTick(frame.active,damage,frame.topologyBefore);
  }
  private tick():void{this.updatePrepared(this.prepareTick());}
  private parallelBusy=false;private awaitingPhysics=false;
  async stepParallel(run:(active:readonly Unit[],statsFor:(owner:number,kind:Kind)=>ReturnType<typeof stats>,state:GameState,dirty:{all:boolean;units:Set<Unit>;owners:Set<number>})=>Promise<{damage:Map<number,{amount:number;attacker:number}>;collision:CollisionReport;census?:UnitCensus}>,count=1):Promise<void>{
    if(this.parallelBusy)throw Error('A simulation step is already running');this.parallelBusy=true;
    try{for(let i=0;i<count;i++){
      if(this.state.winner!==null)return;const frame=this.prepareTick();
      if(frame.active.length<256){this.physicsDirty.all=true;this.updatePrepared(frame);continue;}
      let result;
      try{this.awaitingPhysics=true;result=await run(frame.active,frame.unitStats,this.state,this.physicsDirty);}
      catch{this.awaitingPhysics=false;this.physicsDirty.all=true;this.updatePrepared(frame);continue;}
      finally{this.awaitingPhysics=false;}
      this.physicsDirty={all:false,units:new Set<Unit>(),owners:new Set<number>()};this.finishTick(frame.active,result.damage,frame.topologyBefore,result.collision,result.census);
    }}finally{this.parallelBusy=false;}
  }
  private spawnIndex:Map<number|string,Unit[]>|undefined;private nativeSpawnUnits:readonly Unit[]|undefined;private freshSpawns:Unit[]=[];
  private finishTick(active:readonly Unit[],damage:Map<number,{amount:number;attacker:number}>,topologyBefore:number,collision?:CollisionReport,census?:UnitCensus):void{
    this.spawnIndex=undefined;this.nativeSpawnUnits=census?active:undefined;this.freshSpawns=[];const s=this.state,popKey=(owner:number,region:number)=>(owner+1)*MAP.length+region;
    // Apply accumulated damage simultaneously, so entity iteration order cannot prevent retaliation.
    for(const u of s.units){const hit=damage.get(u.id);if(hit){u.hp-=hit.amount;if(u.hp<=0)experience(s,hit.attacker,12);}}s.units=s.units.filter(u=>u.hp>0);
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
    for(const province of s.provinces){
      if(!MAP[province.id].playable||(province.owner<0&&!this.censusOccupants[province.id]))continue;
      const nearOwner=this.censusNearOwner[province.id],attacker=nearOwner>=0&&nearOwner!==province.owner?nearOwner:-1;
      if(attacker>=0){
        if(province.captor!==attacker){province.captor=attacker;province.capture=0;}
        const player=s.players[attacker],engineers=Boolean(this.censusEngineers[province.id]);
        province.capture+=DT*captureSpeedMultiplier(province)*(engineers?1.5:1)*(player.talents.includes('conqueror')?1.3:1)*(engineers&&player.talents.includes('sappers')?1.3:1);
        if(province.capture>=8){province.owner=attacker;province.capture=0;province.captor=-1;province.recovery=recoveryDuration(player);province.production=0;province.kind=player.loadout[0];s.topology++;experience(s,attacker,50);player.funds=Math.min(MAX_FUNDS,player.funds+captureReward(player));s.events.push({tick:s.tick,key:'capture',player:attacker,province:province.id});for(const u of s.units)if(!u.transport?.embarked&&u.province===province.id&&Math.hypot(u.x-MAP[province.id].center.x,u.z-MAP[province.id].center.z)<3.7&&u.owner===attacker&&u.target===province.id){u.province=province.id;this.advance(u);}}
      }else{province.capture=Math.max(0,province.capture-DT*2);if(!province.capture)province.captor=-1;}
      if(province.owner<0)continue;
      const owner=s.players[province.owner],rate=regionProductionRate(province.id),recovery=recoveryMultiplier(province.recovery,owner);
      owner.funds=Math.min(MAX_FUNDS,owner.funds+DT*fundsIncomeRate(province,rate,owner));
      province.recovery=province.recovery<=DT+1e-7?0:province.recovery-DT;
      if(nearOwner!==-2&&nearOwner!==province.owner)continue;
      const garrison=this.censusCounts[popKey(province.owner,province.id)];
      const key=popKey(province.owner,province.id);
      if(garrison+(reservations.get(key)??0)+(queuedReservations.get(key)??0)>=regionCapacity(province.id))continue;
      province.production+=DT*rate*recovery*constructionProductionMultiplier(province)*(owner.talents.includes('industry')?1.2:1)*(owner.talents.includes('logistics')?1.1:1);
      if(province.production>=UNITS[province.kind].train){
        province.production-=UNITS[province.kind].train;
        if(!spawn(s,province.id,province.kind,undefined,this.spawnNeighbors(province.id)))province.production=UNITS[province.kind].train;
        else{
          const fresh=s.units[s.units.length-1];this.indexSpawned(fresh);
          // Full departures pull in fresh recruits only until the queue closes.
          // Replace the order object so LAN/broadcast deltas see the new ID.
          const order=province.march;
          if(order?.fraction===1&&order.owner===province.owner)province.march={...order,pendingIds:[...order.pendingIds,fresh.id]};
        }
      }
    }
    this.releaseMarches();
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
  private halt(unit:Unit):void {this.physicsDirty.units.add(unit);delete unit.travel;delete unit.transport;if(unit.assault!==unit.province)delete unit.assault;unit.target=null;unit.destination=null;unit.route=[];unit.origin=unit.province;}
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
    const bodies=active.filter(u=>u.hp>0&&!u.transport?.embarked).map(unit=>({id:unit.id,x:unit.x,z:unit.z,radius:UNIT_RADIUS[unit.kind],mobility:unit.travel ? .15 : 1,unit,terrainX:NaN,terrainZ:NaN,triangle:-1,freeTerrain:undefined as boolean|undefined}));
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
      if(p.choices.length)this.command(p.id,countryActions.talent(p.choices[0]));
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
