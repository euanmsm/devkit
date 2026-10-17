// ============================================================================
// Review Page Tests
// ============================================================================
//
// The review page's script half: reading a branch's diff, writing the brief,
// merging and checking the agent's notes, and building the page only once the
// notes cover the whole branch.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { prepare } from '../src/review-page/brief.mjs';
import { build } from '../src/review-page/build.mjs';
import { reviewPageCommand } from '../src/review-page/cli.mjs';
import { branchDiff, treeFacts } from '../src/review-page/diff.mjs';
import {
  checkNotes,
  checkShape,
  expandRange,
  loadNotes,
} from '../src/review-page/notes.mjs';

/** Forty numbered lines, long enough for two edits to land in separate hunks. */
const LONG = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n');

/**
 * Runs git and the shell for real, and fails every `gh` call as if there were no PR.
 *
 * @param command - The program
 * @param args - Its arguments
 * @param cwd - The working directory
 * @returns The stdout
 */
function run(command, args, cwd) {
  if (command === 'gh') throw new Error('no PR');
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

/**
 * Makes a repository whose `feat` branch adds, edits, deletes, renames, and
 * moves a whole folder, over `main`.
 *
 * @returns The repository path and a `git` runner for it
 */
function featRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'review-page-'));
  const git = (...args) =>
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
  const put = (path, content) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), `${content}\n`);
  };

  git('init', '-q', '-b', 'main');
  put('.gitignore', 'tmp/');
  put('.devkit/skills.json', JSON.stringify({ skills: { 'review-page': {} } }));
  put('src/edit.ts', LONG);
  put('src/gone.ts', 'old code');
  put('src/rename-me.ts', 'const name = 1;\nexport default name;');
  put('src/box/a.ts', 'export const a = 1;');
  put('src/box/b.ts', 'export const b = 2;');
  put('src/still.ts', 'untouched');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');

  git('switch', '-q', '-c', 'feat');
  put(
    'src/edit.ts',
    LONG.replace('line 2\n', 'line two\n').replace(
      'line 38',
      'line thirty-eight',
    ),
  );
  put('src/new.ts', 'one\ntwo\nthree');
  git('rm', '-q', 'src/gone.ts');
  git('mv', 'src/rename-me.ts', 'src/renamed.ts');
  mkdirSync(join(repo, 'src/crate'));
  git('mv', 'src/box/a.ts', 'src/crate/a.ts');
  git('mv', 'src/box/b.ts', 'src/crate/b.ts');
  git('add', '-A');
  git('commit', '-q', '-m', 'feat');

  return { repo, git, put };
}

/**
 * Writes notes that cover every file in the brief, one hunk note per hunk.
 *
 * @param repo - The repository
 * @param dir - The page folder, relative to the repository
 * @param brief - The brief from `prepare`
 * @returns The notes folder's path
 */
function writeValidNotes(repo, dir, brief) {
  const notesDir = join(repo, dir, 'notes');
  mkdirSync(notesDir, { recursive: true });
  const file = (f) => ({
    path: f.path,
    summary: `What ${f.path} does now.`,
    hunks: f.hunks.map((_, i) => ({
      title: `Hunk ${i + 1}`,
      text: 'What this hunk changes.',
    })),
  });
  writeFileSync(
    join(notesDir, '00-overview.json'),
    JSON.stringify({ overview: { summary: 'The branch.' } }),
  );
  writeFileSync(
    join(notesDir, '01-core.json'),
    JSON.stringify({
      sections: [
        {
          title: 'Core',
          files: brief.files
            .filter((f) => !f.path.startsWith('src/crate/'))
            .map(file),
        },
      ],
    }),
  );
  writeFileSync(
    join(notesDir, '80-skim.json'),
    JSON.stringify({
      skim: [
        { label: 'Folder moved', paths: ['src/crate/a.ts', 'src/crate/b.ts'] },
      ],
    }),
  );
  return notesDir;
}

describe('review-page — the diff', () => {
  it('reads every kind of change with numbered hunks', () => {
    const { repo, git } = featRepo();
    const files = branchDiff(
      (...args) => run('git', args, repo),
      git('merge-base', 'main', 'HEAD').trim(),
    );
    const by = Object.fromEntries(files.map((f) => [f.path, f]));

    assert.equal(by['src/new.ts'].status, 'added');
    assert.equal(by['src/gone.ts'].status, 'deleted');
    assert.equal(by['src/renamed.ts'].status, 'renamed');
    assert.equal(by['src/renamed.ts'].oldPath, 'src/rename-me.ts');
    assert.equal(by['src/edit.ts'].hunks.length, 2);
    assert.deepEqual(
      by['src/edit.ts'].hunks[0].lines
        .filter((l) => l.t === '+')
        .map((l) => [l.n, l.s]),
      [[2, 'line two']],
    );
    assert.deepEqual(
      by['src/gone.ts'].hunks[0].lines.map((l) => l.o),
      [1],
    );
  });

  it('finds the folder the branch emptied, the one it made, and the files around the change', () => {
    const { repo, git } = featRepo();
    const g = (...args) => run('git', args, repo);
    const fork = git('merge-base', 'main', 'HEAD').trim();
    const facts = treeFacts(g, fork, branchDiff(g, fork));

    assert.deepEqual(facts.goneDirs, ['src/box']);
    assert.deepEqual(facts.newDirs, ['src/crate']);
    assert.deepEqual(facts.unchangedPaths, ['src/still.ts']);
  });
});

describe('review-page — prepare', () => {
  it('writes a brief naming the base and every file with its hunks', () => {
    const { repo } = featRepo();
    const { brief, dir, warnings } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      run,
    });

    assert.equal(dir, join('tmp', 'feat', 'review-page'));
    assert.deepEqual(warnings, []);
    assert.equal(brief.base, 'main');
    assert.equal(brief.pr, null);
    assert.equal(brief.commits.length, 1);
    assert.equal(brief.totals.files, 6);
    const edit = brief.files.find((f) => f.path === 'src/edit.ts');
    assert.deepEqual(
      edit.hunks.map((h) => h.new),
      [
        [1, 5],
        [35, 40],
      ],
    );
    assert.ok(existsSync(join(repo, dir, 'brief.json')));
    assert.ok(existsSync(join(repo, dir, 'notes')));
    assert.equal(brief.since, undefined);
  });

  it('lists the files whose diffs changed since the last brief', () => {
    const { repo, git, put } = featRepo();
    const first = prepare(repo, { explicit: 'main', baseBranch: 'main', run });
    writeValidNotes(repo, first.dir, first.brief);
    put('src/new.ts', 'one\ntwo\nthree\nfour');
    put('src/later.ts', 'late');
    git('add', '-A');
    git('commit', '-q', '-m', 'more');

    const { brief } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      run,
    });
    assert.deepEqual(brief.since, {
      changed: ['src/new.ts'],
      added: ['src/later.ts'],
      dropped: [],
    });
  });

  it('says nothing about an earlier brief while there are no notes', () => {
    const { repo } = featRepo();
    prepare(repo, { explicit: 'main', baseBranch: 'main', run });
    const { brief } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      run,
    });
    assert.equal(brief.since, undefined);
  });

  it('warns when the page folder is not ignored by git', () => {
    const { repo } = featRepo();
    const { warnings } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      outputDir: 'out',
      run,
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /out\/feat\/review-page is not ignored by git/);
  });

  it('stops when the branch has nothing over its base', () => {
    const { repo, git } = featRepo();
    git('switch', '-q', '-c', 'empty', 'main');
    assert.throws(
      () => prepare(repo, { explicit: 'main', baseBranch: 'main', run }),
      /no commits over main/,
    );
  });
});

describe('review-page — notes', () => {
  it('joins sections and skim in file-name order and keeps one overview', () => {
    const dir = mkdtempSync(join(tmpdir(), 'review-notes-'));
    const section = (title) => ({
      title,
      files: [{ path: `${title}.ts`, summary: 's' }],
    });
    writeFileSync(
      join(dir, '02-b.json'),
      JSON.stringify({ sections: [section('b')] }),
    );
    writeFileSync(
      join(dir, '01-a.json'),
      JSON.stringify({ overview: { summary: 'x' }, sections: [section('a')] }),
    );
    writeFileSync(
      join(dir, '03-c.json'),
      JSON.stringify({ overview: { summary: 'y' } }),
    );

    const { notes, problems } = loadNotes(dir);
    assert.deepEqual(
      notes.sections.map((s) => s.title),
      ['a', 'b'],
    );
    assert.equal(notes.overview.summary, 'x');
    assert.deepEqual(problems, [
      '03-c.json: overview is already set in 01-a.json; keep one',
    ]);
  });

  it('names each field that is missing or the wrong type', () => {
    const problems = checkShape({
      overview: {},
      sections: [
        {
          title: 'S',
          files: [
            {
              path: 'a.ts',
              hunks: [{ parts: [{ at: 'top', title: 't', text: 'x' }] }],
            },
          ],
        },
      ],
      extra: 1,
    });
    assert.deepEqual(problems, [
      'extra is not a notes field; use title, overview, uiReview, sections, skim',
      'overview.summary is missing',
      'sections[0].files[0].summary is missing',
      'sections[0].files[0].hunks[0].parts[0].at must be a line or range such as "12" or "12-30"',
    ]);
  });

  it('accepts every example in the notes format reference', () => {
    const reference = readFileSync(
      new URL('../templates/review-page/notes-format.md', import.meta.url),
      'utf8',
    );
    const examples = [...reference.matchAll(/```json\n([\s\S]*?)```/g)].map(
      (m) => JSON.parse(m[1]),
    );
    assert.equal(examples.length, 4);
    for (const example of examples) assert.deepEqual(checkShape(example), []);
  });

  it('names fields the page would drop', () => {
    const problems = checkShape({
      uiReview: {
        scenarios: [
          {
            title: 'T',
            steps: [{ do: 'a', expect: 'b', cmd: 'npm run dev', wait: 2 }],
          },
        ],
      },
    });
    assert.deepEqual(problems, [
      'uiReview.scenarios[0].steps[0].wait is not a field here; use do, expect, cmd',
    ]);
  });

  it('expands line specs', () => {
    assert.deepEqual(expandRange('3,7-9'), [3, 7, 8, 9]);
    assert.deepEqual(expandRange(5), [5]);
  });

  it('finds every way the notes can disagree with the diff', () => {
    const { repo, git } = featRepo();
    const g = (...args) => run('git', args, repo);
    const files = branchDiff(g, git('merge-base', 'main', 'HEAD').trim());
    const notes = {
      overview: { summary: 'x' },
      sections: [
        {
          title: 'Core',
          files: [
            {
              path: 'src/edit.ts',
              summary: 's',
              hunks: [{ title: 'one', text: 'x' }],
            },
            {
              path: 'src/new.ts',
              summary: 's',
              hunks: [{ parts: [{ at: '1-9', title: 'all', text: 'x' }] }],
            },
            {
              path: 'src/gone.ts',
              summary: 's',
              hunks: [{ parts: [{ at: '1', title: 'old line', text: 'x' }] }],
            },
            { path: 'src/nope.ts', summary: 's' },
          ],
        },
      ],
      skim: [
        {
          label: 'Moves',
          paths: ['src/renamed.ts', 'src/renamed.ts', 'src/crate/a.ts'],
        },
      ],
      uiReview: {
        scenarios: [
          {
            title: 'Look',
            files: ['src/screen.tsx'],
            steps: [{ do: 'a', expect: 'b' }],
          },
        ],
      },
    };

    assert.deepEqual(checkNotes(notes, files), [
      'src/nope.ts: not in the diff; check the path',
      'src/renamed.ts: listed 2 times (skim "Moves"; skim "Moves"); keep one',
      "src/crate/b.ts: missing; add it to a section, a file's tests, or skim",
      'src/edit.ts: 1 hunk note for 2 hunks',
      'src/new.ts: part "all" cites lines 4-9, which the diff does not show',
      'src/screen.tsx: named by walkthrough "Look" but not in the diff',
    ]);
  });
});

describe('review-page — build', () => {
  it('writes the page once the notes cover the branch', () => {
    const { repo } = featRepo();
    const { brief, dir } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      run,
    });
    writeValidNotes(repo, dir, brief);

    const result = build(repo, { dir, run });
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.stats, { files: 6, hunkNotes: 4, walkthroughs: 0 });

    const html = readFileSync(result.file, 'utf8');
    const data = JSON.parse(
      html.match(
        /<script id="review-data" type="application\/json">(.*?)<\/script>/s,
      )[1],
    );
    assert.equal(data.title, 'feat');
    assert.equal(data.overview.summary, 'The branch.');
    assert.deepEqual(
      Object.keys(data.diffs).sort(),
      brief.files.map((f) => f.path).sort(),
    );
    assert.deepEqual(data.unchangedPaths, ['src/still.ts']);
    assert.deepEqual(data.goneDirs, ['src/box']);
    assert.ok(data.diffs['src/edit.ts'].full.length === 40);
  });

  it('writes nothing while the notes have problems', () => {
    const { repo } = featRepo();
    const { brief, dir } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      run,
    });
    const notesDir = writeValidNotes(repo, dir, brief);
    rmSync(join(notesDir, '80-skim.json'));

    const result = build(repo, { dir, run });
    assert.equal(result.problems.length, 2);
    assert.match(result.problems[0], /^src\/crate\/a\.ts: missing/);
    assert.equal(existsSync(join(repo, dir, 'review.html')), false);
  });

  it('asks for a new brief when a commit lands after prepare', () => {
    const { repo, git, put } = featRepo();
    const { brief, dir } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      run,
    });
    writeValidNotes(repo, dir, brief);
    put('src/new.ts', 'changed again');
    git('commit', '-q', '-am', 'later');

    const { problems } = build(repo, { dir, run });
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /the diff changed since prepare \(src\/new\.ts\); run `skills review-page prepare` again/,
    );
  });

  it('asks for prepare when there is no brief', () => {
    const { repo } = featRepo();
    const { problems } = build(repo, { dir: 'tmp/feat/review-page', run });
    assert.match(
      problems[0],
      /brief\.json: missing; run `skills review-page prepare` first/,
    );
  });
});

describe('review-page — the command', () => {
  /** Collects what a command prints. */
  const capture = () => {
    const lines = { out: [], err: [] };
    return {
      lines,
      out: (l) => lines.out.push(l),
      err: (l) => lines.err.push(l),
    };
  };

  it('prints the brief for the agent and passes the base on', () => {
    const { repo } = featRepo();
    const { lines, out, err } = capture();
    const code = reviewPageCommand(['prepare', '--base', 'main'], repo, {
      prepareFn: (root, options) => prepare(root, { ...options, run }),
      out,
      err,
    });
    assert.equal(code, 0);
    assert.deepEqual(lines.err, []);
    assert.equal(lines.out[0], 'base: main (given)');
    assert.equal(lines.out[2], 'folder: tmp/feat/review-page');
    assert.match(lines.out[3], /^6 files, \d+ hunks, \+\d+ -\d+, 1 commit$/);
    assert.equal(lines.out[4], 'pr: none');
  });

  it('prints one line per problem and fails, then the page path once fixed', () => {
    const { repo } = featRepo();
    const { brief, dir } = prepare(repo, {
      explicit: 'main',
      baseBranch: 'main',
      run,
    });
    const notesDir = writeValidNotes(repo, dir, brief);
    rmSync(join(notesDir, '80-skim.json'));

    const failed = capture();
    const buildFn = (root, options) => build(root, { ...options, run });
    assert.equal(
      reviewPageCommand(['build'], repo, { buildFn, run, ...failed }),
      1,
    );
    assert.equal(failed.lines.err.length, 3);
    assert.match(
      failed.lines.err[2],
      /2 problems; fix the notes named above and build again\./,
    );

    writeValidNotes(repo, dir, brief);
    const passed = capture();
    assert.equal(
      reviewPageCommand(['build', '--editor', 'cursor'], repo, {
        buildFn,
        run,
        ...passed,
      }),
      0,
    );
    assert.deepEqual(passed.lines.out, [
      'wrote tmp/feat/review-page/review.html',
      '6 files, 4 hunk notes, 0 UI walkthroughs',
    ]);
    assert.match(
      readFileSync(join(repo, dir, 'review.html'), 'utf8'),
      /"editor":"cursor"/,
    );
  });

  it('shows its usage for an unknown command', () => {
    const { lines, out, err } = capture();
    assert.equal(reviewPageCommand(['nope'], '/', { out, err }), 2);
    assert.match(lines.err[0], /^Usage:/);
  });
});
