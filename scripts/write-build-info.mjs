import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.writeFileSync('dist/build-info.json',JSON.stringify({version,sourceCommit,profile:'github-pages',base:'/rouge/',singlePlayer:true,lan:false},null,2)+'\n');
fs.writeFileSync('dist/.nojekyll','');
