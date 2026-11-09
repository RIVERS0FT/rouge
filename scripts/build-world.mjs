/** Offline management-region atlas. Runtime never downloads game or GIS assets. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),output=new URL('src/generated/world.json',root);
const expected='854f3b999cce9a0a7f85968cfe0ec95d4c4cb52a8e9c9bb5c5ef8c17b86b8449';
const raw=gunzipSync(await readFile(new URL('data/state-regions-1.13.7.json.gz',root)));
if(createHash('sha256').update(raw).digest('hex')!==expected)throw new Error('Management-region atlas checksum mismatch');
const atlas=JSON.parse(raw);
if(atlas.format!==3||atlas.provinces.length!==675||!atlas.landRegionsOnly)throw new Error('Invalid management-region atlas');
await mkdir(new URL('src/generated/',root),{recursive:true});
let old;try{old=await readFile(output);}catch{}
if(!old?.equals(raw))await writeFile(output,raw);
console.log('Management atlas: 675 land state regions; 106 sea regions excluded; no country layer.');
