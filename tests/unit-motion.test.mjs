import test from 'node:test';
import assert from 'node:assert/strict';
import {UnitMotion,UNIT_INTERPOLATION_DELAY,unitMotionFrameInterval} from '../src/render/unitMotion.ts';
const unit=(x=0,extra={})=>({id:1,owner:0,kind:'infantry',x,z:0,...extra});
const state=(tick,units,campaign='motion')=>({tick,units,campaign});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('100ms authoritative snapshots become uniform intermediate positions without prediction',()=>{
 const motion=new UnitMotion();motion.update(state(0,[unit()]),0);
 const deltas=[];let previous;
 for(let frame=0;frame<=60;frame++){
  const now=frame*1000/60;if(frame%6===0&&frame)motion.update(state(frame/3,[unit(now*.004)]),now);
  const x=motion.position(unit(),now).x;
  close(x,Math.max(0,now-UNIT_INTERPOLATION_DELAY)*.004);
  if(frame>6)deltas.push(x-previous);previous=x;
 }
 close(Math.max(...deltas)-Math.min(...deltas),0);
 close(motion.position(unit(),5000).x,4);assert.equal(motion.activity(5000).active,false);
 // Old strategic rendering had 10 discrete updates/s; the same stream now
 // supplies 60 equally spaced positions/s at useful zoom, with <=100ms delay.
 assert.equal(deltas.length,54);assert.equal(new Set(deltas.map(x=>x.toFixed(8))).size,1);
});
test('sampling is identical across 30/60/144fps, irregular frames and 2x snapshot cadence',()=>{
 const motion=new UnitMotion();for(let i=0;i<=4;i++)motion.update(state(i*2,[unit(i*.4)]),i*50);
 for(const frames of [[200,225,250,275,300],[207,266,300],[200,300]])for(const now of frames)close(motion.position(unit(),now).x,(now-100)*.008);
 close(motion.position(unit(),10000).x,1.6);
});
test('early jittered snapshots retain the older bracketing point, and late packets never extrapolate',()=>{
 const motion=new UnitMotion();motion.update(state(0,[unit()]),0);motion.update(state(2,[unit(.4)]),100);
 close(motion.position(unit(),190).x,.36);motion.update(state(4,[unit(.8)]),190);close(motion.position(unit(),190).x,.36);
 close(motion.position(unit(),245).x,.6);close(motion.position(unit(),310).x,.8);
 motion.update(state(6,[unit(1.2)]),330);close(motion.position(unit(),330).x,.8);
 assert.ok(motion.position(unit(),400).x<=1.2);
});
test('same-tick UI or command snapshots do not restart interpolation',()=>{
 const motion=new UnitMotion();motion.update(state(0,[unit()]),0);motion.update(state(2,[unit(.4)]),100);
 motion.update(state(2,[unit(.4,{hp:20,cooldown:1})]),150);close(motion.position(unit(),175).x,.3);
 close(motion.position(unit(),200).x,.4);assert.equal(motion.activity(200).active,false);
});
test('stationary snapshots, pause/silence and dropped frames finish exactly and stop animating',()=>{
 const motion=new UnitMotion();motion.update(state(0,[unit()]),0);motion.update(state(2,[unit(.4)]),100);
 assert.equal(motion.activity(199).active,true);assert.equal(motion.activity(200).active,false);
 close(motion.position(unit(),200).x,.4);
 motion.update(state(4,[unit(.4)]),200);assert.equal(motion.activity(200).active,false);
 close(motion.position(unit(),20000).x,.4);
});
test('campaign/load rollback, reconnection, teleport, replacement and transport transitions snap',()=>{
 for(const [next,time] of [[state(0,[unit(.8)]),150],[state(4,[unit(.8)],'new'),150],[state(4,[unit(.8)]),1000],[state(4,[unit(30)]),150],[state(9000,[unit(30)]),150],
   [state(4,[unit(.8,{kind:'cavalry'})]),150],[state(4,[unit(.8,{owner:2})]),150],[state(4,[unit(.8,{transport:{embarked:true}})]),150],[state(2,[unit(.8)]),150]]){
  const motion=new UnitMotion();motion.update(state(0,[unit()]),0);motion.update(state(2,[unit(.4)]),100);motion.update(next,time);
  close(motion.position(unit(),time).x,next.units[0].x);assert.equal(motion.activity(time).active,false);
 }
});
test('dead units are removed immediately and reused IDs do not inherit a ghost trail',()=>{
 const motion=new UnitMotion();motion.update(state(0,[unit()]),0);motion.update(state(2,[unit(.4)]),100);motion.update(state(3,[]),150);
 assert.equal(motion.activity(150).active,false);assert.equal(motion.tracks.size,0);
 motion.update(state(4,[unit(8)]),200);close(motion.position(unit(),200).x,8);
});
test('unsafe snapshot chords snap without sampling inside the obstacle, guards run once per changed segment',()=>{
 let calls=0;const motion=new UnitMotion(()=>{calls++;return false;});motion.update(state(0,[unit()]),0);motion.update(state(2,[unit(.4)]),100);
 for(let t=100;t<300;t+=5)close(motion.position(unit(),t).x,.4);
 motion.update(state(4,[unit(.4)]),200);assert.equal(calls,1);
});
test('authoritative data stays immutable, and interpolation history remains bounded while hidden',()=>{
 const motion=new UnitMotion();for(let tick=0;tick<1000;tick++){
  const u=Object.freeze(unit(tick*.001)),s=Object.freeze(state(tick,Object.freeze([u])));motion.update(s,tick);motion.position(u,tick+50);assert.equal(u.x,tick*.001);
 }
 assert.ok(motion.tracks.get(1).samples.length<=16);
});
test('2D and 3D movement use up to 60fps while subpixel whole-world movement stays economical',()=>{
 for(const distance of [10,90,205,320])close(unitMotionFrameInterval(.01,distance,960),1000/60);
 close(unitMotionFrameInterval(.0024,2400,960),100);
 assert.ok(unitMotionFrameInterval(.004,400,960)<100);
});
test('offscreen armies do not keep a stationary close-up animating',()=>{
 const motion=new UnitMotion();motion.update(state(0,[unit()]),0);motion.update(state(2,[unit(.4)]),100);
 assert.equal(motion.activity(150,new Set()).active,false);assert.equal(motion.activity(150,new Set([1])).active,true);
});

test('motion activity uses only the requested visible armies and tolerates stale visible IDs',()=>{
 const motion=new UnitMotion();motion.update(state(0,[unit(),unit(4,{id:2})]),0);motion.update(state(2,[unit(.1),unit(5,{id:2})]),100);
 close(motion.activity(150).speed,.01);close(motion.activity(150,new Set([1,999])).speed,.001);
 assert.deepEqual(motion.activity(150,new Set([999])),{active:false,speed:0});assert.equal(motion.activity(200,new Set([1,2])).active,false);
});
