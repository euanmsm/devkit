// ============================================================================
// Slots
// ============================================================================
//
// A slot is a worktree's lane number, and every port it binds shifts by it.
// The record sits in the worktree's own git admin folder, which git deletes
// along with the worktree.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminDir, real, worktrees } from './git.mjs';

const RECORD = 'wt.json';

// Matches the `-wtN` suffix a worktree's Supabase project id carries.
const LEGACY_ID = /^project_id\s*=\s*".*-wt(\d+)"/m;

/**
 * Reads a checkout's slot record.
 *
 * @param root - A checkout's root
 * @returns The record, or null for the main checkout or an unrecorded worktree
 */
export function readRecord(root) {
  const dir = adminDir(root);
  if (!dir) return null;

  const path = join(dir, RECORD);
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Writes a worktree's slot record.
 *
 * @param root - The worktree's root
 * @param record - Its name and slot
 * @throws When the checkout is the main one, which has no admin folder
 */
export function writeRecord(root, record) {
  const dir = adminDir(root);
  if (!dir) throw new Error(`${root} is not a linked worktree.`);

  writeFileSync(join(dir, RECORD), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Reads the slot a worktree made by the original shell script carries.
 *
 * @param root - A checkout's root
 * @returns The slot from its Supabase override config, or null
 */
export function legacySlot(root) {
  const path = join(root, '.wt-supabase', 'supabase', 'config.toml');
  if (!existsSync(path)) return null;

  const match = LEGACY_ID.exec(readFileSync(path, 'utf8'));
  return match ? Number(match[1]) : null;
}

/**
 * Finds the slot a checkout runs in.
 *
 * @param root - A checkout's root
 * @returns The slot, 0 for the main checkout or an unknown one
 */
export function slotOf(root) {
  return readRecord(root)?.slot ?? legacySlot(root) ?? 0;
}

/**
 * Lists the slots taken by every linked worktree.
 *
 * @param cwd - Directory inside any checkout of the repository
 * @returns The slots in use
 */
export function usedSlots(cwd) {
  const [main, ...linked] = worktrees(cwd);
  const used = new Set();

  for (const { path } of linked) {
    if (real(path) === real(main.path) || !existsSync(path)) continue;

    const slot = slotOf(path);
    if (slot > 0) used.add(slot);
  }

  return used;
}

/**
 * Picks the lowest free slot, reusing any gap a deleted worktree left.
 *
 * @param used - The slots in use
 * @returns The lowest slot of at least 1 not in use
 */
export function nextSlot(used) {
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return slot;
}
