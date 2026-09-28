// ============================================================================
// Prepass CLI
// ============================================================================
//
// `skills prepass split|tools|graph`, run by the code review skill. Reads the
// repository's review config for the tool list, the same config the workflow
// script was generated from.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readConfig } from '../config.mjs';
import { SKILLS } from '../skills.mjs';
import { loadReviewConfig } from './config.mjs';
import { buildImportGraph, runTools, splitPatches } from './prepass.mjs';

const USAGE = `Usage:
  skills prepass split --base <sha> --target <ref> --out <patchDir>
  skills prepass tools --scratch <dir> --files-from <listfile> [--base <sha>]
  skills prepass graph --files-from <listfile>`;

/**
 * Runs one prepass command, printing its result for the skill to read.
 *
 * @param argv - The arguments after `prepass`
 * @param root - The repository root
 * @returns The process exit code
 */
export async function prepass(argv, root) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  const need = (name) => {
    if (!flags[name] || flags[name] === true) {
      throw new Error(`skills prepass ${command}: missing --${name}`);
    }
    return flags[name];
  };

  if (command === 'split') {
    const summary = await splitPatches(root, {
      base: need('base'),
      target: need('target'),
      out: need('out'),
    });
    console.log(JSON.stringify(summary));
    return 0;
  }

  if (command === 'tools') {
    const status = await runTools(root, await reviewConfig(root), {
      scratch: need('scratch'),
      files: readFileList(root, need('files-from')),
      // An empty --base is target mode's unset variable, not a mistake.
      base: typeof flags.base === 'string' && flags.base ? flags.base : null,
    });
    console.log(JSON.stringify(status));
    return 0;
  }

  if (command === 'graph') {
    const files = readFileList(root, need('files-from'));
    console.log(await buildImportGraph(root, await reviewConfig(root), files));
    return 0;
  }

  console.error(USAGE);
  return 2;
}

/**
 * Loads the review config the way sync does, using the defaults when the skill is not enabled.
 *
 * @param root - The repository root
 * @returns The resolved review config
 */
async function reviewConfig(root) {
  const config = readConfig(root);
  const options =
    config.skills['code-review'] ?? SKILLS['code-review'].defaults;
  return loadReviewConfig(root, options, config);
}

/**
 * Parses `--key value` pairs, with a bare `--key` read as `true`.
 *
 * @param argv - The arguments after the command name
 * @returns The flags keyed by name
 */
export function parseFlags(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;

    const key = argv[i].slice(2);
    const next = argv[i + 1];

    if (next === undefined || next.startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i++;
    }
  }

  return parsed;
}

/**
 * Reads a newline-separated list of paths, dropping blank lines.
 *
 * @param root - The repository root
 * @param listFile - The list file's path relative to the root
 * @returns The trimmed paths, each inside the root rewritten from it the way tools print them
 */
function readFileList(root, listFile) {
  return readFileSync(path.resolve(root, listFile), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => fromRoot(root, line));
}

/**
 * Rewrites a path inside the root as a plain path from it, the way tools report it.
 *
 * @param root - The repository root
 * @param file - A path relative to the root, or absolute
 * @returns The path from the root, or the path unchanged when it is the root or outside it
 */
function fromRoot(root, file) {
  const relative = path.relative(root, path.resolve(root, file));
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  ) {
    return file;
  }
  return relative.split(path.sep).join('/');
}
