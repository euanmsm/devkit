// ============================================================================
// Worktree
// ============================================================================
//
// Checks a commit out into a throwaway git worktree knip can analyse, without
// hooks or smudge filters, with submodules filled in and a node_modules whose
// workspace packages resolve to the worktree's own copies. It is removed
// afterwards, even when interrupted, and no other worktree is touched.

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { git, run } from './git.mjs';
import { stopKnip } from './knip.mjs';
import {
  inside,
  reader,
  real,
  workspacePackages,
  withPrefix,
} from './project.mjs';

const PREFIX = 'dead-code-base-';
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

// A junction needs no admin rights or Developer Mode on Windows.
const DIR_LINK = process.platform === 'win32' ? 'junction' : 'dir';

/**
 * Builds the `-c` options that switch off every configured filter driver.
 *
 * A smudge filter such as git-lfs would download or fail on content knip never
 * reads, so each driver's blobs are checked out as stored.
 *
 * @param root - The repository root
 * @returns `-c` arguments for git
 */
function noFilters(root) {
  const names = new Set(
    (git(root, 'config', '--name-only', '--get-regexp', '^filter\\.') ?? '')
      .split('\n')
      .map((key) => key.match(/^filter\.(.+)\.[^.]+$/)?.[1])
      .filter(Boolean),
  );
  names.add('lfs');

  return [...names].flatMap((name) => [
    '-c',
    `filter.${name}.smudge=`,
    '-c',
    `filter.${name}.process=`,
    '-c',
    `filter.${name}.required=false`,
  ]);
}

/**
 * Builds the options every checkout into a throwaway tree runs git with.
 *
 * @param root - The repository root
 * @returns `-c` arguments that disable hooks, filters and submodule recursion
 */
function quietCheckout(root) {
  return [
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'submodule.recurse=false',
    ...noFilters(root),
  ];
}

/** Environment for a checkout that must not run git-lfs's smudge step. */
const NO_LFS = { GIT_LFS_SKIP_SMUDGE: '1' };

/**
 * Forgets one worktree: removes it, or at least its record inside `.git`.
 *
 * Never runs `git worktree prune`, which would also drop the records of the
 * user's own worktrees that happen to be unreachable just now.
 *
 * @param root - The repository root
 * @param tree - The worktree's path
 */
function forget(root, tree) {
  if (git(root, 'worktree', 'remove', '--force', tree) !== null) return;

  const common = git(
    root,
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  )?.trim();
  const records = common && join(common, 'worktrees');
  if (!records || !existsSync(records)) return;

  const want = join(tree, '.git');
  for (const name of readdirSync(records)) {
    let gitdir;
    try {
      gitdir = readFileSync(join(records, name, 'gitdir'), 'utf8').trim();
    } catch {
      continue;
    }
    if (resolve(gitdir) === want)
      rmSync(join(records, name), { recursive: true, force: true });
  }
}

/**
 * Tells whether a process is still running.
 *
 * @param pid - Its id
 * @returns True when it is, or when that cannot be told
 */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Removes the worktrees earlier runs left behind when they were killed
 * outright, such as by SIGKILL, recognised by their folder name and a pid
 * file naming a process that has gone.
 *
 * @param root - The repository root
 */
export function sweep(root) {
  const list = git(root, 'worktree', 'list', '--porcelain') ?? '';

  for (const line of list.split('\n')) {
    const tree = line.startsWith('worktree ') ? line.slice(9) : null;
    if (!tree || basename(tree) !== 'tree') continue;
    const tmp = dirname(tree);
    if (!basename(tmp).startsWith(PREFIX)) continue;

    let pid = 0;
    try {
      pid = Number(readFileSync(join(tmp, 'pid'), 'utf8'));
    } catch {
      // A missing pid file means the run is long gone.
    }
    if (pid && alive(pid)) continue;

    // Neither step follows the node_modules links out of the tree.
    forget(root, tree);
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Links one entry of an installed node_modules into the tree's copy.
 *
 * @param from - The installed entry
 * @param to - Where it goes in the tree
 * @param target - The folder to link to instead, for a workspace package
 */
function linkEntry(from, to, target) {
  if (existsSync(to)) return;
  if (target) {
    symlinkSync(target, to, DIR_LINK);
    return;
  }

  let path;
  try {
    path = real(from);
  } catch {
    return;
  }
  if (statSync(path).isDirectory()) symlinkSync(path, to, DIR_LINK);
  else copyFileSync(path, to);
}

/**
 * Builds a real node_modules folder in the tree, one link per installed
 * package, pointing workspace packages (`packages`, name to folder) and any
 * other link into the repository at the tree's own copies, or dropping one the
 * fork point does not have.
 *
 * @param options - `{ root, tree, from, to, packages }`
 */
function buildNodeModules({ root, tree, from, to, packages }) {
  mkdirSync(to, { recursive: true });

  /**
   * Links one package, given its name.
   *
   * @param name - The package's name, scoped or not
   */
  const link = (name) => {
    const source = join(from, name);
    const dest = join(to, name);
    if (packages.has(name)) return linkEntry(source, dest, packages.get(name));

    let path;
    try {
      path = real(source);
    } catch {
      return;
    }
    const rel = inside(root, path);
    if (rel !== null && !rel.split('/').includes('node_modules')) {
      const own = join(tree, rel);
      if (existsSync(own)) linkEntry(source, dest, own);
      return;
    }
    linkEntry(source, dest, null);
  };

  for (const entry of readdirSync(from)) {
    const path = join(from, entry);
    if (entry.startsWith('@') && lstatSync(path).isDirectory()) {
      mkdirSync(join(to, entry), { recursive: true });
      for (const child of readdirSync(path)) link(`${entry}/${child}`);
    } else link(entry);
  }

  // A workspace package the install never linked still resolves by name.
  for (const [name, dir] of packages) {
    const dest = join(to, name);
    if (existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    symlinkSync(dir, dest, DIR_LINK);
  }
}

/**
 * Gives the tree a node_modules for its root and each of its package folders.
 * Takes the git root, the tree, the commit it holds, the project's path from
 * the git root, and the branch's renames (old path to new path).
 *
 * @param options - `{ root, tree, commit, prefix, renames }`
 * @param made - Collects each node_modules folder made, to remove afterwards
 */
function linkNodeModules({ root, tree, commit, prefix, renames }, made) {
  const files = run(root, ['ls-tree', '-r', '-z', '--name-only', commit])
    .split('\0')
    .filter((f) => f === 'package.json' || f.endsWith('/package.json'))
    .filter((f) => !f.split('/').includes('node_modules'));

  const project = join(tree, prefix);
  const inProject = files
    .map((f) => (prefix ? inside(prefix, f) : f))
    .filter((f) => f !== null && !f.startsWith('..'));
  const packages = new Map(
    [...workspacePackages(inProject, reader(project))].map(([name, dir]) => [
      name,
      join(project, dir),
    ]),
  );

  const dirs = new Set(['', prefix, ...files.map((f) => dirname(f))]);
  for (const dir of dirs) {
    const rel = dir === '.' ? '' : dir;
    // A package folder the branch renamed keeps its install under the new name.
    const now = renames.get(withPrefix(rel, 'package.json'));
    const from = join(root, now ? dirname(now) : rel, 'node_modules');
    const to = join(tree, rel, 'node_modules');
    if (!existsSync(from) || existsSync(to) || !existsSync(join(tree, rel)))
      continue;

    made.push(to);
    buildNodeModules({ root, tree, from, to, packages });
  }
}

/**
 * Fills in the submodules the commit records, at the commits it records.
 *
 * Each is read from the submodule's own checkout under the repository root,
 * through a throwaway index, so neither repository's state changes.
 *
 * @param options - `{ root, tree, commit, tmp }`
 * @returns The submodule paths that could not be filled in
 */
function fillSubmodules({ root, tree, commit, tmp }) {
  const missing = [];
  const listing = run(root, ['ls-tree', '-r', '-z', commit]).split('\0');
  const gitlinks = listing
    .map((record) => record.match(/^160000 commit ([0-9a-f]+)\t(.+)$/s))
    .filter(Boolean);

  for (const [i, [, sha, path]] of gitlinks.entries()) {
    const source = join(root, path);
    const index = join(tmp, `submodule-index-${i}`);

    if (!existsSync(join(source, '.git'))) {
      missing.push(path);
      continue;
    }
    try {
      const opts = quietCheckout(source);
      run(source, ['read-tree', sha], { GIT_INDEX_FILE: index });
      run(
        source,
        [
          ...opts,
          'checkout-index',
          '-a',
          '-f',
          `--prefix=${join(tree, path)}/`,
        ],
        { GIT_INDEX_FILE: index, ...NO_LFS },
      );
    } catch {
      missing.push(path);
    }
  }

  return missing;
}

/**
 * Runs a function inside a temporary worktree checked out at a commit.
 *
 * @param options - `{ root, commit, prefix, renames }`
 * @param fn - Receives `{ tree, missingSubmodules }`
 * @returns What the function returned
 */
export async function atCommit(
  { root, commit, prefix = '', renames = new Map() },
  fn,
) {
  const tmp = real(mkdtempSync(join(tmpdir(), PREFIX)));
  const tree = join(tmp, 'tree');
  const made = [];
  writeFileSync(join(tmp, 'pid'), String(process.pid));

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    // Removed first, so no removal below can reach the real node_modules.
    for (const nm of made) rmSync(nm, { recursive: true, force: true });
    forget(root, tree);
    rmSync(tmp, { recursive: true, force: true });
  };
  const onSignal = (signal) => {
    stopKnip(signal);
    cleanup();
    for (const s of SIGNALS) process.off(s, onSignal);
    process.kill(process.pid, signal);
  };
  for (const s of SIGNALS) process.on(s, onSignal);

  try {
    run(
      root,
      [
        ...quietCheckout(root),
        'worktree',
        'add',
        '--detach',
        '--quiet',
        tree,
        commit,
      ],
      NO_LFS,
    );
    const missingSubmodules = fillSubmodules({ root, tree, commit, tmp });
    linkNodeModules({ root, tree, commit, prefix, renames }, made);
    return await fn({ tree, missingSubmodules });
  } finally {
    for (const s of SIGNALS) process.off(s, onSignal);
    cleanup();
  }
}
