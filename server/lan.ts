import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine, createGame } from '../src/game/engine.ts';
import { validateSetup, LEADERS } from '../src/game/content.ts';
import type { PlayerSetup } from '../src/game/types.ts';
interface Seat {id:number;setup:PlayerSetup;token:string;requests:number;window:number}
interface Room {code:string;seats:Seat[];engine:Engine|null;streams:Map<number,ServerResponse>;touched:number}
const MIME:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
export function createLanServer(options:{dist?:string;maxRooms?:number}={}){
  const rooms=new Map<string,Room>(),dist=resolve(options.dist??fileURLToPath(new URL('../dist',import.meta.url)));
  const info=(r:Room)=>({code:r.code,host:0,started:Boolean(r.engine),seats:r.seats.map(s=>({id:s.id,name:s.setup.name,leader:s.setup.leader,loadout:s.setup.loadout}))});
  function json(res:ServerResponse,status:number,data:unknown){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  function emit(res:ServerResponse,event:unknown){if(!res.destroyed&&res.writableLength<1_000_000)res.write(`data: ${JSON.stringify(event)}\n\n`);else res.destroy();}
  function broadcast(room:Room){for(const res of room.streams.values())emit(res,{type:'room',room:info(room)});}
  function snapshot(room:Room){if(!room.engine)return;for(const[actor,res]of room.streams){const state=structuredClone(room.engine.state);for(const p of state.players)if(p.id!==actor)p.choices=[];emit(res,{type:'state',state});}}
  async function body(req:IncomingMessage):Promise<any>{let text='';for await(const chunk of req){text+=chunk.toString();if(text.length>8192)throw new Error('tooLarge');}try{return JSON.parse(text);}catch{throw new Error('invalidJson');}}
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`);
    try{
      // Same-origin only: the server also serves the built game. No permissive CORS.
      if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host){json(res,403,{error:'originDenied'});return;}}
      if(url.pathname==='/api/health'){json(res,200,{ok:true,version:'0.2.0'});return;}
      if(req.method==='POST'&&url.pathname==='/api/rooms'){
        if(rooms.size>=(options.maxRooms??16)){json(res,503,{error:'serverFull'});return;}
        const input=await body(req);if(!validateSetup(input?.setup)){json(res,400,{error:'invalidSetup'});return;}
        let code:string;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
        const token=randomBytes(24).toString('hex'),room:Room={code,seats:[{id:0,setup:{...input.setup,ai:false},token,requests:0,window:Date.now()}],engine:null,streams:new Map(),touched:Date.now()};rooms.set(code,room);
        json(res,201,{code,token,actor:0});return;
      }
      const match=url.pathname.match(/^\/api\/rooms\/([A-F0-9]{6})\/(join|events|start|command|info)$/);
      if(match){
        const room=rooms.get(match[1]);if(!room){json(res,404,{error:'roomMissing'});return;}
        const action=match[2];room.touched=Date.now();
        if(action==='join'&&req.method==='POST'){
          if(room.engine||room.seats.length>=4){json(res,409,{error:'roomClosed'});return;}
          const input=await body(req);if(!validateSetup(input?.setup)){json(res,400,{error:'invalidSetup'});return;}
          const token=randomBytes(24).toString('hex'),id=room.seats.length;room.seats.push({id,setup:{...input.setup,ai:false},token,requests:0,window:Date.now()});json(res,201,{code:room.code,token,actor:id});broadcast(room);return;
        }
        const token=req.headers.authorization?.replace(/^Bearer /,''),seat=room.seats.find(s=>s.token===token);
        if(!seat){json(res,401,{error:'unauthorized'});return;}
        if(Date.now()-seat.window>1000){seat.window=Date.now();seat.requests=0;}if(++seat.requests>30){json(res,429,{error:'rateLimited'});return;}
        if(action==='info'&&req.method==='GET'){json(res,200,info(room));return;}
        if(action==='events'&&req.method==='GET'){
          // One active stream per authenticated seat; reconnect replaces the stale stream.
          room.streams.get(seat.id)?.end();res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();room.streams.set(seat.id,res);emit(res,{type:'room',room:info(room)});snapshot(room);
          req.on('close',()=>{if(room.streams.get(seat.id)===res)room.streams.delete(seat.id);});return;
        }
        if(action==='start'&&req.method==='POST'){
          if(seat.id!==0){json(res,403,{error:'hostOnly'});return;}
          if(room.engine){json(res,409,{error:'alreadyStarted'});return;}
          if(room.seats.length<2){json(res,409,{error:'needPlayers'});return;}
          const setups=room.seats.map(s=>s.setup);
          room.engine=new Engine(createGame(setups,randomBytes(4).readUInt32LE(),`lan-${room.code}`));broadcast(room);snapshot(room);json(res,200,{ok:true});return;
        }
        if(action==='command'&&req.method==='POST'){
          if(!room.engine){json(res,409,{error:'notPlaying'});return;}
          const input=await body(req),result=room.engine.command(seat.id,input?.command);json(res,result.ok?200:400,result);return;
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
  const timer=setInterval(()=>{ticks++;for(const[code,room]of rooms){if(!room.streams.size&&Date.now()-room.touched>30*60*1000){rooms.delete(code);continue;}room.engine?.step();if(ticks%2===0&&room.engine)snapshot(room);else if(ticks%200===0)for(const response of room.streams.values())response.write(': keepalive\n\n');}},50);
  server.on('close',()=>clearInterval(timer));
  return{server,rooms,close:async()=>{clearInterval(timer);for(const r of rooms.values())for(const s of r.streams.values())s.end();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT??8787),{server}=createLanServer();
  server.listen(port,'0.0.0.0',()=>console.log(`ROUGE LAN: http://localhost:${port} — trusted LAN only; serve dist after npm run build.`));
}
