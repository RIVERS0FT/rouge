// Only repository-owned, successful main push checks may authorize an automatic release.
async function selectSource({github, context}) {
  const {owner, repo} = context.repo;
  const repository = `${owner}/${repo}`;
  const main = await github.rest.repos.getCommit({owner, repo, ref: 'main'});
  const sha = main.data.sha;
  if (context.eventName === 'workflow_dispatch') {
    if (context.ref !== 'refs/heads/main') throw new Error('Manual releases must run from main');
    // Manual release is main-only and must also have passed the complete CI suite.
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
      owner, repo, workflow_id: 'ci.yml', branch: 'main', event: 'push',
      head_sha: sha, status: 'success', per_page: 100
    });
    if (!runs.some(run => run.head_sha === sha && run.head_repository?.full_name === repository &&
      run.event === 'push' && run.head_branch === 'main' && run.conclusion === 'success')) {
      throw new Error('Current main has no successful push CI; wait for Prototype checks');
    }
    return sha;
  }
  const run = context.payload.workflow_run;
  if (context.eventName !== 'workflow_run' || !run || run.name !== 'Prototype checks' ||
      run.status !== 'completed' || run.conclusion !== 'success' || run.event !== 'push' ||
      run.head_branch !== 'main' || run.head_repository?.full_name !== repository ||
      context.payload.repository?.full_name !== repository) return null;
  // Verify the reported workflow against the trusted CI file, not just its display name.
  const workflow = await github.rest.actions.getWorkflow({owner, repo, workflow_id: run.workflow_id});
  if (workflow.data.path !== '.github/workflows/ci.yml') return null;
  if (run.head_sha !== sha || main.data.parents.length !== 1) return null;
  const pulls = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit,
    {owner, repo, commit_sha: sha, per_page: 100});
  const merged = pulls.some(pr => pr.merged_at && pr.merge_commit_sha === sha &&
    pr.base.ref === 'main' && pr.base.repo?.full_name === repository);
  return merged ? sha : null;
}
async function isCurrentMain({github, context, sha}) {
  const {owner, repo} = context.repo;
  return (await github.rest.repos.getCommit({owner, repo, ref: 'main'})).data.sha === sha;
}
module.exports = {selectSource, isCurrentMain};
