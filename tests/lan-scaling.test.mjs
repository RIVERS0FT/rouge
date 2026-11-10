import {connectTicket} from './helpers/lan-streams.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLanServer} from '../server/lan.ts';
import {MAP_ID,RULES_ID} from '../src/game/content.ts';
const setup=name=>({name,leader:'warden',loadout:['infantry']});
test('expanded LAN retains reconnect identity, private snapshots, input and rate safeguards',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}/api`,controllers=[];
 const headers=token=>({'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})});
 const request=async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:headers(token),body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(r.status===201&&data.token)await connectTicket(base,data);return{status:r.status,data};};
 async function connect(ticket){
  const controller=new AbortController();controllers.push(controller);
  const response=await fetch(base+`/rooms/${ticket.code}/events`,{headers:headers(ticket.token),signal:controller.signal});assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  while(true){const {value,done}=await reader.read();assert.equal(done,false);buffer+=decoder.decode(value,{stream:true});let end;
   while((end=buffer.indexOf('\n\n'))>=0){const text=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!text.startsWith('data: '))continue;const frame=JSON.parse(text.slice(6));if(frame.type==='state')return frame.state;}
  }
 }
 try{
  const a=(await request('/rooms',{setup:setup('Host')})).data,path=`/rooms/${a.code}`,tickets=[a];
  for(let i=1;i<6;i++){const r=await request(path+'/join',{setup:setup(`Human ${i}`)});assert.equal(r.status,201);tickets.push(r.data);assert.equal(r.data.actor,i);}
  assert.equal((await request(path+'/start',{},a.token)).status,200);
  const room=host.rooms.get(a.code),last=tickets.at(-1);
  room.engine.state.players[0].choices=['industry'];room.engine.state.players[last.actor].choices=['forcedMarch'];
  const first=await connect(last);assert.deepEqual(first.players[last.actor].choices,['forcedMarch']);
  assert.equal(first.players.length,6);assert.ok(first.players.filter(p=>p.id!==last.actor).every(p=>p.choices.length===0));
  const old=room.streams.get(last.actor),reconnected=await connect(last);
  assert.equal(reconnected.players.length,6);assert.equal(room.seats.length,6);assert.equal(room.streams.size,6);assert.notEqual(room.streams.get(last.actor),old);assert.ok(old.writableEnded);
  // A slow consumer is closed before encoding another snapshot, without taking
  // down healthy streams or deleting its authenticated seat.
  const slow=room.streams.get(last.actor);Object.defineProperty(slow,'writableLength',{configurable:true,value:1_000_000});
  await request(path+'/command',{command:{type:'upgrade',kind:'infantry',stat:'health'}},a.token);
  assert.ok(slow.destroyed);assert.equal(room.seats.length,6);
  const recovered=await connect(last);assert.equal(recovered.players.length,6);
  assert.equal((await request(path+'/command',{command:{type:'upgrade',kind:'infantry',stat:'attack'}},last.token)).status,200);
  assert.equal(room.engine.state.players[last.actor].upgrades.infantry.attack,1);
  assert.equal((await request(path+'/info',undefined,'forged')).status,401);
  assert.equal((await request('/rooms',{setup:setup('x'.repeat(9000))})).data.error,'tooLarge');
  // Separate actor's window avoids relying on wall-clock timing of game setup.
  const seat=room.seats[1];seat.window=Date.now();seat.requests=30;
  assert.equal((await request(path+'/info',undefined,tickets[1].token)).status,429);
  seat.window=Date.now()-1001;
  assert.equal((await request(path+'/info',undefined,tickets[1].token)).status,200);
 }finally{controllers.forEach(c=>c.abort());await host.close();}
});

test('broadcasts share serialized empty-choice views while isolating private choices and same-tick bases',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}/api`;
 const req=async(path,body,token)=>{const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});assert.ok(r.ok);const data=await r.json();if(r.status===201&&data.token)await connectTicket(base,data);return data;};
 try{
  const a=await req('/rooms',{setup:setup('Host')}),path=`/rooms/${a.code}`;
  for(let i=1;i<6;i++)await req(path+'/join',{setup:setup(`Human ${i}`)});
  await req(path+'/start',{},a.token);
  const room=host.rooms.get(a.code),state=room.engine.state;
  room.engine.step=()=>{}; // Keep all subsequent commands at the same tick.
  state.players[0].choices=['industry'];state.players[5].choices=['forcedMarch'];
  let encodes=0,startEncodes=0;
  const originalMap=state.players.map;
  state.players.map=function(...args){encodes++;return originalMap.apply(this,args);};
  const messages=Array.from({length:6},()=>[]),batches=[];
  const stream=actor=>({destroyed:false,writableEnded:false,writableLength:0,end(){this.writableEnded=true;},destroy(){this.destroyed=true;},write(data){
   if(!data.startsWith('data: '))return true;
   const frame=JSON.parse(data.slice(6));messages[actor].push({data,frame});
   if(actor===0)startEncodes=encodes-1;
   if(actor===5)batches.push(encodes-startEncodes);
   return true;
  }});
  for(const response of room.streams.values())response.end();
  for(let i=0;i<6;i++)room.streams.set(i,stream(i));
  await req(path+'/command',{command:{type:'upgrade',kind:'infantry',stat:'attack'}},a.token);
  assert.ok(batches.length);assert.ok(batches.every(n=>n===3),'one encode for empty-choice viewers plus two private-choice views');
  const latest=i=>messages[i].at(-1);
  assert.equal(latest(1).data,latest(2).data);assert.equal(latest(2).data,latest(4).data);
  for(let i=0;i<6;i++)for(const p of latest(i).frame.state.players)assert.deepEqual(p.choices,p.id===i?state.players[i].choices:[]);
  // Replace a stream: it needs a full frame, while existing same-tick clients
  // must receive a delta. Distinct base identities must not be conflated.
  room.streams.set(3,stream(3));
  const province=state.provinces.find(p=>p.owner===0);province.capture=0.25;
  await req(path+'/command',{command:{type:'upgrade',kind:'infantry',stat:'health'}},a.token);
  const replacement=messages[3].findLast(m=>m.frame.type==='state');assert.ok(replacement);
  assert.equal(replacement.frame.state.provinces[province.id].capture,0.25);
  assert.equal(latest(1).frame.type,'delta');
  assert.ok(messages[1].some(m=>m.frame.type==='delta'&&m.frame.provinces.some(p=>p.id===province.id&&p.capture===0.25)));
  const before=batches.length;province.capture=0.5;
  await req(path+'/command',{command:{type:'upgrade',kind:'infantry',stat:'speed'}},a.token);
  assert.ok(batches.slice(before).every(n=>n===3),'replacement converges onto the shared base');
  for(let i=0;i<6;i++)assert.ok(messages[i].some(m=>m.frame.type==='delta'&&m.frame.provinces.some(p=>p.id===province.id&&p.capture===0.5)));
 }finally{await host.close();}
});

test('start counts live human streams, retains offline seats and restores eligibility on reconnect',async()=>{
 const host=createLanServer();await new Promise(resolve=>host.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${host.server.address().port}/api`,controllers=[];
 const req=async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 try{
  const a=(await req('/rooms',{setup:setup('Host'),aiCount:4})).data,path=`/rooms/${a.code}`;
  const b=(await req(path+'/join',{setup:setup('Second')})).data;
  await req(path+'/join',{setup:setup('Offline retained seat')});
  assert.equal((await req(path+'/info',undefined,a.token)).data.onlineHumans,0);
  assert.equal((await req(path+'/start',{},a.token)).data.error,'needPlayers');
  controllers.push(await connectTicket(base,a));
  assert.equal((await req(path+'/start',{},a.token)).data.error,'needPlayers');
  controllers.push(await connectTicket(base,b));
  let info=(await req(path+'/info',undefined,a.token)).data;assert.equal(info.onlineHumans,2);assert.deepEqual(info.seats.map(s=>s.connected),[true,true,false]);
  controllers[1].abort();
  const deadline=Date.now()+2000;
  do{await new Promise(r=>setTimeout(r,20));info=(await req(path+'/info',undefined,a.token)).data;}while(info.onlineHumans!==1&&Date.now()<deadline);
  assert.equal(info.onlineHumans,1);assert.equal(info.seats.length,3);
  assert.equal((await req(path+'/start',{},a.token)).data.error,'needPlayers');
  controllers.push(await connectTicket(base,b));
  // Immediate replacement must not let the prior stream's close callback mark
  // the newer connection offline.
  controllers.push(await connectTicket(base,b));
  await new Promise(r=>setTimeout(r,20));
  info=(await req(path+'/info',undefined,a.token)).data;assert.equal(info.onlineHumans,2);assert.equal(info.seats.length,3);
  assert.equal((await req(path+'/start',{},a.token)).status,200);
  assert.equal(host.rooms.get(a.code).engine.state.players.length,7);
 }finally{controllers.forEach(c=>c.abort());await host.close();}
});
