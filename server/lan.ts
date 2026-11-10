import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAISetups, getSpawnCapacity } from '../src/game/spawns.ts';
import { Engine, createGame } from '../src/game/engine.ts';
import { encodeFrame, type SnapshotBase } from '../src/platform/replication.ts';
import { validateSetup, MAP_ID, RULES_ID, VERSION } from '../src/game/content.ts';
import type { PlayerSetup } from '../src/game/types.ts';
interface Seat {id:number;setup:PlayerSetup;token:string;requests:number;window:number}
interface Room {code:string;aiCount:number;seats:Seat[];engine:Engine|null;streams:Map<number,ServerResponse>;touched:number}
const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
export function createLanServer(options:{dist?:string;maxRooms?:number}={}){
  const bases=new WeakMap<ServerResponse,SnapshotBase>();
  const rooms=new Map<string,Room>(),dist=resolve(options.dist??fileURLToPath(new URL('../dist',import.meta.url)));
  const connected=(r:Room,id:number)=>{const stream=r.streams.get(id);return !!stream&&!stream.destroyed&&!stream.writableEnded;};
  const onlineHumans=(r:Room)=>r.seats.filter(s=>!s.setup.ai&&connected(r,s.id)).length;
  const info=(r:Room)=>({code:r.code,host:0,started:Boolean(r.engine),aiCount:r.aiCount,capacity:getSpawnCapacity(),minPlayers:2,onlineHumans:onlineHumans(r),seats:r.seats.map(s=>({id:s.id,connected:connected(r,s.id),name:s.setup.name,leader:s.setup.leader,...(s.setup.flag?{flag:s.setup.flag}:{}),loadout:s.setup.loadout}))});
  function json(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  // Bound each slow client's queued bytes. Disconnect rather than drop a delta;
  // reconnect always starts with a fresh full snapshot and preserves its seat.
  function writable(res:ServerResponse){if(!res.destroyed&&!res.writableEnded&&res.writableLength<1_000_000)return true;res.destroy();return false;}
  function emitEncoded(res:ServerResponse,data:string){if(!writable(res))return false;res.write(data);return true;}
  function serialize(event:unknown){return `data: ${JSON.stringify(event)}\n\n`;}
  function broadcast(room:Room){const data=serialize({type:'room',room:info(room)});for(const res of room.streams.values())emitEncoded(res,data);}
  // Cache only within this synchronous broadcast. Bases use object identity, not
  // tick: a command can change provinces several times within the same tick.
  // Empty-choice viewers share one frame; pending private choices stay per actor.
  function snapshot(room:Room,streams:Iterable<[number,ServerResponse]>=room.streams){
    if(!room.engine)return;
    const frames=new Map<SnapshotBase|undefined,Map<number,string>>();
    let nextBase:SnapshotBase|undefined;
    for(const[actor,res]of streams){
      if(!writable(res))continue;
      const base=bases.get(res),viewer=room.engine.state.players[actor]?.choices.length?actor:-1;
      let variants=frames.get(base);if(!variants){variants=new Map();frames.set(base,variants);}
      let data=variants.get(viewer);
      if(data===undefined){const encoded=encodeFrame(room.engine.state,base,actor);nextBase??=encoded.base;data=serialize(encoded.frame);variants.set(viewer,data);}
      // All successfully sent views describe the same current province state.
      // Converging bases lets the next broadcast reuse deltas across recipients.
      if(emitEncoded(res,data))bases.set(res,nextBase!);
    }
  }
  async function body(req:IncomingMessage):Promise<any>{const chunks:Buffer[]=[];let bytes=0;for await(const chunk of req){const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=data.length;if(bytes>8192)throw new Error('tooLarge');chunks.push(data);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('invalidJson');}}
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`);
    try{
      // Same-origin only: the server also serves the built game. No permissive CORS.
      if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host){json(res,403,{error:'originDenied'});return;}}
      if(url.pathname==='/api/health'){json(res,200,{ok:true,version:VERSION,map:MAP_ID,rules:RULES_ID});return;}
      if(url.pathname.startsWith('/api/rooms')&&req.headers['x-rouge-map']!==MAP_ID){json(res,409,{error:'incompatibleMap'});return;}
      if(url.pathname.startsWith('/api/rooms')&&req.headers['x-rouge-rules']!==RULES_ID){json(res,409,{error:'incompatibleRules'});return;}
      if(req.method==='POST'&&url.pathname==='/api/rooms'){
        if(rooms.size>=(options.maxRooms??16)){json(res,503,{error:'serverFull'});return;}
        const input=await body(req);if(!validateSetup(input?.setup)||input.setup.ai===true){json(res,400,{error:'invalidSetup'});return;}
        const aiCount=input.aiCount===undefined?0:input.aiCount;if(!Number.isSafeInteger(aiCount)||aiCount<0){json(res,400,{error:'invalidAI'});return;}
        if(aiCount+1>getSpawnCapacity()){json(res,409,{error:'mapCapacity'});return;}
        if(rooms.size>=(options.maxRooms??16)){json(res,503,{error:'serverFull'});return;}
        let code:string;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
        const token=randomBytes(24).toString('hex'),room:Room={code,aiCount,seats:[{id:0,setup:{...input.setup,ai:false},token,requests:0,window:Date.now()}],engine:null,streams:new Map(),touched:Date.now()};rooms.set(code,room);
        json(res,201,{code,token,actor:0});return;
      }
      const match=url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})\/(join|events|start|command|info|config)$/);
      if(match){
        const room=rooms.get(match[1]);if(!room){json(res,404,{error:'roomMissing'});return;}
        const action=match[2];room.touched=Date.now();
        if(action==='join'&&req.method==='POST'){
          if(room.engine){json(res,409,{error:'roomClosed'});return;}
          if(room.seats.length+room.aiCount>=getSpawnCapacity()){json(res,409,{error:'mapCapacity'});return;}
          const input=await body(req);if(!validateSetup(input?.setup)||input.setup.ai===true){json(res,400,{error:'invalidSetup'});return;}
          // Body parsing yields to other joins/config/start: recheck at mutation time.
          if(room.engine){json(res,409,{error:'roomClosed'});return;}
          if(room.seats.length+room.aiCount>=getSpawnCapacity()){json(res,409,{error:'mapCapacity'});return;}
          const token=randomBytes(24).toString('hex'),id=room.seats.length;room.seats.push({id,setup:{...input.setup,ai:false},token,requests:0,window:Date.now()});json(res,201,{code:room.code,token,actor:id});broadcast(room);return;
        }
        const token=req.headers.authorization?.replace(/^Bearer /,''),seat=room.seats.find(s=>s.token===token);
        if(!seat){json(res,401,{error:'unauthorized'});return;}
        if(Date.now()-seat.window>1000){seat.window=Date.now();seat.requests=0;}if(++seat.requests>30){json(res,429,{error:'rateLimited'});return;}
        if(action==='info'&&req.method==='GET'){json(res,200,info(room));return;}
        if(action==='events'&&req.method==='GET'){
          // One active stream per authenticated seat; reconnect replaces the stale stream.
          room.streams.get(seat.id)?.end();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();room.streams.set(seat.id,res);broadcast(room);snapshot(room,[[seat.id,res]]);
          req.on('close',()=>{if(room.streams.get(seat.id)===res){room.streams.delete(seat.id);broadcast(room);}});return;
        }
        if(action==='config'&&req.method==='POST'){
          if(seat.id!==0){json(res,403,{error:'hostOnly'});return;}
          if(room.engine){json(res,409,{error:'alreadyStarted'});return;}
          const input=await body(req),aiCount=input?.aiCount;
          if(!Number.isSafeInteger(aiCount)||aiCount<0){json(res,400,{error:'invalidAI'});return;}
          if(room.engine){json(res,409,{error:'alreadyStarted'});return;}
          if(room.seats.length+aiCount>getSpawnCapacity()){json(res,409,{error:'mapCapacity'});return;}
          room.aiCount=aiCount;broadcast(room);json(res,200,info(room));return;
        }
        if(action==='start'&&req.method==='POST'){
          if(seat.id!==0){json(res,403,{error:'hostOnly'});return;}
          if(room.engine){json(res,409,{error:'alreadyStarted'});return;}
          if(onlineHumans(room)<2){json(res,409,{error:'needPlayers'});return;}
          if(room.seats.length+room.aiCount>getSpawnCapacity()){json(res,409,{error:'mapCapacity'});return;}
          const setups=[...room.seats.map(s=>s.setup),...makeAISetups(room.aiCount)];
          room.engine=new Engine(createGame(setups,randomBytes(4).readUInt32LE(),`lan-${room.code}`));broadcast(room);snapshot(room);json(res,200,{ok:true});return;
        }
        if(action==='command'&&req.method==='POST'){
          if(!room.engine){json(res,409,{error:'notPlaying'});return;}
          const input=await body(req),result=room.engine.command(seat.id,input?.command);json(res,result.ok?200:400,result);if(result.ok)snapshot(room);return;
        }
        json(res,405,{error:'methodNotAllowed'});return;
      }
      if(url.pathname.startsWith('/api/')){json(res,404,{error:'notFound'});return;}
      if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'methodNotAllowed'});return;}
      const path=resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!path.startsWith(dist+sep)){json(res,403,{error:'forbidden'});return;}
      try{if(!(await stat(path)).isFile())throw new Error();const file=await readFile(path);res.writeHead(200,{'Content-Type':MIME[extname(path)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:file);}catch{json(res,404,{error:'buildMissing',message:'Run npm run build first; or use npm run dev with this LAN server.'});}
    }catch(e){if(!res.headersSent)json(res,400,{error:e instanceof Error?e.message:'invalidRequest'});else res.end();}
  });
  let ticks=0;
  const timer=setInterval(()=>{ticks++;for(const[code,room]of rooms){if(!room.streams.size&&Date.now()-room.touched>30*60*1000){rooms.delete(code);continue;}room.engine?.step();if(ticks%2===0&&room.engine)snapshot(room);else if(ticks%200===0)for(const response of room.streams.values())if(writable(response))response.write(': keepalive\n\n');}},50);
  server.on('close',()=>clearInterval(timer));
  return{server,rooms,close:async()=>{clearInterval(timer);for(const r of rooms.values())for(const s of r.streams.values())s.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT??8787),{server}=createLanServer();
  server.listen(port,'0.0.0.0',()=>console.log(`ROUGE LAN: http://localhost:${port} — trusted LAN only; serve dist after npm run build.`));
}
