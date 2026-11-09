import test from 'node:test';
import assert from 'node:assert/strict';
import {InputDeviceTracker} from '../src/ui/inputDevice.ts';
test('hybrid device hints follow actual touch, mouse and keyboard intent regardless of viewport',()=>{
 const input=new InputDeviceTracker();assert.equal(input.device,'mouse');
 assert.equal(input.pointer({pointerType:'touch'},100),'touch');
 assert.equal(input.pointer({pointerType:'mouse'},200),'touch');
 assert.equal(input.pointer({pointerType:'mouse',sourceCapabilities:{firesTouchEvents:true}},1500),'touch');
 assert.equal(input.pointer({pointerType:'mouse'},1501),'mouse');
 assert.equal(input.pointer({pointerType:'pen'},1600),'touch');
 assert.equal(input.key('Shift'),'touch');assert.equal(input.key('a',true),'touch');assert.equal(input.key('ArrowLeft'),'mouse');
 assert.equal(input.pointer({pointerType:'touch'},1800),'touch');
 assert.equal(input.pointer({pointerType:'mouse'},2599),'touch');assert.equal(input.pointer({pointerType:'mouse'},2600),'mouse');
});
