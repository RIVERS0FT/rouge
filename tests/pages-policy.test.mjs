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
test('deployment mutex excludes acceptance, which verifies the same deployed SHA without a trigger loop',()=>{
 const pages=fs.readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
 const acceptance=fs.readFileSync(new URL('../.github/workflows/acceptance.yml',import.meta.url),'utf8');
 const ci=fs.readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 const priority=fs.readFileSync(new URL('../.github/workflows/deployment-priority.yml',import.meta.url),'utf8');
 assert.match(pages,/on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:/);
 assert.doesNotMatch(pages,/workflow_run:|game_ref|pull_request_target|run: npm test|\n  checks:|\n  verify:/);
 assert.doesNotMatch(pages,/^concurrency:/m);
 assert.match(pages,/deploy:[\s\S]*?concurrency:\n      group: github-pages\n      cancel-in-progress: false/);
 assert.match(pages,/queue: max/);
 assert.match(pages,/ref: \$\{\{ needs.source.outputs.sha \}\}/);
 assert.match(pages,/if: steps.current.outputs.current == 'true'/);
 assert.match(pages,/cancelSupersededAcceptance/);
 assert.match(priority,/retireSupersededAcceptance/);
 assert.doesNotMatch(priority,/deploy-pages@|pages: write|id-token: write|github-pages/);
 assert.match(priority,/group: rouge-deployment-priority/);
 assert.match(pages,/name: deployed-source-\$\{\{ github.run_attempt \}\}/);
 assert.match(acceptance,/workflow_run:\n    workflows: \[Publish ROUGE to GitHub Pages\]\n    types: \[completed\]/);
 assert.match(acceptance,/publishedRun/);assert.match(acceptance,/selectAcceptance/);
 assert.match(acceptance,/source_sha: \$\{\{ needs.source.outputs.sha \}\}/);
 assert.match(acceptance,/SOURCE_COMMIT: \$\{\{ needs.source.outputs.sha \}\}/);
 assert.match(acceptance,/needs.checks.result != 'cancelled'/);
 assert.match(acceptance,/Skip superseded live verification/);
 assert.doesNotMatch(acceptance,/pages: write|id-token: write|deploy-pages@|\n  (?:push|workflow_dispatch|pull_request):/);
 assert.match(ci,/on:\n  workflow_call:\n    inputs:\n      source_sha:/);
 assert.doesNotMatch(ci,/\n  (?:push|pull_request|workflow_run|workflow_dispatch):/);
 assert.match(ci,/timeout-minutes: 20/);
 assert.match(ci,/ref: \$\{\{ inputs.source_sha \}\}/);
 assert.match(ci,/npm test/);assert.match(ci,/npm run test:e2e/);
});

test('post-deployment browser shards preserve coverage, independent runners and evidence',()=>{
 const ci=fs.readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
 const acceptance=fs.readFileSync(new URL('../.github/workflows/acceptance.yml',import.meta.url),'utf8');
 const [validate,browser]=ci.split('  browser:');
 assert.ok(browser,'browser tests have their own job');
 assert.equal((ci.match(/npm test/g)||[]).length,1);
 assert.equal((ci.match(/npm run build/g)||[]).length,1);
 assert.doesNotMatch(validate,/playwright install|npm run test:e2e/);
 assert.match(browser,/runs-on: ubuntu-24.04/);
 assert.match(browser,/timeout-minutes: 30/);
 assert.match(browser,/fail-fast: false/);
 assert.match(browser,/shard: \[1, 2, 3\]/);
 assert.doesNotMatch(browser,/needs:|continue-on-error:|--grep|--max-failures|--pass-with-no-tests/);
 assert.match(browser,/ref: \$\{\{ inputs.source_sha \}\}/);
 assert.match(browser,/npm run test:e2e -- --shard=\$\{\{ matrix.shard \}\}\/3 --workers=1 \| tee artifacts\/browser-tests.log/);
 assert.match(browser,/if: always\(\)/);
 assert.match(browser,/name: rouge-browser-\$\{\{ matrix.shard \}\}-of-3-\$\{\{ inputs.source_sha \}\}-\$\{\{ github.run_attempt \}\}/);
 assert.match(browser,/artifacts\/\n            test-results\//);
 assert.match(validate,/name: rouge-build-\$\{\{ inputs.source_sha \}\}-\$\{\{ github.run_attempt \}\}/);
 assert.match(acceptance,/needs: \[source, checks\]/);
 assert.match(acceptance,/name: pages-live-verification-\$\{\{ needs.source.outputs.sha \}\}-\$\{\{ github.run_attempt \}\}/);
});
