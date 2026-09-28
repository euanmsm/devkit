// ============================================================================
// Test Repositories
// ============================================================================
//
// Builds throwaway git repositories holding a tiny TypeScript project, and runs
// the `dead-code` bin inside them.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The `dead-code` bin under test. */
export const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'dead-code.mjs',
);

/** A project with one unused file, one unused export and one unused type. */
export const PROJECT = {
  '.gitignore': 'node_modules/\n',
  'package.json': { name: 'fixture', private: true, type: 'module' },
  'knip.json': { entry: ['src/index.ts'], project: ['src/**/*.ts'] },
  'src/index.ts':
    "import { alsoUsed, used } from './lib';\nimport { helper } from './util/helper';\n\nconsole.log(used(), alsoUsed(), helper());\n",
  'src/lib.ts':
    'export function used() {\n  return 1;\n}\n\nexport function unused() {\n  return 2;\n}\n\nexport type Unused = { a: number };\n\nexport function alsoUsed() {\n  return 3;\n}\n',
  'src/orphan.ts': 'export const orphan = 1;\n',
  'src/util/helper.ts': 'export function helper() {\n  return 4;\n}\n',
};

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
 * Writes a file, creating its folder, and serialising anything but a string.
 *
 * @param path - Absolute file path
 * @param contents - Text, or a value to write as JSON
 */
export function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof contents === 'string'
      ? contents
      : `${JSON.stringify(contents, null, 2)}\n`,
  );
}

/**
 * Makes a committed repo on `main` holding the project plus any extra files.
 *
 * @param files - Repo-relative paths mapped to contents, laid over the project
 * @returns The repo's root
 */
export function makeRepo(files = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dead-code-')));

  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');

  for (const [rel, contents] of Object.entries({ ...PROJECT, ...files }))
    if (contents !== null) write(join(root, rel), contents);
  write(join(root, 'node_modules', '.keep'), '');

  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

/**
 * Commits everything in the working tree.
 *
 * @param root - The repo's root
 * @param message - The commit message
 */
export function commit(root, message = 'change') {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

/**
 * Runs the `dead-code` bin.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `dead-code`
 * @returns The exit status, stdout, and everything printed
 */
export function deadCode(cwd, args = []) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    out: `${result.stdout}${result.stderr}`,
  };
}

/**
 * Runs the bin with `--json` and parses the report.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `dead-code`
 * @returns The exit status and the parsed report
 * @throws When the output is not JSON
 */
export function report(cwd, args = []) {
  const { status, stdout, out } = deadCode(cwd, [...args, '--json']);
  try {
    return { status, json: JSON.parse(stdout) };
  } catch {
    throw new Error(`Not JSON (exit ${status}):\n${out}`);
  }
}
