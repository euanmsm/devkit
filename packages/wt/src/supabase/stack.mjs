// ============================================================================
// Supabase Stack
// ============================================================================
//
// Boots a new worktree's stack once to migrate and seed it, then stops it with
// the data volumes kept. Deleting a worktree stops its stack and drops them.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, onPath, shell } from '../run.mjs';
import { OVERRIDE_DIR, readProjectId } from './project.mjs';

const WORKDIR = ['--workdir', OVERRIDE_DIR];

/**
 * Reads the project id of a worktree's override config, if it is this slot's.
 *
 * @param worktree - The worktree's root
 * @param slot - The slot the worktree runs in
 * @returns The project id, or null when missing or not suffixed for the slot
 */
export function ownProjectId(worktree, slot) {
  const path = join(worktree, OVERRIDE_DIR, 'supabase', 'config.toml');
  if (!existsSync(path)) return null;

  const id = readProjectId(readFileSync(path, 'utf8'));
  return id?.endsWith(`-wt${slot}`) ? id : null;
}

/**
 * Stops a worktree's stack.
 *
 * @param worktree - The worktree's root
 * @param dropData - True to delete the Docker volumes as well
 * @returns Whether the CLI reported success
 */
async function stop(worktree, dropData) {
  const args = ['stop', ...(dropData ? ['--no-backup'] : [])];
  return (
    (await exec('supabase', [...WORKDIR, ...args], { cwd: worktree })) === 0
  );
}

/**
 * True when Docker reports the stack's database container running.
 *
 * @param projectId - The stack's project id
 * @returns Whether `supabase_db_<projectId>` is up
 */
function containerUp(projectId) {
  const result = spawnSync('docker', ['ps', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  });
  return (result.stdout ?? '').split('\n').includes(`supabase_db_${projectId}`);
}

/**
 * Boots, migrates and seeds a new worktree's stack, then stops it or not.
 *
 * @param worktree - The worktree's root
 * @param options - `mode` of stop, keep or skip, the `slot` and `resetCommand`
 * @returns What state the stack was left in
 */
export async function provision(worktree, { mode, slot, resetCommand }) {
  if (mode === 'skip') return 'skipped';
  if (!onPath('supabase')) return 'no-cli';

  const id = ownProjectId(worktree, slot);
  if (!id) {
    console.error(
      `  Error: the override config's project_id does not end in -wt${slot}.`,
    );
    console.error(
      '  Refusing to start Supabase, which could wipe another stack.',
    );
    return 'refused';
  }

  let interrupted = false;
  const onSignal = () => {
    interrupted = true;
  };
  if (mode === 'stop') {
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  }

  const bail = async () => {
    console.log(
      '\nInterrupted — stopping the worktree stack, data volumes kept...',
    );
    await stop(worktree, false);
    process.exit(130);
  };

  try {
    console.log(`Starting worktree Supabase stack (${id})...`);
    const started = await exec('supabase', [...WORKDIR, 'start'], {
      cwd: worktree,
    });
    if (interrupted) await bail();

    if (started !== 0) {
      console.warn(
        '  Warning: supabase start failed. Boot it by hand from the worktree.',
      );
      return 'start-failed';
    }

    if (containerUp(id)) {
      console.log("Resetting the database to this branch's migrations...");
      const reset = resetCommand
        ? await shell(resetCommand, { cwd: worktree })
        : await exec('supabase', [...WORKDIR, 'db', 'reset'], {
            cwd: worktree,
          });
      if (interrupted) await bail();
      if (reset !== 0)
        console.warn(
          '  Warning: the reset failed. Run it by hand from the worktree.',
        );
    } else {
      console.warn(
        `  Warning: no container named supabase_db_${id} is up, reset skipped.`,
      );
    }

    if (mode === 'keep') return 'running';

    console.log('Stopping worktree Supabase stack, data volumes kept...');
    if (await stop(worktree, false)) return 'stopped';

    console.warn(
      '  Warning: supabase stop failed. Stop it by hand from the worktree.',
    );
    return 'running';
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

/**
 * Stops a worktree's stack and deletes its Docker volumes.
 *
 * @param worktree - The worktree's root
 * @param slot - The slot the worktree runs in
 * @returns Whether a stack was found and stopped
 */
export async function teardown(worktree, slot) {
  if (!ownProjectId(worktree, slot) || !onPath('supabase')) return false;

  console.log('Stopping worktree Supabase stack and deleting its data...');
  const ok = await stop(worktree, true);
  if (!ok)
    console.warn(
      '  Warning: supabase stop failed. The stack may not have been running.',
    );
  return ok;
}
