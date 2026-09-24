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

const HEADER =
  '// ============================================================================\n' +
  '// Fixture\n' +
  '// ============================================================================\n\n';

const LOCAL = `${HEADER}function local(): void {}\n`;

/**
 * Scans one source, with one path, inside a repo configured the given way.
 *
 * @param config - The whole `.devkit/terse.json`
 * @param source - The file's contents
 * @param path - Repo-relative path the scan is told about
 * @returns Messages of the findings the source breaks
 */
function scanFile(config, source, path = '') {
  const root = mkdtempSync(join(tmpdir(), 'terse-'));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.devkit'));
  writeFileSync(join(root, '.devkit', 'terse.json'), JSON.stringify(config));

  const script =
    `const m = await import(${JSON.stringify(SCANNER)});` +
    `console.log(JSON.stringify(m.scan(${JSON.stringify(source)}, ${JSON.stringify(path)}).map((f) => f.message)));`;

  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
}

describe('jsdoc scope', () => {
  test('flags an undocumented local function by default', () => {
    assert.deepEqual(scanFile({}, LOCAL), ['Declaration has no JSDoc.']);
  });

  test('leaves one alone when a repo asks for exports only', () => {
    assert.deepEqual(scanFile({ jsdocScope: 'exported' }, LOCAL), []);
  });

  test('sends a test file back to exports only', () => {
    assert.deepEqual(scanFile({}, LOCAL, 'src/a.test.ts'), []);
  });

  test('covers a test file when a repo clears the exclusions', () => {
    assert.deepEqual(
      scanFile({ jsdocScopeExclude: [] }, LOCAL, 'src/a.test.ts'),
      ['Declaration has no JSDoc.'],
    );
  });
});

describe('tag coverage', () => {
  const THROWER =
    `${HEADER}/** Does a thing. */\nfunction f(): void {\n\tthrow new Error('no');\n}\n`;

  test('asks for a @throws by default', () => {
    assert.deepEqual(scanFile({}, THROWER), [
      'Function throws but has no @throws.',
    ]);
  });

  test('asks for no @param when a repo has dropped that tag', () => {
    const DOCUMENTED = `${HEADER}/** Does a thing. */\nfunction f(id) {}\n`;

    assert.deepEqual(
      scanFile({ allowedTags: ['@returns', '@throws'] }, DOCUMENTED),
      [],
    );
  });

  test('asks for no tag a repo has dropped from allowedTags', () => {
    assert.deepEqual(
      scanFile({ allowedTags: ['@param', '@returns'] }, THROWER),
      [],
    );
  });
});

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
