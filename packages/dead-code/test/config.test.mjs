// ============================================================================
// Config Tests
// ============================================================================
//
// Checks that `.devkit/dead-code.json` is validated with errors naming the key.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ISSUE_TYPES as KNIP_ISSUE_TYPES } from 'knip/session';

import {
  DEFAULTS,
  ISSUE_TYPES,
  applyKnown,
  checkInclude,
  validate,
} from '../src/config.mjs';

const SOURCE = '.devkit/dead-code.json';

describe('validate', () => {
  test('fills the defaults when the file is absent', () => {
    const config = validate(null, SOURCE);

    assert.equal(config.directory, null);
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

describe('include', () => {
  test('matches the issue types of the bundled knip', () => {
    assert.deepEqual([...ISSUE_TYPES].sort(), [...KNIP_ISSUE_TYPES].sort());
  });

  test('an empty list names the key', () => {
    assert.throws(
      () => validate({ include: [] }, SOURCE),
      /dead-code\.json: include must name at least one knip issue type/,
    );
    assert.throws(() => checkInclude([], '--include'), /--include must name/);
  });

  test('an unknown type names the key, and the plural it probably meant', () => {
    assert.throws(
      () => validate({ include: ['files', 'export'] }, SOURCE),
      /include: "export" is not a knip issue type\. Did you mean "exports"\?/,
    );
  });
});

describe('directory and names', () => {
  test('directory must be a non-empty string', () => {
    assert.equal(validate({ directory: 'web' }, SOURCE).directory, 'web');
    assert.throws(
      () => validate({ directory: '' }, SOURCE),
      /directory must be a folder path/,
    );
  });

  test('an empty names list is an error, since it matches nothing', () => {
    assert.throws(
      () =>
        validate({ known: [{ path: 'a', names: [], reason: 'r' }] }, SOURCE),
      /known\[0\]\.names is empty/,
    );
  });

  test('a bad regex is an error, without a warning about ignoring it', (t) => {
    const writes = [];
    t.mock.method(process.stderr, 'write', (chunk) => writes.push(chunk));

    assert.throws(
      () => validate({ known: [{ path: '(', reason: 'x' }] }, SOURCE),
      /known\[0\]\.path is not a valid regex/,
    );
    assert.deepEqual(writes, []);
  });
});

describe('applyKnown', () => {
  const finding = (file, name) => ({ type: 'export', file, name, line: 1 });

  test('an entry behind a broader one is not stale, and the first reason wins', () => {
    const { known } = validate(
      {
        known: [
          { path: '^packages/', reason: 'broad' },
          { path: '^packages/a/lib\\.js$', names: ['y'], reason: 'specific' },
        ],
      },
      SOURCE,
    );

    const result = applyKnown([finding('packages/a/lib.js', 'y')], known);

    assert.deepEqual(result.findings, []);
    assert.equal(result.known[0].reason, 'broad');
    assert.deepEqual(result.stale, []);
  });

  test('a listed name that matched nothing is stale, on its own', () => {
    const { known } = validate(
      {
        known: [{ path: '^src/lib\\.ts$', names: ['a', 'gone'], reason: 'r' }],
      },
      SOURCE,
    );

    const result = applyKnown([finding('src/lib.ts', 'a')], known);

    assert.deepEqual(result.stale, [
      { path: '^src/lib\\.ts$', names: ['gone'], reason: 'r' },
    ]);
  });

  test('an entry matching nothing is stale whole', () => {
    const { known } = validate(
      { known: [{ path: '^gone/', reason: 'r' }] },
      SOURCE,
    );

    assert.deepEqual(applyKnown([finding('src/a.ts', 'a')], known).stale, [
      { path: '^gone/', reason: 'r' },
    ]);
  });
});
