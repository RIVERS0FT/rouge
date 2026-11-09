import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {selectSource,isCurrentMain}=createRequire(import.meta.url)('../.github/scripts/pages-source.cjs');
function fixture() {
  const repository='RIVERS0FT/rouge', sha='a'.repeat(40);
  const run={name:'Prototype checks',status:'completed',conclusion:'success',event:'push',head_branch:'main',head_repository:{full_name:repository},head_sha:sha,workflow_id:12};
  const context={repo:{owner:'RIVERS0FT',repo:'rouge'},eventName:'workflow_run',ref:'refs/heads/main',payload:{repository:{full_name:repository},workflow_run:run}};
  const state={sha,parents:[{}],path:'.github/workflows/ci.yml',pulls:[{merged_at:'2026-01-01',merge_commit_sha:sha,base:{ref:'main',repo:{full_name:repository}}}],runs:[run]};
  const listPullRequestsAssociatedWithCommit=()=>{},listWorkflowRuns=()=>{};
  const github={rest:{repos:{getCommit:async()=>({data:{sha:state.sha,parents:state.parents}}),listPullRequestsAssociatedWithCommit},actions:{getWorkflow:async()=>({data:{path:state.path}}),listWorkflowRuns}},paginate:async endpoint=>endpoint===listWorkflowRuns?state.runs:state.pulls};
  return {github,context,state,run,sha};
}
test('Pages authorizes exact current squash PR SHA after main push CI',async()=>{
 const f=fixture();assert.equal(await selectSource(f),f.sha);
});
for(const [key,value] of Object.entries({name:'Other checks',status:'in_progress',conclusion:'failure',event:'pull_request',head_branch:'feat/test',head_repository:{full_name:'other/rouge'},head_sha:'b'.repeat(40)})) {
 test(`Pages rejects wrong run ${key}`,async()=>{const f=fixture();f.run[key]=value;assert.equal(await selectSource(f),null);});
}
test('Pages rejects wrong repository, workflow, non-PR pushes, merge commits and PR destinations',async()=>{
 for(const mutate of [f=>f.context.payload.repository.full_name='other/rouge',f=>f.state.path='.github/workflows/other.yml',f=>f.state.pulls=[],f=>f.state.parents=[{},{}],f=>f.state.pulls[0].merged_at=null,f=>f.state.pulls[0].merge_commit_sha='old',f=>f.state.pulls[0].base.ref='dev',f=>f.state.pulls[0].base.repo.full_name='other/rouge']) {
  const f=fixture();mutate(f);assert.equal(await selectSource(f),null);
 }
});
test('Pages main freshness guard skips an advanced main',async()=>{
 const f=fixture();assert.equal(await isCurrentMain(f),true);f.state.sha='new';assert.equal(await isCurrentMain(f),false);
});
test('manual Pages resolves only tested current main and rejects alternate workflow refs',async()=>{
 const f=fixture();f.context.eventName='workflow_dispatch';assert.equal(await selectSource(f),f.sha);
 f.context.ref='refs/heads/feature';await assert.rejects(selectSource(f),/must run from main/);
 f.context.ref='refs/heads/main';f.state.runs=[];await assert.rejects(selectSource(f),/no successful push CI/);
});
test('workflow serializes whole release, pins source and guards deployment',()=>{
 const y=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 assert.match(y,/workflow_run:/);assert.doesNotMatch(y,/game_ref|174af461|pull_request_target/);
 assert.match(y,/group: github-pages\n  cancel-in-progress: false/);
 assert.match(y,/ref: \$\{\{ needs.source.outputs.sha \}\}/);
 assert.match(y,/if: steps.current.outputs.current == 'true'/);
 assert.match(y,/if: needs.deploy.outputs.deployed == 'true'/);
});
