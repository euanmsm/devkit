// ============================================================================
// Check Comments
// ============================================================================
//
// The CI half of the comment gate. Fails a pull request whose added lines break
// the contract, so existing debt in an untouched file never blocks a merge.

import { execFileSync } from 'node:child_process';

import { config, newFindings, governs } from './scanner.mjs';

// A missed rename reads a moved file's existing debt as new.
const RENAMES = '--find-renames=20%';

const tops = new Map();

/**
 * Finds the top of the working tree holding the current directory.
 *
 * @returns The worktree root, or the current directory outside a repository
 */
function top() {
  const cwd = process.cwd();
  if (!tops.has(cwd)) {
    let dir = cwd;
    try {
      dir =
        execFileSync('git', ['rev-parse', '--show-toplevel'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || cwd;
    } catch {}
    tops.set(cwd, dir);
  }
  return tops.get(cwd);
}

/**
 * Runs git from the worktree root, throwing an error carrying its stderr.
 *
 * Diff output names files from the root, so pathspecs fed back in must resolve
 * from there too, wherever the check was started.
 *
 * @param args - Arguments after `git`
 * @returns What the command wrote to stdout
 */
function run(args) {
  return execFileSync('git', args, {
    cwd: top(),
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Runs git, swallowing the failure `git show` reports on a file the branch adds.
 *
 * @param args - Arguments after `git`
 * @returns What the command wrote to stdout, or null when it failed
 */
function git(...args) {
  try {
    return run(args);
  } catch {
    return null;
  }
}

/**
 * Names the commit the branch diverged from.
 *
 * @param base - The branch to compare against
 * @returns The merge base, or null when there is none
 */
export function mergeBase(base) {
  return git('merge-base', base, 'HEAD')?.trim() || null;
}

/**
 * Lists in-scope files the diff touches.
 *
 * @param from - The commit to diff against
 * @returns Repo-relative paths the contract governs
 */
export function changedFiles(from) {
  // NUL-separated output leaves a path unquoted, whatever characters it holds.
  return run(['diff', '--name-only', '-z', '--diff-filter=d', from, 'HEAD'])
    .split('\0')
    .filter(governs);
}

/**
 * Reads the added-line ranges out of a unified diff.
 *
 * @param patch - `git diff -U0` output for one file
 * @returns One range per hunk, in head-side line numbers
 */
export function addedRanges(patch) {
  const ranges = [];

  for (const line of patch.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))?/.exec(line);
    if (!hunk) continue;

    const from = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    if (count > 0) ranges.push({ from, to: from + count - 1 });
  }

  return ranges;
}

/**
 * Maps each renamed path to what it was called at the base commit.
 *
 * @param from - The base commit
 * @returns New path to old path, for renames only
 */
export function renamedFrom(from) {
  const out = new Map();
  const fields = run([
    'diff',
    '--name-status',
    '-z',
    RENAMES,
    from,
    'HEAD',
  ]).split('\0');

  // A rename or copy names two paths after its status, every other change one.
  for (let i = 0; i < fields.length;) {
    const code = fields[i];
    if (/^[RC]/.test(code)) {
      if (code.startsWith('R') && fields[i + 1] && fields[i + 2])
        out.set(fields[i + 2], fields[i + 1]);
      i += 3;
    } else i += 2;
  }

  return out;
}

/**
 * Reads every file's added-line ranges from one diff.
 *
 * @param from - The base commit
 * @param paths - Every path to diff, each renamed file's old name included
 * @returns Head-side path to its added ranges
 */
export function addedRangesByFile(from, paths) {
  const out = new Map();
  if (paths.length === 0) return out;

  let file = null;
  let hunks = [];

  for (const line of run([
    '-c',
    'core.quotePath=false',
    'diff',
    '--no-color',
    '--no-ext-diff',
    '-U0',
    RENAMES,
    from,
    'HEAD',
    '--',
    ...paths,
  ]).split('\n')) {
    if (!line.startsWith('diff --git ')) {
      if (file) hunks.push(line);
      continue;
    }

    if (file) out.set(file, addedRanges(hunks.join('\n')));
    // A quoted header is left unread, so its file gets a diff of its own.
    file = /^diff --git a\/.+ b\/(.+)$/.exec(line)?.[1] ?? null;
    hunks = [];
  }

  if (file) out.set(file, addedRanges(hunks.join('\n')));

  return out;
}

/**
 * Finds contract violations one file's diff introduces.
 *
 * @param file - Repo-relative path
 * @param from - The commit to diff against
 * @param renames - New path to old path, for a file the branch moved
 * @param spans - Added line ranges per file, from the batched diff
 * @returns Findings the diff adds
 */
function checkFile(file, from, renames, spans) {
  // A moved file's base version sits under its old path.
  const was = renames.get(file) ?? file;

  // Git quotes a header path holding a space, which the batched split misses.
  const span =
    spans.get(file) ??
    addedRanges(
      run([
        'diff',
        '--no-color',
        '--no-ext-diff',
        '-U0',
        RENAMES,
        from,
        'HEAD',
        '--',
        was,
        file,
      ]),
    );
  if (span.length === 0) return [];

  const before = git('show', `${from}:${was}`) ?? '';
  const after = run(['show', `HEAD:${file}`]);

  return newFindings(before, after, span, file);
}

/** Checks the branch and exits non-zero when it adds a violation. */
export function main() {
  const base = process.argv[2] || 'origin/main';
  const from = mergeBase(base);

  if (!from) {
    console.error(
      `Could not find a merge base with ${base}. Fetch it, or pass one as an argument.`,
    );
    process.exit(1);
  }

  const files = changedFiles(from);
  const renames = renamedFrom(from);
  const spans = addedRangesByFile(from, [
    ...files,
    ...files.map((f) => renames.get(f) ?? f),
  ]);
  let total = 0;

  for (const file of files) {
    const found = checkFile(file, from, renames, spans);
    total += found.length;
    for (const f of found)
      console.log(`${file}:${f.line}  [${f.rule}]  ${f.message}`);
  }

  if (total === 0) {
    console.log(
      `No new comment-contract violations across ${files.length} changed file(s).`,
    );
    process.exit(0);
  }

  console.log(
    `\n${total} new violation(s) across ${files.length} changed file(s).`,
  );
  if (config.rulesDoc) console.log(`The rules are in ${config.rulesDoc}`);
  if (config.examplesDoc)
    console.log(`Paired examples are in ${config.examplesDoc}`);
  process.exit(1);
}
