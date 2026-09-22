// ============================================================================
// Check Comments — Tests
// ============================================================================
//
// Covers finding the merge base, listing governed files, reading added-line
// ranges out of a diff, and resolving a renamed file's base path.

import { test, describe, before, after as afterAll } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  addedRanges,
  addedRangesByFile,
  changedFiles,
  mergeBase,
  renamedFrom,
} from '../src/check.mjs';

describe('addedRanges', () => {
  test('reads a multi-line hunk', () => {
    const patch = '@@ -10,0 +11,3 @@\n+a\n+b\n+c\n';

    assert.deepEqual(addedRanges(patch), [{ from: 11, to: 13 }]);
  });

  test('treats a hunk with no count as one line', () => {
    const patch = '@@ -4 +4 @@\n-old\n+new\n';

    assert.deepEqual(addedRanges(patch), [{ from: 4, to: 4 }]);
  });

  test('reads every hunk in the patch', () => {
    const patch = '@@ -1,0 +2,1 @@\n+a\n@@ -20,0 +30,2 @@\n+b\n+c\n';

    assert.deepEqual(addedRanges(patch), [
      { from: 2, to: 2 },
      { from: 30, to: 31 },
    ]);
  });

  test('skips a pure deletion, which adds no lines', () => {
    const patch = '@@ -5,3 +4,0 @@\n-a\n-b\n-c\n';

    assert.deepEqual(addedRanges(patch), []);
  });

  test('ignores diff noise that is not a hunk header', () => {
    const patch =
      'diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n+a\n';

    assert.deepEqual(addedRanges(patch), [{ from: 1, to: 1 }]);
  });

  test('returns nothing for an empty patch', () => {
    assert.deepEqual(addedRanges(''), []);
  });
});

describe('changedFiles', () => {
  let root;
  let cwd;

  /** Writes a file inside the fixture repo, creating its directories. */
  function write(path, contents) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents, 'utf8');
  }

  /** Runs git inside the fixture repo. */
  function git(...args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  }

  before(() => {
    cwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'comment-check-'));

    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'Test');

    write('apps/main/src/a.ts', 'export const a = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('branch', 'base-marker');

    write('apps/main/src/a.ts', 'export const a = 2;\n');
    write('apps/main/src/b.tsx', 'export const b = 1;\n');
    write('scripts/ci/tool.mjs', 'export const e = 1;\n');
    git('mv', 'apps/main/src/a.ts', 'apps/main/src/renamed.ts');
    write('apps/main/src/renamed.ts', 'export const a = 2;\n');
    write('apps/main/src/c.d.ts', 'declare const c: number;\n');
    write('apps/main/public/vendor.min.mjs', 'export const f = 1;\n');
    write('apps/docs/postcss.config.js', 'export default {};\n');
    write('apps/main/README.md', '# x\n');
    git('add', '-A');
    git('commit', '-qm', 'change');

    process.chdir(root);
  });

  afterAll(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  test('finds the merge base with a branch', () => {
    assert.equal(typeof mergeBase('base-marker'), 'string');
  });

  test('returns null for a ref that does not exist', () => {
    assert.equal(mergeBase('no-such-ref'), null);
  });

  test('lists every governed source file, repo-wide', () => {
    const files = changedFiles(mergeBase('base-marker'));

    assert.deepEqual(files.sort(), [
      'apps/docs/postcss.config.js',
      'apps/main/src/b.tsx',
      'apps/main/src/renamed.ts',
      'scripts/ci/tool.mjs',
    ]);
  });

  test('skips generated, vendored and ungoverned files', () => {
    const files = changedFiles(mergeBase('base-marker'));

    assert.equal(files.includes('apps/main/src/c.d.ts'), false);
    assert.equal(files.includes('apps/main/public/vendor.min.mjs'), false);
    assert.equal(files.includes('apps/main/README.md'), false);
  });

  test('throws for an unusable base rather than reporting no changes', () => {
    assert.throws(() => changedFiles('no-such-ref'));
  });

  test("reads every file's added ranges from one diff", () => {
    const from = mergeBase('base-marker');
    const spans = addedRangesByFile(from, [
      ...changedFiles(from),
      'apps/main/src/a.ts',
    ]);

    assert.deepEqual(spans.get('apps/main/src/b.tsx'), [{ from: 1, to: 1 }]);
    assert.deepEqual(spans.get('scripts/ci/tool.mjs'), [{ from: 1, to: 1 }]);
    assert.deepEqual(spans.get('apps/main/src/renamed.ts'), [
      { from: 1, to: 1 },
    ]);
  });

  test('holds nothing for a path outside the set it was given', () => {
    const from = mergeBase('base-marker');

    assert.equal(
      addedRangesByFile(from, ['apps/main/src/b.tsx']).has(
        'scripts/ci/tool.mjs',
      ),
      false,
    );
  });
});

describe('renamedFrom', () => {
  let root;
  let cwd;

  /** Runs git inside the fixture repo. */
  function git(...args) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  }

  before(() => {
    cwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'comment-rename-'));

    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'Test');

    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/old.ts'), 'export const a = 1;\n', 'utf8');
    writeFileSync(join(root, 'src/kept.ts'), 'export const b = 1;\n', 'utf8');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('branch', 'base-marker');

    git('mv', 'src/old.ts', 'src/new.ts');
    git('commit', '-qm', 'rename');

    process.chdir(root);
  });

  afterAll(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  test('maps a renamed path back to its old name', () => {
    assert.equal(
      renamedFrom(mergeBase('base-marker')).get('src/new.ts'),
      'src/old.ts',
    );
  });

  test('holds nothing for a file that did not move', () => {
    assert.equal(
      renamedFrom(mergeBase('base-marker')).has('src/kept.ts'),
      false,
    );
  });

  test('throws for an unusable base rather than reporting no renames', () => {
    assert.throws(() => renamedFrom('no-such-ref'));
  });
});
