// ============================================================================
// Base Branch
// ============================================================================
//
// Finds the branch the current one is compared against: its parent, not the
// repository's default branch. Every skill that works on "this branch's
// changes" asks this one function, and a stacked branch is diffed against the
// branch below it.

import { execFileSync } from 'node:child_process';

/** A reflog or config value that names a commit, not a branch. */
const NOT_A_BRANCH = /^(HEAD|[0-9a-f]{7,40})$/;

/**
 * Runs a command and returns its stdout, throwing on a non-zero exit.
 *
 * @param command - The program
 * @param args - Its arguments
 * @param cwd - The working directory
 * @returns The stdout
 */
export function runCommand(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    // A fetch that needs a password fails instead of waiting for one.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

/**
 * Works out the branch to compare the current one against, and where it forked.
 *
 * The parent comes from the branch given, the open PR, a `gh stack`, the
 * recorded parent or the reflog, in that order, else the default branch, which
 * also replaces a parent already merged into it.
 *
 * @param root - The repository root
 * @param options - `explicit` base branch, the shared `baseBranch`, `fetch` the base first (default true), and a `run` stand-in for tests
 * @returns The parent `base`, the `ref` to compare against, the `fork` commit, a human `source`, the current `branch` (empty when detached) and any `warnings`
 * @throws When on the base branch itself, or when the parent cannot be found and nothing safe replaces it
 */
export function resolveBase(
  root,
  { explicit, baseBranch, fetch = true, run = runCommand },
) {
  const git = (...args) => run('git', args, root);
  const warnings = [];
  const branch = tryRun(() => git('branch', '--show-current').trim()) ?? '';

  let parent = explicit
    ? { name: explicit, source: 'given' }
    : branch
      ? findParent(root, { branch, run, warnings })
      : null;
  parent ??= {
    name: baseBranch,
    source: branch ? 'default branch' : 'default branch, detached HEAD',
  };

  if (branch && parent.name === branch) {
    throw new Error(
      parent.name === baseBranch
        ? `On ${baseBranch} itself; there is no parent branch to compare against.`
        : `Cannot compare ${branch} with itself.`,
    );
  }

  if (fetch) {
    // Offline, or with no remote, the refs already here have to do.
    tryRun(() => git('fetch', '--quiet', 'origin', parent.name));
  }

  const own =
    latestFork(git, parent.name) ??
    (explicit ? commitFork(git, explicit) : null);

  if (!own) {
    if (explicit || parent.name === baseBranch) {
      throw new Error(
        `No ${parent.name} branch, locally or as origin/${parent.name}. Fetch it first.`,
      );
    }
    return replaceGoneParent(git, run, root, {
      branch,
      parent,
      baseBranch,
      warnings,
    });
  }

  if (!explicit && parent.name !== baseBranch) {
    // A parent already merged into the default branch is behind it here.
    const main = latestFork(git, baseBranch);
    if (
      main &&
      main.fork !== own.fork &&
      isAncestor(git, own.fork, main.fork)
    ) {
      warnings.push(
        `${parent.name} (${parent.source}) is already in ${baseBranch}'s history here, so it looks merged; comparing against ${baseBranch} instead.`,
      );
      return {
        base: baseBranch,
        ...main,
        source: `${parent.source}, merged into ${baseBranch}`,
        branch,
        warnings,
      };
    }
  }

  return { base: parent.name, ...own, source: parent.source, branch, warnings };
}

/**
 * Asks each source for the parent in turn.
 *
 * @param root - The repository root
 * @param options - The current `branch`, `run`, and the `warnings` list to add to
 * @returns The parent `name` and its `source`, or null when no source knows
 */
function findParent(root, { branch, run, warnings }) {
  const git = (...args) => run('git', args, root);
  // `origin` always counts, since a recorded parent can outlive the remote.
  const remotes = [
    'origin',
    ...(tryRun(() => git('remote')) ?? '').split('\n').filter(Boolean),
  ];
  const recorded = recordedParent(git, branch, remotes);
  const pr = hasOrigin(git) ? openPrBase(run, root, branch, warnings) : null;

  if (pr) {
    if (recorded && recorded.name !== pr.name) {
      warnings.push(
        `${pr.source} targets ${pr.name}, but the branch was created from ${recorded.name}; using the PR's base.`,
      );
    }
    return pr;
  }

  const stacked = stackParent(run, root, branch);
  if (stacked) return { name: stacked, source: 'gh stack' };

  return recorded ?? createdFrom(git, branch, remotes);
}

/**
 * Reads the base of the branch's open PR.
 *
 * @param run - Runs a command and returns its stdout
 * @param root - The repository root
 * @param branch - The current branch
 * @param warnings - The list to add a failed lookup to
 * @returns The PR's base `name` and a `source` naming the PR, or null when there is no open PR
 */
function openPrBase(run, root, branch, warnings) {
  let pr;

  try {
    pr = JSON.parse(
      run(
        'gh',
        ['pr', 'view', branch, '--json', 'number,baseRefName,state'],
        root,
      ),
    );
  } catch (error) {
    const detail = String(error.stderr ?? '').trim() || error.message;
    // No gh, no PR for this branch, or no GitHub remote is an ordinary answer.
    if (
      error.code !== 'ENOENT' &&
      !/no (open )?pull requests? found|known GitHub host/i.test(detail)
    ) {
      warnings.push(
        `Could not ask GitHub for this branch's PR (${detail.split('\n')[0]}); using the next source.`,
      );
    }
    return null;
  }

  if (pr?.state !== 'OPEN' || typeof pr.baseRefName !== 'string') return null;

  return { name: pr.baseRefName, source: `PR #${pr.number}` };
}

/**
 * Finds the branch directly below this one in a `gh stack`.
 *
 * @param run - Runs a command and returns its stdout
 * @param root - The repository root
 * @param branch - The current branch
 * @returns The parent branch, or null when `gh stack` is not installed or the branch is in no stack or at its bottom
 * @throws When `gh stack view` fails or answers in a shape it cannot read, since guessing the base would retarget a mid-stack PR
 */
export function stackParent(run, root, branch) {
  const override = 'pass --base <branch> to name the base yourself';
  let stack;

  try {
    const answer = run('gh', ['stack', 'view', '--json'], root);
    // gh answers a missing extension with exit 0, an install hint, and no JSON on stdout.
    if (!answer.trim() || /gh extension install/.test(answer)) return null;
    stack = JSON.parse(answer);
  } catch (error) {
    const detail = String(error.stderr ?? '').trim() || error.message;
    if (error.code === 'ENOENT') return null;
    if (/unknown command "stack"/i.test(detail)) return null;
    if (/not (in|part of) a stack/i.test(detail)) return null;
    throw new Error(
      `Could not read the stack with \`gh stack view --json\` (${detail.split('\n')[0]}); ${override}.`,
    );
  }

  const list = Array.isArray(stack) ? stack : stack?.branches;
  if (!Array.isArray(list)) {
    throw new Error(
      `\`gh stack view --json\` answered in a shape this package cannot read; ${override}.`,
    );
  }

  const names = list.map((entry) =>
    typeof entry === 'string' ? entry : (entry?.name ?? entry?.branch),
  );
  const index = names.indexOf(branch);

  return index > 0 ? names[index - 1] : null;
}

/**
 * Reads the parent git recorded when the branch was created.
 *
 * VS Code, Claude Code worktrees and `wt` write it to
 * `branch.<name>.vscode-merge-base`.
 *
 * @param git - Runs git and returns its stdout
 * @param branch - The current branch
 * @param remotes - The repository's remote names
 * @returns The parent `name` and `source`, or null when none is recorded
 */
function recordedParent(git, branch, remotes) {
  const value = tryRun(() =>
    git('config', '--get', `branch.${branch}.vscode-merge-base`).trim(),
  );
  const name = branchName(value, remotes);

  return name && name !== branch
    ? { name, source: 'recorded when the branch was created' }
    : null;
}

/**
 * Reads where the branch was created from, out of its oldest reflog entry.
 *
 * @param git - Runs git and returns its stdout
 * @param branch - The current branch
 * @param remotes - The repository's remote names
 * @returns The parent `name` and `source`, or null when the reflog names no branch
 */
export function createdFrom(git, branch, remotes = ['origin']) {
  const entries = tryRun(() =>
    git('reflog', 'show', '--format=%gs', `refs/heads/${branch}`),
  );
  const oldest = entries?.trim().split('\n').at(-1) ?? '';
  const name = branchName(
    oldest.match(/^branch: Created from (.+)$/)?.[1],
    remotes,
  );

  return name && name !== branch ? { name, source: 'the branch reflog' } : null;
}

/**
 * Turns a ref as git records it into a branch name.
 *
 * @param value - Such as `origin/main`, `refs/heads/feat` or `HEAD`
 * @param remotes - The repository's remote names, any of which may prefix it
 * @returns The branch name, or null when the value names no branch
 */
function branchName(value, remotes) {
  if (!value) return null;

  let name = value.trim().replace(/^refs\/(heads|remotes)\//, '');
  const remote = remotes.find((one) => name.startsWith(`${one}/`));
  if (remote) name = name.slice(remote.length + 1);

  return name && !NOT_A_BRANCH.test(name) ? name : null;
}

/**
 * Finds where HEAD left a branch, using the local copy or `origin/`, whichever HEAD left later.
 *
 * On a tie the origin copy wins, as GitHub compares against it.
 *
 * @param git - Runs git and returns its stdout
 * @param name - The branch name
 * @returns The `ref` and `fork` commit, or null when neither copy exists
 */
export function latestFork(git, name) {
  let best = null;

  for (const ref of [`refs/heads/${name}`, `refs/remotes/origin/${name}`]) {
    if (
      tryRun(() =>
        git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`),
      ) == null
    ) {
      continue;
    }
    const fork = tryRun(() => git('merge-base', 'HEAD', ref).trim());
    if (!fork) continue;

    if (!best || isAncestor(git, best.fork, fork)) {
      best = { ref: ref.replace(/^refs\/(heads|remotes)\//, ''), fork };
    }
  }

  return best;
}

/**
 * Finds where HEAD left a commit given by any name git accepts, such as a tag or `origin/main`.
 *
 * @param git - Runs git and returns its stdout
 * @param name - The name given
 * @returns The `ref` as given and its `fork` commit, or null when git cannot resolve it
 */
function commitFork(git, name) {
  if (
    tryRun(() => git('rev-parse', '--verify', '--quiet', `${name}^{commit}`)) ==
    null
  ) {
    return null;
  }
  const fork = tryRun(() => git('merge-base', 'HEAD', name).trim());
  return fork ? { ref: name, fork } : null;
}

/**
 * Replaces a missing parent branch with the default branch.
 *
 * The parent's merged PR head becomes the fork when this branch still carries
 * it, which keeps a squash-merged parent's commits out of the diff.
 *
 * @param git - Runs git and returns its stdout
 * @param run - Runs a command and returns its stdout
 * @param root - The repository root
 * @param options - The current `branch`, the missing `parent`, the `baseBranch` and the `warnings` list
 * @returns The resolved base, as `resolveBase` returns it
 * @throws When the parent has no merged PR, or the default branch is missing too
 */
function replaceGoneParent(
  git,
  run,
  root,
  { branch, parent, baseBranch, warnings },
) {
  const mergedHead = mergedPrHead(run, root, parent.name);
  const main = latestFork(git, baseBranch);

  if (!mergedHead || !main) {
    throw new Error(
      `The parent branch ${parent.name} (${parent.source}) is not here locally or on origin, and no merged PR was found for it. Fetch it, or pass --base <branch>.`,
    );
  }

  // Where this branch left the parent's merged work, when that work is here.
  const parentFork = tryRun(() => git('merge-base', 'HEAD', mergedHead).trim());
  const fromParent =
    parentFork &&
    parentFork !== main.fork &&
    isAncestor(git, main.fork, parentFork);
  const fork = fromParent ? parentFork : main.fork;

  warnings.push(
    fromParent
      ? `${parent.name} (${parent.source}) has merged and is gone; comparing against ${baseBranch} from where this branch left it.`
      : `${parent.name} (${parent.source}) has merged and is gone, and its commits are not here; comparing against ${baseBranch}, which may include some of them.`,
  );

  return {
    base: baseBranch,
    ref: main.ref,
    fork,
    source: `${parent.source}, merged into ${baseBranch}`,
    branch,
    warnings,
  };
}

/**
 * Reads the last head commit of a branch's merged PR.
 *
 * @param run - Runs a command and returns its stdout
 * @param root - The repository root
 * @param name - The branch the PR came from
 * @returns The commit, or null when there is no merged PR or GitHub cannot be asked
 */
function mergedPrHead(run, root, name) {
  const answer = tryRun(() =>
    run(
      'gh',
      [
        'pr',
        'list',
        '--head',
        name,
        '--state',
        'merged',
        '--json',
        'headRefOid',
        '--limit',
        '1',
      ],
      root,
    ),
  );

  try {
    return JSON.parse(answer ?? '[]')[0]?.headRefOid ?? null;
  } catch {
    return null;
  }
}

/**
 * Says whether a repository has an `origin` remote.
 *
 * @param git - Runs git and returns its stdout
 * @returns Whether it does
 */
function hasOrigin(git) {
  return tryRun(() => git('remote', 'get-url', 'origin')) != null;
}

/**
 * Says whether one commit is an ancestor of another, or the same commit.
 *
 * @param git - Runs git and returns its stdout
 * @param older - The possible ancestor
 * @param newer - The possible descendant
 * @returns Whether it is
 */
function isAncestor(git, older, newer) {
  return tryRun(() => git('merge-base', '--is-ancestor', older, newer)) != null;
}

/**
 * Runs a function, turning a throw into null.
 *
 * @param fn - The function
 * @returns Its result, or null when it threw
 */
function tryRun(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Quotes a value for a POSIX shell.
 *
 * @param value - The value
 * @returns It in single quotes, with any single quote escaped
 */
function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Renders a resolved base as shell assignments for a skill to `eval`.
 *
 * @param resolved - What `resolveBase` returned
 * @returns `BASE_BRANCH`, `BASE_REF`, `FORK` and `BASE_SOURCE`, one per line
 */
export function baseAssignments(resolved) {
  return [
    ['BASE_BRANCH', resolved.base],
    ['BASE_REF', resolved.ref],
    ['FORK', resolved.fork],
    ['BASE_SOURCE', resolved.source],
  ]
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join('\n');
}
