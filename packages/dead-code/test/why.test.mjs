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
});
