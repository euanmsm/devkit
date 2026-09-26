#!/usr/bin/env node
// ============================================================================
// Skills CLI
// ============================================================================
//
// `skills sync` writes the configured skills; `skills check` fails when the
// skills on disk have drifted from the config; `skills prepass` does the code
// review's shell-side prework.

import { repoRoot } from '@euanmsm/devkit-core';

import { check } from '../src/check.mjs';
import { prepass } from '../src/review/cli.mjs';
import { sync } from '../src/sync.mjs';

const USAGE = `Usage:
  skills sync [--force]   write the skills named in .devkit/skills.json
  skills check            fail when the skills on disk differ from the config
  skills prepass …        the code review's prework, run by the skill itself`;

const [command, ...rest] = process.argv.slice(2);

try {
  const root = repoRoot();

  if (command === 'sync') {
    const { written, removed, unchanged } = await sync(root, {
      force: rest.includes('--force'),
    });

    for (const path of written) console.log(`wrote    ${path}`);
    for (const path of removed) console.log(`removed  ${path}`);
    console.log(
      `${written.length} written, ${removed.length} removed, ${unchanged.length} already up to date.`,
    );
  } else if (command === 'check') {
    const problems = await check(root);

    if (problems.length > 0) {
      for (const { path, problem } of problems) {
        console.error(`${path}: ${problem}`);
      }
      console.error('\nRun `npx skills sync` and commit the result.');
      process.exit(1);
    }

    console.log('Skills are in step with .devkit/skills.json.');
  } else if (command === 'prepass') {
    process.exitCode = await prepass(rest, root);
  } else {
    console.error(USAGE);
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
