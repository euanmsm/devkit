// ============================================================================
// Project
// ============================================================================
//
// Finds the two folders every command needs: the git root, where git runs and
// which every reported path is relative to, and the project folder, the one
// holding the package.json knip runs in. Also turns typed paths into git-root
// paths and reads a project's workspace packages.

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { repoRoot } from '@euanmsm/devkit-core';

/**
 * Resolves a path to its real, on-disk spelling: symlinks followed and, where
 * the filesystem ignores case, each part in the case it is stored in.
 *
 * @param path - An absolute path that exists
 * @returns The real path
 */
export function real(path) {
  return realpathSync.native(path);
}

/**
 * Writes a path with forward slashes.
 *
 * @param path - A relative path
 * @returns The same path, `/`-separated
 */
export function slash(path) {
  return path.split(sep).join('/');
}

/**
 * Finds the repository's root, spelt the way the filesystem stores it.
 *
 * @param cwd - The folder to start from
 * @returns The git root's real path
 * @throws When the folder is not inside a git repository
 */
export function gitRoot(cwd) {
  return real(repoRoot(real(cwd)));
}

/**
 * Makes an absolute path relative to a folder, when it sits inside it.
 *
 * @param folder - The folder
 * @param path - An absolute path
 * @returns The `/`-separated path, `''` for the folder, null when outside
 */
export function inside(folder, path) {
  const rel = relative(folder, path);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return slash(rel);
}

/**
 * Finds the folder knip runs in: the configured `directory`, or else the
 * outermost folder holding a package.json between the current folder and the
 * git root, which puts a monorepo's root ahead of its packages.
 *
 * @param root - The git root
 * @param cwd - The folder the command was run in
 * @param directory - The config's `directory`, relative to the git root, or null
 * @returns `{ dir, prefix }`, the absolute folder and its path from the git root
 * @throws When no folder qualifies, or the configured one has no package.json
 */
export function projectDir(root, cwd, directory) {
  if (directory !== null) {
    const dir = resolve(root, directory);
    if (!existsSync(join(dir, 'package.json')))
      throw new Error(
        `.devkit/dead-code.json: directory "${directory}" has no package.json.`,
      );
    const prefix = inside(root, real(dir));
    if (prefix === null)
      throw new Error(
        `.devkit/dead-code.json: directory "${directory}" is outside the repository.`,
      );
    return { dir: real(dir), prefix };
  }

  let found = null;
  let dir = real(cwd);

  for (;;) {
    if (existsSync(join(dir, 'package.json'))) found = dir;
    if (dir === root || dirname(dir) === dir) break;
    dir = dirname(dir);
  }

  if (!found)
    throw new Error(
      'No package.json between this folder and the repository root. Run dead-code from the JavaScript project, or set "directory" in .devkit/dead-code.json.',
    );
  return { dir: found, prefix: inside(root, found) };
}

/**
 * Joins a project-relative path onto the project's path from the git root.
 *
 * @param prefix - The project's path from the git root, `''` for the root
 * @param path - A path relative to the project
 * @returns The path relative to the git root
 */
export function withPrefix(prefix, path) {
  if (!prefix) return path;
  return path ? `${prefix}/${path}` : prefix;
}

/**
 * Turns a typed path into a git-root path, trying a relative one against the
 * current folder and then the git root, so a reported path works anywhere.
 *
 * @param root - The git root
 * @param cwd - The folder the command was run in
 * @param path - The path as typed
 * @returns `{ rel, full }`, the path from the git root and the real path
 * @throws When the path does not exist, or is outside the repository
 */
export function repoPath(root, cwd, path) {
  const tries = isAbsolute(path)
    ? [path]
    : [resolve(cwd, path), resolve(root, path)];
  const hit = tries.find((p) => existsSync(p));
  if (!hit) throw new Error(`${path} does not exist.`);

  const full = real(hit);
  const rel = inside(root, full);
  if (rel === null) throw new Error(`${path} is outside the repository.`);
  return { rel, full };
}

/**
 * Tells whether a path names a folder.
 *
 * @param full - An absolute path that exists
 * @returns True for a folder
 */
export function isFolder(full) {
  return statSync(full).isDirectory();
}

/**
 * Turns a glob from a workspaces list into a regex over folder paths.
 *
 * @param glob - A pattern such as `packages/*` or `apps/**`
 * @returns A regex matching the whole path
 */
function globRegex(glob) {
  let source = '';
  const text = glob.replace(/^\.\//, '').replace(/\/+$/, '');

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '*' && text[i + 1] === '*') {
      source += '.*';
      i++;
      if (text[i + 1] === '/') i++;
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(`^${source}$`);
}

/**
 * Reads the workspace globs a project declares.
 *
 * @param readFile - Reads a project-relative file, returning null when absent
 * @returns The globs from package.json `workspaces` and pnpm-workspace.yaml
 */
export function workspaceGlobs(readFile) {
  const globs = [];

  try {
    const pkg = JSON.parse(readFile('package.json') ?? '{}');
    const list = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : pkg.workspaces?.packages;
    if (Array.isArray(list))
      globs.push(...list.filter((g) => typeof g === 'string'));
  } catch {
    // An unreadable package.json declares no workspaces.
  }

  const yaml = readFile('pnpm-workspace.yaml');
  if (yaml) {
    let inPackages = false;
    for (const line of yaml.split(/\r?\n/)) {
      if (/^\S/.test(line)) inPackages = /^packages\s*:/.test(line);
      const item = inPackages && line.match(/^\s+-\s*(['"]?)(.+?)\1\s*$/);
      if (item) globs.push(item[2]);
    }
  }

  return globs;
}

/**
 * Lists a project's workspace packages by name.
 *
 * @param files - Project-relative paths of every package.json in the project
 * @param readFile - Reads a project-relative file, returning null when absent
 * @returns Package name to project-relative folder
 */
export function workspacePackages(files, readFile) {
  const globs = workspaceGlobs(readFile);
  const include = globs.filter((g) => !g.startsWith('!')).map(globRegex);
  const exclude = globs
    .filter((g) => g.startsWith('!'))
    .map((g) => globRegex(g.slice(1)));
  const out = new Map();

  for (const file of files) {
    const dir = file === 'package.json' ? '' : file.slice(0, -13);
    if (dir === '' || file.split('/').includes('node_modules')) continue;
    if (!include.some((r) => r.test(dir)) || exclude.some((r) => r.test(dir)))
      continue;

    try {
      const { name } = JSON.parse(readFile(file) ?? '{}');
      if (typeof name === 'string' && name && !out.has(name))
        out.set(name, dir);
    } catch {
      // A package.json that does not parse names no package.
    }
  }

  return out;
}

/**
 * Makes a reader for files under a folder.
 *
 * @param dir - The folder
 * @returns Reads a relative path as text, or null when it is not there
 */
export function reader(dir) {
  return (path) => {
    try {
      return readFileSync(join(dir, path), 'utf8');
    } catch {
      return null;
    }
  };
}
