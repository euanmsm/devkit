// ============================================================================
// Core Tests
// ============================================================================

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { compile, loadConfig, repoRoot } from '../src/index.mjs';

/** Builds a throwaway repo holding one devkit config file. */
function fixture(name, contents) {
  const root = mkdtempSync(join(tmpdir(), 'devkit-'));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.devkit'));
  mkdirSync(join(root, 'src', 'deep'), { recursive: true });
  if (name) writeFileSync(join(root, '.devkit', name), contents);
  return root;
}

describe('repoRoot', () => {
  test('walks up to the directory holding .git', () => {
    const root = fixture();

    assert.equal(repoRoot(join(root, 'src', 'deep')), root);
  });

  test('throws rather than guessing when nothing above is a repo', () => {
    assert.throws(() => repoRoot('/'), /No git repository/);
  });
});

describe('loadConfig', () => {
  test("reads a config out of the repo's .devkit directory", () => {
    const root = fixture('t.json', '{ "a": 1 }');

    assert.deepEqual(loadConfig('t.json', null, root), { a: 1 });
  });

  test('returns the fallback for a repo that configures nothing', () => {
    assert.deepEqual(loadConfig('absent.json', { a: 2 }, fixture()), { a: 2 });
  });

  test('names the file when it exists but does not parse', () => {
    const root = fixture('t.json', '{ not json');

    assert.throws(
      () => loadConfig('t.json', null, root),
      /t\.json is not valid JSON/,
    );
  });
});

describe('compile', () => {
  test('turns pattern sources into matchers', () => {
    assert.equal(
      compile(['^a/']).some((p) => p.test('a/b.ts')),
      true,
    );
  });

  test('drops an unusable pattern rather than failing the whole run', () => {
    assert.equal(compile(['^a/', '(((']).length, 1);
  });
});
