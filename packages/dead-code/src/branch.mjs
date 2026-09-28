// ============================================================================
// Branch
// ============================================================================
//
// `dead-code branch`. Runs knip at the fork point, in a throwaway worktree, and
// on the working tree, then keeps only the findings the branch introduced.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { analyse } from './knip.mjs';

// A missed rename reads a moved file's existing debt as new.
const RENAMES = '--find-renames=20%';

/**
 * Runs git, throwing an error carrying its stderr.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `git`
 * @returns What the command wrote to stdout
 */
function run(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Runs git, swallowing a failure.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `git`
 * @returns What the command wrote to stdout, or null when it failed
 */
function git(cwd, ...args) {
  try {
    return run(cwd, args);
  } catch {
    return null;
  }
}

/**
 * Names the commit the branch diverged from.
 *
 * @param root - The repository root
 * @param base - The branch to compare against
 * @returns The merge base, or null when there is none
 */
export function mergeBase(root, base) {
  return git(root, 'merge-base', base, 'HEAD')?.trim() || null;
}

/**
 * Maps each path the working tree renamed to its name at the fork point.
 *
 * @param root - The repository root
 * @param from - The fork point
 * @returns Old path to new path, for renames only
 */
export function renamedTo(root, from) {
  const out = new Map();

  for (const line of run(root, ['diff', '--name-status', RENAMES, from]).split(
    '\n',
  )) {
    const [code, old, now] = line.split('\t');
    if (code?.startsWith('R') && old && now) out.set(old, now);
  }

  return out;
}

/**
 * Lists the folders holding a package.json the working tree knows about.
 *
 * @param root - The repository root
 * @returns Repo-relative folders, `''` for the root
 */
function packageDirs(root) {
  const files = run(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    'package.json',
    '*/package.json',
  ]).split('\0');

  return [
    '',
    ...files.filter((f) => f.endsWith('/package.json')).map((f) => dirname(f)),
  ];
}

/**
 * Symlinks every installed node_modules folder into the worktree.
 *
 * @param root - The repository root
 * @param tree - The worktree's root
 * @returns The links made
 */
function linkNodeModules(root, tree) {
  const links = [];

  for (const dir of packageDirs(root)) {
    const target = join(root, dir, 'node_modules');
    const link = join(tree, dir, 'node_modules');
    if (!existsSync(target) || existsSync(link)) continue;

    mkdirSync(join(tree, dir), { recursive: true });
    symlinkSync(target, link, 'dir');
    links.push(link);
  }

  return links;
}

/**
 * Runs a function inside a temporary worktree checked out at a commit.
 *
 * @param root - The repository root
 * @param commit - The commit to check out
 * @param fn - Receives the worktree's root
 * @returns What the function returned
 */
export async function atCommit(root, commit, fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'dead-code-base-'));
  const tree = join(tmp, 'tree');
  const links = [];

  try {
    run(root, ['worktree', 'add', '--detach', '--quiet', tree, commit]);
    links.push(...linkNodeModules(root, tree));
    return await fn(tree);
  } finally {
    // Unlinked first, so no removal below can reach the real node_modules.
    for (const link of links) unlinkSync(link);
    const removed = git(root, 'worktree', 'remove', '--force', tree) !== null;
    rmSync(tmp, { recursive: true, force: true });
    // Pruning also drops other stale worktrees, so only a failed removal runs it.
    if (!removed) git(root, 'worktree', 'prune');
  }
}

/**
 * Builds the key two findings share when they are the same issue.
 *
 * @param finding - A finding
 * @returns `type|file|name`, without the line
 */
function key(finding) {
  return `${finding.type}|${finding.file}|${finding.name}`;
}

/**
 * Moves a fork-point finding onto the path its file has now.
 *
 * @param finding - A finding from the fork point
 * @param renames - Old path to new path
 * @returns The finding under its current path
 */
function moved(finding, renames) {
  const file = renames.get(finding.file);
  if (!file) return finding;
  return {
    ...finding,
    file,
    name: finding.type === 'file' ? file : finding.name,
  };
}

/**
 * Finds what the branch newly left dead, compared with its fork point.
 *
 * @param options - `{ root, base, workspaces, include }`
 * @returns `{ findings, hints, fork }`, hints from the working tree
 * @throws When there is no merge base, or knip fails on either side
 */
export async function branchFindings({ root, base, workspaces, include }) {
  const fork = mergeBase(root, base);
  if (!fork)
    throw new Error(
      `Could not find a merge base with ${base}. Fetch it, or pass one as an argument.`,
    );

  const renames = renamedTo(root, fork);
  // Settled together, so the worktree is gone before any failure is reported.
  const results = await Promise.allSettled([
    atCommit(root, fork, (tree) =>
      analyse({ cwd: tree, workspaces, include }),
    ).catch((error) => {
      error.message = `At the fork point ${fork.slice(0, 7)}, ${error.message}`;
      throw error;
    }),
    analyse({ cwd: root, workspaces, include }),
  ]);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  const [before, after] = results.map((r) => r.value);

  const seen = new Set(before.findings.map((f) => key(moved(f, renames))));
  return {
    findings: after.findings.filter((f) => !seen.has(key(f))),
    hints: after.hints,
    fork,
  };
}
