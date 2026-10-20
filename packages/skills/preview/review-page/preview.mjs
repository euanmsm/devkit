#!/usr/bin/env node
// ============================================================================
// Review Page Preview
// ============================================================================
//
// Builds a review page from made-up data, so the page's template can be worked
// on without a real branch. It makes a throwaway repository with a `main`
// branch and a `preview/upload-retries` branch over it, writes the notes the
// agent would, and runs the real `prepare` and `build`, so the page always
// uses the current `template.html`.
//
//   npm run preview:review-page                 # build, print the page's path
//   npm run preview:review-page -- --open       # and open it
//   npm run preview:review-page -- --large      # add 40 generated files, ~12,000 lines
//   npm run preview:review-page -- --large=100  # or as many as asked
//
// The repository is rebuilt at the same path every run, so the page's read
// marks and comments, kept in the browser by path and branch, survive it.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { prepare } from '../../src/review-page/brief.mjs';
import { build } from '../../src/review-page/build.mjs';
import { baseFiles, commits, notes, pr } from './fixture.mjs';

/** Where the preview repository is built, git-ignored at the devkit root. */
export const PREVIEW_ROOT = fileURLToPath(
  new URL('../../../../.preview/review-page/', import.meta.url),
);

/** The branch the page reviews. */
const BRANCH = 'preview/upload-retries';

/** Lines in each generated file of a `--large` preview. */
const LARGE_LINES = 300;

/**
 * Runs git and the shell for real, and fails every `gh` call, since the
 * preview has no remote and no PR to ask about.
 *
 * @param command - The program
 * @param args - Its arguments
 * @param cwd - The working directory
 * @returns The stdout
 */
function run(command, args, cwd) {
  if (command === 'gh') throw new Error('the preview has no PR');
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Builds the preview repository and its review page.
 *
 * @param options - The repository `root`, and how many generated files `large` adds
 * @returns The written `file` and its `stats`, or the `problems` that stopped the build
 */
export function buildPreview({ root = PREVIEW_ROOT, large = 0 } = {}) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  // Fixed names and dates give the same commits every run.
  let tick = 0;
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Preview',
        GIT_AUTHOR_EMAIL: 'preview@example.com',
        GIT_COMMITTER_NAME: 'Preview',
        GIT_COMMITTER_EMAIL: 'preview@example.com',
        GIT_AUTHOR_DATE: `2026-01-01T00:${String(tick).padStart(2, '0')}:00Z`,
        GIT_COMMITTER_DATE: `2026-01-01T00:${String(tick).padStart(2, '0')}:00Z`,
      },
    });
  const write = (files) => {
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
  };
  const commit = (message) => {
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', message);
    tick += 1;
  };

  git('init', '-q', '-b', 'main');
  write(baseFiles);
  commit('chore: start the uploads demo');

  git('switch', '-q', '-c', BRANCH);
  for (const step of commits) {
    for (const [from, to] of step.move ?? []) {
      mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
      git('mv', from, to);
    }
    write(step.write ?? {});
    for (const file of step.remove ?? []) git('rm', '-q', file);
    commit(step.message);
  }
  const generated = generatedFiles(large);
  if (generated.length) {
    write(
      Object.fromEntries(generated.map((file) => [file, generatedText(file)])),
    );
    commit(`chore: generate ${generated.length} files of load`);
  }

  const { brief, dir } = prepare(root, {
    explicit: 'main',
    baseBranch: 'main',
    outputDir: 'tmp',
    run,
  });
  // A made-up PR, as if `gh` had found one.
  const briefPath = path.join(root, dir, 'brief.json');
  writeFileSync(
    briefPath,
    `${JSON.stringify({ ...JSON.parse(readFileSync(briefPath, 'utf8')), pr }, null, 2)}\n`,
  );

  writeNotes(path.join(root, dir, 'notes'), brief, generated);
  return build(root, { dir, run });
}

/**
 * Writes the fixture's notes, one file per section as the agent does, with
 * each file's hunk notes matched to the diff the fixture actually made.
 *
 * @param folder - The page's `notes/` folder
 * @param brief - The brief `prepare` wrote
 * @param generated - The paths of any generated files
 */
function writeNotes(folder, brief, generated) {
  const byPath = new Map(brief.files.map((file) => [file.path, file]));
  const sections = [...notes.sections];
  if (generated.length) {
    sections.push({
      title: 'Generated load',
      intro:
        'Made up by `--large`, to see how the page copes with a big branch. Each file reads like a real one so the notes column fills as it would.',
      files: generated.map((file) => {
        const name = path.basename(file, '.ts');
        return {
          path: file,
          summary: `New \`${name}\`: a run of small steps, each doubling its input and adding its own number.`,
          context: [
            `\`${name}\` is one of the modules the upload pipeline loads by name. Each step is called in order, and the result of one feeds the next.`,
            'Nothing imports it directly; the pipeline finds it by its folder, so adding a file is enough to register it.',
          ],
          changed: `Adds the module whole. The steps are uniform on purpose, so a reviewer only needs to check **one** and skim the rest for anything that breaks the pattern.`,
        };
      }),
    });
  }

  const fill = (file) => ({
    ...file,
    hunks: matchHunks(file, byPath.get(file.path)),
  });
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path.join(folder, '00-overview.json'), json(notes.overview));
  sections.forEach((section, i) => {
    writeFileSync(
      path.join(folder, `${String(i + 1).padStart(2, '0')}-section.json`),
      json({ sections: [{ ...section, files: section.files.map(fill) }] }),
    );
  });
  writeFileSync(path.join(folder, '80-skim.json'), json(notes.skim));
  writeFileSync(path.join(folder, '90-ui.json'), json(notes.ui));
}

/**
 * A file's hunk notes: the fixture's when they match its hunks one for one,
 * else made up from the hunks, so editing a fixture file never breaks the build.
 *
 * @param file - The file's notes from the fixture
 * @param summary - The file in the brief
 * @returns One note per hunk
 */
function matchHunks(file, summary) {
  const hunks = summary?.hunks ?? [];
  if (file.hunks?.length === hunks.length) return file.hunks;
  if (file.hunks) {
    console.warn(
      `${file.path}: the fixture has ${file.hunks.length} hunk notes for ${hunks.length} hunks; using made-up ones`,
    );
  }
  const side = summary?.status === 'deleted' ? 'old' : 'new';
  return hunks.map((hunk, i) => {
    const range = hunk[side];
    // An added or deleted file is one hunk; split it like the agent would.
    if (summary.status === 'added' || summary.status === 'deleted') {
      const [from, to] = range;
      const step = Math.max(1, Math.ceil((to - from + 1) / 3));
      const parts = [];
      for (let start = from; start <= to; start += step) {
        const end = Math.min(to, start + step - 1);
        parts.push({
          at: `${start}-${end}`,
          title: `Lines ${start}–${end}`,
          text: [
            `The steps in lines ${start} to ${end}. Each takes a number, doubles it and adds the step’s own number, so step 3 turns \`5\` into \`13\`.`,
            'None of them reads or writes anything outside itself, so they can be checked one at a time in any order.',
          ],
        });
      }
      return { parts };
    }
    return {
      title: `Change ${i + 1}`,
      text: 'A placeholder note: the fixture’s notes no longer match this file’s hunks, so update them in `fixture.mjs`.',
    };
  });
}

/**
 * The paths of a `--large` preview's generated files.
 *
 * @param count - How many
 * @returns Their paths
 */
function generatedFiles(count) {
  return Array.from(
    { length: count },
    (_, i) => `src/generated/module${String(i + 1).padStart(3, '0')}.ts`,
  );
}

/**
 * A generated file's text: varied enough to look like code when highlighted.
 *
 * @param file - Its path
 * @returns The text
 */
function generatedText(file) {
  const name = path.basename(file, '.ts');
  const lines = [`/** ${name}: generated for the review page preview. */`];
  for (let i = 1; lines.length < LARGE_LINES; i += 1) {
    lines.push(
      `export function ${name}Step${i}(input: number): number {`,
      `  // Step ${i} doubles the input and adds ${i}.`,
      `  return input * 2 + ${i};`,
      '}',
      '',
    );
  }
  return `${lines.slice(0, LARGE_LINES).join('\n')}\n`;
}

/**
 * Runs the preview from the command line.
 *
 * @param argv - The arguments after the script
 * @returns The process exit code
 */
function main(argv) {
  const largeArg = argv.find(
    (arg) => arg === '--large' || arg.startsWith('--large='),
  );
  const large = largeArg ? Number(largeArg.split('=')[1] ?? 40) : 0;
  if (!Number.isInteger(large) || large < 0) {
    console.error('--large takes a whole number of files, such as --large=100');
    return 2;
  }

  const result = buildPreview({ large });
  if (result.problems.length) {
    for (const problem of result.problems) console.error(problem);
    return 1;
  }
  const { files, hunkNotes, walkthroughs } = result.stats;
  console.log(`wrote ${result.file}`);
  console.log(
    `${files} files, ${hunkNotes} hunk notes, ${walkthroughs} UI walkthroughs`,
  );
  console.log(pathToFileURL(result.file).href);
  if (argv.includes('--open')) {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    try {
      execFileSync(opener, [result.file], { stdio: 'ignore' });
    } catch {
      console.error(`could not open it; open the path above in a browser`);
    }
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
