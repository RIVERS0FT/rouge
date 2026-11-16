import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LAND_Y,heightAt} from '../src/game/mapHeight.ts';

test('land height has no spatial relief, including wrapped map copies',()=>{
 assert.equal(LAND_Y,.16);
 for(const x of [-12000,-3240,-1800,-1,0,1,1234,3240,12000])for(const z of [-2000,-89,0,89,2000])assert.equal(heightAt(x,z),LAND_Y);
});

test('render geometry and picking use the flat datum while camera tilt and shading remain',()=>{
 const renderer=readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/render/selectionGlow.worker.ts',import.meta.url),'utf8');
 const surface=readFileSync(new URL('../src/render/mapSurface.ts',import.meta.url),'utf8');
 assert.match(renderer,/positions\.push\(p\.x,LAND_Y,p\.z\)/);
 assert.match(renderer,/plane=new THREE\.Plane\(new THREE\.Vector3\(0,1,0\),-LAND_Y\)/);
 assert.match(surface,/plane=new THREE\.Plane\(new THREE\.Vector3\(0,1,0\),-LAND_Y\)/);
 assert.match(renderer,/z=pos\.z,y=LAND_Y/,'3D units stay grounded');
 assert.match(renderer,/projected\.set\(v\.x\+shift,LAND_Y,v\.z\)/,'Drag destination borders align with land');
 assert.doesNotMatch(renderer+worker,/landRelief|heightAt|transformed\.y \+=|sin\(position|sin\(\$\{endpoint\}|relief:\.32/);
 assert.match(renderer,/const angle=this\.blend\*0\.6/,'Camera tilt stays enabled');
 assert.match(renderer,/this\.mapSurface=new MapSurface/,'Shaded-relief color surface stays installed');
 assert.match(renderer,/shader\.uniforms\.uRelief=this\.blendUniform/,'Political near-view tint is retained');
});
