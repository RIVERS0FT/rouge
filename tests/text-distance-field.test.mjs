import test from 'node:test';
import assert from 'node:assert/strict';
import {textDistanceField} from '../src/render/textDistanceField.ts';

test('distance text preserves inside/outside, holes and Euclidean edge distances',()=>{
 const width=25,height=25,alpha=new Uint8Array(width*height);
 for(let y=5;y<20;y++)for(let x=5;x<20;x++)alpha[y*width+x]=255;
 alpha[12*width+12]=0;
 const sdf=textDistanceField(alpha,width,height);
 assert.ok(sdf[8*width+8]>128);assert.ok(sdf[12*width+12]<128);
 assert.ok(sdf[4*width+4]<sdf[4*width+5]);
 assert.ok(sdf[0]<sdf[4*width+4]);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)assert.equal(sdf[y*width+x],sdf[x*width+y]);
 assert.deepEqual(alpha.slice(0,5),new Uint8Array(5));
});

test('empty, solid and antialiased text masks stay finite and retain coverage',()=>{
 assert.ok(textDistanceField(new Uint8Array(16),4,4).every(v=>v===0));
 assert.ok(textDistanceField(new Uint8Array(16).fill(255),4,4).every(v=>v===255));
 const mask=new Uint8Array([0,64,127,128,192,255]),sdf=textDistanceField(mask,6,1);
 for(let i=1;i<sdf.length;i++)assert.ok(sdf[i]>=sdf[i-1]);
 assert.ok(sdf[1]<128);assert.ok(sdf[4]>128);assert.ok(Math.abs(sdf[2]-sdf[3])<=1);
 assert.throws(()=>textDistanceField(mask,3,3),/invalidTextMask/);
});
