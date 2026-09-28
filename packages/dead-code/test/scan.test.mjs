// ============================================================================
// Scan Tests
// ============================================================================
//
// Runs `dead-code` over a whole repo and over named paths, with real knip.

import assert from 'node:assert/strict';
import { existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { deadCode, makeRepo, report, tempDir } from './repo.mjs';

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
    assert.deepEqual(json.hints, []);
    assert.deepEqual(json.unresolved, []);
    assert.deepEqual(json.errors, []);
    assert.deepEqual(json.warnings, []);
    assert.equal(json.directory, '.');
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

  test('a file @euanmsm/skills generated is known, with no entry needed', () => {
    const root = makeRepo({
      'src/review.workflow.ts':
        '// Generated by @euanmsm/skills from .devkit/skills.json. Edit that, then run `npx --no-install skills sync`.\nexport const meta = {};\n',
    });

    const { json } = report(root);

    assert.deepEqual(
      json.findings.map((f) => f.file).includes('src/review.workflow.ts'),
      false,
    );
    assert.deepEqual(json.known, [
      {
        type: 'file',
        file: 'src/review.workflow.ts',
        name: 'src/review.workflow.ts',
        line: null,
        reason:
          'generated by @euanmsm/skills, and loaded by a tool by its path rather than imported',
      },
    ]);
    assert.deepEqual(json.stale, []);
  });

  test('a file that only quotes the generated marker is not known', () => {
    const root = makeRepo({
      'src/tag.ts': "export const tag = 'Generated by @euanmsm/skills';\n",
    });

    const { json } = report(root);

    assert.equal(
      json.findings.some((f) => f.file === 'src/tag.ts'),
      true,
    );
    assert.deepEqual(json.known, []);
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

describe('knip trouble', () => {
  test('says when knip looks unconfigured', () => {
    const files = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        `f${i}.js`,
        `export const x = ${i};\n`,
      ]),
    );
    const root = makeRepo({
      'knip.json': null,
      'package.json': { name: 'u', type: 'module', main: 'index.js' },
      'index.js': 'export const a = 1;\n',
      ...files,
    });

    const { json } = report(root, ['--include', 'files']);
    const text = deadCode(root, ['--include', 'files']).out;

    assert.equal(json.hints[0].type, 'top-level-unconfigured');
    assert.match(json.warnings.join('\n'), /looks unconfigured/);
    assert.match(text, /Configuration hints/);
    assert.match(text, /looks unconfigured/);
  });

  test('a plugin config that will not load is an error, in JSON too, and exits 2', () => {
    const root = makeRepo({
      'package.json': {
        name: 'c',
        type: 'module',
        devDependencies: { vitest: '*' },
      },
      'knip.json': null,
      'index.js': 'export const a = 1;\n',
      'lib.test.js': "import { a } from './index.js';\nexport const y = a;\n",
      'vitest.config.js': "throw new Error('boom');\n",
    });

    const { status, json } = report(root);
    const text = deadCode(root).out;

    assert.equal(status, 2);
    assert.match(json.errors.join('\n'), /vitest\.config\.js/);
    assert.deepEqual(json.stale, []);
    assert.match(text, /Knip reported errors \(1\)/);
    assert.match(text, /cannot be trusted/);
  });

  test('lists unresolved imports apart, with a warning', () => {
    const root = makeRepo({
      'src/index.ts':
        "import { alsoUsed, used } from './lib';\nimport { helper } from './util/helper';\nimport { gone } from '@/nope';\n\nconsole.log(used(), alsoUsed(), helper(), gone);\n",
    });

    const { status, json } = report(root);

    assert.equal(status, 1);
    assert.deepEqual(json.unresolved, [
      { type: 'unresolved', file: 'src/index.ts', name: '@/nope', line: 3 },
    ]);
    assert.ok(json.findings.every((f) => f.type !== 'unresolved'));
    assert.match(json.warnings.join('\n'), /1 import could not be resolved/);
  });

  test('--include unresolved counts them as findings', () => {
    const root = makeRepo({
      'src/index.ts':
        "import { alsoUsed, used } from './lib';\nimport { helper } from './util/helper';\nimport { gone } from '@/nope';\n\nconsole.log(used(), alsoUsed(), helper(), gone);\n",
    });

    const { json } = report(root, ['--include', 'unresolved']);

    assert.deepEqual(
      json.findings.map((f) => f.name),
      ['@/nope'],
    );
    assert.deepEqual(json.unresolved, []);
  });

  test("prints knip's configuration hints", () => {
    const root = makeRepo({
      'knip.json': {
        entry: ['src/index.ts'],
        project: ['src/**/*.ts'],
        ignore: ['src/nothing-here/**'],
      },
    });

    const { json } = report(root);
    const text = deadCode(root).out;

    assert.deepEqual(json.hints[0], {
      type: 'ignore',
      identifier: 'src/nothing-here/**',
      workspace: '.',
      file: 'knip.json',
      message: 'Remove it from ignore, it is unused',
    });
    assert.match(text, /Configuration hints \(1\)/);
  });

  test('an unusable --include names the option', () => {
    const root = makeRepo();

    const empty = deadCode(root, ['--include', ',']);
    const typo = deadCode(root, ['--include', 'export']);

    assert.equal(empty.status, 2);
    assert.match(empty.out, /--include must name at least one knip issue type/);
    assert.equal(typo.status, 2);
    assert.match(typo.out, /Did you mean "exports"/);
  });
});

describe('stale entries', () => {
  const config = {
    '.devkit/dead-code.json': {
      known: [{ path: '^src/lib\\.ts$', names: ['unused'], reason: 'kept' }],
    },
  };

  test('--include lists none, since it hides what an entry could match', () => {
    const root = makeRepo(config);

    assert.deepEqual(report(root, ['--include', 'files']).json.stale, []);
  });

  test('--workspace lists none', () => {
    const root = makeRepo({
      ...config,
      '.devkit/dead-code.json': {
        known: [{ path: '^gone/', reason: 'deleted folder' }],
      },
    });

    assert.deepEqual(report(root, ['--workspace', '.']).json.stale, []);
    assert.equal(report(root).json.stale.length, 1);
  });

  test('`.` at the root is the whole repo, stale entries and all', () => {
    const root = makeRepo({
      '.devkit/dead-code.json': {
        known: [{ path: '^gone/', reason: 'deleted folder' }],
      },
    });

    const { json } = report(root, ['.']);

    assert.equal(json.mode, 'repo');
    assert.equal(json.stale.length, 1);
    assert.equal(json.findings.length, 3);
  });
});

describe('how paths are read', () => {
  test('a path in the wrong case finds the file as stored', (t) => {
    const root = makeRepo();
    if (!existsSync(join(root, 'SRC/LIB.TS')))
      return t.skip('the filesystem is case-sensitive');

    const { status, json } = report(root, ['SRC/LIB.TS']);

    assert.equal(status, 1);
    assert.deepEqual(
      json.findings.map((f) => f.file),
      ['src/lib.ts', 'src/lib.ts'],
    );
  });

  test('a symlink is followed to the file it names', () => {
    const root = makeRepo();
    symlinkSync(join(root, 'src/orphan.ts'), join(root, 'link.ts'));

    const { json } = report(root, ['link.ts']);

    assert.deepEqual(
      json.findings.map((f) => f.file),
      ['src/orphan.ts'],
    );
  });

  test('an absolute path through a symlinked folder is inside the repo', () => {
    const root = makeRepo();
    const link = join(tempDir(), 'link');
    symlinkSync(root, link, 'dir');

    const { status, json } = report(root, [join(link, 'src/orphan.ts')]);

    assert.equal(status, 1);
    assert.deepEqual(
      json.findings.map((f) => f.file),
      ['src/orphan.ts'],
    );
  });

  test('a repo-root path works from a subfolder', () => {
    const root = makeRepo();

    const { json } = report(join(root, 'src/util'), ['src/orphan.ts']);

    assert.deepEqual(
      json.findings.map((f) => f.file),
      ['src/orphan.ts'],
    );
  });

  test('after --, a path named like a command is a path', () => {
    const root = makeRepo({
      'src/branch.ts': 'export const stray = 1;\n',
      init: 'not a command\n',
    });

    const fromSrc = deadCode(join(root, 'src'), ['--json', '--', 'branch.ts']);
    const fromInit = deadCode(root, ['--json', '--', 'init']);
    const json = JSON.parse(fromSrc.stdout);

    assert.equal(fromSrc.status, 1, fromSrc.out);
    assert.equal(json.mode, 'paths');
    assert.deepEqual(
      json.findings.map((f) => f.file),
      ['src/branch.ts'],
    );
    assert.equal(fromInit.status, 0, fromInit.out);
    assert.equal(JSON.parse(fromInit.stdout).mode, 'paths');
    assert.equal(existsSync(join(root, '.devkit/dead-code.json')), false);
  });

  test('a mistyped command is suggested, not reported as a missing path', () => {
    const root = makeRepo();

    const { status, out } = deadCode(root, ['brnach']);

    assert.equal(status, 2);
    assert.match(out, /Did you mean dead-code branch\?/);
  });
});

describe('a project below the git root', () => {
  const WEB = {
    'package.json': null,
    'knip.json': null,
    'src/index.ts': null,
    'src/lib.ts': null,
    'src/orphan.ts': null,
    'src/util/helper.ts': null,
    'api/main.py': 'print(1)\n',
    'web/package.json': { name: 'web', private: true, type: 'module' },
    'web/knip.json': { entry: ['src/index.ts'], project: ['src/**/*.ts'] },
    'web/src/index.ts': "import { a } from './lib';\nconsole.log(a);\n",
    'web/src/lib.ts': 'export const a = 1;\nexport const b = 2;\n',
  };

  test('runs knip in the folder with the package.json, paths from the git root', () => {
    const root = makeRepo(WEB);

    const { status, json } = report(join(root, 'web/src'));

    assert.equal(status, 1);
    assert.equal(json.directory, 'web');
    assert.deepEqual(json.findings, [
      { type: 'export', file: 'web/src/lib.ts', name: 'b', line: 2 },
    ]);
  });

  test('a named path outside the project has no findings, and a warning', () => {
    const root = makeRepo(WEB);

    const { status, json } = report(join(root, 'web'), ['api/main.py', 'src']);

    assert.equal(status, 1);
    assert.equal(json.mode, 'paths');
    assert.equal(json.findings.length, 1);
    assert.match(
      json.warnings[0],
      /api\/main\.py is outside the project folder web/,
    );
  });

  test('from the git root, asks for the directory setting', () => {
    const root = makeRepo(WEB);

    const { status, out } = deadCode(root);

    assert.equal(status, 2);
    assert.match(out, /set "directory" in \.devkit\/dead-code\.json/);
  });

  test('the directory setting works from anywhere, and known paths are git-root paths', () => {
    const root = makeRepo({
      ...WEB,
      '.devkit/dead-code.json': {
        directory: 'web',
        known: [{ path: '^web/src/lib\\.ts$', names: ['b'], reason: 'kept' }],
      },
    });

    const { status, json } = report(join(root, 'api'), ['web/src']);

    assert.equal(status, 0);
    assert.deepEqual(
      json.known.map((f) => [f.file, f.name]),
      [['web/src/lib.ts', 'b']],
    );
  });
});
