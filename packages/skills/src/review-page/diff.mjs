// ============================================================================
// Review Page Diff
// ============================================================================
//
// Everything the review page knows about a branch that git can tell it: each
// changed file with its numbered hunks, the folders the branch empties and
// creates, and the unchanged files that sit beside the changes.

import { createHash } from 'node:crypto';

/**
 * Splits a whole-branch unified diff into files with numbered hunk lines.
 *
 * @param text - `git diff -M` output
 * @returns One entry per changed file: `path`, `oldPath`, `status`, `similarity`, `binary`, `additions`, `deletions`, a `hash` of its diff, and `hunks` of `{header, context, lines}`
 */
export function parseDiff(text) {
  const chunks = text.split(/^diff --git /m).slice(1);

  return chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const file = {
      path: '',
      oldPath: undefined,
      status: 'modified',
      similarity: undefined,
      binary: false,
      additions: 0,
      deletions: 0,
      hunks: [],
      hash: createHash('sha1').update(chunk).digest('hex').slice(0, 12),
    };
    const [, a, b] = lines[0].match(/^a\/(.*) b\/(.*)$/) ?? [];
    file.path = b;

    let hunk;
    let oldLine = 0;
    let newLine = 0;
    for (const line of lines.slice(1)) {
      if (!hunk) {
        if (line.startsWith('new file mode')) file.status = 'added';
        else if (line.startsWith('deleted file mode')) file.status = 'deleted';
        else if (line.startsWith('similarity index'))
          file.similarity = Number(line.match(/(\d+)%/)[1]);
        else if (line.startsWith('rename from ')) {
          file.status = 'renamed';
          file.oldPath = line.slice('rename from '.length);
        } else if (line.startsWith('Binary files')) file.binary = true;
      }

      const header = line.match(
        /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/,
      );
      if (header) {
        oldLine = Number(header[1]);
        newLine = Number(header[2]);
        hunk = {
          header: line.match(/^@@[^@]*@@/)[0],
          context: header[3],
          lines: [],
        };
        file.hunks.push(hunk);
        continue;
      }
      if (!hunk || line === '' || line.startsWith('\\')) continue;

      const sign = line[0];
      const textPart = line.slice(1);
      if (sign === '+') {
        hunk.lines.push({ t: '+', n: newLine++, s: textPart });
        file.additions++;
      } else if (sign === '-') {
        hunk.lines.push({ t: '-', o: oldLine++, s: textPart });
        file.deletions++;
      } else if (sign === ' ') {
        hunk.lines.push({ t: ' ', o: oldLine++, n: newLine++, s: textPart });
      }
    }

    if (file.status === 'deleted') file.path = a;
    return file;
  });
}

/**
 * Reads the branch's diff over its fork point.
 *
 * @param git - Runs git in the repository and returns its stdout
 * @param fork - The commit the branch left its base at
 * @returns The parsed files, as `parseDiff` gives them
 */
export function branchDiff(git, fork) {
  return parseDiff(git('diff', '-M', '--no-color', '-U3', fork, 'HEAD'));
}

/**
 * Lists the folders above a path, outermost first.
 *
 * @param path - A file path relative to the repository root
 * @returns Each folder that holds it, as a path from the root
 */
export function ancestors(path) {
  const dirs = [];
  for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1)) {
    dirs.push(path.slice(0, i));
  }
  return dirs;
}

/**
 * Works out what the file tree shows besides the changed files: the folders the
 * branch empties and creates, and the unchanged files under the deepest folder
 * that holds every change.
 *
 * @param git - Runs git in the repository and returns its stdout
 * @param fork - The commit the branch left its base at
 * @param files - The parsed diff
 * @returns `goneDirs`, `newDirs` and `unchangedPaths`
 */
export function treeFacts(git, fork, files) {
  const listed = (ref, dir) =>
    git(
      'ls-tree',
      '-r',
      '-z',
      '--name-only',
      ref,
      ...(dir ? ['--', `${dir}/`] : []),
    )
      .split('\0')
      .filter(Boolean);
  const dirsAt = (ref) => new Set(listed(ref).flatMap(ancestors));

  const paths = [
    ...new Set(
      files.flatMap((file) => [file.path, file.oldPath].filter(Boolean)),
    ),
  ];
  const touched = new Set(paths.flatMap(ancestors));
  const forkDirs = dirsAt(fork);
  const headDirs = dirsAt('HEAD');

  // Only folders holding a changed path matter, so the lists stay short.
  const goneDirs = [...touched].filter(
    (dir) => forkDirs.has(dir) && !headDirs.has(dir),
  );
  const newDirs = [...touched].filter(
    (dir) => !forkDirs.has(dir) && headDirs.has(dir),
  );

  const treeDir = paths.length
    ? paths
        .map(ancestors)
        .reduce((shared, dirs) => shared.filter((dir) => dirs.includes(dir)))
        .at(-1)
    : undefined;
  const changed = new Set(files.map((file) => file.path));
  const unchangedPaths = listed('HEAD', treeDir).filter(
    (path) => !changed.has(path),
  );

  return { goneDirs, newDirs, unchangedPaths };
}

/**
 * Gives each modified or moved file its full text at HEAD, so the page can
 * show the unchanged lines between hunks. Added and deleted files are a
 * single hunk that already holds the whole file.
 *
 * @param git - Runs git in the repository and returns its stdout
 * @param files - The parsed diff, changed in place
 */
export function attachFullText(git, files) {
  for (const file of files) {
    if (
      !file.binary &&
      file.hunks.length &&
      (file.status === 'modified' || file.status === 'renamed')
    ) {
      file.full = git('show', `HEAD:${file.path}`)
        .replace(/\n$/, '')
        .split('\n');
    }
  }
}

/**
 * Summarises a hunk by the lines it covers, for the brief.
 *
 * @param hunk - A parsed hunk
 * @returns Its `header`, `context`, and the `new` and `old` line ranges as `[first, last]`, or null on a side with no lines
 */
export function hunkSummary(hunk) {
  const range = (key) => {
    const numbers = hunk.lines
      .map((line) => line[key])
      .filter((n) => n != null);
    return numbers.length ? [numbers[0], numbers.at(-1)] : null;
  };
  return {
    header: hunk.header,
    context: hunk.context,
    new: range('n'),
    old: range('o'),
  };
}
