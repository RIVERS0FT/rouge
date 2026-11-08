import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {skipReason,deleteWithLease} from './cleanup-merged-branches.mjs';
const repo='RIVERS0FT/rouge', sha='a'.repeat(40);
const pr={state:'closed',merged_at:'2026-11-09T00:00:00Z',head:{ref:'feat/example',sha,repo:{full_name:repo}},base:{ref:'main'}};
const branch={protected:false,commit:{sha}};
const reason=(p=pr,b=branch,open=[])=>skipReason(p,b,open,repo,'main');
test('merged unchanged head is eligible',()=>assert.equal(reason(),null));
test('closed without merge and open PR are retained',()=>{assert.equal(reason({...pr,merged_at:null}),'not-merged');assert.equal(reason({...pr,state:'open'}),'not-merged');});
test('fork branches are retained',()=>assert.equal(reason({...pr,head:{...pr.head,repo:{full_name:'other/rouge'}}}),'foreign-repository'));
test('default and long-lived branches are retained',()=>{for(const ref of ['main','master','develop','dev','gh-pages','release/v1']) assert.equal(reason({...pr,head:{...pr.head,ref}}),'long-lived-branch');});
test('protected and removed branches are skipped',()=>{assert.equal(reason(pr,{...branch,protected:true}),'protected');assert.equal(reason(pr,null),'already-deleted');});
test('new commits after merge are never discarded',()=>assert.equal(reason(pr,{...branch,commit:{sha:'b'.repeat(40)}}),'new-commits-after-merge'));
test('open PR head and stacked PR base dependencies retained',()=>{assert.equal(reason(pr,branch,[{head:pr.head,base:{ref:'main'}}]),'open-pr-dependency');assert.equal(reason(pr,branch,[{base:{ref:pr.head.ref}}]),'open-pr-dependency');});
test('git lease prevents a concurrent push from being deleted',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lease-test-')), remote=path.join(dir,'remote.git'), work=path.join(dir,'work');
 const git=(args,cwd=dir)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try {
  git(['init','--bare',remote]);git(['init',work]);git(['config','user.name','Cleanup Test'],work);git(['config','user.email','test@localhost'],work);
  git(['commit','--allow-empty','-m','first'],work);const old=git(['rev-parse','HEAD'],work);
  git(['push',remote,'HEAD:refs/heads/feat/test'],work);
  git(['commit','--allow-empty','-m','new unmerged change'],work);const next=git(['rev-parse','HEAD'],work);
  git(['push',remote,'HEAD:refs/heads/feat/test'],work);
  assert.throws(()=>deleteWithLease(remote,'feat/test',old,work),/Lease deletion rejected/);
  assert.equal(git(['ls-remote','--heads',remote,'feat/test']).startsWith(next),true);
  deleteWithLease(remote,'feat/test',next,work);assert.equal(git(['ls-remote','--heads',remote,'feat/test']),'');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
