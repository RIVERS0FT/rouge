import {connectTicket} from './helpers/lan-streams.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanServer} from '../server/lan.ts';
import {MAP_ID,RULES_ID} from '../src/game/content.ts';
import {MAP} from '../src/game/map.ts';
import {isEliminated} from '../src/game/elimination.ts';
const setup=name=>({name,leader:'warden',loadout:['infantry']});
test('real HTTP: eliminated seat loses command authority but can observe while server ticks and survivors act',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}/api`,controller=new AbortController();
 const headers=token=>({'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})});
 const request=async(path,body,token)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:headers(token),body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(response.status===201&&data.token)await connectTicket(base,data);return{status:response.status,data};};
 async function until(predicate){const deadline=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<deadline,'server timer did not advance to expected state');await new Promise(resolve=>setTimeout(resolve,20));}}
 try{
  const a=(await request('/rooms',{setup:setup('Defeated')})).data,path=`/rooms/${a.code}`;
  const b=(await request(path+'/join',{setup:setup('Conqueror')})).data;
  const c=(await request(path+'/join',{setup:setup('Survivor')})).data;
  assert.equal((await request(path+'/start',{},a.token)).status,200);
  // Existing in-process server test handle, not a network debug/import endpoint.
  // Set up a one-tick capture and let the REAL authoritative interval resolve it.
  const s=host.rooms.get(a.code).engine.state;
  for(const actor of [0,1,2]){const owned=s.provinces.filter(p=>p.owner===actor);for(const p of owned.slice(1))p.owner=-1;}
  const last=s.provinces.find(p=>p.owner===0),enemyHome=s.provinces.find(p=>p.owner===1);
  const invader=s.units.find(u=>u.owner===1),remnant=s.units.find(u=>u.owner===0);
  const place=(u,p)=>Object.assign(u,{x:MAP[p.id].center.x,z:MAP[p.id].center.z,province:p.id,origin:p.id,target:null,destination:null,route:[],cooldown:0});
  place(invader,last);place(remnant,enemyHome);last.captor=1;last.capture=7.99;enemyHome.captor=0;enemyHome.capture=1;s.units=[invader,remnant];
  await until(()=>isEliminated(s,0));
  assert.equal(s.winner,null);assert.equal(s.units.some(u=>u.owner===0),false);assert.equal(enemyHome.captor,-1);assert.equal(enemyHome.capture,0);
  for(const command of [{type:'upgrade',kind:'infantry',stat:'attack'},{type:'production',province:last.id,kind:'infantry'},{type:'march',from:last.id,to:enemyHome.id,fraction:1},{type:'reroll'}]){
   const result=await request(path+'/command',{command,actor:1},a.token);
   assert.equal(result.status,400);assert.deepEqual(result.data,{ok:false,error:'eliminated'});
  }
  for(const ticket of [b,c])assert.equal((await request(path+'/command',{command:{type:'upgrade',kind:'infantry',stat:'attack'}},ticket.token)).status,200);
  assert.equal((await request(path+'/info',undefined,a.token)).status,200);
  const response=await fetch(base+path+'/events',{headers:headers(a.token),signal:controller.signal});assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',snapshot;
  while(!snapshot){const chunk=await reader.read();assert.equal(chunk.done,false);buffer+=decoder.decode(chunk.value);let end;
   while((end=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=event.split('\n').find(line=>line.startsWith('data: '));if(data){const parsed=JSON.parse(data.slice(6));if(parsed.type==='state')snapshot=parsed.state;}}
  }
  assert.equal(snapshot.players.length,3);assert.equal(snapshot.units.some(u=>u.owner===0),false);
  const tick=s.tick;await until(()=>s.tick>=tick+2);assert.equal(s.winner,null);
 }finally{controller.abort();await host.close();}
});
