// ============================================================================
// Git
// ============================================================================
//
// The git questions branch mode asks: which base to compare with, where the
// branch forked from it, and which files the branch renamed.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The bases tried, in order, when none is given. `origin/HEAD` comes first. */
export const DEFAULT_BASES = ['origin/main', 'origin/master', 'main', 'master'];

// A low similarity bar, and no cap on how many files are compared.
const RENAMES = ['--find-renames=20%', '-l0'];

/**
 * Runs git, throwing an error carrying its stderr.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `git`
 * @param env - Extra environment variables
 * @returns What the command wrote to stdout
 */
export function run(cwd, args, env) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
}

/**
 * Runs git, swallowing a failure.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `git`
 * @returns What the command wrote to stdout, or null when it failed
 */
export function git(cwd, ...args) {
  try {
    return run(cwd, args);
  } catch {
    return null;
  }
}

/**
 * Tells whether a name resolves to a commit.
 *
 * @param root - The repository root
 * @param ref - A branch, tag or commit
 * @returns True when it does
 */
function isCommit(root, ref) {
  return (
    git(root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`) !== null
  );
}

/**
 * Picks the base to compare with when none is given: the branch `origin/HEAD`
 * points at, or else the first of `DEFAULT_BASES` that exists.
 *
 * @param root - The repository root
 * @returns The base
 * @throws When none of them exists
 */
export function defaultBase(root) {
  const head = git(
    root,
    'symbolic-ref',
    '--quiet',
    '--short',
    'refs/remotes/origin/HEAD',
  )?.trim();
  const tried = [...(head ? [head] : []), ...DEFAULT_BASES];
  const found = tried.find((ref) => isCommit(root, ref));
  if (found) return found;

  throw new Error(
    `Found no base to compare with: tried origin/HEAD, ${DEFAULT_BASES.join(', ')}. Pass one: dead-code branch <base>. If the remote has it, fetch it first, such as git fetch origin main:refs/remotes/origin/main.`,
  );
}

/**
 * Names the commit the branch diverged from, or why there is none: a base
 * missing here, or a shallow clone.
 *
 * @param root - The repository root
 * @param base - The branch to compare against
 * @returns The merge base
 * @throws When there is no merge base
 */
export function mergeBase(root, base) {
  const fork = git(root, 'merge-base', base, 'HEAD')?.trim();
  if (fork) return fork;

  if (!isCommit(root, base))
    throw new Error(
      `${base} is not a commit in this clone. Fetch it (for a remote branch, git fetch origin <branch>), or pass another base.`,
    );
  if (git(root, 'rev-parse', '--is-shallow-repository')?.trim() === 'true')
    throw new Error(
      `This clone is shallow, so it holds no commit shared by ${base} and HEAD. Fetch the history with git fetch --unshallow, or in GitHub Actions set fetch-depth: 0 on actions/checkout.`,
    );
  throw new Error(
    `${base} and HEAD share no history, so there is no fork point.`,
  );
}

/**
 * Reads `git diff -z --name-status` output.
 *
 * @param out - The NUL-separated records
 * @returns `{ renames, added, deleted }`: old path to new path, and path sets
 */
export function parseChanges(out) {
  const renames = new Map();
  const added = new Set();
  const deleted = new Set();
  const fields = out.split('\0');

  for (let i = 0; i < fields.length;) {
    const code = fields[i];
    if (!code) break;
    // Renames and copies carry two paths, every other status one.
    if (code.startsWith('R') || code.startsWith('C')) {
      if (code.startsWith('R')) renames.set(fields[i + 1], fields[i + 2]);
      i += 3;
      continue;
    }
    if (code === 'A') added.add(fields[i + 1]);
    if (code === 'D') deleted.add(fields[i + 1]);
    i += 2;
  }

  return { renames, added, deleted };
}

/**
 * Lists the files the working tree renamed, added and deleted since a commit.
 * Staged and unstaged changes count: untracked files are marked intent-to-add
 * in a throwaway copy of the index, which leaves the real one alone.
 *
 * @param root - The repository root
 * @param from - The fork point
 * @returns `{ renames, added, deleted }`, paths from the git root
 */
export function changesSince(root, from) {
  const args = ['diff', '-z', '--no-color', '--name-status', ...RENAMES, from];
  const tmp = mkdtempSync(join(tmpdir(), 'dead-code-index-'));
  const copy = join(tmp, 'index');

  try {
    const index = run(root, [
      'rev-parse',
      '--path-format=absolute',
      '--git-path',
      'index',
    ]).trim();
    if (existsSync(index)) copyFileSync(index, copy);
    const env = { GIT_INDEX_FILE: copy };
    if (!existsSync(index)) run(root, ['read-tree', 'HEAD'], env);
    run(root, ['add', '--intent-to-add', '--all', '--', ':/'], env);
    return parseChanges(run(root, args, env));
  } catch {
    // Without the throwaway index, moves still count once they are staged.
    return parseChanges(run(root, args));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Tells whether the working tree matches HEAD exactly, untracked files included.
 *
 * @param root - The repository root
 * @returns True when there is nothing to commit
 */
export function isClean(root) {
  return (
    run(root, ['status', '--porcelain', '--untracked-files=all']).trim() === ''
  );
}
