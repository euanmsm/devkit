// ============================================================================
// Knip Parsing Tests
// ============================================================================
//
// Checks that knip 5 and knip 6 JSON reports flatten into the same findings.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { toHint, unconfigured } from '../src/hints.mjs';
import { parseOutput, toFindings } from '../src/knip.mjs';

describe('toFindings', () => {
  test('reads knip 6 rows, files included', () => {
    const findings = toFindings({
      issues: [
        { file: 'src/a.ts', files: [{ name: 'src/a.ts' }], exports: [] },
        {
          file: 'src/b.ts',
          exports: [{ name: 'x', line: 3, col: 1, pos: 9 }],
          enumMembers: [{ namespace: 'E', name: 'B', line: 5 }],
          duplicates: [
            [
              { name: 'd', line: 7 },
              { name: 'd2', line: 8 },
            ],
          ],
        },
        { file: 'package.json', dependencies: [{ name: 'left-pad' }] },
      ],
    });

    assert.deepEqual(findings, [
      { type: 'file', file: 'src/a.ts', name: 'src/a.ts', line: null },
      { type: 'export', file: 'src/b.ts', name: 'x', line: 3 },
      { type: 'enumMember', file: 'src/b.ts', name: 'E.B', line: 5 },
      { type: 'duplicate', file: 'src/b.ts', name: 'd, d2', line: 7 },
      {
        type: 'dependency',
        file: 'package.json',
        name: 'left-pad',
        line: null,
      },
    ]);
  });

  test("reads knip 5's top-level files and per-enum member objects", () => {
    const findings = toFindings({
      files: ['src/old.ts'],
      issues: [
        {
          file: 'src/b.ts',
          owners: [{ name: '@team' }],
          types: [{ name: 'T', line: 2 }],
          enumMembers: { E: [{ name: 'B', line: 5 }] },
        },
      ],
    });

    assert.deepEqual(findings, [
      { type: 'file', file: 'src/old.ts', name: 'src/old.ts', line: null },
      { type: 'type', file: 'src/b.ts', name: 'T', line: 2 },
      { type: 'enumMember', file: 'src/b.ts', name: 'E.B', line: 5 },
    ]);
  });
});

describe('toFindings, names and paths', () => {
  test('keeps the namespace on namespace members, so equal names stay apart', () => {
    const findings = toFindings({
      issues: [
        {
          file: 'src/ns.ts',
          namespaceMembers: [
            { namespace: 'NS1', name: 'x', line: 1 },
            { namespace: 'NS2', name: 'x', line: 2 },
          ],
        },
      ],
    });

    assert.deepEqual(
      findings.map((f) => [f.type, f.name]),
      [
        ['namespaceMember', 'NS1.x'],
        ['namespaceMember', 'NS2.x'],
      ],
    );
  });

  test('puts the project folder in front of every path', () => {
    const findings = toFindings(
      {
        issues: [
          { file: 'src/a.ts', files: [{ name: 'src/a.ts' }] },
          { file: 'src/b.ts', exports: [{ name: 'x', line: 3 }] },
        ],
      },
      'web',
    );

    assert.deepEqual(findings, [
      { type: 'file', file: 'web/src/a.ts', name: 'web/src/a.ts', line: null },
      { type: 'export', file: 'web/src/b.ts', name: 'x', line: 3 },
    ]);
  });
});

describe('hints', () => {
  test('toHint makes the file relative and names the message', () => {
    assert.deepEqual(
      toHint(
        { type: 'entry-redundant', identifier: /src\/index\.ts/ },
        { cwd: '/repo', configFilePath: '/repo/knip.json' },
      ),
      {
        type: 'entry-redundant',
        identifier: 'src\\/index\\.ts',
        workspace: '.',
        file: 'knip.json',
        message: 'Remove the redundant entry pattern',
      },
    );
  });

  test('says the project is unconfigured when most files are unused', () => {
    const files = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        `/repo/f${i}.js`,
        { [`/repo/f${i}.js`]: { filePath: `/repo/f${i}.js` } },
      ]),
    );

    const hints = unconfigured({
      counters: { files: 25, processed: 26 },
      issues: { files },
      includedWorkspaceDirs: ['/repo'],
      cwd: '/repo',
    });

    assert.deepEqual(hints, [
      { type: 'top-level-unconfigured', identifier: '.', size: 25 },
    ]);
    assert.match(
      toHint(hints[0], { cwd: '/repo' }).message,
      /Create a knip\.json .*\(25 unused files\)/,
    );
  });

  test('says nothing when few files are unused', () => {
    assert.deepEqual(
      unconfigured({
        counters: { files: 5, processed: 100 },
        issues: { files: {} },
        includedWorkspaceDirs: ['/repo'],
      }),
      [],
    );
  });
});

describe('parseOutput', () => {
  test('reads the report line and the hints line apart', () => {
    const { report, hints } = parseOutput(
      '{"issues":[]}\n{"hints":[{"type":"ignore"}]}\n',
    );

    assert.deepEqual(report, { issues: [] });
    assert.deepEqual(hints, [{ type: 'ignore' }]);
  });

  test('gives a null report when knip printed none', () => {
    assert.equal(parseOutput('ERROR: nope\n').report, null);
  });
});
