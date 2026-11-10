import { Engine } from '../game/engine.ts';
import { validateState } from '../game/save.ts';
let engine:Engine|null=null,paused=false,speed=1;
self.onmessage=(event:MessageEvent)=>{
  const m=event.data;
  if(m.type==='init'){
    if(!validateState(m.state)){engine=null;self.postMessage({type:'error',error:'invalidSave'});return;}
    engine=new Engine(m.state);paused=false;self.postMessage({type:'state',state:engine.state});
  }
  else if(m.type==='command'&&engine){const result=engine.command(0,m.command);self.postMessage({type:'result',result});self.postMessage({type:'state',state:engine.state});}
  else if(m.type==='pause')paused=Boolean(m.value);
  else if(m.type==='speed')speed=m.value===2?2:1;
};
setInterval(()=>{if(!engine||paused||engine.state.winner!==null)return;engine.step(speed);if(engine.state.tick%2===0)self.postMessage({type:'state',state:engine.state});},50);

// Module imports and the message handler are ready before the parent sends init.
self.postMessage({type:'ready'});
