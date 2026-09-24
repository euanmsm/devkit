// ============================================================================
// Remove
// ============================================================================
//
// Deletes a worktree by name: its stack, any server left on its ports, its
// workspace entry, the folder and, unless kept, its branch.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { loadWtConfig, worktreesDir } from './config.mjs';
import { checkoutRoot, gitLoud, mainRoot, real, worktrees } from './git.mjs';
import { close } from './open.mjs';
import { listeners, runHooks } from './run.mjs';
import { slotOf } from './slots.mjs';
import { teardown } from './supabase/stack.mjs';

/**
 * Stops any process still listening on the worktree's configured ports.
 *
 * @param config - The loaded config
 * @param shift - The worktree's port offset
 */
function killServers(config, shift) {
  for (const service of config.ports.killOnDelete) {
    const port = config.ports.services[service] + shift;
    const pids = listeners(port);
    if (pids.length === 0) continue;

    console.log(`Stopping ${service} on :${port} (pids ${pids.join(', ')})...`);
    for (const pid of pids) {
      try {
        process.kill(pid);
      } catch {
        // The process exited between the lookup and the kill.
      }
    }
  }
}

/**
 * Deletes a worktree and, unless kept, its branch.
 *
 * @param options - The worktree's `name`, whether to `saveBranch`, and `cwd`
 * @throws When no worktree has that name
 */
export async function remove({
  name,
  saveBranch = false,
  cwd = process.cwd(),
}) {
  const main = mainRoot(cwd);
  const config = loadWtConfig(checkoutRoot(cwd), main);
  const path = real(join(worktreesDir(config, main), name));
  const entry = worktrees(cwd).find((w) => real(w.path) === path);

  if (!entry) throw new Error(`No worktree named ${name} at ${path}.`);
  if (path === main) throw new Error('Refusing to delete the main checkout.');

  const slot = slotOf(path);
  const shift = slot * config.ports.step;

  await runHooks(config.hooks.preDelete, path, {
    WT_NAME: name,
    WT_PATH: path,
    WT_BRANCH: entry.branch ?? '',
    WT_SLOT: String(slot),
    WT_OFFSET: String(shift),
  });

  if (slot > 0) {
    await teardown(path, slot);
    killServers(config, shift);
  }

  close(config, { main, path });

  console.log(`Removing worktree at ${path}...`);
  if (existsSync(path)) gitLoud(['worktree', 'remove', '--force', path], main);
  else gitLoud(['worktree', 'prune'], main);

  if (!entry.branch) {
    console.log('Detached worktree, no branch to delete.');
  } else if (saveBranch) {
    console.log(`Kept branch ${entry.branch}.`);
  } else {
    console.log(`Deleting branch ${entry.branch}...`);
    gitLoud(['branch', '-D', entry.branch], main);
  }

  console.log('Done.');
}
