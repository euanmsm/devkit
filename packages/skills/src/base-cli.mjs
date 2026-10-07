// ============================================================================
// Base CLI
// ============================================================================
//
// `skills base`, run by every skill that works on a branch's changes. Prints
// the parent branch, where the branch left it and how it was found, as shell
// assignments the skill evaluates.

import { baseAssignments, resolveBase } from './base.mjs';
import { readConfig } from './config.mjs';
import { parseFlags } from './review/cli.mjs';

const USAGE = 'Usage: skills base [--base <branch>] [--json]';

/**
 * Resolves the base branch and prints it for the skill to read.
 *
 * @param argv - The arguments after `base`
 * @param root - The repository root
 * @param options - A `resolve` stand-in and `out`/`err` writers for tests
 * @returns The process exit code: 0, or 2 when the base cannot be decided
 */
export function baseCommand(
  argv,
  root,
  {
    resolve = resolveBase,
    out = (line) => console.log(line),
    err = (line) => console.error(line),
  } = {},
) {
  const flags = parseFlags(argv);

  if (
    flags.base === true ||
    argv.some((arg) => arg === '-h' || arg === '--help')
  ) {
    err(USAGE);
    return 2;
  }

  let resolved;
  try {
    resolved = resolve(root, {
      explicit: typeof flags.base === 'string' ? flags.base : undefined,
      baseBranch: readConfig(root).baseBranch,
    });
  } catch (error) {
    err(error.message);
    return 2;
  }

  for (const warning of resolved.warnings) err(`warning: ${warning}`);
  out(
    flags.json ? JSON.stringify(resolved, null, 2) : baseAssignments(resolved),
  );
  return 0;
}
