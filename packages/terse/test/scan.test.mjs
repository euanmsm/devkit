// ============================================================================
// Scan — Tests
// ============================================================================
//
// Covers reading the command line, building the report, and `terse scan` end
// to end in a throwaway repository with its own config.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs, report } from '../src/scan.mjs';

const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'terse.mjs',
);

const HEADER =
  '// ============================================================================\n' +
  '// Fixture\n' +
  '// ============================================================================\n';

const CLEAN = `${HEADER}\nconst a = 1;\n`;
const HISTORY_AND_PERSON = `${HEADER}\nconst a = 1;\n// We previously did this.\n`;
const PERSON = `${HEADER}\nconst b = 2;\n// We did this.\n`;

/**
 * Builds a repository with one committed file, one untracked file and noise.
 *
 * @param config - Contents of `.devkit/terse.json`
 * @returns The repository root
 */
function fixture(config = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'terse-scan-')));
  const write = (path, contents) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  };
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'Test');

  write('.devkit/terse.json', JSON.stringify(config));
  write('src/clean.ts', CLEAN);
  write('src/bad.ts', HISTORY_AND_PERSON);
  write('src/types.d.ts', PERSON);
  write('README.md', '# We previously did this.\n');
  git('add', '-A');
  git('commit', '-qm', 'base');

  write('src/new.ts', PERSON);
  write('node_modules/pkg/index.js', PERSON);

  return root;
}

/**
 * Runs `terse scan` inside a repository.
 *
 * @param cwd - Directory to run in
 * @param args - Arguments after `terse scan`
 * @returns `{ status, stdout, stderr }`
 */
function run(cwd, ...args) {
  return spawnSync(process.execPath, [BIN, 'scan', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('parseArgs', () => {
  test('splits rules from paths', () => {
    assert.deepEqual(
      parseArgs(['src', '--rule', 'no-person', '--rule=no-history', 'lib']),
      { rules: ['no-person', 'no-history'], paths: ['src', 'lib'] },
    );
  });

  test('rejects an unknown rule', () => {
    assert.throws(
      () => parseArgs(['--rule', 'nope']),
      /No rule is called nope/,
    );
  });

  test('rejects a prose-only rule', () => {
    assert.throws(() => parseArgs(['--rule', 'what-not-why']), /prose-only/);
  });

  test('rejects a missing rule name and an unknown option', () => {
    assert.throws(() => parseArgs(['--rule']), /needs a rule name/);
    assert.throws(() => parseArgs(['--fix']), /Unknown option --fix/);
  });
});

describe('report', () => {
  const f = (rule, line) => ({ rule, line, message: 'Broken.' });

  test('says so when nothing is found', () => {
    assert.equal(
      report([], 1),
      'No comment-contract violations across 1 file.',
    );
  });

  test('groups by file and counts per rule, largest first', () => {
    const out = report(
      [
        { file: 'a.ts', findings: [f('no-person', 2), f('no-history', 3)] },
        { file: 'b.ts', findings: [f('no-person', 5)] },
      ],
      4,
    );

    assert.equal(
      out,
      [
        'a.ts:2  [no-person]  Broken.\na.ts:3  [no-history]  Broken.',
        'b.ts:5  [no-person]  Broken.',
        'By rule\n  no-person   2\n  no-history  1',
        '3 findings in 2 of 4 files.',
      ].join('\n\n'),
    );
  });

  test('points at the written contract when the config names it', () => {
    const out = report([{ file: 'a.ts', findings: [f('no-person', 1)] }], 1, {
      rulesDoc: 'docs/rules.md',
    });

    assert.match(
      out,
      /1 finding in 1 of 1 file\.\n\nThe rules are in docs\/rules\.md$/,
    );
  });
});

describe('terse scan end to end', () => {
  test('scans tracked and untracked files, skipping excluded ones', () => {
    const { status, stdout } = run(fixture());

    assert.equal(status, 1);
    assert.match(stdout, /src\/bad\.ts:6 {2}\[no-history\]/);
    assert.match(stdout, /src\/new\.ts:6 {2}\[no-person\]/);
    assert.doesNotMatch(stdout, /clean\.ts|types\.d\.ts|node_modules|README/);
    assert.match(stdout, /3 findings in 2 of 3 files\./);
  });

  test('reports a named file the config does not govern as skipped', () => {
    const { stderr } = run(fixture(), 'README.md', 'gone.ts');

    assert.match(stderr, /README\.md {2}skipped, not governed by this config/);
    assert.match(stderr, /gone\.ts {2}does not exist/);
  });

  test('follows the config, leaving a switched-off rule unreported', () => {
    const { stdout } = run(fixture({ rules: { 'no-history': false } }));

    assert.doesNotMatch(stdout, /no-history/);
    assert.match(stdout, /2 findings in 2 of 3 files\./);
  });

  test('narrows the report to the rules named', () => {
    const { stdout } = run(fixture(), '--rule', 'no-history');

    assert.doesNotMatch(stdout, /no-person/);
    assert.match(stdout, /1 finding in 1 of 3 files\./);
  });

  test('prints repo-relative paths when run from a subdirectory', () => {
    const { stdout } = run(join(fixture(), 'src'), '.');

    assert.match(stdout, /^src\/bad\.ts:6/m);
  });

  test('exits 0 on a clean file and 2 on bad usage', () => {
    const root = fixture();

    assert.equal(run(root, 'src/clean.ts').status, 0);
    assert.equal(run(root, '--rule', 'nope').status, 2);
  });

  test('exits 2 on a rule the config switches off', () => {
    const { status, stderr } = run(
      fixture({ rules: { 'no-person': false } }),
      '--rule',
      'no-person',
    );

    assert.equal(status, 2);
    assert.match(stderr, /switched off/);
  });

  test('leaves bare terse running the branch check', () => {
    const { status, stderr } = spawnSync(process.execPath, [BIN], {
      cwd: fixture(),
      encoding: 'utf8',
    });

    assert.equal(status, 1);
    assert.match(stderr, /Could not find a merge base with origin\/main/);
  });
});
