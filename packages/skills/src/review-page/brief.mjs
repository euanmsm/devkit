// ============================================================================
// Review Page Brief
// ============================================================================
//
// `prepare` writes the brief: the facts about a branch the agent plans its
// notes from. It names the base and why, and lists every changed file with its
// hunks, so the agent knows exactly what the notes must cover. Run again after
// new commits, it also lists the files whose diffs changed since last time.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { resolveBase, runCommand } from '../base.mjs';
import { branchDiff, hunkSummary } from './diff.mjs';

/**
 * Names the folder a branch's review page lives in.
 *
 * @param outputDir - The repo-relative folder review pages go under
 * @param branch - The branch name, or empty when detached
 * @param head - The HEAD commit, used when there is no branch
 * @returns The folder, relative to the repository root
 */
export function pageDir(outputDir, branch, head) {
  const name = branch ? branch.split('/').pop() : head.slice(0, 8);
  return path.join(outputDir.replace(/\/+$/, ''), name, 'review-page');
}

/**
 * Writes the brief for the current branch.
 *
 * @param root - The repository root
 * @param options - The `explicit` base, the shared `baseBranch`, the `outputDir`, and `resolve` and `run` stand-ins for tests
 * @returns The `brief`, its folder as `dir` (repo-relative) and any `warnings`
 * @throws When the base cannot be found or the branch has no commits over it
 */
export function prepare(
  root,
  {
    explicit,
    baseBranch,
    outputDir = 'tmp',
    resolve = resolveBase,
    run = runCommand,
  },
) {
  const git = (...args) => run('git', args, root);
  const resolved = resolve(root, { explicit, baseBranch, run });
  const warnings = [...resolved.warnings];
  const head = git('rev-parse', 'HEAD').trim();

  const commits = git(
    'log',
    '--reverse',
    '--format=%h%x09%s',
    `${resolved.fork}..HEAD`,
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split('\t');
      return { sha, subject: subject.join('\t') };
    });
  if (!commits.length) {
    throw new Error(
      `${resolved.branch || 'HEAD'} has no commits over ${resolved.base}; there is nothing to review.`,
    );
  }

  const files = branchDiff(git, resolved.fork);
  const dir = pageDir(outputDir, resolved.branch, head);
  const briefPath = path.join(root, dir, 'brief.json');
  // Only notes written against an earlier brief need to know what moved since.
  const previous = hasNotes(path.join(root, dir, 'notes'))
    ? readBrief(briefPath)
    : null;

  const brief = {
    branch: resolved.branch,
    base: resolved.base,
    baseSource: resolved.source,
    fork: resolved.fork,
    head,
    pr: openPr(run, root),
    commits,
    uncommitted: git('status', '--porcelain').split('\n').filter(Boolean)
      .length,
    totals: {
      files: files.length,
      hunks: files.reduce((n, file) => n + file.hunks.length, 0),
      additions: files.reduce((n, file) => n + file.additions, 0),
      deletions: files.reduce((n, file) => n + file.deletions, 0),
    },
    files: files.map((file) => ({
      path: file.path,
      ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      status: file.status,
      ...(file.binary ? { binary: true } : {}),
      additions: file.additions,
      deletions: file.deletions,
      hash: file.hash,
      hunks: file.hunks.map(hunkSummary),
    })),
    ...(previous ? { since: briefDelta(previous, files) } : {}),
  };

  if (!isIgnored(run, root, path.join(dir, 'brief.json'))) {
    warnings.push(
      `${dir} is not ignored by git; add ${outputDir.replace(/\/+$/, '')}/ to .gitignore so the page is never committed.`,
    );
  }

  mkdirSync(path.join(root, dir, 'notes'), { recursive: true });
  writeFileSync(briefPath, `${JSON.stringify(brief, null, 2)}\n`);
  return { brief, dir, warnings };
}

/**
 * Compares the files in an earlier brief with the current diff.
 *
 * @param previous - The earlier brief
 * @param files - The current parsed diff
 * @returns The paths whose diffs `changed`, the paths newly `added` to the diff, and the paths `dropped` from it
 */
export function briefDelta(previous, files) {
  const before = new Map(previous.files.map((file) => [file.path, file.hash]));
  const now = new Map(files.map((file) => [file.path, file.hash]));
  return {
    changed: [...now]
      .filter(([p, hash]) => before.has(p) && before.get(p) !== hash)
      .map(([p]) => p),
    added: [...now.keys()].filter((p) => !before.has(p)),
    dropped: [...before.keys()].filter((p) => !now.has(p)),
  };
}

/**
 * Reads a brief written earlier, if there is one.
 *
 * @param file - The brief's path
 * @returns The parsed brief, or null when it is missing or unreadable
 */
export function readBrief(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Tells whether the notes folder holds any notes yet.
 *
 * @param dir - The notes folder
 * @returns True when it holds a `.json` file
 */
function hasNotes(dir) {
  try {
    return readdirSync(dir).some((name) => name.endsWith('.json'));
  } catch {
    return false;
  }
}

/**
 * Reads the branch's open PR through the GitHub CLI.
 *
 * @param run - Runs a command and returns its stdout
 * @param root - The repository root
 * @returns The PR's `number`, `title`, `url` and `body`, or null when there is no PR or no `gh`
 */
function openPr(run, root) {
  try {
    const pr = JSON.parse(
      run('gh', ['pr', 'view', '--json', 'number,title,url,body'], root),
    );
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      body: pr.body ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Asks git whether a path would be ignored.
 *
 * @param run - Runs a command and returns its stdout
 * @param root - The repository root
 * @param file - The path, relative to the root
 * @returns True when git ignores it
 */
function isIgnored(run, root, file) {
  try {
    run('git', ['check-ignore', '-q', file], root);
    return true;
  } catch {
    return false;
  }
}
