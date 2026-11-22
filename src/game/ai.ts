/**
 * Computer-controlled countries (docs/AI.md).
 *
 * Every decision is an ordinary CountryAction sent through the engine's `command`, the
 * same authorization path as a human order; this module never mutates the state itself.
 * The planner keeps no memory between turns and draws no campaign randomness, so
 * replicas, reloaded saves and step batching all reach the same decisions.
 *
 * One turn, in order:
 * 1. Talent pick and the best affordable unit upgrade.
 * 2. Defence: a region with enemies ordered against it keeps its garrison; safe
 *    neighbours reinforce it when the defence can hold.
 * 3. Recall: an attack that has fallen far behind its target is called back.
 * 4. Offence: border targets are ranked by value / (strength still needed × days).
 *    Neighbouring garrisons that arrive at about the same time are combined until
 *    they beat the defenders by the configured ratio; an empty region gets a small
 *    detachment. Exposed regions keep a reserve against their other enemy neighbours.
 *    The best target that cannot be served yet is the main effort: troops gather beside it.
 * 5. Logistics: garrisons not needed where they stand join the nearest region that lacks
 *    strength (the main effort or a threatened region); garrisons with no land front
 *    look overseas.
 * 6. Construction: one building a turn from funds above `buildAbove` (chooseConstruction).
 */
import {BALANCE} from './balance.ts';
import {isRegionGarrison} from './capacity.ts';
import {captureSpeedMultiplier,constructionCost,maxConstructionLevel} from './construction.ts';
import {KINDS,MAX_UPGRADE_LEVEL,STATS,stats,upgradeCostFor,type UnitStats} from './content.ts';
import {countryActions,MARCH_FRACTIONS,marchDispatchCount,type CountryAction,type MarchFraction} from './countryActions.ts';
import {MAP} from './map.ts';
import {STRENGTH_PER_INFANTRY,strengthPower,unitDamage,unitHealth} from './strength.ts';
import {aiTalentChoice} from './talentBuilds.ts';
import {BASTION_ATTRITION,FORTRESS_GUARD,MAX_DAMAGE_REDUCTION,talentProfile} from './talentEffects.ts';
import type {ConstructionKind,GameState,Kind,Player,Province,Result,Unit,Upgrade} from './types.ts';

const AI=BALANCE.ai,CAPTURE_DAYS=BALANCE.capture.days,MARKET_INCOME=BALANCE.buildings.market.benefits;
const ENTRENCHMENT=BALANCE.talents.entrenchment.damageReduction;
/** Strength below this is no force at all (a sliver of one battalion). */
const NONE=1e-6;
/** A reinforced region must match the threat; below this share of it, help would only feed the loss. */
const DEFEND_RATIO=1,HOPELESS_BELOW=.6;
/** Garrisons join one attack only if they arrive within this factor of the nearest one's march. */
const MUSTER_SPREAD=1.5;
/** Front regions send spare troops to a gathering point at most this many regions away. */
const GATHER_HOPS=2;
/** A country down to this many regions is worth finishing off. */
const FINISH_REGIONS=2,FINISH_VALUE=1.5;
/** Speed upgrades count for this much of an attack or health level. */
const SPEED_UPGRADE_WEIGHT=.5;
/** How much a market's income counts in a front region bordering only neutrals, or another country. */
const BORDER_SAFETY=.75,EXPOSED_SAFETY=.4;

export type Execute=(action:CountryAction)=>Result;

/** Battalion-equivalent strength: N fresh infantry battalions are worth N. */
function power(health:number,damage:number):number{return strengthPower(health,damage)/STRENGTH_PER_INFANTRY;}
function distance(a:number,b:number):number{const p=MAP[a].center,q=MAP[b].center;return Math.hypot(p.x-q.x,p.z-q.z);}
function siegeDays(province:Province):number{return CAPTURE_DAYS/captureSpeedMultiplier(province);}

/** What one country knows at the start of its turn. Arrays are indexed by region. */
interface Survey{
  /** Its own garrisons ready for orders: battalions, health and damage. */
  readyN:Uint32Array;readyH:Float64Array;readyD:Float64Array;
  /** Its own troops already ordered to a region, or stopped inside a foreign one. */
  sentH:Float64Array;sentD:Float64Array;
  /** Other countries' troops ordered against its regions, or idle inside them. */
  threatH:Float64Array;threatD:Float64Array;
  /** A region owner's troops inside it or ordered back to it. */
  holdH:Float64Array;holdD:Float64Array;
  /** Anyone else standing in a region. */
  otherH:Float64Array;otherD:Float64Array;
  /** Regions the survey covered, with what it needs to cover more of them later. */
  relevant:Uint8Array;armyTo:Map<number,number>;table:StrengthTable;
}

const KIND_INDEX=Object.fromEntries(KINDS.map((kind,index)=>[kind,index])) as Record<Kind,number>;
type StrengthTable=ReturnType<typeof strengthTable>;
/** Health per hit point and damage per day of each (owner, kind) battalion this turn; owner -1 is neutral. */
function strengthTable(s:GameState){
  const toughness=new Float64Array((s.players.length+1)*KINDS.length).fill(NaN),damage=new Float64Array(toughness.length);
  return {toughness,damage,slot(u:Unit):number{
    const i=(u.owner+1)*KINDS.length+KIND_INDEX[u.kind];
    if(Number.isNaN(toughness[i])){
      const player=u.owner>=0?s.players[u.owner]:undefined,profile=player&&talentProfile(player),st:UnitStats=stats(player,u.kind);
      toughness[i]=unitHealth(1,st);damage[i]=unitDamage(st,profile?.modeKind===u.kind?profile.mode:0);
    }
    return i;
  }};
}

/** Only troops standing in, or ordered to, a `relevant` region (and all the actor's own) are counted. */
function survey(s:GameState,actor:number,relevant:Uint8Array):Survey{
  const n=MAP.length,armyTo=new Map(s.armies.map(army=>[army.id,army.to])),table=strengthTable(s);
  const v:Survey={readyN:new Uint32Array(n),readyH:new Float64Array(n),readyD:new Float64Array(n),sentH:new Float64Array(n),sentD:new Float64Array(n),
    threatH:new Float64Array(n),threatD:new Float64Array(n),holdH:new Float64Array(n),holdD:new Float64Array(n),otherH:new Float64Array(n),otherD:new Float64Array(n),
    relevant,armyTo,table};
  for(const u of s.units){
    // Most troops are idle garrisons far away: skip them before any lookup.
    if(u.owner!==actor&&u.army===undefined&&u.target===null&&!relevant[u.province])continue;
    if(u.hp<=0)continue;
    const at=u.transport?.embarked?-1:u.province,to=(u.army!==undefined?armyTo.get(u.army):undefined)??u.target;
    if(u.owner!==actor&&!(at>=0&&relevant[at])&&!(to!==null&&relevant[to]))continue;
    const slot=table.slot(u),health=u.hp*table.toughness[slot],damage=table.damage[slot];
    if(u.owner===actor){
      if(to!==null){v.sentH[to]+=health;v.sentD[to]+=damage;}
      else if(at>=0&&s.provinces[at].owner!==actor){v.sentH[at]+=health;v.sentD[at]+=damage;}
      else if(at>=0&&isRegionGarrison(u,actor,at)){v.readyN[at]++;v.readyH[at]+=health;v.readyD[at]+=damage;}
      continue;
    }
    if(at>=0){if(u.owner===s.provinces[at].owner){v.holdH[at]+=health;v.holdD[at]+=damage;}else{v.otherH[at]+=health;v.otherD[at]+=damage;}}
    if(u.owner<0)continue;
    if(to!==null){
      const owner=s.provinces[to]?.owner;
      if(owner===actor){v.threatH[to]+=health;v.threatD[to]+=damage;}
      else if(owner===u.owner&&to!==at){v.holdH[to]+=health;v.holdD[to]+=damage;}
    }else if(at>=0&&s.provinces[at].owner===actor){v.threatH[at]+=health;v.threatD[at]+=damage;}
  }
  return v;
}

/** Completes `extra` regions (overseas targets) with the troops the survey skipped: those standing
 * there and their owners' troops ordered back. Afterwards they read exactly as a full survey. */
function surveyMore(s:GameState,actor:number,v:Survey,extra:Uint8Array):void{
  const {relevant,armyTo,table}=v;
  for(const u of s.units){
    if(u.owner===actor||u.hp<=0)continue;
    const at=u.transport?.embarked?-1:u.province,to=(u.army!==undefined?armyTo.get(u.army):undefined)??u.target;
    if(at>=0&&relevant[at]||to!==null&&relevant[to])continue;
    const here=at>=0&&extra[at]===1,back=to!==null&&extra[to]===1&&u.owner>=0&&u.owner===s.provinces[to].owner&&to!==at;
    if(!here&&!back)continue;
    const slot=table.slot(u),health=u.hp*table.toughness[slot],damage=table.damage[slot];
    if(here){if(u.owner===s.provinces[at].owner){v.holdH[at]+=health;v.holdD[at]+=damage;}else{v.otherH[at]+=health;v.otherD[at]+=damage;}}
    if(back){v.holdH[to]+=health;v.holdD[to]+=damage;}
  }
}

/** The four nearest foreign regions, nearest first (ties by id). */
function nearestForeign(r:number,mine:Uint8Array):number[]{
  const found:{id:number;span:number}[]=[];
  for(const m of MAP)if(m.playable&&!mine[m.id]){
    const span=distance(r,m.id);let index=0;
    while(index<found.length&&(found[index].span<span||found[index].span===span&&found[index].id<m.id))index++;
    if(index<4){found.splice(index,0,{id:m.id,span});if(found.length>4)found.pop();}
  }
  return found.map(entry=>entry.id);
}

/** Strength an attacker must beat in a region it does not own: the owner's troops there or on their
 * way back, toughened by the owner's defensive talents and fortress, plus anyone else present. */
function holding(s:GameState,v:Survey,region:number):number{
  const province=s.provinces[region],owner=province.owner>=0?s.players[province.owner]:undefined;let toughness=1;
  if(owner){
    const profile=talentProfile(owner),fortress=province.construction?.kind==='fortress'?province.construction.level:0;
    let reduction=profile.entrenchment?ENTRENCHMENT:0;
    if(fortress&&profile.fortressDoctrine)reduction+=FORTRESS_GUARD[fortress-1];
    toughness/=1-Math.min(MAX_DAMAGE_REDUCTION,reduction);
    // Bastion guns wear attackers down for the whole siege.
    if(fortress&&profile.bastionGuns)toughness*=1+BASTION_ATTRITION[fortress-1]*siegeDays(province);
  }
  return power(v.holdH[region]*toughness+v.otherH[region],v.holdD[region]+v.otherD[region]);
}

/** The cheapest affordable upgrade per point of value, once funds pass the threshold. */
function chooseUpgrade(p:Player):{kind:Kind;stat:Upgrade}|undefined{
  if(p.funds<=AI.upgradeAbove)return;
  let best:{kind:Kind;stat:Upgrade}|undefined,bestValue=0;
  for(const kind of p.loadout)for(const stat of STATS){
    const level=p.upgrades[kind][stat];if(level>=MAX_UPGRADE_LEVEL)continue;
    const cost=upgradeCostFor(p,level);if(cost>p.funds)continue;
    const value=(stat==='speed'?SPEED_UPGRADE_WEIGHT:1)/cost;
    if(value>bestValue){bestValue=value;best={kind,stat};}
  }
  return best;
}

interface Dispatch{fraction:MarchFraction;count:number}

/** Plan and issue one AI country's turn through `execute` (the engine's command path). */
export function runAiTurn(s:GameState,actor:number,execute:Execute):void{
  const player=s.players[actor];if(!player)return;
  const own:number[]=[];for(const p of s.provinces)if(p.owner===actor&&MAP[p.id].playable)own.push(p.id);
  if(!own.length)return;
  if(player.choices.length)execute(countryActions.talent(aiTalentChoice(s,player)));
  const upgrade=chooseUpgrade(player);if(upgrade)execute(countryActions.upgrade(upgrade.kind,upgrade.stat));

  const count=MAP.length,mine=new Uint8Array(count),frontier=new Uint8Array(count),threatened=new Uint8Array(count);
  for(const r of own)mine[r]=1;
  for(const r of own)if(MAP[r].neighbors.some(n=>MAP[n].playable&&!mine[n]))frontier[r]=1;
  // Regions with a land route to a front; any others can only look overseas.
  const landFront=new Uint8Array(count),fronts:number[]=[];
  for(const r of own)if(frontier[r]){landFront[r]=1;fronts.push(r);}
  for(let i=0;i<fronts.length;i++)for(const n of MAP[fronts[i]].neighbors)if(mine[n]&&!landFront[n]){landFront[n]=1;fronts.push(n);}
  // The survey covers the regions this country holds, borders or attacks; overseas targets are added later.
  const relevant=new Uint8Array(count);
  for(const r of own){relevant[r]=1;for(const n of MAP[r].neighbors)relevant[n]=1;}
  for(const army of s.armies)if(army.owner===actor)relevant[army.to]=1;
  const v=survey(s,actor,relevant);
  for(const r of own)if(power(v.threatH[r],v.threatD[r])>NONE)threatened[r]=1;
  // A region with a queued order cannot take another this turn: a second order would replace the queue.
  const free=new Uint8Array(count);for(const r of own)free[r]=Number(!threatened[r]&&!s.provinces[r].march&&v.readyN[r]>0);
  const speed=Math.min(...player.loadout.map(kind=>stats(player,kind).speed));
  const regionsOf=new Uint32Array(s.players.length);for(const p of s.provinces)if(p.owner>=0&&MAP[p.id].playable)regionsOf[p.owner]++;
  const ratioFor=(target:number)=>s.provinces[target].owner<0?AI.neutralAttackRatio:AI.attackRatio;
  const share=(r:number,battalions:number)=>({h:v.readyH[r]*battalions/v.readyN[r],d:v.readyD[r]*battalions/v.readyN[r]});
  const byDistance=(to:number)=>(a:number,b:number)=>distance(a,to)-distance(b,to)||a-b;

  /** Battalions a region keeps against enemy neighbours other than the one it may attack. */
  const reserve=(r:number,except:number)=>{
    let exposure=0;
    for(const m of MAP[r].neighbors){const owner=s.provinces[m].owner;if(m!==except&&owner>=0&&owner!==actor&&MAP[m].playable)exposure=Math.max(exposure,power(v.holdH[m],v.holdD[m]));}
    if(exposure<=NONE)return 0;
    const each=power(v.readyH[r]/v.readyN[r],v.readyD[r]/v.readyN[r]);
    return Math.min(v.readyN[r],Math.ceil(AI.reserveRatio*exposure/each-1e-9));
  };
  /** The largest dispatch that leaves `keep` battalions home, or the smallest one of at least `want`. */
  const fit=(r:number,keep:number,want=Infinity):Dispatch|undefined=>{
    const ready=v.readyN[r],limit=ready-keep;let best:Dispatch|undefined;
    for(const fraction of MARCH_FRACTIONS){
      const sent=marchDispatchCount(ready,fraction);if(sent>limit)break;
      best={fraction,count:sent};if(sent>=want)break;
    }
    return best;
  };
  const dispatch=(from:number,to:number,plan:Dispatch):boolean=>{
    const ok=execute(countryActions.march(from,to,plan.fraction)).ok;
    if(ok)free[from]=0;
    return ok;
  };

  // Defence. `relief` keeps what a region still lacks once help is under way (not when hopeless).
  const demand=new Float64Array(count),relief=new Float64Array(count);
  for(const r of own){
    if(!threatened[r])continue;
    const threat=power(v.threatH[r],v.threatD[r]);
    let h=v.readyH[r]+v.sentH[r],d=v.readyD[r]+v.sentD[r];
    if(power(h,d)>=DEFEND_RATIO*threat)continue;
    const helpers=MAP[r].neighbors.filter(n=>mine[n]&&free[n]).sort(byDistance(r)),plans=new Map<number,Dispatch>();
    let H=h,D=d;
    for(const n of helpers){const plan=fit(n,reserve(n,-1));if(!plan)continue;plans.set(n,plan);const add=share(n,plan.count);H+=add.h;D+=add.d;}
    if(power(H,D)<HOPELESS_BELOW*threat)continue;
    for(const [n,plan] of plans){
      if(power(h,d)>=DEFEND_RATIO*threat)break;
      if(dispatch(n,r,plan)){const add=share(n,plan.count);h+=add.h;d+=add.d;}
    }
    if(power(h,d)<DEFEND_RATIO*threat){relief[r]=DEFEND_RATIO*threat-power(h,d);demand[r]+=relief[r];}
  }

  // Recall attacks that have fallen far behind, unless neighbours can still turn them.
  const nearestOwn=(to:number)=>own.reduce((best,r)=>byDistance(to)(r,best)<0?r:best,own[0]);
  const attacked=[...new Set(s.armies.filter(army=>army.owner===actor&&!mine[army.to]).map(army=>army.to))].sort((a,b)=>a-b);
  for(const target of attacked){
    const held=holding(s,v,target);if(held<=NONE)continue;
    if(power(v.sentH[target],v.sentD[target])>=AI.retreatBelow*held)continue;
    let H=v.sentH[target],D=v.sentD[target];
    for(const n of MAP[target].neighbors)if(mine[n]&&free[n]){const plan=fit(n,reserve(n,target));if(plan){const add=share(n,plan.count);H+=add.h;D+=add.d;}}
    if(power(H,D)>=ratioFor(target)*held)continue;
    const home=nearestOwn(target);
    for(const army of s.armies)if(army.owner===actor&&army.to===target)execute(countryActions.armyMarch(army.id,home));
  }

  // Offence.
  const sourcesOf=new Map<number,number[]>();
  for(const r of own)for(const n of MAP[r].neighbors)if(MAP[n].playable&&!mine[n]){let list=sourcesOf.get(n);if(!list)sourcesOf.set(n,list=[]);list.push(r);}
  const ranked=[...sourcesOf].map(([target,sources])=>{
    const province=s.provinces[target],building=province.construction,held=holding(s,v,target),committed=power(v.sentH[target],v.sentD[target]);
    let value=1;
    if(building)value+=building.kind==='market'?MARKET_INCOME[building.level-1]:.5*building.level;
    if(province.owner>=0&&regionsOf[province.owner]<=FINISH_REGIONS)value+=FINISH_VALUE;
    if(province.captor===actor&&province.capture>0)value+=province.capture/CAPTURE_DAYS;
    const days=Math.min(...sources.map(r=>distance(r,target)))/speed+siegeDays(province);
    return {target,sources:sources.sort(byDistance(target)),held,committed,score:value/((Math.max(0,ratioFor(target)*held-committed)+1)*days)};
  }).sort((a,b)=>b.score-a.score||a.target-b.target);
  // The best target that cannot be served yet becomes the main effort: the region beside it that
  // already holds (or expects) the most troops gathers what is still missing.
  let mainEffort=false,gathering=-1;
  for(const {target,sources,held,committed} of ranked){
    const available=sources.filter(r=>free[r]);
    let shortfall:number;
    if(held<=NONE){
      if(committed>NONE)continue;
      if(available.some(r=>{const plan=fit(r,reserve(r,target),AI.detachment);return plan!==undefined&&dispatch(r,target,plan);}))continue;
      shortfall=AI.detachment;
    }else{
      const goal=ratioFor(target)*held;if(committed>=goal)continue;
      // A group arrives together: it starts at one region and adds the next nearest ones whose
      // march is at most MUSTER_SPREAD times longer. The quickest group that suffices goes.
      const offers:{r:number;plan:Dispatch;span:number}[]=[];
      for(const r of available){const plan=fit(r,reserve(r,target));if(plan)offers.push({r,plan,span:distance(r,target)});}
      let best=0,group:typeof offers|undefined;
      for(let i=0;i<offers.length&&!group;i++){
        let h=v.sentH[target],d=v.sentD[target];
        for(let j=i;j<offers.length&&offers[j].span<=offers[i].span*MUSTER_SPREAD;j++){
          const add=share(offers[j].r,offers[j].plan.count);h+=add.h;d+=add.d;
          if(power(h,d)>=goal){group=offers.slice(i,j+1);break;}
        }
        best=Math.max(best,power(h,d));
      }
      if(group){for(const {r,plan} of group)dispatch(r,target,plan);continue;}
      shortfall=goal-best;
    }
    if(mainEffort)continue;
    mainEffort=true;
    let staging=sources[0],gathered=-1;
    for(const r of sources){const here=power(v.readyH[r]+v.sentH[r],v.readyD[r]+v.sentD[r]);if(here>gathered+NONE){gathered=here;staging=r;}}
    demand[staging]+=Math.max(0,shortfall-power(v.sentH[staging],v.sentD[staging]));gathering=staging;
  }

  // Logistics, nearest donors first: garrisons not needed where they stand join the nearest region
  // that lacks strength. Interior garrisons come from anywhere; front regions keep their reserve
  // and give the rest only within GATHER_HOPS.
  const goalOf=new Int32Array(count).fill(-1),hops=new Int32Array(count),queue:number[]=[];
  for(const r of own)if(demand[r]>NONE){goalOf[r]=r;queue.push(r);}
  for(let i=0;i<queue.length;i++){const r=queue[i];for(const n of MAP[r].neighbors)if(mine[n]&&goalOf[n]<0){goalOf[n]=goalOf[r];hops[n]=hops[r]+1;queue.push(n);}}
  for(const r of queue){
    const goal=goalOf[r];if(goal===r||!free[r]||demand[goal]<=NONE||frontier[r]&&hops[r]>GATHER_HOPS)continue;
    const plan=fit(r,frontier[r]?reserve(r,-1):0);if(!plan||plan.count<AI.moveWith)continue;
    if(dispatch(r,goal,plan)){const sent=share(r,plan.count);demand[goal]-=power(sent.h,sent.d);}
  }
  // No land route to any front: garrisons try the nearest foreign regions overseas they can take.
  const isolated=own.filter(r=>!landFront[r]&&free[r]&&v.readyN[r]>=AI.moveWith),overseas=new Map<number,number[]>();
  if(isolated.length){
    const extra=new Uint8Array(count);
    for(const r of isolated){const targets=nearestForeign(r,mine);overseas.set(r,targets);for(const id of targets)if(!relevant[id])extra[id]=1;}
    surveyMore(s,actor,v,extra);
  }
  for(const r of isolated){
    const plan=fit(r,0);if(!plan)continue;
    const sent=share(r,plan.count),strength=power(sent.h,sent.d);
    for(const id of overseas.get(r)!)if(strength>=ratioFor(id)*holding(s,v,id)&&dispatch(r,id,plan))break;
  }

  // Construction: one building a turn, from the funds left above `buildAbove` after upgrades.
  const site=chooseConstruction(s,actor,player,own,{frontier,threatened,relief,gathering});
  if(site)execute({type:'construct',province:site.province,kind:site.kind,expectedLevel:site.level});
}

interface Situation{frontier:Uint8Array;threatened:Uint8Array;relief:Float64Array;gathering:number}
/** A fortress where an attack is coming and help, though under way, still falls short (a hopeless
 * region would only hand the fortress to its captor); fortress-doctrine countries also
 * fortify exposed fronts; countries paid per barracks build them where troops gather; otherwise the
 * market (new or raised) with the most income per cost, safest regions first. */
function chooseConstruction(s:GameState,actor:number,player:Player,own:readonly number[],{frontier,threatened,relief,gathering}:Situation):{province:number;kind:ConstructionKind;level:0|1|2}|undefined{
  if(player.funds<=AI.buildAbove)return;
  const top=maxConstructionLevel(player),profile=talentProfile(player);
  const levelOf=(r:number)=>(s.provinces[r].construction?.level??0) as 0|1|2;
  // A region can take `kind` if it is not being captured and holds nothing else, below the top level.
  const open=(r:number,kind:ConstructionKind)=>{const b=s.provinces[r].construction;return s.provinces[r].capture<=0&&(!b||b.kind===kind&&b.level<top);};
  const exposed=(r:number)=>MAP[r].neighbors.some(n=>{const owner=s.provinces[n].owner;return owner>=0&&owner!==actor&&MAP[n].playable;});
  // Only fortress-doctrine countries raise fortresses; anyone may found one where an attack is coming.
  const doctrine=profile.fortressDoctrine||profile.bastionGuns;
  let choice:{province:number;kind:ConstructionKind}|undefined,worst=NONE;
  for(const r of own)if(threatened[r]&&relief[r]>worst&&open(r,'fortress')&&(doctrine||!s.provinces[r].construction)){worst=relief[r];choice={province:r,kind:'fortress'};}
  if(!choice&&doctrine)for(const r of own)if(frontier[r]&&!threatened[r]&&exposed(r)&&!s.provinces[r].construction&&open(r,'fortress')){choice={province:r,kind:'fortress'};break;}
  if(!choice&&gathering>=0&&(profile.academy||profile.barracksCapacity)&&open(gathering,'barracks'))choice={province:gathering,kind:'barracks'};
  if(!choice){
    let best=0;
    for(const r of own){
      if(threatened[r]||!open(r,'market'))continue;
      const level=levelOf(r),gain=MARKET_INCOME[level]-(level?MARKET_INCOME[level-1]:0),safety=!frontier[r]?1:exposed(r)?EXPOSED_SAFETY:BORDER_SAFETY;
      const value=gain*safety/constructionCost('market',level,player);
      if(value>best){best=value;choice={province:r,kind:'market'};}
    }
  }
  if(!choice)return;
  const level=levelOf(choice.province);
  return constructionCost(choice.kind,level,player)<=player.funds?{...choice,level}:undefined;
}
