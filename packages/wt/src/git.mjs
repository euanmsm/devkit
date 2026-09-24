// ============================================================================
// Git
// ============================================================================
//
// The git calls every command shares: running git, locating the main checkout
// and reading the worktree list.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * Runs git, throwing an error carrying its stderr.
 *
 * @param args - Arguments after `git`
 * @param cwd - Directory to run in
 * @returns What the command wrote to stdout, trimmed
 * @throws When git exits non-zero
 */
export function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(' ')} failed — ${detail}`);
  }
}

/**
 * Runs git, returning null on failure.
 *
 * @param args - Arguments after `git`
 * @param cwd - Directory to run in
 * @returns What the command wrote to stdout, or null when it failed
 */
export function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

/**
 * Runs git with its output shown to the user.
 *
 * @param args - Arguments after `git`
 * @param cwd - Directory to run in
 * @throws When git exits non-zero
 */
export function gitLoud(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'inherit' });
  } catch {
    throw new Error(`git ${args.join(' ')} failed.`);
  }
}

/**
 * Finds the root of the checkout a directory sits in, main or linked.
 *
 * @param cwd - Directory inside the checkout
 * @returns The checkout's root
 * @throws When the directory is not inside a git checkout
 */
export function checkoutRoot(cwd) {
  return realpathSync(git(['rev-parse', '--show-toplevel'], cwd));
}

/**
 * Finds the main checkout, the one every linked worktree hangs off.
 *
 * @param cwd - Directory inside any checkout of the repository
 * @returns The main checkout's root
 * @throws When the directory is not inside a git checkout
 */
export function mainRoot(cwd) {
  const common = git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd,
  );
  return realpathSync(dirname(common));
}

/**
 * Finds a linked worktree's private git directory from its `.git` file.
 *
 * @param root - A checkout's root
 * @returns The absolute admin directory, or null for the main checkout
 */
export function adminDir(root) {
  const dotGit = resolve(root, '.git');
  if (!existsSync(dotGit) || statSync(dotGit).isDirectory()) return null;

  const match = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, 'utf8'));
  if (!match) return null;

  const dir = match[1].trim();
  return isAbsolute(dir) ? dir : resolve(root, dir);
}

/**
 * Lists every checkout of the repository, main first.
 *
 * @param cwd - Directory inside any checkout of the repository
 * @returns One entry per checkout, with its path, branch and head
 */
export function worktrees(cwd) {
  const out = [];
  let current = null;

  for (const line of git(['worktree', 'list', '--porcelain'], cwd).split(
    '\n',
  )) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9), branch: null, head: null };
      out.push(current);
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    }
  }

  return out;
}

/**
 * True when a ref exists.
 *
 * @param ref - A full ref, such as `refs/heads/main`
 * @param cwd - Directory inside the repository
 * @returns Whether git can resolve the ref
 */
export function hasRef(ref, cwd) {
  return tryGit(['show-ref', '--verify', '--quiet', ref], cwd) !== null;
}

/**
 * Lists every tracked path in a checkout.
 *
 * @param root - The checkout's root
 * @returns Repo-relative paths git tracks
 */
export function trackedFiles(root) {
  return new Set(git(['ls-files'], root).split('\n').filter(Boolean));
}

/**
 * Resolves a path through symlinks, leaving a missing path as given.
 *
 * @param path - Any path
 * @returns The real path, or the resolved input when it does not exist
 */
export function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
