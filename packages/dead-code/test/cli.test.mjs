// ============================================================================
// CLI Tests
// ============================================================================
//
// Checks the exit codes, the help text and `init`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { deadCode, makeRepo, write } from './repo.mjs';

describe('exit codes', () => {
  test('2 for an unknown option', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['--nope']);

    assert.equal(status, 2);
    assert.match(out, /dead-code: /);
  });

  test('2 for a config that does not validate', () => {
    const root = makeRepo({ '.devkit/dead-code.json': { known: [{}] } });

    const { status, out } = deadCode(root);

    assert.equal(status, 2);
    assert.match(out, /known\[0\]\.path/);
  });

  test('2 when knip cannot run', () => {
    const root = makeRepo({ 'knip.json': '{ not json' });

    const { status, out } = deadCode(root);

    assert.equal(status, 2);
    assert.match(out, /knip/i);
  });

  test('--help prints the usage and exits 0', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['--help']);

    assert.equal(status, 0);
    assert.match(out, /dead-code branch \[base\]/);
  });

  test('`help` is --help', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['help']);

    assert.equal(status, 0);
    assert.match(out, /dead-code branch \[base\]/);
  });

  test('2 for arguments a command does not take', () => {
    const root = makeRepo();

    assert.match(
      deadCode(root, ['init', 'extra']).out,
      /init takes no arguments/,
    );
    assert.match(
      deadCode(root, ['init', '--json']).out,
      /--json does not apply to dead-code init/,
    );
    assert.match(deadCode(root, ['--force']).out, /--force does not apply/);
  });
});

describe('--workspace', () => {
  test('overrides the configured workspaces', () => {
    const root = makeRepo({
      'package.json': {
        name: 'fixture',
        private: true,
        type: 'module',
        workspaces: ['packages/*'],
      },
      'knip.json': null,
      'packages/a/package.json': {
        name: 'a',
        type: 'module',
        main: 'index.ts',
      },
      'packages/a/index.ts': 'export const a = 1;\n',
      'packages/a/stray.ts': 'export const s = 1;\n',
      'packages/b/package.json': {
        name: 'b',
        type: 'module',
        main: 'index.ts',
      },
      'packages/b/index.ts': 'export const b = 1;\n',
      'packages/b/stray.ts': 'export const s = 1;\n',
      '.devkit/dead-code.json': { workspaces: ['packages/b'] },
    });

    const files = (args) =>
      JSON.parse(
        deadCode(root, [...args, '--include', 'files', '--json']).stdout,
      )
        .findings.map((f) => f.file)
        .filter((f) => f.startsWith('packages/'));

    assert.deepEqual(files([]), ['packages/b/stray.ts']);
    assert.deepEqual(files(['--workspace', 'packages/a']), [
      'packages/a/stray.ts',
    ]);

    // A folder is read from the current folder, like every other path.
    const fromA = JSON.parse(
      deadCode(join(root, 'packages/a'), [
        '--workspace',
        '.',
        '--include',
        'files',
        '--json',
      ]).stdout,
    );
    assert.equal(fromA.directory, '.');
    assert.deepEqual(
      fromA.findings.map((f) => f.file),
      ['packages/a/stray.ts'],
    );
    // A name that is no folder here still reaches knip as it is.
    assert.deepEqual(files(['--workspace', 'a']), ['packages/a/stray.ts']);
  });
});

describe('dead-code init', () => {
  test('writes the example config', () => {
    const root = makeRepo();

    const { status } = deadCode(root, ['init']);

    assert.equal(status, 0);
    const written = JSON.parse(
      readFileSync(join(root, '.devkit/dead-code.json'), 'utf8'),
    );
    assert.ok(Array.isArray(written.known));
  });

  test('refuses to overwrite without --force', () => {
    const root = makeRepo();
    write(join(root, '.devkit/dead-code.json'), { known: [] });

    const refused = deadCode(root, ['init']);
    assert.equal(refused.status, 2);
    assert.match(refused.out, /already exists.*--force/s);

    assert.equal(deadCode(root, ['init', '--force']).status, 0);
    assert.notDeepEqual(
      JSON.parse(readFileSync(join(root, '.devkit/dead-code.json'), 'utf8')),
      { known: [] },
    );
  });
});
