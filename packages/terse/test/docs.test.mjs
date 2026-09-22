// ============================================================================
// Docs Tests
// ============================================================================
//
// The scanner reads its config once, at import, so cases needing a different
// config build in a child process whose working directory carries that config.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { ALL_RULES } from '../src/scanner.mjs';
import { build, fill } from '../src/docs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, '..', 'src', 'docs.mjs');
const CHUNKS = join(HERE, '..', 'chunks');

/**
 * Builds the contract inside a repo configured the given way.
 *
 * @param config - Contents of `.devkit/terse.json`
 * @returns The generated markdown
 */
function buildWith(config) {
  const root = mkdtempSync(join(tmpdir(), 'terse-'));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.devkit'));
  writeFileSync(join(root, '.devkit', 'terse.json'), JSON.stringify(config));

  const script = `const m = await import(${JSON.stringify(DOCS)});process.stdout.write(m.build());`;

  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('chunks', () => {
  test('ships one per rule, so no rule can go undocumented', () => {
    const shipped = new Set(
      readdirSync(CHUNKS)
        .filter((f) => !f.startsWith('_'))
        .map((f) => f.replace('.md', '')),
    );

    for (const name of Object.keys(ALL_RULES)) {
      assert.equal(shipped.has(name), true, name);
    }
  });

  test('ships none that no rule claims', () => {
    const orphans = readdirSync(CHUNKS)
      .filter((f) => !f.startsWith('_'))
      .map((f) => f.replace('.md', ''))
      .filter((name) => !(name in ALL_RULES));

    assert.deepEqual(orphans, []);
  });
});

describe('fill', () => {
  test('replaces a cap with the configured value', () => {
    assert.match(
      fill('under {{commentMaxChars}} characters'),
      /under \d+ characters/,
    );
  });

  test('leaves a placeholder no cap answers, rather than emptying it', () => {
    assert.equal(fill('{{notACap}}'), '{{notACap}}');
  });
});

describe('build', () => {
  test('carries every rule when a repo switches none off', () => {
    const doc = build();

    assert.match(doc, /# The Comment Contract/);
    assert.match(doc, /No commented-out code/);
  });

  test('leaves out a rule a repo switches off', () => {
    const doc = buildWith({ rules: { 'no-commented-code': false } });

    assert.equal(doc.includes('No commented-out code'), false);
    assert.match(doc, /No history/);
  });

  test('drops a section whose every rule is off', () => {
    const doc = buildWith({
      rules: {
        'file-header': false,
        'header-cap': false,
        'exported-jsdoc': false,
        'property-jsdoc': false,
      },
    });

    assert.equal(doc.includes('## Coverage'), false);
    assert.match(doc, /## Style/);
  });

  test('writes the repository caps into the prose', () => {
    const doc = buildWith({ commentMaxChars: 140, headerMax: 12 });

    assert.match(doc, /One sentence, one clause, 140 characters/);
    assert.match(doc, /A file header is 12 lines/);
  });

  test('names the TODO prefix a repository uses', () => {
    assert.match(buildWith({ todoPrefix: 'SHS' }), /TODO\(SHS-1234\)/);
  });

  test('counts only switched-on rules as enforced', () => {
    const doc = buildWith({
      rules: { 'no-commented-code': false, 'no-history': false },
    });

    assert.match(doc, /catches 14 of these in CI/);
  });

  test('separates rules a scanner catches from rules a reviewer must', () => {
    const doc = build();

    assert.match(
      doc,
      /No scanner can judge the rest, so they are review rules/,
    );
    assert.match(doc, /`logic-comment-exception`/);
  });
});
