import {connectTicket} from './helpers/lan-streams.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_ID, RULES_ID, VERSION } from '../src/game/content.ts';
import { createLanServer } from '../server/lan.ts';
import { applyFrame } from '../src/platform/replication.ts';
import { PLAYABLE_COUNT } from '../src/game/map.ts';
const setup={name:'Human',leader:'warden',loadout:['infantry'],flag:{type:'custom',pattern:'vertical',colors:['#123456','#abcdef','#ffffff']}};
test('real HTTP LAN: two online seats, host-only start, token-bound commands and streamed snapshots',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${host.server.address().port}`;
 const request=async(path,body,token)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(r.status===201&&data.token)await connectTicket(base+'/api',data);return{status:r.status,data};};
 try{
  assert.equal((await request('/rooms',{setup:{...setup,loadout:['infantry','cavalry']}})).status,400);
  const a=(await request('/rooms',{setup})).data,b=(await request(`/rooms/${a.code}/join`,{setup:{...setup,name:'Second',loadout:['engineer']}})).data;assert.equal(a.actor,0);assert.equal(b.actor,1);
  const info=(await request(`/rooms/${a.code}/info`,undefined,a.token)).data;assert.deepEqual(info.seats[0].flag,setup.flag);
  assert.equal((await request(`/rooms/${a.code}/start`,{},b.token)).status,403);
  assert.equal((await request(`/rooms/${a.code}/start`,{},a.token)).status,200);
  assert.equal((await request(`/rooms/${a.code}/command`,{actor:0,command:{type:'production',province:0,kind:'cavalry'}},b.token)).status,400);
  assert.equal((await request(`/rooms/${a.code}/command`,{command:{type:'upgrade',kind:'infantry',stat:'attack'}},a.token)).status,200);
  assert.equal((await request(`/rooms/${a.code}/info`,undefined,'forged')).status,401);
  const controller=new AbortController();const stream=await fetch(`${base}/api/rooms/${a.code}/events`,{headers:{Authorization:`Bearer ${b.token}`,'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID},signal:controller.signal});const reader=stream.body.getReader();let text='';for(let i=0;i<4&&!text.includes('"state"');i++){const{value}=await reader.read();text+=new TextDecoder().decode(value);}assert.ok(text.includes('"state"'));assert.ok(text.includes('"started":true'));controller.abort();
  const denied=await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({setup})});assert.equal(denied.status,403);
 }finally{await host.close();}
});

test('LAN rejects missing or mismatched map identity before creating or accessing a room',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}`;
 try{
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.map,MAP_ID);assert.equal(health.version,VERSION);assert.equal(health.rules,RULES_ID);
  for(const map of [undefined,'earth-admin1-mercator-v1']){
   const headers={'Content-Type':'application/json','X-Rouge-Rules':RULES_ID,...(map?{'X-Rouge-Map':map}:{})};
   const r=await fetch(base+'/api/rooms',{method:'POST',headers,body:JSON.stringify({setup})});
   assert.equal(r.status,409);assert.equal((await r.json()).error,'incompatibleMap');
   const stream=await fetch(base+'/api/rooms/ABCDEF/events',{headers});assert.equal(stream.status,409);
  }
 }finally{await host.close();}
});


test('LAN rejects missing and obsolete rules for every room endpoint without mutation',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}`;
 try{
  const headers={'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID};
  const created=await fetch(base+'/api/rooms',{method:'POST',headers,body:JSON.stringify({setup})});
  assert.equal(created.status,201);const ticket=await created.json(),room=host.rooms.get(ticket.code);
  for(const rules of [undefined,'legacy-land-only-v1','admin1-groups-terrain-collision-v2','admin1-locked-game-regions-neutral-garrisons-v11']){
   const incompatible={'Content-Type':'application/json','X-Rouge-Map':MAP_ID,Authorization:`Bearer ${ticket.token}`,...(rules?{'X-Rouge-Rules':rules}:{})};
   for(const [suffix,method,body]of [['','POST',{setup}],[`/${ticket.code}/join`,'POST',{setup}],[`/${ticket.code}/start`,'POST',{}],[`/${ticket.code}/command`,'POST',{command:{type:'upgrade',kind:'infantry',stat:'attack'}}],[`/${ticket.code}/info`,'GET'],[`/${ticket.code}/events`,'GET']]){
    const r=await fetch(base+'/api/rooms'+suffix,{method,headers:incompatible,body:body===undefined?undefined:JSON.stringify(body)});
    assert.equal(r.status,409,suffix);assert.equal((await r.json()).error,'incompatibleRules');
   }
  }
  assert.equal(host.rooms.size,1);assert.equal(room.seats.length,1);assert.equal(room.engine,null);assert.equal(room.streams.size,0);
  const info=await fetch(`${base}/api/rooms/${ticket.code}/info`,{headers:{...headers,Authorization:`Bearer ${ticket.token}`}});
  assert.equal(info.status,200);
 }finally{await host.close();}
});

test('LAN admits all four new kinds, starts and accepts only their own upgrades',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+host.server.address().port+'/api';
 const req=async(path,body,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const data=await r.json();if(r.status===201&&data.token)await connectTicket(base,data);return {status:r.status,data};};
 try{
  const kinds=['skirmisher','grenadier','heavyCavalry','horseArtillery'];
  const a=await req('/rooms',{setup:{...setup,loadout:[kinds[0]]}});assert.equal(a.status,201);
  const tickets=[a.data];
  for(const kind of kinds.slice(1)){const r=await req('/rooms/'+a.data.code+'/join',{setup:{...setup,name:kind,loadout:[kind]}});assert.equal(r.status,201);tickets.push(r.data);}
  assert.equal((await req('/rooms/'+a.data.code+'/start',{},a.data.token)).status,200);
  for(let i=0;i<4;i++){
   const path='/rooms/'+a.data.code+'/command';
   assert.equal((await req(path,{command:{type:'upgrade',kind:kinds[i],stat:'attack'}},tickets[i].token)).status,200);
   assert.equal((await req(path,{command:{type:'upgrade',kind:'infantry',stat:'attack'}},tickets[i].token)).status,400);
  }
 }finally{await host.close();}
});

test('a full neutral-garrison reconnect survives the next ordered LAN delta',async()=>{
 const host=createLanServer();
 await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}/api`,controller=new AbortController();
 const headers={'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,'Content-Type':'application/json'};
 const post=async(path,body,token)=>{
  const r=await fetch(base+path,{method:'POST',headers:{...headers,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  assert.ok(r.ok,await r.clone().text());return r.json();
 };
 try{
  const a=await post('/rooms',{setup}),path=`/rooms/${a.code}`,b=await post(path+'/join',{setup});
  await connectTicket(base,a);await connectTicket(base,b);
  await post(path+'/start',{},a.token);
  const response=await fetch(base+path+'/events',{headers:{...headers,Authorization:`Bearer ${b.token}`},signal:controller.signal});
  assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='';
  async function frame(type){
   for(;;){
    const end=buffer.indexOf('\n\n');
    if(end>=0){
     const event=JSON.parse(buffer.slice(6,end));
     buffer=buffer.slice(end+2);
     if(event.type===type)return event;
     continue;
    }
    const chunk=await reader.read();assert.ok(!chunk.done,`stream ended before ${type}`);
    buffer+=decoder.decode(chunk.value,{stream:true});
   }
  }
  const first=applyFrame(null,await frame('state'));
  assert.equal(first.units.filter(u=>u.owner===-1).length,(PLAYABLE_COUNT-2)*5);
  const delta=await frame('delta');
  assert.ok(delta.neutral);
  assert.equal(delta.state.units.length,10);
  assert.equal(applyFrame(first,delta).units.length,first.units.length);
 }finally{controller.abort();await host.close();}
});
