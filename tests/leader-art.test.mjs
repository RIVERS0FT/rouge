import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('every cosmetic leader has a distinct transparent locally bundled portrait',()=>{
  const images=['warden','vanguard','steward'].map(leader=>readFileSync(new URL(`../src/assets/leaders/${leader}.webp`,import.meta.url)));
  for(const data of images){
    assert.equal(data.toString('ascii',0,4),'RIFF');
    assert.equal(data.toString('ascii',8,12),'WEBP');
    assert.equal(data.toString('ascii',12,16),'VP8X');
    assert.ok(data[20]&0x10,'portrait must retain its alpha channel');
    assert.equal(data.readUIntLE(24,3)+1,720);
    assert.equal(data.readUIntLE(27,3)+1,900);
    assert.ok(data.length<150_000,'mobile asset budget');
  }
  assert.equal(new Set(images.map(data=>data.toString('base64'))).size,3);
});
