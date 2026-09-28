// ============================================================================
// Why Tests
// ============================================================================
//
// Runs `dead-code why`, which wraps knip's trace output.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { deadCode, makeRepo } from './repo.mjs';

describe('dead-code why', () => {
  test('turns a path relative to the current folder into a repo-root path', () => {
    const root = makeRepo();

    const { status, out } = deadCode(join(root, 'src'), [
      'why',
      'lib.ts',
      'unused',
    ]);

    assert.equal(status, 0, out);
    assert.match(out, /src\/lib\.ts:unused/);
    assert.doesNotMatch(out, /src\/lib\.ts:used/);
  });

  test('traces every export in the file when no export is named', () => {
    const root = makeRepo();

    const { out } = deadCode(root, ['why', 'src/lib.ts']);

    assert.match(out, /src\/lib\.ts:unused/);
    assert.match(out, /src\/lib\.ts:used/);
  });

  test('explains an unreachable file in plain English', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['why', 'src/orphan.ts']);

    assert.equal(status, 0);
    assert.match(out, /Nothing reaches src\/orphan\.ts/);
    assert.doesNotMatch(out, /not found in module graph/);
  });

  test('a missing file or no file at all is a usage error', () => {
    const root = makeRepo();

    assert.equal(deadCode(root, ['why', 'src/nope.ts']).status, 2);
    assert.equal(deadCode(root, ['why']).status, 2);
  });

  test('a folder is a usage error, not a knip failure', () => {
    const root = makeRepo();

    for (const path of ['.', 'src']) {
      const { status, out } = deadCode(root, ['why', path]);
      assert.equal(status, 2);
      assert.match(out, /why takes a file, not a folder/);
      assert.doesNotMatch(out, /knip could not run/);
    }
  });

  test('an export that is not in the file exits 2', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['why', 'src/lib.ts', 'nothere']);

    assert.equal(status, 2);
    assert.match(out, /No export nothere found in src\/lib\.ts/);
  });

  test('a file knip does not analyse is not called unused', () => {
    const root = makeRepo({ 'README.md': '# fixture\n' });

    const { status, out } = deadCode(root, ['why', 'README.md']);

    assert.equal(status, 0);
    assert.match(out, /Knip does not analyse README\.md/);
    assert.doesNotMatch(out, /Nothing reaches/);
  });

  test('takes a repo-root path from a subfolder', () => {
    const root = makeRepo();

    const { status, out } = deadCode(join(root, 'src/util'), [
      'why',
      'src/orphan.ts',
    ]);

    assert.equal(status, 0, out);
    assert.match(out, /Nothing reaches src\/orphan\.ts/);
  });

  test("ignores the config's workspaces, so a used file is not called unused", () => {
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
        main: 'src/index.js',
      },
      'packages/a/src/index.js':
        "import { y } from './lib.js';\nconsole.log(y);\n",
      'packages/a/src/lib.js': 'export const y = 1;\n',
      'packages/b/package.json': {
        name: 'b',
        type: 'module',
        main: 'index.js',
      },
      'packages/b/index.js': 'export const b = 1;\n',
      '.devkit/dead-code.json': { workspaces: ['packages/b'] },
    });

    const { status, out } = deadCode(root, [
      'why',
      'packages/a/src/lib.js',
      'y',
    ]);

    assert.equal(status, 0, out);
    assert.doesNotMatch(out, /Nothing reaches/);
    assert.match(out, /packages\/a\/src\/index\.js/);
  });

  test('takes no --json', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['why', 'src/lib.ts', '--json']);

    assert.equal(status, 2);
    assert.match(out, /--json does not apply to dead-code why/);
  });
});
