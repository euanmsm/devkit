// ============================================================================
// Open
// ============================================================================
//
// Shows a worktree in VS Code: in a new window, or as a folder in the user's
// saved workspace.

import { spawnSync } from 'node:child_process';

import { workspacePath } from './config.mjs';
import { addWorktree, removeWorktree } from './workspace.mjs';

/**
 * Runs `code` on a path, warning when it is not installed.
 *
 * @param target - A folder or workspace file
 */
function code(target) {
  const result = spawnSync('code', [target], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    console.warn(`  Warning: could not run \`code\`. Open ${target} by hand.`);
  }
}

/**
 * Opens a worktree the way the config asks.
 *
 * @param config - The loaded config
 * @param where - The `main` checkout, the worktree's `path` and its `name`
 */
export function open(config, { main, path, name }) {
  if (config.open === 'none') return;

  if (config.open === 'workspace') {
    const file = workspacePath(config, main);

    try {
      addWorktree(file, path, name, main);
      console.log(`Added ${name} to ${file}.`);
      code(file);
      return;
    } catch (error) {
      console.warn(`  Warning: ${error.message} Opening a new window instead.`);
    }
  }

  console.log('Opening in VS Code...');
  code(path);
}

/**
 * Removes a worktree's folder from the workspace file, when one is set.
 *
 * @param config - The loaded config
 * @param where - The `main` checkout and the worktree's `path`
 */
export function close(config, { main, path }) {
  const file = workspacePath(config, main);
  if (!file) return;

  try {
    removeWorktree(file, path);
  } catch (error) {
    console.warn(`  Warning: could not update ${file}: ${error.message}`);
  }
}
