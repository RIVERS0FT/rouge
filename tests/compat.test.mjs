import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {installRandomUUID} from '../src/platform/browserCompat.ts';

test('HTTP LAN UUID fallback uses getRandomValues and produces version-4 IDs',()=>{
  const target={getRandomValues:array=>webcrypto.getRandomValues(array)};
  installRandomUUID(target);
  const ids=Array.from({length:100},()=>target.randomUUID());
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(ids).size,100);
});
test('native randomUUID implementation is preserved',()=>{
  const native=()=> 'native',target={randomUUID:native};
  installRandomUUID(target);
  assert.equal(target.randomUUID,native);
});
