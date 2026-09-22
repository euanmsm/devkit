// ============================================================================
// Rule Switch Tests
// ============================================================================
//
// The scanner reads its config once, at import. Each case therefore scans in a
// child process whose working directory is a repo carrying that config.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const SCANNER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'scanner.mjs',
);
const SOURCE = 'const a = 1;\n// We previously did this so that it works.\n';

/**
 * Scans one source inside a repo configured the given way.
 *
 * @param rules - The config's `rules` object, or undefined for no config at all
 * @returns Names of the rules the source breaks
 */
function scanWith(rules) {
  const root = mkdtempSync(join(tmpdir(), 'terse-'));
  mkdirSync(join(root, '.git'));

  if (rules) {
    mkdirSync(join(root, '.devkit'));
    writeFileSync(
      join(root, '.devkit', 'terse.json'),
      JSON.stringify({ rules }),
    );
  }

  const script =
    `const m = await import(${JSON.stringify(SCANNER)});` +
    `console.log(JSON.stringify(m.scan(${JSON.stringify(SOURCE)}).map((f) => f.rule)));`;

  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  return JSON.parse(out);
}

describe('rule switches', () => {
  test('reports every rule when a repo configures nothing', () => {
    assert.deepEqual(scanWith(undefined).sort(), [
      'file-header',
      'no-history',
      'no-justification',
      'no-person',
    ]);
  });

  test('silences a rule a repo switches off', () => {
    const found = scanWith({ 'file-header': false, 'no-person': false });

    assert.deepEqual(found.sort(), ['no-history', 'no-justification']);
  });

  test('leaves rules a partial config never mentions switched on', () => {
    assert.equal(
      scanWith({ 'no-person': false }).includes('file-header'),
      true,
    );
  });

  test('ignores a name no rule uses rather than failing the scan', () => {
    assert.equal(scanWith({ 'no-such-rule': false }).length, 4);
  });
});
