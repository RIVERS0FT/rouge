import test from 'node:test';
import assert from 'node:assert/strict';
import {MapInputController} from '../src/render/mapInput.ts';
test('semantic map actions are disabled in menus and dialogs, restored for game context',()=>{
 const received=[],input=new MapInputController(a=>received.push(a));
 const actions=[{type:'pan',x:12,z:-4},{type:'zoom',distance:100},{type:'select',region:4,attack:false}];
 for(const a of actions)assert.equal(input.dispatch(a),false);
 input.setContext('game');for(const a of actions)assert.equal(input.dispatch(a),true);assert.deepEqual(received,actions);
 input.setContext('blocked');for(const a of actions)assert.equal(input.dispatch(a),false);assert.equal(received.length,3);
 input.setContext('game');assert.equal(input.dispatch({type:'select',region:4,attack:true}),true);
});
test('device-independent action boundary rejects invalid motion and selection',()=>{
 const input=new MapInputController(()=>assert.fail('invalid action emitted'));input.setContext('game');
 for(const a of [{type:'pan',x:NaN,z:0},{type:'pan',x:0,z:Infinity},{type:'zoom',distance:0},{type:'zoom',distance:NaN},{type:'select',region:-1,attack:false}])assert.equal(input.dispatch(a),false);
});
