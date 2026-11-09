import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const {selectSource,isCurrentMain}=createRequire(import.meta.url)('../.github/scripts/pages-source.cjs');
function fixture() {
 const repository='RIVERS0FT/rouge',sha='a'.repeat(40);
 const context={repo:{owner:'RIVERS0FT',repo:'rouge'},eventName:'push',ref:'refs/heads/main',sha,payload:{repository:{full_name:repository},after:sha,deleted:false}};
 const state={sha,parents:[{}],pulls:[{merged_at:'2026-01-01',merge_commit_sha:sha,base:{ref:'main',repo:{full_name:repository}}}]};
 // Intentionally no Actions API: neither automatic nor manual deployment can depend on CI.
 const github={rest:{repos:{getCommit:async()=>({data:{sha:state.sha,parents:state.parents}}),listPullRequestsAssociatedWithCommit:()=>{}}},paginate:async()=>state.pulls};
 return {github,context,state,sha};
}
test('Pages authorizes exact current squash PR SHA directly from main push without CI',async()=>{
 const f=fixture();assert.equal(await selectSource(f),f.sha);
});
test('Pages rejects wrong repository, event, branch, deleted pushes and superseded event SHAs',async()=>{
 for(const mutate of [f=>f.context.payload.repository.full_name='other/rouge',f=>f.context.eventName='pull_request',f=>f.context.eventName='workflow_run',f=>f.context.ref='refs/heads/feat/test',f=>f.context.payload.deleted=true,f=>f.context.sha='b'.repeat(40),f=>f.context.payload.after='b'.repeat(40),f=>f.state.sha='b'.repeat(40)]){
  const f=fixture();mutate(f);assert.equal(await selectSource(f),null);
 }
});
test('Pages rejects non-PR pushes, merge commits and wrong PR destinations',async()=>{
 for(const mutate of [f=>f.state.pulls=[],f=>f.state.parents=[{},{}],f=>f.state.parents=[],f=>f.state.pulls[0].merged_at=null,f=>f.state.pulls[0].merge_commit_sha='old',f=>f.state.pulls[0].base.ref='dev',f=>f.state.pulls[0].base.repo.full_name='other/rouge']){
  const f=fixture();mutate(f);assert.equal(await selectSource(f),null);
 }
});
test('Pages main freshness guard skips an advanced main',async()=>{
 const f=fixture();assert.equal(await isCurrentMain(f),true);f.state.sha='new';assert.equal(await isCurrentMain(f),false);
});
test('manual Pages resolves only current main PR without CI and rejects alternate refs',async()=>{
 const f=fixture();f.context.eventName='workflow_dispatch';f.context.sha='old';delete f.context.payload.after;assert.equal(await selectSource(f),f.sha);
 f.context.ref='refs/heads/feature';await assert.rejects(selectSource(f),/must run from main/);
 f.context.ref='refs/heads/main';f.state.pulls=[];assert.equal(await selectSource(f),null);
});
test('workflow serializes deploy then same-SHA tests then live verification without a trigger loop',()=>{
 const pages=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 const ci=fs.readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 assert.match(pages,/on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:/);
 assert.doesNotMatch(pages,/workflow_run:|game_ref|pull_request_target|actions: read|run: npm test/);
 assert.match(pages,/group: github-pages\n  cancel-in-progress: false/);
 assert.match(pages,/ref: \$\{\{ needs.source.outputs.sha \}\}/);
 assert.match(pages,/if: steps.current.outputs.current == 'true'/);
 assert.match(pages,/deployed: \$\{\{ steps.current.outputs.current == 'true' && steps.deployment.outcome == 'success' \}\}/);
 assert.match(pages,/checks:\n    needs: \[build, deploy\]\n    if: needs.deploy.outputs.deployed == 'true'\n    uses: .\/\.github\/workflows\/ci.yml\n    with:\n      source_sha: \$\{\{ needs.build.outputs.source_sha \}\}/);
 assert.match(pages,/verify:\n    needs: \[build, deploy, checks\]/);
 assert.match(pages,/if: always\(\) && needs.deploy.outputs.deployed == 'true'/);
 assert.match(ci,/on:\n  workflow_call:\n    inputs:\n      source_sha:/);
 assert.doesNotMatch(ci,/\n  (?:push|pull_request|workflow_run|workflow_dispatch):/);
 assert.match(ci,/timeout-minutes: 20/);
 assert.match(ci,/ref: \$\{\{ inputs.source_sha \}\}/);
 assert.match(ci,/npm test/);assert.match(ci,/npm run test:e2e/);
});
