// ============================================================================
// Remove
// ============================================================================
//
// Deletes a worktree by name: what it is running, its stack and data, its
// workspace entry, the folder and, unless kept, its branch.

import { existsSync } from 'node:fs';

import { loadWtConfig } from './config.mjs';
import { checkoutRoot, gitLoud, mainRoot } from './git.mjs';
import { close } from './open.mjs';
import { findWorktree, stopWorktree } from './kill.mjs';
import { runHooks } from './run.mjs';
import { slotOf } from './slots.mjs';
import { teardown } from './supabase/stack.mjs';

/**
 * Deletes a worktree and, unless kept, its branch.
 *
 * @param options - The worktree's `name`, whether to `saveBranch`, and `cwd`
 * @throws When no worktree has that name, or it is locked
 */
export async function remove({
  name,
  saveBranch = false,
  cwd = process.cwd(),
}) {
  const main = mainRoot(cwd);
  const config = loadWtConfig(checkoutRoot(cwd), main);
  const { path, branch, locked } = findWorktree(name, { config, main, cwd });
  if (locked) {
    throw new Error(
      `${path} is locked, nothing removed. Run git worktree unlock ${path} first.`,
    );
  }

  const slot = slotOf(path);
  const shift = slot * config.ports.step;

  if (!existsSync(path)) {
    if (config.hooks.preDelete.length > 0)
      console.log(`${path} is already gone, skipping the preDelete hooks.`);
  } else {
    try {
      await runHooks(config.hooks.preDelete, path, {
        WT_NAME: name,
        WT_PATH: path,
        WT_BRANCH: branch ?? '',
        WT_SLOT: String(slot),
        WT_OFFSET: String(shift),
        // Drops an inherited offset, so the worktree's own env files decide.
        ...(config.ports.offsetEnv && {
          [config.ports.offsetEnv.name]: undefined,
        }),
      });
    } catch (error) {
      throw new Error(`Delete stopped, nothing removed: ${error.message}`);
    }
  }

  if (slot > 0 && existsSync(path)) {
    console.log('Stopping what the worktree is running...');
    await stopWorktree(path, config, slot, { folder: true, stack: 'skip' });
    await teardown(path, slot);
  }

  close(config, { main, path });

  console.log(`Removing worktree at ${path}...`);
  if (existsSync(path)) gitLoud(['worktree', 'remove', '--force', path], main);
  else gitLoud(['worktree', 'prune'], main);

  if (!branch) {
    console.log('Detached worktree, no branch to delete.');
  } else if (saveBranch) {
    console.log(`Kept branch ${branch}.`);
  } else {
    console.log(`Deleting branch ${branch}...`);
    gitLoud(['branch', '-D', branch], main);
  }

  console.log('Done.');
}
