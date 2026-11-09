// Release current main PR commits directly; tests run only after deployment.
async function selectSource({github, context}) {
  const {owner, repo} = context.repo;
  const repository = `${owner}/${repo}`;
  const manual = context.eventName === 'workflow_dispatch';
  if (manual && context.ref !== 'refs/heads/main') throw new Error('Manual releases must run from main');
  if ((!manual && context.eventName !== 'push') || context.ref !== 'refs/heads/main' ||
      context.payload.repository?.full_name !== repository || context.payload.deleted) return null;
  const main = await github.rest.repos.getCommit({owner, repo, ref: 'main'});
  const sha = main.data.sha;
  // A manual rerun resolves current main, never an arbitrary user-supplied ref.
  // Automatic pushes must match the exact event commit, not a newer queued main.
  if ((!manual && (context.sha !== sha || context.payload.after !== sha)) || main.data.parents.length !== 1) return null;
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
