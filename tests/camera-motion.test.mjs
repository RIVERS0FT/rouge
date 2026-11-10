import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceCameraDistance} from '../src/render/cameraMotion.ts';

const animate=(start,target,frames)=>frames.reduce((distance,elapsed)=>advanceCameraDistance(distance,target,elapsed),start);
test('camera easing covers the same distance at high, low and irregular frame rates',()=>{
 for(const [start,target] of [[16,2178.5907550892034],[2178.5907550892034,16]]){
  const expected=target+(start-target)*Math.exp(-9*.6);
  for(const frames of [Array(36).fill(1/60),Array(6).fill(.1),Array(2).fill(.3),[.04,.36,.2]]){
   assert.ok(Math.abs(animate(start,target,frames)-expected)<1e-9);
  }
 }
});
test('slow software-rendered return to the world settles by wall time, not frame count',()=>{
 const target=2178.5907550892034;
 for(const frames of [[.5,.5,.5],[2],[.1,.7,.7]])assert.equal(animate(16,target,frames),target);
});
test('a new target after a long stationary interval still eases instead of snapping',()=>{
 const fresh=advanceCameraDistance(2178,16,.1,true);
 assert.equal(advanceCameraDistance(2178,16,60,true),fresh);
 assert.ok(fresh>16&&fresh<2178);
 assert.equal(advanceCameraDistance(fresh,16,2),16);
});
test('retargeting, zero elapsed time and invalid elapsed time never overshoot',()=>{
 const outward=advanceCameraDistance(16,2178,.2),inward=advanceCameraDistance(outward,5,5,true);
 assert.ok(inward>5&&inward<outward);
 for(const dt of [0,-1,NaN,Infinity])assert.equal(advanceCameraDistance(16,2178,dt),16);
 assert.equal(advanceCameraDistance(16,16,10),16);
 assert.equal(advanceCameraDistance(16.005,16,0),16);
});
