import {ARRIVAL_RADIUS, buildingFootprint, buildingSegment, buildingStep} from './buildings.ts';
import {UNIT_RADIUS} from './collision.ts';
import {DT, stats} from './content.ts';
import {MAP, pointInProvince, provinceAt} from './map.ts';
import {terrainAt, terrainClearance, terrainLandFootprint, terrainLocalSegment, terrainSegment, type TerrainNavigator} from './terrain-navigation.ts';
import type {Army, ArmyFormation, GameState, Unit, Vec2} from './types.ts';

const SPACE = .08;
const SHIP_RADIUS = .6;
const EMBARK_COST = 20;
const CELL = 8;
const distance = (a:Vec2,b:Vec2) => Math.hypot(a.x-b.x,a.z-b.z);
const angleTo = (a:Vec2,b:Vec2) => Math.atan2(b.z-a.z,b.x-a.x);
const offset = (a:Vec2,angle:number,forward:number,side=0):Vec2 => ({x:a.x+Math.cos(angle)*forward-Math.sin(angle)*side,z:a.z+Math.sin(angle)*forward+Math.cos(angle)*side});
const toward = (a:Vec2,b:Vec2,step:number):Vec2 => distance(a,b)<=step?b:offset(a,angleTo(a,b),step);
const square = (count:number) => Math.ceil(Math.sqrt(count));

export function armyMembers(state:Pick<GameState,'armies'|'units'>):Map<number,Unit[]> {
  const members=new Map(state.armies.map(army=>[army.id,[] as Unit[]]));
  for(const unit of state.units)if(unit.army!==undefined)members.get(unit.army)?.push(unit);
  return members;
}

function slot(center:Vec2,heading:number,columns:number,count:number,spacing:number,index:number):Vec2 {
  const row=Math.floor(index/columns),rowCount=Math.min(columns,count-row*columns);
  return offset(center,heading,(Math.floor((count-1)/columns)/2-row)*spacing,(index%columns-(rowCount-1)/2)*spacing);
}

interface Footprint {center:Vec2; heading:number; length:number; width:number}
function footprint(center:Vec2,heading:number,columns:number,count:number,radius:number):Footprint {
  const spacing=2*radius+SPACE;
  return {center,heading,length:Math.floor((count-1)/columns)*spacing/2+radius,width:(columns-1)*spacing/2+radius};
}

function overlaps(a:Footprint,b:Footprint):boolean {
  for(const angle of [a.heading,a.heading+Math.PI/2,b.heading,b.heading+Math.PI/2]){
    const span=(p:Footprint)=>p.length*Math.abs(Math.cos(p.heading-angle))+p.width*Math.abs(Math.sin(p.heading-angle));
    const d=Math.abs((a.center.x-b.center.x)*Math.cos(angle)+(a.center.z-b.center.z)*Math.sin(angle));
    if(d>=span(a)+span(b)-1e-7)return false;
  }
  return true;
}

function legalLand(p:Vec2,radius:number):boolean {
  return provinceAt(p.x,p.z)>=0&&terrainClearance(p,radius)>=radius-1e-8&&buildingSegment(p,p,radius);
}

function legalFootprint(body:Footprint,radius:number):boolean {
  if(!legalLand(body.center,radius)||!buildingFootprint(body.center,body.heading,body.length,body.width))return false;
  if(terrainClearance(body.center,Math.hypot(body.length,body.width),true)>=Math.hypot(body.length,body.width)-1e-8)return true;
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>offset(body.center,body.heading,x*body.length,z*body.width));
  return terrainLandFootprint(corners);
}

function profile(state:GameState,members:readonly Unit[],to:number){
  let radius=0,land=Infinity,sea=Infinity;
  for(const u of members){
    const p=state.players[u.owner],s=stats(p,u.kind);
    radius=Math.max(radius,UNIT_RADIUS[u.kind]);
    land=Math.min(land,s.speed*(state.provinces[to].owner===u.owner&&p.talents.includes('logistics')?1.4:1));
    sea=Math.min(sea,s.seaSpeed);
  }
  return {radius,land,sea};
}

function* around(center:Vec2,heading:number,min:number,max:number){
  for(let radius=min;radius<=max;radius+=.5)for(let i=0;i<24;i++){
    const turn=i%2===0?i/2:-(i+1)/2;
    yield offset(center,heading+turn*Math.PI/12,radius);
  }
}

export function planDeployment(state:GameState,navigation:TerrainNavigator,from:number,to:number,members:readonly Unit[]):ArmyFormation|null {
  const center=MAP[from].center,goal=MAP[to].center,heading=angleTo(center,goal),columns=square(members.length);
  const {radius,land,sea}=profile(state,members,to);
  const existing=activeFootprints(state,armyMembers(state)).filter(entry=>entry.army.id!==state.provinces[from].march?.army);
  const landPoints=around(center,heading,2.5,8);
  for(const position of landPoints){
    const body=footprint(position,heading,columns,members.length,radius);
    if(!legalFootprint(body,radius)||distance(center,position)<ARRIVAL_RADIUS+Math.hypot(body.length,body.width)||!terrainLocalSegment(center,position)||existing.some(entry=>!entry.sea&&overlaps(entry.body,body)))continue;
    const route=navigation.plan(position,goal,land,sea,false,EMBARK_COST);
    if(route){
      const departureHeading=angleTo(position,route.points[1]);
      if(legalFootprint(footprint(position,departureHeading,columns,members.length,radius),radius))return {from,phase:'assemble',position,heading:departureHeading,columns,route,lastContact:0};
    }
  }
  for(const position of around(center,heading,1,8)){
    if(terrainAt(position,true)>=0||!waterFootprint(position)||existing.some(entry=>entry.sea&&distance(entry.body.center,position)<2*SHIP_RADIUS))continue;
    const route=navigation.plan(position,goal,land,sea,true,EMBARK_COST);
    if(route)return {from,phase:'sea',position,heading,columns,route,lastContact:0,readyAt:state.tick+1};
  }
  return null;
}

function waterFootprint(p:Vec2):boolean {
  return terrainSegment(offset(p,0,-SHIP_RADIUS),offset(p,0,SHIP_RADIUS),true)&&terrainSegment(offset(p,Math.PI/2,-SHIP_RADIUS),offset(p,Math.PI/2,SHIP_RADIUS),true);
}

/** Search only the immediate obstruction. The main terrain route stays shared. */
function localDetour(start:Vec2,goal:Vec2,clear:(position:Vec2)=>boolean):Vec2[]|undefined {
  const heading=angleTo(start,goal),stride=.55,forward=Math.min(6,Math.ceil(distance(start,goal)/stride));
  type Node={x:number;z:number;point:Vec2;cost:number;previous?:Node};
  const pending:Node[]=[{x:0,z:0,point:start,cost:0}],seen=new Map<string,number>([['0:0',0]]);
  while(pending.length){
    const estimate=(n:Node)=>n.cost+Math.max(0,forward-n.x)+Math.abs(n.z)*.15;
    let index=0;for(let i=1;i<pending.length;i++)if(estimate(pending[i])<estimate(pending[index]))index=i;
    const node=pending.splice(index,1)[0];
    if(node.x>=forward){
      const path:Vec2[]=[];
      for(let next:Node|undefined=node;next?.previous;next=next.previous)path.unshift(next.point);
      return path;
    }
    for(const [dx,dz] of [[1,0],[1,1],[1,-1],[0,1],[0,-1],[-1,1],[-1,-1],[-1,0]]){
      const x=node.x+dx,z=node.z+dz,key=`${x}:${z}`,cost=node.cost+Math.hypot(dx,dz);
      if(x< -5||x>forward||Math.abs(z)>10||cost>=(seen.get(key)??Infinity))continue;
      const point=offset(start,heading,x*stride,z*stride),d=distance(node.point,point),slices=Math.ceil(d/.09);
      if(!clear(point))continue;
      let swept=true;
      for(let i=1;i<slices;i++)if(!clear(toward(node.point,point,i*d/slices))){swept=false;break;}
      if(!swept)continue;
      seen.set(key,cost);pending.push({x,z,point,cost,previous:node});
    }
  }
}

function standing(u:Unit,army:Army,to:Vec2,status:NonNullable<Unit['armyStatus']>):void {
  const from=army.formation!.from;
  u.x=to.x;u.z=to.z;u.target=army.to;u.destination=army.to;u.origin=from;
  u.armyStatus=status;
  if(status==='sea')u.transport={from,to:army.to,index:army.formation!.route.index,embarked:true};
  else {delete u.transport;const region=provinceAt(to.x,to.z);if(region>=0)u.province=region;}
}

export function orderMember(state:GameState,army:Army,unit:Unit):void {
  unit.army=army.id;
  if(army.formation!.phase==='sea')standing(unit,army,army.formation!.position,'sea');
  else unit.armyStatus='queued';
  if(state.provinces[army.to].owner!==army.owner&&unit.target!==null)unit.assault=army.to;
}

export function redirectFormation(state:GameState,navigation:TerrainNavigator,army:Army,members:Unit[],to:number):boolean {
  const f=army.formation!;
  const {land,sea}=profile(state,members,to);
  const start=members.find(u=>u.armyStatus==='field'||u.armyStatus==='inside')??f.position;
  const deployment=f.phase==='assemble'?planDeployment(state,navigation,f.from,to,members):null;
  const route=deployment?.route??navigation.plan(start,MAP[to].center,land,sea,f.phase==='sea'&&f.route.points[f.route.index].sea,EMBARK_COST);
  if(!route)return false;
  if(f.phase==='battle'||f.engaged){f.redirect=to;return true;}
  f.route=route;f.position=deployment?.position??{x:start.x,z:start.z};army.to=to;
  if(deployment){
    f.phase=deployment.phase;f.heading=deployment.heading;f.columns=deployment.columns;
    if(deployment.phase==='sea')f.readyAt=state.tick+1;else delete f.readyAt;
  }
  delete f.detour;delete f.retryAt;
  const queue=state.provinces[f.from].march;
  if(queue?.army===army.id&&f.phase==='sea')delete state.provinces[f.from].march;
  else if(queue?.army===army.id){
    const {reserved,...rest}=queue;
    state.provinces[f.from].march={...rest,to,...(state.provinces[to].owner===army.owner?{reserved:true}:{})};
  }
  for(const u of members){
    if(f.phase==='sea'){standing(u,army,f.position,'sea');if(state.provinces[to].owner!==u.owner)u.assault=to;else delete u.assault;continue;}
    if(u.armyStatus==='queued')continue;
    standing(u,army,u,u.armyStatus==='inside'?'field':u.armyStatus!);
    if(state.provinces[to].owner!==u.owner)u.assault=to;else delete u.assault;
  }
  if(f.phase==='enter')f.phase='battle';
  return true;
}

type ArmyBody = {army:Army;body:Footprint;sea:boolean};
function activeFootprints(state:GameState,members:Map<number,Unit[]>):ArmyBody[] {
  return state.armies.flatMap(army=>{
    const f=army.formation,units=members.get(army.id);
    if(!f||!units?.length||f.phase==='battle'||f.phase==='enter')return [];
    const sea=f.phase==='sea',radius=sea?SHIP_RADIUS:profile(state,units,army.to).radius;
    return [{army,body:footprint(f.position,f.heading,sea?1:f.columns,sea?1:units.length,radius),sea}];
  });
}

function cell(x:number,z:number):number{return (Math.floor(x/CELL)+32768)*65536+Math.floor(z/CELL)+32768;}
function neighborIndex(state:GameState){
  const cells=new Map<number,Unit[]>();
  for(const u of state.units){
    if(u.transport?.embarked)continue;
    const key=cell(u.x,u.z),list=cells.get(key);
    if(list)list.push(u);else cells.set(key,[u]);
  }
  return (p:Vec2,r:number)=>{
    const nearby:Unit[]=[];
    for(let x=Math.floor((p.x-r)/CELL);x<=Math.floor((p.x+r)/CELL);x++)for(let z=Math.floor((p.z-r)/CELL);z<=Math.floor((p.z+r)/CELL);z++){
      const list=cells.get(cell(x*CELL,z*CELL));if(list)nearby.push(...list);
    }
    return nearby;
  };
}

export function updateFormations(state:GameState,navigation:TerrainNavigator,interval:number,halt:(u:Unit)=>void,dirty:(u:Unit)=>void):void {
  if(!state.armies.some(a=>a.formation))return;
  const members=armyMembers(state),bodies=activeFootprints(state,members),nearby=neighborIndex(state);
  for(const army of state.armies){
    const f=army.formation,units=members.get(army.id)!;
    if(!f||!units.length)continue;
    const source=state.provinces[f.from];
    const queue=source.march?.army===army.id?source.march:undefined;
    let field=units.filter(u=>u.armyStatus!=='queued');
    if(queue&&source.owner!==army.owner){
      for(const u of units)if(u.armyStatus==='queued')halt(u);
      delete source.march;
    }
    const available=source.owner===army.owner?units:field;
    if(!available.length)continue;
    const {radius,land,sea}=profile(state,available,army.to),spacing=radius*2+SPACE;
    const target=MAP[army.to].center,goal=f.route.points[f.route.index];
    let columns=Math.min(f.columns,available.length);
    const ownBody=bodies.find(entry=>entry.army===army);
    const blocked=(body:Footprint,onWater=false)=>bodies.some(entry=>entry!==ownBody&&entry.sea===onWater&&overlaps(body,entry.body));
    const foes=nearby(f.position,12+available.length*radius).filter(u=>u.owner!==army.owner&&!u.transport?.embarked);
    const enemyFor=(u:Unit,contact:boolean)=>{
      let result:Unit|undefined,best=Infinity;
      const range=stats(state.players[u.owner],u.kind).range;
      for(const enemy of foes){
        const d=distance(u,enemy),reach=Math.max(range,stats(state.players[enemy.owner],enemy.kind).range);
        if((!contact||d<reach+.25)&&(d<best||(d===best&&enemy.id<(result?.id??Infinity)))){best=d;result=enemy;}
      }
      return result;
    };
    if(queue&&source.march===queue&&(source.lastMarchTick===undefined||state.tick-source.lastMarchTick>=interval)){
      const pending=available.filter(u=>u.armyStatus==='queued');
      const next=pending.shift();
      if(next){
        const position=slot(f.position,f.heading,columns,available.length,spacing,available.indexOf(next));
        const anchor=MAP[f.from].center,heading=angleTo(anchor,position),r=UNIT_RADIUS[next.kind];
        const p=[...around(anchor,heading,1,3)].find(point=>legalLand(point,r)&&terrainLocalSegment(point,position)&&buildingSegment(point,position,r))??position;
        if(legalLand(p,UNIT_RADIUS[next.kind])){
          standing(next,army,p,f.phase==='battle'?'field':'formed');
          if(state.provinces[army.to].owner!==army.owner)next.assault=army.to;
          dirty(next);source.lastMarchTick=state.tick;field=[...field,next].sort((a,b)=>a.id-b.id);
          if(pending.length)source.march={...queue,pendingIds:pending.map(u=>u.id)};else delete source.march;
        }
      }else delete source.march;
    }

    const contact=f.phase!=='sea'&&field.some(u=>enemyFor(u,true));
    f.engaged=contact;
    if(contact){
      f.lastContact=state.tick;
      if(f.phase!=='enter'||!field.some(u=>u.armyStatus==='inside'))f.phase='battle';
      for(const u of field)if(u.armyStatus==='formed'){u.armyStatus='field';dirty(u);}
    }
    if(f.phase==='enter'&&f.redirect!==undefined&&!contact&&state.tick-f.lastContact>=20){
      f.phase='battle';
      for(const u of field)if(u.armyStatus==='inside'){u.armyStatus='field';dirty(u);}
    }

    if(f.phase==='assemble'){
      let ready=0;
      for(const [index,u] of available.entries()){
        if(u.armyStatus==='queued')continue;
        const p=slot(f.position,f.heading,columns,available.length,spacing,index),r=UNIT_RADIUS[u.kind];
        const speed=stats(state.players[u.owner],u.kind).speed*DT;
        if(distance(u,p)>1e-7){
          const next=buildingStep(u,p,r,speed,(a,b)=>terrainLocalSegment(a,b)&&legalLand(b,r));
          standing(u,army,next,'formed');dirty(u);
        }
        if(distance(u,p)<=1e-7)ready++;
      }
      f.readyCount=ready;
      if(ready!==available.length){delete f.readyAt;continue;}
      if(f.readyAt===undefined){f.readyAt=state.tick+1;continue;}
      if(state.tick<f.readyAt)continue;
      f.phase='march';
    }

    if(f.phase==='sea'){
      if(state.tick<(f.readyAt??0))continue;
      if(!goal.sea){
        const heading=angleTo(f.position,goal);
        const points=[toward(f.position,goal,2),...around(f.position,heading,1,4)];
        let landing:Vec2|undefined;
        for(const p of points){
          if(!terrainLocalSegment(p,toward(f.position,goal,.07)))continue;
          columns=square(field.length);
          while(columns>1&&!legalFootprint(footprint(p,heading,columns,field.length,radius),radius))columns--;
          const body=footprint(p,heading,columns,field.length,radius);
          if(legalFootprint(body,radius)&&!blocked(body)){landing=p;break;}
        }
        if(!landing)continue;
        f.position=landing;f.heading=heading;f.columns=columns;f.phase='march';
        if(ownBody){ownBody.body=footprint(landing,heading,columns,field.length,radius);ownBody.sea=false;}
        field.forEach((u,i)=>{standing(u,army,slot(landing,heading,columns,field.length,spacing,i),'formed');dirty(u);});
      }else{
        const heading=angleTo(f.position,goal),step=sea*DT;
        const direct=toward(f.position,goal,step);
        const p=[direct,offset(f.position,heading,step*.5,step*.8),offset(f.position,heading,step*.5,-step*.8)].find(p=>!blocked(footprint(p,heading,1,1,SHIP_RADIUS),true)&&terrainSegment(f.position,p,true)&&terrainSegment(p,direct,true));
        if(!p)continue;
        const body=footprint(p,heading,1,1,SHIP_RADIUS);
        f.heading=heading;f.position=p;
        if(distance(p,goal)<1e-8&&f.route.index<f.route.points.length-1)f.route.index++;
        if(ownBody)ownBody.body=body;
        for(const u of field){standing(u,army,p,'sea');dirty(u);}
        continue;
      }
    }

    if(f.phase==='march'){
      const embark=f.route.points[f.route.index+1]?.sea&&field.some(u=>distance(u,goal)<=2.3&&terrainSegment(u,goal,false));
      if(goal.sea||embark){
        if(!goal.sea){f.route.index++;f.position={x:goal.x,z:goal.z};}
        f.phase='sea';
        if(ownBody){ownBody.body=footprint(f.position,f.heading,1,1,SHIP_RADIUS);ownBody.sea=true;}
        for(const u of field){standing(u,army,f.position,'sea');dirty(u);}
        continue;
      }
      const final=f.route.index===f.route.points.length-1;
      if(final&&distance(f.position,target)<=Math.max(ARRIVAL_RADIUS+radius,2.3+Math.floor((field.length-1)/columns)*spacing/2)){
        f.phase='enter';for(const u of field){u.armyStatus='field';dirty(u);}
      }else{
        const heading=angleTo(f.position,goal),step=land*DT;
        const turn=Math.atan2(Math.sin(heading-f.heading),Math.cos(heading-f.heading));
        const nextHeading=f.heading+Math.max(-.13,Math.min(.13,turn));
        const next=toward(f.position,f.detour?.[0]??goal,step);
        const compact=footprint(next,nextHeading,columns,field.length,radius);
        const clear=(p:Vec2,c:number)=>{
          const body=footprint(p,nextHeading,c,field.length,radius);
          return legalFootprint(body,radius)&&!blocked(body);
        };
        let destination=next;
        if(!legalFootprint(compact,radius)||blocked(compact)){
          const previousColumns=columns;
          while(columns>1&&!clear(destination,columns))columns--;
          if(!clear(destination,columns)){
            if((f.retryAt??0)<=state.tick){
              delete f.detour;
              for(let width=previousColumns;width>=1;width--){
                if(!clear(f.position,width))continue;
                const detour=localDetour(f.position,goal,p=>clear(p,width));
                if(detour?.length){f.detour=detour;columns=width;break;}
              }
              f.retryAt=state.tick+12;
            }
            destination=f.detour?.length?toward(f.position,f.detour[0],step):f.position;
            if(!clear(destination,columns))columns=previousColumns;
          }
        }else if(!f.detour?.length&&columns<square(field.length)&&clear(destination,columns+1)&&clear(offset(destination,heading,2),columns+1))columns++;
        if(!clear(destination,columns))continue;
        const desired=field.map((u,i)=>slot(destination,nextHeading,columns,field.length,spacing,i));
        const moved=field.map((u,i)=>{
          const speed=columns===f.columns?land*DT*1.2:land*DT;
          return buildingStep(u,desired[i],UNIT_RADIUS[u.kind],speed,(a,b)=>terrainLocalSegment(a,b)&&legalLand(b,UNIT_RADIUS[u.kind]));
        });
        field.forEach((u,i)=>{standing(u,army,moved[i],'formed');dirty(u);});
        f.heading=Math.atan2(Math.sin(nextHeading),Math.cos(nextHeading));f.columns=columns;
        if(moved.every((point,i)=>distance(point,desired[i])<=.14)){
          f.position=destination;
          if(f.detour?.length&&distance(destination,f.detour[0])<1e-8){f.detour=f.detour.slice(1);if(!f.detour.length)delete f.detour;}
          if(distance(destination,goal)<1e-8&&!final){f.route.index++;delete f.detour;}
        }
        if(ownBody)ownBody.body=footprint(f.position,f.heading,columns,field.length,radius);
        continue;
      }
    }

    if(f.phase==='battle'||f.phase==='enter'){
      for(const [index,u] of field.entries()){
        if(u.armyStatus==='inside'){
          if(state.provinces[army.to].owner===army.owner)halt(u);
          else if(distance(u,target)>ARRIVAL_RADIUS+1e-7){u.armyStatus='field';dirty(u);}
          continue;
        }
        const enemy=contact?enemyFor(u,false):undefined;
        const range=stats(state.players[u.owner],u.kind).range;
        if(enemy&&distance(u,enemy)<range)continue;
        const objective=enemy?offset(enemy,angleTo(u,enemy),-range*.75,(index%3-1)*.45):f.phase==='enter'?target:goal;
        const p=buildingStep(u,objective,UNIT_RADIUS[u.kind],stats(state.players[u.owner],u.kind).speed*DT,(a,b)=>terrainLocalSegment(a,b),enemy||f.phase==='battle'?-1:army.to);
        standing(u,army,p,'field');dirty(u);
        if(f.phase==='enter'&&pointInProvince(army.to,p.x,p.z)&&distance(p,target)<=ARRIVAL_RADIUS){
          u.province=army.to;u.armyStatus='inside';
          if(state.provinces[army.to].owner===army.owner)halt(u);
        }
      }
      if(f.phase==='battle'&&field.length){
        if(!queue)f.position={x:field[0].x,z:field[0].z};
        if(!contact&&state.tick-f.lastContact>=20&&field.length===available.length){
          const next=f.redirect??army.to;
          if(next===army.to&&distance(f.position,target)<=ARRIVAL_RADIUS+radius+1){f.phase='enter';continue;}
          const heading=angleTo(f.position,MAP[next].center),width=square(field.length);
          const position=[f.position,...around(f.position,heading,.5,4)].find(p=>{
            const body=footprint(p,heading,width,field.length,radius);
            return legalFootprint(body,radius)&&!blocked(body)&&terrainLocalSegment(f.position,p);
          });
          if(!position)continue;
          const route=navigation.plan(position,MAP[next].center,land,sea,false,EMBARK_COST);
          if(!route)continue;
          delete f.redirect;delete f.readyAt;delete f.detour;delete f.retryAt;
          army.to=next;f.route=route;f.position=position;f.heading=heading;f.phase='assemble';f.columns=width;
          for(const u of field){standing(u,army,u,'formed');if(state.provinces[next].owner!==u.owner)u.assault=next;else delete u.assault;dirty(u);}
        }
      }
    }
  }
}
