import test from 'node:test';
import assert from 'node:assert/strict';
import {project, WORLD_WIDTH, viewPickX} from '../src/game/geo.ts';
import {MAP, provinceAt} from '../src/game/map.ts';

test('global padding cannot select undrawn atlas copies; free panning resolves the same ID',()=>{
  const p=project(118,32),id=provinceAt(p.x,p.z);
  assert.ok(id>=0);
  for(const shift of [-WORLD_WIDTH,0,WORLD_WIDTH]){
    assert.equal(provinceAt(viewPickX(p.x+shift,true),p.z),shift===0?id:-1);
    assert.equal(provinceAt(viewPickX(p.x+shift,false),p.z),id);
  }
  assert.ok(MAP[id].visible);
});
