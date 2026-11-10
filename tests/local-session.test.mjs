import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSession} from '../src/platform/localSession.ts';
class WorkerStub {
 onmessage=null;onerror=null;onmessageerror=null;messages=[];terminated=false;
 postMessage(message){this.messages.push(structuredClone(message));}
 terminate(){this.terminated=true;}
 receive(data){this.onmessage({data});}
}
function fixture(){const worker=new WorkerStub(),states=[],results=[],state={tick:0};return{worker,states,results,state,session:createLocalSession(worker,state,s=>states.push(s),r=>results.push(r))};}
test('delayed module startup waits for ready and authoritative init before delivering controls',()=>{
 const {worker,states,state,session}=fixture();
 session.pause(true);session.speed(2);session.command({type:'upgrade',kind:'infantry',stat:'attack'});
 assert.deepEqual(worker.messages,[]);assert.deepEqual(states,[]);
 worker.receive({type:'ready'});assert.deepEqual(worker.messages,[{type:'init',state}]);
 worker.receive({type:'ready'});assert.equal(worker.messages.length,1);
 worker.receive({type:'state',state:{tick:0,initialized:true}});
 assert.deepEqual(states,[{tick:0,initialized:true}]);
 assert.deepEqual(worker.messages.slice(1),[{type:'pause',value:true},{type:'speed',value:2},{type:'command',command:{type:'upgrade',kind:'infantry',stat:'attack'}}]);
 worker.receive({type:'state',state:{tick:2}});assert.equal(worker.messages.length,4);
 session.pause(false);assert.deepEqual(worker.messages.at(-1),{type:'pause',value:false});
});
test('invalid initialization reports a failure and drops pending commands',()=>{
 const {worker,session,results,states}=fixture();session.command({type:'reroll'});
 worker.receive({type:'ready'});worker.receive({type:'error',error:'invalidSave'});
 assert.deepEqual(results,[{ok:false,error:'invalidSave'}]);assert.equal(worker.terminated,true);
 worker.receive({type:'state',state:{tick:2}});session.pause(false);
 assert.deepEqual(states,[]);assert.equal(worker.messages.length,1);
});
test('canceled startup cannot update a newer campaign or emit queued commands',()=>{
 const {worker,session,states,results}=fixture();session.command({type:'reroll'});session.dispose();
 worker.receive({type:'ready'});worker.receive({type:'state',state:{tick:10}});worker.onerror();
 assert.equal(worker.terminated,true);assert.deepEqual(worker.messages,[]);assert.deepEqual(states,[]);assert.deepEqual(results,[]);
});
for(const event of ['onerror','onmessageerror'])test(`${event} reports worker failure once`,()=>{
 const {worker,results}=fixture();worker[event]();worker[event]();
 assert.deepEqual(results,[{ok:false,error:'workerFailed'}]);assert.equal(worker.terminated,true);
});
