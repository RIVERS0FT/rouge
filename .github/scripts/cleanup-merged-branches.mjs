import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

/** Only unchanged, merged heads with no open PR dependants are eligible. */
export function skipReason(pr, branch, openPRs, repo, defaultBranch) {
  const name = pr.head?.ref;
  if (!pr.merged_at || pr.state !== 'closed') return 'not-merged';
  if (pr.head?.repo?.full_name !== repo) return 'foreign-repository';
  if (!name || name === defaultBranch || /^(main|master|develop|dev|gh-pages|release)(\/|$)/.test(name)) return 'long-lived-branch';
  if (!branch) return 'already-deleted';
  if (branch.protected) return 'protected';
  if (branch.commit.sha !== pr.head.sha) return 'new-commits-after-merge';
  if (openPRs.some(p => p.base?.ref === name || (p.head?.repo?.full_name === repo && p.head.ref === name))) return 'open-pr-dependency';
  return null;
}

export function deleteWithLease(repoURL, branch, sha, cwd, env = process.env) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid expected SHA');
  const valid = spawnSync('git', ['check-ref-format', `refs/heads/${branch}`], {encoding:'utf8'});
  if (valid.status !== 0) throw new Error('Invalid branch ref');
  const result = spawnSync('git', ['push', '--porcelain',
    `--force-with-lease=refs/heads/${branch}:${sha}`, repoURL, `:refs/heads/${branch}`],
    {cwd, env, encoding:'utf8', timeout:60000});
  // Never log credential-bearing environment values or raw Git output.
  if (result.status !== 0) throw new Error('Lease deletion rejected; branch retained (changed head, protection, or transport error)');
}

export async function run() {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !token) throw new Error('Missing repository or job token');
  const root = `/repos/${repo}`;
  async function api(suffix, missingOK = false) {
    const r = await fetch(`https://api.github.com${root}${suffix}`, {
      headers:{Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json'},
      signal:AbortSignal.timeout(30000)
    });
    if (missingOK && r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub read failed: ${r.status} ${suffix}`);
    return r.json();
  }
  async function allPRs(state) {
    const result = [];
    for (let page = 1; ; page++) {
      const batch = await api(`/pulls?state=${state}&per_page=100&page=${page}&sort=updated&direction=desc`);
      result.push(...batch);
      if (batch.length < 100) return result;
      if (page >= 100) throw new Error('Pagination safety limit; no incomplete scan accepted');
    }
  }
  const meta = await api(''), open = await allPRs('open'), closed = await allPRs('closed');
  const candidates = closed.filter(p => p.merged_at).sort((a,b) => b.merged_at.localeCompare(a.merged_at));
  const report = {at:new Date().toISOString(), repository:repo, mode:'merged-heads-only',
    dryRun:process.env.DRY_RUN === 'true', openPullRequests:open.length,
    mergedPullRequests:candidates.length, deleted:[], skipped:[], errors:[]};
  const seen = new Set(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rouge-branch-cleanup-'));
  const init = spawnSync('git', ['init','--bare','--quiet',dir]);
  if (init.status !== 0) throw new Error('Cannot initialize lease-check repository');
  const env = {...process.env, GIT_TERMINAL_PROMPT:'0', GIT_CONFIG_COUNT:'1',
    GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0:`AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`};
  try {
    for (const pr of candidates) {
      const name = pr.head?.ref, key = `${pr.head?.repo?.full_name}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        // Foreign heads are never read or deleted.
        const branch = pr.head?.repo?.full_name === repo ? await api(`/branches/${encodeURIComponent(name)}`, true) : null;
        let reason = skipReason(pr, branch, open, repo, meta.default_branch);
        if (!reason) {
          // Confirm the merge is retained by its target or by the default branch.
          let retained = false;
          for (const target of new Set([pr.base.ref, meta.default_branch])) {
            const targetBranch = await api(`/branches/${encodeURIComponent(target)}`, true);
            if (!targetBranch || target === name || !pr.merge_commit_sha) continue;
            const cmp = await api(`/compare/${pr.merge_commit_sha}...${targetBranch.commit.sha}`, true);
            if (cmp && ['ahead','identical'].includes(cmp.status)) {retained = true; break;}
          }
          if (!retained) reason = 'merge-not-retained-by-target';
        }
        if (!reason) {
          // Recheck PR dependencies and identity immediately before the atomic lease push.
          const fresh = await api(`/pulls/${pr.number}`);
          if (fresh.head.sha !== pr.head.sha || fresh.head.ref !== name) reason = 'pull-request-head-changed';
          else reason = skipReason(fresh, await api(`/branches/${encodeURIComponent(name)}`,true),
            await allPRs('open'), repo, meta.default_branch);
        }
        if (reason || report.dryRun) {report.skipped.push({branch:name, pr:pr.number, reason:reason || 'dry-run'}); continue;}
        deleteWithLease(`https://github.com/${repo}.git`, name, pr.head.sha, dir, env);
        report.deleted.push({branch:name, pr:pr.number, sha:pr.head.sha});
      } catch (error) {report.errors.push({branch:name, error:String(error.message)});}
    }
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
    fs.mkdirSync('artifacts',{recursive:true});
    fs.writeFileSync('artifacts/branch-cleanup.json',JSON.stringify(report,null,2));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Merged branch cleanup\nOpen PRs: ${open.length}. Merged PRs: ${candidates.length}. Deleted: ${report.deleted.length}. Skipped: ${report.skipped.length}. Errors: ${report.errors.length}.\n\nNo pull requests are merged by this workflow.\n`);
    console.log(JSON.stringify(report,null,2));
  }
  if (report.errors.length) throw new Error('Some branches were retained because their safety checks or lease pushes failed');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().catch(e => {console.error(e.message);process.exitCode=1;});
}
