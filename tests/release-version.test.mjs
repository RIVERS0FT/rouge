import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {VERSION} from '../src/game/content.ts';

const readJson=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));

test('release version is exactly three counters and npm metadata matches',()=>{
 const pkg=readJson('package.json'),lock=readJson('package-lock.json');
 assert.match(pkg.version,/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
 assert.equal(VERSION,pkg.version);
 assert.equal(lock.version,pkg.version);
 assert.equal(lock.packages[''].version,pkg.version);
});
