// ============================================================================
// Slots
// ============================================================================
//
// A slot is a worktree's lane number, and every port it binds shifts by it.
// The record sits in the worktree's own git admin folder, which git deletes
// along with the worktree.

import {
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { adminDir, git, real, worktrees } from './git.mjs';

const RECORD = 'wt.json';

// A claim older than this is left over from a create that never finished.
const CLAIM_MAX_AGE_MS = 60 * 60 * 1000;

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

/**
 * Reads whether a slot claim is still held by a running create.
 *
 * @param path - The claim file
 * @returns `held`, `stale` when its owner has exited or it is too old, or `gone`
 */
function claimState(path) {
  let owner;
  try {
    if (Date.now() - statSync(path).mtimeMs > CLAIM_MAX_AGE_MS) return 'stale';
    owner = Number(readFileSync(path, 'utf8'));
  } catch (error) {
    return error.code === 'ENOENT' ? 'gone' : 'held';
  }
  if (!Number.isInteger(owner) || owner <= 0) return 'held';

  try {
    process.kill(owner, 0);
    return 'held';
  } catch (error) {
    return error.code === 'EPERM' ? 'held' : 'stale';
  }
}

/**
 * Creates a slot's claim file, replacing one a dead create left behind.
 *
 * @param path - The claim file
 * @returns Whether this process now holds the claim
 * @throws When the file cannot be written for any reason but being held
 */
function takeClaim(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(path, String(process.pid), { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      const state = claimState(path);
      if (state === 'held') return false;
      if (state === 'stale') rmSync(path, { force: true });
    }
  }
  return false;
}

/**
 * Claims the lowest free slot, so a create running alongside cannot pick it too.
 *
 * @param cwd - Directory inside any checkout of the repository
 * @returns The slot and a function that drops the claim once the record is written
 */
export function claimSlot(cwd) {
  const common = git(
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    cwd,
  );
  const taken = usedSlots(cwd);

  for (;;) {
    const slot = nextSlot(taken);
    taken.add(slot);

    const path = join(common, `wt-slot-${slot}.lock`);
    if (!takeClaim(path)) continue;

    const release = () => rmSync(path, { force: true });
    if (!usedSlots(cwd).has(slot)) return { slot, release };
    release();
  }
}
