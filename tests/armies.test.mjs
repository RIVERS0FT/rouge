import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine,MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {checksum,decodeSave,encodeSave,validateState} from '../src/game/save.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';
import {applyLocalFrame,encodeLocalFrame} from '../src/platform/localFrames.ts';
import {armyViews} from '../src/render/armyViews.ts';

/** Player 0 holds `from` and a neighbouring `second` region; `to` and `other` are empty targets. */
function fixture({first=4,second=3,targetOwner=-1}={}){
 const state=createGame([{name:'Armies',leader:'warden',loadout:['infantry']},{name:'Other',leader:'warden',loadout:['infantry']}],21,'army-qa');
 state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
 const from=provinceByCode('DEU-3487'),to=provinceByCode('DEU-1574');
 const near=MAP[from].neighbors.filter(id=>MAP[id].playable&&id!==to);
 const [secondRegion,other]=near;
 state.provinces[from].owner=0;state.provinces[secondRegion].owner=0;state.provinces[to].owner=targetOwner;
 state.provinces[provinceByCode('USA-3521')].owner=1;
 const add=(region,count)=>{for(let i=0;i<count;i++)state.units.push({id:state.nextId++,owner:0,kind:'infantry',...MAP[region].center,hp:stats(state.players[0],'infantry').hp,province:region,origin:region,target:null,destination:null,route:[],cooldown:0});};
 add(from,first);add(secondRegion,second);
 state.grouping=reconcileGrouping(state);
 return {e:new Engine(state),from,second:secondRegion,to,other};
}
const members=(e,id)=>e.state.units.filter(u=>u.army===id);
const marching=e=>e.state.units.some(u=>u.target!==null);
function until(e,done,limit=6000){for(let i=0;i<limit&&!done();i+=10)e.step(10);assert.ok(done(),'condition reached');}

test('one dispatch from several regions of a territory forms a single army, counting troops still waiting',()=>{
 const {e,from,second,to}=fixture();
 assert.deepEqual(e.command(0,{type:'muster',sources:[from,second],to,fraction:1}),{ok:true});
 assert.equal(e.state.armies.length,1);const army=e.state.armies[0];
 assert.deepEqual({id:army.id,owner:army.owner,to:army.to,size:army.size,formed:army.formed},{id:1,owner:0,to,size:7,formed:0});
 assert.equal(members(e,army.id).length,7);assert.equal(e.state.nextArmy,2);
 assert.equal(e.state.provinces[from].march.army,army.id);assert.equal(e.state.provinces[second].march.army,army.id);
 assert.ok(validateState(e.state));
 const views=armyViews(e.state);assert.equal(views.length,1);assert.equal(views[0].count,7);assert.equal(views[0].lead.target,to);
 // A repeated identical dispatch is a no-op; another fraction replaces only the waiting troops.
 assert.deepEqual(e.command(0,{type:'muster',sources:[from,second],to,fraction:1}),{ok:true});assert.equal(e.state.armies.length,1);
 assert.deepEqual(e.command(0,{type:'muster',sources:[],to,fraction:1}),{ok:false,error:'invalidCommand'});
 assert.deepEqual(e.command(0,{type:'muster',sources:[from,from],to,fraction:1}),{ok:false,error:'invalidCommand'});
 assert.deepEqual(e.command(1,{type:'muster',sources:[from],to,fraction:1}),{ok:false,error:'notOwner'});
});

test('troops leave their army as they halt in a friendly region; the army dissolves with the last arrival',()=>{
 const {e,from,to}=fixture({first:3,second:0,targetOwner:0});
 assert.deepEqual(e.command(0,{type:'march',from,to,fraction:1}),{ok:true});
 const id=e.state.armies[0].id;e.step(MARCH_INTERVAL_TICKS*3);
 assert.equal(members(e,id).length,3);
 until(e,()=>e.state.units.some(u=>u.target===null&&u.province===to));
 assert.ok(e.state.units.filter(u=>u.province===to&&u.target===null).every(u=>u.army===undefined),'arrivals join the garrison');
 until(e,()=>!marching(e));
 assert.deepEqual(e.state.armies,[]);assert.ok(e.state.units.every(u=>!Object.hasOwn(u,'army')));assert.ok(validateState(e.state));
});

test('armies of one country converging on the same target merge once their leads meet there',()=>{
 const {e,from,second,to,other}=fixture({first:3,second:3});
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 assert.ok(e.command(0,{type:'march',from:second,to,fraction:1}).ok);
 assert.deepEqual(e.state.armies.map(a=>[a.id,a.size]),[[1,3],[2,3]]);
 until(e,()=>e.state.armies.length===1);
 assert.deepEqual(e.state.armies.map(a=>[a.id,a.to,a.size]),[[1,to,6]]);
 assert.equal(members(e,1).length,6);assert.ok(e.state.units.every(u=>u.army!==2));
 assert.ok(e.state.units.some(u=>u.army===1&&u.province===to),'merged where the leads met');assert.ok(validateState(e.state));
 // A different destination never merges, even from the same source.
 const split=fixture({first:4,second:0});
 assert.ok(split.e.command(0,{type:'march',from:split.from,to:split.to,fraction:.5}).ok);
 split.e.step(MARCH_INTERVAL_TICKS*2);
 assert.ok(split.e.command(0,{type:'march',from:split.from,to:split.other,fraction:1}).ok);
 split.e.step(MARCH_INTERVAL_TICKS*4);
 assert.deepEqual(split.e.state.armies.map(a=>a.to).sort((a,b)=>a-b),[split.to,split.other].sort((a,b)=>a-b));
});

test('redirecting an army re-plans troops under way and the troops still waiting; troops at sea leave it',()=>{
 const {e,from,to,other}=fixture({first:5,second:0});
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);e.step(MARCH_INTERVAL_TICKS*2+1);
 const id=e.state.armies[0].id,departed=members(e,id).filter(u=>u.travel);assert.equal(departed.length,3);
 const atSea=departed[2];atSea.transport={from,to,index:1,embarked:true};
 assert.deepEqual(e.command(1,{type:'armyMarch',army:id,to:other}),{ok:false,error:'notOwner'});
 assert.deepEqual(e.command(0,{type:'armyMarch',army:id,to:-3}),{ok:false,error:'invalidCommand'});
 assert.deepEqual(e.command(0,{type:'armyMarch',army:99,to:other}),{ok:false,error:'notOwner'});
 assert.deepEqual(e.command(0,{type:'armyMarch',army:id,to:other}),{ok:true});
 assert.equal(e.state.armies[0].to,other);
 assert.ok(departed.slice(0,2).every(u=>u.target===other&&u.destination===other&&u.assault===other&&u.army===id));
 assert.equal(atSea.army,undefined);assert.equal(atSea.target,to);
 assert.equal(e.state.provinces[from].march.to,other);assert.equal(e.state.provinces[from].march.army,id);
 assert.deepEqual(e.command(0,{type:'armyMarch',army:id,to:other}),{ok:true},'same destination is a no-op');
});

test('armies round-trip through saves, LAN deltas and worker frames; older saves load with empty ledgers',()=>{
 const {e,from,second,to}=fixture();
 const initial=encodeFrame(e.state,undefined,0),client=applyFrame(null,JSON.parse(JSON.stringify(initial.frame)));
 const local=encodeLocalFrame(e.state),view=applyLocalFrame(null,local.frame);
 assert.ok(e.command(0,{type:'muster',sources:[from,second],to,fraction:1}).ok);e.step(MARCH_INTERVAL_TICKS);
 assert.deepEqual(decodeSave(encodeSave(e.state,'Armies')).state,e.state);
 assert.deepEqual(applyFrame(client,JSON.parse(JSON.stringify(encodeFrame(e.state,initial.base,0).frame))),e.state);
 assert.deepEqual(applyLocalFrame(view,encodeLocalFrame(e.state,local.base).frame),e.state);
 // Saves from before armies existed have no ledgers at all.
 const old=structuredClone(fixture().e.state);for(const key of ['armies','nextArmy','battles','nextBattle'])delete old[key];
 assert.equal(validateState(old),false);
 const body=JSON.stringify(old),loaded=decodeSave(JSON.stringify({version:1,name:'Old',savedAt:new Date().toISOString(),hash:checksum(body),body})).state;
 assert.deepEqual([loaded.armies,loaded.nextArmy,loaded.battles,loaded.nextBattle],[[],1,[],1]);
 // Corrupt memberships are rejected.
 const state=structuredClone(e.state),unit=state.units.find(u=>u.army!==undefined);
 unit.army=7;assert.equal(validateState(state),false);
 unit.army=1;state.armies[0].owner=1;assert.equal(validateState(state),false);
 state.armies[0].owner=0;state.provinces[from].march={...state.provinces[from].march,army:5};assert.equal(validateState(state),false);
});

test('AI countries form armies through the same orders, and every state stays valid',()=>{
 const state=createGame([{name:'Human',leader:'warden',loadout:['infantry']},{name:'AI 1',leader:'warden',loadout:['cavalry'],ai:true},{name:'AI 2',leader:'warden',loadout:['infantry'],ai:true}],5);
 const e=new Engine(state);let most=0;
 for(let i=0;i<60;i++){e.step(10);most=Math.max(most,e.state.armies.length);for(const army of e.state.armies)assert.ok(members(e,army.id).length>0);}
 assert.ok(most>0,'AI dispatches formed armies');assert.ok(validateState(e.state));
});
