// ============================================================================
// Postinstall Allowlist Tests
// ============================================================================

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { npmCommand, run, searchDirs } from '../src/allowlist.mjs';

const BIN = fileURLToPath(new URL('../bin/vouch.mjs', import.meta.url));

/** Builds a throwaway root whose node_modules holds one runnable package. */
function fixture(script, root = mkdtempSync(join(tmpdir(), 'devkit-'))) {
  const pkg = join(root, 'node_modules', 'fake');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{ "name": "host" }');
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({
      name: 'fake',
      version: '1.0.0',
      scripts: { install: script },
    }),
  );
  return root;
}

describe('run', () => {
  test('skips an allowlisted package that is not installed', () => {
    const entry = { pkg: 'absent', script: 'install', reason: 'x' };

    assert.deepEqual(run([entry], fixture('exit 0')), []);
  });

  test('runs the script of a package that is installed', () => {
    const entry = { pkg: 'fake', script: 'install', reason: 'x' };

    assert.deepEqual(run([entry], fixture('exit 0')), []);
  });

  test('reports a failing script rather than passing silently', () => {
    const entry = { pkg: 'fake', script: 'install', reason: 'x' };
    const failures = run([entry], fixture('exit 1'));

    assert.equal(failures.length, 1);
    assert.match(failures[0], /^install for fake failed:/);
  });
});

/** Allowlists the fixture package in a root's `.devkit/vouch.json`. */
function allow(root) {
  mkdirSync(join(root, '.devkit'), { recursive: true });
  writeFileSync(
    join(root, '.devkit', 'vouch.json'),
    JSON.stringify({
      allowed: [{ pkg: 'fake', script: 'install', reason: 'x' }],
    }),
  );
}

/** Runs the vouch command from a directory, outside any npm script. */
function vouch(cwd, extra = {}) {
  const env = { ...process.env, ...extra };
  if (!extra.npm_config_local_prefix) delete env.npm_config_local_prefix;
  return spawnSync(process.execPath, [BIN], { cwd, env, encoding: 'utf8' });
}

describe('main', () => {
  test('runs nothing, without crashing, where there is no .git', () => {
    const result = vouch(mkdtempSync(join(tmpdir(), 'devkit-')));

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /nothing to run/);
  });

  test('names the config when its allowlist is malformed', () => {
    const root = fixture('exit 0');
    mkdirSync(join(root, '.devkit'));
    writeFileSync(
      join(root, '.devkit', 'vouch.json'),
      JSON.stringify({ allowed: { pkg: 'fake', script: 'install' } }),
    );
    const result = vouch(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.devkit\/vouch\.json must hold/);
  });

  test('still skips an uninstalled entry that has no script field', () => {
    const root = fixture('echo > ran');
    mkdirSync(join(root, '.devkit'));
    writeFileSync(
      join(root, '.devkit', 'vouch.json'),
      JSON.stringify({
        allowed: [
          { pkg: 'fake', script: 'install', reason: 'x' },
          { pkg: 'absent', reason: 'no script' },
        ],
      }),
    );
    const result = vouch(root);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(root, 'node_modules', 'fake', 'ran')));
  });

  test('reads the project config where there is no .git', () => {
    const root = fixture('echo > ran');
    allow(root);

    assert.equal(vouch(root).status, 0);
    assert.ok(existsSync(join(root, 'node_modules', 'fake', 'ran')));
  });

  test('runs a package installed in a project below the git root', () => {
    const repo = mkdtempSync(join(tmpdir(), 'devkit-'));
    mkdirSync(join(repo, '.git'));
    allow(repo);
    const web = join(repo, 'web');
    fixture('echo > ran', web);

    assert.equal(vouch(web).status, 0);
    assert.ok(existsSync(join(web, 'node_modules', 'fake', 'ran')));
  });

  test('runs a package below the git root under an outer npm script', () => {
    const repo = mkdtempSync(join(tmpdir(), 'devkit-'));
    mkdirSync(join(repo, '.git'));
    allow(repo);
    writeFileSync(join(repo, 'package.json'), '{ "name": "repo" }');
    const web = join(repo, 'web');
    fixture('echo > ran', web);

    assert.equal(vouch(web, { npm_config_local_prefix: repo }).status, 0);
    assert.ok(existsSync(join(web, 'node_modules', 'fake', 'ran')));
  });

  test('runs a package hoisted to the workspace root from a member', () => {
    const ws = fixture('echo > ran');
    mkdirSync(join(ws, '.git'));
    allow(ws);
    writeFileSync(
      join(ws, 'package.json'),
      '{ "name": "ws", "workspaces": ["packages/*"] }',
    );
    const app = join(ws, 'packages', 'app');
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, 'package.json'), '{ "name": "app" }');

    const result = vouch(app);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(ws, 'node_modules', 'fake', 'ran')));
  });

  test("runs a workspace member's own copy from inside it", () => {
    const ws = mkdtempSync(join(tmpdir(), 'devkit-'));
    mkdirSync(join(ws, '.git'));
    allow(ws);
    writeFileSync(
      join(ws, 'package.json'),
      '{ "name": "ws", "workspaces": ["packages/*"] }',
    );
    const app = join(ws, 'packages', 'app');
    fixture('echo > ran', app);

    const result = vouch(app);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(app, 'node_modules', 'fake', 'ran')));
  });
});

describe('searchDirs', () => {
  test('walks up from the cwd to the git root', () => {
    assert.deepEqual(searchDirs('/a/b/c', resolve('/a'), {}), [
      resolve('/a/b/c'),
      resolve('/a/b'),
      resolve('/a'),
    ]);
  });

  test('walks to the filesystem root without a git root', () => {
    assert.equal(searchDirs('/a/b', null, {}).at(-1), resolve('/'));
  });

  test("adds npm's local prefix when it is off the walk", () => {
    assert.deepEqual(
      searchDirs('/a/b', resolve('/a'), { npm_config_local_prefix: '/x' }),
      [resolve('/a/b'), resolve('/a'), resolve('/x')],
    );
  });

  test("does not repeat npm's local prefix when it is on the walk", () => {
    assert.deepEqual(
      searchDirs('/a/b', resolve('/a'), { npm_config_local_prefix: '/a' }),
      [resolve('/a/b'), resolve('/a')],
    );
  });
});

describe('npmCommand', () => {
  const args = ['explore', 'sharp', '--', 'npm', 'run', 'install'];

  test('calls npm directly off Windows', () => {
    assert.deepEqual(npmCommand(args, 'linux', {}), ['npm', args, {}]);
  });

  test("runs npm's own script through node on Windows", () => {
    const cli = 'C:\\npm\\bin\\npm-cli.js';
    const [file, argv, options] = npmCommand(args, 'win32', {
      npm_execpath: cli,
    });

    assert.equal(file, process.execPath);
    assert.deepEqual(argv, [cli, ...args]);
    assert.deepEqual(options, {});
  });

  test('falls back to a quoted shell call on Windows without npm', () => {
    const [file, argv, options] = npmCommand(args, 'win32', {
      npm_execpath: 'C:\\pnpm\\pnpm.cjs',
    });

    assert.equal(file, 'npm');
    assert.deepEqual(
      argv,
      args.map((arg) => `"${arg}"`),
    );
    assert.deepEqual(options, { shell: true });
  });

  test('refuses an argument cmd cannot quote', () => {
    assert.throws(() => npmCommand(['a"b'], 'win32', {}), /cannot pass/);
  });
});
