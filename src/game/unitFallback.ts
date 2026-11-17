import {MAP,pointInProvince,provinceAt} from './map.ts';
import {DT,stats} from './content.ts';
import type {Kind,Unit,GameState} from './types.ts';
import {UNIT_RADIUS} from './collision.ts';
import {combatLanes,secondaryMultiplier,secondaryTargets,MODE_TARGET_MASK,MODE_VS_MARCHING,MODE_VS_GARRISON,MODE_POINT_BLANK,MODE_SPLASH_RESIST,TARGET_BONUS,POINT_BLANK_BONUS,POINT_BLANK_RANGE_SQUARED,SPLASH_RESIST_FACTOR} from './talentEffects.ts';
import {ARRIVAL_RADIUS,buildingSegment,buildingStep} from './buildings.ts';
import {terrainAt,terrainSegment,terrainLocalSegment,terrainClearance,travelCorridorPoint,distanceToTravelSegment,TRAVEL_LOCAL_OFFSET} from './terrain-navigation.ts';
/** Exact JavaScript path for scratch limits or unavailable parallel workers. */
export function updateUnitsFallback(active:readonly Unit[],unitStats:(owner:number,kind:Kind)=>ReturnType<typeof stats>,s:GameState,damage:Map<number,{amount:number;attacker:number}>,halt:(u:Unit)=>void):void {
 // Talent lanes use positions and orders at the start of the pass, exactly like the packed kernel rows.
 const {mode,taken,dealt,speed}=combatLanes(active,s,unitStats);
 const hit=(source:number,target:number,multiplier:number,close:boolean)=>{
  const attacker=active[source],victim=active[target],targetMode=mode[source]&MODE_TARGET_MASK;let bonus=dealt[source];
  if(targetMode===MODE_VS_MARCHING){if(victim.target!==null)bonus+=TARGET_BONUS;}
  else if(targetMode===MODE_VS_GARRISON){if(victim.target===null)bonus+=TARGET_BONUS;}
  else if(targetMode===MODE_POINT_BLANK){if(close)bonus+=POINT_BLANK_BONUS;}
  const amount=unitStats(attacker.owner,attacker.kind).attack*multiplier*(1+bonus)*100/(100+unitStats(victim.owner,victim.kind).defense)*(1-taken[target]),old=damage.get(victim.id);
  damage.set(victim.id,{amount:(old?.amount??0)+amount,attacker:attacker.owner});
 };
 const buckets=new Map<number,Map<number,Map<number,number[]>>>();
    const liveX=new Float64Array(active.length),liveZ=new Float64Array(active.length),liveOwners=new Int32Array(active.length),liveIds=new Float64Array(active.length),liveRadii=new Float64Array(active.length),embarked=new Uint8Array(active.length);
    for(let index=0;index<active.length;index++){const u=active[index];liveX[index]=u.x;liveZ[index]=u.z;liveOwners[index]=u.owner;liveIds[index]=u.id;liveRadii[index]=UNIT_RADIUS[u.kind];embarked[index]=Number(!!u.transport?.embarked);if(u.transport?.embarked)continue;const x=Math.floor(u.x/8),z=Math.floor(u.z/8);let column=buckets.get(x);if(!column){column=new Map();buckets.set(x,column);}let owners=column.get(z);if(!owners){owners=new Map();column.set(z,owners);}let list=owners.get(u.owner);if(!list){list=[];owners.set(u.owner,list);}list.push(index);}
    // The bucket membership stays fixed for this movement/combat pass. Cache
    // its ordered references, while every distance still reads live positions.
    const neighborhoods=new Map<number,Map<number,{all:number[];enemies:Map<number,number[]>}>>();
    const neighborhood=(bx:number,bz:number)=>{
      let column=neighborhoods.get(bx);if(!column){column=new Map();neighborhoods.set(bx,column);}let result=column.get(bz);
      if(!result){const all:number[]=[];for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)for(const list of buckets.get(x)?.get(z)?.values()??[])for(const unit of list)all.push(unit);
        result={all,enemies:new Map()};column.set(bz,result);}
      return result;
    };
    const updateUnit=(index:number)=>{
      const u=active[index],ux=liveX[index],uz=liveZ[index],st=unitStats(u.owner,u.kind),landSpeed=speed[index]===speed[index]?speed[index]:st.speed;
      // Carry sub-tick remainder during continuous fire (e.g. 0.65 attacks/s).
      u.cooldown=u.cooldown>0?u.cooldown-DT:0;let enemy:Unit|undefined,enemyIndex=-1,nearest=st.range*st.range;
      const bx=Math.floor(u.x/8),bz=Math.floor(u.z/8);
      if(!u.transport?.embarked){const cell=neighborhood(bx,bz);let opponents=cell.enemies.get(u.owner);
        if(!opponents){opponents=cell.all.filter(v=>liveOwners[v]!==u.owner);cell.enemies.set(u.owner,opponents);}
        for(const other of opponents){if(embarked[other])continue;const d=(ux-liveX[other])**2+(uz-liveZ[other])**2;if(d<nearest||(d===nearest&&enemy&&liveIds[other]<enemy.id)){nearest=d;enemy=active[other];enemyIndex=other;}}
      }
      if(enemy){
        if(u.cooldown<=1e-9){
          hit(index,enemyIndex,1,nearest<=POINT_BLANK_RANGE_SQUARED);
          if(st.splash>0){
            const nearby=neighborhood(Math.floor(enemy.x/8),Math.floor(enemy.z/8)).all,secondary=secondaryMultiplier(mode[index]);
            const extra=nearby.filter(v=>active[v].id!==enemy!.id&&active[v].owner!==u.owner&&!active[v].transport?.embarked&&
              Math.hypot(active[v].x-enemy!.x,active[v].z-enemy!.z)<=st.splash)
              .sort((a,b)=>(active[a].x-enemy!.x)**2+(active[a].z-enemy!.z)**2-((active[b].x-enemy!.x)**2+(active[b].z-enemy!.z)**2)||active[a].id-active[b].id);
            for(const other of extra.slice(0,secondaryTargets(mode[index])))hit(index,other,secondary*(mode[other]&MODE_SPLASH_RESIST?SPLASH_RESIST_FACTOR:1),false);
          }
          u.cooldown+=1/st.attackSpeed;
        }return;
      }
      u.cooldown=Math.max(0,u.cooldown);
      // The terrain objective stays at the town anchor. Resting/capturing
      // troops approach it until houses and neighboring footprints stop them;
      // no ring slots, angles or cosmetic offsets are assigned.
      if(!u.travel&&!u.transport?.embarked){
        const center=MAP[u.province].center,dx=center.x-u.x,dz=center.z-u.z,d=Math.hypot(dx,dz),step=Math.min(d,landSpeed*DT);
        const to=d?{x:u.x+dx/d*step,z:u.z+dz/d*step}:u;
        let crowded=false;
        for(const other of neighborhood(bx,bz).all){
          if(other===index)continue;const gap=liveRadii[index]+liveRadii[other],after=Math.hypot(to.x-liveX[other],to.z-liveZ[other]);
          if(after<gap-1e-6&&after<Math.hypot(ux-liveX[other],uz-liveZ[other])-1e-8){crowded=true;break;}
        }
        if(!crowded&&pointInProvince(u.province,to.x,to.z)&&terrainLocalSegment(u,to)&&buildingSegment(u,to,UNIT_RADIUS[u.kind])&&terrainClearance(to,UNIT_RADIUS[u.kind],true)+1e-8>=terrainClearance(u,UNIT_RADIUS[u.kind],true)){u.x=to.x;u.z=to.z;}
      }
      if(!u.travel){liveX[index]=u.x;liveZ[index]=u.z;}
      if(u.target===null)return;
      const travel=u.travel;
      if(!travel){if(s.provinces[u.target].owner===u.owner)halt(u);return;}
      const point=travel.points[travel.index];let steering=point;
      // Stay near the certified route while allowing lateral local separation.
      // Short reconnects avoid casting a continent-long ray for every contact.
      if(!point.sea&&distanceToTravelSegment(travel,u)>1e-6){
        let next=travelCorridorPoint(travel,u,1.2);if(!terrainLocalSegment(u,next))next=travelCorridorPoint(travel,u);
        steering={...next,sea:false};
      }
      const dx=steering.x-u.x,dz=steering.z-u.z,d=Math.hypot(dx,dz),goalDistance=Math.hypot(point.x-u.x,point.z-u.z),move=Math.min(d,(point.sea?st.seaSpeed:landSpeed)*DT);
      let nx=d?u.x+dx/d*move:steering.x,nz=d?u.z+dz/d*move:steering.z;
      if(steering!==point&&!terrainLocalSegment({x:nx,z:nz},travelCorridorPoint(travel,{x:nx,z:nz}))){
        const q=travelCorridorPoint(travel,u),qx=q.x-u.x,qz=q.z-u.z,qd=Math.hypot(qx,qz),step=Math.min(qd,landSpeed*DT);
        nx=qd?u.x+qx/qd*step:u.x;nz=qd?u.z+qz/qd*step:u.z;
      }
      const last=travel.index===travel.points.length-1,radius=UNIT_RADIUS[u.kind];
      // A garrison occupies an area, not one exact point. Let arriving troops
      // settle around the objective instead of forever driving into its center.
      const aheadScale=goalDistance?Math.min(5/goalDistance,1):0,ahead={x:u.x+(point.x-u.x)*aheadScale,z:u.z+(point.z-u.z)*aheadScale};
      let detour=!point.sea&&(!buildingSegment(u,{x:nx,z:nz},radius)||!buildingSegment(u,ahead,radius)),shadow=false;
      // Corridor steering must not step into a town's shadow: the house planner would
      // walk the unit straight back out on the next tick, forever. It plans this step too.
      if(!detour&&steering!==point){
        const nextDistance=Math.hypot(point.x-nx,point.z-nz),nextScale=nextDistance?Math.min(5/nextDistance,1):0;
        shadow=detour=!buildingSegment({x:nx,z:nz},{x:nx+(point.x-nx)*nextScale,z:nz+(point.z-nz)*nextScale},radius);
      }
      if(detour){
        const resolved=buildingStep(u,point,radius,move,(a,b)=>terrainLocalSegment(a,b)&&distanceToTravelSegment(travel,b)<=TRAVEL_LOCAL_OFFSET&&terrainLocalSegment(b,travelCorridorPoint(travel,b)),last?u.target:-1);
        // Without a planned way past the town, the clear corridor step still beats standing still.
        if(!shadow||resolved.x!==u.x||resolved.z!==u.z){nx=resolved.x;nz=resolved.z;}
      }
      const nearbyArrival=last&&!point.sea&&goalDistance<=ARRIVAL_RADIUS&&pointInProvince(u.target,nx,nz);
      const candidate={x:nx,z:nz},nextPlan={...travel,index:travel.index+1};
      // Advance only within the next certified land corridor; a house can
      // occupy the original waypoint, but coast transitions are never skipped.
      const waypointRadius=buildingSegment(point,point,UNIT_RADIUS[u.kind])?1.2:2.5;
      const nearbyWaypoint=!last&&!point.sea&&!travel.points[travel.index+1].sea&&goalDistance<=waypointRadius&&distanceToTravelSegment(nextPlan,candidate)<=TRAVEL_LOCAL_OFFSET&&terrainLocalSegment(candidate,travelCorridorPoint(nextPlan,candidate));
      const arrived=goalDistance<=move+1e-9||nearbyArrival||nearbyWaypoint,final=arrived&&last;
      // Production budgets do not limit movement or final arrival.
      u.x=nx;u.z=nz;const region=provinceAt(nx,nz);if(region>=0)u.province=region;
      if(point.sea)u.transport={from:u.origin,to:u.target,index:travel.index,embarked:true};else delete u.transport;
      if(arrived&&(point.sea||nearbyArrival||nearbyWaypoint||Math.hypot(u.x-point.x,u.z-point.z)<=1e-6)){if(!nearbyArrival&&!nearbyWaypoint){u.x=point.x;u.z=point.z;}travel.index++;if(!final&&travel.points[travel.index].sea)u.transport={from:u.origin,to:u.target,index:travel.index,embarked:true};if(final){u.province=u.target;delete u.travel;delete u.transport;if(s.provinces[u.target].owner===u.owner)halt(u);}}
      liveX[index]=u.x;liveZ[index]=u.z;embarked[index]=Number(!!u.transport?.embarked);
    };
    for(let index=0;index<active.length;index++)updateUnit(index);
}
