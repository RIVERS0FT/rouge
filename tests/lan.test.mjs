import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLanServer } from '../server/lan.ts';
const setup={name:'Human',leader:'warden',loadout:['infantry','cavalry']};
test('real HTTP LAN: two seats, host-only start, token-bound commands and streamed snapshots',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${host.server.address().port}`;
 const request=async(path,body,token)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 try{
  const a=(await request('/rooms',{setup})).data,b=(await request(`/rooms/${a.code}/join`,{setup:{...setup,name:'Second'}})).data;assert.equal(a.actor,0);assert.equal(b.actor,1);
  assert.equal((await request(`/rooms/${a.code}/start`,{},b.token)).status,403);
  assert.equal((await request(`/rooms/${a.code}/start`,{},a.token)).status,200);
  assert.equal((await request(`/rooms/${a.code}/command`,{actor:0,command:{type:'production',province:0,kind:'cavalry'}},b.token)).status,400);
  assert.equal((await request(`/rooms/${a.code}/command`,{command:{type:'upgrade',kind:'infantry',stat:'attack'}},a.token)).status,200);
  assert.equal((await request(`/rooms/${a.code}/info`,undefined,'forged')).status,401);
  const controller=new AbortController();const stream=await fetch(`${base}/api/rooms/${a.code}/events`,{headers:{Authorization:`Bearer ${b.token}`},signal:controller.signal});const reader=stream.body.getReader();let text='';for(let i=0;i<4&&!text.includes('"state"');i++){const{value}=await reader.read();text+=new TextDecoder().decode(value);}assert.ok(text.includes('"state"'));assert.ok(text.includes('"started":true'));controller.abort();
  const denied=await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({setup})});assert.equal(denied.status,403);
 }finally{await host.close();}
});
