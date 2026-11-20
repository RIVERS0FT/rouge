import {ARRIVAL_RADIUS, buildingFootprint, buildingSegment, buildingStep} from './buildings.ts';
import {UNIT_RADIUS} from './collision.ts';
import {BALANCE} from './balance.ts';
import {DT, stats, type UnitStats} from './content.ts';
import {MAP, pointInProvince, provinceAt} from './map.ts';
import {nearbyShorePoints, terrainAt, terrainClearance, terrainLandFootprint, terrainLocalSegment, terrainSegment, withinSeaCorridor, type TerrainNavigator} from './terrain-navigation.ts';
import type {Army, ArmyFormation, GameState, Kind, Unit, Vec2} from './types.ts';

const SPACE = .08;
const SHIP_RADIUS = .6;
const EMBARK_COST = 20;
const CELL = 8;
const FORMATION_CELL = 3;
const CONTACT_EPSILON = 1e-7;
const DETOUR_STRIDE = .55;
const DETOUR_FORWARD = 6;
const DETOUR_SIDE = 10;
const DETOUR_REACH = Math.hypot(DETOUR_FORWARD,DETOUR_SIDE)*DETOUR_STRIDE;
const DETOUR_DIAGONAL = Math.hypot(1,1);
const DETOUR_DIRECTIONS = [[1,0],[1,1],[1,-1],[0,1],[0,-1],[-1,1],[-1,-1],[-1,0]] as const;
const distance = (a:Vec2,b:Vec2) => Math.hypot(a.x-b.x,a.z-b.z);
const angleTo = (a:Vec2,b:Vec2) => Math.atan2(b.z-a.z,b.x-a.x);
const offset = (a:Vec2,angle:number,forward:number,side=0):Vec2 => ({x:a.x+Math.cos(angle)*forward-Math.sin(angle)*side,z:a.z+Math.sin(angle)*forward+Math.cos(angle)*side});
const toward = (a:Vec2,b:Vec2,step:number):Vec2 => distance(a,b)<=step?b:offset(a,angleTo(a,b),step);
const square = (count:number) => Math.ceil(Math.sqrt(count));

export function armyMembers(state:Pick<GameState,'armies'|'units'>):Map<number,Unit[]> {
  const members=new Map<number,Unit[]>();
  for(const army of state.armies)members.set(army.id,[]);
  for(const unit of state.units)if(unit.army!==undefined)members.get(unit.army)?.push(unit);
  return members;
}

function slot(center:Vec2,heading:number,columns:number,count:number,spacing:number,index:number):Vec2 {
  const row=Math.floor(index/columns),rowCount=Math.min(columns,count-row*columns);
  return offset(center,heading,(Math.floor((count-1)/columns)/2-row)*spacing,(index%columns-(rowCount-1)/2)*spacing);
}

interface FootprintShape {
  heading:number; length:number; width:number; radius:number;
  extentX:number; extentZ:number;
}

function footprintShape(heading:number,columns:number,count:number,radius:number):FootprintShape {
  const spacing=2*radius+SPACE;
  const length=Math.floor((count-1)/columns)*spacing/2+radius,width=(columns-1)*spacing/2+radius;
  const cos=Math.abs(Math.cos(heading)),sin=Math.abs(Math.sin(heading)),l=Math.abs(length),w=Math.abs(width);
  return {heading,length,width,radius:Math.hypot(length,width),
    extentX:l*cos+w*sin+CONTACT_EPSILON,extentZ:l*sin+w*cos+CONTACT_EPSILON};
}

interface Footprint {center:Vec2; shape:FootprintShape}
function footprint(center:Vec2,heading:number,columns:number,count:number,radius:number):Footprint {
  return {center,shape:footprintShape(heading,columns,count,radius)};
}

function separated(a:FootprintShape,b:FootprintShape,dx:number,dz:number,axis:number):boolean {
  const aAngle=a.heading-axis,bAngle=b.heading-axis;
  const aSpan=a.length*Math.abs(Math.cos(aAngle))+a.width*Math.abs(Math.sin(aAngle));
  const bSpan=b.length*Math.abs(Math.cos(bAngle))+b.width*Math.abs(Math.sin(bAngle));
  return Math.abs(dx*Math.cos(axis)+dz*Math.sin(axis))>=aSpan+bSpan-CONTACT_EPSILON;
}

function overlaps(center:Vec2,shape:FootprintShape,other:Footprint):boolean {
  const dx=center.x-other.center.x,dz=center.z-other.center.z,b=other.shape;
  if(Math.abs(dx)>shape.extentX+b.extentX||Math.abs(dz)>shape.extentZ+b.extentZ)return false;
  // Inscribed circles certify overlap in every separating axis. Keep the
  // tolerance band on the original predicate for touching and narrow shapes.
  const inner=Math.min(shape.length,shape.width)+Math.min(b.length,b.width)-2*CONTACT_EPSILON;
  if(inner>0&&dx*dx+dz*dz<inner*inner)return true;
  return !separated(shape,b,dx,dz,shape.heading)&&!separated(shape,b,dx,dz,shape.heading+Math.PI/2)
    &&!separated(shape,b,dx,dz,b.heading)&&!separated(shape,b,dx,dz,b.heading+Math.PI/2);
}

function overlapDepth(center:Vec2,shape:FootprintShape,other:Footprint):number {
  const dx=center.x-other.center.x,dz=center.z-other.center.z,b=other.shape;
  let depth=Infinity;
  for(const h of [shape.heading,shape.heading+Math.PI/2,b.heading,b.heading+Math.PI/2]){
    const span=(s:FootprintShape)=>s.length*Math.abs(Math.cos(s.heading-h))+s.width*Math.abs(Math.sin(s.heading-h));
    depth=Math.min(depth,span(shape)+span(b)-Math.abs(dx*Math.cos(h)+dz*Math.sin(h)));
  }
  return depth;
}
const landClearanceByCell=new Map<number,number>();
/** Static lower bound for any point in a one-unit cell. Near coastlines and
 * for larger footprints, use the precise query as before. */
function formationClearance(point:Vec2,radius:number):number {
  const x=Math.floor(point.x),z=Math.floor(point.z),key=x*65536+z;
  let clearance=landClearanceByCell.get(key);
  if(clearance===undefined){
    clearance=terrainClearance({x:x+.5,z:z+.5},5)-Math.SQRT1_2-1e-5;
    if(landClearanceByCell.size>=65536)landClearanceByCell.clear();
    landClearanceByCell.set(key,clearance);
  }
  return clearance>=radius?radius:terrainClearance(point,radius);
}

function legalLand(p:Vec2,radius:number):boolean {
  return provinceAt(p.x,p.z)>=0&&formationClearance(p,radius)>=radius-1e-8&&buildingSegment(p,p,radius);
}

function legalFormationStep(from:Vec2,to:Vec2,radius:number):boolean {
  // legalLand already checks a circle of this size. If it contains the whole
  // step, it also certifies the segment against physical terrain boundaries.
  return legalLand(to,radius)&&(Math.abs(from.x-to.x)+Math.abs(from.z-to.z)<radius-1e-7||terrainLocalSegment(from,to));
}

function legalFootprint(center:Vec2,shape:FootprintShape,radius:number):boolean {
  if(provinceAt(center.x,center.z)<0)return false;
  const clearance=formationClearance(center,Math.max(shape.radius,radius));
  if(clearance<radius-1e-8||!buildingSegment(center,center,radius)||!buildingFootprint(center,shape.heading,shape.length,shape.width))return false;
  if(clearance>=shape.radius-1e-8)return true;
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>offset(center,shape.heading,x*shape.length,z*shape.width));
  return terrainLandFootprint(corners);
}

type StatsFor = (owner:number,kind:Kind)=>UnitStats;
function profile(state:GameState,members:readonly Unit[],to:number,statsFor:StatsFor=(owner,kind)=>stats(state.players[owner],kind)){
  let radius=0,land=Infinity,sea=Infinity;
  let previous:Unit|undefined;
  for(const u of members){
    if(previous&&previous.kind===u.kind&&previous.owner===u.owner)continue;
    previous=u;
    const p=state.players[u.owner],s=statsFor(u.owner,u.kind);
    radius=Math.max(radius,UNIT_RADIUS[u.kind]);
    land=Math.min(land,s.speed*(state.provinces[to].owner===u.owner&&p.talents.includes('logistics')?BALANCE.talents.logistics.speed:1));
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
  const shape=footprintShape(heading,columns,members.length,radius);
  // Every deployment candidate is within eight world units of this town.
  // Remove distant bodies once, before iterating the ordered candidate sites.
  const margin=8+Math.max(shape.radius,2*SHIP_RADIUS)+CONTACT_EPSILON;
  const existing=activeFootprints(state,armyMembers(state),center,margin,state.provinces[from].march?.army);
  const landPoints=around(center,heading,2.5,8);
  for(const position of landPoints){
    if(!legalFootprint(position,shape,radius)||distance(center,position)<ARRIVAL_RADIUS+shape.radius||!terrainLocalSegment(center,position)||existing.some(entry=>!entry.sea&&overlaps(position,shape,entry.body)))continue;
    const route=navigation.plan(position,goal,land,sea,false,EMBARK_COST);
    if(route){
      const departureHeading=angleTo(position,route.points[1]);
      if(legalFootprint(position,footprintShape(departureHeading,columns,members.length,radius),radius))return {from,phase:'assemble',position,heading:departureHeading,columns,route,lastContact:0};
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

interface LandingSite {point:Vec2; columns:number; shape:FootprintShape}
interface LandingSearch {
  from:Vec2; goal:Vec2; count:number; radius:number;
  sites:LandingSite[]; remaining:Generator<LandingSite>;
}
const landingSearches=new WeakMap<ArmyFormation,LandingSearch>();

function* landingSites(from:Vec2,goal:Vec2,heading:number,count:number,radius:number):Generator<LandingSite> {
  const shapes:FootprintShape[]=[],shapeAt=(width:number)=>shapes[width]??=footprintShape(heading,width,count,radius);
  const shore=toward(from,goal,.07),positions=[toward(from,goal,2),...around(from,heading,1,4)];
  for(const point of positions){
    if(!terrainLocalSegment(point,shore))continue;
    for(let columns=square(count);columns>=1;columns--){
      const shape=shapeAt(columns);
      if(legalFootprint(point,shape,radius)){yield {point,columns,shape};break;}
    }
  }
}

/** Coasts and towns are static. Reuse the same ordered landing sites while
 * waiting at the shore, and check moving army occupancy on every attempt. */
function findLanding(f:ArmyFormation,goal:Vec2,heading:number,count:number,radius:number,blocked:(center:Vec2,shape:FootprintShape)=>boolean):LandingSite|undefined {
  const from=f.position;
  let search=landingSearches.get(f);
  if(!search||search.from!==from||search.goal!==goal||search.count!==count||search.radius!==radius){
    search={from,goal,count,radius,sites:[],remaining:landingSites(from,goal,heading,count,radius)};
    landingSearches.set(f,search);
  }
  let landing=search.sites.find(site=>!blocked(site.point,site.shape));
  if(!landing)for(const site of search.remaining){
    search.sites.push(site);
    if(!blocked(site.point,site.shape)){landing=site;break;}
  }
  if(landing)landingSearches.delete(f);
  return landing;
}

/** Search only the immediate obstruction. The main terrain route stays shared. */
function localDetour(start:Vec2,goal:Vec2,clear:(position:Vec2)=>boolean):Vec2[]|undefined {
  const heading=angleTo(start,goal),stride=DETOUR_STRIDE,forward=Math.min(DETOUR_FORWARD,Math.ceil(distance(start,goal)/stride));
  type Node={x:number;z:number;point:Vec2;cost:number;previous?:Node};
  const depth=DETOUR_SIDE*2+1,offsetX=5;
  const seen=new Float64Array((forward+offsetX+1)*depth).fill(Infinity);
  // A node has the same footprint and fixed obstacles from every incoming edge.
  const passable=new Int8Array(seen.length);
  const keyOf=(x:number,z:number)=>(x+offsetX)*depth+z+DETOUR_SIDE;
  const pending:Node[]=[{x:0,z:0,point:start,cost:0}];
  seen[keyOf(0,0)]=0;
  while(pending.length){
    const estimate=(n:Node)=>n.cost+Math.max(0,forward-n.x)+Math.abs(n.z)*.15;
    let index=0;for(let i=1;i<pending.length;i++)if(estimate(pending[i])<estimate(pending[index]))index=i;
    const node=pending.splice(index,1)[0];
    if(node.x>=forward){
      const path:Vec2[]=[];
      for(let next:Node|undefined=node;next?.previous;next=next.previous)path.unshift(next.point);
      return path;
    }
    for(const [dx,dz] of DETOUR_DIRECTIONS){
      const x=node.x+dx,z=node.z+dz,key=keyOf(x,z),cost=node.cost+(dx&&dz?DETOUR_DIAGONAL:1);
      if(x< -offsetX||x>forward||Math.abs(z)>DETOUR_SIDE||cost>=seen[key])continue;
      if(passable[key]<0)continue;
      const point=offset(start,heading,x*stride,z*stride);
      if(!passable[key]){passable[key]=clear(point)?1:-1;if(passable[key]<0)continue;}
      const d=distance(node.point,point),slices=Math.ceil(d/.09);
      const edge=angleTo(node.point,point),cos=Math.cos(edge),sin=Math.sin(edge);
      let swept=true;
      for(let i=1;i<slices;i++){
        const step=i*d/slices;
        if(!clear({x:node.point.x+cos*step,z:node.point.z+sin*step})){swept=false;break;}
      }
      if(!swept)continue;
      seen[key]=cost;pending.push({x,z,point,cost,previous:node});
    }
  }
}

// A soldier held at an identical slot by static terrain/towns would run the
// same local visibility graph again. Dynamic unit separation happens later.
type HeldStep={x:number;z:number;gx:number;gz:number;radius:number;speed:number;arrival:number;formation:boolean};
const heldSteps=new WeakMap<Unit,HeldStep>();
function walkMember(u:Unit,goal:Vec2,radius:number,speed:number,formation:boolean,arrival=-1):Vec2 {
  const old=heldSteps.get(u);
  if(old&&u.x===old.x&&u.z===old.z&&goal.x===old.gx&&goal.z===old.gz&&old.radius===radius&&old.speed===speed&&old.arrival===arrival&&old.formation===formation)return u;
  const moved=buildingStep(u,goal,radius,speed,formation?(a,b)=>legalFormationStep(a,b,radius):(a,b)=>terrainLocalSegment(a,b),arrival);
  if(moved.x===u.x&&moved.z===u.z)heldSteps.set(u,{x:u.x,z:u.z,gx:goal.x,gz:goal.z,radius,speed,arrival,formation});
  else if(old)heldSteps.delete(u);
  return moved;
}

function standing(u:Unit,army:Army,to:Vec2,status:NonNullable<Unit['armyStatus']>):void {
  const from=army.formation!.from;
  u.x=to.x;u.z=to.z;u.target=army.to;u.destination=army.to;u.origin=from;
  u.armyStatus=status;
  if(status==='sea'){
    const leg=army.formation!.route.index;
    if(!u.transport?.embarked||u.transport.from!==from||u.transport.to!==army.to||u.transport.index!==leg)u.transport={from,to:army.to,index:leg,embarked:true};
  }else {delete u.transport;const region=provinceAt(to.x,to.z);if(region>=0)u.province=region;}
}

function setAssaultDestination(state:GameState,unit:Unit,to:number):void {
  if(state.provinces[to].owner!==unit.owner)unit.assault=to;else delete unit.assault;
}

export function orderMember(state:GameState,army:Army,unit:Unit):void {
  unit.army=army.id;
  if(army.formation!.phase==='sea'){
    standing(unit,army,army.formation!.position,'sea');
    setAssaultDestination(state,unit,army.to);
  }else unit.armyStatus='queued';
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
  delete f.detour;delete f.retryAt;delete f.blockedSince;delete f.replannedAt;delete f.yieldPoint;
  const queue=state.provinces[f.from].march;
  if(queue?.army===army.id&&f.phase==='sea')delete state.provinces[f.from].march;
  else if(queue?.army===army.id){
    const {reserved,...rest}=queue;
    state.provinces[f.from].march={...rest,to,...(state.provinces[to].owner===army.owner?{reserved:true}:{})};
  }
  for(const u of members){
    if(f.phase==='sea')standing(u,army,f.position,'sea');
    else {
      if(u.armyStatus==='queued')continue;
      standing(u,army,u,u.armyStatus==='inside'?'field':u.armyStatus!);
    }
    setAssaultDestination(state,u,to);
  }
  if(f.phase==='enter')f.phase='battle';
  return true;
}

type ArmyBody = {army:Army;body:Footprint;sea:boolean};
function activeFootprints(state:GameState,members:Map<number,Unit[]>,near?:Vec2,margin=0,exclude?:number):ArmyBody[] {
  const bodies:ArmyBody[]=[];
  for(const army of state.armies){
    const f=army.formation,units=members.get(army.id);
    if(!f||!units?.length||f.phase==='battle'||f.phase==='enter'||army.id===exclude)continue;
    const sea=f.phase==='sea';let radius=sea?SHIP_RADIUS:0;
    if(!sea)for(const u of units)radius=Math.max(radius,UNIT_RADIUS[u.kind]);
    const columns=sea?1:f.columns,count=sea?1:units.length;
    let prior=armyShapes.get(army);
    if(!prior||prior.shape.heading!==f.heading||prior.columns!==columns||prior.count!==count||prior.radius!==radius){
      prior={columns,count,radius,shape:footprintShape(f.heading,columns,count,radius)};
      armyShapes.set(army,prior);
    }
    if(near&&(Math.abs(f.position.x-near.x)>margin+prior.shape.radius||Math.abs(f.position.z-near.z)>margin+prior.shape.radius))continue;
    bodies.push({army,body:{center:f.position,shape:prior.shape},sea});
  }
  return bodies;
}
const armyShapes=new WeakMap<Army,{columns:number;count:number;radius:number;shape:FootprintShape}>();

function formationCell(n:number):number{return Math.floor(n/FORMATION_CELL);}
function formationKey(x:number,z:number):number{return x*65536+z;}
function gridBounds(center:Vec2,extentX:number,extentZ:number){
  return {left:formationCell(center.x-extentX),right:formationCell(center.x+extentX),
    top:formationCell(center.z-extentZ),bottom:formationCell(center.z+extentZ)};
}
type GridBounds = ReturnType<typeof gridBounds>;
type IndexedBody = ArmyBody & GridBounds & {generation:number;lastBlocker?:IndexedBody};
function bodyOverlaps(center:Vec2,shape:FootprintShape,entry:IndexedBody):boolean {
  // Each vessel uses one circular hull, including when it turns in a narrow channel.
  if(entry.sea)return (center.x-entry.body.center.x)**2+(center.z-entry.body.center.z)**2<(2*SHIP_RADIUS-CONTACT_EPSILON)**2;
  return overlaps(center,shape,entry.body);
}
function useGrid(bounds:GridBounds):boolean {
  const cells=(bounds.right-bounds.left+1)*(bounds.bottom-bounds.top+1);
  return cells>0&&cells<=64;
}

/** Keep the same step-local occupancy snapshot. Each move updates it before
 * the next army runs, including changes between land and water. */
class FormationOccupancy {
  private generation=0;
  readonly byArmy=new Map<Army,IndexedBody>();
  private land={cells:new Map<number,Set<IndexedBody>>(),large:new Set<IndexedBody>()};
  private water={cells:new Map<number,Set<IndexedBody>>(),large:new Set<IndexedBody>()};

  sync(bodies:ArmyBody[]){
    this.generation++;
    for(const body of bodies){
      const existing=this.byArmy.get(body.army);
      if(existing){
        existing.generation=this.generation;
        this.replace(existing,body.body,body.sea);
        continue;
      }
      const {center,shape}=body.body;
      const entry={army:body.army,body:body.body,sea:body.sea,generation:this.generation,left:formationCell(center.x-shape.extentX),right:formationCell(center.x+shape.extentX),
        top:formationCell(center.z-shape.extentZ),bottom:formationCell(center.z+shape.extentZ)};
      this.byArmy.set(body.army,entry);
      this.insert(entry);
    }
    for(const entry of this.byArmy.values())if(entry.generation!==this.generation){this.remove(entry);this.byArmy.delete(entry.army);}
  }

  private insert(entry:IndexedBody):void {
    const {cells,large}=entry.sea?this.water:this.land;
    if(!useGrid(entry)){large.add(entry);return;}
    for(let x=entry.left;x<=entry.right;x++)for(let z=entry.top;z<=entry.bottom;z++){
      const key=formationKey(x,z),bucket=cells.get(key);
      if(bucket)bucket.add(entry);else cells.set(key,new Set([entry]));
    }
  }

  replace(entry:IndexedBody,body:Footprint,sea=entry.sea):void {
    const bounds=gridBounds(body.center,body.shape.extentX,body.shape.extentZ);
    entry.body=body;
    if(sea===entry.sea&&bounds.left===entry.left&&bounds.right===entry.right&&bounds.top===entry.top&&bounds.bottom===entry.bottom)return;
    this.remove(entry);
    Object.assign(entry,bounds,{sea});
    this.insert(entry);
  }
  private remove(entry:IndexedBody){
    const {cells,large}=entry.sea?this.water:this.land;
    if(!large.delete(entry))for(let x=entry.left;x<=entry.right;x++)for(let z=entry.top;z<=entry.bottom;z++){
      const key=formationKey(x,z),bucket=cells.get(key)!;
      bucket.delete(entry);if(!bucket.size)cells.delete(key);
    }
  }

  blocked(center:Vec2,shape:FootprintShape,exclude:IndexedBody|undefined,sea=false):boolean {
    // Queued formations often try the same occupied space for many ticks.
    // A remembered blocker is only a hint: test its current pose and medium.
    const last=exclude?.lastBlocker;
    if(last&&last.generation===this.generation&&last.sea===sea&&bodyOverlaps(center,shape,last))return true;
    const {cells,large}=sea?this.water:this.land;
    const bounds=gridBounds(center,shape.extentX,shape.extentZ),{left,right,top,bottom}=bounds;
    if(!useGrid(bounds)){
      for(const entry of this.byArmy.values())if(entry!==exclude&&entry.sea===sea&&bodyOverlaps(center,shape,entry))return true;
      return false;
    }
    for(const entry of large)if(entry!==exclude&&bodyOverlaps(center,shape,entry))return true;
    for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){
      const bucket=cells.get(formationKey(x,z));
      if(!bucket)continue;
      // Each pair is tested only in the first cell shared by its two bounds.
      for(const entry of bucket)if(entry!==exclude&&entry!==last&&x===Math.max(left,entry.left)&&z===Math.max(top,entry.top)&&bodyOverlaps(center,shape,entry)){
        if(exclude)exclude.lastBlocker=entry;
        return true;
      }
    }
    return false;
  }

  /** Older campaigns can contain ships embarked at exactly the same point. Let
   * one leave an existing overlap, without moving closer or creating another. */
  separatesShip(entry:IndexedBody,point:Vec2,shape:FootprintShape):boolean {
    let separating=false;
    const from=entry.body.center;
    const check=(other:IndexedBody)=>{
      if(other===entry)return true;
      if(!bodyOverlaps(point,shape,other))return true;
      if(!bodyOverlaps(from,entry.body.shape,other)||other.army.id<entry.army.id)return false;
      const center=other.body.center;
      if(distance(point,center)<=distance(from,center)+CONTACT_EPSILON)return false;
      separating=true;return true;
    };
    const b=gridBounds(point,shape.extentX,shape.extentZ);
    for(const other of this.water.large)if(!check(other))return false;
    for(let x=b.left;x<=b.right;x++)for(let z=b.top;z<=b.bottom;z++){
      const entries=this.water.cells.get(formationKey(x,z));if(entries)for(const other of entries)if(!check(other))return false;
    }
    return separating;
  }
  /** Earlier positions and post-combat formations can already overlap. Movement
   * may reduce each existing penetration but can never introduce another. */
  clearanceFromOverlap(entry:IndexedBody,shape:FootprintShape){
    const from=entry.body.center,obstacles=this.landObstacles(from,shape.radius+4,entry);
    const contacts=new Map<Footprint,number>();
    for(const body of obstacles.values())if(overlaps(from,shape,body))contacts.set(body,overlapDepth(from,shape,body));
    if(!contacts.size)return;
    return (point:Vec2)=>{
      for(const body of obstacles.values()){
        if(!overlaps(point,shape,body))continue;
        const initial=contacts.get(body);
        if(initial===undefined||overlapDepth(point,shape,body)>=initial-CONTACT_EPSILON)return false;
      }
      return true;
    };
  }
  /** Cache hits and bucket insertion order must not decide which neighbor yields on replay. */
  requestPass(waiter:IndexedBody,next:Vec2,shape:FootprintShape,tick:number,members:Map<number,Unit[]>) {
    const army=waiter.army,since=army.formation!.blockedSince!;
    let other:IndexedBody|undefined;
    const consider=(entry:IndexedBody)=>{
      if(entry===waiter||entry.army.owner!==army.owner||entry.sea||other&&entry.army.id>=other.army.id)return;
      const f=entry.army.formation!,priority=f.blockedSince??tick;
      if(f.phase==='march'&&!f.yieldPoint&&(since<priority||since===priority&&army.id<entry.army.id)&&overlaps(next,shape,entry.body))other=entry;
    };
    const bounds=gridBounds(next,shape.extentX,shape.extentZ);
    if(!useGrid(bounds)){for(const entry of this.byArmy.values())consider(entry);}
    else{
      for(const entry of this.land.large)consider(entry);
      for(let x=bounds.left;x<=bounds.right;x++)for(let z=bounds.top;z<=bounds.bottom;z++){
        const bucket=this.land.cells.get(formationKey(x,z));if(bucket)for(const entry of bucket)consider(entry);
      }
    }
    if(other){
      const point=yieldAside(other,this,next,shape,members.get(other.army.id)!);
      if(point){other.army.formation!.yieldPoint=point;delete other.army.formation!.detour;}
    }
  }
  landObstacles(center:Vec2,reach:number,exclude:IndexedBody|undefined):Map<number,Footprint> {
    const bounds=gridBounds(center,reach,reach),{left,right,top,bottom}=bounds;
    const result=new Map<number,Footprint>();
    const add=(entry:IndexedBody)=>{
      if(entry===exclude||entry.sea)return;
      const body=entry.body;
      if(Math.abs(center.x-body.center.x)<=reach+body.shape.extentX&&Math.abs(center.z-body.center.z)<=reach+body.shape.extentZ)result.set(entry.army.id,body);
    };
    if(!useGrid(bounds))for(const entry of this.byArmy.values())add(entry);
    else {
      for(const entry of this.land.large)add(entry);
      for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){
        const bucket=this.land.cells.get(formationKey(x,z));
        if(bucket)for(const entry of bucket)add(entry);
      }
    }
    return result;
  }
}
/** Keep the blocker's heading and sweep its footprint sideways until the waiting lane is clear. */
function yieldAside(entry:IndexedBody,occupancy:FormationOccupancy,lane:Vec2,laneShape:FootprintShape,units:Unit[]):Vec2|undefined {
  const {center,shape}=entry.body;
  let radius=0;for(const unit of units)radius=Math.max(radius,UNIT_RADIUS[unit.kind]);
  const side=Math.sin(angleTo(lane,center)-laneShape.heading)>=0?1:-1;
  for(const turn of [side*Math.PI/2,-side*Math.PI/2,Math.PI,side*Math.PI/4,-side*Math.PI/4]){
    const heading=laneShape.heading+turn;
    for(let i=1;i<=16;i++){
      const p=offset(center,heading,i*.18);
      if(occupancy.blocked(p,shape,entry)||!legalFootprint(p,shape,radius))break;
      if(i>=7&&!overlaps(lane,laneShape,{center:p,shape}))return p;
    }
  }
}
const occupancyByState=new WeakMap<GameState,FormationOccupancy>();

interface DetourFailure {
  from:Vec2; goal:Vec2; heading:number; columns:number; count:number; radius:number; obstacles:Map<number,Footprint>;
}
const failedDetours=new WeakMap<ArmyFormation,DetourFailure>();

interface MarchChecks {
  from:Vec2; next:Vec2; heading:number; count:number; radius:number;
  shapes:FootprintShape[];
  fromLand:(boolean|undefined)[]; nextLand:(boolean|undefined)[];
}
const blockedMarchChecks=new WeakMap<ArmyFormation,MarchChecks>();
/** Rigid formations can be wider than a navigation triangle near a tidal inlet.
 * Choose a reachable shore and reconnect to the same continuous water leg. */
function alternateBerth(f:ArmyFormation,field:Unit[],radius:number,occupied:(p:Vec2,shape:FootprintShape,sea?:boolean)=>boolean,navigation:TerrainNavigator,target:Vec2,land:number,sea:number){
  const {points,index}=f.route,from=f.position;
  let water=index;while(water<points.length&&!points[water].sea&&distance(from,points[water])<20)water++;
  if(!points[water]?.sea||water===0||distance(from,points[water-1])>=20)return;
  const joins:{point:Vec2;after:number}[]=[];
  for(let i=water;i<points.length&&points[i].sea;i++){
    const a=points[i-1],b=points[i];
    if(distance(from,a)>36)break;
    const length=distance(a,b);
    if(length>8)joins.push({point:toward(a,b,Math.min(20,length/2)),after:i});
    if(distance(from,b)<40)joins.push({point:b,after:i+1});
  }
  joins.reverse();
  const ship=footprintShape(f.heading,1,1,SHIP_RADIUS);
  let fallback:{shore:Vec2;water:Vec2}|undefined;
  for(const shore of nearbyShorePoints(from,14)){
    if(!terrainSegment(from,shore,false)||occupied(shore,ship,true))continue;
    const heading=angleTo(from,shore),staging=toward(shore,from,Math.min(1.7,distance(from,shore)));
    const shape=footprintShape(heading,Math.min(f.columns,field.length),field.length,radius);
    if(!field.some(u=>distance(u,shore)<=2.3&&terrainSegment(u,shore,false))&&(!legalFootprint(staging,shape,radius)||occupied(staging,shape)))continue;
    if(!fallback)for(const turn of [0,.65,-.65,1.3,-1.3]){
      const point=offset(shore,heading+turn,.35);
      if(terrainAt(point,true)<0&&terrainSegment(shore,point,true)){fallback={shore,water:point};break;}
    }
    for(const join of joins){
      if(distance(shore,join.point)<.05||!terrainSegment(shore,join.point,true))continue;
      return {revision:f.route.revision,index:1,points:[{...from,sea:false},{...shore,sea:false},{...join.point,sea:true},...points.slice(join.after)]};
    }
  }
  if(fallback){
    const {shore,water}=fallback,tail=navigation.plan(water,target,land,sea,true,EMBARK_COST);
    if(tail)return {revision:tail.revision,index:1,points:[{...from,sea:false},{...shore,sea:false},...tail.points]};
  }
}

/** Try a short checked water leg around a queue or a headland before rejoining the flow. */
function seaBypass(f:ArmyFormation,goal:Vec2,target:Vec2,land:number,sea:number,navigation:TerrainNavigator,blocked:(p:Vec2,shape:FootprintShape,onWater:boolean)=>boolean){
  const heading=angleTo(f.position,goal);
  for(const length of [4,1.8])for(let i=0;i<16;i++){
    const turn=(i%2?-1:1)*Math.ceil(i/2)*Math.PI/8,angle=heading+turn,point=offset(f.position,angle,length);
    if(!waterFootprint(point)||!terrainSegment(f.position,point,true))continue;
    const shape=footprintShape(angle,1,1,SHIP_RADIUS);
    let free=true;
    for(let d=Math.min(sea*DT,.25);d<length+.25;d+=.25){
      if(blocked(offset(f.position,angle,Math.min(d,length)),shape,true)){free=false;break;}
    }
    if(!free)continue;
    const tail=navigation.plan(point,target,land,sea,true,EMBARK_COST);
    if(tail)return {...tail,points:[{...f.position,sea:true},...tail.points]};
  }
}
interface SeaChecks {
  from:Vec2;previous:Vec2;goal:Vec2;speed:number;heading:number;
  shape:FootprintShape;points:Vec2[];legal:(boolean|undefined)[];
}
const blockedSeaChecks=new WeakMap<ArmyFormation,SeaChecks>();
function seaStep(formation:ArmyFormation,goal:Vec2,speed:number,blocked:(center:Vec2,shape:FootprintShape,water:boolean)=>boolean){
  const from=formation.position,previous=formation.route.points[formation.route.index-1];
  let checks=blockedSeaChecks.get(formation);
  if(!checks||checks.from!==from||checks.goal!==goal||checks.previous!==previous||checks.speed!==speed){
    const heading=angleTo(from,goal),step=speed*DT;
    checks={from,previous,goal,speed,heading,shape:footprintShape(heading,1,1,SHIP_RADIUS),
      points:[toward(from,goal,step),offset(from,heading,step*.5,step*.8),offset(from,heading,step*.5,-step*.8)],legal:[]};
  }
  for(let i=0;i<checks.points.length;i++){
    const point=checks.points[i];
    if(checks.legal[i]===false||blocked(point,checks.shape,true))continue;
    if(checks.legal[i]??=(terrainSegment(from,point,true)&&terrainSegment(point,checks.points[0],true)&&withinSeaCorridor(formation.route,point))){
      blockedSeaChecks.delete(formation);return {point,heading:checks.heading,shape:checks.shape};
    }
  }
  blockedSeaChecks.set(formation,checks);
}
function samePoint(a:Vec2,b:Vec2):boolean{return a.x===b.x&&a.z===b.z;}

function sameObstacles(previous:Map<number,Footprint>,current:Map<number,Footprint>):boolean {
  if(previous.size!==current.size)return false;
  for(const [id,body] of current){
    const earlier=previous.get(id);
    if(!earlier||earlier.center.x!==body.center.x||earlier.center.z!==body.center.z||earlier.shape.heading!==body.shape.heading||earlier.shape.length!==body.shape.length||earlier.shape.width!==body.shape.width)return false;
  }
  return true;
}

/** A failed search may be reused only when its exact pose and all potential
 * obstacles across the swept search area are unchanged. */
function findDetour(formation:ArmyFormation,goal:Vec2,heading:number,columns:number,count:number,radius:number,shapeAt:(width:number)=>FootprintShape,
  occupancy:FormationOccupancy,own:IndexedBody|undefined):{path:Vec2[];width:number}|undefined {
  const from=formation.position;
  const reach=DETOUR_REACH+Math.abs(shapeAt(1).length)+Math.abs(shapeAt(columns).width)+CONTACT_EPSILON;
  const obstacles=occupancy.landObstacles(from,reach,own),prior=failedDetours.get(formation);
  if(prior&&prior.from.x===from.x&&prior.from.z===from.z&&prior.goal.x===goal.x&&prior.goal.z===goal.z&&prior.heading===heading&&prior.columns===columns&&prior.count===count&&prior.radius===radius&&sameObstacles(prior.obstacles,obstacles))return;
  // Gather once, then test the same ordered formation pose at each sample.
  for(let width=columns;width>=1;width--){
    const shape=shapeAt(width);
    const clear=(position:Vec2)=>{
      for(const body of obstacles.values())if(overlaps(position,shape,body))return false;
      return legalFootprint(position,shape,radius);
    };
    if(!clear(from))continue;
    const path=localDetour(from,goal,clear);
    if(path?.length){failedDetours.delete(formation);return {path,width};}
  }
  failedDetours.set(formation,{from,goal,heading,columns,count,radius,obstacles});
}

function cell(x:number,z:number):number{return (Math.floor(x/CELL)+32768)*65536+Math.floor(z/CELL)+32768;}
function neighborIndex(state:GameState){
  const cells=new Map<number,{owner:number|null;units:Unit[]}>();
  for(const u of state.units){
    if(u.transport?.embarked)continue;
    const key=cell(u.x,u.z),list=cells.get(key);
    if(list){list.units.push(u);if(list.owner!==u.owner)list.owner=null;}
    else cells.set(key,{owner:u.owner,units:[u]});
  }
  const nearby:Unit[]=[];
  return (p:Vec2,r:number,owner:number)=>{
    nearby.length=0;
    for(let x=Math.floor((p.x-r)/CELL);x<=Math.floor((p.x+r)/CELL);x++)for(let z=Math.floor((p.z-r)/CELL);z<=Math.floor((p.z+r)/CELL);z++){
      const list=cells.get((x+32768)*65536+z+32768);
      if(list&&list.owner!==owner)for(const unit of list.units)if(unit.owner!==owner&&!unit.transport?.embarked)nearby.push(unit);
    }
    return nearby;
  };
}

export function updateFormations(state:GameState,navigation:TerrainNavigator,interval:number,statsFor:StatsFor,halt:(u:Unit)=>void,dirty:(u:Unit)=>void):void {
  if(!state.armies.some(a=>a.formation))return;
  const members=armyMembers(state),nearby=neighborIndex(state);
  // Service the oldest eligible waits within this tick's group. Iteration order
  // alone starves newer IDs once a group contains more than 40 blocked armies.
  const eligible:Army[]=[];
  for(const army of state.armies){
    if((state.tick+army.id)%24!==0)continue;
    const f=army.formation;
    if(!f||f.blockedSince===undefined||state.tick-f.blockedSince<24||state.tick-(f.replannedAt??-1000)<480)continue;
    if(f.phase==='march'||f.phase==='sea'&&f.route.points[f.route.index].sea)eligible.push(army);
  }
  const lastServed=(a:Army)=>a.formation!.replannedAt??a.formation!.blockedSince!;
  eligible.sort((a,b)=>lastServed(a)-lastServed(b)||a.id-b.id);
  const canReplan=(army:Army)=>army===eligible[0]||army===eligible[1];
  let occupancy=occupancyByState.get(state);
  if(!occupancy){occupancy=new FormationOccupancy();occupancyByState.set(state,occupancy);}
  occupancy.sync(activeFootprints(state,members));
  for(const army of state.armies){
    const f=army.formation,units=members.get(army.id)!;
    if(!f||!units.length)continue;
    const source=state.provinces[f.from];
    const queue=source.march?.army===army.id?source.march:undefined;
    let field=units.some(u=>u.armyStatus==='queued')?units.filter(u=>u.armyStatus!=='queued'):units;
    if(queue&&source.owner!==army.owner){
      for(const u of units)if(u.armyStatus==='queued')halt(u);
      delete source.march;
    }
    const available=source.owner===army.owner?units:field;
    if(!available.length)continue;
    const {radius,land,sea}=profile(state,available,army.to,statsFor),spacing=radius*2+SPACE;
    const target=MAP[army.to].center,goal=f.route.points[f.route.index];
    let columns=Math.min(f.columns,available.length);
    const ownBody=occupancy.byArmy.get(army);
    const blocked=(center:Vec2,shape:FootprintShape,onWater=false)=>occupancy.blocked(center,shape,ownBody,onWater);
    const reserveReplan=()=>{
      if(!canReplan(army))return false;
      f.replannedAt=state.tick;return true;
    };
    const foes=f.phase==='sea'?[]:nearby(f.position,12+available.length*radius,army.owner);
    const enemyFor=(u:Unit,contact:boolean)=>{
      let result:Unit|undefined,best=Infinity;
      const range=contact?statsFor(u.owner,u.kind).range:0;
      for(const enemy of foes){
        const dx=u.x-enemy.x,dz=u.z-enemy.z;
        // Outside the contact square the original radial test cannot succeed.
        if(contact){const reach=Math.max(range,statsFor(enemy.owner,enemy.kind).range)+.25;
          if(Math.abs(dx)<reach&&Math.abs(dz)<reach&&Math.hypot(dx,dz)<reach)return enemy;
          continue;
        }
        if(Math.abs(dx)>best||Math.abs(dz)>best)continue;
        const d=Math.hypot(dx,dz);
        if(d<best||(d===best&&enemy.id<(result?.id??Infinity))){best=d;result=enemy;}
      }
      return result;
    };
    if(queue&&source.march===queue&&(source.lastMarchTick===undefined||state.tick-source.lastMarchTick>=interval)){
      const pending=available.filter(u=>u.armyStatus==='queued');
      const next=pending.shift();
      if(next){
        const position=slot(f.position,f.heading,columns,available.length,spacing,available.indexOf(next));
        const anchor=MAP[f.from].center,heading=angleTo(anchor,position),r=UNIT_RADIUS[next.kind];
        let p=position;
        for(const point of around(anchor,heading,1,3))if(legalLand(point,r)&&terrainLocalSegment(point,position)&&buildingSegment(point,position,r)){p=point;break;}
        if(legalLand(p,UNIT_RADIUS[next.kind])){
          standing(next,army,p,f.phase==='battle'?'field':'formed');
          setAssaultDestination(state,next,army.to);
          dirty(next);source.lastMarchTick=state.tick;field=[...field,next].sort((a,b)=>a.id-b.id);
          if(pending.length)source.march={...queue,pendingIds:pending.map(u=>u.id)};else delete source.march;
        }
      }else delete source.march;
    }

    const contact=foes.length>0&&field.some(u=>enemyFor(u,true));
    f.engaged=contact;
    if(contact){
      delete f.yieldPoint;delete f.blockedSince;
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
        const speed=statsFor(u.owner,u.kind).speed*DT;
        if(distance(u,p)>1e-7){
          const next=walkMember(u,p,r,speed,true);
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
        const site=findLanding(f,goal,heading,field.length,radius,blocked);
        if(site){
          const landing=site.point;columns=site.columns;
          f.position=landing;f.heading=heading;f.columns=columns;f.phase='march';
          if(ownBody)occupancy.replace(ownBody,{center:landing,shape:site.shape},false);
          field.forEach((u,i)=>{standing(u,army,slot(landing,heading,columns,field.length,spacing,i),'formed');dirty(u);});
        }else if(landingSearches.get(f)?.sites.length===0&&f.route.index===f.route.points.length-1&&distance(f.position,target)<=ARRIVAL_RADIUS&&terrainSegment(f.position,target,false)&&!blocked(f.position,footprintShape(heading,1,1,radius))){
          // Tiny islands can fit the destination town and its garrison, but no marching rectangle.
          // Use the ordinary town entrance, whose individual occupants are resolved below.
          f.phase='enter';f.heading=heading;delete f.blockedSince;
          for(const u of field){standing(u,army,f.position,'field');dirty(u);}
        }else continue;
      }else{
        const advance=seaStep(f,goal,sea,(p,shape)=>blocked(p,shape,true)&&!(ownBody&&occupancy.separatesShip(ownBody,p,shape)));
        if(!advance){
          f.blockedSince??=state.tick;
          if(reserveReplan()){
            const route=seaBypass(f,goal,target,land,sea,navigation,blocked)??navigation.plan(f.position,target,land,sea,true,EMBARK_COST);
            if(route){f.route=route;for(const u of field){standing(u,army,f.position,'sea');dirty(u);}}
          }
          continue;
        }
        delete f.blockedSince;
        const {point:p,heading,shape}=advance;
        f.heading=heading;f.position=p;
        if(distance(p,goal)<1e-8&&f.route.index<f.route.points.length-1)f.route.index++;
        if(ownBody)occupancy.replace(ownBody,{center:p,shape});
        for(const u of field){standing(u,army,p,'sea');dirty(u);}
        continue;
      }
    }

    if(f.phase==='march'){
      const embark=f.route.points[f.route.index+1]?.sea&&field.some(u=>distance(u,goal)<=2.3&&terrainSegment(u,goal,false));
      if(goal.sea||embark){
        const shore=goal.sea?f.position:goal,ship=footprintShape(f.heading,1,1,SHIP_RADIUS);
        if(blocked(shore,ship,true)){
          f.blockedSince??=state.tick;
          if(reserveReplan()){
            const route=alternateBerth(f,field,radius,blocked,navigation,target,land,sea);
            if(route){f.route=route;delete f.detour;delete f.yieldPoint;}
          }
          continue;
        }
        if(!goal.sea){f.route.index++;f.position={x:goal.x,z:goal.z};}
        f.phase='sea';delete f.blockedSince;delete f.yieldPoint;delete f.detour;
        if(ownBody)occupancy.replace(ownBody,footprint(f.position,f.heading,1,1,SHIP_RADIUS),true);
        for(const u of field){standing(u,army,f.position,'sea');dirty(u);}
        continue;
      }
      const final=f.route.index===f.route.points.length-1;
      if(final&&distance(f.position,target)<=Math.max(ARRIVAL_RADIUS+radius,2.3+Math.floor((field.length-1)/columns)*spacing/2)){
        f.phase='enter';delete f.yieldPoint;delete f.blockedSince;for(const u of field){u.armyStatus='field';dirty(u);}
      }else{
        // Spread recovery across simulation ticks. All decisions use saved state and stable army IDs.
        const waited=state.tick-(f.blockedSince??state.tick);
        if(reserveReplan()){
          const route=alternateBerth(f,field,radius,blocked,navigation,target,land,sea)??navigation.plan(f.position,target,land,sea,false,EMBARK_COST);
          if(route){f.route=route;delete f.detour;delete f.retryAt;continue;}
        }
        const heading=angleTo(f.position,goal),step=land*DT;
        const turn=Math.atan2(Math.sin(heading-f.heading),Math.cos(heading-f.heading));
        // A packed column can translate before there is room to turn.
        const nextHeading=f.yieldPoint||waited>=12?f.heading:f.heading+Math.max(-.13,Math.min(.13,turn));
        const next=toward(f.position,f.yieldPoint??f.detour?.[0]??goal,step);
        const previous=blockedMarchChecks.get(f);
        let checks=previous&&previous.from===f.position&&previous.heading===nextHeading&&previous.count===field.length&&previous.radius===radius?previous:undefined;
        const shapes:FootprintShape[]=checks?.shapes??[];
        const shapeAt=(width:number)=>shapes[width]??=footprintShape(nextHeading,width,field.length,radius);
        if(checks&&!samePoint(checks.next,next)){checks.next=next;checks.nextLand.length=0;}
        let exitOverlap:((p:Vec2)=>boolean)|undefined;
        const clear=(p:Vec2,c:number)=>{
          const shape=shapeAt(c);
          const cache=checks&&(p===next?checks.nextLand:p===f.position?checks.fromLand:undefined);
          const known=cache?.[c];
          if(known===false)return false;
          if(ownBody&&(c!==f.columns||nextHeading!==f.heading)&&blocked(f.position,shape))return false;
          if(blocked(p,shape)){
            if(!ownBody||!f.yieldPoint||c!==f.columns||nextHeading!==f.heading)return false;
            exitOverlap??=occupancy.clearanceFromOverlap(ownBody,shape);
            if(!exitOverlap?.(p))return false;
          }
          if(known===true)return true;
          const legal=legalFootprint(p,shape,radius);
          if(cache)cache[c]=legal;
          return legal;
        };
        let destination=next,open=clear(next,columns);
        if(!open){
          if(!checks)checks={from:f.position,next,heading:nextHeading,count:field.length,radius,shapes,fromLand:[],nextLand:[]};
          blockedMarchChecks.set(f,checks);
          const previousColumns=columns;
          while(!open&&columns>1)open=clear(destination,--columns);
          if(!open){
            f.blockedSince??=state.tick;
            if((f.retryAt??0)<=state.tick){
              delete f.yieldPoint;delete f.detour;
              if(waited>=12&&ownBody){
                const shape=shapeAt(previousColumns);
                occupancy.requestPass(ownBody,next,shape,state.tick,members);
                if(nextHeading===f.heading&&blocked(f.position,shape)){
                  exitOverlap=occupancy.clearanceFromOverlap(ownBody,shape);
                  for(let i=0;exitOverlap&&i<16;i++){
                    const angle=f.heading+(i%2?-1:1)*Math.ceil(i/2)*Math.PI/8;
                    const first=offset(f.position,angle,step),end=offset(f.position,angle,1.5);
                    if(exitOverlap(first)&&legalFootprint(first,shape,radius)&&legalFootprint(end,shape,radius)){
                      f.yieldPoint=end;columns=previousColumns;break;
                    }
                  }
                }
              }
              if(!f.yieldPoint){
                const detour=findDetour(f,goal,nextHeading,previousColumns,field.length,radius,shapeAt,occupancy,ownBody);
                if(detour){f.detour=detour.path;columns=detour.width;}
              }
              f.retryAt=state.tick+12;
            }
            const bypass=f.yieldPoint??f.detour?.[0];
            destination=bypass?toward(f.position,bypass,step):f.position;
            open=destination!==f.position&&clear(destination,columns);
            if(!open&&columns!==previousColumns){columns=previousColumns;open=destination!==f.position&&clear(destination,columns);}
          }
        }else if(!f.yieldPoint&&!f.detour?.length&&columns<square(field.length)&&clear(destination,columns+1)&&clear(offset(destination,heading,2),columns+1))columns++;
        if(!open)continue;
        blockedMarchChecks.delete(f);
        const speed=columns===f.columns?land*DT*1.2:land*DT;
        let caughtUp=true;
        for(let i=0;i<field.length;i++){
          const u=field[i],radius=UNIT_RADIUS[u.kind],desired=slot(destination,nextHeading,columns,field.length,spacing,i);
          const moved=walkMember(u,desired,radius,speed,true);
          if(caughtUp&&distance(moved,desired)>.14)caughtUp=false;
          standing(u,army,moved,'formed');dirty(u);
        }
        f.heading=Math.atan2(Math.sin(nextHeading),Math.cos(nextHeading));f.columns=columns;
        if(caughtUp){
          if(!f.yieldPoint&&distance(destination,goal)<distance(f.position,goal))delete f.blockedSince;
          if(f.yieldPoint&&samePoint(f.yieldPoint,destination))delete f.yieldPoint;
          f.position=destination;
          if(f.detour?.length&&distance(destination,f.detour[0])<1e-8){f.detour=f.detour.slice(1);if(!f.detour.length)delete f.detour;}
          if(distance(destination,goal)<1e-8&&!final){f.route.index++;delete f.detour;}
        }
        if(!caughtUp)f.blockedSince??=state.tick;
        if(ownBody)occupancy.replace(ownBody,{center:f.position,shape:f.heading===nextHeading?shapeAt(columns):footprintShape(f.heading,columns,field.length,radius)});
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
        const {range,speed}=statsFor(u.owner,u.kind);
        if(enemy&&distance(u,enemy)<range)continue;
        const objective=enemy?offset(enemy,angleTo(u,enemy),-range*.75,(index%3-1)*.45):f.phase==='enter'?target:goal;
        const p=walkMember(u,objective,UNIT_RADIUS[u.kind],speed*DT,false,enemy||f.phase==='battle'?-1:army.to);
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
          const shape=footprintShape(heading,width,field.length,radius);
          const clear=(p:Vec2)=>legalFootprint(p,shape,radius)&&!blocked(p,shape)&&terrainLocalSegment(f.position,p);
          let position:Vec2|undefined;
          if(clear(f.position))position=f.position;
          else for(const p of around(f.position,heading,.5,4))if(clear(p)){position=p;break;}
          if(!position)continue;
          const route=navigation.plan(position,MAP[next].center,land,sea,false,EMBARK_COST);
          if(!route)continue;
          delete f.redirect;delete f.readyAt;delete f.detour;delete f.retryAt;
          delete f.yieldPoint;delete f.blockedSince;delete f.replannedAt;
          army.to=next;f.route=route;f.position=position;f.heading=heading;f.phase='assemble';f.columns=width;
          for(const u of field){standing(u,army,u,'formed');setAssaultDestination(state,u,next);dirty(u);}
        }
      }
    }
  }
}
