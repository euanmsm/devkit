// ============================================================================
// Branch
// ============================================================================
//
// `dead-code branch`. Runs knip at the fork point, in a throwaway worktree, and
// on the working tree, then keeps only the findings the branch introduced.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { changesSince, git, isClean, mergeBase } from './git.mjs';
import { analyse } from './knip.mjs';
import { reader, workspacePackages } from './project.mjs';
import { atCommit, sweep } from './worktree.mjs';

/**
 * Builds the key two findings share when they are the same issue.
 *
 * @param finding - A finding
 * @returns `type|file|name`, without the line
 */
function key(finding) {
  return `${finding.type}|${finding.file}|${finding.name}`;
}

/**
 * Moves a fork-point finding onto the path its file has now.
 *
 * @param finding - A finding from the fork point
 * @param renames - Old path to new path
 * @returns The finding under its current path
 */
function moved(finding, renames) {
  const file = renames.get(finding.file);
  if (!file) return finding;
  return {
    ...finding,
    file,
    name: finding.type === 'file' ? file : finding.name,
  };
}

/**
 * Builds the key a symbol keeps when its file moves.
 *
 * @param finding - A finding
 * @returns `type|name`, without the file
 */
function symbolKey(finding) {
  return `${finding.type}|${finding.name}`;
}

/**
 * Tells whether a path sits at or under a folder.
 *
 * @param file - A path from the git root
 * @param folder - A folder from the git root
 * @returns True when it does
 */
function under(file, folder) {
  return file === folder || file.startsWith(`${folder}/`);
}

/**
 * Keeps the workspace filters that name something at the fork point.
 *
 * A workspace the branch added is not there yet, and knip fails on a filter
 * that matches nothing, so those are dropped: everything in them is new.
 *
 * @param dir - The project folder inside the worktree
 * @param workspaces - The filters, folders or package names
 * @returns The filters that still apply
 */
function presentWorkspaces(dir, workspaces) {
  if (workspaces.length === 0) return workspaces;
  const names = workspacePackages(
    git(dir, 'ls-files', '-z', '--', 'package.json', '*/package.json')
      ?.split('\0')
      .filter(Boolean) ?? [],
    reader(dir),
  );

  return workspaces.filter(
    (ws) => /[*?{[]/.test(ws) || names.has(ws) || existsSync(join(dir, ws)),
  );
}

/**
 * Runs knip at the fork point, finding nothing when the project or every named
 * workspace is missing there.
 *
 * @param options - `{ root, fork, prefix, renames, workspaces, include }`
 * @returns `{ findings, errors, missingSubmodules }`
 */
function atFork({ root, fork, prefix, renames, workspaces, include }) {
  return atCommit(
    { root, commit: fork, prefix, renames },
    async ({ tree, missingSubmodules }) => {
      const dir = join(tree, prefix);
      const present = presentWorkspaces(dir, workspaces);
      const empty = { findings: [], errors: [], missingSubmodules };

      if (!existsSync(join(dir, 'package.json'))) return empty;
      if (workspaces.length && present.length === 0) return empty;

      const found = await analyse({
        cwd: dir,
        prefix,
        workspaces: present,
        include,
      });
      return { ...found, missingSubmodules };
    },
  );
}

/**
 * Finds what the branch newly left dead, compared with its fork point, with
 * everything but the errors coming from the working tree.
 *
 * @param options - `{ root, dir, prefix, base, workspaces, include }`
 * @returns `{ findings, unresolved, hints, errors, warnings, fork }`
 * @throws When there is no merge base, or knip cannot run on either side
 */
export async function branchFindings({
  root,
  dir,
  prefix,
  base,
  workspaces,
  include,
}) {
  sweep(root);
  const fork = mergeBase(root, base);
  const head = git(root, 'rev-parse', 'HEAD')?.trim();

  // Nothing has changed since the fork point, so there is nothing new to find.
  if (fork === head && isClean(root)) {
    const now = await analyse({ cwd: dir, prefix, workspaces, include });
    return { ...now, findings: [], warnings: [], fork };
  }

  const { renames, added, deleted } = changesSince(root, fork);
  // Settled together, so the worktree is gone before any failure is reported.
  const results = await Promise.allSettled([
    atFork({ root, fork, prefix, renames, workspaces, include }).catch(
      (error) => {
        error.message = `At the fork point ${fork.slice(0, 7)}, ${error.message}`;
        throw error;
      },
    ),
    analyse({ cwd: dir, prefix, workspaces, include }),
  ]);
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  const [before, after] = results.map((r) => r.value);

  const was = before.findings.map((f) => moved(f, renames));
  const seen = new Set(was.map(key));
  // A file that was wholly unused already held every export it has now.
  const deadFiles = new Set(
    was.filter((f) => f.type === 'file').map((f) => f.file),
  );
  // A dead symbol that left a file now gone for a new one has moved.
  const departed = new Set(
    before.findings
      .filter((f) => deleted.has(f.file) || renames.has(f.file))
      .filter((f) => f.type !== 'file')
      .map(symbolKey),
  );
  const arrived = new Set([...added, ...renames.values()]);
  const skipped = before.missingSubmodules;

  return {
    findings: after.findings.filter(
      (f) =>
        !seen.has(key(f)) &&
        !(f.type !== 'file' && deadFiles.has(f.file)) &&
        !(arrived.has(f.file) && departed.has(symbolKey(f))) &&
        !skipped.some((path) => under(f.file, path)),
    ),
    unresolved: after.unresolved,
    hints: after.hints,
    errors: [
      ...before.errors.map(
        (e) => `At the fork point ${fork.slice(0, 7)}: ${e}`,
      ),
      ...after.errors,
    ],
    warnings: skipped.map(
      (path) =>
        `The submodule ${path} could not be checked out at the fork point, so findings under it are left out.`,
    ),
    fork,
  };
}
