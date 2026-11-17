import test from 'node:test';
import assert from 'node:assert/strict';
import {infantryPose} from '../src/render/infantryIdle.ts';

test('every stationary soldier selects exactly the fixed attention frame regardless of unit ID',()=>{
 for(const id of [1,7,1024]){
  assert.deepEqual(infantryPose(0,Infinity,id,24,25,15,40),{mode:'idle',frame:40});
  assert.deepEqual(infantryPose(0,800,id,24,25,15,40),{mode:'idle',frame:40});
 }
});

test('active fire then walk override attention without changing either clip index',()=>{
 const pose=(move,shot)=>infantryPose(move,shot,7,24,25,15,40);
 assert.deepEqual(pose(50,Infinity),{mode:'walk',frame:5});
 assert.deepEqual(pose(50,200),{mode:'shoot',frame:29});
 assert.deepEqual(pose(50,600),{mode:'walk',frame:5});
 assert.deepEqual(pose(0,600),{mode:'idle',frame:40});
});
