import { isEliminated, settleEliminations } from './elimination.ts';
export { isEliminated } from './elimination.ts';
import { chooseSpawnPairs, getSpawnCapacity } from './spawns.ts';
import { MAP, provinceAt, pointInProvince, PLAYABLE_COUNT } from './map.ts';
import {TerrainNavigator,terrainAt,terrainSegment,terrainLocalSegment,terrainClearance,travelCorridorPoint,distanceToTravelSegment,TRAVEL_LOCAL_OFFSET} from './terrain-navigation.ts';
import {UNIT_RADIUS,separateCircles,type CollisionReport} from './collision.ts';
import {buildingSegment,buildingStep} from './buildings.ts';
import {INITIAL_TERRITORY_GROUPING} from './map.ts';
import {regionCapacity,regionProductionRate,applyGroupingCommand,reconcileGrouping} from './territoryEconomy.ts';

import { destinationRoom } from './capacity.ts';
import { DT, MAP_ID, KINDS, STATS, TALENTS, UNITS, PROVINCE_CAP, stats, upgradeCost, validateSetup, talentApplies } from './content.ts';
import type { GameState, PlayerSetup, Player, Unit, Kind, Command, Result } from './types.ts';
function random(s:GameState):number{let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
export function createGame(setups:PlayerSetup[],seed=20261108,campaign=`campaign-${seed}`):GameState{
  if(setups.length<2||setups.length>getSpawnCapacity()||!setups.every(validateSetup))throw new Error('invalidSetup');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||campaign.length>100)throw new Error('invalidSetup');
  const s:GameState={version:5,map:MAP_ID,campaign,seed,rng:(seed>>>0)||1,tick:0,nextId:1,topology:0,grouping:structuredClone(INITIAL_TERRITORY_GROUPING),players:[],provinces:MAP.map(p=>({id:p.id,owner:-1,production:0,kind:'infantry',recovery:0,captor:-1,capture:0})),units:[],events:[],winner:null,domination:setups.map(()=>0)};
  s.players=setups.map((p,id)=>({id,name:p.name.trim(),leader:p.leader,...(p.flag?{flag:structuredClone(p.flag)}:{}),loadout:[...p.loadout],ai:p.ai??false,gold:120,xp:0,level:1,upgrades:Object.fromEntries(KINDS.map(k=>[k,{attack:0,health:0,speed:0}])) as Player['upgrades'],talents:[],choices:[],drafts:0,rerolls:1}));
  // Equal initial budgets: two complete locked gameplay regions and five
  // troops per region.
  const startingTroops=new Map<number,number>();
  chooseSpawnPairs(seed,setups.length,s).forEach((pair,actor)=>{
    for(const representative of pair){
      const groupId=s.grouping.atomToGroup[MAP[representative].code],group=s.grouping.groups.find(g=>g.id===groupId)!;
      const atoms=group.atoms.map(code=>MAP.findIndex(p=>p.code===code)).filter(id=>id>=0&&MAP[id].playable)
        .sort((a,b)=>Number(b===representative)-Number(a===representative)||a-b);
      let remaining=5;for(const id of atoms){s.provinces[id].owner=actor;const count=Math.min(remaining,regionCapacity(id));startingTroops.set(id,count);remaining-=count;}
    }
  });
  const frontier=new Set(s.provinces.filter(p=>p.owner>=0).flatMap(p=>MAP[p.id].neighbors));
  for(const p of s.provinces) {
    const count=!MAP[p.id].playable?0:p.owner>=0?(startingTroops.get(p.id)??0):frontier.has(p.id)?Math.min(2,regionCapacity(p.id)):0;
    if(p.owner>=0)p.kind=s.players[p.owner].loadout[0];
    for(let i=0;i<count;i++)spawn(s,p.id,p.kind);
  }
  s.grouping=reconcileGrouping(s);return s;
}
function spawn(s:GameState,province:number,kind:Kind):boolean{
  const p=s.provinces[province],id=s.nextId,c=MAP[province].center,radius=UNIT_RADIUS[kind];
  let x=c.x,z=c.z,best=-Infinity;
  const nearby=s.units.filter(u=>!u.transport?.embarked&&Math.abs(u.x-c.x)<9&&Math.abs(u.z-c.z)<9);
  // Search a deterministic small formation; don't spawn every reinforcement on
  // the same center. Tiny islands may still have less room than a full footprint.
  for(let i=0;i<512;i++){
    const a=(id+i)*2.399963,r=i<384?3*Math.sqrt(i/383):3+5*Math.sqrt((i-384)/127),candidate={x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r};
    if(!pointInProvince(province,candidate.x,candidate.z)||terrainAt(candidate,true)<0||!terrainSegment(c,candidate,false)||!buildingSegment(candidate,candidate,radius))continue;
    const gap=Math.min(radius,...nearby.map(u=>Math.hypot(u.x-candidate.x,u.z-candidate.z)-UNIT_RADIUS[u.kind]));
    const score=Math.min(gap,terrainClearance(candidate,radius));if(score>best){best=score;x=candidate.x;z=candidate.z;}if(score>=radius-1e-6)break;
  }
  if(!Number.isFinite(best))return false;s.nextId++;
  s.units.push({id,owner:p.owner,kind,x,z,hp:stats(s.players[p.owner],kind).hp,province,target:null,origin:province,destination:null,route:[],cooldown:0});return true;
}
function draft(s:GameState,p:Player):void{
  if(p.choices.length||p.drafts<=0)return;
  const available=TALENTS.filter(t=>!p.talents.includes(t.id)&&talentApplies(t,p.loadout)).map(t=>t.id);
  for(let i=available.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[available[i],available[j]]=[available[j],available[i]];}
  p.choices=available.slice(0,3);if(!p.choices.length)p.drafts=0;
}
function experience(s:GameState,id:number,amount:number):void{
  const p=s.players[id];if(!p)return;p.xp+=amount;
  while(p.level<8&&p.xp>=60+p.level*45){p.xp-=60+p.level*45;p.level++;p.drafts++;s.events.push({tick:s.tick,key:'level',player:id});}draft(s,p);
}
export class Engine{
  state:GameState;navigation=new TerrainNavigator();
  collision:CollisionReport={candidates:0,contacts:0,maxPenetration:0,limited:0,constraints:0,constraintLimited:0};
  constructor(state:GameState){this.state=structuredClone(state);settleEliminations(this.state);this.clearBuildings();}
  command(actor:number,input:unknown):Result{
    const s=this.state,p=s.players[actor],fail=(error:string):Result=>({ok:false,error});
    if(!p||s.winner!==null)return fail('notPlaying');if(isEliminated(s,actor))return fail('eliminated');if(!input||typeof input!=='object')return fail('invalidCommand');const c=input as Command;
    switch(c.type){
      case 'mergeGroups':case 'splitGroup':{
        const input=c.type==='mergeGroups'?{type:'merge',mapId:MAP_ID,groups:c.groups,expectedRevision:c.expectedRevision}:{type:'split',mapId:MAP_ID,group:c.group,atoms:c.atoms,expectedRevision:c.expectedRevision};
        const result=applyGroupingCommand(s,actor,input);if(!result.ok)return fail(result.error);s.grouping=result.state;return{ok:true};
      }
      case 'march':{
        if(!Number.isInteger(c.from)||!Number.isInteger(c.to)||!Number.isFinite(c.fraction)||c.fraction<0.25||c.fraction>1)return fail('invalidCommand');
        const from=s.provinces[c.from],to=s.provinces[c.to];if(!from||!to||from.owner!==actor)return fail('notOwner');
        if(!MAP[c.from].playable||!MAP[c.to].playable||c.from===c.to)return fail('invalidCommand');
        const available=s.units.filter(u=>u.owner===actor&&u.province===c.from&&u.target===null);
        const requested=Math.floor(available.length*c.fraction);if(requested<1)return fail('noTroops');
        const n=Math.min(requested,destinationRoom(s,actor,c.to));if(n<1)return fail('targetFull');
        let sent=0;
        for(const u of available){if(sent>=n)break;const st=stats(p,u.kind),travel=this.navigation.plan(u,MAP[c.to].center,st.speed,st.seaSpeed);if(!travel)continue;
          u.target=c.to;u.origin=u.province;u.destination=c.to;u.route=[];u.travel=travel;delete u.transport;sent++;
        }
        return sent?{ok:true}:fail('unreachable');
      }
      case 'production':{
        if(!Number.isInteger(c.province)||!KINDS.includes(c.kind)||!p.loadout.includes(c.kind))return fail('invalidCommand');
        const province=s.provinces[c.province];if(!province||!MAP[c.province].playable||province.owner!==actor)return fail('notOwner');
        // Keep the fractional work when changing the queue; switching never grants a free unit.
        province.production=Math.min(province.production/UNITS[province.kind].train,0.99)*UNITS[c.kind].train;province.kind=c.kind;return{ok:true};
      }
      case 'upgrade':{
        if(!KINDS.includes(c.kind)||!STATS.includes(c.stat)||!p.loadout.includes(c.kind))return fail('invalidCommand');
        const level=p.upgrades[c.kind][c.stat],cost=upgradeCost(level);if(level>=8)return fail('maxLevel');if(p.gold<cost)return fail('noGold');
        const oldHp=stats(p,c.kind).hp;p.gold-=cost;p.upgrades[c.kind][c.stat]++;
        if(c.stat==='health'){const newHp=stats(p,c.kind).hp;for(const u of s.units)if(u.owner===actor&&u.kind===c.kind)u.hp=u.hp/oldHp*newHp;}return{ok:true};
      }
      case 'talent':{
        if(typeof c.id!=='string'||!p.choices.includes(c.id))return fail('invalidChoice');p.talents.push(c.id);p.choices=[];p.drafts--;draft(s,p);return{ok:true};
      }
      case 'reroll':{
        if(!p.choices.length||p.rerolls<1)return fail('noRerolls');p.rerolls--;p.choices=[];draft(s,p);return{ok:true};
      }
      default:return fail('invalidCommand');
    }
  }
  step(count=1):void{for(let n=0;n<count;n++){if(this.state.winner!==null)return;this.tick();}}
  private tick():void{
    const s=this.state,topologyBefore=s.topology;s.tick++;this.clearBuildings();
    const damage=new Map<number,{amount:number;attacker:number}>(),buckets=new Map<string,Unit[]>();
    // Reservations and production use locked game-region accounts; transit is unconstrained.
    const popKey=(owner:number,region:number)=>(owner+1)*MAP.length+region;
    for(const u of s.units){if(u.transport?.embarked)continue;const key=`${Math.floor(u.x/8)},${Math.floor(u.z/8)}`,b=buckets.get(key)??[];b.push(u);buckets.set(key,b);}
    for(const u of s.units){
      const st=stats(s.players[u.owner],u.kind);
      // Carry sub-tick remainder during continuous fire (e.g. 0.65 attacks/s).
      u.cooldown=u.cooldown>0?u.cooldown-DT:0;let enemy:Unit|undefined,nearest=st.range*st.range;
      const bx=Math.floor(u.x/8),bz=Math.floor(u.z/8);
      for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const v of buckets.get(`${x},${z}`)??[]){if(u.transport?.embarked||v.transport?.embarked||v.owner===u.owner)continue;const d=(u.x-v.x)**2+(u.z-v.z)**2;if(d<nearest||(d===nearest&&enemy&&v.id<enemy.id)){nearest=d;enemy=v;}}
      if(enemy){
        if(u.cooldown<=1e-9){
          const targets=[enemy];
          if(st.splash>0){
            const nearby:Unit[]=[];const ex=Math.floor(enemy.x/8),ez=Math.floor(enemy.z/8);
            for(let x=ex-1;x<=ex+1;x++)for(let z=ez-1;z<=ez+1;z++)nearby.push(...(buckets.get(`${x},${z}`)??[]));
            const extra=nearby.filter(v=>v.id!==enemy!.id&&v.owner!==u.owner&&!v.transport?.embarked&&
              Math.hypot(v.x-enemy!.x,v.z-enemy!.z)<=st.splash)
              .sort((a,b)=>(a.x-enemy!.x)**2+(a.z-enemy!.z)**2-((b.x-enemy!.x)**2+(b.z-enemy!.z)**2)||a.id-b.id);
            targets.push(...extra.slice(0,2));
          }
          for(const [i,target] of targets.entries()){
            const defender=s.players[target.owner],home=s.provinces[target.province]?.owner===target.owner;
            const reduction=home&&defender?.talents.includes('entrenchment')?0.15:0;
            const amount=st.attack*(i===0?1:0.35)*100/(100+stats(defender,target.kind).defense)*(1-reduction),old=damage.get(target.id);
            damage.set(target.id,{amount:(old?.amount??0)+amount,attacker:u.owner});
          }
          u.cooldown+=1/st.attackSpeed;
        }continue;
      }
      u.cooldown=Math.max(0,u.cooldown);
      // The terrain objective stays at the town anchor. Resting/capturing
      // troops approach it until houses and neighboring footprints stop them;
      // no ring slots, angles or cosmetic offsets are assigned.
      if(!u.travel&&!u.transport?.embarked){
        const center=MAP[u.province].center,dx=center.x-u.x,dz=center.z-u.z,d=Math.hypot(dx,dz),step=Math.min(d,st.speed*DT);
        const to=d?{x:u.x+dx/d*step,z:u.z+dz/d*step}:u;
        let crowded=false;
        for(let x=bx-1;x<=bx+1&&!crowded;x++)for(let z=bz-1;z<=bz+1&&!crowded;z++)for(const v of buckets.get(`${x},${z}`)??[]){
          if(v.id===u.id)continue;const gap=UNIT_RADIUS[u.kind]+UNIT_RADIUS[v.kind],after=Math.hypot(to.x-v.x,to.z-v.z);
          if(after<gap-1e-6&&after<Math.hypot(u.x-v.x,u.z-v.z)-1e-8){crowded=true;break;}
        }
        if(!crowded&&pointInProvince(u.province,to.x,to.z)&&terrainLocalSegment(u,to)&&buildingSegment(u,to,UNIT_RADIUS[u.kind])&&terrainClearance(to,UNIT_RADIUS[u.kind])+1e-8>=terrainClearance(u,UNIT_RADIUS[u.kind])){u.x=to.x;u.z=to.z;}
      }
      if(u.target===null)continue;
      const travel=u.travel;
      if(!travel){if(s.provinces[u.target].owner===u.owner)this.halt(u);continue;}
      const point=travel.points[travel.index];let steering=point;
      // Stay near the certified route while allowing lateral local separation.
      // Short reconnects avoid casting a continent-long ray for every contact.
      if(!point.sea&&distanceToTravelSegment(travel,u)>1e-6){
        let next=travelCorridorPoint(travel,u,1.2);if(!terrainLocalSegment(u,next))next=travelCorridorPoint(travel,u);
        steering={...next,sea:false};
      }
      const dx=steering.x-u.x,dz=steering.z-u.z,d=Math.hypot(dx,dz),goalDistance=Math.hypot(point.x-u.x,point.z-u.z),move=Math.min(d,(point.sea?st.seaSpeed:st.speed)*DT);
      let nx=d?u.x+dx/d*move:steering.x,nz=d?u.z+dz/d*move:steering.z;
      if(steering!==point&&!terrainLocalSegment({x:nx,z:nz},travelCorridorPoint(travel,{x:nx,z:nz}))){
        const q=travelCorridorPoint(travel,u),qx=q.x-u.x,qz=q.z-u.z,qd=Math.hypot(qx,qz),step=Math.min(qd,st.speed*DT);
        nx=qd?u.x+qx/qd*step:u.x;nz=qd?u.z+qz/qd*step:u.z;
      }
      const last=travel.index===travel.points.length-1;
      // A garrison occupies an area, not one exact point. Let arriving troops
      // settle around the objective instead of forever driving into its center.
      const aheadScale=goalDistance?Math.min(5/goalDistance,1):0,ahead={x:u.x+(point.x-u.x)*aheadScale,z:u.z+(point.z-u.z)*aheadScale};
      if(!point.sea&&(!buildingSegment(u,{x:nx,z:nz},UNIT_RADIUS[u.kind])||!buildingSegment(u,ahead,UNIT_RADIUS[u.kind]))){
        const resolved=buildingStep(u,point,UNIT_RADIUS[u.kind],move,(a,b)=>terrainLocalSegment(a,b)&&distanceToTravelSegment(travel,b)<=TRAVEL_LOCAL_OFFSET&&terrainLocalSegment(b,travelCorridorPoint(travel,b)));nx=resolved.x;nz=resolved.z;
      }
      const nearbyArrival=last&&!point.sea&&goalDistance<=2.3&&pointInProvince(u.target,nx,nz);
      const candidate={x:nx,z:nz},nextPlan={...travel,index:travel.index+1};
      // Advance only within the next certified land corridor; a house can
      // occupy the original waypoint, but coast transitions are never skipped.
      const waypointRadius=buildingSegment(point,point,UNIT_RADIUS[u.kind])?1.2:2.5;
      const nearbyWaypoint=!last&&!point.sea&&!travel.points[travel.index+1].sea&&goalDistance<=waypointRadius&&distanceToTravelSegment(nextPlan,candidate)<=TRAVEL_LOCAL_OFFSET&&terrainLocalSegment(candidate,travelCorridorPoint(nextPlan,candidate));
      const arrived=goalDistance<=move+1e-9||nearbyArrival||nearbyWaypoint,final=arrived&&last;
      // Administrative capacities limit garrisons, not transit through boundaries.
      if(final&&s.units.filter(v=>v.id!==u.id&&v.owner===u.owner&&v.province===u.target&&!v.travel).length>=regionCapacity(u.target))continue;
      u.x=nx;u.z=nz;const region=provinceAt(nx,nz);if(region>=0)u.province=region;
      if(point.sea)u.transport={from:u.origin,to:u.target,index:travel.index,embarked:true};else delete u.transport;
      if(arrived&&(point.sea||nearbyArrival||nearbyWaypoint||Math.hypot(u.x-point.x,u.z-point.z)<=1e-6)){if(!nearbyArrival&&!nearbyWaypoint){u.x=point.x;u.z=point.z;}travel.index++;if(!final&&travel.points[travel.index].sea)u.transport={from:u.origin,to:u.target,index:travel.index,embarked:true};if(final){u.province=u.target;delete u.travel;delete u.transport;if(s.provinces[u.target].owner===u.owner)this.halt(u);}}
    }
    // Apply accumulated damage simultaneously, so entity iteration order cannot prevent retaliation.
    for(const u of s.units){const hit=damage.get(u.id);if(hit){u.hp-=hit.amount;if(u.hp<=0)experience(s,hit.attacker,12);}}s.units=s.units.filter(u=>u.hp>0);
    this.separate();
    // Sparse destinations scale with moving armies, not players × the entire map.
    const reservations=new Map<number,number>();
    for(const u of s.units)if(u.destination!==null&&u.province!==u.destination){const key=popKey(u.owner,u.destination);reservations.set(key,(reservations.get(key)??0)+1);}
    const byProvince=new Map<number,Unit[]>();
    for(const u of s.units){if(u.transport?.embarked)continue;const group=byProvince.get(u.province)??[];group.push(u);byProvince.set(u.province,group);}
    for(const province of s.provinces){
      const occupants=byProvince.get(province.id)??[];
      if(!MAP[province.id].playable||(province.owner<0&&!occupants.length))continue;
      const center=MAP[province.id].center,nearby=occupants.filter(u=>Math.hypot(u.x-center.x,u.z-center.z)<3.7),owners=[...new Set(nearby.map(u=>u.owner))];
      const attacker=owners.length===1&&owners[0]>=0&&owners[0]!==province.owner?owners[0]:-1;
      if(attacker>=0){
        if(province.captor!==attacker){province.captor=attacker;province.capture=0;}
        const player=s.players[attacker],engineers=nearby.some(u=>u.kind==='engineer');
        province.capture+=DT*(engineers?1.5:1)*(player.talents.includes('conqueror')?1.3:1)*(engineers&&player.talents.includes('sappers')?1.3:1);
        if(province.capture>=8){province.owner=attacker;province.capture=0;province.captor=-1;province.recovery=15;province.production=0;province.kind=player.loadout[0];s.topology++;experience(s,attacker,50);player.gold+=30;s.events.push({tick:s.tick,key:'capture',player:attacker,province:province.id});for(const u of nearby)if(u.owner===attacker&&u.target===province.id){u.province=province.id;this.advance(u);}}
      }else{province.capture=Math.max(0,province.capture-DT*2);if(!province.capture)province.captor=-1;}
      if(province.owner<0)continue;const owner=s.players[province.owner];owner.gold+=DT*0.5*regionProductionRate(province.id);province.recovery=Math.max(0,province.recovery-DT);
      if(owners.some(id=>id!==province.owner))continue;
      const garrison=occupants.filter(u=>u.owner===province.owner).length;
      if(garrison+(reservations.get(popKey(province.owner,province.id))??0)>=regionCapacity(province.id))continue;
      province.production+=DT*regionProductionRate(province.id)*(province.recovery>0?0.5:1)*(owner.talents.includes('industry')?1.2:1)*(owner.talents.includes('logistics')?1.1:1);
      if(province.production>=UNITS[province.kind].train){province.production-=UNITS[province.kind].train;if(!spawn(s,province.id,province.kind))province.production=UNITS[province.kind].train;}
    }
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
  private halt(unit:Unit):void {delete unit.travel;delete unit.transport;unit.target=null;unit.destination=null;unit.route=[];unit.origin=unit.province;}
  /** Repair old saves / newly disembarked units that started inside a house.
   * Only same-land, same-province (or certified route corridor) candidates count. */
  private clearBuildings():void {
    for(const u of [...this.state.units].sort((a,b)=>a.id-b.id)){
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
        u.x=to.x;u.z=to.z;if(u.travel)u.province=provinceAt(to.x,to.z);found=true;break;
      }
      // A physically overcrowded old garrison may have no non-overlapping unit
      // slot. Never leave it inside a solid house: choose the best legal ground
      // and let the bounded unit solver continue resolving the softer crowd.
      if(!found&&fallback){u.x=fallback.x;u.z=fallback.z;if(u.travel)u.province=provinceAt(u.x,u.z);}
    }
  }
  private separate():void {
    const bodies=this.state.units.filter(u=>!u.transport?.embarked).map(unit=>({id:unit.id,x:unit.x,z:unit.z,radius:UNIT_RADIUS[unit.kind],mobility:unit.travel ? .15 : 1,unit}));
    const clearance=new Map<number,number>();
    this.collision=separateCircles(bodies,(body,to)=>{
      const u=body.unit,travel=u.travel;if(!buildingSegment(body,to,body.radius))return false;
      if(travel){if(distanceToTravelSegment(travel,to)>TRAVEL_LOCAL_OFFSET)return false;}
      else if(!pointInProvince(u.province,to.x,to.z))return false;
      if((travel&&provinceAt(to.x,to.z)<0)||!terrainLocalSegment(body,to))return false;
      // Existing narrow-corridor/old-save footprints can be clipped. A push may
      // improve their clearance, never force them farther through a physical wall.
      let before=clearance.get(body.id);if(before===undefined){before=terrainClearance(body,body.radius);clearance.set(body.id,before);}
      const after=terrainClearance(to,body.radius,true);if(after+1e-8<before)return false;
      if(travel&&!terrainLocalSegment(to,travelCorridorPoint(travel,to)))return false;
      clearance.set(body.id,after);return true;
    },this.state.tick);
    for(const b of bodies){const u=b.unit;if(u.x===b.x&&u.z===b.z)continue;u.x=b.x;u.z=b.z;if(u.travel)u.province=provinceAt(u.x,u.z);}
  }
  private advance(unit:Unit):void {this.halt(unit);}
  private ai():void{
    const s=this.state;
    // Each faction still acts once per 80 ticks, but stagger the expensive
    // navigation work. Actor 1 retains its original first action at tick 80.
    const scheduled=s.players.filter(p=>p.ai&&(p.id+79)%80===(s.tick-80)%80);
    if(!scheduled.length)return;
    const territories=new Map<number,number[]>(),garrisons=new Map<number,Unit[]>();
    for(const v of s.provinces)if(MAP[v.id].playable&&v.owner>=0){const ids=territories.get(v.owner)??[];ids.push(v.id);territories.set(v.owner,ids);}
    for(const u of s.units){const units=garrisons.get(u.province)??[];units.push(u);garrisons.set(u.province,units);}
    for(const p of scheduled.filter(p=>territories.has(p.id))){
      if(p.choices.length)this.command(p.id,{type:'talent',id:p.choices[0]});
      if(p.gold>160)this.command(p.id,{type:'upgrade',kind:p.loadout[Math.floor(random(s)*p.loadout.length)],stat:STATS[Math.floor(random(s)*3)]});
      for(const id of territories.get(p.id)??[]){
        const province=s.provinces[id],units=(garrisons.get(id)??[]).filter(u=>u.owner===p.id&&u.target===null);
        // Small administrative atoms must be able to move a full garrison.
        if(units.length<Math.min(4,regionCapacity(province.id))||!units.length)continue;
        const neighbors=MAP[province.id].neighbors,targets=neighbors.filter(id=>s.provinces[id].owner!==p.id).sort((a,b)=>(garrisons.get(a)?.length??0)-(garrisons.get(b)?.length??0));
        let destination:number|undefined=targets[0]??neighbors.filter(id=>MAP[id].neighbors.some(n=>s.provinces[n].owner!==p.id))[0];
        if(destination===undefined){
          const candidates=MAP.filter(m=>m.playable&&s.provinces[m.id].owner!==p.id)
            .sort((a,b)=>Math.hypot(a.center.x-MAP[province.id].center.x,a.center.z-MAP[province.id].center.z)-Math.hypot(b.center.x-MAP[province.id].center.x,b.center.z-MAP[province.id].center.z)||a.id-b.id).slice(0,4);
          destination=candidates.find(m=>this.navigation.plan(MAP[province.id].center,m.center))?.id;
        }
        if(destination!==undefined)this.command(p.id,{type:'march',from:province.id,to:destination,fraction:Math.max(0.75,1/units.length)});
      }
    }
  }
}
