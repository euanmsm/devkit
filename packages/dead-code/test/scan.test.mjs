// ============================================================================
// Scan Tests
// ============================================================================
//
// Runs `dead-code` over a whole repo and over named paths, with real knip.

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { deadCode, makeRepo, report } from './repo.mjs';

const FINDINGS = [
  { type: 'export', file: 'src/lib.ts', name: 'unused', line: 5 },
  { type: 'file', file: 'src/orphan.ts', name: 'src/orphan.ts', line: null },
  { type: 'type', file: 'src/lib.ts', name: 'Unused', line: 9 },
];

/**
 * Sorts findings into a stable order for comparison.
 *
 * @param findings - Findings from a report
 * @returns The same findings, sorted by file, then line, then name
 */
function sorted(findings) {
  return [...findings].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

describe('the whole repo', () => {
  test('reports the unused file, export and type with their lines', () => {
    const root = makeRepo();

    const { status, json } = report(root);

    assert.equal(status, 1);
    assert.equal(json.mode, 'repo');
    assert.deepEqual(sorted(json.findings), sorted(FINDINGS));
    assert.deepEqual(json.known, []);
    assert.deepEqual(json.stale, []);
    assert.ok(Array.isArray(json.hints));
    assert.equal('base' in json, false);
  });

  test('prints findings grouped by file, a count per type and a summary', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root);

    assert.equal(status, 1);
    assert.match(out, /src\/lib\.ts:5 {2}\[unused-export\] {2}unused/);
    assert.match(out, /src\/lib\.ts:9 {2}\[unused-type\] {2}Unused/);
    assert.match(out, /src\/orphan\.ts {2}\[unused-file\]/);
    assert.match(out, /By type\n/);
    assert.match(out, /3 findings in 2 files\./);
  });

  test('exits 0 with a clean summary when nothing is dead', () => {
    const root = makeRepo({
      'src/lib.ts':
        'export function used() {\n  return 1;\n}\n\nexport function alsoUsed() {\n  return 3;\n}\n',
      'src/orphan.ts': null,
    });

    const { status, out } = deadCode(root);

    assert.equal(status, 0, out);
    assert.match(out, /No dead code found\./);
  });

  test('--include narrows the issue types', () => {
    const root = makeRepo();

    const { json } = report(root, ['--include', 'files']);

    assert.deepEqual(
      json.findings.map((f) => f.type),
      ['file'],
    );
  });
});

describe('named paths', () => {
  test('keeps only findings inside the named folder', () => {
    const root = makeRepo({
      'src/util/helper.ts':
        'export function helper() {\n  return 4;\n}\n\nexport function spare() {\n  return 5;\n}\n',
    });

    const { status, json } = report(root, ['src/util']);

    assert.equal(status, 1);
    assert.equal(json.mode, 'paths');
    assert.deepEqual(json.findings, [
      { type: 'export', file: 'src/util/helper.ts', name: 'spare', line: 5 },
    ]);
  });

  test('resolves paths against the current folder', () => {
    const root = makeRepo();

    const { json } = report(join(root, 'src'), ['orphan.ts']);

    assert.deepEqual(
      json.findings.map((f) => f.file),
      ['src/orphan.ts'],
    );
  });

  test('a path that does not exist is a usage error', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['src/missing']);

    assert.equal(status, 2);
    assert.match(out, /src\/missing does not exist/);
  });
});

describe('known false positives', () => {
  test('an entry without names moves every finding under its path into known', () => {
    const root = makeRepo({
      '.devkit/dead-code.json': {
        known: [{ path: '^src/lib\\.ts$', reason: 'public API' }],
      },
    });

    const { status, json } = report(root, ['--include', 'exports,types']);

    assert.equal(status, 0);
    assert.deepEqual(json.findings, []);
    assert.deepEqual(
      sorted(json.known),
      sorted([
        { ...FINDINGS[0], reason: 'public API' },
        { ...FINDINGS[2], reason: 'public API' },
      ]),
    );
  });

  test('an entry with names moves only those names', () => {
    const root = makeRepo({
      '.devkit/dead-code.json': {
        known: [
          { path: 'lib', names: ['unused'], reason: 'kept for the importer' },
        ],
      },
    });

    const { status, json } = report(root, ['--include', 'exports,types']);

    assert.equal(status, 1);
    assert.deepEqual(json.findings, [FINDINGS[2]]);
    assert.deepEqual(json.known, [
      { ...FINDINGS[0], reason: 'kept for the importer' },
    ]);
  });

  test('an entry that matches nothing is stale but does not fail the run', () => {
    const root = makeRepo({
      '.devkit/dead-code.json': {
        known: [
          { path: '^src/', reason: 'everything' },
          { path: '^gone/', reason: 'deleted folder' },
        ],
      },
    });

    const { status, json } = report(root);
    const text = deadCode(root).out;

    assert.equal(status, 0);
    assert.deepEqual(json.stale, [
      { path: '^gone/', reason: 'deleted folder' },
    ]);
    assert.match(text, /Known, not counted \(3\)/);
    assert.match(text, /everything/);
    assert.match(text, /Stale known entries \(1\)/);
    assert.match(text, /\^gone\//);
  });

  test('a path-filtered run lists no stale entries', () => {
    const root = makeRepo({
      '.devkit/dead-code.json': {
        known: [{ path: '^gone/', reason: 'deleted folder' }],
      },
    });

    const { json } = report(root, ['src']);

    assert.deepEqual(json.stale, []);
  });
});
