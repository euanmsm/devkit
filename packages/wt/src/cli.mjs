// ============================================================================
// CLI
// ============================================================================
//
// Reads the command line and hands off to the command it names.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { repoRoot } from '@euanmsm/devkit-core';
import { CONFIG_NAME, LOCAL_NAME, loadWtConfig } from './config.mjs';
import { create } from './create.mjs';
import { list } from './list.mjs';
import { port } from './ports.mjs';
import { remove } from './remove.mjs';
import { exec } from './run.mjs';
import { workdir } from './supabase/project.mjs';
import {
  bypassWarning,
  bypassed,
  findTargetMismatch,
  refusal,
  resolveSupabaseTarget,
} from './supabase/target.mjs';

const EXAMPLE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'wt.example.json',
);

/** The `--help` text. */
export const HELP = `wt — git worktrees with their own ports, env files and Supabase stack

Create
  wt <name> -b <branch>            New worktree <name> on <branch>
  wt <name> -b <branch> -f <base>  Fork a new branch from <base>
  wt <name> --detach [-f <ref>]    Worktree with no branch

  An existing local branch is checked out as it is. A branch only on the
  remote is checked out tracking it. Otherwise the branch is created from
  -f <base>, or from the current branch.

  --keep-supabase   Leave the new Supabase stack running
  --no-supabase     Write the Supabase config but do not boot the stack

Delete
  wt -d <name>                     Delete the worktree and its branch
  wt -d <name> --save-branch       Delete the worktree, keep the branch

Other
  wt list                          Every checkout with its slot and path
  wt port <service>                This checkout's port for a service
  wt supabase <args...>            Run the supabase CLI against this checkout's stack
  wt supabase check                Fail when scripts would reach another tree's stack
  wt init [--force]                Write a starter .devkit/${CONFIG_NAME}

Settings live in .devkit/${CONFIG_NAME}. Personal ones, such as how to open a
worktree, go in .devkit/${LOCAL_NAME}, which belongs in .gitignore.`;

/**
 * Runs the supabase CLI, or the target check, for the current checkout.
 *
 * @param args - Arguments after `wt supabase`
 * @returns The exit code
 * @throws When the repository has no `supabase` block
 */
async function supabase(args) {
  const root = repoRoot();
  const sb = loadWtConfig(root).supabase;
  if (!sb) throw new Error(`No "supabase" block in .devkit/${CONFIG_NAME}.`);

  if (args[0] === 'check') {
    const target = resolveSupabaseTarget({ root });
    const mismatch = findTargetMismatch(target);

    if (mismatch && !bypassed()) {
      console.error(refusal(mismatch));
      return 1;
    }
    if (mismatch) console.warn(bypassWarning(mismatch));

    console.log(`Supabase target: ${target.url}  (${target.urlSource})`);
    console.log(`Service-role key: ${target.keySource}`);
    return 0;
  }

  return exec('supabase', ['--workdir', workdir(root, sb), ...args], {
    cwd: root,
  });
}

/**
 * Writes the example config into the repository.
 *
 * @param force - True to replace an existing file
 * @returns The exit code
 */
function init(force) {
  const dir = join(repoRoot(), '.devkit');
  const path = join(dir, CONFIG_NAME);

  if (existsSync(path) && !force) {
    console.error(
      `.devkit/${CONFIG_NAME} already exists. Pass --force to replace it.`,
    );
    return 1;
  }

  mkdirSync(dir, { recursive: true });
  copyFileSync(EXAMPLE, path);
  console.log(
    `Wrote .devkit/${CONFIG_NAME}. Edit the ports and hooks to match this repository.`,
  );
  console.log(`Add .devkit/${LOCAL_NAME} to .gitignore for personal settings.`);
  return 0;
}

/**
 * Parses the arguments and runs the command.
 *
 * @param argv - Arguments after the program name
 * @returns The exit code
 * @throws When the arguments or the config are unusable
 */
export async function run(argv) {
  const [first, ...rest] = argv;

  if (first === 'supabase') return supabase(rest);
  if (first === 'port') {
    if (!rest[0]) throw new Error('Name a service: wt port <service>');
    process.stdout.write(String(port(rest[0])));
    return 0;
  }

  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      branch: { type: 'string', short: 'b' },
      from: { type: 'string', short: 'f' },
      detach: { type: 'boolean' },
      delete: { type: 'boolean', short: 'd' },
      'save-branch': { type: 'boolean' },
      'keep-supabase': { type: 'boolean' },
      'no-supabase': { type: 'boolean' },
      force: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || positionals[0] === 'help' || argv.length === 0) {
    console.log(HELP);
    return argv.length === 0 ? 1 : 0;
  }
  if (positionals[0] === 'list') {
    list();
    return 0;
  }
  if (positionals[0] === 'init') return init(Boolean(values.force));
  if (positionals.length !== 1)
    throw new Error('Give exactly one worktree name. See wt --help.');

  const name = positionals[0];

  if (values.delete) {
    await remove({ name, saveBranch: Boolean(values['save-branch']) });
    return 0;
  }

  if (values['keep-supabase'] && values['no-supabase']) {
    throw new Error(
      '--keep-supabase and --no-supabase cannot be used together.',
    );
  }

  await create({
    name,
    branch: values.branch,
    base: values.from,
    detach: Boolean(values.detach),
    supabase: values['keep-supabase']
      ? 'keep'
      : values['no-supabase']
        ? 'skip'
        : 'stop',
  });
  return 0;
}

/** Runs the CLI and exits with its code, printing any error plainly. */
export async function main() {
  try {
    process.exitCode = await run(process.argv.slice(2));
  } catch (error) {
    console.error(`wt: ${error.message}`);
    process.exitCode = 1;
  }
}
