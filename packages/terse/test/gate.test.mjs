// ============================================================================
// Comment Gate — Tests
// ============================================================================
//
// Covers turning a hook payload into the text it would write, and turning
// findings into the deny message. Deciding which findings are new belongs to
// comment-budget.mjs and is tested there.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyEdit, format } from '../src/gate.mjs';

const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'terse-gate.mjs',
);

const HEADER =
  '// ============================================================================\n' +
  '// Fixture\n' +
  '// ============================================================================\n';

/**
 * Runs the hook over a Write of the given contents, in a throwaway repository.
 *
 * @param name - Repo-relative path the write targets
 * @param contents - What the edit writes
 * @returns What the hook wrote to stdout, empty when it allowed the edit
 */
function hook(name, contents) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'terse-')));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.devkit'));
  writeFileSync(join(root, '.devkit', 'terse.json'), '{}');

  const payload = JSON.stringify({
    tool_input: { file_path: join(root, name), content: contents },
  });

  return execFileSync(process.execPath, [BIN], {
    cwd: root,
    input: payload,
    encoding: 'utf8',
  });
}

describe('the hook end to end', () => {
  test('denies an edit adding an undocumented local function', () => {
    const out = hook('a.ts', `${HEADER}\nfunction local(): void {}\n`);

    assert.match(out, /"permissionDecision":"deny"/);
    assert.match(out, /Declaration has no JSDoc/);
  });

  test('allows the same edit to a test file', () => {
    assert.equal(hook('a.test.ts', `${HEADER}\nfunction local(): void {}\n`), '');
  });

  test('denies an edit whose JSDoc documents no parameter', () => {
    const out = hook(
      'a.ts',
      `${HEADER}\n/** Does a thing. */\nexport function f(id: string): void {}\n`,
    );

    assert.match(out, /has no @param/);
  });

  test('allows an edit whose JSDoc is complete', () => {
    const complete =
      `${HEADER}\n/**\n * Does a thing.\n *\n * @param id - The id\n */\n` +
      'export function f(id: string): void {}\n';

    assert.equal(hook('a.ts', complete), '');
  });
});

describe('applyEdit', () => {
  test('replaces the first occurrence only', () => {
    const result = applyEdit('a\nb\na\n', {
      old_string: 'a',
      new_string: 'z',
    });

    assert.equal(result.after, 'z\nb\na\n');
  });

  test('replaces every occurrence when replace_all is set', () => {
    const result = applyEdit('a\nb\na\n', {
      old_string: 'a',
      new_string: 'z',
      replace_all: true,
    });

    assert.equal(result.after, 'z\nb\nz\n');
  });

  test('treats a replacement containing $& as literal text', () => {
    const result = applyEdit('const x = 1;\n', {
      old_string: '1',
      new_string: '/^$&$/',
    });

    assert.equal(result.after, 'const x = /^$&$/;\n');
  });

  test('spans the lines the new text occupies', () => {
    const result = applyEdit('one\ntwo\nthree\n', {
      old_string: 'two',
      new_string: 'a\nb\nc',
    });

    assert.deepEqual(result.span, [{ from: 2, to: 4 }]);
  });

  test("takes a Write's content as the whole file, with no span", () => {
    const result = applyEdit('old\n', { content: 'new\n' });

    assert.equal(result.after, 'new\n');
    assert.equal(result.span, null);
  });

  test('returns null when old_string is not in the source', () => {
    assert.equal(
      applyEdit('a\n', { old_string: 'zzz', new_string: 'b' }),
      null,
    );
  });

  test('returns null on a payload carrying neither content nor strings', () => {
    assert.equal(applyEdit('a\n', { file_path: 'x.ts' }), null);
  });
});

describe('format', () => {
  test('names the file, the count, the line and the rule', () => {
    const message = format(
      [
        {
          rule: 'comment-length',
          line: 41,
          message: 'Comment is 137 chars, cap is 100.',
        },
      ],
      'apps/main/src/a.ts',
    );

    assert.match(message, /^BLOCKED — apps\/main\/src\/a\.ts/);
    assert.match(message, /1 comment-contract violation:/);
    assert.match(
      message,
      /line 41 {2}\[comment-length] {2}Comment is 137 chars/,
    );
  });

  test('pluralises past one finding', () => {
    const findings = [
      { rule: 'no-history', line: 1, message: 'Comment mentions history.' },
      {
        rule: 'no-person',
        line: 2,
        message: 'Comment mentions first or second person.',
      },
    ];

    assert.match(format(findings, 'a.ts'), /2 comment-contract violations:/);
  });

  test('points at the convention files a repo configures', () => {
    const docs = {
      rulesDoc: 'docs/1-rules.md',
      examplesDoc: 'docs/2-examples.md',
    };
    const message = format(
      [{ rule: 'no-history', line: 1, message: 'x' }],
      'a.ts',
      docs,
    );

    assert.match(message, /docs\/1-rules\.md/);
    assert.match(message, /docs\/2-examples\.md/);
  });

  test('omits the pointers when a repo configures no convention files', () => {
    const message = format(
      [{ rule: 'no-history', line: 1, message: 'x' }],
      'a.ts',
    );

    assert.equal(message.includes('The rules are in'), false);
  });
});

describe('the scanner it imports', () => {
  test('resolves, so a rename cannot silently disable the gate', async () => {
    const contract = await import('../src/scanner.mjs');

    assert.equal(typeof contract.governs, 'function');
    assert.equal(typeof contract.newFindings, 'function');
  });
});
