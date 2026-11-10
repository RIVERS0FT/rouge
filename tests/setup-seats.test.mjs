import test from 'node:test';
import {request as httpRequest} from 'node:http';
import assert from 'node:assert/strict';
import {Engine,createGame} from '../src/game/engine.ts';
import {makeAISetups,chooseSpawnPairs} from '../src/game/spawns.ts';
import {regionCapacity,regionProductionRate} from '../src/game/territoryEconomy.ts';
import {TerrainNavigator,validateTravel} from '../src/game/terrain-navigation.ts';
import {MAP,pointInProvince,INITIAL_TERRITORY_GROUPING} from '../src/game/map.ts';
import {Navigator,cellAt} from '../src/game/navigation.ts';
import {createLanServer} from '../server/lan.ts';
import {MAP_ID,RULES_ID} from '../src/game/content.ts';
import {encodeSave,decodeSave} from '../src/game/save.ts';
const setup={name:'Human',leader:'warden',loadout:['infantry']};
test('seeded starts are dispersed, non-overlapping, equally resourced and land-connected with expansion exits',()=>{
 const starts=[];
 for(const seed of [0,42,1234]){
  const setups=[setup,...makeAISetups(3,seed)],s=createGame(setups,seed),again=createGame(setups,seed),pairs=chooseSpawnPairs(seed,4,s),nav=new TerrainNavigator();
  assert.deepEqual(s,again);assert.equal(new Set(pairs.flat()).size,8);starts.push(pairs[0][0]);
  for(const [actor,pair]of pairs.entries()){
   const initialGroups=new Set(pair.map(id=>INITIAL_TERRITORY_GROUPING.atomToGroup[MAP[id].code]));assert.equal(initialGroups.size,2);
   const codes=new Set(INITIAL_TERRITORY_GROUPING.groups.filter(g=>initialGroups.has(g.id)).flatMap(g=>g.atoms));
   const owned=s.provinces.filter(p=>p.owner===actor);assert.deepEqual(owned.map(p=>MAP[p.id].code).sort(),[...codes].sort());
   assert.equal(owned.reduce((n,p)=>n+regionCapacity(p.id),0),24);assert.ok(Math.abs(owned.reduce((n,p)=>n+regionProductionRate(p.id),0)-2)<1e-12);
   assert.equal(s.units.filter(u=>u.owner===actor).length,10);assert.equal(s.players[actor].gold,120);
   for(const a of pair){const b=pair.find(p=>p!==a);assert.ok(MAP[a].neighbors.includes(b));
    const flow=nav.plan(MAP[a].center,MAP[b].center);assert.ok(flow);assert.ok(validateTravel(flow,MAP[a].center,MAP[b].center));assert.ok(flow.points.every(p=>!p.sea));
    assert.ok(MAP[a].neighbors.some(n=>n!==b));assert.ok(s.units.filter(u=>u.province===a).every(u=>pointInProvince(a,u.x,u.z)));
   }
  }
  for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++)for(const a of pairs[i])for(const b of pairs[j])assert.ok(Math.hypot(MAP[a].center.x-MAP[b].center.x,MAP[a].center.z-MAP[b].center.z)>100);
  assert.deepEqual(decodeSave(encodeSave(s,'Spawn preserved')).state,s);
 }
 assert.equal(new Set(starts).size,3);
});
test('human/AI labels and flags do not influence allocation; solo counts stay between two and four players',()=>{
 for(const aiCount of [1,2,3]){
  const s=createGame([setup,...makeAISetups(aiCount)],42);assert.equal(s.players.length,aiCount+1);assert.equal(s.players.filter(p=>p.ai).length,aiCount);
  const allHuman=createGame(s.players.map(p=>({name:p.name,leader:p.leader,loadout:p.loadout,ai:false,flag:{type:'custom',pattern:'vertical',colors:['#123456','#abcdef','#ffffff']}})),42);
  assert.deepEqual(s.provinces.map(p=>p.owner),allHuman.provinces.map(p=>p.owner));
 }
 for(const n of [-1,4,1.5,NaN])assert.throws(()=>makeAISetups(n),/invalidAI/);
 assert.throws(()=>createGame([setup]),/invalidSetup/);assert.deepEqual(makeAISetups(0),[]);
});
async function withServer(run){
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${host.server.address().port}/api`;
 const request=async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 try{await run(host,request,base);}finally{await host.close();}
}
test('real HTTP lobby: host AI configuration, slot reservation, authoritative AI setups and start limits',async()=>withServer(async(host,req)=>{
 assert.equal((await req('/rooms',{setup:{...setup,ai:true}})).status,400);
 for(const aiCount of [-1,4,1.5,'2',null])assert.equal((await req('/rooms',{setup,aiCount})).status,400);
 const a=(await req('/rooms',{setup,aiCount:2})).data,path=`/rooms/${a.code}`;
 assert.equal((await req(path+'/join',{setup:{...setup,ai:true}})).status,400);
 const b=(await req(path+'/join',{setup})).data;
 assert.equal((await req(path+'/join',{setup})).status,409);
 assert.equal((await req(path+'/config',{aiCount:0},b.token)).status,403);
 assert.equal((await req(path+'/config',{aiCount:3},a.token)).status,409);
 const info=(await req(path+'/info',undefined,a.token)).data;assert.equal(info.aiCount,2);assert.equal(info.seats.length,2);
 assert.equal((await req(path+'/start',{},b.token)).status,403);
 assert.equal((await req(path+'/start',{},a.token)).status,200);
 const room=host.rooms.get(a.code);assert.equal(room.engine.state.players.length,4);assert.deepEqual(room.engine.state.players.map(p=>p.ai),[false,false,true,true]);
 assert.equal((await req(path+'/config',{aiCount:0},a.token)).status,409);assert.equal((await req(path+'/join',{setup})).status,409);
 const c=(await req('/rooms',{setup})).data,cp=`/rooms/${c.code}`;assert.equal((await req(cp+'/start',{},c.token)).data.error,'needPlayers');
 assert.equal((await req(cp+'/config',{aiCount:1},c.token)).data.aiCount,1);assert.equal((await req(cp+'/start',{},c.token)).status,200);
}));
test('concurrent joins/config/start cannot overfill or displace reserved AI seats',async()=>withServer(async(host,req)=>{
 const a=(await req('/rooms',{setup,aiCount:2})).data,path=`/rooms/${a.code}`;
 const joined=await Promise.all(Array.from({length:5},()=>req(path+'/join',{setup})));
 assert.equal(joined.filter(r=>r.status===201).length,1);assert.equal(host.rooms.get(a.code).seats.length,2);
 const results=await Promise.all([req(path+'/config',{aiCount:3},a.token),req(path+'/start',{},a.token),req(path+'/join',{setup})]);
 assert.equal(results[0].status,409);assert.equal(results[1].status,200);assert.equal(results[2].status,409);
 assert.equal(host.rooms.get(a.code).engine.state.players.length,4);
}));
test('room broadcasts include revised AI count and streamed state keeps server-created AI seats',async()=>withServer(async(host,req,base)=>{
 const a=(await req('/rooms',{setup})).data,path=`/rooms/${a.code}`,controller=new AbortController();
 const response=await fetch(base+path+'/events',{headers:{Authorization:`Bearer ${a.token}`,'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID},signal:controller.signal});
 const reader=response.body.getReader(),decode=new TextDecoder();
 assert.match(decode.decode((await reader.read()).value),/"aiCount":0/);
 assert.equal((await req(path+'/config',{aiCount:3},a.token)).status,200);
 assert.match(decode.decode((await reader.read()).value),/"aiCount":3/);
 assert.equal((await req(path+'/start',{},a.token)).status,200);
 let text='';while(!text.split('\n\n').slice(0,-1).some(event=>event.startsWith('data: ')&&JSON.parse(event.slice(6)).type==='state'))text+=decode.decode((await reader.read()).value);
 assert.match(text,/"ai":true/);assert.equal(host.rooms.get(a.code).engine.state.players.filter(p=>p.ai).length,3);controller.abort();
}));
test('slow request bodies cannot bypass join/config/start mutation-time checks',async()=>withServer(async(host,req,base)=>{
 function paused(path,token,prefix){let finish;
  const result=new Promise(resolve=>{const r=httpRequest(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})}},response=>{let body='';response.on('data',c=>body+=c);response.on('end',()=>resolve({status:response.statusCode,data:JSON.parse(body)}));});r.write(prefix);finish=suffix=>r.end(suffix);});
  return {result,finish};
 }
 const a=(await req('/rooms',{setup})).data,path=`/rooms/${a.code}`;
 const joining=paused(path+'/join',undefined,'{"setup":');await new Promise(r=>setTimeout(r,20));
 assert.equal((await req(path+'/config',{aiCount:3},a.token)).status,200);joining.finish(JSON.stringify(setup)+'}');assert.equal((await joining.result).status,409);
 assert.equal(host.rooms.get(a.code).seats.length,1);
 const config=paused(path+'/config',a.token,'{"aiCount":');await new Promise(r=>setTimeout(r,20));
 assert.equal((await req(path+'/start',{},a.token)).status,200);config.finish('0}');assert.equal((await config.result).status,409);assert.equal(host.rooms.get(a.code).aiCount,3);
 const b=(await req('/rooms',{setup})).data,pb=`/rooms/${b.code}`,otherConfig=paused(pb+'/config',b.token,'{"aiCount":');await new Promise(r=>setTimeout(r,20));
 assert.equal((await req(pb+'/join',{setup})).status,201);otherConfig.finish('3}');assert.equal((await otherConfig.result).status,409);
 assert.equal(host.rooms.get(b.code).aiCount,0);assert.equal(host.rooms.get(b.code).seats.length,2);
}));
