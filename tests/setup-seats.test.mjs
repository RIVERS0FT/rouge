import {connectTicket} from './helpers/lan-streams.mjs';
import test from 'node:test';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {Engine,createGame} from '../src/game/engine.ts';
import {makeAISetups,chooseSpawnRegions,getSpawnCapacity} from '../src/game/spawns.ts';
import {regionCapacity,regionProductionRate} from '../src/game/territoryEconomy.ts';
import {TerrainNavigator,validateTravel} from '../src/game/terrain-navigation.ts';
import {BOUNDS,MAP,pointInProvince} from '../src/game/map.ts';
import {Navigator,cellAt} from '../src/game/navigation.ts';
import {createLanServer} from '../server/lan.ts';
import {MAP_ID,RULES_ID} from '../src/game/content.ts';
import {encodeSave,decodeSave} from '../src/game/save.ts';
const setup={name:'Human',leader:'warden',loadout:['infantry']};
test('seeded starts are dispersed, non-overlapping, equally resourced and land-connected with expansion exits',()=>{
 const starts=[];
 for(const seed of [0,42,1234]){
  const setups=[setup,...makeAISetups(3,seed)],s=createGame(setups,seed),again=createGame(setups,seed),regions=chooseSpawnRegions(seed,4),nav=new TerrainNavigator();
  assert.deepEqual(s,again);assert.equal(new Set(regions).size,4);starts.push(regions[0]);
  for(const [actor,id]of regions.entries()){
   assert.deepEqual(s.provinces.filter(p=>p.owner===actor).map(p=>p.id),[id]);
   assert.equal(regionCapacity(id),12);assert.equal(regionProductionRate(id),1);
   const units=s.units.filter(u=>u.owner===actor);
   assert.equal(units.length,5);assert.equal(s.players[actor].funds,184);
   assert.ok(units.every(u=>u.province===id&&pointInProvince(id,u.x,u.z)));
   assert.ok(MAP[id].neighbors.some(n=>[[id,n],[n,id]].every(([from,to])=>{
    const start=MAP[from].center,end=MAP[to].center,flow=nav.plan(start,end);
    return flow&&validateTravel(flow,start,end)&&flow.points.every(p=>!p.sea);
   })));
  }
  const width=BOUNDS.right-BOUNDS.left;
  for(const [i,a]of regions.entries())for(const b of regions.slice(i+1)){
   const dx=Math.abs(MAP[a].center.x-MAP[b].center.x);
   assert.ok(Math.hypot(Math.min(dx,width-dx),MAP[a].center.z-MAP[b].center.z)>100);
  }
  assert.deepEqual(decodeSave(encodeSave(s,'Spawn preserved')).state,s);
 }
 assert.equal(new Set(starts).size,3);
});
test('human/AI labels and flags do not influence allocation; solo counts use available map resources beyond four players',()=>{
 for(const aiCount of [1,2,3,7,15]){
  const s=createGame([setup,...makeAISetups(aiCount)],42);assert.equal(s.players.length,aiCount+1);assert.equal(s.players.filter(p=>p.ai).length,aiCount);
  const allHuman=createGame(s.players.map(p=>({name:p.name,leader:p.leader,loadout:p.loadout,ai:false,flag:{type:'custom',pattern:'vertical',colors:['#123456','#abcdef','#ffffff']}})),42);
  assert.deepEqual(s.provinces.map(p=>p.owner),allHuman.provinces.map(p=>p.owner));
 }
 for(const n of [-1,getSpawnCapacity(),1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER])assert.throws(()=>makeAISetups(n),/invalidAI/);
 assert.throws(()=>createGame([setup]),/invalidSetup/);assert.deepEqual(makeAISetups(0),[]);
});
async function withServer(run){
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${host.server.address().port}/api`;
 const request=async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(r.status===201&&data.token)await connectTicket(base,data);return{status:r.status,data};};
 try{await run(host,request,base);}finally{await host.close();}
}
test('real HTTP lobby: two online humans unlock start; host owns AI configuration beyond four factions',async()=>withServer(async(host,req)=>{
 assert.equal((await req('/rooms',{setup:{...setup,ai:true}})).status,400);
 for(const aiCount of [-1,1.5,'2',null,Number.MAX_SAFE_INTEGER+1])assert.equal((await req('/rooms',{setup,aiCount})).status,400);
 const a=(await req('/rooms',{setup,aiCount:4})).data,path=`/rooms/${a.code}`;
 assert.equal((await req(path+'/join',{setup:{...setup,ai:true}})).status,400);
 assert.equal((await req(path+'/start',{},a.token)).data.error,'needPlayers');
 const b=(await req(path+'/join',{setup})).data;
 assert.equal((await req(path+'/config',{aiCount:0},b.token)).status,403);
 const info=(await req(path+'/info',undefined,a.token)).data;assert.equal(info.aiCount,4);assert.equal(info.seats.length,2);assert.equal(info.onlineHumans,2);assert.equal(info.minPlayers,2);assert.ok(info.capacity>=6);
 assert.equal((await req(path+'/start',{},b.token)).status,403);
 assert.equal((await req(path+'/start',{},a.token)).status,200);
 const room=host.rooms.get(a.code);assert.equal(room.engine.state.players.length,6);assert.deepEqual(room.engine.state.players.map(p=>p.ai),[false,false,true,true,true,true]);
 for(const p of room.engine.state.players){assert.equal(room.engine.state.provinces.filter(v=>v.owner===p.id).length,1);assert.equal(room.engine.state.units.filter(u=>u.owner===p.id).length,5);}
 assert.equal((await req(path+'/config',{aiCount:0},a.token)).status,409);assert.equal((await req(path+'/join',{setup})).status,409);
}));
test('physical map capacity reserves AI seats without imposing a four-human limit',async()=>withServer(async(host,req)=>{
 const a=(await req('/rooms',{setup})).data,path=`/rooms/${a.code}`;
 const {capacity}=(await req(path+'/info',undefined,a.token)).data;
 assert.equal((await req('/rooms',{setup,aiCount:capacity})).data.error,'mapCapacity');
 assert.equal((await req(path+'/config',{aiCount:capacity-3},a.token)).status,200);
 const joined=await Promise.all(Array.from({length:5},()=>req(path+'/join',{setup})));
 assert.equal(joined.filter(r=>r.status===201).length,2);assert.equal(host.rooms.get(a.code).seats.length,3);
 assert.ok(joined.filter(r=>r.status===409).every(r=>r.data.error==='mapCapacity'));
 assert.equal((await req(path+'/config',{aiCount:capacity-2},a.token)).data.error,'mapCapacity');
 assert.equal((await req(path+'/config',{aiCount:0},a.token)).status,200);
 for(let i=0;i<4;i++)assert.equal((await req(path+'/join',{setup})).status,201);
 assert.equal((await req(path+'/start',{},a.token)).status,200);assert.equal(host.rooms.get(a.code).engine.state.players.length,7);
}));
test('room broadcasts include revised AI count and streamed state keeps server-created AI seats',async()=>withServer(async(host,req,base)=>{
 const a=(await req('/rooms',{setup})).data,path=`/rooms/${a.code}`,controller=new AbortController();
 await req(path+'/join',{setup});await req(path+'/join',{setup});
 try{
  const response=await fetch(base+path+'/events',{headers:{Authorization:`Bearer ${a.token}`,'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID},signal:controller.signal});
  const reader=response.body.getReader(),decode=new TextDecoder();
  assert.match(decode.decode((await reader.read()).value),/"aiCount":0/);
  assert.equal((await req(path+'/config',{aiCount:3},a.token)).status,200);
  assert.match(decode.decode((await reader.read()).value),/"aiCount":3/);
  assert.equal((await req(path+'/start',{},a.token)).status,200);
  let text='';while(!text.split('\n\n').slice(0,-1).some(event=>event.startsWith('data: ')&&JSON.parse(event.slice(6)).type==='state'))text+=decode.decode((await reader.read()).value);
  assert.match(text,/"ai":true/);assert.equal(host.rooms.get(a.code).engine.state.players.filter(p=>p.ai).length,3);
 }finally{controller.abort();}
}));
test('slow request bodies cannot bypass join/config/start mutation-time checks',async()=>withServer(async(host,req,base)=>{
 function paused(path,token,prefix){let finish;
  const result=new Promise(resolve=>{const r=httpRequest(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})}},response=>{let body='';response.on('data',c=>body+=c);response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(body)}));});r.write(prefix);finish=suffix=>r.end(suffix);});
  return {result,finish};
 }
 const a=(await req('/rooms',{setup})).data,path=`/rooms/${a.code}`;
 const {capacity}=(await req(path+'/info',undefined,a.token)).data;
 const joining=paused(path+'/join',undefined,'{"setup":');await new Promise(r=>setTimeout(r,20));
 assert.equal((await req(path+'/config',{aiCount:capacity-1},a.token)).status,200);joining.finish(JSON.stringify(setup)+'}');assert.equal((await joining.result).data.error,'mapCapacity');
 assert.equal(host.rooms.get(a.code).seats.length,1);
 assert.equal((await req(path+'/config',{aiCount:3},a.token)).status,200);await req(path+'/join',{setup});await req(path+'/join',{setup});
 const config=paused(path+'/config',a.token,'{"aiCount":');await new Promise(r=>setTimeout(r,20));
 assert.equal((await req(path+'/start',{},a.token)).status,200);config.finish('0}');assert.equal((await config.result).status,409);assert.equal(host.rooms.get(a.code).aiCount,3);
 const b=(await req('/rooms',{setup})).data,pb=`/rooms/${b.code}`,otherConfig=paused(pb+'/config',b.token,'{"aiCount":');await new Promise(r=>setTimeout(r,20));
 assert.equal((await req(pb+'/join',{setup})).status,201);otherConfig.finish(`${capacity-1}}`);assert.equal((await otherConfig.result).data.error,'mapCapacity');
 assert.equal(host.rooms.get(b.code).aiCount,0);assert.equal(host.rooms.get(b.code).seats.length,2);
 const c=(await req('/rooms',{setup})).data,pc=`/rooms/${c.code}`;
 await req(pc+'/join',{setup});await req(pc+'/join',{setup});
 const lateJoin=paused(pc+'/join',undefined,'{"setup":');await new Promise(r=>setTimeout(r,20));
 assert.equal((await req(pc+'/start',{},c.token)).status,200);lateJoin.finish(JSON.stringify(setup)+'}');assert.equal((await lateJoin.result).data.error,'roomClosed');assert.equal(host.rooms.get(c.code).seats.length,3);
}));
