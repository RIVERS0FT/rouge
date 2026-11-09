import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_ID, VERSION } from '../src/game/content.ts';
import { createLanServer } from '../server/lan.ts';
const setup={name:'Human',leader:'warden',loadout:['infantry']};
test('real HTTP LAN: two seats, host-only start, token-bound commands and streamed snapshots',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${host.server.address().port}`;
 const request=async(path,body,token)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'X-Rouge-Map':MAP_ID,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 try{
  assert.equal((await request('/rooms',{setup:{...setup,loadout:['infantry','cavalry']}})).status,400);
  const a=(await request('/rooms',{setup})).data,b=(await request(`/rooms/${a.code}/join`,{setup:{...setup,name:'Second',loadout:['engineer']}})).data;assert.equal(a.actor,0);assert.equal(b.actor,1);
  assert.equal((await request(`/rooms/${a.code}/start`,{},b.token)).status,403);
  assert.equal((await request(`/rooms/${a.code}/start`,{},a.token)).status,200);
  assert.equal((await request(`/rooms/${a.code}/command`,{actor:0,command:{type:'production',province:0,kind:'cavalry'}},b.token)).status,400);
  assert.equal((await request(`/rooms/${a.code}/command`,{command:{type:'upgrade',kind:'infantry',stat:'attack'}},a.token)).status,200);
  assert.equal((await request(`/rooms/${a.code}/info`,undefined,'forged')).status,401);
  const controller=new AbortController();const stream=await fetch(`${base}/api/rooms/${a.code}/events`,{headers:{Authorization:`Bearer ${b.token}`,'X-Rouge-Map':MAP_ID},signal:controller.signal});const reader=stream.body.getReader();let text='';for(let i=0;i<4&&!text.includes('"state"');i++){const{value}=await reader.read();text+=new TextDecoder().decode(value);}assert.ok(text.includes('"state"'));assert.ok(text.includes('"started":true'));controller.abort();
  const denied=await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({setup})});assert.equal(denied.status,403);
 }finally{await host.close();}
});

test('LAN rejects missing or mismatched map identity before creating or accessing a room',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}`;
 try{
  const health=await(await fetch(base+'/api/health')).json();assert.equal(health.map,MAP_ID);assert.equal(health.version,VERSION);
  for(const map of [undefined,'earth-admin1-mercator-v1']){
   const headers={'Content-Type':'application/json',...(map?{'X-Rouge-Map':map}:{})};
   const r=await fetch(base+'/api/rooms',{method:'POST',headers,body:JSON.stringify({setup})});
   assert.equal(r.status,409);assert.equal((await r.json()).error,'incompatibleMap');
   const stream=await fetch(base+'/api/rooms/ABCDEF/events',{headers});assert.equal(stream.status,409);
  }
 }finally{await host.close();}
});
