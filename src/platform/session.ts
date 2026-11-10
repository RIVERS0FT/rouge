import {createLocalSession} from './localSession.ts';
import type { Flag } from '../game/flags.ts';
import { applyFrame } from './replication.ts';
import { MAP_ID, RULES_ID } from '../game/content.ts';
import type { Command, GameState, Result, PlayerSetup } from '../game/types.ts';
export interface Seat {id:number;name:string;flag?:Flag;leader:string;loadout:string[]}
export interface RoomInfo {code:string;host:number;started:boolean;aiCount:number;seats:Seat[]}
export interface Ticket {code:string;token:string;actor:number}
export interface Session {
  mode:'solo'|'lan'; actor:number;
  command(command:Command):void;
  dispose():void;
  pause?(value:boolean):void;
  speed?(value:number):void;
}
export function localSession(state:GameState,onState:(state:GameState)=>void,onResult:(result:Result)=>void):Session{
  const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  return createLocalSession(worker,state,onState,onResult);
}
export async function api(path:string,body?:unknown,token?:string):Promise<any>{
  const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:{'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  let data;try{data=await response.json();}catch{throw new Error('serverOffline');}
  if(!response.ok)throw new Error(data.error??'networkError');return data;
}
export async function createRoom(setup:PlayerSetup,aiCount=0):Promise<Ticket>{return api('/rooms',{setup,aiCount});}
export async function configureRoom(ticket:Ticket,aiCount:number):Promise<RoomInfo>{return api(`/rooms/${ticket.code}/config`,{aiCount},ticket.token);}
export async function joinRoom(code:string,setup:PlayerSetup):Promise<Ticket>{return api(`/rooms/${code.toUpperCase()}/join`,{setup});}
export function remoteSession(ticket:Ticket,onState:(s:GameState)=>void,onRoom:(r:RoomInfo)=>void,onStatus:(s:'connected'|'reconnecting')=>void,onResult:(r:Result)=>void):Session{
  let closed=false,current:GameState|null=null;const controller=new AbortController();let retry:ReturnType<typeof setTimeout>|undefined;
  async function connect(){
    try{
      const response=await fetch(`/api/rooms/${ticket.code}/events`,{headers:{Authorization:`Bearer ${ticket.token}`,'X-Rouge-Map':MAP_ID,'X-Rouge-Rules':RULES_ID},signal:controller.signal});
      if(!response.ok){
        const error=await response.json().catch(()=>({error:'connectionLost'}));
        if(error.error==='incompatibleRules'||error.error==='incompatibleMap'){
          closed=true;onResult({ok:false,error:error.error});return;
        }
        throw new Error('connectionLost');
      }
      if(!response.body)throw new Error('connectionLost');
      const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';onStatus('connected');
      while(!closed){const{done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end:number;
        while((end=buffer.indexOf('\n\n'))>=0){const chunk=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=chunk.split('\n').find(l=>l.startsWith('data: '));if(line){const event=JSON.parse(line.slice(6));if(event.type==='state'||event.type==='delta'){current=applyFrame(current,event);onState(current);}else if(event.type==='room')onRoom(event.room);}}
      }
    }catch{ /* Retry only while this session still owns the connection. */ }
    if(!closed){onStatus('reconnecting');retry=setTimeout(connect,2000);}
  }
  void connect();
  return{mode:'lan',actor:ticket.actor,command:command=>{api(`/rooms/${ticket.code}/command`,{command},ticket.token).then(onResult).catch(e=>onResult({ok:false,error:e.message}));},dispose:()=>{closed=true;controller.abort();if(retry)clearTimeout(retry);}};
}
export const PLATFORM_CAPABILITIES={solo:true,lan:true,steam:false,epic:false} as const;
