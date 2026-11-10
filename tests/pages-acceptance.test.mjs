import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {publishedRun,selectAcceptance,cancelSupersededAcceptance,retireSupersededAcceptance}=createRequire(import.meta.url)('../.github/scripts/pages-acceptance.cjs');
function fixture(){
 const repo={owner:'RIVERS0FT',repo:'rouge'},full_name='RIVERS0FT/rouge',sha='a'.repeat(40);
 const context={repo,eventName:'workflow_run',runId:200,payload:{repository:{full_name},workflow_run:{id:100}}};
 const run={id:100,run_attempt:1,path:'.github/workflows/pages.yml',event:'push',head_branch:'main',head_repository:{full_name},status:'completed',conclusion:'success',created_at:'2026-11-10T10:00:00Z'};
 const state={run,sha,parents:[{}],pulls:[{merged_at:'today',merge_commit_sha:sha,base:{ref:'main',repo:{full_name}}}],
  jobs:[{name:'deploy',conclusion:'success',steps:[{name:'Publish website',conclusion:'success'}]}],
  artifacts:[{name:'deployed-source-1',size_in_bytes:500,expired:false}],acceptance:[],legacy:[],cancelled:[],mainCalls:0,forced:[]};
 const publication={id:100,attempt:1,artifact:'deployed-source-1'};
 const manifest={version:1,sourceCommit:sha,pageUrl:'https://rivers0ft.github.io/rouge/',runId:100,runAttempt:1};
 const actions={getWorkflowRun:async({run_id})=>({data:run_id===200?{created_at:'2026-11-10T11:00:00Z'}:(state.fresh??state.run)}),
  listJobsForWorkflowRun(){},listWorkflowRunArtifacts(){},listWorkflowRuns(){},
  cancelWorkflowRun:async({run_id})=>{if(state.cancelError)throw state.cancelError;state.cancelled.push(run_id);if(state.completeOnCancel)for(const run of [...state.acceptance,...state.legacy])if(run.id===run_id)run.status='completed';}};
 const repos={getCommit:async()=>{state.mainCalls++;return{data:{sha:state.advanceAfter&&state.mainCalls>state.advanceAfter?'b'.repeat(40):state.sha,parents:state.parents}};},listPullRequestsAssociatedWithCommit(){}};
 const github={rest:{actions,repos},request:async(route,{run_id})=>{assert.equal(route,'POST /repos/{owner}/{repo}/actions/runs/{run_id}/force-cancel');state.forced.push(run_id);},paginate:async(method,args)=>{
  if(method===actions.listJobsForWorkflowRun)return state.jobs;
  if(method===actions.listWorkflowRunArtifacts)return state.artifacts;
  if(method===actions.listWorkflowRuns){if(args.workflow_id==='acceptance.yml'&&state.missingWorkflow)throw{status:404};return args.workflow_id==='acceptance.yml'?state.acceptance:state.legacy;}
  if(method===repos.listPullRequestsAssociatedWithCommit)return state.pulls;
  throw Error('Unexpected API');
 }};
 return {github,context,state,sha,publication,manifest};
}
const oldAcceptance=(id=10)=>({id,path:'.github/workflows/acceptance.yml',event:'workflow_run',head_branch:'main',head_repository:{full_name:'RIVERS0FT/rouge'},status:'in_progress',created_at:'2026-11-10T10:30:00Z'});

test('acceptance requires a successful real deployment and its attempt-specific manifest',async()=>{
 const f=fixture();assert.deepEqual(await publishedRun(f),f.publication);assert.deepEqual(await selectAcceptance(f),{sha:f.sha,url:f.manifest.pageUrl});
});
test('wrong sources, branches, failed or skipped deployments never start acceptance',async()=>{
 for(const change of [f=>f.context.eventName='push',f=>f.context.payload.repository.full_name='other/repo',f=>f.state.run.path='.github/workflows/other.yml',f=>f.state.run.event='pull_request',f=>f.state.run.head_repository.full_name='other/repo',f=>f.state.run.head_branch='topic',f=>f.state.run.conclusion='failure',f=>f.state.run.status='in_progress',f=>f.state.jobs[0].steps[0].conclusion='skipped']){
  const f=fixture();change(f);assert.equal(await publishedRun(f),null);
 }
});
test('missing, duplicate, expired or oversized manifests fail visibly',async()=>{
 for(const change of [f=>f.state.artifacts=[],f=>f.state.artifacts.push({...f.state.artifacts[0]}),f=>f.state.artifacts[0].expired=true,f=>f.state.artifacts[0].size_in_bytes=70000]){
  const f=fixture();change(f);await assert.rejects(publishedRun(f),/manifest/);
 }
});
test('manifest identity, page destination and exact squash PR commit are validated',async()=>{
 for(const change of [f=>f.manifest.runId=99,f=>f.manifest.runAttempt=2,f=>f.manifest.version=2,f=>f.manifest.sourceCommit='main',f=>f.manifest.pageUrl='https://untrusted.example/',f=>f.state.parents=[{},{}],f=>f.state.pulls=[]]){
  const f=fixture();change(f);await assert.rejects(selectAcceptance(f));
 }
 const stale=fixture();stale.state.sha='b'.repeat(40);assert.equal(await selectAcceptance(stale),null);
});
test('new publishing SHA cancels only older same-repository acceptance',async()=>{
 const f=fixture();const base=oldAcceptance();
 f.state.acceptance=[base,{...base,id:11,status:'completed'},{...base,id:12,created_at:'2026-11-10T12:00:00Z'},
  {...base,id:13,head_branch:'topic'},{...base,id:14,head_repository:{full_name:'other/repo'}},{...base,id:15,path:'.github/workflows/pages.yml',event:'workflow_run'}];
 assert.deepEqual(await cancelSupersededAcceptance(f),[10]);assert.deepEqual(f.state.cancelled,[10]);
});
test('migration retires legacy acceptance only after all publication jobs succeeded',async()=>{
 const f=fixture();f.state.legacy=[{...oldAcceptance(20),path:'.github/workflows/pages.yml',event:'push'}];
 f.state.jobs=[...['source','build','deploy'].map(name=>({name,conclusion:'success'})),{name:'checks / validate',conclusion:null}];
 assert.deepEqual(await cancelSupersededAcceptance(f),[20]);
 for(const changed of ['build','deploy']){
  const f=fixture();f.state.legacy=[{...oldAcceptance(20),path:'.github/workflows/pages.yml',event:'push'}];
  f.state.jobs=[...['source','build','deploy'].map(name=>({name,conclusion:name===changed?null:'success'})),{name:'verify',conclusion:null}];
  assert.deepEqual(await cancelSupersededAcceptance(f),[]);
 }
});
test('new separated deployment workflows and unknown jobs are never cancelled',async()=>{
 for(const extra of [[],[{name:'unknown-mutating-job',conclusion:null},{name:'verify',conclusion:null}]]){
  const f=fixture();f.state.legacy=[{...oldAcceptance(20),path:'.github/workflows/pages.yml',event:'push'}];
  f.state.jobs=[...['source','build','deploy'].map(name=>({name,conclusion:'success'})),...extra];
  assert.deepEqual(await cancelSupersededAcceptance(f),[]);
 }
});
test('superseded cancellation requests cannot cancel later work',async()=>{
 const f=fixture();f.state.acceptance=[oldAcceptance()];f.state.sha='b'.repeat(40);assert.deepEqual(await cancelSupersededAcceptance(f),[]);
 const advanced=fixture();advanced.state.acceptance=[oldAcceptance()];advanced.state.advanceAfter=1;assert.deepEqual(await cancelSupersededAcceptance(advanced),[]);
});
test('first deployment and already-completed cancellation races are harmless',async()=>{
 const f=fixture();f.state.missingWorkflow=true;assert.deepEqual(await cancelSupersededAcceptance(f),[]);
 const raced=fixture();raced.state.acceptance=[oldAcceptance()];raced.state.cancelError={status:409};assert.deepEqual(await cancelSupersededAcceptance(raced),[]);
});

test('documented main ref suffixes are accepted without admitting other workflow refs',async()=>{
 for(const suffix of ['@main','@refs/heads/main']){const f=fixture();f.state.run.path+=suffix;assert.deepEqual(await publishedRun(f),f.publication);}
 const f=fixture();f.state.run.path+='@untrusted';assert.equal(await publishedRun(f),null);
});
test('unresponsive acceptance gets a fresh safety check before force cancellation',async()=>{
 const f=fixture(),requested=new Map();f.state.acceptance=[{...oldAcceptance(),run_attempt:1}];f.state.fresh=f.state.acceptance[0];
 await cancelSupersededAcceptance({...f,requested,now:()=>1000});assert.deepEqual(f.state.cancelled,[10]);assert.deepEqual(f.state.forced,[]);
 await cancelSupersededAcceptance({...f,requested,now:()=>2000});assert.deepEqual(f.state.forced,[]);
 await cancelSupersededAcceptance({...f,requested,now:()=>32000});assert.deepEqual(f.state.forced,[10]);
});
test('force cancellation never follows a rerun, completed run or resumed publishing job',async()=>{
 for(const change of [f=>f.state.fresh.run_attempt=2,f=>f.state.fresh.status='completed',f=>{f.state.fresh.path='.github/workflows/pages.yml';f.state.fresh.event='push';f.state.jobs=[{name:'deploy',conclusion:null}];}]){
  const f=fixture(),requested=new Map();f.state.acceptance=[{...oldAcceptance(),run_attempt:1}];
  await cancelSupersededAcceptance({...f,requested,now:()=>1000});f.state.fresh={...f.state.acceptance[0]};change(f);
  await cancelSupersededAcceptance({...f,requested,now:()=>32000});assert.deepEqual(f.state.forced,[]);
 }
});
test('priority monitor waits for legacy publication, then cancels only remaining acceptance',async()=>{
 const f=fixture();f.state.legacy=[{...oldAcceptance(20),path:'.github/workflows/pages.yml',event:'push'}];
 f.state.jobs=[{name:'source',conclusion:'success'},{name:'build',conclusion:'success'},{name:'deploy',conclusion:null},{name:'verify',conclusion:null}];
 let waits=0;f.state.completeOnCancel=true;
 const ids=await retireSupersededAcceptance({...f,maxPasses:3,wait:async()=>{waits++;assert.deepEqual(f.state.cancelled,[]);f.state.jobs[2].conclusion='success';}});
 assert.equal(waits,1);assert.deepEqual(ids,[20]);assert.deepEqual(f.state.cancelled,[20]);
});
test('priority monitor is bounded and stops when main advances',async()=>{
 const f=fixture();f.state.legacy=[{...oldAcceptance(20),path:'.github/workflows/pages.yml',event:'push'}];f.state.jobs=[{name:'deploy',conclusion:null}];
 let waits=0;assert.deepEqual(await retireSupersededAcceptance({...f,maxPasses:2,wait:async()=>{waits++;}}),[]);assert.equal(waits,1);
 const g=fixture();g.state.legacy=f.state.legacy;g.state.jobs=f.state.jobs;
 assert.deepEqual(await retireSupersededAcceptance({...g,maxPasses:10,wait:async()=>{g.state.sha='b'.repeat(40);}}),[]);assert.deepEqual(g.state.cancelled,[]);
});
