// ============================================================================
// Review Page Build
// ============================================================================
//
// `build` joins the agent's notes with what git says about the branch and
// writes one self-contained HTML page. It reads the diff afresh rather than
// trusting the brief, and refuses to write the page while any check fails, so
// a page that exists always covers the whole branch.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { runCommand } from '../base.mjs';
import { readBrief } from './brief.mjs';
import { attachFullText, branchDiff, treeFacts } from './diff.mjs';
import { checkNotes, loadNotes } from './notes.mjs';

/** The page, with `__REVIEW_DATA__` where the data goes. */
const TEMPLATE = new URL('./template.html', import.meta.url);

/**
 * Checks the notes and, when they pass, writes the review page.
 *
 * @param root - The repository root
 * @param options - The page's `dir` (repo-relative), the default `editor`, and a `run` stand-in for tests
 * @returns The `problems` found, and the written `file` with its `stats` when there are none
 */
export function build(root, { dir, editor = 'vscode', run = runCommand }) {
  const git = (...args) => run('git', args, root);
  const folder = path.join(root, dir);
  const brief = readBrief(path.join(folder, 'brief.json'));
  if (!brief) {
    return {
      problems: [
        `${dir}/brief.json: missing; run \`skills review-page prepare\` first`,
      ],
    };
  }

  const files = branchDiff(git, brief.fork);
  const problems = staleProblems(brief, files);
  if (problems.length) return { problems };

  const { notes, problems: loadProblems } = loadNotes(
    path.join(folder, 'notes'),
  );
  problems.push(...loadProblems);
  if (!loadProblems.length) problems.push(...checkNotes(notes, files));
  if (problems.length) return { problems };

  attachFullText(git, files);
  const data = {
    ...notes,
    title: notes.title ?? brief.pr?.title ?? brief.branch,
    branch: brief.branch || brief.head.slice(0, 8),
    base: brief.base,
    baseSource: brief.baseSource,
    ...(brief.pr ? { pr: { number: brief.pr.number, url: brief.pr.url } } : {}),
    editor,
    repoRoot: root,
    fork: brief.fork.slice(0, 8),
    head: brief.head.slice(0, 8),
    builtAt: new Date().toISOString(),
    commits: brief.commits,
    ...treeFacts(git, brief.fork, files),
    diffs: Object.fromEntries(files.map((file) => [file.path, file])),
  };

  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const file = path.join(folder, 'review.html');
  writeFileSync(
    file,
    readFileSync(TEMPLATE, 'utf8').replace('__REVIEW_DATA__', () => json),
  );

  const hunkNotes = notes.sections
    .flatMap((section) => section.files)
    .flatMap((f) => f.hunks ?? [])
    .reduce((n, hunk) => n + (hunk?.parts?.length ?? (hunk ? 1 : 0)), 0);
  return {
    problems: [],
    file,
    stats: {
      files: files.length,
      hunkNotes,
      walkthroughs: notes.uiReview?.scenarios.length ?? 0,
    },
  };
}

/**
 * Finds files whose diff has changed since the brief was written, which means
 * the notes were planned against a different branch.
 *
 * @param brief - The brief from `prepare`
 * @param files - The diff as it is now
 * @returns One problem when anything moved, telling the agent to prepare again
 */
function staleProblems(brief, files) {
  const before = new Map(brief.files.map((file) => [file.path, file.hash]));
  const moved = files
    .filter((file) => before.get(file.path) !== file.hash)
    .map((file) => file.path);
  const gone = [...before.keys()].filter(
    (p) => !files.some((file) => file.path === p),
  );
  const all = [...moved, ...gone];
  if (!all.length) return [];
  return [
    `the diff changed since prepare (${all.slice(0, 5).join(', ')}${all.length > 5 ? `, and ${all.length - 5} more` : ''}); run \`skills review-page prepare\` again and update those files' notes`,
  ];
}
