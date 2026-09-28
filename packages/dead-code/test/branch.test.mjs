// ============================================================================
// Branch Tests
// ============================================================================
//
// Runs `dead-code branch` on a feature branch, with real knip at both ends.

import assert from 'node:assert/strict';
import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { commit, deadCode, git, makeRepo, report, write } from './repo.mjs';

const WITHOUT_ALSO_USED =
  "import { used } from './lib';\nimport { helper } from './util/helper';\n\nconsole.log(used(), helper());\n";

/**
 * Makes the fixture repo and switches to a feature branch off `main`.
 *
 * @param files - Extra files for the first commit
 * @returns The repo's root
 */
function onBranch(files) {
  const root = makeRepo(files);
  git(root, 'switch', '-q', '-c', 'feat');
  return root;
}

/**
 * Counts the worktrees git knows about.
 *
 * @param root - The repo's root
 * @returns How many `worktree` records `git worktree list` prints
 */
function worktrees(root) {
  return git(root, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree ')).length;
}

describe('dead-code branch', () => {
  test('reports an export the branch left dead in a file it did not touch', () => {
    const root = onBranch();
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 1);
    assert.equal(json.mode, 'branch');
    assert.equal(json.base, 'main');
    assert.deepEqual(json.findings, [
      { type: 'export', file: 'src/lib.ts', name: 'alsoUsed', line: 11 },
    ]);
    assert.equal(worktrees(root), 1);
  });

  test('does not report debt that already existed at the fork point', () => {
    const root = onBranch();
    write(join(root, 'src/extra.ts'), 'export const extra = 1;\n');
    write(
      join(root, 'src/index.ts'),
      "import { extra } from './extra';\nimport { alsoUsed, used } from './lib';\nimport { helper } from './util/helper';\n\nconsole.log(extra, used(), alsoUsed(), helper());\n",
    );
    commit(root);

    const { status, json, out } = {
      ...report(root, ['branch', 'main']),
      out: deadCode(root, ['branch', 'main']).out,
    };

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
    assert.match(out, /No new dead code since main\./);
  });

  test('does not report old debt carried by a renamed file', () => {
    const root = onBranch();
    git(root, 'mv', 'src/lib.ts', 'src/core.ts');
    write(
      join(root, 'src/index.ts'),
      "import { alsoUsed, used } from './core';\nimport { helper } from './util/helper';\n\nconsole.log(used(), alsoUsed(), helper());\n",
    );
    git(root, 'mv', 'src/orphan.ts', 'src/stray.ts');
    commit(root);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
  });

  test('counts uncommitted changes', () => {
    const root = onBranch();
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 1);
    assert.deepEqual(
      json.findings.map((f) => f.name),
      ['alsoUsed'],
    );
  });

  test('applies known entries after the subtraction', () => {
    const root = onBranch({
      '.devkit/dead-code.json': {
        known: [{ path: 'lib', names: ['alsoUsed'], reason: 'kept' }],
      },
    });
    write(join(root, 'src/index.ts'), WITHOUT_ALSO_USED);

    const { status, json } = report(root, ['branch', 'main']);

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
    assert.deepEqual(
      json.known.map((f) => [f.name, f.reason]),
      [['alsoUsed', 'kept']],
    );
    assert.deepEqual(json.stale, []);
  });

  test('removes the temporary worktree even when knip fails at the fork point', () => {
    const root = onBranch({ 'knip.json': '{ not json' });
    writeFileSync(
      join(root, 'knip.json'),
      JSON.stringify({ entry: ['src/index.ts'], project: ['src/**/*.ts'] }),
    );
    commit(root);

    const { status, out } = deadCode(root, ['branch', 'main']);

    assert.equal(status, 2, out);
    assert.match(out, /knip/i);
    assert.equal(worktrees(root), 1);
    assert.equal(lstatSync(join(root, 'node_modules')).isDirectory(), true);
    assert.equal(existsSync(join(root, 'node_modules', '.keep')), true);
  });

  test('fails with a hint when the base has no merge base', () => {
    const root = onBranch();

    const { status, out } = deadCode(root, ['branch', 'nope']);

    assert.equal(status, 2);
    assert.match(out, /merge base with nope.*[Ff]etch it/s);
  });
});
