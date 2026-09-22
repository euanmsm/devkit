// ============================================================================
// Watch Tests
// ============================================================================
//
// Each case builds a throwaway repository, because the watcher reads the
// working tree and compares it against a real commit.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import {
  changedSinceCommit,
  format,
  summarise,
  unreported,
} from '../src/watch.mjs';

const CLEAN = [
  '// ============================================================================',
  '// Thing',
  '// ============================================================================',
  '//',
  '// Does a thing.',
  '',
  '/** Adds one. */',
  'export function bump(n) {',
  '  return n + 1;',
  '}',
  '',
].join('\n');

/** Runs git inside a fixture. */
function git(root, ...args) {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

/**
 * Builds a repository holding one committed, contract-clean file.
 *
 * @returns The repository root
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'terse-'));

  git(root, 'init', '-q', '.');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  mkdirSync(join(root, '.devkit'));
  writeFileSync(join(root, '.devkit', 'terse.json'), '{}');
  writeFileSync(join(root, 'a.ts'), CLEAN);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'init');

  return root;
}

/** Appends a line to the fixture's committed file. */
function append(root, line) {
  writeFileSync(join(root, 'a.ts'), `${CLEAN}\n${line}\n`);
}

describe('changedSinceCommit', () => {
  test('sees nothing in a clean tree', () => {
    assert.deepEqual(changedSinceCommit(fixture()), []);
  });

  test('sees a tracked file the working tree has changed', () => {
    const root = fixture();
    append(root, '// A change.');

    assert.deepEqual(changedSinceCommit(root), ['a.ts']);
  });

  test('sees a file never committed, which has no diff to read', () => {
    const root = fixture();
    writeFileSync(join(root, 'b.ts'), 'export const b = 1;\n');

    assert.deepEqual(changedSinceCommit(root).sort(), ['b.ts']);
  });

  test('ignores a file the contract does not govern', () => {
    const root = fixture();
    writeFileSync(join(root, 'notes.md'), '# notes\n');

    assert.deepEqual(changedSinceCommit(root), []);
  });
});

describe('unreported', () => {
  test('reports a violation written by any route', () => {
    const root = fixture();
    append(root, '// We previously did this so that it worked.');

    const found = unreported(root, 'session-a');

    assert.equal(found.length, 3);
    assert.match(found[0], /^a\.ts:\d+ {2}\[no-/);
  });

  test('reports each violation once, not on every command', () => {
    const root = fixture();
    append(root, '// We previously did this so that it worked.');

    assert.equal(unreported(root, 'session-a').length, 3);
    assert.deepEqual(unreported(root, 'session-a'), []);
  });

  test('reports a violation written after the first report', () => {
    const root = fixture();
    append(root, '// We previously did this.');
    unreported(root, 'session-a');

    append(root, '// TODO: later');
    const second = unreported(root, 'session-a');

    assert.equal(second.length, 1);
    assert.match(second[0], /todo-form/);
  });

  test('keeps one session from silencing another', () => {
    const root = fixture();
    append(root, '// We previously did this.');

    assert.equal(unreported(root, 'session-a').length, 2);
    assert.equal(unreported(root, 'session-b').length, 2);
  });

  test('says nothing about a clean tree', () => {
    assert.deepEqual(unreported(fixture(), 'session-a'), []);
  });

  test('reads a never-committed file as wholly new', () => {
    const root = fixture();
    writeFileSync(join(root, 'b.ts'), 'export const b = 1;\n');

    const found = unreported(root, 'session-a');

    assert.equal(
      found.some((l) => l.includes('b.ts') && l.includes('file-header')),
      true,
    );
  });
});

describe('format', () => {
  test('names the count and the route the edit took', () => {
    const note = format(['a.ts:1  [file-header]  No header.']);

    assert.match(note, /1 comment-contract violation that no edit gate saw/);
  });

  test('pluralises past one', () => {
    assert.match(format(['x', 'y']), /2 comment-contract violations/);
  });
});

describe('summarise', () => {
  test('names the count and the file, for the terminal', () => {
    const line = summarise(['a.ts:1  [file-header]  No header.']);

    assert.equal(line, 'terse: 1 new comment violation in a.ts');
  });

  test('counts a file once however many findings it has', () => {
    const line = summarise(['a.ts:1  [x]  One.', 'a.ts:4  [y]  Two.']);

    assert.equal(line, 'terse: 2 new comment violations in a.ts');
  });

  test('stops naming files past three, rather than filling the line', () => {
    const lines = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map(
      (f) => `${f}:1  [x]  One.`,
    );

    assert.equal(
      summarise(lines),
      'terse: 5 new comment violations in a.ts, b.ts, c.ts and 2 more',
    );
  });
});
