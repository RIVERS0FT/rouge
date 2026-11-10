// Only a trusted, successful Pages deployment can start acceptance. A new
// deployment may cancel older acceptance, never another deployment.
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);
const workflowPath = run => String(run.path || '').replace(/@(main|refs\/heads\/main)$/, '');
const repositoryName = context => `${context.repo.owner}/${context.repo.repo}`;
const fromThisRepository = (run, context) => run.head_repository?.full_name === repositoryName(context);

async function publishedRun({github, context}) {
  if (context.eventName !== 'workflow_run' || context.payload.repository?.full_name !== repositoryName(context)) return null;
  const id = context.payload.workflow_run?.id;
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const {owner, repo} = context.repo;
  const {data: run} = await github.rest.actions.getWorkflowRun({owner, repo, run_id: id});
  if (workflowPath(run) !== '.github/workflows/pages.yml' || run.head_branch !== 'main' || !fromThisRepository(run, context) ||
      !['push', 'workflow_dispatch'].includes(run.event) || run.status !== 'completed' || run.conclusion !== 'success') return null;
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {owner, repo, run_id: id, per_page: 100});
  // A superseded build can finish successfully without publishing anything.
  if (!jobs.some(job => job.name === 'deploy' && job.conclusion === 'success' &&
      job.steps?.some(step => step.name === 'Publish website' && step.conclusion === 'success'))) return null;
  const name = `deployed-source-${run.run_attempt}`;
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {owner, repo, run_id: id, per_page: 100});
  const matching = artifacts.filter(artifact => artifact.name === name && !artifact.expired);
  if (matching.length !== 1 || matching[0].size_in_bytes > 65536) throw new Error('Missing or invalid deployment manifest artifact');
  return {id: run.id, attempt: run.run_attempt, artifact: name};
}

async function selectAcceptance({github, context, publication, manifest}) {
  const {owner, repo} = context.repo;
  const expectedSite = `https://${owner.toLowerCase()}.github.io/${repo}/`;
  if (!publication || manifest.version !== 1 || manifest.runId !== publication.id || manifest.runAttempt !== publication.attempt ||
      !/^[0-9a-f]{40}$/.test(manifest.sourceCommit) || manifest.pageUrl !== expectedSite) throw new Error('Invalid deployment manifest');
  const {data: main} = await github.rest.repos.getCommit({owner, repo, ref: 'main'});
  if (main.sha !== manifest.sourceCommit) return null;
  if (main.parents.length !== 1) throw new Error('Acceptance source must be a squash PR commit');
  const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit,
    {owner, repo, commit_sha: main.sha, per_page: 100});
  if (!pulls.some(pr => pr.merged_at && pr.merge_commit_sha === main.sha && pr.base.ref === 'main' &&
      pr.base.repo?.full_name === repositoryName(context))) throw new Error('Acceptance source is not a merged main PR');
  return {sha: manifest.sourceCommit, url: manifest.pageUrl};
}

async function acceptanceOnlyRun({github, context, run}) {
  const {owner, repo} = context.repo;
  if (!ACTIVE.has(run.status) || run.head_branch !== 'main' || !fromThisRepository(run, context)) return false;
  if (run.event === 'workflow_run' && workflowPath(run) === '.github/workflows/acceptance.yml') return true;
  if (workflowPath(run) !== '.github/workflows/pages.yml' || !['push', 'workflow_dispatch'].includes(run.event)) return false;
  // Migration only: never interrupt a source, build, publication or unknown job.
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {owner, repo, run_id: run.id, per_page: 100});
  return ['source', 'build', 'deploy'].every(name => jobs.some(job => job.name === name && job.conclusion === 'success')) &&
    jobs.some(job => job.name === 'verify' || job.name.startsWith('checks /')) &&
    jobs.every(job => ['source', 'build', 'deploy', 'verify'].includes(job.name) || job.name.startsWith('checks /'));
}
async function olderRuns({github, context, cutoff, workflow}) {
  const {owner, repo} = context.repo;
  let runs;
  try {
    runs = await github.paginate(github.rest.actions.listWorkflowRuns, {owner, repo, workflow_id: workflow, branch: 'main', per_page: 100});
  } catch (error) {
    if (error.status === 404 && workflow === 'acceptance.yml') return [];
    throw error;
  }
  return runs.filter(run => ACTIVE.has(run.status) && run.head_branch === 'main' && fromThisRepository(run, context) &&
    Date.parse(run.created_at) < cutoff);
}
async function cancelSupersededAcceptance({github, context, sha, requested = new Map(), now = Date.now}) {
  const {owner, repo} = context.repo;
  const current = async () => (await github.rest.repos.getCommit({owner, repo, ref: 'main'})).data.sha === sha;
  if (!await current()) return [];
  const {data: publishing} = await github.rest.actions.getWorkflowRun({owner, repo, run_id: context.runId});
  const cutoff = Date.parse(publishing.created_at);
  if (!Number.isFinite(cutoff)) return [];
  const runs = [...await olderRuns({github, context, cutoff, workflow: 'acceptance.yml'}),
    ...await olderRuns({github, context, cutoff, workflow: 'pages.yml'})];
  const cancelled = [];
  for (const run of runs) {
    if (!await acceptanceOnlyRun({github, context, run}) || !await current()) continue;
    try {
      const previous = requested.get(run.id);
      if (!previous || previous.attempt !== run.run_attempt) {
        await github.rest.actions.cancelWorkflowRun({owner, repo, run_id: run.id});
        requested.set(run.id, {attempt: run.run_attempt, at: now()});
        cancelled.push(run.id);
      } else if (now() - previous.at >= 30000) {
        // Legacy always() jobs can survive normal cancellation. Re-read all
        // safety conditions before force-cancelling only that same acceptance.
        const {data: fresh} = await github.rest.actions.getWorkflowRun({owner, repo, run_id: run.id});
        if (fresh.run_attempt === previous.attempt && Date.parse(fresh.created_at) < cutoff &&
            await acceptanceOnlyRun({github, context, run: fresh}) && await current()) {
          await github.rest.actions.forceCancelWorkflowRun({owner, repo, run_id: run.id});
          requested.set(run.id, {...previous, at: now()});
          cancelled.push(run.id);
        }
      }
    } catch (error) {
      if (error.status !== 409) throw error; // Already completed is harmless.
      // Another priority/source job may already have requested cancellation.
      // Remember the attempt; a later fresh safety check decides whether force
      // is needed for a legacy always() job that remains active.
      if (!requested.has(run.id)) requested.set(run.id, {attempt: run.run_attempt, at: now()});
    }
  }
  return cancelled;
}
async function retireSupersededAcceptance({github, context, sha, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), maxPasses = 80}) {
  const {owner, repo} = context.repo;
  const {data: publishing} = await github.rest.actions.getWorkflowRun({owner, repo, run_id: context.runId});
  const cutoff = Date.parse(publishing.created_at), requested = new Map(), cancelled = new Set();
  if (!Number.isFinite(cutoff)) return [];
  for (let pass = 0; pass < maxPasses; pass++) {
    if ((await github.rest.repos.getCommit({owner, repo, ref: 'main'})).data.sha !== sha) break;
    for (const id of await cancelSupersededAcceptance({github, context, sha, requested})) cancelled.add(id);
    const remaining = [...await olderRuns({github, context, cutoff, workflow: 'acceptance.yml'}),
      ...await olderRuns({github, context, cutoff, workflow: 'pages.yml'})];
    if (!remaining.length) break;
    if (pass + 1 < maxPasses) await wait(15000);
  }
  return [...cancelled];
}
module.exports = {publishedRun, selectAcceptance, cancelSupersededAcceptance, retireSupersededAcceptance};
