// ============================================================================
// Create
// ============================================================================
//
// Adds a worktree beside the main checkout, gives it its own ports and stack,
// runs the setup hooks and opens it.

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { loadWtConfig, worktreesDir } from './config.mjs';
import {
  copyFiles,
  envFiles,
  rewriteFiles,
  serviceMappings,
  setEnvVar,
} from './env.mjs';
import {
  checkoutRoot,
  git,
  gitLoud,
  hasRef,
  mainRoot,
  real,
  tryGit,
} from './git.mjs';
import { open } from './open.mjs';
import { runHooks } from './run.mjs';
import { nextSlot, usedSlots, writeRecord } from './slots.mjs';
import { buildProject, supabaseMappings } from './supabase/project.mjs';
import { provision } from './supabase/stack.mjs';

// Matches a name that is safe as one folder: letters, digits, dot, dash, underscore.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Names taken by wt's own commands. */
export const RESERVED = new Set(['list', 'port', 'supabase', 'init', 'help']);

/**
 * Checks a worktree name can be used as a single folder.
 *
 * @param name - The requested name
 * @throws When the name is empty, reserved or holds a path separator
 */
export function checkName(name) {
  if (!name || !NAME.test(name)) {
    throw new Error(
      `"${name}" is not a usable worktree name. Use letters, digits, ".", "-" and "_", with no "/".`,
    );
  }
  if (RESERVED.has(name))
    throw new Error(`"${name}" is a wt command, not a usable name.`);
}

/**
 * Adds the worktree itself, choosing how from what branches exist.
 *
 * @param options - Where to add it and which `branch`, `base` and `detach` apply
 * @throws When git refuses to add it
 */
function addWorktree({ cwd, path, branch, base, detach, remote }) {
  if (detach) {
    const ref = base ?? 'HEAD';
    console.log(`Creating detached worktree at ${ref}...`);
    gitLoud(['worktree', 'add', '--detach', path, ref], cwd);
    return;
  }

  if (hasRef(`refs/heads/${branch}`, cwd)) {
    console.log(`Branch ${branch} exists, creating the worktree from it...`);
    gitLoud(['worktree', 'add', path, branch], cwd);
    return;
  }

  if (!base) {
    tryGit(['fetch', remote, branch, '--quiet'], cwd);

    if (hasRef(`refs/remotes/${remote}/${branch}`, cwd)) {
      console.log(
        `Branch ${branch} exists on ${remote}, creating a tracking worktree...`,
      );
      gitLoud(
        [
          'worktree',
          'add',
          '--track',
          '-b',
          branch,
          path,
          `${remote}/${branch}`,
        ],
        cwd,
      );
      return;
    }
  }

  const from = base ?? (tryGit(['branch', '--show-current'], cwd) || 'HEAD');
  console.log(`Creating branch ${branch} from ${from}...`);
  gitLoud(['worktree', 'add', '-b', branch, path, from], cwd);
}

/**
 * Creates a worktree, or opens it when it already exists.
 *
 * @param options - The `name`, `branch`, `base`, `detach` and `supabase` mode, plus `cwd`
 * @returns The worktree's path
 * @throws When the name or config is unusable or git refuses the worktree
 */
export async function create({
  name,
  branch,
  base,
  detach = false,
  supabase = 'stop',
  cwd = process.cwd(),
}) {
  checkName(name);
  if (!detach && !branch)
    throw new Error(
      'A branch is required: wt <name> -b <branch>, or pass --detach.',
    );
  if (detach && branch)
    throw new Error('--detach and -b cannot be used together.');

  const here = checkoutRoot(cwd);
  const main = mainRoot(cwd);
  const config = loadWtConfig(here, main);
  const dir = worktreesDir(config, main);
  const path = join(dir, name);

  if (existsSync(path)) {
    console.log(`Worktree ${name} already exists at ${path}.`);
    open(config, { main, dir, path, name });
    return path;
  }

  const slot = nextSlot(usedSlots(cwd));
  const shift = slot * config.ports.step;

  mkdirSync(dir, { recursive: true });
  addWorktree({ cwd: here, path, branch, base, detach, remote: config.remote });

  const root = real(path);
  writeRecord(root, { name, slot });

  const copied = envFiles(main, config.env);
  copyFiles(main, root, copied);
  if (copied.length > 0) console.log(`Copied ${copied.join(', ')}`);

  const mappings = serviceMappings(config.ports.services, shift);
  const sb = config.supabase;
  let stack = null;

  if (sb) {
    const appPort = sb.appService
      ? config.ports.services[sb.appService] + shift
      : null;
    stack = buildProject(root, sb, slot, appPort);
    if (stack) mappings.push(...supabaseMappings(sb, slot));
  }

  rewriteFiles(root, copied, mappings);

  if (config.ports.offsetEnv) {
    const { name: variable, files } = config.ports.offsetEnv;
    setEnvVar(root, files, variable, shift);
  }

  console.log(`Slot ${slot}: ports shifted by ${shift}.`);
  if (stack) {
    console.log(
      `  Supabase ${stack.projectId}: API :${stack.api}, DB :${stack.db}, Studio :${stack.studio}`,
    );
  }

  const env = {
    WT_NAME: name,
    WT_PATH: root,
    WT_BRANCH: branch ?? '',
    WT_BASE: base ?? '',
    WT_SLOT: String(slot),
    WT_OFFSET: String(shift),
  };
  await runHooks(config.hooks.postCreate, root, env);

  const state = stack
    ? await provision(root, {
        mode: supabase,
        slot,
        resetCommand: sb.resetCommand,
      })
    : null;

  open(config, { main, dir, path: root, name });
  summary({
    root,
    name,
    branch: branch ?? git(['rev-parse', '--short', 'HEAD'], root),
    slot,
    config,
    shift,
    state,
  });

  return root;
}

/**
 * Prints what was made and what state the stack is in.
 *
 * @param info - The worktree's `root`, `name`, `branch`, `slot`, `config`, `shift` and stack `state`
 */
function summary({ root, name, branch, slot, config, shift, state }) {
  console.log('');
  console.log(`Done. Worktree ${name} (${branch}) is at ${root}`);

  const ports = Object.entries(config.ports.services).map(
    ([s, p]) => `${s} :${p + shift}`,
  );
  if (ports.length > 0)
    console.log(`  Ports (slot ${slot}): ${ports.join(', ')}`);

  const notes = {
    stopped:
      'Supabase: migrated and seeded, now stopped with its data kept. Start it with `wt supabase start`.',
    running: 'Supabase: up and left running. Stop it with `wt supabase stop`.',
    skipped:
      'Supabase: not booted. First use: `wt supabase start`, then reset the database.',
    'no-cli':
      'Supabase: config written, but the supabase CLI is not on the PATH.',
    'start-failed': 'Supabase: not provisioned, see the warning above.',
    refused: 'Supabase: not provisioned, see the error above.',
  };
  if (state) console.log(`  ${notes[state]}`);
}
