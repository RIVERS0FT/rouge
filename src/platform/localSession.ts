import type {Command,GameState,Result} from '../game/types.ts';
import type {Session} from './session.ts';
/** Keep controls ordered while the module worker loads its terrain atlas. The
 * first authoritative state, not construction of Worker, marks a usable game. */
export function createLocalSession(worker:Pick<Worker,'onmessage'|'onerror'|'onmessageerror'|'postMessage'|'terminate'>,state:GameState,onState:(state:GameState)=>void,onResult:(result:Result)=>void):Session{
 let closed=false,initializing=false,initialized=false;
 const pending:unknown[]=[];
 const dispose=()=>{if(closed)return;closed=true;pending.length=0;worker.terminate();};
 const fail=(error='workerFailed')=>{if(closed)return;dispose();onResult({ok:false,error});};
 const send=(message:unknown)=>{if(closed)return;if(initialized)worker.postMessage(message);else pending.push(message);};
 worker.onmessage=({data})=>{
  if(closed)return;
  if(data.type==='ready'){
   if(!initializing){initializing=true;worker.postMessage({type:'init',state});}
  }else if(data.type==='state'){
   if(!initializing)return;
   initialized=true;onState(data.state);
   while(pending.length&&!closed)worker.postMessage(pending.shift());
  }else if(data.type==='result')onResult(data.result);
  else if(data.type==='error')fail(data.error);
 };
 worker.onerror=()=>fail();worker.onmessageerror=()=>fail();
 return{mode:'solo',actor:0,command:(command:Command)=>send({type:'command',command}),pause:value=>send({type:'pause',value}),speed:value=>send({type:'speed',value}),dispose};
}
