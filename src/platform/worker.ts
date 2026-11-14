import { Engine } from '../game/engine.ts';
import { validateState } from '../game/save.ts';
import {encodeFrame,type SnapshotBase} from './replication.ts';
let engine:Engine|null=null,paused=false,speed=1;
let base:SnapshotBase|undefined;
const publish=()=>{if(!engine)return;const next=encodeFrame(engine.state,base,0,true);self.postMessage(next.frame);base=next.base;};
self.onmessage=(event:MessageEvent)=>{
  const m=event.data;
  if(m.type==='init'){
    if(!validateState(m.state)){engine=null;base=undefined;self.postMessage({type:'error',error:'invalidSave'});return;}
    engine=new Engine(m.state);base=undefined;paused=false;publish();
  }
  else if(m.type==='command'&&engine){const result=engine.command(0,m.command);self.postMessage({type:'result',result});publish();}
  else if(m.type==='pause')paused=Boolean(m.value);
  else if(m.type==='speed')speed=m.value===2?2:1;
};
setInterval(()=>{if(!engine||paused||engine.state.winner!==null)return;engine.step(speed);if(engine.state.tick%2===0)publish();},50);

// Module imports and the message handler are ready before the parent sends init.
self.postMessage({type:'ready'});
