// ============================================================================
// Config Tests
// ============================================================================
//
// Checks that `.devkit/dead-code.json` is validated with errors naming the key.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DEFAULTS, validate } from '../src/config.mjs';

const SOURCE = '.devkit/dead-code.json';

describe('validate', () => {
  test('fills the defaults when the file is absent', () => {
    const config = validate(null, SOURCE);

    assert.deepEqual(config.workspaces, []);
    assert.deepEqual(config.include, DEFAULTS.include);
    assert.deepEqual(config.known, []);
  });

  test('compiles each known path and keeps its names and reason', () => {
    const config = validate(
      {
        workspaces: ['apps/main'],
        include: ['files'],
        known: [{ path: '^src/', names: ['a'], reason: 'kept' }],
      },
      SOURCE,
    );

    assert.deepEqual(config.workspaces, ['apps/main']);
    assert.deepEqual(config.include, ['files']);
    assert.ok(config.known[0].pattern.test('src/x.ts'));
    assert.deepEqual(config.known[0].names, ['a']);
    assert.equal(config.known[0].reason, 'kept');
  });

  test('a bad regex names the entry', () => {
    assert.throws(
      () => validate({ known: [{ path: '(', reason: 'x' }] }, SOURCE),
      /\.devkit\/dead-code\.json: known\[0\]\.path/,
    );
  });

  test('a missing reason names the entry', () => {
    assert.throws(
      () => validate({ known: [{ path: 'a' }, { path: 'b' }] }, SOURCE),
      /\.devkit\/dead-code\.json: known\[0\]\.reason/,
    );
  });

  test('an unknown top-level key is named', () => {
    assert.throws(
      () => validate({ workspace: ['apps/main'] }, SOURCE),
      /\.devkit\/dead-code\.json: unknown key "workspace"/,
    );
  });

  test('an unknown key in a known entry is named', () => {
    assert.throws(
      () =>
        validate({ known: [{ path: 'a', reason: 'b', name: 'x' }] }, SOURCE),
      /known\[0\]: unknown key "name"/,
    );
  });

  test('keys starting with an underscore are notes, and allowed', () => {
    assert.doesNotThrow(() => validate({ _readme: 'notes' }, SOURCE));
  });

  test('a wrongly typed value names the key', () => {
    assert.throws(
      () => validate({ workspaces: 'apps/main' }, SOURCE),
      /workspaces must be a list of strings/,
    );
    assert.throws(
      () =>
        validate({ known: [{ path: 'a', names: 'x', reason: 'b' }] }, SOURCE),
      /known\[0\]\.names must be a list of strings/,
    );
  });
});
