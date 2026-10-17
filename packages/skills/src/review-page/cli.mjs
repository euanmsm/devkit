// ============================================================================
// Review Page CLI
// ============================================================================
//
// `skills review-page prepare|build`, run by the review-page skill. Prepare
// prints what the agent needs to plan its notes; build prints each problem
// with the notes on its own line, or the page it wrote.

import path from 'node:path';

import { runCommand } from '../base.mjs';
import { readConfig } from '../config.mjs';
import { parseFlags } from '../review/cli.mjs';
import { pageDir, prepare } from './brief.mjs';
import { build } from './build.mjs';

const USAGE = `Usage:
  skills review-page prepare [--base <branch>] [--output-dir <dir>]
  skills review-page build [--output-dir <dir>] [--editor vscode|cursor]`;

/**
 * Runs one review-page command.
 *
 * @param argv - The arguments after `review-page`
 * @param root - The repository root
 * @param options - `prepareFn`/`buildFn`/`run` stand-ins and `out`/`err` writers for tests
 * @returns The process exit code: 0, 1 when the notes have problems, or 2 when the command cannot run
 */
export function reviewPageCommand(
  argv,
  root,
  {
    prepareFn = prepare,
    buildFn = build,
    run = runCommand,
    out = (line) => console.log(line),
    err = (line) => console.error(line),
  } = {},
) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  const outputDir =
    typeof flags['output-dir'] === 'string' ? flags['output-dir'] : 'tmp';

  if (command === 'prepare') {
    let result;
    try {
      result = prepareFn(root, {
        explicit:
          typeof flags.base === 'string' && flags.base ? flags.base : undefined,
        baseBranch: readConfig(root).baseBranch,
        outputDir,
      });
    } catch (error) {
      err(error.message);
      return 2;
    }

    const { brief, dir, warnings } = result;
    const { totals } = brief;
    for (const warning of warnings) err(`warning: ${warning}`);
    out(`base: ${brief.base} (${brief.baseSource})`);
    out(`fork: ${brief.fork.slice(0, 8)}`);
    out(`folder: ${dir}`);
    out(
      `${totals.files} files, ${totals.hunks} hunks, +${totals.additions} -${totals.deletions}, ${brief.commits.length} commit${brief.commits.length === 1 ? '' : 's'}`,
    );
    out(brief.pr ? `pr: #${brief.pr.number} ${brief.pr.title}` : 'pr: none');
    if (brief.since) {
      const { changed, added, dropped } = brief.since;
      out(
        changed.length || added.length || dropped.length
          ? 'since the last brief:'
          : 'since the last brief: nothing changed',
      );
      for (const p of changed) out(`  changed  ${p}`);
      for (const p of added) out(`  added    ${p}`);
      for (const p of dropped) out(`  dropped  ${p}`);
    }
    if (brief.uncommitted) {
      out(
        `uncommitted: ${brief.uncommitted} file${brief.uncommitted === 1 ? '' : 's'} with changes not committed, left out of the page`,
      );
    }
    return 0;
  }

  if (command === 'build') {
    const editor = typeof flags.editor === 'string' ? flags.editor : 'vscode';

    let result;
    try {
      result = buildFn(root, { dir: currentDir(root, outputDir, run), editor });
    } catch (error) {
      err(error.message);
      return 2;
    }

    if (result.problems.length) {
      for (const problem of result.problems) err(problem);
      err(
        `\n${result.problems.length} problem${result.problems.length === 1 ? '' : 's'}; fix the notes named above and build again.`,
      );
      return 1;
    }
    const { files, hunkNotes, walkthroughs } = result.stats;
    out(`wrote ${path.relative(root, result.file)}`);
    out(
      `${files} files, ${hunkNotes} hunk notes, ${walkthroughs} UI walkthrough${walkthroughs === 1 ? '' : 's'}`,
    );
    return 0;
  }

  err(USAGE);
  return command && !['help', '--help', '-h'].includes(command) ? 2 : 0;
}

/**
 * Names the current branch's page folder, the same way prepare named it.
 *
 * @param root - The repository root
 * @param outputDir - The repo-relative folder review pages go under
 * @param run - Runs a command and returns its stdout
 * @returns The folder, relative to the root
 */
function currentDir(root, outputDir, run) {
  const branch = run('git', ['branch', '--show-current'], root).trim();
  const head = run('git', ['rev-parse', 'HEAD'], root).trim();
  return pageDir(outputDir, branch, head);
}
