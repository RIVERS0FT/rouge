import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UNIT_RADIUS} from '../src/game/collision.ts';
import {buildingSegment} from '../src/game/buildings.ts';
import {UNITS} from '../src/game/content.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,pointInProvince} from '../src/game/map.ts';
import {decodeSave,encodeSave,validateState} from '../src/game/save.ts';
import {terrainAt} from '../src/game/terrain-navigation.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';
const setups=[{name:'Player',leader:'warden',loadout:['artillery']},{name:'AI',leader:'steward',loadout:['infantry'],ai:true}];
const initial=createGame(setups,1234,'neutral-garrisons'),wire=frame=>JSON.parse(JSON.stringify(frame));

test('all playable neutral regions start with five real infantry and no off-map garrison',()=>{
 const byProvince=new Map();
 for(const unit of initial.units){
  const province=initial.provinces[unit.province],units=byProvince.get(unit.province)??[];
  units.push(unit);byProvince.set(unit.province,units);
  assert.equal(unit.owner,province.owner);
  assert.equal(unit.kind,province.owner<0?'infantry':setups[province.owner].loadout[0]);
  assert.equal(unit.target,null);assert.equal(unit.origin,province.id);
  assert.ok(pointInProvince(province.id,unit.x,unit.z)&&terrainAt(unit,true)>=0);
  assert.ok(buildingSegment(unit,unit,UNIT_RADIUS[unit.kind]));
 }
 for(const p of MAP)assert.equal((byProvince.get(p.id)??[]).length,p.playable?5:0,p.code);
 assert.ok(validateState(initial));
 assert.deepEqual(createGame(setups,1234,'neutral-garrisons'),initial);
});

test('remote guards stay dormant and do not replenish; wake before bombardment and prevent early capture',()=>{
 const e=new Engine(initial),s=e.state;
 const p=s.provinces.find(p=>p.owner<0&&MAP[p.id].playable&&MAP[p.id].bounds.right-MAP[p.id].bounds.left>20&&s.units.filter(u=>u.owner>=0).every(u=>Math.hypot(u.x-MAP[p.id].center.x,u.z-MAP[p.id].center.z)>100));
 const guard=s.units.find(u=>u.province===p.id);
 const before={...guard};
 e.step();
 assert.deepEqual(s.units.find(u=>u.id===guard.id),before);
 guard.hp=0;e.step();
 assert.equal(s.units.filter(u=>u.owner===-1&&u.province===p.id).length,4);
 assert.equal(p.production,0);
 const current=s.units.find(u=>u.owner===-1&&u.province===p.id);
 const standoff=UNITS.artillery.range-.15;
 const atRange=[[standoff,0],[-standoff,0],[0,standoff],[0,-standoff]].map(([x,z])=>({x:current.x+x,z:current.z+z})).find(v=>pointInProvince(p.id,v.x,v.z)&&terrainAt(v,true)>=0&&buildingSegment(v,v,UNIT_RADIUS.artillery));
 assert.ok(atRange);
 // The starting gun may have fired during the two earlier ticks. Teleport a
 // ready gun so this fixture isolates the newly approached guards' first shot.
 const attacker=s.units.find(u=>u.owner===0);Object.assign(attacker,{...atRange,province:p.id,origin:p.id,cooldown:0});
 const hp=s.units.filter(u=>u.owner===-1&&u.province===p.id).map(u=>u.hp).reduce((a,b)=>a+b);
 e.step();
 const defenders=s.units.filter(u=>u.owner===-1&&u.province===p.id);
 assert.ok(defenders.map(u=>u.hp).reduce((a,b)=>a+b)<hp,'first artillery attack reached neutral guards');
 assert.ok(attacker.cooldown>0&&defenders.every(u=>u.cooldown===0),'artillery can open fire before infantry reach');
 const center=MAP[p.id].center,near=defenders.find(u=>Math.hypot(u.x-center.x,u.z-center.z)<3.7);
 assert.ok(near);Object.assign(attacker,{x:near.x,z:near.z});
 e.step();assert.equal(p.capture,0);assert.ok(near.cooldown>0,'approached guard retaliates in the same tick');
 s.units=s.units.filter(u=>u.owner!==-1||u.province!==p.id);
 e.step(165);
 assert.equal(p.owner,0);
});

test('unmarked old neutral saves are unsupported and current saves preserve casualties',()=>{
 const legacy=structuredClone(initial);delete legacy.neutralGarrisonModel;
 legacy.units=legacy.units.filter(u=>u.owner>=0);
 assert.equal(validateState(legacy),false);assert.throws(()=>encodeSave(legacy,'old'),/invalidSave/);
 const game=structuredClone(initial);game.units=game.units.filter((u,i)=>i!==0);
 assert.deepEqual(decodeSave(encodeSave(game,'new')).state,game);
});

test('LAN sends one full garrison snapshot on reconnect, followed by sparse neutral updates and deaths',()=>{
 const s=structuredClone(initial);
 const first=encodeFrame(s,undefined,0),connected=applyFrame(null,wire(first.frame));
 const changed=s.units.find(u=>u.owner<0),dead=s.units.find(u=>u.owner<0&&u.id!==changed.id);
 changed.hp-=10;changed.cooldown=.9;s.units=s.units.filter(u=>u!==dead);s.tick++;
 const delta=encodeFrame(s,first.base,0);
 assert.equal(delta.frame.type,'delta');
 assert.deepEqual(delta.frame.neutral,{updated:[changed],removed:[dead.id]});
 assert.equal(delta.frame.state.units.length,10);
 assert.ok(JSON.stringify(delta.frame).length<JSON.stringify(first.frame).length/20);
 const latest=applyFrame(connected,wire(delta.frame));
 assert.deepEqual(latest,s);
 assert.ok(connected.units.find(u=>u.id===dead.id));assert.equal(connected.units.find(u=>u.id===changed.id).hp,100);
 assert.deepEqual(applyFrame(null,wire(encodeFrame(s,undefined,0).frame)),latest);
 const quiet=encodeFrame(s,delta.base,0);
 assert.deepEqual(quiet.frame.neutral,{updated:[],removed:[]});
 assert.deepEqual(applyFrame(latest,wire(quiet.frame)),latest);
});
