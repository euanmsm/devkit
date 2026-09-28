// ============================================================================
// Knip Parsing Tests
// ============================================================================
//
// Checks that knip 5 and knip 6 JSON reports flatten into the same findings.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

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
