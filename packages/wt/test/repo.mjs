// ============================================================================
// Test Repositories
// ============================================================================
//
// Builds throwaway git repositories and runs the `wt` bin inside them.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The `wt` bin under test. */
export const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'wt.mjs',
);

/**
 * Runs git in a directory, hiding its output.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `git`
 * @returns What git wrote to stdout
 */
export function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

/**
 * Writes a file, creating its folder.
 *
 * @param path - Absolute file path
 * @param contents - Text to write
 */
export function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

/**
 * Makes a temp folder holding a committed repo at `<folder>/app-main`.
 *
 * @param files - Repo-relative paths mapped to contents, committed unless gitignored
 * @returns The temp folder and the repo's root
 */
export function makeRepo(files = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wt-')));
  const root = join(base, 'app-main');
  mkdirSync(root);

  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');

  for (const [rel, contents] of Object.entries(files)) {
    write(
      join(root, rel),
      typeof contents === 'string'
        ? contents
        : `${JSON.stringify(contents, null, 2)}\n`,
    );
  }

  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'init');
  return { base, root };
}

/**
 * Makes a folder holding a fake `code` that logs its arguments.
 *
 * @param base - The temp folder
 * @returns The folder to put on the PATH
 */
export function fakeCode(base) {
  const bin = join(base, 'bin');
  write(
    join(bin, 'code'),
    `#!/bin/sh\necho "$@" >> "${join(base, 'code.log')}"\n`,
  );
  chmodSync(join(bin, 'code'), 0o755);
  return bin;
}

/**
 * Runs the `wt` bin with a PATH holding only node, git and the given folders.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `wt`
 * @param extraPath - Folders searched before the system ones
 * @returns The exit status and everything printed
 */
export function wt(cwd, args, extraPath = []) {
  const PATH = [
    ...extraPath,
    dirname(process.execPath),
    '/usr/bin',
    '/bin',
  ].join(':');
  const env = { ...process.env, PATH };
  delete env.WORKTREE_PORT_OFFSET;

  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}
