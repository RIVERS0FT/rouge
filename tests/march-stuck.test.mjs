import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode,pointInProvince} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {buildingSegment,buildingStep} from '../src/game/buildings.ts';
import {UNIT_RADIUS} from '../src/game/collision.ts';
import {TERRAIN_REVISION,terrainLocalSegment,distanceToTravelSegment,travelCorridorPoint,TRAVEL_LOCAL_OFFSET} from '../src/game/terrain-navigation.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {updateUnitsFallback} from '../src/game/unitFallback.ts';

// Battalions that stood still forever in a v0.33.50 campaign, rebuilt alone.
function fixture(kind,regions,marchers){
 const state=createGame([{name:'A',leader:'warden',loadout:[kind]},{name:'B',leader:'steward',loadout:[kind]}],5);state.units=[];
 for(const p of state.provinces){p.owner=-1;p.production=0;}
 for(const code of regions)state.provinces[provinceByCode(code)].owner=0;
 // A distant second country keeps the campaign running.
 state.provinces[provinceByCode('USA-3521')].owner=1;state.grouping=reconcileGrouping(state);
 for(const m of marchers){
  const target=provinceByCode(m.target),province=provinceByCode(m.province);
  state.units.push({id:state.nextId++,owner:0,kind,x:m.x,z:m.z,hp:stats(state.players[0],kind).hp,province,origin:province,target,destination:target,route:[],cooldown:0,
   travel:{revision:TERRAIN_REVISION,index:1,points:m.points.map(([x,z])=>({x,z,sea:false}))},army:1});
 }
 state.armies=[{id:1,owner:0,to:provinceByCode(marchers[0].target),formed:0,size:marchers.length}];state.nextArmy=2;
 return state;
}
const goalDistance=u=>{const p=u.travel.points.at(-1);return Math.hypot(p.x-u.x,p.z-u.z);};
// Paraíba's town stands beside the Rio Grande do Norte border: a battalion walking straight at the
// center from the north is stopped by a house while still outside (the Constantine trap, v0.33.50).
const paraiba=provinceByCode('BRA-626'),center=MAP[paraiba].center,north={x:Math.cos(280*Math.PI/180),z:Math.sin(280*Math.PI/180)};
const along=d=>({x:center.x+north.x*d,z:center.z+north.z*d});
// Walking straight in, the first spot whose next infantry step (0.12) would enter a house.
let blocked=0;for(let d=2.6;d>.12&&!blocked;d-=.02)if(!buildingSegment(along(d),along(d-.12),UNIT_RADIUS.infantry))blocked=d;
// Ten whole steps out, so an infantry battalion marching in stops exactly there.
const start=along(blocked+1.2),approach={target:'BRA-626',province:'BRA-628',...start,points:[[start.x,start.z],[center.x,center.z]]};

test('a final-leg detour enters a region whose own house covers its center',()=>{
 const radius=UNIT_RADIUS.infantry,travel={revision:TERRAIN_REVISION,index:1,points:approach.points.map(([x,z])=>({x,z,sea:false}))};
 const legal=(a,b)=>terrainLocalSegment(a,b)&&distanceToTravelSegment(travel,b)<=TRAVEL_LOCAL_OFFSET&&terrainLocalSegment(b,travelCorridorPoint(travel,b));
 assert.equal(buildingSegment(center,center,radius),false,'the house footprint covers the center');
 const start=along(blocked);
 assert.ok(blocked&&!pointInProvince(paraiba,start.x,start.z),'blocked outside the region');
 // The center alone is unreachable; arrival nodes inside the region are not.
 assert.deepEqual(buildingStep(start,center,radius,.12,legal),start);
 let p=start,entered=false;
 for(let tick=0;tick<40&&!entered;tick++){const q=buildingStep(p,center,radius,.12,legal,paraiba);assert.ok(buildingSegment(p,q,radius));p=q;entered=pointInProvince(paraiba,p.x,p.z);}
 assert.ok(entered&&Math.hypot(p.x-center.x,p.z-center.z)<=2.3,JSON.stringify(p));
});

test('an army arrives from a neighbor whose border runs beside the target town, then dissolves',()=>{
 const state=fixture('infantry',['BRA-626','BRA-628'],[approach]);
 const e=new Engine(state),u=e.state.units[0];
 for(let tick=0;tick<120&&u.target!==null;tick++)e.step();
 assert.equal(u.target,null);assert.equal(u.province,paraiba);assert.ok(pointInProvince(paraiba,u.x,u.z));
 assert.equal(e.state.armies.length,0,'the army dissolves once its last battalion halts');
 // The JavaScript path makes the same arrival.
 const s=fixture('infantry',['BRA-626','BRA-628'],[approach]),v=s.units[0],statsFor=(o,k)=>stats(s.players[o],k);
 const halt=x=>{delete x.army;delete x.travel;x.target=null;x.destination=null;x.origin=x.province;};
 for(let tick=0;tick<120&&v.target!==null;tick++)updateUnitsFallback([v],statsFor,s,new Map(),halt);
 assert.equal(v.target,null);assert.equal(v.province,paraiba);
});

test('corridor steering past a town does not trade places with the house detour every tick',()=>{
 const state=fixture('horseArtillery',['KEN-1193','KEN-1197'],[{target:'KEN-1197',province:'KEN-1193',x:385.26246014842974,z:-8.739659618825595,points:[[385.44130921494303,-7.907532536324752],[363.60926365786383,-9.66999092610185]]}]);
 const e=new Engine(state),u=e.state.units[0],before=goalDistance(u),seen=new Set();
 for(let tick=0;tick<60;tick++){e.step();if(u.target===null)break;seen.add(`${u.x},${u.z}`);}
 assert.ok(u.target===null||before-goalDistance(u)>4,`stuck ${goalDistance(u)} from the goal`);
 assert.ok(seen.size>30,'no two-tick oscillation between the same two spots');
});

test('two battalions walking into each other on one detour chord keep right and pass',()=>{
 const state=fixture('artillery',['ARG-1271','ARG-1272','ARG-1275'],[
  {target:'ARG-1272',province:'ARG-1271',x:-702.3320043950009,z:536.8471323171168,points:[[-702.1809754966447,533.9836841298351],[-730.1840818117671,563.7110178802262]]},
  {target:'ARG-1275',province:'ARG-1271',x:-702.9472738358139,z:537.9237211500524,points:[[-703.899342918623,537.1845831571229],[-684.5891592968547,362.24451628417256]]}]);
 const e=new Engine(state),[a,b]=e.state.units,startA=goalDistance(a),startB=goalDistance(b);
 e.step(200);
 assert.ok(startA-goalDistance(a)>5&&startB-goalDistance(b)>5,`${goalDistance(a)} ${goalDistance(b)}`);
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>3,'the pair separated');
});
